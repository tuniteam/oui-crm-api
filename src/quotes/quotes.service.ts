// ============================================
// OUI-CRM - Quotes service (US-02-02 simulation, US-02-03 draft)
// ============================================

import { Injectable } from '@nestjs/common';
import {
  ActivityStatus,
  DocumentType,
  FileOwnerType,
  Organization,
  Prisma,
  QuoteLineNature,
  QuoteStatus,
  Settings,
} from '@prisma/client';
import { AUDIT_OBJECTS } from '@/audit-log/audit-log.constants';
import { OPPORTUNITIES_AUDIT } from '@/opportunities/opportunities.constants';
import { ORGANIZATION_AUDIT } from '@/organizations/organizations.constants';
import { loadUsersWithInitials } from '@/audit-log/audit-log-labels';
import { AuditLogService } from '@/audit-log/audit-log.service';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { apiError } from '@/common/api-error';
import { labels } from '@/common/messages';
import { buildPaginationMeta, paginationSkip } from '@/common/dto/pagination.dto';
import { formatDateField, parseDayOrThrow, todayUtc } from '@/common/utils/date.utils';
import { nextDocumentNumbers } from '@/common/utils/document-number.utils';
import { userRef } from '@/common/utils/user.utils';
import { recomputeActivityMarks } from '@/activities/activities.utils';
import { findPermission } from '@/auth/utils/permissions.util';
import { ensureOpenOpportunity } from '@/opportunities/opportunities.utils';
import { assertFullOrganizationAccess } from '@/organizations/organizations.utils';
import { PricingService } from '@/pricing/pricing.service';
import {
  ComputedQuoteLine,
  PricingGridContent,
  QuoteConfig,
  QuoteResult,
} from '@/pricing/pricing.types';
import {
  loadActiveGridContent,
  splitOneShot,
  sumMoney,
  trainingFeeLabel,
} from '@/pricing/pricing.utils';
import { PrismaService } from '@/prisma/prisma.service';
import { ScopeService } from '@/scopes/scope.service';
import { loadScopeContext, mergeVisibilityWhere } from '@/scopes/scopes.utils';
import {
  FOLLOW_UP_ACTIVITY_TYPE,
  NO_BRACKET_INDEX,
  LOSS_REASON_ON_DECLINE,
  QUOTES_AUDIT,
  QUOTE_LIFECYCLE_ACTIONS,
} from './quotes.constants';
import {
  QuoteAmounts,
  QuoteConfigInput,
  QuoteStatusChange,
  QuoteWithContext,
  amountsOf,
  applyQuoteStatus,
  assertDeletable,
  assertEditable,
  assertPending,
  assertReopenable,
  assertSubmittable,
  exceedsDiscountCap,
  assertSetupShape,
  buildQuoteWhere,
  defaultStartDate,
  linesToCreate,
  normalizeQuoteConfig,
  reopenData,
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
  QuoteStatusResponseDto,
  QuotesListResponseDto,
  RejectQuoteDto,
  SimulateQuoteDto,
  UpdateQuoteDto,
} from './dto/quote.dto';

const ORGANIZATION_SELECT = { id: true, name: true, population: true, salesStatus: true } as const;

const QUOTE_INCLUDE = {
  organization: { select: ORGANIZATION_SELECT },
  pricingGrid: { select: { version: true } },
  opportunity: { select: { id: true, stage: true } },
} as const;

