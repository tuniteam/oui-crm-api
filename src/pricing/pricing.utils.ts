import { Prisma, PrismaClient, QuoteLineNature } from '@prisma/client';
import {
  DISCOUNT_MAX,
  DISCOUNT_MIN,
  GRID_LABEL_MAX_LENGTH,
  GRID_MAX_BRACKETS,
  GRID_MAX_PLANS,
  MONEY_ROUNDING,
  MONEY_SCALE,
  PERCENT_BASE,
  TRAINING_FEE_KEY,
} from './pricing.constants';
import { ComputedQuoteLine, PopulationBracket, PricingGridContent, PricingSetupFee } from './pricing.types';

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
/**
 * TVA d'un montant HT, au taux du projet. **Une seule implémentation** : le moteur tarifaire et
 * le document imprimé doivent donner le même chiffre au centime, sinon le PDF contredit l'API.
 */
export function vatOf(amountHt: Prisma.Decimal, vatRate: number): Prisma.Decimal {
  return money(amountHt.times(new Prisma.Decimal(vatRate ?? 0).dividedBy(PERCENT_BASE)));
}

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
  return amount.times(new Prisma.Decimal(PERCENT_BASE - clampDiscount(discount)).dividedBy(PERCENT_BASE));
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

/**
 * Ventilation des frais one-shot en formation / mise en place / matériel (SPEC-01 §4.2).
 *
 * La règle vit ici et non dans le moteur, parce que **deux** chemins en ont besoin : le calcul
 * d'un brouillon, et la relecture d'un devis figé dont les lignes sont en base. Le poste de
 * formation se reconnaît à son libellé, celui que la grille lui donne — un projet qui renomme
 * « Formation » garde une ventilation juste.
 */
export function splitOneShot(
  lines: ComputedQuoteLine[],
  trainingLabel: string | undefined,
): { setup: Prisma.Decimal; training: Prisma.Decimal; hardware: Prisma.Decimal; total: Prisma.Decimal } {
  const isSetup = (line: ComputedQuoteLine) => line.nature === QuoteLineNature.SETUP;
  const training = sumMoney(lines.filter((l) => isSetup(l) && l.label === trainingLabel).map((l) => l.total));
  const setup = sumMoney(lines.filter((l) => isSetup(l) && l.label !== trainingLabel).map((l) => l.total));
  const hardware = sumMoney(lines.filter((l) => l.nature === QuoteLineNature.EXTRA).map((l) => l.total));
  return { setup, training, hardware, total: money(setup.plus(training).plus(hardware)) };
}

/** Libellé du poste de formation dans une grille, clé de la ventilation ci-dessus. */
export function trainingFeeLabel(grid: PricingGridContent | null): string | undefined {
  const label = grid?.setupFees?.[TRAINING_FEE_KEY]?.label;
  return typeof label === 'string' ? label : undefined;
}

/**
 * Contenu de la grille **active** du projet, ou `null` s'il n'en a pas. Seule lecture de la
 * grille active du dépôt : les strates d'un organisme, l'estimation d'une opportunité et la
 * simulation d'un devis y passent toutes.
 */
export async function loadActiveGridContent(
  db: Pick<PrismaClient, 'pricingGrid'>,
  projectId: string,
): Promise<PricingGridContent | null> {
  const grid = await db.pricingGrid.findFirst({ where: { projectId, active: true }, select: { content: true } });
  return (grid?.content as unknown as PricingGridContent) ?? null;
}

// ---------------------------------------------------------------------------
// Validation d'une grille enregistrée (US-02-01)
// ---------------------------------------------------------------------------

const isPositiveNumber = (value: unknown): boolean => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isFilledString = (value: unknown): boolean =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= GRID_LABEL_MAX_LENGTH;

/** Tableau de prix : une valeur par strate, ni plus ni moins. */
function checkPriceTable(issues: string[], path: string, prices: unknown, bracketCount: number): void {
  if (!Array.isArray(prices)) {
    issues.push(`${path}: missing price table`);
    return;
  }
  if (prices.length !== bracketCount) {
    issues.push(`${path}: ${prices.length} prices for ${bracketCount} brackets`);
    return;
  }
  if (!prices.every(isPositiveNumber)) issues.push(`${path}: prices must be numbers ≥ 0`);
}

