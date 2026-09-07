import { Prisma, PrismaClient, QuoteLineNature } from '@prisma/client';
import { apiError, withMeta } from '@/common/api-error';
import { formatDateField } from '@/common/utils/date.utils';
import {
  DISCOUNT_MAX,
  DISCOUNT_MIN,
  GRID_LABEL_MAX_LENGTH,
  GRID_MAX_BRACKETS,
  GRID_MAX_EXTRAS,
  GRID_MAX_OPTIONS,
  GRID_MAX_PLANS,
  GRID_MAX_SETUP_FEES,
  MONEY_ROUNDING,
  MONEY_SCALE,
  PERCENT_BASE,
  SETUP_FEE_NATURE,
  SETUP_FEE_NATURES,
  SETUP_FEE_RESERVED_KEYS,
} from './pricing.constants';
import { ComputedQuoteLine, PopulationBracket, PricingGridContent, PricingSetupFee, QuoteConfig, SetupFeeNature } from './pricing.types';

/** Les deux familles d'éléments identifiés par un entier, référencées par `Quote.config`. */
const ITEM_FAMILIES = ['options', 'extras'] as const;

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
 * d'un brouillon, et la relecture d'un devis figé dont les lignes sont en base. Cette seconde
 * lecture n'a que des libellés — les lignes stockées ne portent pas la nature du poste —, d'où
 * l'ensemble de libellés en paramètre plutôt que la grille elle-même.
 */
export function splitOneShot(
  lines: ComputedQuoteLine[],
  trainingLabels: ReadonlySet<string>,
): { setup: Prisma.Decimal; training: Prisma.Decimal; hardware: Prisma.Decimal; total: Prisma.Decimal } {
  const isSetup = (line: ComputedQuoteLine) => line.nature === QuoteLineNature.SETUP;
  const training = sumMoney(lines.filter((l) => isSetup(l) && trainingLabels.has(l.label)).map((l) => l.total));
  const setup = sumMoney(lines.filter((l) => isSetup(l) && !trainingLabels.has(l.label)).map((l) => l.total));
  const hardware = sumMoney(lines.filter((l) => l.nature === QuoteLineNature.EXTRA).map((l) => l.total));
  return { setup, training, hardware, total: money(setup.plus(training).plus(hardware)) };
}

/**
 * Les libellés des postes de **formation** d'une grille (SPEC-19 D5). Une grille peut en porter
 * plusieurs, ou aucun ; c'est leur `nature` qui les désigne, plus le nom de leur clé.
 */
