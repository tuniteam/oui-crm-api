// ============================================
// OUI-CRM - Opportunities utils: pure rules + the single stage writer (US-02-09)
// ============================================

import { OpportunityStageCode, Prisma, PrismaClient } from '@prisma/client';
import { apiError } from '@/common/api-error';
import { MONTHS_PER_YEAR } from '@/pricing/pricing.constants';
import { PricingGridContent } from '@/pricing/pricing.types';
import { money, priceAt, resolveBracketIndex, setupFeePrices, sumMoney } from '@/pricing/pricing.utils';
import { isOpenStage } from './opportunities.constants';

type Db = PrismaClient | Prisma.TransactionClient;

// ---------------------------------------------------------------------------- probabilité

/**
 * Probabilité effective : la pondération saisie l'emporte sur celle de l'étape
 * (SPEC-01 §3.7, SPEC-05 Q4). Les probabilités d'étape viennent des réglages du projet,
 * jamais d'une constante en dur.
 */
export function effectiveProbability(
  stage: OpportunityStageCode,
  probabilityOverride: number | null,
  stageProbabilities: Record<string, number>,
): number {
  if (probabilityOverride !== null && probabilityOverride !== undefined) return probabilityOverride;
  const fromStage = stageProbabilities?.[stage];
  return Number.isFinite(fromStage) ? fromStage : 0;
}

// ---------------------------------------------------------------------------- valorisation

/** Ce que rapporte une opportunité si elle se signe : première année pleine, prix catalogue. */
export type OpportunityValue = { value: Prisma.Decimal; source: 'QUOTE' | 'ESTIMATE' };

/**
 * Valeur d'un devis pour le pipeline : abonnement annuel **catalogue** + frais one-shot.
 *
 * Le prix catalogue, et non le net, pour deux raisons : une remise globale est temporaire
 * (X % pendant N mois) alors que le pipeline mesure un régime annuel, et l'estimation sans
 * devis (SPEC-04 déc. 8) est elle aussi catalogue — les deux doivent être comparables.
 */
export function quoteValue(quote: { arrList: Prisma.Decimal; oneShotTotal: Prisma.Decimal }): Prisma.Decimal {
  return money(quote.arrList.plus(quote.oneShotTotal));
}

/**
 * Estimation sans devis (SPEC-04 déc. 8) : abonnement annuel de la **formule cible** sur la
 * strate de l'organisme + tous les frais de mise en place de cette formule.
 *
 * Sans formule cible, la première formule de la grille sert de repli — la moins chère par
 * convention de construction d'une grille, donc une estimation prudente. Sans population
 * exploitable il n'y a pas de strate, donc pas de montant : 0.
 */
export function estimateValue(
  grid: PricingGridContent | null,
  organization: { population: number | null; targetPlan: string | null },
): Prisma.Decimal {
  if (!grid?.plans?.length) return money(0);
  const bracketIndex = resolveBracketIndex(grid.brackets ?? [], organization.population);
  if (bracketIndex === -1) return money(0);

  const plan = organization.targetPlan && grid.subscription?.[organization.targetPlan] ? organization.targetPlan : grid.plans[0];
  const subscription = priceAt(grid.subscription?.[plan] ?? [], bracketIndex).times(MONTHS_PER_YEAR);
  const setupFees = Object.values(grid.setupFees ?? {}).map((fee) =>
    money(priceAt(setupFeePrices(fee, plan), bracketIndex)),
  );
  return money(subscription.plus(sumMoney(setupFees)));
}

/** La valeur retenue : le devis le plus élevé rattaché, à défaut l'estimation (SPEC-01 §3.7). */
export function resolveOpportunityValue(
  quotes: { arrList: Prisma.Decimal; oneShotTotal: Prisma.Decimal }[],
  grid: PricingGridContent | null,
  organization: { population: number | null; targetPlan: string | null },
): OpportunityValue {
  if (quotes.length) {
    const best = quotes.map(quoteValue).reduce((max, value) => (value.greaterThan(max) ? value : max), money(0));
    return { value: best, source: 'QUOTE' };
  }
  return { value: estimateValue(grid, organization), source: 'ESTIMATE' };
}