/**
 * Contrôle de forme d'une grille, renvoyé sous forme de liste de constats (`messages.details`).
 *
 * La V8 « calait » silencieusement un tableau de prix trop court sur sa dernière valeur
 * (`normaliserStrates`) : c'est un raccourci de démonstration acceptable dans une maquette,
 * pas dans un outil qui chiffre des contrats. Le serveur refuse la grille et dit **où**.
 */
export function validateGridContent(raw: unknown): string[] {
  const issues: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ['content: must be an object'];
  const content = raw as Partial<PricingGridContent>;

  const brackets = content.brackets;
  if (!Array.isArray(brackets) || brackets.length === 0) {
    issues.push('brackets: at least one bracket is required');
  } else if (brackets.length > GRID_MAX_BRACKETS) {
    issues.push(`brackets: at most ${GRID_MAX_BRACKETS} brackets`);
  } else {
    brackets.forEach((bracket, index) => {
      const { label, min, max } = (bracket ?? {}) as PopulationBracket;
      if (!isFilledString(label)) issues.push(`brackets[${index}].label: required`);
      if (!isPositiveNumber(min)) issues.push(`brackets[${index}].min: must be a number ≥ 0`);
      if (max !== null && !isPositiveNumber(max)) issues.push(`brackets[${index}].max: must be a number ≥ 0 or null`);
      if (isPositiveNumber(min) && isPositiveNumber(max) && (max as number) < min) {
        issues.push(`brackets[${index}]: max is below min`);
      }
      const previous = brackets[index - 1] as PopulationBracket | undefined;
      // Une strate qui recouvre la précédente rendrait la résolution dépendante de l'ordre.
      if (previous && previous.max !== null && isPositiveNumber(min) && min <= previous.max) {
        issues.push(`brackets[${index}]: overlaps the previous bracket`);
      }
      if (previous && previous.max === null) issues.push(`brackets[${index - 1}]: open-ended bracket must be the last`);
    });
  }

  const bracketCount = Array.isArray(brackets) ? brackets.length : 0;
  const plans = content.plans;
  if (!Array.isArray(plans) || plans.length === 0) {
    issues.push('plans: at least one plan is required');
  } else if (plans.length > GRID_MAX_PLANS) {
    issues.push(`plans: at most ${GRID_MAX_PLANS} plans`);
  } else {
    if (!plans.every(isFilledString)) issues.push('plans: names are required');
    if (new Set(plans).size !== plans.length) issues.push('plans: duplicate name');
    for (const plan of plans.filter(isFilledString)) {
      checkPriceTable(issues, `subscription.${plan}`, content.subscription?.[plan], bracketCount);
    }
  }

  const options = content.options ?? [];
  if (!Array.isArray(options)) {
    issues.push('options: must be an array');
  } else {
    options.forEach((option, index) => {
      if (!Number.isInteger(option?.id)) issues.push(`options[${index}].id: integer required`);
      if (!isFilledString(option?.name)) issues.push(`options[${index}].name: required`);
      if (option?.included !== undefined && !isPositiveNumber(option.included)) {
        issues.push(`options[${index}].included: must be a number ≥ 0`);
      }
      checkPriceTable(issues, `options[${index}].unitPrice`, option?.unitPrice, bracketCount);
    });
    const ids = options.map((o) => o?.id);
    if (new Set(ids).size !== ids.length) issues.push('options: duplicate id');
  }

  const setupFees = content.setupFees ?? {};
  if (typeof setupFees !== 'object' || Array.isArray(setupFees)) {
    issues.push('setupFees: must be an object');
  } else {
    for (const [key, fee] of Object.entries(setupFees)) {
      if (!isFilledString((fee as PricingSetupFee)?.label)) issues.push(`setupFees.${key}.label: required`);
      for (const plan of (Array.isArray(plans) ? plans : []).filter(isFilledString)) {
        checkPriceTable(issues, `setupFees.${key}.${plan}`, (fee as PricingSetupFee)?.[plan], bracketCount);
      }
    }
  }

  const extras = content.extras ?? [];
  if (!Array.isArray(extras)) {
    issues.push('extras: must be an array');
  } else {
    extras.forEach((extra, index) => {
      if (!Number.isInteger(extra?.id)) issues.push(`extras[${index}].id: integer required`);
      if (!isFilledString(extra?.name)) issues.push(`extras[${index}].name: required`);
      if (!isPositiveNumber(extra?.unitPrice)) issues.push(`extras[${index}].unitPrice: must be a number ≥ 0`);
    });
    const ids = extras.map((e) => e?.id);
    if (new Set(ids).size !== ids.length) issues.push('extras: duplicate id');
  }

  return issues;
}