export function trainingFeeLabels(grid: PricingGridContent | null): ReadonlySet<string> {
  const labels = Object.values(grid?.setupFees ?? {})
    .filter((fee) => fee?.nature === SETUP_FEE_NATURE.TRAINING && typeof fee.label === 'string')
    .map((fee) => fee.label);
  return new Set(labels);
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
  const grid = await db.pricingGrid.findFirst({ where: { projectId, active: true }, orderBy: { version: 'desc' }, select: { content: true } });
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
/**
 * **Le garde-fou de filiation** (SPEC-14 D21). Une version préparée à partir d'une grille qui
 * n'est plus active porte des prix périmés : l'activer efface, sans le dire, tout ce qui a été
 * fait entre-temps. Le cas est refusé, avec les deux numéros dans `meta` pour que l'écran puisse
 * l'expliquer sans analyser une phrase.
 *
 * Exempts : une grille écrite de zéro (`basedOnVersion === null`, elle ne dérive de rien) et un
 * projet sans grille active. `force` couvre le retour volontaire à une grille antérieure.
 */
export function isBaseOutdated(basedOnVersion: number | null, activeVersion: number | null): boolean {
  if (basedOnVersion === null || activeVersion === null) return false;
  return basedOnVersion !== activeVersion;
}

/**
 * Le même garde-fou, levé en erreur. La liste des versions a besoin du prédicat sans erreur,
 * pour dire au front ce qui est activable (SPEC-18 §6) : une seule règle, deux usages.
 */
export function assertBaseUpToDate(
  basedOnVersion: number | null,
  activeVersion: number | null,
  force: boolean,
): void {
  if (force || !isBaseOutdated(basedOnVersion, activeVersion)) return;
  throw withMeta(apiError.conflict('PRICING_GRID_BASE_OUTDATED', String(basedOnVersion), String(activeVersion)), {
    activeVersion,
    basedOnVersion,
  });
}

/**
 * SPEC-18 §4 — une grille ne prend pas effet dans le passé, ni avant celle qu'elle remplace.
 * Règle pure : l'appelant fournit le jour de référence et la date de la version active, ce qui
 * la rend testable sans base ni horloge.
 */
export function assertEffectiveDateValid(
  effectiveDate: Date,
  today: Date,
  activeEffectiveDate: Date | null,
): void {
  const floor =
    activeEffectiveDate && activeEffectiveDate.getTime() > today.getTime() ? activeEffectiveDate : today;
  if (effectiveDate.getTime() < floor.getTime()) {
    throw apiError.badRequest('PRICING_GRID_EFFECTIVE_DATE_INVALID', formatDateField(floor));
  }
}

/**
 * SPEC-19 D4 — **le serveur pose les identifiants d'options et d'extras**, le front n'en invente
 * plus. `allocated` est le premier numéro libre du projet : un élément sans `id` prend la suite,
 * un `id` déjà distribué est accepté — c'est ainsi qu'on rend un élément qu'on venait de retirer.
 *
 * L'unicité ne suffisait pas : un `id` libéré par une suppression pouvait être réattribué, et
 * les brouillons qui le portaient basculaient sur la nouvelle ligne — autre libellé, autre prix,
 * aucune trace. Le compteur ne redescend pas, comme le numéro de version (SPEC-18 D6).
 */
export function assignItemIds(content: Record<string, unknown>, allocated: number): Record<string, unknown> {
  const assigned: Record<string, unknown> = { ...content };
  let next = allocated;
  for (const family of ITEM_FAMILIES) {
    const items = content[family];
    // Un contenu mal formé n'est pas corrigé ici : `validateGridContent` le dira mieux.
    if (!Array.isArray(items)) continue;
    assigned[family] = items.map((item) => {
      const raw = (item ?? {}) as { id?: unknown };
      if (raw.id === undefined || raw.id === null) return { ...raw, id: next++ };
      // Un numéro jamais distribué ne désigne rien : le front l'a inventé.
      if (!Number.isInteger(raw.id) || (raw.id as number) < 0 || (raw.id as number) >= allocated) {
        throw apiError.badRequest('PRICING_GRID_UNKNOWN_ITEM_ID', `${family}.id`, String(raw.id));
      }
      return raw;
    });
  }
  return assigned;
}

/**
 * Le compteur qu'impose un contenu injecté hors API — seed, copie de configuration, reprise.
 * Sans lui, un projet recevrait une grille dont les identifiants ne lui ont jamais été
 * distribués, et la première correction les refuserait (SPEC-19 D4).
 */
export function nextItemSeq(content: unknown): number {
  let max = -1;
  for (const family of ITEM_FAMILIES) {
    const items = (content as Record<string, unknown> | null)?.[family];
    if (!Array.isArray(items)) continue;
    for (const item of items) if (Number.isInteger(item?.id)) max = Math.max(max, item.id);
  }
  return max + 1;
}

/**
 * Combien d'identifiants ce contenu réclame. Le service réserve d'abord cette quantité sur le
 * compteur du projet, puis appelle `assignItemIds` avec le premier numéro libre : deux
 * corrections simultanées ne peuvent pas distribuer le même (pattern `DocumentNumberSequence`).
 */
export function countUnidentifiedItems(content: Record<string, unknown>): number {
  let missing = 0;
  for (const family of ITEM_FAMILIES) {
    const items = content[family];
    if (!Array.isArray(items)) continue;
    for (const item of items) if (item?.id === undefined || item?.id === null) missing += 1;
  }
  return missing;
}

/**
 * SPEC-19 D2 — ce qu'un contenu fait disparaître : formules, options et extras qui ne s'y
 * trouvent plus. Un devis brouillon qui référence l'un d'eux retient la grille.
 */
export function removedGridItems(
  before: PricingGridContent,
  after: Partial<PricingGridContent>,
): { plans: string[]; options: number[]; extras: number[] } {
  const gone = <T>(previous: readonly T[] | undefined, current: readonly T[] | undefined): T[] => {
    const kept = new Set(current ?? []);
    return (previous ?? []).filter((value) => !kept.has(value));
  };
  const ids = (items: { id: number }[] | undefined) => (items ?? []).map((item) => item.id);
  return {
    plans: gone(before.plans, after.plans),
    options: gone(ids(before.options), ids(after.options)),
    extras: gone(ids(before.extras), ids(after.extras)),
  };
}

/**
 * Croise ce qu'un contenu fait disparaître avec ce que des brouillons référencent réellement.
 * Règle pure : le service lui passe les devis, elle ne connaît ni Prisma ni transaction.
 */
export function draftsUsingItems(
  drafts: readonly { number: string; config: unknown }[],
  removed: { plans: string[]; options: number[]; extras: number[] },
): { items: string[]; quotes: string[] } {
  const items = new Set<string>();
  const quotes = new Set<string>();
  for (const draft of drafts) {
    const config = draft.config as Partial<QuoteConfig> | null;
    if (!config) continue;
    const hits: string[] = [];
    if (config.plan && removed.plans.includes(config.plan)) hits.push(`plan ${config.plan}`);
    for (const family of ['options', 'extras'] as const) {
      for (const wanted of config[family] ?? []) {
        if (removed[family].includes(wanted.id)) hits.push(`${family === 'options' ? 'option' : 'extra'} ${wanted.id}`);
      }
    }
    if (!hits.length) continue;
    hits.forEach((hit) => items.add(hit));
    quotes.add(draft.number);
  }
  return { items: [...items], quotes: [...quotes] };
}

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
      // Une strate qui recouvre la précédente rendrait la résolution dépendante de l'ordre ;
      // une strate qui laisse un trou rendrait certaines communes impossibles à chiffrer, et le
      // devis échouerait en accusant la fiche (SPEC-19 D1).
      if (previous && previous.max !== null && isPositiveNumber(min)) {
        if (min <= previous.max) issues.push(`brackets[${index}]: overlaps the previous bracket`);
        else if (min > previous.max + 1) issues.push(`brackets[${index}]: leaves a gap after the previous bracket`);
      }
      if (previous && previous.max === null) issues.push(`brackets[${index - 1}]: open-ended bracket must be the last`);
    });
    // Les deux bords : sans eux, une commune de 40 ou de 200 000 habitants sort de la grille.
    const first = brackets[0] as PopulationBracket;
    if (first?.min !== 0) issues.push('brackets[0].min: the first bracket must start at 0');
    const last = brackets[brackets.length - 1] as PopulationBracket;
    if (last?.max !== null) issues.push('brackets: the last bracket must be open-ended');
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
    // `label` et `nature` décrivent le poste de frais lui-même : une formule ainsi nommée s'y
    // confondrait, et son tableau de prix serait lu comme un libellé.
    for (const reserved of SETUP_FEE_RESERVED_KEYS) {
      if (plans.includes(reserved)) issues.push(`plans: "${reserved}" is a reserved name`);
    }
    for (const plan of plans.filter(isFilledString)) {
      checkPriceTable(issues, `subscription.${plan}`, content.subscription?.[plan], bracketCount);
    }
  }

  // Une clé de prix qui ne correspond à aucune formule vivante est une donnée morte : la laisser
  // passer, c'est ressusciter d'anciens prix le jour où la formule revient (SPEC-19 D3).
  const knownPlans = new Set(Array.isArray(plans) ? plans.filter(isFilledString) : []);
  for (const key of Object.keys(content.subscription ?? {})) {
    if (!knownPlans.has(key)) issues.push(`subscription.${key}: no such plan`);
  }

  const options = content.options ?? [];
  if (!Array.isArray(options)) {
    issues.push('options: must be an array');
  } else if (options.length > GRID_MAX_OPTIONS) {
    issues.push(`options: at most ${GRID_MAX_OPTIONS} options`);
  } else {
    options.forEach((option, index) => {
      if (option?.id !== undefined && !Number.isInteger(option.id)) issues.push(`options[${index}].id: integer required`);
      if (!isFilledString(option?.name)) issues.push(`options[${index}].name: required`);
      if (option?.included !== undefined && !isPositiveNumber(option.included)) {
        issues.push(`options[${index}].included: must be a number ≥ 0`);
      }
      checkPriceTable(issues, `options[${index}].unitPrice`, option?.unitPrice, bracketCount);
    });
    const ids = options.map((o) => o?.id).filter((id) => id !== undefined);
    if (new Set(ids).size !== ids.length) issues.push('options: duplicate id');
  }

  const setupFees = content.setupFees ?? {};
  if (typeof setupFees !== 'object' || Array.isArray(setupFees)) {
    issues.push('setupFees: must be an object');
  } else if (Object.keys(setupFees).length > GRID_MAX_SETUP_FEES) {
    issues.push(`setupFees: at most ${GRID_MAX_SETUP_FEES} fees`);
  } else {
    for (const [key, fee] of Object.entries(setupFees)) {
      const post = fee as PricingSetupFee | undefined;
      if (!isFilledString(post?.label)) issues.push(`setupFees.${key}.label: required`);
      // La nature commande la ventilation one-shot du devis : sans elle, le montant tomberait
      // en « mise en place » sans que personne ne l'ait décidé (SPEC-19 D5).
      if (!SETUP_FEE_NATURES.includes(post?.nature as SetupFeeNature)) {
        issues.push(`setupFees.${key}.nature: ${SETUP_FEE_NATURES.join(' or ')} required`);
      }
      for (const plan of (Array.isArray(plans) ? plans : []).filter(isFilledString)) {
        checkPriceTable(issues, `setupFees.${key}.${plan}`, post?.[plan], bracketCount);
      }
      for (const priceKey of Object.keys(post ?? {})) {
        const reserved = (SETUP_FEE_RESERVED_KEYS as readonly string[]).includes(priceKey);
        if (!reserved && !knownPlans.has(priceKey)) issues.push(`setupFees.${key}.${priceKey}: no such plan`);
      }
    }
    // La ventilation d'un devis figé se rejoue sur les libellés des lignes stockées : deux postes
    // de même libellé y seraient indiscernables.
    const labels = Object.values(setupFees).map((fee) => (fee as PricingSetupFee)?.label);
    if (new Set(labels).size !== labels.length) issues.push('setupFees: duplicate label');
  }

  const extras = content.extras ?? [];
  if (!Array.isArray(extras)) {
    issues.push('extras: must be an array');
  } else if (extras.length > GRID_MAX_EXTRAS) {
    issues.push(`extras: at most ${GRID_MAX_EXTRAS} extras`);
  } else {
    extras.forEach((extra, index) => {
      if (extra?.id !== undefined && !Number.isInteger(extra.id)) issues.push(`extras[${index}].id: integer required`);
      if (!isFilledString(extra?.name)) issues.push(`extras[${index}].name: required`);
      if (!isPositiveNumber(extra?.unitPrice)) issues.push(`extras[${index}].unitPrice: must be a number ≥ 0`);
    });
    const ids = extras.map((e) => e?.id).filter((id) => id !== undefined);
    if (new Set(ids).size !== ids.length) issues.push('extras: duplicate id');
  }

  return issues;
}
