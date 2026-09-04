// ============================================
// OUI-CRM - Quotes utils: pure rules, single result resolver (US-02-02, US-02-03)
// ============================================

import {
  OpportunityStageCode,
  Prisma,
  PrismaClient,
  QuoteLine,
  QuoteLineNature,
  QuoteStatus,
  QuoteType,
  SalesStatus,
} from '@prisma/client';
import { apiError } from '@/common/api-error';
import { MS_PER_DAY, formatDateField } from '@/common/utils/date.utils';
import { applyOpportunityStage } from '@/opportunities/opportunities.utils';
import { applySalesStatus } from '@/organizations/organizations.utils';
import { PricingService } from '@/pricing/pricing.service';
import { ComputedQuoteLine, PricingGridContent, QuoteConfig, QuoteResult } from '@/pricing/pricing.types';
import { money, sumMoney } from '@/pricing/pricing.utils';
import {
  BUMPS_TO_IN_PROGRESS_FROM,
  DEFAULT_BILLING,
  DEFAULT_CANCELLABLE,
  DEFAULT_START_OFFSET_DAYS,
  DEFAULT_TRIAL_CLAUSE,
  EDITABLE_STATUSES,
  OPPORTUNITY_STAGE_BY_QUOTE_STATUS,
  QUOTE_SENT_STATUSES,
  canTransition,
} from './quotes.constants';

type Db = PrismaClient | Prisma.TransactionClient;

// ---------------------------------------------------------------------------- configuration

/** Réglages du projet dont la configuration d'un devis hérite ses défauts. */
export interface QuoteDefaults {
  vatRate: number;
  quoteValidityDays: number;
  defaultCommitmentMonths: number;
  discountCap: number;
}

/**
 * Complète une configuration reçue du client avec les défauts du projet (SPEC-04 §2.1) :
 * ce qui est stocké dans `Quote.config` est **toujours complet**, pour qu'un recalcul des
 * mois plus tard ne dépende pas de défauts qui auraient bougé entre-temps.
 */
/** Ce que le configurateur envoie : la formule, et ce qu'il a choisi de préciser. */
export type QuoteConfigInput = Partial<QuoteConfig> & { plan: string };

export function normalizeQuoteConfig(config: QuoteConfigInput, defaults: QuoteDefaults): QuoteConfig {
  return {
    plan: config.plan,
    subscriptionDiscount: config.subscriptionDiscount ?? 0,
    options: config.options ?? [],
    setup: config.setup ?? {},
    extras: config.extras ?? [],
    globalDiscount: config.globalDiscount ?? { mode: 'NONE' },
    commitmentMonths: config.commitmentMonths ?? defaults.defaultCommitmentMonths,
    cancellable: config.cancellable ?? DEFAULT_CANCELLABLE,
    trialClause: config.trialClause ?? DEFAULT_TRIAL_CLAUSE,
    billing: config.billing ?? DEFAULT_BILLING,
  };
}

/** Chaque poste de frais retenu porte un booléen `included` et une remise (SPEC-04 §2.1). */
export function assertSetupShape(setup: QuoteConfig['setup'] | undefined): void {
  for (const [key, entry] of Object.entries(setup ?? {})) {
    const value = entry as { included?: unknown; discount?: unknown };
    if (typeof value?.included !== 'boolean') throw apiError.badRequest('QUOTE_SETUP_INVALID', key);
    if (value.discount !== undefined && typeof value.discount !== 'number') {
      throw apiError.badRequest('QUOTE_SETUP_INVALID', key);
    }
  }
}

/**
 * La remise du devis dépasse-t-elle le plafond du projet ? **Une seule** écriture de la règle :
 * elle décide de l'aiguillage à la soumission, et elle est servie à chaque lecture. Deux
 * expressions séparées finissaient par se contredire — une transition répondait `false` sur un
 * devis que la liste annonçait `true`.
 */
export function exceedsDiscountCap(maxDiscount: number, discountCap: number): boolean {
  return maxDiscount > discountCap;
}

/** Jour de démarrage par défaut : date du devis + 30 jours (SPEC-04 déc. 4). */
export function defaultStartDate(issueDate: Date): Date {
  return new Date(issueDate.getTime() + DEFAULT_START_OFFSET_DAYS * MS_PER_DAY);
}

/** Fin de validité : date du devis + la durée réglée sur le projet. */
export function validUntilFrom(issueDate: Date, quoteValidityDays: number): Date {
  return new Date(issueDate.getTime() + quoteValidityDays * MS_PER_DAY);
}

