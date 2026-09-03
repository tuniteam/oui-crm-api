// ============================================
// OUI-CRM - Quotes service (US-02-02 simulation, US-02-03 draft)
// ============================================

import { Injectable } from '@nestjs/common';
import { DocumentType, Organization, Prisma, QuoteStatus, Settings } from '@prisma/client';
import { AUDIT_OBJECTS } from '@/audit-log/audit-log.constants';
import { loadUsersWithInitials } from '@/audit-log/audit-log-labels';
import { AuditLogService } from '@/audit-log/audit-log.service';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { apiError } from '@/common/api-error';
import { buildPaginationMeta, paginationSkip } from '@/common/dto/pagination.dto';
import { formatDateField, parseDayOrThrow, todayUtc } from '@/common/utils/date.utils';
import { nextDocumentNumbers } from '@/common/utils/document-number.utils';
import { userRef } from '@/common/utils/user.utils';
import { ensureOpenOpportunity } from '@/opportunities/opportunities.utils';
import { assertFullOrganizationAccess } from '@/organizations/organizations.utils';
import { PricingService } from '@/pricing/pricing.service';
import { ComputedQuoteLine, PricingGridContent, QuoteConfig, QuoteResult } from '@/pricing/pricing.types';
import { loadActiveGridContent } from '@/pricing/pricing.utils';
import { PrismaService } from '@/prisma/prisma.service';
import { ScopeService } from '@/scopes/scope.service';
import { loadScopeContext, mergeVisibilityWhere } from '@/scopes/scopes.utils';
import { QUOTES_AUDIT, STATUS_BY_AUDIT_ACTION } from './quotes.constants';
import {
  QuoteAmounts,
  QuoteConfigInput,
  amountsOf,
  assertDeletable,
  assertEditable,
  assertSetupShape,
  buildQuoteWhere,
  defaultStartDate,
  normalizeQuoteConfig,
  resolveQuoteResult,
  validUntilFrom,
} from './quotes.utils';
import {
  CreateQuoteDto,
  QuoteDetailDto,
  QuoteDto,
  QuoteIdResponseDto,
  QuoteLineDto,
  QuoteListQueryDto,
  QuoteResultDto,
  QuotesListResponseDto,
  SimulateQuoteDto,
  UpdateQuoteDto,
} from './dto/quote.dto';

const ORGANIZATION_SELECT = { id: true, name: true, population: true } as const;

const QUOTE_INCLUDE = {
  organization: { select: ORGANIZATION_SELECT },
  pricingGrid: { select: { version: true } },
} as const;