/** Total pondéré d'un ensemble : Σ valeur × probabilité (le total d'une colonne du tableau). */
export function weightedTotal(items: { value: Prisma.Decimal; probability: number }[]): Prisma.Decimal {
  return money(
    sumMoney(items.map((item) => money(item.value.times(new Prisma.Decimal(item.probability).dividedBy(100))))),
  );
}

// ---------------------------------------------------------------------------- écriture d'étape

/**
 * **Writer unique de l'étape** (SPEC-14 §2.5). Toute route qui déplace une opportunité passe
 * ici : le changement, la ligne d'historique et la fermeture sont écrits ensemble. La signature
 * d'un devis (phase G) et son refus (phase F) appelleront cette même fonction — deux chemins
 * qui écriraient `stage` séparément divergeraient au premier correctif.
 *
 * Renvoie `null` quand rien ne change : pas de ligne d'historique pour un non-événement.
 */
export async function applyOpportunityStage(
  tx: Db,
  opportunity: { id: string; stage: OpportunityStageCode },
  to: OpportunityStageCode,
  userId: string,
  loss?: { lossReason?: string | null; lossComment?: string | null },
): Promise<{ from: OpportunityStageCode; to: OpportunityStageCode } | null> {
  if (opportunity.stage === to) return null;

  await tx.opportunity.update({
    where: { id: opportunity.id },
    data: {
      stage: to,
      closedAt: isOpenStage(to) ? null : new Date(),
      lossReason: to === OpportunityStageCode.LOST ? (loss?.lossReason ?? null) : null,
      lossComment: to === OpportunityStageCode.LOST ? (loss?.lossComment ?? null) : null,
    },
  });
  await tx.opportunityStage.create({ data: { opportunityId: opportunity.id, stage: to, userId } });
  return { from: opportunity.stage, to };
}

// ---------------------------------------------------------------------------- lecture

export async function getOpportunityOrThrow(
  db: Db,
  id: string,
  projectId: string,
  scopeWhere: Record<string, unknown> = {},
) {
  const opportunity = await db.opportunity.findFirst({ where: { id, projectId, ...scopeWhere } });
  if (!opportunity) throw apiError.notFound('OPPORTUNITY_NOT_FOUND', id);
  return opportunity;
}

/**
 * Filtres de la liste (US-02-09) ; `from`/`to` portent sur la date de clôture prévue.
 *
 * Le périmètre géographique porte sur l'**organisme**, pas sur l'opportunité : l'appelant
 * fournit le fragment déjà fusionné (`mergeVisibilityWhere`), on le niche sous `organization`.
 * Le fragment `OWN` du garde, lui, porte bien sur `ownerId` de l'opportunité.
 */
export function buildOpportunityWhere(
  projectId: string,
  query: { stage?: OpportunityStageCode; stages?: readonly OpportunityStageCode[]; ownerId?: string; organizationId?: string; from?: Date; to?: Date },
  scopeWhere: Record<string, unknown>,
  organizationWhere: Prisma.OrganizationWhereInput,
): Prisma.OpportunityWhereInput {
  const where: Prisma.OpportunityWhereInput = {
    projectId,
    ...scopeWhere,
    ...(query.stage ? { stage: query.stage } : {}),
    ...(!query.stage && query.stages ? { stage: { in: [...query.stages] } } : {}),
    ...(query.ownerId ? { ownerId: query.ownerId } : {}),
    ...(query.organizationId ? { organizationId: query.organizationId } : {}),
    organization: organizationWhere,
  };
  if (query.from || query.to) {
    where.expectedCloseDate = { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) };
  }
  return where;
}