// ---------------------------------------------------------------------------- résultat

/** Montants dénormalisés d'un devis, tels que la liste les trie et les filtre. */
export interface QuoteAmounts {
  mrrList: Prisma.Decimal;
  mrrNet: Prisma.Decimal;
  arrList: Prisma.Decimal;
  arrNet: Prisma.Decimal;
  oneShotTotal: Prisma.Decimal;
  firstYearHt: Prisma.Decimal;
  firstYearVat: Prisma.Decimal;
  firstYearTtc: Prisma.Decimal;
  maxDiscount: number;
}

export function amountsOf(result: QuoteResult): QuoteAmounts {
  return {
    mrrList: result.mrrList,
    mrrNet: result.mrrNet,
    arrList: result.arrList,
    arrNet: result.arrNet,
    oneShotTotal: result.oneShot.total,
    firstYearHt: result.firstYear.totalHt,
    firstYearVat: result.firstYear.vat,
    firstYearTtc: result.firstYear.totalTtc,
    maxDiscount: result.maxDiscount,
  };
}

/** Lignes calculées, prêtes pour `createMany` au moment du figeage (phase F). */
export function linesToCreate(quoteId: string, result: QuoteResult): Prisma.QuoteLineCreateManyInput[] {
  return [...result.subscriptionLines, ...result.setupLines].map((line, order) => ({
    quoteId,
    nature: line.nature,
    order,
    label: line.label,
    sublabel: line.sublabel || null,
    qty: line.qty,
    unitPrice: line.unitPrice,
    discount: line.discount,
    total: line.total,
  }));
}

/** Une ligne figée relue depuis la base, dans la forme d'une ligne calculée. */
function storedLine(line: QuoteLine): ComputedQuoteLine {
  return {
    nature: line.nature,
    label: line.label,
    sublabel: line.sublabel ?? '',
    qty: line.qty,
    unitPrice: line.unitPrice,
    discount: line.discount,
    total: line.total,
  };
}

export type QuoteForResult = {
  status: QuoteStatus;
  config: Prisma.JsonValue | null;
  startDate: Date;
  lines?: QuoteLine[];
} & QuoteAmounts;

/**
 * **La seule décision « recalculer ou relire »** (SPEC-14 §2.5).
 *
 * Tant qu'il est brouillon, un devis est recalculé depuis sa configuration et la grille qu'on
 * lui passe (l'active) : changer la grille change ce qu'il affiche. Dès qu'il est soumis, ses
 * lignes sont figées en base et c'est elles qui font foi — un devis parti chez un client ne
 * bouge plus. Un devis repris du classeur (`config` nulle) tombe naturellement du côté figé.
 */
export function resolveQuoteResult(
  pricing: PricingService,
  quote: QuoteForResult,
  grid: PricingGridContent | null,
  population: number | null,
  vatRate: number,
): { lines: ComputedQuoteLine[]; amounts: QuoteAmounts; result: QuoteResult | null } {
  const recomputable = EDITABLE_STATUSES.includes(quote.status) && quote.config !== null;

  if (recomputable) {
    if (!grid) throw apiError.notFound('PRICING_GRID_NO_ACTIVE');
    const result = pricing.computeQuote({
      grid,
      population,
      vatRate,
      startDate: formatDateField(quote.startDate),
      config: quote.config as unknown as QuoteConfig,
    });
    return {
      lines: [...result.subscriptionLines, ...result.setupLines],
      amounts: amountsOf(result),
      result,
    };
  }

  const lines = (quote.lines ?? []).sort((a, b) => a.order - b.order).map(storedLine);
  return { lines, amounts: quote, result: null };
}

/** Contrôle de cohérence : un total figé doit recouper la somme de ses lignes (SPEC-04 déc. 3). */
export function subscriptionTotalOf(lines: ComputedQuoteLine[]): Prisma.Decimal {
  return sumMoney(
    lines
      .filter((l) => l.nature === QuoteLineNature.ABONNEMENT || l.nature === QuoteLineNature.OPTION)
      .map((l) => money(l.total)),
  );
}

// ---------------------------------------------------------------------------- lecture

export async function getQuoteOrThrow(
  db: Db,
  id: string,
  projectId: string,
  scopeWhere: Record<string, unknown> = {},
) {
  const quote = await db.quote.findFirst({ where: { id, projectId, ...scopeWhere } });
  if (!quote) throw apiError.notFound('QUOTE_NOT_FOUND', id);
  return quote;
}