type QuoteRow = Prisma.QuoteGetPayload<{ include: typeof QUOTE_INCLUDE }>;

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly scopeService: ScopeService,
    private readonly audit: AuditLogService,
  ) {}

  // -------------------------------------------------------------------------------- simulate

  /**
   * US-02-02 — le calcul du configurateur, sans rien persister. C'est **le seul** chemin de
   * calcul : le front appelle cette route à chaque changement, il ne rejoue pas la formule.
   */
  async simulate(projectId: string, dto: SimulateQuoteDto, user: AuthenticatedUser): Promise<QuoteResultDto> {
    const organization = await this.loadVisibleOrganization(dto.organizationId, projectId, user);
    const settings = await this.loadSettings(projectId);
    const { content } = await this.loadGrid(projectId, dto.pricingGridId);

    assertSetupShape((dto.config as unknown as QuoteConfigInput).setup);
    const config = normalizeQuoteConfig(dto.config as unknown as QuoteConfigInput, this.defaultsOf(settings));
    const startDate = dto.startDate ? parseDayOrThrow(dto.startDate) : defaultStartDate(todayUtc());

    const result = this.pricing.computeQuote({
      grid: content,
      population: organization.population,
      vatRate: Number(settings.vatRate),
      startDate: formatDateField(startDate),
      config,
    });
    return this.toResultDto(result, settings);
  }

  // -------------------------------------------------------------------------------- list

  async findAll(
    projectId: string,
    query: QuoteListQueryDto,
    scopeWhere: Record<string, unknown>,
    user: AuthenticatedUser,
  ): Promise<QuotesListResponseDto> {
    const { page, limit } = query;
    const where = buildQuoteWhere(
      projectId,
      {
        organizationId: query.organizationId,
        opportunityId: query.opportunityId,
        status: query.status,
        ownerId: query.ownerId,
        from: query.from ? parseDayOrThrow(query.from) : undefined,
        to: query.to ? parseDayOrThrow(query.to) : undefined,
      },
      scopeWhere,
      await this.visibleOrganizations(user, projectId),
    );

    const [total, rows, settings] = await Promise.all([
      this.prisma.quote.count({ where }),
      this.prisma.quote.findMany({
        where,
        skip: paginationSkip(page, limit),
        take: limit,
        orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
        include: QUOTE_INCLUDE,
      }),
      this.loadSettings(projectId),
    ]);

    const owners = await loadUsersWithInitials(
      this.prisma,
      projectId,
      [...new Set(rows.map((r) => r.ownerId).filter((id): id is string => !!id))],
    );

    return {
      data: rows.map((row) => this.toListItem(row, settings, owners.get(row.ownerId ?? ''))),
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  async findOne(
    id: string,
    projectId: string,
    scopeWhere: Record<string, unknown>,
    user: AuthenticatedUser,
  ): Promise<QuoteDetailDto> {
    const quote = await this.loadVisible(id, projectId, scopeWhere, user);
    const settings = await this.loadSettings(projectId);
    const grid = await loadActiveGridContent(this.prisma, projectId);

    const { lines, result } = resolveQuoteResult(
      this.pricing,
      { ...quote, lines: quote.lines },
      grid,
      quote.organization.population,
      Number(settings.vatRate),
    );

    const [owners, history, documents] = await Promise.all([
      loadUsersWithInitials(this.prisma, projectId, [...new Set([quote.ownerId].filter((v): v is string => !!v))]),
      this.loadHistory(projectId, id),
      this.prisma.file.findMany({
        where: { projectId, ownerType: 'QUOTE', ownerId: id },
        select: { id: true, fileName: true, uploadedAt: true },
        orderBy: { uploadedAt: 'desc' },
      }),
    ]);

    return {
      ...this.toListItem(quote, settings, owners.get(quote.ownerId ?? '')),
      config: (quote.config as unknown as QuoteDetailDto['config']) ?? null,
      result: result
        ? this.toResultDto(result, settings)
        : this.frozenResultDto(quote, lines, settings),
      lines: lines.map((line) => this.toLineDto(line)),
      documents: documents.map((f) => ({ id: f.id, fileName: f.fileName, createdAt: f.uploadedAt })),
      history,
      pricingGridVersion: quote.pricingGrid.version,
    };
  }

  // -------------------------------------------------------------------------------- write

  /**
   * US-02-03 — le brouillon. Son numéro est attribué à la création (jamais réutilisé), et il
   * se rattache à l'opportunité ouverte de la fiche, créée si elle n'existe pas : un devis
   * appartient toujours à une affaire.
   */
  async create(projectId: string, dto: CreateQuoteDto, user: AuthenticatedUser): Promise<QuoteIdResponseDto> {
    const organization = await this.assertWritableOrganization(dto.organizationId, projectId, user);
    const settings = await this.loadSettings(projectId);
    const { id: gridId, content } = await this.loadGrid(projectId, dto.pricingGridId);

    assertSetupShape((dto.config as unknown as QuoteConfigInput).setup);
    const config = normalizeQuoteConfig(dto.config as unknown as QuoteConfigInput, this.defaultsOf(settings));
    const issueDate = todayUtc();
    const startDate = dto.startDate ? parseDayOrThrow(dto.startDate) : defaultStartDate(issueDate);

    // Le calcul d'abord : une population absente ou une formule inconnue refuse le devis avant
    // qu'un numéro ne soit consommé.
    const result = this.pricing.computeQuote({
      grid: content,
      population: organization.population,
      vatRate: Number(settings.vatRate),
      startDate: formatDateField(startDate),
      config,
    });

    const initials = await this.initialsOf(user.id, projectId);

    const quote = await this.prisma.$transaction(async (tx) => {
      const opportunityId = dto.opportunityId
        ? (await this.assertOpportunityOfOrganization(tx, dto.opportunityId, projectId, organization.id)).id
        : (await ensureOpenOpportunity(tx, projectId, organization, user.id)).id;

      const [number] = await nextDocumentNumbers(tx, {
        projectId,
        type: DocumentType.QUOTE,
        initials,
        day: issueDate,
      });

      const created = await tx.quote.create({
        data: {
          projectId,
          organizationId: organization.id,
          opportunityId,
          pricingGridId: gridId,
          number,
          type: dto.type ?? undefined,
          ownerId: user.id,
          issueDate,
          validUntil: validUntilFrom(issueDate, settings.quoteValidityDays),
          startDate,
          config: config as unknown as Prisma.InputJsonValue,
          ...amountsOf(result),
        },
        select: { id: true, number: true },
      });

      await this.audit.log(tx, {
        projectId,
        userId: user.id,
        action: QUOTES_AUDIT.CREATE,
        objectType: AUDIT_OBJECTS.QUOTE,
        objectId: created.id,
        metadata: { number: created.number, organizationId: organization.id, opportunityId },
      });
      return created;
    });

    return quote;
  }

  async update(
    id: string,
    projectId: string,
    dto: UpdateQuoteDto,
    scopeWhere: Record<string, unknown>,
    user: AuthenticatedUser,
  ): Promise<QuoteDetailDto> {
    const quote = await this.loadVisible(id, projectId, scopeWhere, user);
    assertEditable(quote);
    await this.assertWritableOrganization(quote.organizationId, projectId, user);

    if (dto.config === undefined && dto.startDate === undefined && dto.type === undefined) {
      throw apiError.badRequest('EMPTY_UPDATE_PAYLOAD');
    }

    const settings = await this.loadSettings(projectId);
    const { id: gridId, content } = await this.loadGrid(projectId);
    const config = dto.config
      ? normalizeQuoteConfig(dto.config as unknown as QuoteConfigInput, this.defaultsOf(settings))
      : (quote.config as unknown as QuoteConfig);
    if (dto.config) assertSetupShape(config.setup);

    const startDate = dto.startDate ? parseDayOrThrow(dto.startDate) : quote.startDate;
    const result = this.pricing.computeQuote({
      grid: content,
      population: quote.organization.population,
      vatRate: Number(settings.vatRate),
      startDate: formatDateField(startDate),
      config,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.quote.update({
        where: { id },
        data: {
          ...(dto.type !== undefined ? { type: dto.type } : {}),
          startDate,
          config: config as unknown as Prisma.InputJsonValue,
          pricingGridId: gridId,
          ...amountsOf(result),
        },
      });
      await this.audit.log(tx, {
        projectId,
        userId: user.id,
        action: QUOTES_AUDIT.UPDATE,
        objectType: AUDIT_OBJECTS.QUOTE,
        objectId: id,
        metadata: { number: quote.number, fields: Object.keys(dto) },
      });
    });

    return this.findOne(id, projectId, scopeWhere, user);
  }

  /** Un brouillon se supprime ; un devis soumis reste (409). */
  async remove(
    id: string,
    projectId: string,
    scopeWhere: Record<string, unknown>,
    user: AuthenticatedUser,
  ): Promise<void> {
    const quote = await this.loadVisible(id, projectId, scopeWhere, user);
    assertDeletable(quote);
    await this.assertWritableOrganization(quote.organizationId, projectId, user);

    await this.prisma.$transaction(async (tx) => {
      await tx.quote.delete({ where: { id } });
      await this.audit.log(tx, {
        projectId,
        userId: user.id,
        action: QUOTES_AUDIT.DELETE,
        objectType: AUDIT_OBJECTS.QUOTE,
        objectId: id,
        metadata: { number: quote.number, status: quote.status },
      });
    });
  }

  // -------------------------------------------------------------------------------- helpers

  private defaultsOf(settings: Settings) {
    return {
      vatRate: Number(settings.vatRate),
      quoteValidityDays: settings.quoteValidityDays,
      defaultCommitmentMonths: settings.defaultCommitmentMonths,
      discountCap: settings.discountCap,
    };
  }

  private async loadSettings(projectId: string): Promise<Settings> {
    const settings = await this.prisma.settings.findUnique({ where: { projectId } });
    if (!settings) throw apiError.notFound('SETTINGS_NOT_FOUND');
    return settings;
  }

  /** La grille active, ou une version précise pour simuler un scénario. */
  private async loadGrid(projectId: string, gridId?: string): Promise<{ id: string; content: PricingGridContent }> {
    const grid = gridId
      ? await this.prisma.pricingGrid.findFirst({ where: { id: gridId, projectId }, select: { id: true, content: true } })
      : await this.prisma.pricingGrid.findFirst({
          where: { projectId, active: true },
          select: { id: true, content: true },
        });
    if (!grid) {
      throw gridId ? apiError.notFound('PRICING_GRID_NOT_FOUND', gridId) : apiError.notFound('PRICING_GRID_NO_ACTIVE');
    }
    return { id: grid.id, content: grid.content as unknown as PricingGridContent };
  }

  private async initialsOf(userId: string, projectId: string): Promise<string> {
    const relation = await this.prisma.userRoleProject.findFirst({
      where: { userId, projectId },
      select: { initials: true },
    });
    if (!relation?.initials) throw apiError.badRequest('DOCUMENT_NUMBER_INITIALS_REQUIRED');
    return relation.initials;
  }

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
  ) {
    const where = buildQuoteWhere(projectId, {}, scopeWhere, await this.visibleOrganizations(user, projectId));
    const quote = await this.prisma.quote.findFirst({
      where: { ...where, id },
      include: { ...QUOTE_INCLUDE, lines: true },
    });
    if (!quote) throw apiError.notFound('QUOTE_NOT_FOUND', id);
    return quote;
  }

  private async loadVisibleOrganization(organizationId: string, projectId: string, user: AuthenticatedUser) {
    const organizationWhere = await this.visibleOrganizations(user, projectId);
    const organization = await this.prisma.organization.findFirst({
      where: { ...organizationWhere, id: organizationId, projectId },
      select: ORGANIZATION_SELECT,
    });
    if (!organization) throw apiError.notFound('ORGANIZATION_NOT_FOUND', organizationId);
    return organization;
  }

  /** Écrire un devis suppose l'accès complet à la fiche (US-01-03). */
  private async assertWritableOrganization(
    organizationId: string,
    projectId: string,
    user: AuthenticatedUser,
  ): Promise<Organization> {
    const organization = await this.prisma.organization.findFirst({
      where: { id: organizationId, projectId, deletedAt: null },
    });
    if (!organization) throw apiError.notFound('ORGANIZATION_NOT_FOUND', organizationId);
    const ctx = await loadScopeContext(this.prisma, user, projectId);
    await assertFullOrganizationAccess(this.prisma, this.scopeService, ctx, organization, organizationId);
    return organization;
  }

  private async assertOpportunityOfOrganization(
    tx: Prisma.TransactionClient,
    opportunityId: string,
    projectId: string,
    organizationId: string,
  ) {
    const opportunity = await tx.opportunity.findFirst({
      where: { id: opportunityId, projectId, organizationId },
      select: { id: true },
    });
    if (!opportunity) throw apiError.badRequest('QUOTE_OPPORTUNITY_MISMATCH', opportunityId);
    return opportunity;
  }

  /** L'historique des statuts se relit dans le journal — pas de table de plus (SPEC-14 §2.5). */
  private async loadHistory(projectId: string, quoteId: string): Promise<QuoteDetailDto['history']> {
    const entries = await this.prisma.auditLog.findMany({
      where: { projectId, objectType: AUDIT_OBJECTS.QUOTE, objectId: quoteId, action: { in: Object.keys(STATUS_BY_AUDIT_ACTION) } },
      orderBy: { createdAt: 'asc' },
      select: { action: true, createdAt: true, userId: true },
    });
    const actors = await loadUsersWithInitials(
      this.prisma,
      projectId,
      [...new Set(entries.map((e) => e.userId).filter((id): id is string => !!id))],
    );
    return entries.map((entry) => ({
      status: STATUS_BY_AUDIT_ACTION[entry.action],
      at: entry.createdAt,
      by: entry.userId ? userRef(actors.get(entry.userId), entry.userId) : null,
    }));
  }

  // -------------------------------------------------------------------------------- mapping

  private toListItem(
    row: QuoteRow,
    settings: Settings,
    owner: Parameters<typeof userRef>[0],
  ): QuoteDto {
    const config = row.config as unknown as QuoteConfig | null;
    return {
      id: row.id,
      number: row.number,
      legacyNumber: row.legacyNumber,
      origin: row.origin,
      type: row.type,
      status: row.status,
      organization: {
        id: row.organization.id,
        name: row.organization.name,
        population: row.organization.population,
      },
      opportunityId: row.opportunityId,
      owner: row.ownerId ? userRef(owner, row.ownerId) : null,
      issueDate: formatDateField(row.issueDate),
      validUntil: formatDateField(row.validUntil),
      startDate: formatDateField(row.startDate),
      plan: config?.plan ?? null,
      mrrList: row.mrrList.toNumber(),
      mrrNet: row.mrrNet.toNumber(),
      oneShotTotal: row.oneShotTotal.toNumber(),
      firstYearHt: row.firstYearHt.toNumber(),
      maxDiscount: row.maxDiscount,
      requiresValidation: row.maxDiscount > settings.discountCap,
      signedAt: row.signedAt ? formatDateField(row.signedAt) : null,
      createdAt: row.createdAt,
    };
  }

  private toLineDto(line: ComputedQuoteLine): QuoteLineDto {
    return {
      nature: line.nature,
      label: line.label,
      sublabel: line.sublabel,
      qty: line.qty.toNumber(),
      unitPrice: line.unitPrice.toNumber(),
      discount: line.discount,
      total: line.total.toNumber(),
    };
  }

  private toResultDto(result: QuoteResult, settings: Settings): QuoteResultDto {
    return {
      bracketIndex: result.bracketIndex,
      bracketLabel: result.bracketLabel,
      subscriptionUnitPrice: result.subscriptionUnitPrice.toNumber(),
      subscriptionLines: result.subscriptionLines.map((l) => this.toLineDto(l)),
      setupLines: result.setupLines.map((l) => this.toLineDto(l)),
      mrrList: result.mrrList.toNumber(),
      mrrNet: result.mrrNet.toNumber(),
      arrList: result.arrList.toNumber(),
      arrNet: result.arrNet.toNumber(),
      oneShot: {
        setup: result.oneShot.setup.toNumber(),
        training: result.oneShot.training.toNumber(),
        hardware: result.oneShot.hardware.toNumber(),
        total: result.oneShot.total.toNumber(),
      },
      firstYear: {
        subscription: result.firstYear.subscription.toNumber(),
        totalHt: result.firstYear.totalHt.toNumber(),
        vat: result.firstYear.vat.toNumber(),
        totalTtc: result.firstYear.totalTtc.toNumber(),
      },
      multiYear: result.multiYear.years.map((year, i) => ({
        year,
        months: result.multiYear.months[i],
        subscription: result.multiYear.subscription[i].toNumber(),
        setup: result.multiYear.setup[i].toNumber(),
        training: result.multiYear.training[i].toNumber(),
        hardware: result.multiYear.hardware[i].toNumber(),
        totalHt: result.multiYear.totalHt[i].toNumber(),
        totalTtc: result.multiYear.totalTtc[i].toNumber(),
      })),
      maxDiscount: result.maxDiscount,
      requiresValidation: result.maxDiscount > settings.discountCap,
    };
  }

  /**
   * Un devis figé n'a plus de simulation vivante : le récapitulatif est reconstitué depuis ses
   * montants stockés et ses lignes, sans jamais rappeler le moteur.
   */
  private frozenResultDto(quote: QuoteAmounts & { status: QuoteStatus }, lines: ComputedQuoteLine[], settings: Settings): QuoteResultDto {
    const subscription = lines.filter((l) => l.nature === 'ABONNEMENT' || l.nature === 'OPTION');
    const setup = lines.filter((l) => l.nature === 'SETUP' || l.nature === 'EXTRA');
    return {
      bracketIndex: -1,
      bracketLabel: subscription[0]?.sublabel ?? '',
      subscriptionUnitPrice: subscription[0]?.unitPrice.toNumber() ?? 0,
      subscriptionLines: subscription.map((l) => this.toLineDto(l)),
      setupLines: setup.map((l) => this.toLineDto(l)),
      mrrList: quote.mrrList.toNumber(),
      mrrNet: quote.mrrNet.toNumber(),
      arrList: quote.arrList.toNumber(),
      arrNet: quote.arrNet.toNumber(),
      oneShot: { setup: 0, training: 0, hardware: 0, total: quote.oneShotTotal.toNumber() },
      firstYear: {
        subscription: quote.firstYearHt.minus(quote.oneShotTotal).toNumber(),
        totalHt: quote.firstYearHt.toNumber(),
        vat: quote.firstYearVat.toNumber(),
        totalTtc: quote.firstYearTtc.toNumber(),
      },
      multiYear: [],
      maxDiscount: quote.maxDiscount,
      requiresValidation: quote.maxDiscount > settings.discountCap,
    };
  }
}
