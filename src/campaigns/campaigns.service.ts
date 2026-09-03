// ============================================
// OUI-CRM - Campaigns service (US-01-11)
// ============================================

import { Injectable } from '@nestjs/common';
import { CampaignStatus, OutOfScopeAccess, Prisma, SalesStatus } from '@prisma/client';
import { AuditLogService } from '@/audit-log/audit-log.service';
import { AUDIT_OBJECTS } from '@/audit-log/audit-log.constants';
import { loadUsersWithInitials } from '@/audit-log/audit-log-labels';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { apiError, withMeta } from '@/common/api-error';
import { buildPaginationMeta, paginationSkip } from '@/common/dto/pagination.dto';
import { isUniqueViolation } from '@/common/utils/prisma.utils';
import { PrismaService } from '@/prisma/prisma.service';
import { ScopeContext, ScopeService } from '@/scopes/scope.service';
import { loadScopeContext } from '@/scopes/scopes.utils';
import { applySalesStatus, assertAssigneesAreMembers } from '@/organizations/organizations.utils';
import { ORGANIZATION_AUDIT } from '@/organizations/organizations.constants';
import { CAMPAIGN_TRANSITIONS, CAMPAIGNS_AUDIT } from './campaigns.constants';
import { assertPeriodValid, campaignResults, getCampaignOrThrow, mapToCampaign, parseCampaignPeriod } from './campaigns.utils';
import {
  CampaignDto,
  CampaignIdResponseDto,
  CampaignListQueryDto,
  CampaignOrganizationsResponseDto,
  CampaignResultsResponseDto,
  CampaignsListResponseDto,
  ChangeCampaignStatusDto,
  CreateCampaignDto,
  TargetOrganizationsDto,
  TargetOrganizationsResponseDto,
  UpdateCampaignDto,
} from './dto/campaign.dto';

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: ScopeService,
    private readonly audit: AuditLogService,
  ) {}

  // -------------------------------------------------------------------------------- list

  async findAll(projectId: string, query: CampaignListQueryDto): Promise<CampaignsListResponseDto> {
    const { page, limit, status } = query;
    const where: Prisma.CampaignWhereInput = { projectId, ...(status ? { status } : {}) };
    const [total, rows] = await Promise.all([
      this.prisma.campaign.count({ where }),
      this.prisma.campaign.findMany({ where, skip: paginationSkip(page, limit), take: limit, orderBy: { createdAt: 'desc' } }),
    ]);
    const ids = rows.map((c) => c.id);
    const [orgCounts, activityCounts, owners] = await Promise.all([
      this.prisma.campaignOrganization.groupBy({ by: ['campaignId'], where: { campaignId: { in: ids }, organization: { deletedAt: null } }, _count: { _all: true } }),
      // Correlated per campaign: only activities of records still targeted and alive count
      Promise.all(ids.map((cid) => this.countCampaignActivities(cid).then((n) => ({ campaignId: cid, _count: { _all: n } })))),
      loadUsersWithInitials(this.prisma, projectId, [...new Set(rows.map((c) => c.ownerId).filter((id): id is string => !!id))]),
    ]);
    const orgsBy = new Map(orgCounts.map((c) => [c.campaignId, c._count._all]));
    const actsBy = new Map(activityCounts.map((c) => [c.campaignId, c._count._all]));
    return {
      data: rows.map((c) =>
        mapToCampaign(c, c.ownerId ? owners.get(c.ownerId) : undefined, orgsBy.get(c.id) ?? 0, actsBy.get(c.id) ?? 0),
      ),
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  // -------------------------------------------------------------------------------- create / update / status / delete

  async create(projectId: string, dto: CreateCampaignDto, user: AuthenticatedUser): Promise<CampaignIdResponseDto> {
    const ownerId = dto.ownerId ?? user.id;
    await assertAssigneesAreMembers(this.prisma, projectId, { salesRepId: ownerId });
    const period = parseCampaignPeriod(dto.startDate, dto.endDate);
    assertPeriodValid(period.startDate ?? null, period.endDate ?? null);

    try {
      const campaign = await this.prisma.$transaction(async (tx) => {
        const created = await tx.campaign.create({
          data: {
            projectId,
            name: dto.name,
            description: dto.description,
            criteria: (dto.criteria ?? {}) as Prisma.InputJsonValue,
            ownerId,
            ...period,
          },
        });
        await this.audit.log(tx, {
          projectId,
          userId: user.id,
          action: CAMPAIGNS_AUDIT.CREATE,
          objectType: AUDIT_OBJECTS.CAMPAIGN,
          objectId: created.id,
          metadata: { name: created.name },
        });
        return created;
      });
      return { id: campaign.id, name: campaign.name };
    } catch (err) {
      if (isUniqueViolation(err)) throw apiError.conflict('CAMPAIGN_NAME_EXISTS');
      throw err;
    }
  }

  async update(id: string, projectId: string, dto: UpdateCampaignDto, user: AuthenticatedUser): Promise<CampaignDto> {
    if (Object.keys(dto).length === 0) throw apiError.badRequest('EMPTY_UPDATE_PAYLOAD');
    const existing = await getCampaignOrThrow(this.prisma, id, projectId);
    if (dto.ownerId) await assertAssigneesAreMembers(this.prisma, projectId, { salesRepId: dto.ownerId });
    const period = parseCampaignPeriod(dto.startDate, dto.endDate);
    // Validate the FINAL state: an explicit null clears a bound (closure review L1)
    assertPeriodValid(
      'startDate' in period ? (period.startDate ?? null) : existing.startDate,
      'endDate' in period ? (period.endDate ?? null) : existing.endDate,
    );

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.campaign.update({
          where: { id },
          data: {
            name: dto.name,
            description: dto.description,
            ...(dto.criteria !== undefined ? { criteria: dto.criteria as Prisma.InputJsonValue } : {}),
            ...(dto.ownerId !== undefined ? { ownerId: dto.ownerId } : {}),
            ...period,
          },
        });
        await this.audit.log(tx, {
          projectId,
          userId: user.id,
          action: CAMPAIGNS_AUDIT.UPDATE,
          objectType: AUDIT_OBJECTS.CAMPAIGN,
          objectId: id,
          metadata: { fields: Object.keys(dto) },
        });
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw apiError.conflict('CAMPAIGN_NAME_EXISTS');
      throw err;
    }
    return this.findOne(id, projectId);
  }

  async changeStatus(id: string, projectId: string, dto: ChangeCampaignStatusDto, user: AuthenticatedUser): Promise<CampaignDto> {
    const existing = await getCampaignOrThrow(this.prisma, id, projectId);
    if (!CAMPAIGN_TRANSITIONS[existing.status].includes(dto.status)) {
      throw apiError.conflict('INVALID_STATUS_TRANSITION', existing.status);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.campaign.update({ where: { id }, data: { status: dto.status } });
      await this.audit.log(tx, {
        projectId,
        userId: user.id,
        action: CAMPAIGNS_AUDIT.STATUS,
        objectType: AUDIT_OBJECTS.CAMPAIGN,
        objectId: id,
        metadata: { from: existing.status, to: dto.status },
      });
    });
    return this.findOne(id, projectId);
  }

  /** D7: a campaign cited by a scope is a piece of access control — detach it first, never auto-clean. */
  async remove(id: string, projectId: string, user: AuthenticatedUser): Promise<void> {
    await getCampaignOrThrow(this.prisma, id, projectId);
    const scopes = await this.prisma.scope.findMany({
      where: { projectId, campaignIds: { has: id } },
      select: { id: true, name: true },
    });
    if (scopes.length) throw withMeta(apiError.conflict('CAMPAIGN_IN_USE_BY_SCOPE'), { scopes });

    await this.prisma.$transaction(async (tx) => {
      await tx.campaign.delete({ where: { id } });
      await this.audit.log(tx, {
        projectId,
        userId: user.id,
        action: CAMPAIGNS_AUDIT.DELETE,
        objectType: AUDIT_OBJECTS.CAMPAIGN,
        objectId: id,
      });
    });
  }

  // -------------------------------------------------------------------------------- targeting

  /**
   * Freezes records into the target. Idempotent on the (campaignId, organizationId) unique
   * index; unknown, deleted or geographically invisible records are skipped, never a global
   * failure. Newly targeted NOT_CONTACTED records move to TO_CONTACT.
   */
  async addOrganizations(
    id: string,
    projectId: string,
    dto: TargetOrganizationsDto,
    user: AuthenticatedUser,
  ): Promise<TargetOrganizationsResponseDto> {
    await getCampaignOrThrow(this.prisma, id, projectId);
    const ctx = await loadScopeContext(this.prisma, user, projectId);

    const candidates = await this.prisma.organization.findMany({
      where: { id: { in: dto.ids }, projectId, deletedAt: null },
    });
    const eligible = candidates.filter((org) => this.scopeService.access(ctx, org) === 'FULL');
    const skipped = dto.ids.length - eligible.length;
    if (!eligible.length) return { added: 0, alreadyIn: 0, skipped };

    return this.prisma.$transaction(async (tx) => {
      const { count: added } = await tx.campaignOrganization.createMany({
        data: eligible.map((org) => ({ campaignId: id, organizationId: org.id, addedBy: user.id })),
        skipDuplicates: true,
      });
      // The campaign starts the follow-up: fresh records become TO_CONTACT
      for (const org of eligible.filter((o) => o.salesStatus === SalesStatus.NOT_CONTACTED)) {
        const change = await applySalesStatus(tx, org, SalesStatus.TO_CONTACT);
        if (change) {
          await this.audit.log(tx, {
            projectId,
            userId: user.id,
            action: ORGANIZATION_AUDIT.SALES_STATUS,
            objectType: AUDIT_OBJECTS.ORGANIZATION,
            objectId: org.id,
            metadata: { ...change, trigger: 'campaign.targeted', campaignId: id },
          });
        }
      }
      await this.audit.log(tx, {
        projectId,
        userId: user.id,
        action: CAMPAIGNS_AUDIT.ORGANIZATIONS_ADD,
        objectType: AUDIT_OBJECTS.CAMPAIGN,
        objectId: id,
        metadata: { added, alreadyIn: eligible.length - added, skipped },
      });
      return { added, alreadyIn: eligible.length - added, skipped };
    });
  }

  async removeOrganization(id: string, organizationId: string, projectId: string, user: AuthenticatedUser): Promise<void> {
    await getCampaignOrThrow(this.prisma, id, projectId);
    const link = await this.prisma.campaignOrganization.findFirst({ where: { campaignId: id, organizationId } });
    if (!link) throw apiError.notFound('ORGANIZATION_NOT_FOUND', organizationId);
    await this.prisma.$transaction(async (tx) => {
      await tx.campaignOrganization.delete({ where: { id: link.id } });
      await this.audit.log(tx, {
        projectId,
        userId: user.id,
        action: CAMPAIGNS_AUDIT.ORGANIZATIONS_REMOVE,
        objectType: AUDIT_OBJECTS.CAMPAIGN,
        objectId: id,
        metadata: { organizationId },
      });
    });
  }

  /** The frozen target, with the same visibility rules as the organization list. */
  async listOrganizations(
    id: string,
    projectId: string,
    query: CampaignListQueryDto,
    user: AuthenticatedUser,
  ): Promise<CampaignOrganizationsResponseDto> {
    await getCampaignOrThrow(this.prisma, id, projectId);
    const ctx = await loadScopeContext(this.prisma, user, projectId);
    const { page, limit } = query;

    const where: Prisma.CampaignOrganizationWhereInput = { campaignId: id, organization: { deletedAt: null } };
    if (this.hidesOutOfScope(ctx)) {
      const scopeWhere = this.scopeService.whereVisible(ctx) as Prisma.OrganizationWhereInput;
      if (Object.keys(scopeWhere).length) where.organization = { deletedAt: null, AND: [scopeWhere] };
    }
    const [total, rows] = await Promise.all([
      this.prisma.campaignOrganization.count({ where }),
      this.prisma.campaignOrganization.findMany({
        where,
        skip: paginationSkip(page, limit),
        take: limit,
        orderBy: { addedAt: 'desc' },
        include: { organization: true },
      }),
    ]);
    return {
      data: rows.map((row) => ({
        id: row.organization.id,
        name: row.organization.name,
        city: row.organization.city,
        department: row.organization.department,
        salesStatus: row.organization.salesStatus,
        access: this.scopeService.access(ctx, row.organization) === 'FULL' ? 'FULL' : 'RESTRICTED',
        addedAt: row.addedAt,
      })),
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  /**
   * Computed on demand, never stored: activities per record (L2 adds the sales counters).
   *
   * Same visibility rules as listOrganizations — a NONE role must not discover a record
   * through this route that the organization list hides from it, and a RESTRICTED role gets
   * the projected columns only.
   *
   * `totals` is deliberately computed over the WHOLE campaign, outside the pagination: a
   * counter that changes when the reader turns the page would be worse than no counter.
   */
  async results(
    id: string,
    projectId: string,
    query: CampaignListQueryDto,
    user: AuthenticatedUser,
  ): Promise<CampaignResultsResponseDto> {
    await getCampaignOrThrow(this.prisma, id, projectId);
    const ctx = await loadScopeContext(this.prisma, user, projectId);
    const { page, limit } = query;

    const where: Prisma.CampaignOrganizationWhereInput = { campaignId: id, organization: { deletedAt: null } };
    if (this.hidesOutOfScope(ctx)) {
      const scopeWhere = this.scopeService.whereVisible(ctx) as Prisma.OrganizationWhereInput;
      if (Object.keys(scopeWhere).length) where.organization = { deletedAt: null, AND: [scopeWhere] };
    }

    const [total, links, perOrg] = await Promise.all([
      this.prisma.campaignOrganization.count({ where }),
      this.prisma.campaignOrganization.findMany({
        where,
        skip: paginationSkip(page, limit),
        take: limit,
        orderBy: { addedAt: 'asc' },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              salesStatus: true,
              lastActivityAt: true,
              department: true,
              salesRepId: true,
              consultantId: true,
              trainerId: true,
              customerStatus: true,
            },
          },
        },
      }),
      // Counters of the whole campaign, independent of the page and of the caller scope:
      // they describe what the campaign produced, not what this reader may see.
      this.prisma.activity.groupBy({
        by: ['organizationId'],
        where: { campaignId: id, organization: { deletedAt: null, campaigns: { some: { campaignId: id } } } },
        _count: { _all: true },
      }),
    ]);

    const actsBy = new Map(perOrg.map((a) => [a.organizationId, a._count._all]));
    const totalActivities = perOrg.reduce((sum, a) => sum + a._count._all, 0);

    return {
      totals: campaignResults(totalActivities),
      data: links.map((l) => {
        const access = this.scopeService.access(ctx, l.organization) === 'FULL' ? 'FULL' : 'RESTRICTED';
        const row = {
          organizationId: l.organization.id,
          name: l.organization.name,
          salesStatus: l.organization.salesStatus,
          access: access as 'FULL' | 'RESTRICTED',
          activities: actsBy.get(l.organization.id) ?? 0,
        };
        // lastActivityAt is not part of the restricted projection (SPEC-07 US-01-01).
        return access === 'FULL' ? { ...row, lastActivityAt: l.organization.lastActivityAt } : row;
      }),
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  // ----------------------------------------------------------------------------------------

  private async findOne(id: string, projectId: string): Promise<CampaignDto> {
    const campaign = await getCampaignOrThrow(this.prisma, id, projectId);
    const [orgCount, activities, owners] = await Promise.all([
      this.prisma.campaignOrganization.count({ where: { campaignId: id } }),
      this.countCampaignActivities(id),
      campaign.ownerId ? loadUsersWithInitials(this.prisma, projectId, [campaign.ownerId]) : new Map(),
    ]);
    return mapToCampaign(campaign, campaign.ownerId ? owners.get(campaign.ownerId) : undefined, orgCount, activities);
  }

  /** Activities of records still targeted and alive — totals always equal the sum of rows. */
  private countCampaignActivities(campaignId: string): Promise<number> {
    return this.prisma.activity.count({
      where: { campaignId, organization: { deletedAt: null, campaigns: { some: { campaignId } } } },
    });
  }

  private hidesOutOfScope(ctx: ScopeContext): boolean {
    return ctx.outOfScopeAccess === OutOfScopeAccess.NONE;
  }
}
