import { Prisma } from '@prisma/client';

/** Horizon de la simulation mois par mois (SPEC-04 §3 règle 7) : 4 ans. */
export const SIMULATION_MONTHS = 48;
export const MULTI_YEAR_YEARS = 4;

/** Arrondi commercial : 2 décimales, HALF_UP, une seule fois par ligne et par agrégat. */
export const MONEY_SCALE = 2;
export const MONEY_ROUNDING = Prisma.Decimal.ROUND_HALF_UP;

export const MONTHS_PER_YEAR = 12;

/** Bornes d'une remise en pourcentage : hors bornes, la valeur est ramenée dedans (§4.7). */
export const DISCOUNT_MIN = 0;
export const DISCOUNT_MAX = 100;

/** Défauts de la remise globale (SPEC-04 §2.1). */
export const DEFAULT_PERCENT_DISCOUNT_MONTHS = 12;
export const DEFAULT_FREE_MONTHS = 2;

/** Poste de frais ventilé en « formation » ; les autres vont en « mise en place ». */
export const TRAINING_FEE_KEY = 'training';

/** Suffixe des lignes d'option facturées au-delà du quota compris dans l'abonnement. */
export const EXTRA_QUANTITY_SUFFIX = '(supplémentaire)';
