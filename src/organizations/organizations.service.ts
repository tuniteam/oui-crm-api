// ============================================
// OUI-CRM - Organizations service (US-01-01, 02, 03, 13)
// ============================================

import { Injectable } from '@nestjs/common';
import { Organization, Prisma } from '@prisma/client';
import { AuditLogService } from '@/audit-log/audit-log.service';
import { AUDIT_OBJECTS } from '@/audit-log/audit-log.constants';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { apiError, withMeta } from '@/common/api-error';
import { buildPaginationMeta, paginationSkip } from '@/common/dto/pagination.dto';
import { parseDayOrThrow } from '@/common/utils/date.utils';
import { PrismaService } from '@/prisma/prisma.service';
import { ScopeAccess, ScopeContext, ScopeService } from '@/scopes/scope.service';
import { loadScopeContext } from '@/scopes/scopes.utils';
import {
  BoardItemDto,
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
import { BOARD_COLUMN_LIMIT, BOARD_COLUMNS, ORGANIZATION_AUDIT } from './organizations.constants';
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
  resolveBracketLabel,
  recomputeCompleteness,
} from './organizations.utils';
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
    if (this.hidesOutOfScope(ctx)) {
      const scopeWhere = this.scopeService.whereVisible(ctx);
      if (Object.keys(scopeWhere).length) {
        where.AND = [...(Array.isArray(where.AND) ? where.AND : []), scopeWhere];
      }
    }

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

  // -------------------------------------------------------------------------------- board

  /**
   * US-01-10. Same visibility as the list: a NONE role does not see out-of-scope records at
   * all; a RESTRICTED role gets their cards greyed (reduced fields, drag disabled by the
   * front). Cards are ordered by next activity so the actionable ones come first.
   */
  async board(projectId: string, user: AuthenticatedUser): Promise<BoardResponseDto> {
    const ctx = await loadScopeContext(this.prisma, user, projectId);
    const base: Prisma.OrganizationWhereInput = { projectId, deletedAt: null };
    if (this.hidesOutOfScope(ctx)) {
      const scopeWhere = this.scopeService.whereVisible(ctx);
      if (Object.keys(scopeWhere).length) base.AND = [scopeWhere];
    }

    const columns = await Promise.all(
      BOARD_COLUMNS.map(async (salesStatus) => {
        const where = { ...base, salesStatus };
        const [count, rows] = await Promise.all([
          this.prisma.organization.count({ where }),
          this.prisma.organization.findMany({
            where,
            orderBy: [{ nextActivityAt: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
            take: BOARD_COLUMN_LIMIT,
            include: ORGANIZATION_REFS,
          }),
        ]);
        return {
          salesStatus,
          count,
          hasMore: count > rows.length,
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
    this.assertWritable(ctx, organization, id);
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

    const access = this.accessOf(ctx, organization);
    if (access === 'NONE') throw apiError.notFound('ORGANIZATION_NOT_FOUND', id);
    if (access === 'RESTRICTED') return mapToListItem(organization, access);

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

    const organization = await this.prisma.$transaction(async (tx) => {
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
    });

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
    this.assertWritable(ctx, existing, id);

    const { goLiveTarget, ...data } = dto;
    await assertReferencesKnown(this.prisma, projectId, data);
    await assertAssigneesAreMembers(this.prisma, projectId, data);
    await assertIdentifiersAvailable(this.prisma, projectId, data, id);

    await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id },
        data: { ...data, ...(goLiveTarget !== undefined && { goLiveTarget: parseDayOrThrow(goLiveTarget) }) },
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
    });

    return this.findOne(id, projectId, user);
  }

  // -------------------------------------------------------------------------------- delete

  /** US-01-13. Soft delete: the row stays, its identifiers are freed by the partial indexes. */
  async remove(id: string, projectId: string, user: AuthenticatedUser): Promise<void> {
    const ctx = await loadScopeContext(this.prisma, user, projectId);
    const existing = await getOrganizationOrThrow(this.prisma, id, projectId);
    this.assertWritable(ctx, existing, id);

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

  private accessOf(ctx: ScopeContext, organization: Organization): ScopeAccess {
    return this.scopeService.access(ctx, organization);
  }

  /**
   * Writing always requires full access. The status differs on purpose: a NONE caller must not
   * learn that the record exists (404), while a RESTRICTED caller already sees it in the list
   * and deserves a real answer (403).
   */
  private assertWritable(ctx: ScopeContext, organization: Organization, id: string): void {
    assertFullOrganizationAccess(this.scopeService, ctx, organization, id);
  }
}
