// ============================================
// OUI-CRM - Activities & agenda service (US-01-08, US-01-09)
// ============================================

import { Injectable } from '@nestjs/common';
import { ActivityStatus, Prisma, SalesStatus } from '@prisma/client';
import { AuditLogService } from '@/audit-log/audit-log.service';
import { AUDIT_OBJECTS } from '@/audit-log/audit-log.constants';
import { loadUsersWithInitials } from '@/audit-log/audit-log-labels';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { apiError } from '@/common/api-error';
import { buildPaginationMeta, paginationSkip } from '@/common/dto/pagination.dto';
import { formatDateField, parseDayOrThrow, todayUtc } from '@/common/utils/date.utils';
import { PrismaService } from '@/prisma/prisma.service';
import { ScopeService } from '@/scopes/scope.service';
import { loadScopeContext } from '@/scopes/scopes.utils';
import { applySalesStatus, assertFullOrganizationAccess, getOrganizationOrThrow } from '@/organizations/organizations.utils';
import { ORGANIZATION_AUDIT } from '@/organizations/organizations.constants';
import {
  ACTIVITIES_AUDIT,
  AGENDA_KINDS,
  AgendaKind,
  BUMPS_TO_IN_PROGRESS,
  BUMPS_TO_MEETING,
  ICS,
} from './activities.constants';
import {
  ACTIVITY_REFS,
  ActivityWithRefs,
  assertPlanned,
  buildActivityWhere,
  buildIcs,
  getActivityOrThrow,
  getActivityTypeOrThrow,
  loadActivityLabels,
  mapToActivity,
  recomputeActivityMarks,
  userRef,
} from './activities.utils';
import { CompleteActivityDto } from './dto/complete-activity.dto';
import { CreateActivityDto } from './dto/create-activity.dto';
import { ActivityListQueryDto } from './dto/query-activity-list.dto';
import { AgendaQueryDto } from './dto/agenda-query.dto';
import { ActivitiesListResponseDto, ActivityDto, AgendaResponseDto } from './dto/response-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { REFERENCE_CATEGORIES } from '@/common/messages';

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: ScopeService,
    private readonly audit: AuditLogService,
  ) {}

  // -------------------------------------------------------------------------------- list

  /** The scope fragment (OWN → the caller's activities) is part of the WHERE, never in memory. */
  async findAll(
    projectId: string,
    query: ActivityListQueryDto,
    scopeWhere: Record<string, unknown>,
  ): Promise<ActivitiesListResponseDto> {
    const { page, limit, ...filters } = query;
    const where = buildActivityWhere(projectId, filters, scopeWhere);
    const [total, rows] = await Promise.all([
      this.prisma.activity.count({ where }),
      this.prisma.activity.findMany({
        where,
        skip: paginationSkip(page, limit),
        take: limit,
        orderBy: [{ date: 'desc' }, { time: 'desc' }],
        include: ACTIVITY_REFS,
      }),
    ]);
    return { data: await this.toDtos(projectId, rows as ActivityWithRefs[]), meta: buildPaginationMeta(total, page, limit) };
  }

  // -------------------------------------------------------------------------------- create

  /** Planning a meeting-like activity books the record (MEETING_SCHEDULED automatism). */
  async create(projectId: string, dto: CreateActivityDto, user: AuthenticatedUser): Promise<ActivityDto> {
    const organization = await getOrganizationOrThrow(this.prisma, dto.organizationId, projectId);
    const ctx = await loadScopeContext(this.prisma, user, projectId);
    assertFullOrganizationAccess(this.scopeService, ctx, organization, organization.id);
    const type = await getActivityTypeOrThrow(this.prisma, projectId, dto.type);
    await this.assertContactOfOrganization(dto.contactId, dto.organizationId);
    await this.assertCampaignOfProject(dto.campaignId, projectId);

    const created = await this.prisma.$transaction(async (tx) => {
      const activity = await tx.activity.create({
        data: { ...dto, date: parseDayOrThrow(dto.date), projectId, userId: user.id },
        include: ACTIVITY_REFS,
      });
      if (type.ics) await this.bumpSalesStatus(tx, projectId, organization, SalesStatus.MEETING_SCHEDULED, BUMPS_TO_MEETING, user, 'activity.planned');
      await recomputeActivityMarks(tx, dto.organizationId);
      await this.audit.log(tx, {
        projectId,
        userId: user.id,
        action: ACTIVITIES_AUDIT.CREATE,
        objectType: AUDIT_OBJECTS.ACTIVITY,
        objectId: activity.id,
        metadata: { organizationId: dto.organizationId, type: dto.type, date: dto.date },
      });
      return activity as ActivityWithRefs;
    });
    return (await this.toDtos(projectId, [created]))[0];
  }

  // -------------------------------------------------------------------------------- update

  /** Rescheduling only: a DONE or CANCELLED activity is history (409 ACTIVITY_ALREADY_CLOSED). */
  async update(
    id: string,
    projectId: string,
    dto: UpdateActivityDto,
    scopeWhere: Record<string, unknown>,
    user: AuthenticatedUser,
  ): Promise<ActivityDto> {
    if (Object.keys(dto).length === 0) throw apiError.badRequest('EMPTY_UPDATE_PAYLOAD');
    const existing = await getActivityOrThrow(this.prisma, id, projectId, scopeWhere);
    assertPlanned(existing);
    const type = dto.type ? await getActivityTypeOrThrow(this.prisma, projectId, dto.type) : null;
    if (dto.contactId) await this.assertContactOfOrganization(dto.contactId, existing.organizationId);
    if (dto.campaignId) await this.assertCampaignOfProject(dto.campaignId, projectId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.activity.update({
        where: { id },
        data: { ...dto, ...(dto.date ? { date: parseDayOrThrow(dto.date) } : {}) },
        include: ACTIVITY_REFS,
      });
      // Turning a planned activity into a meeting books the record too
      if (type?.ics) await this.bumpSalesStatus(tx, projectId, existing.organization, SalesStatus.MEETING_SCHEDULED, BUMPS_TO_MEETING, user, 'activity.planned');
      await recomputeActivityMarks(tx, existing.organizationId);
      await this.audit.log(tx, {
        projectId,
        userId: user.id,
        action: ACTIVITIES_AUDIT.UPDATE,
        objectType: AUDIT_OBJECTS.ACTIVITY,
        objectId: id,
        metadata: { fields: Object.keys(dto) },
      });
      return row as ActivityWithRefs;
    });
    return (await this.toDtos(projectId, [updated]))[0];
  }

  // -------------------------------------------------------------------------------- complete / cancel

  /** Completing an activity starts the follow-up (NOT_CONTACTED / TO_CONTACT → IN_PROGRESS). */
  async complete(
    id: string,
    projectId: string,
    dto: CompleteActivityDto,
    scopeWhere: Record<string, unknown>,
    user: AuthenticatedUser,
  ): Promise<ActivityDto> {
    const existing = await getActivityOrThrow(this.prisma, id, projectId, scopeWhere);
    assertPlanned(existing);
    if (dto.result) {
      const known = await this.prisma.referenceItem.findFirst({
        where: { projectId, category: REFERENCE_CATEGORIES.ACTIVITY_RESULT, key: dto.result, active: true },
        select: { id: true },
      });
      if (!known) throw apiError.badRequest('INVALID_REFERENCE_VALUE', REFERENCE_CATEGORIES.ACTIVITY_RESULT, dto.result);
    }

    const completed = await this.prisma.$transaction(async (tx) => {
      const row = await tx.activity.update({
        where: { id },
        data: {
          status: ActivityStatus.DONE,
          report: dto.report,
          result: dto.result ?? null,
          completedAt: dto.completedAt ? new Date(dto.completedAt) : new Date(),
        },
        include: ACTIVITY_REFS,
      });
      await this.bumpSalesStatus(tx, projectId, existing.organization, SalesStatus.IN_PROGRESS, BUMPS_TO_IN_PROGRESS, user, 'activity.completed');
      await recomputeActivityMarks(tx, existing.organizationId);
      await this.audit.log(tx, {
        projectId,
        userId: user.id,
        action: ACTIVITIES_AUDIT.COMPLETE,
        objectType: AUDIT_OBJECTS.ACTIVITY,
        objectId: id,
        metadata: { organizationId: existing.organizationId, result: dto.result ?? null },
      });
      return row as ActivityWithRefs;
    });
    return (await this.toDtos(projectId, [completed]))[0];
  }

  async cancel(id: string, projectId: string, scopeWhere: Record<string, unknown>, user: AuthenticatedUser): Promise<ActivityDto> {
    const existing = await getActivityOrThrow(this.prisma, id, projectId, scopeWhere);
    assertPlanned(existing);

    const cancelled = await this.prisma.$transaction(async (tx) => {
      const row = await tx.activity.update({ where: { id }, data: { status: ActivityStatus.CANCELLED }, include: ACTIVITY_REFS });
      await recomputeActivityMarks(tx, existing.organizationId);
      await this.audit.log(tx, {
        projectId,
        userId: user.id,
        action: ACTIVITIES_AUDIT.CANCEL,
        objectType: AUDIT_OBJECTS.ACTIVITY,
        objectId: id,
      });
      return row as ActivityWithRefs;
    });
    return (await this.toDtos(projectId, [cancelled]))[0];
  }

  async remove(id: string, projectId: string, scopeWhere: Record<string, unknown>, user: AuthenticatedUser): Promise<void> {
    const existing = await getActivityOrThrow(this.prisma, id, projectId, scopeWhere);
    await this.prisma.$transaction(async (tx) => {
      await tx.activity.delete({ where: { id } });
      await recomputeActivityMarks(tx, existing.organizationId);
      await this.audit.log(tx, {
        projectId,
        userId: user.id,
        action: ACTIVITIES_AUDIT.DELETE,
        objectType: AUDIT_OBJECTS.ACTIVITY,
        objectId: id,
        metadata: { organizationId: existing.organizationId, type: existing.type, date: formatDateField(existing.date), status: existing.status },
      });
    });
  }

  // -------------------------------------------------------------------------------- agenda & ICS

  /**
   * US-01-09. One merged view; at L1 only ACTIVITY has a source, the other kinds are accepted
   * and return nothing — the contract will not change when trainings and deadlines arrive.
   */
  async agenda(projectId: string, query: AgendaQueryDto, scopeWhere: Record<string, unknown>, user: AuthenticatedUser): Promise<AgendaResponseDto> {
    const kinds = this.parseKinds(query.kinds);
    if (!kinds.includes('ACTIVITY')) return { data: [] };

    // An OWN-scoped caller always gets their own agenda, whatever userId says
    const own = (scopeWhere as { userId?: string }).userId;
    const targetUserId = own ?? query.userId;

    const rows = (await this.prisma.activity.findMany({
      where: {
        projectId,
        ...(scopeWhere as Prisma.ActivityWhereInput),
        ...(targetUserId ? { userId: targetUserId } : {}),
        date: { gte: parseDayOrThrow(query.from), lte: parseDayOrThrow(query.to) },
        status: { not: ActivityStatus.CANCELLED },
      },
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
      include: ACTIVITY_REFS,
    })) as ActivityWithRefs[];

    const [labels, users] = await Promise.all([
      loadActivityLabels(this.prisma, projectId, rows),
      loadUsersWithInitials(this.prisma, projectId, [...new Set(rows.map((r) => r.userId))]),
    ]);
    const today = todayUtc();
    return {
      data: rows.map((row) => ({
        kind: 'ACTIVITY' as AgendaKind,
        id: row.id,
        date: formatDateField(row.date),
        time: row.time,
        title: labels.get(`${REFERENCE_CATEGORIES.ACTIVITY_TYPE}:${row.type}`) ?? row.type,
        subtitle: [row.contact ? `${row.contact.firstName} ${row.contact.lastName}` : null, row.location].filter(Boolean).join(' — ') || null,
        organization: { id: row.organization.id, name: row.organization.name },
        user: userRef(users.get(row.userId), row.userId),
        status: row.status,
        isLate: row.status === ActivityStatus.PLANNED && row.date < today,
      })),
    };
  }

  /** Only meeting-like types (referential metadata `ics: true`) export to a calendar. */
  async ics(id: string, projectId: string, scopeWhere: Record<string, unknown>): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const activity = await getActivityOrThrow(this.prisma, id, projectId, scopeWhere);
    const type = await getActivityTypeOrThrow(this.prisma, projectId, activity.type);
    if (!type.ics) throw apiError.badRequest('ICS_NOT_AVAILABLE');
    const { content, filename } = buildIcs(activity, type.label, type.defaultDurationMin);
    return { buffer: Buffer.from(content, 'utf8'), filename, contentType: ICS.CONTENT_TYPE };
  }

  // ----------------------------------------------------------------------------------------

  private async toDtos(projectId: string, rows: ActivityWithRefs[]): Promise<ActivityDto[]> {
    const [labels, users] = await Promise.all([
      loadActivityLabels(this.prisma, projectId, rows),
      loadUsersWithInitials(this.prisma, projectId, [...new Set(rows.map((r) => r.userId))]),
    ]);
    return rows.map((row) => mapToActivity(row, users.get(row.userId), labels));
  }

  /** Shared with the kanban (phase E): every salesStatus write goes through applySalesStatus. */
  private async bumpSalesStatus(
    tx: Prisma.TransactionClient,
    projectId: string,
    organization: { id: string; salesStatus: SalesStatus },
    to: SalesStatus,
    allowedFrom: readonly SalesStatus[],
    user: AuthenticatedUser,
    trigger: string,
  ): Promise<void> {
    if (!allowedFrom.includes(organization.salesStatus)) return;
    const change = await applySalesStatus(tx, organization, to);
    if (!change) return;
    await this.audit.log(tx, {
      projectId,
      userId: user.id,
      action: ORGANIZATION_AUDIT.SALES_STATUS,
      objectType: AUDIT_OBJECTS.ORGANIZATION,
      objectId: organization.id,
      metadata: { ...change, trigger },
    });
  }

  private parseKinds(raw?: string): AgendaKind[] {
    if (!raw) return [...AGENDA_KINDS];
    const kinds = raw.split(',').map((k) => k.trim()).filter(Boolean);
    for (const kind of kinds) {
      if (!AGENDA_KINDS.includes(kind as AgendaKind)) throw apiError.badRequest('INVALID_DATA');
    }
    return kinds as AgendaKind[];
  }

  private async assertContactOfOrganization(contactId: string | undefined, organizationId: string): Promise<void> {
    if (!contactId) return;
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!contact) throw apiError.notFound('CONTACT_NOT_FOUND', contactId);
  }

  private async assertCampaignOfProject(campaignId: string | undefined, projectId: string): Promise<void> {
    if (!campaignId) return;
    const campaign = await this.prisma.campaign.findFirst({ where: { id: campaignId, projectId }, select: { id: true } });
    if (!campaign) throw apiError.notFound('CAMPAIGN_NOT_FOUND', campaignId);
  }
}
