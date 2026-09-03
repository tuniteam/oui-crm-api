// ============================================
// OUI-CRM - Opportunities service (US-02-09)
// ============================================

import { Injectable } from '@nestjs/common';
import { OpportunityStageCode, Organization, Prisma } from '@prisma/client';
import { AUDIT_OBJECTS } from '@/audit-log/audit-log.constants';
import { UserWithInitials, loadUsersWithInitials } from '@/audit-log/audit-log-labels';
import { AuditLogService } from '@/audit-log/audit-log.service';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { apiError } from '@/common/api-error';
import { buildPaginationMeta, paginationSkip } from '@/common/dto/pagination.dto';
import { formatDateField, parseDayOrThrow } from '@/common/utils/date.utils';
import { isUniqueViolation } from '@/common/utils/prisma.utils';
import { fullName } from '@/common/utils/user.utils';
import { PricingGridContent } from '@/pricing/pricing.types';
import { PrismaService } from '@/prisma/prisma.service';
import { ScopeService } from '@/scopes/scope.service';
import { loadScopeContext, mergeVisibilityWhere } from '@/scopes/scopes.utils';
import { assertAssigneesAreMembers, assertFullOrganizationAccess, assertReferencesKnown } from '@/organizations/organizations.utils';
import {
  BOARD_ITEMS_PER_COLUMN,
  OPEN_STAGES,
  OPPORTUNITIES_AUDIT,
  isOpenStage,
} from './opportunities.constants';
import {
  applyOpportunityStage,
  buildOpportunityWhere,
  effectiveProbability,
  getOpportunityOrThrow,
  quoteValue,
  resolveOpportunityValue,
  weightedTotal,
} from './opportunities.utils';
import {
  ChangeOpportunityStageDto,
  CreateOpportunityDto,
  LoseOpportunityDto,
  OpportunitiesListResponseDto,
  OpportunityBoardResponseDto,
  OpportunityDetailDto,
  OpportunityDto,
  OpportunityIdResponseDto,
  OpportunityListQueryDto,
  UpdateOpportunityDto,
} from './dto/opportunity.dto';

/** Ce qu'une opportunité a besoin de connaître de sa fiche pour être servie. */
const ORGANIZATION_SELECT = {
  id: true,
  name: true,
  population: true,
  targetPlan: true,
  lastActivityAt: true,
} as const;

type OpportunityRow = Prisma.OpportunityGetPayload<{
  include: { organization: { select: typeof ORGANIZATION_SELECT } };
}>;

type QuoteRow = { opportunityId: string | null; arrList: Prisma.Decimal; oneShotTotal: Prisma.Decimal };

