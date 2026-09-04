// ============================================
// OUI-CRM - Organizations service (US-01-01, 02, 03, 13)
// ============================================

import { Injectable } from '@nestjs/common';
import { Organization, Prisma, SalesStatus, ScopeType } from '@prisma/client';
import { AuditLogService } from '@/audit-log/audit-log.service';
import { AUDIT_OBJECTS } from '@/audit-log/audit-log.constants';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { apiError, withMeta } from '@/common/api-error';
import { buildPaginationMeta, paginationSkip } from '@/common/dto/pagination.dto';
import { parseDayOrThrow } from '@/common/utils/date.utils';
import { PrismaService } from '@/prisma/prisma.service';
import { findPermission } from '@/auth/utils/permissions.util';
import { isUniqueViolation } from '@/common/utils/prisma.utils';
import { ScopeAccess, ScopeContext, ScopeService } from '@/scopes/scope.service';
import { hydrateCampaignMembership, loadScopeContext, mergeVisibilityWhere } from '@/scopes/scopes.utils';
import {
  BoardItemDto,
  BulkActionDto,
  BulkResultDto,
  BoardQueryDto,
  BoardResponseDto,
  ChangeSalesStatusDto,
  ChangeSalesStatusResponseDto,
  CreateOrganizationDto,
  CreateOrganizationResponseDto,
  OrganizationDetailDto,
  OrganizationListItemDto,
  OrganizationListQueryDto,
  OrganizationListResponseDto,
  UpdateOrganizationDto,
} from './dto';
import { BOARD_COLUMNS, BULK_AUDIT_ACTION, BULK_PAYLOAD_FIELD, ORGANIZATION_AUDIT } from './organizations.constants';
import {
  applySalesStatus,
  assertAssigneesAreMembers,
  assertFullOrganizationAccess,
  assertIdentifiersAvailable,
  assertReferencesKnown,
  buildOrganizationOrderBy,
  buildOrganizationWhere,
  computeCompleteness,
  findPossibleDuplicates,
  getOrganizationOrThrow,
  loadActiveBrackets,
  recomputeCompleteness,
} from './organizations.utils';
import { resolveBracketLabel } from '@/pricing/pricing.utils';
import { mapToDetail, mapToListItem, OrganizationWithRefs, ORGANIZATION_REFS } from './organizations.mapper';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: ScopeService,
    private readonly audit: AuditLogService,
  ) {}

  // -------------------------------------------------------------------------------- list

  /**
   * US-01-01. The scope decides two different things, and mixing them is the classic mistake:
   * - a NONE role must not even see that an out-of-scope record exists → the scope fragment
   *   goes into the WHERE;
   * - a RESTRICTED role sees every record but only a few columns → no filtering, a projection
   *   applied row by row.
   */
  async findAll(
    projectId: string,
    query: OrganizationListQueryDto,
    user: AuthenticatedUser,
  ): Promise<OrganizationListResponseDto> {
    const { page, limit, sort, order, ...filters } = query;
    const ctx = await loadScopeContext(this.prisma, user, projectId);

    const where: Prisma.OrganizationWhereInput = buildOrganizationWhere(projectId, filters);
    mergeVisibilityWhere(where, ctx, this.scopeService);

    const [total, rows, brackets] = await Promise.all([
      this.prisma.organization.count({ where }),
      this.prisma.organization.findMany({
        where,
        orderBy: buildOrganizationOrderBy(sort, order),
        skip: paginationSkip(page, limit),
        take: limit,
        include: ORGANIZATION_REFS,
      }),
      loadActiveBrackets(this.prisma, projectId),
    ]);
    await hydrateCampaignMembership(this.prisma, ctx, rows);

    // One extra query for the whole page rather than one per row: which records have a
    // primary contact, the only completeness criterion that does not live on the row.
    const withPrimary = new Set(
      (
        await this.prisma.contact.findMany({
          where: { organizationId: { in: rows.map((r) => r.id) }, isPrimary: true, deletedAt: null },
          select: { organizationId: true },
        })
      ).map((c) => c.organizationId),
    );

    return {
      data: rows.map((row) =>
        mapToListItem(
          row,
          this.accessOf(ctx, row),
          computeCompleteness({ ...row, hasPrimaryContact: withPrimary.has(row.id) }).missing,
          resolveBracketLabel(brackets, row.population),
        ),
      ),
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  // -------------------------------------------------------------------------------- bulk

  /**
   * US-01-05. One mass operation, partial by design: only FULL-access records are processed,
   * the others come back in `skipped` with their reason — never a global failure. selectAll
   * replays the list filters server-side (the only mass action whose set the client does not
   * enumerate). DELETE additionally requires organizations:delete.
   */
  async bulk(projectId: string, dto: BulkActionDto, user: AuthenticatedUser): Promise<BulkResultDto> {
    const payloadField = BULK_PAYLOAD_FIELD[dto.action];
    if (payloadField && !dto.payload?.[payloadField]) throw apiError.badRequest('INVALID_DATA');
    if (!dto.selectAll && !dto.ids?.length) throw apiError.badRequest('INVALID_DATA');
    if (dto.action === 'DELETE' && !findPermission(user, projectId, 'organizations:delete')) {
      throw apiError.forbidden('ACCESS_DENIED');
    }
    if (dto.action === 'ASSIGN_SALES_REP') {
      await assertAssigneesAreMembers(this.prisma, projectId, { salesRepId: dto.payload.salesRepId });
    }
    if (dto.action === 'ADD_TO_CAMPAIGN') {
      const campaign = await this.prisma.campaign.findFirst({ where: { id: dto.payload.campaignId, projectId }, select: { id: true } });
      if (!campaign) throw apiError.notFound('CAMPAIGN_NOT_FOUND', dto.payload.campaignId as string);
    }

    const ctx = await loadScopeContext(this.prisma, user, projectId);
    const where: Prisma.OrganizationWhereInput = dto.selectAll
      ? buildOrganizationWhere(projectId, dto.filters ?? {})
      : { projectId, deletedAt: null, id: { in: dto.ids } };
    const candidates = await this.prisma.organization.findMany({
      where,
      // Only what access classification, the actions and their audits read — never the wide row
      select: {
        id: true,
        name: true,
        department: true,
        salesStatus: true,
        customerStatus: true,
        salesRepId: true,
        consultantId: true,
        trainerId: true,
      },
    });
    await hydrateCampaignMembership(this.prisma, ctx, candidates);

    // Mass actions are granted OWN to sales reps (SPEC-06): unit updates reach the whole
    // geographic scope, bulk only the caller's own portfolio.
    const ownOnly = findPermission(user, projectId, 'organizations:bulk')?.scope === ScopeType.OWN;
    const accessById = new Map(candidates.map((org) => [org.id, this.accessOf(ctx, org)]));
    const eligible = candidates.filter(
      (org) => accessById.get(org.id) === 'FULL' && (!ownOnly || org.salesRepId === user.id),
    );
    const eligibleIds = new Set(eligible.map((o) => o.id));
    const skipped: BulkResultDto['skipped'] = [];
    if (!dto.selectAll) {
      // A NONE caller must not learn that a hidden record exists — same contract as findOne
      for (const id of dto.ids ?? []) {
        if (!accessById.has(id) || accessById.get(id) === 'NONE') skipped.push({ id, reason: 'NOT_FOUND' });
        else if (!eligibleIds.has(id)) skipped.push({ id, reason: 'OUT_OF_SCOPE' });
      }
    } else {
      for (const org of candidates) {
        if (!eligibleIds.has(org.id) && accessById.get(org.id) !== 'NONE') {
          skipped.push({ id: org.id, reason: 'OUT_OF_SCOPE' });
        }
      }
    }

    const processed = await this.prisma.$transaction(async (tx) => {
      const count = await this.applyBulk(tx, projectId, dto, eligible, user);
      await this.audit.log(tx, {
        projectId,
        userId: user.id,
        action: BULK_AUDIT_ACTION,
        objectType: AUDIT_OBJECTS.ORGANIZATION,
        metadata: {
          action: dto.action,
          processed: count,
          skipped: skipped.length,
          ...(payloadField ? { [payloadField]: dto.payload[payloadField] } : {}),
          ...(dto.selectAll ? { selectAll: true, filters: (dto.filters ?? {}) as Prisma.InputJsonValue } : {}),
        },
      });
      return count;
    });
    return { processed, skipped };
  }

  private async applyBulk(
    tx: Prisma.TransactionClient,
    projectId: string,
    dto: BulkActionDto,
    eligible: Pick<Organization, 'id' | 'name' | 'salesStatus'>[],
    user: AuthenticatedUser,
  ): Promise<number> {
    const ids = eligible.map((o) => o.id);
    switch (dto.action) {
      case 'ASSIGN_SALES_REP': {
        await tx.organization.updateMany({ where: { id: { in: ids } }, data: { salesRepId: dto.payload.salesRepId } });
        return ids.length;
      }
      case 'SET_PRIORITY': {
        await tx.organization.updateMany({ where: { id: { in: ids } }, data: { priority: dto.payload.priority } });
        return ids.length;
      }
      case 'SET_SALES_STATUS': {
        // Through the single writer, so every real transition lands in the journal
        for (const org of eligible) {
          const change = await applySalesStatus(tx, org, dto.payload.salesStatus as SalesStatus);
          if (change) {
            await this.audit.log(tx, {
              projectId,
              userId: user.id,
              action: ORGANIZATION_AUDIT.SALES_STATUS,
              objectType: AUDIT_OBJECTS.ORGANIZATION,
              objectId: org.id,
              metadata: { ...change, trigger: 'bulk' },
            });
          }
        }
        return ids.length;
      }
      case 'ADD_TO_CAMPAIGN': {
        await tx.campaignOrganization.createMany({
          data: ids.map((organizationId) => ({ campaignId: dto.payload.campaignId as string, organizationId, addedBy: user.id })),
          skipDuplicates: true,
        });
        // Same automatism as the direct targeting (US-01-11)
        for (const org of eligible.filter((o) => o.salesStatus === SalesStatus.NOT_CONTACTED)) {
          const change = await applySalesStatus(tx, org, SalesStatus.TO_CONTACT);
          if (change) {
            await this.audit.log(tx, {
              projectId,
              userId: user.id,
              action: ORGANIZATION_AUDIT.SALES_STATUS,
              objectType: AUDIT_OBJECTS.ORGANIZATION,
              objectId: org.id,
              metadata: { ...change, trigger: 'campaign.targeted', campaignId: dto.payload.campaignId },
            });
          }
        }
        return ids.length;
      }
      case 'DELETE': {
        await tx.organization.updateMany({ where: { id: { in: ids } }, data: { deletedAt: new Date() } });
        for (const org of eligible) {
          await this.audit.log(tx, {
            projectId,
            userId: user.id,
            action: ORGANIZATION_AUDIT.DELETE,
            objectType: AUDIT_OBJECTS.ORGANIZATION,
            objectId: org.id,
            metadata: { name: org.name, bulk: true },
          });
        }
        return ids.length;
      }
    }
  }

  // -------------------------------------------------------------------------------- board

  /**
   * US-01-10. Same visibility as the list: a NONE role does not see out-of-scope records at
   * all; a RESTRICTED role gets their cards greyed (reduced fields, drag disabled by the
   * front). Cards are ordered by next activity so the actionable ones come first.
   */
  /**
   * US-01-10 — le kanban, **paginé par colonne** : un tableau se déroule colonne par colonne,
   * pas page par page. Sans `salesStatus`, les cinq colonnes rendent leur page courante ; avec,
   * une seule répond, ce qui permet d'en charger la suite sans toucher aux quatre autres.
   */
  async board(projectId: string, query: BoardQueryDto, user: AuthenticatedUser): Promise<BoardResponseDto> {
    const ctx = await loadScopeContext(this.prisma, user, projectId);
    const base: Prisma.OrganizationWhereInput = { projectId, deletedAt: null };
    mergeVisibilityWhere(base, ctx, this.scopeService);

    const wanted = query.salesStatus ? [query.salesStatus] : BOARD_COLUMNS;
    const { page, limit } = query;

    const columns = await Promise.all(
      wanted.map(async (salesStatus) => {
        const where = { ...base, salesStatus };
        const [total, rows] = await Promise.all([
          this.prisma.organization.count({ where }),
          this.prisma.organization.findMany({
            where,
            orderBy: [{ nextActivityAt: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
            skip: paginationSkip(page, limit),
            take: limit,
            include: ORGANIZATION_REFS,
          }),
        ]);
        await hydrateCampaignMembership(this.prisma, ctx, rows);
        return {
          salesStatus,
          meta: buildPaginationMeta(total, page, limit),
          items: rows.map((row) => this.toBoardItem(row, this.accessOf(ctx, row))),
        };
      }),
    );
    return { columns };
  }

  /**
   * US-01-10. The single writer applySalesStatus is shared with the activity automatisms;
   * transitions are free between the 5 statuses — dropping a card on its own column is the
   * only invalid move (409, the front puts the card back).
   */
  async changeSalesStatus(
    id: string,
    dto: ChangeSalesStatusDto,
    projectId: string,
    user: AuthenticatedUser,
  ): Promise<ChangeSalesStatusResponseDto> {
    const ctx = await loadScopeContext(this.prisma, user, projectId);
    const organization = await getOrganizationOrThrow(this.prisma, id, projectId);
    await this.assertWritable(ctx, organization, id);
    if (organization.salesStatus === dto.salesStatus) {
      throw apiError.conflict('ORGANIZATION_INVALID_TRANSITION', organization.salesStatus);
    }

    await this.prisma.$transaction(async (tx) => {
      const change = await applySalesStatus(tx, organization, dto.salesStatus);
      await this.audit.log(tx, {
        projectId,
        userId: user.id,
        action: ORGANIZATION_AUDIT.SALES_STATUS,
        objectType: AUDIT_OBJECTS.ORGANIZATION,
        objectId: id,
        metadata: { ...change, trigger: 'manual', ...(dto.reason ? { reason: dto.reason } : {}) },
      });
    });
    return { id, salesStatus: dto.salesStatus };
  }

  private toBoardItem(row: OrganizationWithRefs, access: ScopeAccess): BoardItemDto {
    const restricted: BoardItemDto = {
      id: row.id,
      name: row.name,
      salesRep: row.salesRep ? { id: row.salesRep.id, fullName: `${row.salesRep.firstName} ${row.salesRep.lastName}`.trim(), initials: null } : null,
      access: access === 'FULL' ? 'FULL' : 'RESTRICTED',
    };
    if (access !== 'FULL') return restricted;
    return {
      ...restricted,
      priority: row.priority,
      tags: row.tags,
      nextActivityAt: row.nextActivityAt,
      lastActivityAt: row.lastActivityAt,
    };
  }

  // -------------------------------------------------------------------------------- detail

  /**
   * US-01-03. Access is resolved before the payload: NONE answers 404, never 403.
   * The response really has two shapes — the full record, or the restricted projection.
   */
  async findOne(
    id: string,
    projectId: string,
    user: AuthenticatedUser,
  ): Promise<OrganizationDetailDto | OrganizationListItemDto> {
    const ctx = await loadScopeContext(this.prisma, user, projectId);
    const organization = await this.prisma.organization.findFirst({
      where: { id, projectId, deletedAt: null },
      include: ORGANIZATION_REFS,
    });
    if (!organization) throw apiError.notFound('ORGANIZATION_NOT_FOUND', id);
    await hydrateCampaignMembership(this.prisma, ctx, [organization]);

    const access = this.accessOf(ctx, organization);
    if (access === 'NONE') throw apiError.notFound('ORGANIZATION_NOT_FOUND', id);
    if (access === 'RESTRICTED') return mapToListItem(organization, access);

    return this.fullDetail(organization, projectId);
  }

  /** The FULL-access detail payload, shared by findOne and the update echo. */
  private async fullDetail(organization: OrganizationWithRefs, projectId: string): Promise<OrganizationDetailDto> {
    const id = organization.id;
    const [contacts, activities, hasPrimaryContact] = await Promise.all([
      this.prisma.contact.count({ where: { organizationId: id, deletedAt: null } }),
      this.prisma.activity.count({ where: { organizationId: id } }),
      this.prisma.contact
        .count({ where: { organizationId: id, isPrimary: true, deletedAt: null } })
        .then((n) => n > 0),
    ]);

    return mapToDetail(organization, {
      completeness: computeCompleteness({ ...organization, hasPrimaryContact }),
      counts: { contacts, activities },
      bracketLabel: resolveBracketLabel(await loadActiveBrackets(this.prisma, projectId), organization.population),
    });
  }

  // -------------------------------------------------------------------------------- create

  /**
   * US-01-02. Two levels of duplicate: the SIRET and the INSEE code are hard conflicts, a
   * same-name record at the same postal code is only a warning the caller can override.
   */
  async create(
    dto: CreateOrganizationDto,
    projectId: string,
    user: AuthenticatedUser,
  ): Promise<CreateOrganizationResponseDto> {
    const { force, goLiveTarget, ...data } = dto;

    await assertReferencesKnown(this.prisma, projectId, data);
    await assertAssigneesAreMembers(this.prisma, projectId, data);
    await assertIdentifiersAvailable(this.prisma, projectId, data);

    if (!force) {
      const duplicates = await findPossibleDuplicates(this.prisma, projectId, data.name, data.postalCode);
      if (duplicates.length) {
        // The project carries structured payloads in `messages.meta`; `details` is reserved
        // for human-readable lines (api-error.ts). SPEC-07 says "details": divergence noted.
        throw withMeta(apiError.conflict('ORGANIZATION_POSSIBLE_DUPLICATE'), { duplicates });
      }
    }

    const organization = await this.runMappingUniqueRaces(() =>
      this.prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          ...data,
          projectId,
          createdBy: user.id,
          ...(goLiveTarget && { goLiveTarget: parseDayOrThrow(goLiveTarget) }),
        },
      });
      // A brand-new record has no contact yet: the score is computed on its own columns.
      await recomputeCompleteness(tx, created.id);
      await this.audit.log(tx, {
        projectId,
        userId: user.id,
        action: ORGANIZATION_AUDIT.CREATE,
        objectType: AUDIT_OBJECTS.ORGANIZATION,
        objectId: created.id,
        metadata: { name: created.name, type: created.type, department: created.department },
      });
      return created;
      }),
    );

    const refreshed = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organization.id },
      select: { id: true, name: true, completenessScore: true },
    });
    return refreshed;
  }

  // -------------------------------------------------------------------------------- update

  /** US-01-03. Statuses are excluded by the DTO: they only change through their own routes. */
  async update(
    id: string,
    dto: UpdateOrganizationDto,
    projectId: string,
    user: AuthenticatedUser,
  ): Promise<OrganizationDetailDto | OrganizationListItemDto> {
    if (Object.keys(dto).length === 0) throw apiError.badRequest('EMPTY_UPDATE_PAYLOAD');
    const ctx = await loadScopeContext(this.prisma, user, projectId);
    const existing = await getOrganizationOrThrow(this.prisma, id, projectId);
    await this.assertWritable(ctx, existing, id);

    const { goLiveTarget, ...data } = dto;
    await assertReferencesKnown(this.prisma, projectId, data);
    await assertAssigneesAreMembers(this.prisma, projectId, data);
    await assertIdentifiersAvailable(this.prisma, projectId, data, id);

    await this.runMappingUniqueRaces(() =>
      this.prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id },
        // null clears the go-live date, like every other nullable field (closure review L1)
        data: { ...data, ...(goLiveTarget !== undefined && { goLiveTarget: goLiveTarget === null ? null : parseDayOrThrow(goLiveTarget) }) },
      });
      await recomputeCompleteness(tx, id);
      await this.audit.log(tx, {
        projectId,
        userId: user.id,
        action: ORGANIZATION_AUDIT.UPDATE,
        objectType: AUDIT_OBJECTS.ORGANIZATION,
        objectId: id,
        metadata: { fields: Object.keys(dto) },
      });
      }),
    );

    // Echo the record the caller just wrote, even when the write moved it out of their scope
    // (a department change): the next read applies the normal visibility again.
    const updated = await this.prisma.organization.findFirstOrThrow({
      where: { id, projectId },
      include: ORGANIZATION_REFS,
    });
    await hydrateCampaignMembership(this.prisma, ctx, [updated]);
    const access = this.accessOf(ctx, updated);
    if (access !== 'FULL') return mapToListItem(updated, 'RESTRICTED');
    return this.fullDetail(updated, projectId);
  }

  /** Check-then-act on SIRET/INSEE can race the partial unique indexes: answer 409, not 500. */
  private async runMappingUniqueRaces<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (err) {
      if (isUniqueViolation(err, 'siret')) throw apiError.conflict('ORGANIZATION_SIRET_EXISTS');
      if (isUniqueViolation(err, 'insee_code')) throw apiError.conflict('ORGANIZATION_INSEE_CODE_EXISTS');
      throw err;
    }
  }

  // -------------------------------------------------------------------------------- delete

  /** US-01-13. Soft delete: the row stays, its identifiers are freed by the partial indexes. */
  async remove(id: string, projectId: string, user: AuthenticatedUser): Promise<void> {
    const ctx = await loadScopeContext(this.prisma, user, projectId);
    const existing = await getOrganizationOrThrow(this.prisma, id, projectId);
    await this.assertWritable(ctx, existing, id);

    await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.log(tx, {
        projectId,
        userId: user.id,
        action: ORGANIZATION_AUDIT.DELETE,
        objectType: AUDIT_OBJECTS.ORGANIZATION,
        objectId: id,
        metadata: { name: existing.name },
      });
    });
  }

  // -------------------------------------------------------------------------------- helpers

  /** Only a NONE role has records hidden from it; RESTRICTED sees them, projected. */
  private hidesOutOfScope(ctx: ScopeContext): boolean {
    return ctx.outOfScopeAccess === 'NONE';
  }

  private accessOf(ctx: ScopeContext, organization: Parameters<ScopeService['access']>[1]): ScopeAccess {
    return this.scopeService.access(ctx, organization);
  }

  /**
   * Writing always requires full access. The status differs on purpose: a NONE caller must not
   * learn that the record exists (404), while a RESTRICTED caller already sees it in the list
   * and deserves a real answer (403).
   */
  private async assertWritable(ctx: ScopeContext, organization: Organization, id: string): Promise<void> {
    await assertFullOrganizationAccess(this.prisma, this.scopeService, ctx, organization, id);
  }
}