export function assertEditable(quote: { status: QuoteStatus }): void {
  if (!EDITABLE_STATUSES.includes(quote.status)) throw apiError.conflict('QUOTE_NOT_EDITABLE', quote.status);
}

/** Seul un brouillon se soumet — les gardes d'état vivent ici, avec la table des transitions. */
export function assertSubmittable(quote: { status: QuoteStatus }): void {
  if (quote.status !== QuoteStatus.DRAFT) throw apiError.conflict('QUOTE_ALREADY_SUBMITTED', quote.status);
}

/** Valider ou renvoyer au brouillon ne concerne qu'un devis qui attend une décision. */
export function assertPending(quote: { status: QuoteStatus }): void {
  if (quote.status !== QuoteStatus.PENDING_VALIDATION) throw apiError.conflict('QUOTE_NOT_PENDING', quote.status);
}

/** On ne rouvre qu'un devis expiré, et seulement s'il a une configuration à rejouer. */
export function assertReopenable(quote: { status: QuoteStatus; config: Prisma.JsonValue | null }): void {
  if (quote.status !== QuoteStatus.EXPIRED) throw apiError.conflict('QUOTE_NOT_REOPENABLE', quote.status);
  if (!quote.config) throw apiError.conflict('QUOTE_HAS_NO_CONFIG');
}

export function assertDeletable(quote: { status: QuoteStatus }): void {
  if (!EDITABLE_STATUSES.includes(quote.status)) throw apiError.conflict('QUOTE_NOT_DELETABLE', quote.status);
}

/**
 * Filtres de la liste (US-02-03). Comme pour les opportunités, le périmètre géographique porte
 * sur l'organisme : l'appelant fournit le fragment déjà fusionné, on le niche sous
 * `organization` ; le fragment `OWN` du garde porte sur `ownerId` du devis.
 */
export function buildQuoteWhere(
  projectId: string,
  query: {
    organizationId?: string;
    opportunityId?: string;
    status?: QuoteStatus;
    ownerId?: string;
    from?: Date;
    to?: Date;
  },
  scopeWhere: Record<string, unknown>,
  organizationWhere: Prisma.OrganizationWhereInput,
): Prisma.QuoteWhereInput {
  const where: Prisma.QuoteWhereInput = {
    projectId,
    ...scopeWhere,
    ...(query.organizationId ? { organizationId: query.organizationId } : {}),
    ...(query.opportunityId ? { opportunityId: query.opportunityId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.ownerId ? { ownerId: query.ownerId } : {}),
    organization: organizationWhere,
  };
  if (query.from || query.to) {
    where.issueDate = { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) };
  }
  return where;
}

/**
 * Recalcul des brouillons après activation d'une grille (US-02-01). Appelé par le module
 * tarifaire, à qui on passe le moteur : les devis soumis gardent leur version figée, seuls les
 * brouillons suivent la nouvelle grille — et leurs montants de liste avec eux.
 */
export async function recomputeDraftQuotes(
  tx: Db,
  pricing: PricingService,
  projectId: string,
  grid: PricingGridContent,
  gridId: string,
  vatRate: number,
): Promise<number> {
  const drafts = await tx.quote.findMany({
    where: { projectId, status: QuoteStatus.DRAFT, config: { not: Prisma.DbNull } },
    select: { id: true, status: true, config: true, startDate: true, organization: { select: { population: true } } },
  });

  // Chaque brouillon a ses propres montants : on calcule tout, puis on écrit en parallèle —
  // jamais une écriture dans une boucle séquentielle.
  const writes = drafts.flatMap((draft) => {
    try {
      const computed = pricing.computeQuote({
        grid,
        population: draft.organization.population,
        vatRate,
        startDate: draft.startDate.toISOString().slice(0, 10),
        config: draft.config as unknown as QuoteConfig,
      });
      return [tx.quote.update({ where: { id: draft.id }, data: { ...amountsOf(computed), pricingGridId: gridId } })];
    } catch {
      // Une formule absente de la nouvelle grille, ou une fiche qui a perdu sa population :
      // le brouillon garde ses montants et se signalera à sa prochaine lecture.
      return [];
    }
  });

  await Promise.all(writes);
  return writes.length;
}

// ---------------------------------------------------------------------------- cycle de vie