@Injectable()
export class OpportunitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: ScopeService,
    private readonly audit: AuditLogService,
  ) {}

  // -------------------------------------------------------------------------------- list

  async findAll(
    projectId: string,
    query: OpportunityListQueryDto,
    scopeWhere: Record<string, unknown>,
    user: AuthenticatedUser,
  ): Promise<OpportunitiesListResponseDto> {
    const { page, limit } = query;
    const where = buildOpportunityWhere(projectId, this.parseFilters(query), scopeWhere, await this.visibleOrganizations(user, projectId));

    const [total, rows] = await Promise.all([
      this.prisma.opportunity.count({ where }),
      this.prisma.opportunity.findMany({
        where,
        skip: paginationSkip(page, limit),
        take: limit,
        orderBy: [{ expectedCloseDate: 'asc' }, { createdAt: 'desc' }],
        include: { organization: { select: ORGANIZATION_SELECT } },
      }),
    ]);

    return { data: await this.mapRows(projectId, rows), meta: buildPaginationMeta(total, page, limit) };
  }

  /**
   * Le pipeline : une colonne par étape ouverte, avec son total pondéré. Les étapes fermées
   * (gagnée, perdue) n'y figurent pas — ce sont des issues, elles se lisent dans la liste
   * filtrée par étape.
   */
  async board(
    projectId: string,
    scopeWhere: Record<string, unknown>,
    user: AuthenticatedUser,
  ): Promise<OpportunityBoardResponseDto> {
    const organizationWhere = await this.visibleOrganizations(user, projectId);
    const where = buildOpportunityWhere(projectId, { stages: OPEN_STAGES }, scopeWhere, organizationWhere);

    const [counts, rows, settings] = await Promise.all([
      this.prisma.opportunity.groupBy({ by: ['stage'], where, _count: { _all: true } }),
      this.prisma.opportunity.findMany({
        where,
        orderBy: [{ expectedCloseDate: 'asc' }, { createdAt: 'desc' }],
        include: { organization: { select: ORGANIZATION_SELECT } },
      }),
      this.loadStageProbabilities(projectId),
    ]);

    const items = await this.mapRows(projectId, rows, settings);
    const countByStage = new Map(counts.map((c) => [c.stage, c._count._all]));

    const columns = OPEN_STAGES.map((stage) => {
      const all = items.filter((item) => item.stage === stage);
      const total = all.reduce((sum, item) => sum + item.value, 0);
      return {
        stage,
        stageProbability: settings[stage] ?? 0,
        count: countByStage.get(stage) ?? 0,
        hasMore: all.length > BOARD_ITEMS_PER_COLUMN,
        total: this.round2(total),
        weightedTotal: this.round2(all.reduce((sum, item) => sum + item.weightedValue, 0)),
        items: all.slice(0, BOARD_ITEMS_PER_COLUMN),
      };
    });

    return {
      columns,
      count: columns.reduce((sum, column) => sum + column.count, 0),
      total: this.round2(columns.reduce((sum, column) => sum + column.total, 0)),
      weightedTotal: this.round2(columns.reduce((sum, column) => sum + column.weightedTotal, 0)),
    };
  }

  async findOne(
    id: string,
    projectId: string,
    scopeWhere: Record<string, unknown>,
    user: AuthenticatedUser,
  ): Promise<OpportunityDetailDto> {
    const opportunity = await this.loadVisible(id, projectId, scopeWhere, user);
    const [base] = await this.mapRows(projectId, [opportunity]);

    const [stages, quotes] = await Promise.all([
      this.prisma.opportunityStage.findMany({ where: { opportunityId: id }, orderBy: { date: 'asc' } }),
      this.prisma.quote.findMany({
        where: { projectId, opportunityId: id },
        orderBy: { issueDate: 'desc' },
        select: { id: true, number: true, status: true, issueDate: true, arrList: true, oneShotTotal: true },
      }),
    ]);
    const authors = await loadUsersWithInitials(
      this.prisma,
      projectId,
      [...new Set(stages.map((s) => s.userId).filter((uid): uid is string => !!uid))],
    );

    return {
      ...base,
      lossComment: opportunity.lossComment,
      stages: stages.map((s) => ({
        stage: s.stage,
        date: s.date,
        user: s.userId ? this.userRef(authors.get(s.userId), s.userId) : null,
      })),
      quotes: quotes.map((q) => ({
        id: q.id,
        number: q.number,
        status: q.status,
        value: quoteValue(q).toNumber(),
        issueDate: formatDateField(q.issueDate),
      })),
    };
  }

  // -------------------------------------------------------------------------------- write

  /**
   * Une seule opportunité **ouverte** par organisme (US-02-09) : la garantie est portée par un
   * index unique partiel, donc deux créations simultanées ne peuvent pas la contourner —
   * la seconde est rattrapée en 409.
   */
  async create(
    projectId: string,
    dto: CreateOpportunityDto,
    user: AuthenticatedUser,
  ): Promise<OpportunityIdResponseDto> {
    const organization = await this.assertWritableOrganization(dto.organizationId, projectId, user);
    const ownerId = dto.ownerId ?? organization.salesRepId ?? user.id;
    await assertAssigneesAreMembers(this.prisma, projectId, { salesRepId: ownerId });
    if (dto.source) await assertReferencesKnown(this.prisma, projectId, { leadSource: dto.source });

    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.opportunity.create({
          data: {
            projectId,
            organizationId: organization.id,
            label: dto.label ?? organization.name,
            ownerId,
            source: dto.source ?? organization.leadSource,
            expectedCloseDate: dto.expectedCloseDate ? parseDayOrThrow(dto.expectedCloseDate) : null,
          },
          select: { id: true, label: true, stage: true },
        });
        await tx.opportunityStage.create({
          data: { opportunityId: created.id, stage: created.stage, userId: user.id },
        });
        await this.audit.log(tx, {
          projectId,
          userId: user.id,
          action: OPPORTUNITIES_AUDIT.CREATE,
          objectType: AUDIT_OBJECTS.OPPORTUNITY,
          objectId: created.id,
          metadata: { organizationId: organization.id, stage: created.stage },
        });
        return { id: created.id, label: created.label ?? organization.name };
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw apiError.conflict('OPPORTUNITY_ALREADY_OPEN', organization.name);
      throw err;
    }
  }

  async update(
    id: string,
    projectId: string,
    dto: UpdateOpportunityDto,
    scopeWhere: Record<string, unknown>,
    user: AuthenticatedUser,
  ): Promise<OpportunityDto> {
    const opportunity = await this.loadVisible(id, projectId, scopeWhere, user);
    await this.assertWritableOrganization(opportunity.organizationId, projectId, user);
    if (dto.ownerId) await assertAssigneesAreMembers(this.prisma, projectId, { salesRepId: dto.ownerId });
    if (dto.source) await assertReferencesKnown(this.prisma, projectId, { leadSource: dto.source });

    const data: Prisma.OpportunityUpdateInput = {
      ...(dto.label !== undefined ? { label: dto.label } : {}),
      ...(dto.ownerId !== undefined ? { owner: { connect: { id: dto.ownerId } } } : {}),
      ...(dto.source !== undefined ? { source: dto.source } : {}),
      ...(dto.probabilityOverride !== undefined ? { probabilityOverride: dto.probabilityOverride } : {}),
      ...(dto.expectedCloseDate !== undefined
        ? { expectedCloseDate: dto.expectedCloseDate === null ? null : parseDayOrThrow(dto.expectedCloseDate) }
        : {}),
    };
    if (!Object.keys(data).length) throw apiError.badRequest('EMPTY_UPDATE_PAYLOAD');

    await this.prisma.$transaction(async (tx) => {
      await tx.opportunity.update({ where: { id }, data });
      await this.audit.log(tx, {
        projectId,
        userId: user.id,
        action: OPPORTUNITIES_AUDIT.UPDATE,
        objectType: AUDIT_OBJECTS.OPPORTUNITY,
        objectId: id,
        metadata: { fields: Object.keys(data) },
      });
    });

    return this.reload(id, projectId);
  }

  /** Étapes ouvertes seulement : gagnée et perdue ont leurs propres chemins. */
  async changeStage(
    id: string,
    projectId: string,
    dto: ChangeOpportunityStageDto,
    scopeWhere: Record<string, unknown>,
    user: AuthenticatedUser,
  ): Promise<OpportunityDto> {
    if (!isOpenStage(dto.stage)) throw apiError.conflict('OPPORTUNITY_STAGE_RESERVED', dto.stage);
    const opportunity = await this.loadVisible(id, projectId, scopeWhere, user);
    await this.assertWritableOrganization(opportunity.organizationId, projectId, user);
    if (!isOpenStage(opportunity.stage)) throw apiError.conflict('OPPORTUNITY_CLOSED', opportunity.stage);

    await this.prisma.$transaction(async (tx) => {
      const moved = await applyOpportunityStage(tx, opportunity, dto.stage, user.id);
      if (moved) {
        await this.audit.log(tx, {
          projectId,
          userId: user.id,
          action: OPPORTUNITIES_AUDIT.STAGE,
          objectType: AUDIT_OBJECTS.OPPORTUNITY,
          objectId: id,
          metadata: moved,
        });
      }
    });

    return this.reload(id, projectId);
  }

  /** Perte déclarée à la main, motif obligatoire : c'est la matière des statistiques d'échec. */
  async lose(
    id: string,
    projectId: string,
    dto: LoseOpportunityDto,
    scopeWhere: Record<string, unknown>,
    user: AuthenticatedUser,
  ): Promise<OpportunityDto> {
    const opportunity = await this.loadVisible(id, projectId, scopeWhere, user);
    await this.assertWritableOrganization(opportunity.organizationId, projectId, user);
    if (opportunity.stage === OpportunityStageCode.WON) throw apiError.conflict('OPPORTUNITY_CLOSED', opportunity.stage);
    await assertReferencesKnown(this.prisma, projectId, { lossReason: dto.lossReason });

    await this.prisma.$transaction(async (tx) => {
      const moved = await applyOpportunityStage(tx, opportunity, OpportunityStageCode.LOST, user.id, {
        lossReason: dto.lossReason,
        lossComment: dto.comment ?? null,
      });
      await this.audit.log(tx, {
        projectId,
        userId: user.id,
        action: OPPORTUNITIES_AUDIT.LOSE,
        objectType: AUDIT_OBJECTS.OPPORTUNITY,
        objectId: id,
        metadata: { from: moved?.from ?? opportunity.stage, lossReason: dto.lossReason },
      });
    });

    return this.reload(id, projectId);
  }

  /**
   * Suppression d'une opportunité ouverte par erreur. Refusée dès qu'un devis y est rattaché :
   * un devis sans opportunité perdrait son rattachement au pipeline. Écart additif assumé —
   * SPEC-07 ne liste pas la route, mais la permission `opportunities:delete` est au catalogue
   * et, sans elle, la seule sortie d'une opportunité de trop serait de la déclarer perdue,
   * ce qui polluerait les statistiques.
   */
  async remove(
    id: string,
    projectId: string,
    scopeWhere: Record<string, unknown>,
    user: AuthenticatedUser,
  ): Promise<void> {
    const opportunity = await this.loadVisible(id, projectId, scopeWhere, user);
    await this.assertWritableOrganization(opportunity.organizationId, projectId, user);
    const quotes = await this.prisma.quote.count({ where: { projectId, opportunityId: id } });
    if (quotes > 0) throw apiError.conflict('OPPORTUNITY_HAS_QUOTES', String(quotes));

    await this.prisma.$transaction(async (tx) => {
      await tx.opportunity.delete({ where: { id } });
      await this.audit.log(tx, {
        projectId,
        userId: user.id,
        action: OPPORTUNITIES_AUDIT.DELETE,
        objectType: AUDIT_OBJECTS.OPPORTUNITY,
        objectId: id,
        metadata: { label: opportunity.label, stage: opportunity.stage },
      });
    });
  }

  // -------------------------------------------------------------------------------- helpers

  private parseFilters(query: OpportunityListQueryDto) {
    return {
      stage: query.stage,
      ownerId: query.ownerId,
      organizationId: query.organizationId,
      from: query.from ? parseDayOrThrow(query.from) : undefined,
      to: query.to ? parseDayOrThrow(query.to) : undefined,
    };
  }

  /** Fiches visibles de l'appelant : le périmètre porte sur l'organisme, poussé en SQL. */
  private async visibleOrganizations(user: AuthenticatedUser, projectId: string): Promise<Prisma.OrganizationWhereInput> {
    const ctx = await loadScopeContext(this.prisma, user, projectId);
    const where: Prisma.OrganizationWhereInput = { deletedAt: null };
    mergeVisibilityWhere(where, ctx, this.scopeService);
    return where;
  }

  private async loadVisible(
    id: string,
    projectId: string,
    scopeWhere: Record<string, unknown>,
    user: AuthenticatedUser,
  ): Promise<OpportunityRow> {
    const where = buildOpportunityWhere(projectId, {}, scopeWhere, await this.visibleOrganizations(user, projectId));
    const opportunity = await this.prisma.opportunity.findFirst({
      where: { ...where, id },
      include: { organization: { select: ORGANIZATION_SELECT } },
    });
    if (!opportunity) throw apiError.notFound('OPPORTUNITY_NOT_FOUND', id);
    return opportunity;
  }

  /** Écrire sur une opportunité suppose l'accès complet à sa fiche (US-01-03). */
  private async assertWritableOrganization(organizationId: string, projectId: string, user: AuthenticatedUser): Promise<Organization> {
    const organization = await this.prisma.organization.findFirst({ where: { id: organizationId, projectId, deletedAt: null } });
    if (!organization) throw apiError.notFound('ORGANIZATION_NOT_FOUND', organizationId);
    const ctx = await loadScopeContext(this.prisma, user, projectId);
    await assertFullOrganizationAccess(this.prisma, this.scopeService, ctx, organization, organizationId);
    return organization;
  }

  private async loadStageProbabilities(projectId: string): Promise<Record<string, number>> {
    const settings = await this.prisma.settings.findUnique({
      where: { projectId },
      select: { stageProbabilities: true },
    });
    return (settings?.stageProbabilities ?? {}) as Record<string, number>;
  }

  private async loadActiveGrid(projectId: string): Promise<PricingGridContent | null> {
    const grid = await this.prisma.pricingGrid.findFirst({ where: { projectId, active: true }, select: { content: true } });
    return (grid?.content as unknown as PricingGridContent) ?? null;
  }

  private async reload(id: string, projectId: string): Promise<OpportunityDto> {
    const row = await this.prisma.opportunity.findFirstOrThrow({
      where: { id, projectId },
      include: { organization: { select: ORGANIZATION_SELECT } },
    });
    const [mapped] = await this.mapRows(projectId, [row]);
    return mapped;
  }

  /**
   * Valorisation à la lecture (SPEC-14 §2.5) : une requête d'agrégat sur les devis de la page
   * et la grille active, jamais une colonne stockée — aucun filtre ni tri ne porte sur la
   * valeur, et la stocker créerait trois sources de péremption (devis, population, grille).
   */
  private async mapRows(
    projectId: string,
    rows: OpportunityRow[],
    knownProbabilities?: Record<string, number>,
  ): Promise<OpportunityDto[]> {
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);

    const [quotes, stageProbabilities, grid, owners] = await Promise.all([
      this.prisma.quote.findMany({
        where: { projectId, opportunityId: { in: ids } },
        select: { opportunityId: true, arrList: true, oneShotTotal: true },
      }),
      knownProbabilities ? Promise.resolve(knownProbabilities) : this.loadStageProbabilities(projectId),
      this.loadActiveGrid(projectId),
      loadUsersWithInitials(this.prisma, projectId, [...new Set(rows.map((r) => r.ownerId).filter((id): id is string => !!id))]),
    ]);

    const quotesBy = new Map<string, QuoteRow[]>();
    for (const quote of quotes) {
      if (!quote.opportunityId) continue;
      quotesBy.set(quote.opportunityId, [...(quotesBy.get(quote.opportunityId) ?? []), quote]);
    }

    return rows.map((row) => {
      const attached = quotesBy.get(row.id) ?? [];
      const { value, source } = resolveOpportunityValue(attached, grid, row.organization);
      const probability = effectiveProbability(row.stage, row.probabilityOverride, stageProbabilities);
      return {
        id: row.id,
        label: row.label ?? row.organization.name,
        organization: {
          id: row.organization.id,
          name: row.organization.name,
          population: row.organization.population,
        },
        owner: row.ownerId ? this.userRef(owners.get(row.ownerId), row.ownerId) : null,
        stage: row.stage,
        stageProbability: stageProbabilities[row.stage] ?? 0,
        probabilityOverride: row.probabilityOverride,
        probability,
        value: value.toNumber(),
        valueSource: source,
        weightedValue: weightedTotal([{ value, probability }]).toNumber(),
        expectedCloseDate: row.expectedCloseDate ? formatDateField(row.expectedCloseDate) : null,
        source: row.source,
        lossReason: row.lossReason,
        quotesCount: attached.length,
        lastActivityAt: row.organization.lastActivityAt,
        createdAt: row.createdAt,
        closedAt: row.closedAt,
      };
    });
  }

  private userRef(user: UserWithInitials | undefined, id: string) {
    return user ? { id: user.id, fullName: fullName(user), initials: user.initials ?? null } : { id, fullName: '', initials: null };
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