/** Le devis tel que les routes d'action le chargent : son entourage et ses lignes figées. */
type QuoteWithLines = Prisma.QuoteGetPayload<{ include: typeof QUOTE_INCLUDE & { lines: true } }>;

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
  async simulate(
    projectId: string,
    dto: SimulateQuoteDto,
    user: AuthenticatedUser,
  ): Promise<QuoteResultDto> {
    const organization = await this.loadVisibleOrganization(dto.organizationId, projectId, user);
    const settings = await this.loadSettings(projectId);
    const { content } = await this.loadGrid(projectId, dto.pricingGridId);

    assertSetupShape((dto.config as unknown as QuoteConfigInput).setup);
    const config = normalizeQuoteConfig(
      dto.config as unknown as QuoteConfigInput,
      this.defaultsOf(settings),
    );
    const startDate = dto.startDate ? parseDayOrThrow(dto.startDate) : defaultStartDate(todayUtc());

    const result = this.price(content, organization.population, settings, startDate, config);
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

    const owners = await loadUsersWithInitials(this.prisma, projectId, [
      ...new Set(rows.map((r) => r.ownerId).filter((id): id is string => !!id)),
    ]);

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
      loadUsersWithInitials(this.prisma, projectId, [
        ...new Set([quote.ownerId].filter((v): v is string => !!v)),
      ]),
      this.loadHistory(projectId, id),
      this.prisma.file.findMany({
        where: { projectId, ownerType: FileOwnerType.QUOTE, ownerId: id },
        select: { id: true, fileName: true, uploadedAt: true },
        orderBy: { uploadedAt: 'desc' },
      }),
    ]);

    return {
      ...this.toListItem(quote, settings, owners.get(quote.ownerId ?? '')),
      config: (quote.config as unknown as QuoteDetailDto['config']) ?? null,
      result: result
        ? this.toResultDto(result, settings)
        : this.frozenResultDto(quote, lines, settings, trainingFeeLabel(grid)),
      lines: lines.map((line) => this.toLineDto(line)),
      documents: documents.map((f) => ({
        id: f.id,
        fileName: f.fileName,
        createdAt: f.uploadedAt,
      })),
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
  async create(
    projectId: string,
    dto: CreateQuoteDto,
    user: AuthenticatedUser,
  ): Promise<QuoteIdResponseDto> {
    const organization = await this.assertWritableOrganization(dto.organizationId, projectId, user);
    const settings = await this.loadSettings(projectId);
    const { id: gridId, content } = await this.loadGrid(projectId, dto.pricingGridId);

    assertSetupShape((dto.config as unknown as QuoteConfigInput).setup);
    const config = normalizeQuoteConfig(
      dto.config as unknown as QuoteConfigInput,
      this.defaultsOf(settings),
    );
    const issueDate = todayUtc();
    const startDate = dto.startDate ? parseDayOrThrow(dto.startDate) : defaultStartDate(issueDate);

    // Le calcul d'abord : une population absente ou une formule inconnue refuse le devis avant
    // qu'un numéro ne soit consommé.
    const result = this.price(content, organization.population, settings, startDate, config);

    const initials = await this.initialsOf(user.id, projectId);

    const quote = await this.prisma.$transaction(async (tx) => {
      const opportunityId = dto.opportunityId
        ? (
            await this.assertOpportunityOfOrganization(
              tx,
              dto.opportunityId,
              projectId,
              organization.id,
            )
          ).id
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
        metadata: {
          status: QuoteStatus.DRAFT,
          number: created.number,
          organizationId: organization.id,
          opportunityId,
        },
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
    const result = this.price(content, quote.organization.population, settings, startDate, config);

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

  // -------------------------------------------------------------------------------- lifecycle

  /**
   * US-02-04 — la soumission. Elle **fige** : les lignes calculées deviennent des lignes en
   * base et le devis cesse d'être recalculé. Au-delà du plafond de remise du projet, il part
   * en validation, sauf si son auteur porte `quotes:discountAboveCap` — un directeur commercial
   * n'a pas à se valider lui-même.
   */
  async submit(
    id: string,
    projectId: string,
    scopeWhere: Record<string, unknown>,
    user: AuthenticatedUser,
  ): Promise<QuoteStatusResponseDto> {
    const quote = await this.loadVisible(id, projectId, scopeWhere, user);
    assertSubmittable(quote);
    await this.assertWritableOrganization(quote.organizationId, projectId, user);

    const settings = await this.loadSettings(projectId);
    const { id: gridId, content } = await this.loadGrid(projectId);

    // Recalcul final avant figeage : c'est ce résultat-là qui devient le devis.
    const result = this.price(
      content,
      quote.organization.population,
      settings,
      quote.startDate,
      quote.config as unknown as QuoteConfig,
    );

    const requiresValidation = exceedsDiscountCap(result.maxDiscount, settings.discountCap);
    const mayExceed = Boolean(findPermission(user, projectId, 'quotes:discountAboveCap'));
    const to = requiresValidation && !mayExceed ? QuoteStatus.PENDING_VALIDATION : QuoteStatus.SENT;

    const change = await this.prisma.$transaction(async (tx) => {
      await tx.quote.update({
        where: { id },
        data: { pricingGridId: gridId, ...amountsOf(result) },
      });
      await tx.quoteLine.createMany({ data: linesToCreate(id, result) });

      const moved = await applyQuoteStatus(tx, projectId, this.contextOf(quote), to, user.id);
      await this.logLifecycle(tx, projectId, user, quote, QUOTES_AUDIT.SUBMIT, moved, {
        maxDiscount: result.maxDiscount,
        discountCap: settings.discountCap,
        requiresValidation,
        grantedAboveCap: requiresValidation && mayExceed,
      });
      return moved;
    });

    return { id, number: quote.number, status: change.quote.to, requiresValidation };
  }

  /**
   * **Le chemin unique d'une transition simple** : charger le devis, vérifier qu'on a le droit
   * d'écrire sur sa fiche, appliquer le changement, en tirer les entrées de journal.
   *
   * Quatre routes n'ont qu'un triplet à fournir (statut visé, action journalisée, effet
   * annexe) : les écrire à la main, c'était recopier dix lignes de squelette et laisser chaque
   * copie diverger — c'est ainsi que la trace du mouvement d'opportunité avait été oubliée
   * dans toutes à la fois. `submit` et `reopen` restent écrites en clair : elles ne partagent
   * rien avec ce squelette.
   */
  private async transition(
    id: string,
    projectId: string,
    scopeWhere: Record<string, unknown>,
    user: AuthenticatedUser,
    step: {
      to: QuoteStatus;
      action: string;
      guard?: (quote: QuoteWithLines) => void;
      extra?: (quote: QuoteWithLines) => Parameters<typeof applyQuoteStatus>[5];
      metadata?: (quote: QuoteWithLines) => Record<string, unknown>;
      after?: (tx: Prisma.TransactionClient, quote: QuoteWithLines) => Promise<void>;
    },
  ): Promise<QuoteStatusResponseDto> {
    const quote = await this.loadVisible(id, projectId, scopeWhere, user);
    step.guard?.(quote);
    // Une transition écrit sur la fiche — statut commercial, activité de relance : elle exige
    // donc l'accès COMPLET, qu'un rôle en lecture restreinte n'a pas.
    await this.assertWritableOrganization(quote.organizationId, projectId, user);
    const settings = await this.loadSettings(projectId);

    const change = await this.prisma.$transaction(async (tx) => {
      const moved = await applyQuoteStatus(
        tx,
        projectId,
        this.contextOf(quote),
        step.to,
        user.id,
        step.extra?.(quote) ?? {},
      );
      await step.after?.(tx, quote);
      await this.logLifecycle(
        tx,
        projectId,
        user,
        quote,
        step.action,
        moved,
        step.metadata?.(quote) ?? {},
      );
      return moved;
    });

    return this.statusResponse(quote, change.quote.to, settings);
  }

  /** US-02-05 — la direction approuve : le devis part au client. */
  async validate(
    id: string,
    projectId: string,
    scopeWhere: Record<string, unknown>,
    user: AuthenticatedUser,
  ): Promise<QuoteStatusResponseDto> {
    return this.transition(id, projectId, scopeWhere, user, {
      to: QuoteStatus.SENT,
      action: QUOTES_AUDIT.VALIDATE,
      guard: assertPending,
      extra: () => ({ validatedById: user.id }),
      metadata: (quote) => ({ maxDiscount: quote.maxDiscount }),
    });
  }

  /**
   * US-02-05 — la direction renvoie le devis au brouillon. Ses lignes figées sont supprimées :
   * il redevient un devis vivant, recalculé depuis la grille active, et une nouvelle soumission
   * ne peut pas empiler deux jeux de lignes.
   */
  async reject(
    id: string,
    projectId: string,
    dto: RejectQuoteDto,
    scopeWhere: Record<string, unknown>,
    user: AuthenticatedUser,
  ): Promise<QuoteStatusResponseDto> {
    return this.transition(id, projectId, scopeWhere, user, {
      to: QuoteStatus.DRAFT,
      action: QUOTES_AUDIT.REJECT,
      guard: assertPending,
      extra: () => ({ rejectionReason: dto.reason ?? null, validatedById: null }),
      metadata: () => ({ reason: dto.reason ?? null }),
      after: async (tx, quote) => {
        await tx.quoteLine.deleteMany({ where: { quoteId: quote.id } });
      },
    });
  }

  /**
   * US-02-06 — la relance. Elle laisse une trace côté fiche : une activité `FOLLOW_UP`
   * réalisée, pour que le prochain qui ouvre l'organisme sache que le devis a été relancé.
   */
  async followUp(
    id: string,
    projectId: string,
    scopeWhere: Record<string, unknown>,
    user: AuthenticatedUser,
  ): Promise<QuoteStatusResponseDto> {
    return this.transition(id, projectId, scopeWhere, user, {
      to: QuoteStatus.FOLLOWED_UP,
      action: QUOTES_AUDIT.FOLLOW_UP,
      after: async (tx, quote) => {
        await tx.activity.create({
          data: {
            projectId,
            organizationId: quote.organizationId,
            userId: user.id,
            type: FOLLOW_UP_ACTIVITY_TYPE,
            date: todayUtc(),
            status: ActivityStatus.DONE,
            completedAt: new Date(),
            report: labels.quoteFollowUpReport(quote.number),
          },
        });
        await recomputeActivityMarks(tx, quote.organizationId);
      },
    });
  }

  /** US-02-06 — on discute le prix, le périmètre ou le calendrier. */
  async negotiate(
    id: string,
    projectId: string,
    scopeWhere: Record<string, unknown>,
    user: AuthenticatedUser,
  ): Promise<QuoteStatusResponseDto> {
    return this.transition(id, projectId, scopeWhere, user, {
      to: QuoteStatus.NEGOTIATING,
      action: QUOTES_AUDIT.NEGOTIATE,
    });
  }

  /** US-02-06 — le client dit non : le devis est refusé et l'affaire est perdue. */
  async decline(
    id: string,
    projectId: string,
    dto: RejectQuoteDto,
    scopeWhere: Record<string, unknown>,
    user: AuthenticatedUser,
  ): Promise<QuoteStatusResponseDto> {
    return this.transition(id, projectId, scopeWhere, user, {
      to: QuoteStatus.REJECTED,
      action: QUOTES_AUDIT.DECLINE,
      extra: () => ({ declineReason: dto.reason ?? null, lossReason: LOSS_REASON_ON_DECLINE }),
      metadata: () => ({ reason: dto.reason ?? null }),
    });
  }

  /**
   * US-02-06 — rouvrir un devis expiré  /**
   * US-02-06 — rouvrir un devis expiré. Il n'est pas ressuscité : un **nouveau** brouillon
   * naît de sa configuration, avec son propre numéro, et pointe vers lui (`sourceQuoteId`).
   * L'historique commercial garde ainsi la trace des deux tentatives.
   */
  async reopen(
    id: string,
    projectId: string,
    scopeWhere: Record<string, unknown>,
    user: AuthenticatedUser,
  ): Promise<QuoteIdResponseDto> {
    const quote = await this.loadVisible(id, projectId, scopeWhere, user);
    assertReopenable(quote);
    await this.assertWritableOrganization(quote.organizationId, projectId, user);

    const settings = await this.loadSettings(projectId);
    const { id: gridId, content } = await this.loadGrid(projectId);
    const issueDate = todayUtc();
    const result = this.price(
      content,
      quote.organization.population,
      settings,
      quote.startDate,
      quote.config as unknown as QuoteConfig,
    );
    const initials = await this.initialsOf(user.id, projectId);

    return this.prisma.$transaction(async (tx) => {
      const [number] = await nextDocumentNumbers(tx, {
        projectId,
        type: DocumentType.QUOTE,
        initials,
        day: issueDate,
      });
      const created = await tx.quote.create({
        data: reopenData(
          quote,
          gridId,
          number,
          user.id,
          issueDate,
          validUntilFrom(issueDate, settings.quoteValidityDays),
          amountsOf(result),
        ),
        select: { id: true, number: true },
      });
      await this.audit.log(tx, {
        projectId,
        userId: user.id,
        action: QUOTES_AUDIT.CREATE,
        objectType: AUDIT_OBJECTS.QUOTE,
        objectId: created.id,
        metadata: { status: QuoteStatus.DRAFT, number: created.number, reopenedFrom: quote.number },
      });
      await this.audit.log(tx, {
        projectId,
        userId: user.id,
        action: QUOTES_AUDIT.REOPEN,
        objectType: AUDIT_OBJECTS.QUOTE,
        objectId: id,
        metadata: { number: quote.number, newQuote: created.number },
      });
      return created;
    });
  }

  // -------------------------------------------------------------------------------- helpers
  /** Le devis et son entourage, dans la forme que le writer unique attend. */
  private contextOf(quote: QuoteWithLines): QuoteWithContext {
    return {
      id: quote.id,
      status: quote.status,
      organization: { id: quote.organization.id, salesStatus: quote.organization.salesStatus },
      opportunity: quote.opportunity
        ? { id: quote.opportunity.id, stage: quote.opportunity.stage }
        : null,
    };
  }

  /**
   * Réponse d'une transition. `requiresValidation` y dit **la même chose** que la liste et le
   * détail : la remise du devis dépasse-t-elle le plafond du projet ? Le figer à `true` ou
   * `false` selon la route revenait à répondre autre chose que la question posée.
   */
  private statusResponse(
    quote: { id: string; number: string; maxDiscount: number },
    status: QuoteStatus,
    settings: Settings,
  ): QuoteStatusResponseDto {
    return {
      id: quote.id,
      number: quote.number,
      status,
      requiresValidation: exceedsDiscountCap(quote.maxDiscount, settings.discountCap),
    };
  }

  /**
   * Journalise une transition sur les **trois** objets qu'elle peut toucher : le devis (avec le
   * statut atteint, dont l'historique se sert), l'opportunité et la fiche. Oublier l'un des
   * trois, c'est rendre un mouvement inexplicable dans le détail de l'objet concerné.
   */
  private async logLifecycle(
    tx: Prisma.TransactionClient,
    projectId: string,
    user: AuthenticatedUser,
    quote: { id: string; number: string; organizationId: string; opportunityId: string | null },
    action: string,
    change: QuoteStatusChange,
    extra: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.log(tx, {
      projectId,
      userId: user.id,
      action,
      objectType: AUDIT_OBJECTS.QUOTE,
      objectId: quote.id,
      metadata: {
        status: change.quote.to,
        from: change.quote.from,
        number: quote.number,
        ...extra,
      },
    });

    if (change.opportunity && quote.opportunityId) {
      await this.audit.log(tx, {
        projectId,
        userId: user.id,
        action: OPPORTUNITIES_AUDIT.STAGE,
        objectType: AUDIT_OBJECTS.OPPORTUNITY,
        objectId: quote.opportunityId,
        metadata: { ...change.opportunity, trigger: action },
      });
    }

    if (change.organization) {
      await this.audit.log(tx, {
        projectId,
        userId: user.id,
        action: ORGANIZATION_AUDIT.SALES_STATUS,
        objectType: AUDIT_OBJECTS.ORGANIZATION,
        objectId: quote.organizationId,
        metadata: { ...change.organization, trigger: action },
      });
    }
  }

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
  /**
   * L'entrée du moteur de prix, assemblée en un seul endroit : cinq routes calculaient le même
   * devis en recopiant la conversion du taux de TVA et le format de la date de démarrage.
   */
  private price(
    grid: PricingGridContent,
    population: number | null,
    settings: Settings,
    startDate: Date,
    config: QuoteConfig,
  ): QuoteResult {
    return this.pricing.computeQuote({
      grid,
      population,
      vatRate: Number(settings.vatRate),
      startDate: formatDateField(startDate),
      config,
    });
  }

  private async loadGrid(
    projectId: string,
    gridId?: string,
  ): Promise<{ id: string; content: PricingGridContent }> {
    const grid = gridId
      ? await this.prisma.pricingGrid.findFirst({
          where: { id: gridId, projectId },
          select: { id: true, content: true },
        })
      : await this.prisma.pricingGrid.findFirst({
          where: { projectId, active: true },
          select: { id: true, content: true },
        });
    if (!grid) {
      throw gridId
        ? apiError.notFound('PRICING_GRID_NOT_FOUND', gridId)
        : apiError.notFound('PRICING_GRID_NO_ACTIVE');
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

  private async visibleOrganizations(
    user: AuthenticatedUser,
    projectId: string,
  ): Promise<Prisma.OrganizationWhereInput> {
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
    const where = buildQuoteWhere(
      projectId,
      {},
      scopeWhere,
      await this.visibleOrganizations(user, projectId),
    );
    const quote = await this.prisma.quote.findFirst({
      where: { ...where, id },
      include: { ...QUOTE_INCLUDE, lines: true },
    });
    if (!quote) throw apiError.notFound('QUOTE_NOT_FOUND', id);
    return quote;
  }

  private async loadVisibleOrganization(
    organizationId: string,
    projectId: string,
    user: AuthenticatedUser,
  ) {
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
    await assertFullOrganizationAccess(
      this.prisma,
      this.scopeService,
      ctx,
      organization,
      organizationId,
    );
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
  private async loadHistory(
    projectId: string,
    quoteId: string,
  ): Promise<QuoteDetailDto['history']> {
    const entries = await this.prisma.auditLog.findMany({
      where: {
        projectId,
        objectType: AUDIT_OBJECTS.QUOTE,
        objectId: quoteId,
        action: { in: [...QUOTE_LIFECYCLE_ACTIONS] },
      },
      orderBy: { createdAt: 'asc' },
      select: { action: true, createdAt: true, userId: true, metadata: true },
    });
    const actors = await loadUsersWithInitials(this.prisma, projectId, [
      ...new Set(entries.map((e) => e.userId).filter((id): id is string => !!id)),
    ]);
    // Le statut atteint est écrit dans les métadonnées de l'entrée : l'historique est exact,
    // là où une correspondance figée action → statut se tromperait sur `submit`.
    const history: QuoteDetailDto['history'] = [];
    for (const entry of entries) {
      const status = (entry.metadata as { status?: QuoteStatus } | null)?.status;
      if (!status) continue;
      history.push({
        status,
        at: entry.createdAt,
        by: entry.userId ? userRef(actors.get(entry.userId), entry.userId) : null,
      });
    }
    return history;
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
      requiresValidation: exceedsDiscountCap(row.maxDiscount, settings.discountCap),
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
      requiresValidation: exceedsDiscountCap(result.maxDiscount, settings.discountCap),
    };
  }

  /**
   * Un devis figé n'a plus de simulation vivante : le récapitulatif est reconstitué depuis ses
   * montants stockés et ses lignes, sans jamais rappeler le moteur.
   */
  private frozenResultDto(
    quote: QuoteAmounts & { status: QuoteStatus },
    lines: ComputedQuoteLine[],
    settings: Settings,
    trainingLabel: string | undefined,
  ): QuoteResultDto {
    const subscription = lines.filter(
      (l) => l.nature === QuoteLineNature.ABONNEMENT || l.nature === QuoteLineNature.OPTION,
    );
    const setup = lines.filter(
      (l) => l.nature === QuoteLineNature.SETUP || l.nature === QuoteLineNature.EXTRA,
    );
    // Les frais se reventilent depuis les lignes figées, avec la règle du moteur : servir des
    // zéros serait plus faux qu'un champ absent — l'écran les afficherait comme des montants.
    const oneShot = splitOneShot(setup, trainingLabel);
    return {
      bracketIndex: NO_BRACKET_INDEX,
      bracketLabel: subscription[0]?.sublabel ?? '',
      subscriptionUnitPrice: subscription[0]?.unitPrice.toNumber() ?? 0,
      subscriptionLines: subscription.map((l) => this.toLineDto(l)),
      setupLines: setup.map((l) => this.toLineDto(l)),
      mrrList: quote.mrrList.toNumber(),
      mrrNet: quote.mrrNet.toNumber(),
      arrList: quote.arrList.toNumber(),
      arrNet: quote.arrNet.toNumber(),
      oneShot: {
        setup: oneShot.setup.toNumber(),
        training: oneShot.training.toNumber(),
        hardware: oneShot.hardware.toNumber(),
        // Le total stocké fait foi : c'est celui qui a été envoyé au client.
        total: quote.oneShotTotal.toNumber(),
      },
      firstYear: {
        subscription: quote.firstYearHt.minus(quote.oneShotTotal).toNumber(),
        totalHt: quote.firstYearHt.toNumber(),
        vat: quote.firstYearVat.toNumber(),
        totalTtc: quote.firstYearTtc.toNumber(),
      },
      multiYear: [],
      maxDiscount: quote.maxDiscount,
      requiresValidation: exceedsDiscountCap(quote.maxDiscount, settings.discountCap),
    };
  }
}