/** Ce qu'une transition a réellement changé — le service en tire ses entrées de journal. */
export interface QuoteStatusChange {
  quote: { from: QuoteStatus; to: QuoteStatus };
  opportunity: { from: OpportunityStageCode; to: OpportunityStageCode } | null;
  organization: { from: SalesStatus; to: SalesStatus } | null;
}

/** Le devis et son entourage, tels que le writer a besoin de les connaître. */
export interface QuoteWithContext {
  id: string;
  status: QuoteStatus;
  organization: { id: string; salesStatus: SalesStatus };
  opportunity: { id: string; stage: OpportunityStageCode } | null;
}

/**
 * **Writer unique du statut d'un devis** (SPEC-14 §2.5). Toutes les routes d'action passent
 * ici, et la cascade de SPEC-01 §3.8 y est écrite **une seule fois** :
 *
 *   devis envoyé/relancé/en négociation → opportunité `QUOTE_SENT` ou `NEGOTIATING`,
 *   et la fiche encore froide passe « en cours de prospection » ;
 *   devis refusé ou expiré → opportunité perdue, avec le motif que le CRM sait donner ;
 *   devis signé → opportunité gagnée (phase G).
 *
 * Deux chemins qui écriraient `status` séparément divergeraient au premier correctif — c'est
 * la leçon que le L1 a payée deux fois (`applySalesStatus`, `recomputeCompleteness`).
 */
export async function applyQuoteStatus(
  tx: Db,
  projectId: string,
  quote: QuoteWithContext,
  to: QuoteStatus,
  userId: string,
  extra: {
    rejectionReason?: string | null;
    declineReason?: string | null;
    validatedById?: string | null;
    signedAt?: Date | null;
    lossReason?: string | null;
  } = {},
): Promise<QuoteStatusChange> {
  if (!canTransition(quote.status, to)) throw apiError.conflict('QUOTE_INVALID_TRANSITION', quote.status, to);

  const { count } = await tx.quote.updateMany({
    where: { id: quote.id, projectId },
    data: {
      status: to,
      ...(extra.rejectionReason !== undefined ? { rejectionReason: extra.rejectionReason } : {}),
      ...(extra.declineReason !== undefined ? { declineReason: extra.declineReason } : {}),
      ...(extra.validatedById !== undefined
        ? { validatedById: extra.validatedById, validatedAt: extra.validatedById ? new Date() : null }
        : {}),
      ...(extra.signedAt !== undefined ? { signedAt: extra.signedAt } : {}),
    },
  });
  if (count === 0) throw apiError.notFound('QUOTE_NOT_FOUND', quote.id);

  const change: QuoteStatusChange = { quote: { from: quote.status, to }, opportunity: null, organization: null };

  const stage = OPPORTUNITY_STAGE_BY_QUOTE_STATUS[to];
  if (stage && quote.opportunity) {
    change.opportunity = await applyOpportunityStage(tx, projectId, quote.opportunity, stage, userId, {
      lossReason: stage === OpportunityStageCode.LOST ? (extra.lossReason ?? null) : null,
    });
  }

  if (QUOTE_SENT_STATUSES.includes(to) && BUMPS_TO_IN_PROGRESS_FROM.includes(quote.organization.salesStatus)) {
    change.organization = await applySalesStatus(tx, projectId, quote.organization, SalesStatus.IN_PROGRESS);
  }

  return change;
}

/**
 * Copie d'un devis expiré en nouveau brouillon (US-02-06). Un devis expiré ne ressuscite pas :
 * il en naît un autre, avec **son propre numéro**, pour que l'historique commercial garde la
 * trace des deux tentatives.
 */
export function reopenData(
  quote: {
    projectId: string;
    organizationId: string;
    opportunityId: string | null;
    type: QuoteType;
    config: Prisma.JsonValue | null;
    startDate: Date;
    id: string;
  },
  /** La grille qui a servi à calculer les montants ci-dessous — jamais celle du devis expiré,
   *  sans quoi le nouveau brouillon citerait une version qui n'est pas la sienne. */
  pricingGridId: string,
  number: string,
  ownerId: string,
  issueDate: Date,
  validUntil: Date,
  amounts: QuoteAmounts,
): Prisma.QuoteCreateManyInput {
  return {
    projectId: quote.projectId,
    organizationId: quote.organizationId,
    opportunityId: quote.opportunityId,
    pricingGridId,
    number,
    type: quote.type,
    ownerId,
    issueDate,
    validUntil,
    startDate: quote.startDate,
    config: quote.config as Prisma.InputJsonValue,
    sourceQuoteId: quote.id,
    ...amounts,
  };
}
