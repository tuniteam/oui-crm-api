import { Prisma } from '@prisma/client';

/** Horizon de la simulation mois par mois (SPEC-04 §3 règle 7) : 4 ans. */
export const SIMULATION_MONTHS = 48;
export const MULTI_YEAR_YEARS = 4;

/** Arrondi commercial : 2 décimales, HALF_UP, une seule fois par ligne et par agrégat. */
export const MONEY_SCALE = 2;
export const MONEY_ROUNDING = Prisma.Decimal.ROUND_HALF_UP;

export const MONTHS_PER_YEAR = 12;

/** Base d'un pourcentage. Distincte de la borne de remise : plafonner les remises un jour
 *  ne doit pas changer le calcul de la TVA. */
export const PERCENT_BASE = 100;

/** Bornes d'une remise en pourcentage : hors bornes, la valeur est ramenée dedans (§4.7). */
export const DISCOUNT_MIN = 0;
export const DISCOUNT_MAX = 100;

/** Défauts de la remise globale (SPEC-04 §2.1). */
export const DEFAULT_PERCENT_DISCOUNT_MONTHS = 12;
export const DEFAULT_FREE_MONTHS = 2;

/** Suffixe des lignes d'option facturées au-delà du quota compris dans l'abonnement. */
export const EXTRA_QUANTITY_SUFFIX = '(supplémentaire)';

/** Actions du journal (AUDIT_OBJECTS.PRICING_GRID) — US-02-01. */
export const PRICING_AUDIT = {
  GRID_CREATE: 'pricingGrid.create',
  GRID_UPDATE: 'pricingGrid.update',
  GRID_DELETE: 'pricingGrid.delete',
  GRID_ACTIVATE: 'pricingGrid.activate',
} as const;

/** Garde-fous de forme d'une grille enregistrée (US-02-01, SPEC-19 R7). */
export const GRID_MAX_BRACKETS = 20;
export const GRID_MAX_PLANS = 10;
export const GRID_MAX_OPTIONS = 30;
export const GRID_MAX_SETUP_FEES = 20;
export const GRID_MAX_EXTRAS = 30;
export const GRID_LABEL_MAX_LENGTH = 100;

/**
 * SPEC-19 D5 — la ventilation des frais one-shot suit la **nature déclarée** de chaque poste,
 * plus une clé écrite en dur. Un projet nomme ses postes comme il veut, en a plusieurs de
 * formation ou aucun.
 */
export const SETUP_FEE_NATURE = { TRAINING: 'TRAINING', SETUP: 'SETUP' } as const;
export const SETUP_FEE_NATURES = Object.values(SETUP_FEE_NATURE);

/**
 * Les deux attributs d'un poste de frais. Une formule qui porterait l'un de ces noms se
 * confondrait avec eux dans le même objet : le cas est refusé à l'enregistrement.
 */
export const SETUP_FEE_RESERVED_KEYS = ['label', 'nature'] as const;
