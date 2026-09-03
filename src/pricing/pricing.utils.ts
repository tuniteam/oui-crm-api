import { Prisma } from '@prisma/client';
import { DISCOUNT_MAX, DISCOUNT_MIN, MONEY_ROUNDING, MONEY_SCALE } from './pricing.constants';
import { PopulationBracket, PricingSetupFee } from './pricing.types';

/** Arrondi commercial au centime, HALF_UP (SPEC-04 déc. 3). */
export function money(value: Prisma.Decimal.Value): Prisma.Decimal {
  return new Prisma.Decimal(value).toDecimalPlaces(MONEY_SCALE, MONEY_ROUNDING);
}

export const ZERO = money(0);

/** Somme de montants **déjà arrondis** : un agrégat recoupe toujours ses lignes (déc. 3). */
export function sumMoney(values: Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>((total, value) => total.plus(value), new Prisma.Decimal(0));
}

/** Remise bornée à 0-100 : une saisie hors bornes est ramenée dedans, comme la V8 (§4.7). */
export function clampDiscount(discount: number | null | undefined): number {
  if (!Number.isFinite(discount ?? NaN)) return DISCOUNT_MIN;
  return Math.min(DISCOUNT_MAX, Math.max(DISCOUNT_MIN, discount as number));
}

/** Quantité saisie : négative, absente ou non numérique → 0 (§4.2). Les fractions sont
 *  conservées — une prestation spécifique se vend à l'heure. */
export function safeQty(qty: number | null | undefined): number {
  if (!Number.isFinite(qty ?? NaN)) return 0;
  return Math.max(0, qty as number);
}

/** Prix après remise de ligne, non arrondi : l'arrondi est fait par l'appelant, une seule fois. */
export function applyDiscount(amount: Prisma.Decimal, discount: number): Prisma.Decimal {
  return amount.times(new Prisma.Decimal(DISCOUNT_MAX - clampDiscount(discount)).dividedBy(DISCOUNT_MAX));
}

/**
 * SPEC-04 règle 1 : première strate telle que min ≤ population ≤ max (max null = ouverte).
 * Population absente ou ≤ 0 → aucune strate, donc aucun devis (déc. 5).
 */
export function resolveBracketIndex(brackets: PopulationBracket[], population: number | null): number {
  if (population === null || population <= 0) return -1;
  return brackets.findIndex((b) => b.min <= population && (b.max === null || population <= b.max));
}

/** Libellé de la strate d'une population, `null` si aucune ne correspond. */
export function resolveBracketLabel(brackets: PopulationBracket[], population: number | null): string | null {
  const index = resolveBracketIndex(brackets, population);
  return index === -1 ? null : (brackets[index]?.label ?? null);
}

/**
 * Prix d'un poste de frais pour une formule. Le poste porte son libellé et un tableau par
 * formule (`{ label, ESSENTIEL: [...], CONFORT: [...] }`), d'où la lecture dynamique.
 */
export function setupFeePrices(fee: PricingSetupFee, plan: string): number[] {
  const prices = fee[plan];
  return Array.isArray(prices) ? prices : [];
}

/**
 * Prix d'une strate dans un tableau de prix. Une grille dont un tableau est plus court que
 * le nombre de strates est **refusée** à l'enregistrement (US-02-01) ; ici, la dernière
 * valeur connue prolonge le tableau plutôt que de produire un NaN silencieux.
 */
export function priceAt(prices: number[], bracketIndex: number): Prisma.Decimal {
  if (!prices.length) return new Prisma.Decimal(0);
  const value = prices[Math.min(bracketIndex, prices.length - 1)];
  return new Prisma.Decimal(Number.isFinite(value) ? value : 0);
}
