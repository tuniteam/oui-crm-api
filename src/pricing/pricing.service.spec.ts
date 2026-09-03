import { Prisma } from '@prisma/client';
import { PERISCOLIA_PRICING_GRID_V1 } from '../../prisma/seed-data/periscolia.pricing-grid';
import { PricingService } from './pricing.service';
import { GlobalDiscount, PricingGridContent, QuoteConfig, QuoteInput } from './pricing.types';

/**
 * Matrice de recette du moteur tarifaire — SPEC-04 §4, cas par cas.
 *
 * Deux jeux de grille, et c'est voulu :
 *  - `PERISCOLIA_PRICING_GRID_V1`, la grille **réellement seedée** (SPEC-01 §4.1) : elle porte
 *    les strates, les options et les frais, donc les cas métier et la non-régression V8. Le
 *    test casse si quelqu'un touche à la grille de démonstration — c'est le but ;
 *  - `roundGrid`, une grille synthétique à 100,00 € : SPEC-04 §4.3 demande explicitement des
 *    montants ronds pour rendre lisibles les cas de remise globale et de simulation.
 */

const service = new PricingService();
const grid = PERISCOLIA_PRICING_GRID_V1 as unknown as PricingGridContent;

/** Grille synthétique : une strate, une formule, 100,00 €/mois, aucun frais. */
const roundGrid: PricingGridContent = {
  brackets: [{ label: 'Tous', min: 0, max: null }],
  plans: ['TEST'],
  subscription: { TEST: [100] },
  options: [],
  setupFees: {},
  extras: [],
};

/** Configuration par défaut de la V8 : options au quota inclus, 3 postes de frais retenus. */
function config(overrides: Partial<QuoteConfig> = {}): QuoteConfig {
  return {
    plan: 'CONFORT',
    subscriptionDiscount: 0,
    options: (grid.options ?? []).map((o) => ({ id: o.id, qty: o.included ?? 0, discount: 0 })),
    setup: { deployment: { included: true, discount: 0 }, configuration: { included: true, discount: 0 }, training: { included: true, discount: 0 } },
    extras: [],
    globalDiscount: { mode: 'NONE' },
    commitmentMonths: 36,
    cancellable: true,
    trialClause: false,
    billing: 'MONTHLY',
    ...overrides,
  };
}

function compute(overrides: Partial<QuoteInput> = {}, configOverrides: Partial<QuoteConfig> = {}) {
  return service.computeQuote({
    grid,
    population: 2600,
    vatRate: 20,
    startDate: '2027-01-01',
    ...overrides,
    config: config({ ...configOverrides }),
  });
}

/** Devis sur la grille ronde : mrrList = 100,00 quel que soit le cas. */
function computeRound(globalDiscount: GlobalDiscount, startDate = '2027-01-01') {
  return service.computeQuote({
    grid: roundGrid,
    population: 1000,
    vatRate: 20,
    startDate,
    config: config({ plan: 'TEST', options: [], setup: {}, globalDiscount }),
  });
}

const eur = (amount: Prisma.Decimal) => amount.toFixed(2);
const eurs = (amounts: Prisma.Decimal[]) => amounts.map(eur);

// ---------------------------------------------------------------------------
// §4.1 — strates et formules (18 cas)
// ---------------------------------------------------------------------------

describe('pricing — §4.1 strates et formules', () => {
  const cases: [string, number, number, string, string][] = [
    // plan, population (borne basse de la strate), index attendu, mrrList, oneShot.total
    ['ESSENTIEL', 1, 0, '19.90', '1125.00'],
    ['ESSENTIEL', 501, 1, '24.90', '1125.00'],
    ['ESSENTIEL', 1001, 2, '39.90', '1625.00'],
    ['ESSENTIEL', 2501, 3, '49.90', '2000.00'],
    ['ESSENTIEL', 5000, 4, '79.90', '2500.00'],
    ['ESSENTIEL', 10001, 5, '129.00', '2500.00'],
    ['CONFORT', 1, 0, '24.90', '1875.00'],
    ['CONFORT', 501, 1, '39.90', '1875.00'],
    ['CONFORT', 1001, 2, '59.90', '2125.00'],
    ['CONFORT', 2501, 3, '79.90', '2750.00'],
    ['CONFORT', 5000, 4, '129.90', '3625.00'],
    ['CONFORT', 10001, 5, '199.00', '3625.00'],
    ['PREMIUM', 1, 0, '29.90', '1875.00'],
    ['PREMIUM', 501, 1, '54.90', '1875.00'],
    ['PREMIUM', 1001, 2, '99.00', '2125.00'],
    ['PREMIUM', 2501, 3, '138.90', '2750.00'],
    ['PREMIUM', 5000, 4, '204.90', '3625.00'],
    ['PREMIUM', 10001, 5, '289.50', '3625.00'],
  ];

  it.each(cases)('%s / population %i → strate %i, MRR %s, frais %s', (plan, population, index, mrr, oneShot) => {
    const result = compute({ population }, { plan });
    expect(result.bracketIndex).toBe(index);
    expect(eur(result.mrrList)).toBe(mrr);
    expect(eur(result.oneShot.total)).toBe(oneShot);
  });

  it('places the bracket bounds on the right side (500/501, 10 000/10 001)', () => {
    expect(compute({ population: 500 }).bracketIndex).toBe(0);
    expect(compute({ population: 501 }).bracketIndex).toBe(1);
    expect(compute({ population: 10000 }).bracketIndex).toBe(4);
    expect(compute({ population: 10001 }).bracketIndex).toBe(5);
  });

  it('serves the bracket label of the grid, not a recomputed one', () => {
    expect(compute({ population: 2600 }).bracketLabel).toBe('2 501 – 4 999 hab.');
  });

  it('splits the one-shot fees into setup, training and hardware', () => {
    const result = compute({ population: 2600 }, { plan: 'CONFORT' });
    expect(eur(result.oneShot.setup)).toBe('1500.00'); // déploiement 500 + paramétrage 1 000
    expect(eur(result.oneShot.training)).toBe('1250.00');
    expect(eur(result.oneShot.hardware)).toBe('0.00');
  });

  it('drops a fee post that is not retained', () => {
    const result = compute(
      { population: 2600 },
      { setup: { deployment: { included: false, discount: 0 }, configuration: { included: true, discount: 0 }, training: { included: true, discount: 0 } } },
    );
    expect(eur(result.oneShot.total)).toBe('2250.00'); // 1 000 + 1 250, sans le déploiement
    expect(result.setupLines.map((l) => l.label)).toEqual(['Paramétrage', 'Formation']);
  });
});

// ---------------------------------------------------------------------------
// §4.2 — options et quotas
// ---------------------------------------------------------------------------

describe('pricing — §4.2 options et quotas', () => {
  const withOption = (id: number, qty: number, discount = 0) =>
    config().options.map((o) => (o.id === id ? { ...o, qty, discount } : o));

  it('bills nothing while the included quota is not exceeded', () => {
    const result = compute({ population: 2600 });
    expect(result.subscriptionLines).toHaveLength(1);
    expect(result.subscriptionLines[0].nature).toBe('ABONNEMENT');
  });

  it('bills only the quantity above the quota, and says so in the label', () => {
    const result = compute({ population: 1200 }, { plan: 'CONFORT', options: withOption(1, 3) });
    const option = result.subscriptionLines[1];
    expect(option.label).toBe('Profil Gestionnaire (supplémentaire)');
    expect(eur(option.qty)).toBe('2.00');
    expect(eur(option.unitPrice)).toBe('10.00');
    expect(eur(option.total)).toBe('20.00');
    expect(eur(result.mrrList)).toBe('79.90'); // 59,90 + 20,00
  });

  it('bills an option without quota from the first unit', () => {
    const result = compute({ population: 2600 }, { options: withOption(5, 1) });
    expect(result.subscriptionLines[1].label).toBe('Interface PayFiP');
    expect(eur(result.subscriptionLines[1].total)).toBe('5.00');
  });

  it('applies a line discount and reports it in maxDiscount', () => {
    const result = compute({ population: 12000 }, { options: withOption(0, 1, 50) });
    expect(eur(result.subscriptionLines[1].total)).toBe('50.00'); // 100 × 50 %
    expect(result.maxDiscount).toBeGreaterThanOrEqual(50);
  });

  it('treats a negative or non-numeric quantity as zero', () => {
    expect(compute({ population: 2600 }, { options: withOption(5, -1) }).subscriptionLines).toHaveLength(1);
    expect(
      compute({ population: 2600 }, { options: withOption(5, Number.NaN) }).subscriptionLines,
    ).toHaveLength(1);
  });

  it('ignores an option that is not in the grid', () => {
    const result = compute({ population: 2600 }, { options: [{ id: 99, qty: 5, discount: 0 }] });
    expect(result.subscriptionLines).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// §4.3 — remise globale et monthly(m)
// ---------------------------------------------------------------------------

describe('pricing — §4.3 remise globale', () => {
  const cases: [string, GlobalDiscount, string, string, string, string][] = [
    // libellé, remise, monthly(0), monthly(11), monthly(12), mrrNet
    ['NONE', { mode: 'NONE' }, '100.00', '100.00', '100.00', '100.00'],
    ['PERCENT 20 % / 12 mois', { mode: 'PERCENT', percent: 20, months: 12 }, '80.00', '80.00', '100.00', '80.00'],
    ['PERCENT 100 % / 6 mois', { mode: 'PERCENT', percent: 100, months: 6 }, '0.00', '100.00', '100.00', '0.00'],
    ['PERCENT 10 % / 60 mois', { mode: 'PERCENT', percent: 10, months: 60 }, '90.00', '90.00', '90.00', '90.00'],
    ['FREE_MONTHS 2', { mode: 'FREE_MONTHS', months: 2 }, '0.00', '100.00', '100.00', '100.00'],
    ['FREE_MONTHS 60', { mode: 'FREE_MONTHS', months: 60 }, '0.00', '0.00', '0.00', '100.00'],
  ];

  it.each(cases)('%s', (_label, discount, m0, m11, m12, mrrNet) => {
    const result = computeRound(discount);
    expect(eur(result.monthly(0))).toBe(m0);
    expect(eur(result.monthly(11))).toBe(m11);
    expect(eur(result.monthly(12))).toBe(m12);
    expect(eur(result.mrrNet)).toBe(mrrNet);
  });

  it('keeps mrrList untouched by the global discount, and nets the ARR', () => {
    const result = computeRound({ mode: 'PERCENT', percent: 20, months: 12 });
    expect(eur(result.mrrList)).toBe('100.00');
    expect(eur(result.arrList)).toBe('1200.00');
    expect(eur(result.arrNet)).toBe('960.00');
  });

  it('nets the real CONFORT price of the 5 000-10 000 bracket', () => {
    const result = compute({ population: 6000 }, { globalDiscount: { mode: 'PERCENT', percent: 20, months: 12 } });
    expect(eur(result.mrrList)).toBe('129.90');
    expect(eur(result.mrrNet)).toBe('103.92');
  });
});

// ---------------------------------------------------------------------------
// §4.4 — simulation pluriannuelle
// ---------------------------------------------------------------------------

describe('pricing — §4.4 simulation pluriannuelle', () => {
  it('bills 12 full months a year when the contract starts in January', () => {
    const result = computeRound({ mode: 'NONE' }, '2027-01-01');
    expect(result.multiYear.years).toEqual([2027, 2028, 2029, 2030]);
    expect(result.multiYear.months).toEqual([12, 12, 12, 12]);
    expect(eurs(result.multiYear.subscription)).toEqual(['1200.00', '1200.00', '1200.00', '1200.00']);
  });

  it('makes the first calendar year partial when the contract starts in September', () => {
    const result = computeRound({ mode: 'NONE' }, '2026-09-15');
    expect(result.multiYear.months).toEqual([4, 12, 12, 12]);
    expect(eurs(result.multiYear.subscription)).toEqual(['400.00', '1200.00', '1200.00', '1200.00']);
  });

  it('counts the starting month in full, even on December 31st (décision 6)', () => {
    const result = computeRound({ mode: 'NONE' }, '2026-12-31');
    expect(result.multiYear.months).toEqual([1, 12, 12, 12]);
    expect(eurs(result.multiYear.subscription)).toEqual(['100.00', '1200.00', '1200.00', '1200.00']);
  });

  it('spreads a promotion straddling two calendar years', () => {
    const result = computeRound({ mode: 'PERCENT', percent: 20, months: 12 }, '2026-09-01');
    // année 0 : 4 mois à 80 ; année 1 : 8 mois à 80 + 4 mois à 100
    expect(eurs(result.multiYear.subscription)).toEqual(['320.00', '1040.00', '1200.00', '1200.00']);
  });

  it('charges the one-shot fees to the first year only', () => {
    const result = compute({ population: 2600, startDate: '2027-01-01' });
    expect(eurs(result.multiYear.setup)).toEqual(['1500.00', '0.00', '0.00', '0.00']);
    expect(eurs(result.multiYear.training)).toEqual(['1250.00', '0.00', '0.00', '0.00']);
    expect(eurs(result.multiYear.hardware)).toEqual(['0.00', '0.00', '0.00', '0.00']);
  });

  it('adds the one-shot fees to the first year total only', () => {
    const result = compute({ population: 2600, startDate: '2027-01-01' });
    // 12 × 79,90 = 958,80 + 2 750 de frais
    expect(eurs(result.multiYear.totalHt)).toEqual(['3708.80', '958.80', '958.80', '958.80']);
    expect(eur(result.firstYear.subscription)).toBe('958.80');
    expect(eur(result.firstYear.totalHt)).toBe('3708.80');
  });

  it('keeps the first year of the multi-year table equal to firstYear', () => {
    const result = compute({ population: 6000, startDate: '2026-09-15' });
    expect(eur(result.multiYear.totalHt[0])).toBe(eur(result.firstYear.totalHt));
    expect(eur(result.multiYear.totalTtc[0])).toBe(eur(result.firstYear.totalTtc));
  });
});

// ---------------------------------------------------------------------------
// §4.5 — maxDiscount (décision 1)
// ---------------------------------------------------------------------------

describe('pricing — §4.5 maxDiscount', () => {
  it('is zero without any discount', () => {
    expect(compute({ population: 2600 }).maxDiscount).toBe(0);
  });

  it('takes the subscription discount', () => {
    expect(compute({ population: 2600 }, { subscriptionDiscount: 15 }).maxDiscount).toBe(15);
  });

  it('takes the strongest between a global percentage and a line discount', () => {
    const options = config().options.map((o) => (o.id === 5 ? { ...o, qty: 1, discount: 10 } : o));
    const result = compute(
      { population: 2600 },
      { options, globalDiscount: { mode: 'PERCENT', percent: 25, months: 12 } },
    );
    expect(result.maxDiscount).toBe(25);
  });

  it('counts a discount carried by an extra alone — the V8 returned 0 here (décision 1)', () => {
    const result = compute({ population: 2600 }, { extras: [{ id: 0, qty: 1, discount: 40 }] });
    expect(result.maxDiscount).toBe(40);
  });

  it('counts a fee post discounted to the full', () => {
    const result = compute(
      { population: 2600 },
      { setup: { deployment: { included: true, discount: 0 }, configuration: { included: true, discount: 0 }, training: { included: true, discount: 100 } } },
    );
    expect(result.maxDiscount).toBe(100);
    expect(eur(result.oneShot.training)).toBe('0.00');
  });

  it('clamps a discount outside 0-100 instead of inverting the amount', () => {
    expect(compute({ population: 2600 }, { subscriptionDiscount: 150 }).maxDiscount).toBe(100);
    expect(compute({ population: 2600 }, { subscriptionDiscount: -20 }).maxDiscount).toBe(0);
    expect(eur(compute({ population: 2600 }, { subscriptionDiscount: -20 }).mrrList)).toBe('79.90');
  });
});

// ---------------------------------------------------------------------------
// §4.6 — arrondis (décision 3)
// ---------------------------------------------------------------------------

describe('pricing — §4.6 arrondis', () => {
  it('keeps the ARR to the cent instead of the euro (238,80, pas 239)', () => {
    const result = compute({ population: 200 }, { plan: 'ESSENTIEL' });
    expect(eur(result.mrrList)).toBe('19.90');
    expect(eur(result.arrList)).toBe('238.80');
  });

  it('rounds a line HALF_UP and sums the rounded lines', () => {
    const result = compute({ population: 2600 }, { plan: 'PREMIUM', subscriptionDiscount: 33 });
    // 138,90 × 0,67 = 93,063 → 93,06
    expect(eur(result.subscriptionLines[0].total)).toBe('93.06');
    expect(eur(result.mrrList)).toBe('93.06');
    expect(eur(result.arrList)).toBe('1116.72'); // 12 × 93,06, la somme des lignes arrondies
  });

  it('computes the VAT on the rounded first-year total', () => {
    const result = compute({ population: 2600, startDate: '2027-01-01' }, { plan: 'PREMIUM', subscriptionDiscount: 33 });
    expect(eur(result.firstYear.totalHt)).toBe('3866.72'); // 1 116,72 + 2 750
    expect(eur(result.firstYear.vat)).toBe('773.34');
    expect(eur(result.firstYear.totalTtc)).toBe('4640.06');
  });
});

// ---------------------------------------------------------------------------
// §4.7 — erreurs
// ---------------------------------------------------------------------------

describe('pricing — §4.7 erreurs', () => {
  it.each([[0], [-10], [null]])('refuses to quote without a usable population (%s)', (population) => {
    expect(() => compute({ population })).toThrow(/population/i);
  });

  it('refuses a plan the grid does not carry', () => {
    expect(() => compute({ population: 2600 }, { plan: 'GOLD' })).toThrow(/GOLD/);
  });

  it('refuses a population above every bracket when the last one is closed', () => {
    const closedGrid: PricingGridContent = {
      ...roundGrid,
      brackets: [{ label: '0 – 500 hab.', min: 0, max: 500 }],
    };
    expect(() =>
      service.computeQuote({
        grid: closedGrid,
        population: 900,
        vatRate: 20,
        startDate: '2027-01-01',
        config: config({ plan: 'TEST', options: [], setup: {} }),
      }),
    ).toThrow(/population/i);
  });
});

// ---------------------------------------------------------------------------
// §4.8 — non-régression sur les six devis signés de la V8
// ---------------------------------------------------------------------------

describe('pricing — §4.8 non-régression V8', () => {
  const options = (mutations: Record<number, { qty: number; discount?: number }>) =>
    config().options.map((o) => ({ ...o, ...(mutations[o.id] ?? {}) }));

  it('Joigny — PREMIUM 9 820 hab., comptable + PayFiP + 3 gestionnaires', () => {
    const result = compute(
      { population: 9820 },
      { plan: 'PREMIUM', options: options({ 0: { qty: 1 }, 5: { qty: 1 }, 1: { qty: 3 } }) },
    );
    expect(eur(result.mrrList)).toBe('399.70'); // 204,90 + 30 + 159,80 + 5
    expect(eur(result.arrList)).toBe('4796.40');
    expect(eur(result.oneShot.total)).toBe('3625.00');
    expect(result.maxDiscount).toBe(0);
  });

  it('Fécamp — PREMIUM 18 490 hab., promo 20 % / 12 mois et 4 tablettes', () => {
    const result = compute(
      { population: 18490 },
      {
        plan: 'PREMIUM',
        options: options({ 0: { qty: 1 }, 5: { qty: 1 } }),
        extras: [{ id: 0, qty: 4, discount: 0 }],
        globalDiscount: { mode: 'PERCENT', percent: 20, months: 12 },
      },
    );
    expect(eur(result.mrrList)).toBe('394.50'); // 289,50 + 100 + 5
    expect(eur(result.mrrNet)).toBe('315.60');
    expect(eur(result.oneShot.hardware)).toBe('2000.00');
    expect(eur(result.oneShot.total)).toBe('5625.00');
    expect(result.maxDiscount).toBe(20);
  });

  it('Montlouis-sur-Loire — CONFORT 11 120 hab., PayFiP', () => {
    const result = compute({ population: 11120 }, { options: options({ 5: { qty: 1 } }) });
    expect(eur(result.mrrList)).toBe('204.00'); // 199 + 5
    expect(eur(result.oneShot.total)).toBe('3625.00');
  });

  it('Colleville-Montgomery — CONFORT 2 580 hab., formation remisée de 25 %', () => {
    const result = compute(
      { population: 2580 },
      { setup: { deployment: { included: true, discount: 0 }, configuration: { included: true, discount: 0 }, training: { included: true, discount: 25 } } },
    );
    expect(eur(result.mrrList)).toBe('79.90');
    expect(eur(result.oneShot.training)).toBe('937.50'); // 1 250 × 75 %
    expect(eur(result.oneShot.total)).toBe('2437.50');
    expect(result.maxDiscount).toBe(25);
  });

  it('SIVOS du Val d’Orne — CONFORT 4 250 hab., promo 30 % / 6 mois et 2 tablettes', () => {
    const result = compute(
      { population: 4250 },
      { extras: [{ id: 0, qty: 2, discount: 0 }], globalDiscount: { mode: 'PERCENT', percent: 30, months: 6 } },
    );
    expect(eur(result.mrrList)).toBe('79.90');
    expect(eur(result.mrrNet)).toBe('55.93');
    expect(eur(result.arrNet)).toBe('671.16');
    expect(eur(result.oneShot.total)).toBe('3750.00'); // 2 750 + 1 000 de tablettes
    expect(result.maxDiscount).toBe(30);
  });

  it('Ploërmel — CONFORT 9 890 hab., PayFiP et 2 profils Élus', () => {
    const result = compute({ population: 9890 }, { options: options({ 5: { qty: 1 }, 3: { qty: 2 } }) });
    expect(eur(result.mrrList)).toBe('154.90'); // 129,90 + 5 + 20
    expect(eur(result.arrList)).toBe('1858.80');
    expect(eur(result.oneShot.total)).toBe('3625.00');
  });

  it('diverges from the V8 exactly where SPEC-04 says so: no silent fallback to bracket 0', () => {
    // La V8 (`strateIndex`: `i<0 ? 0 : i`) chiffrait une commune sans population sur la
    // strate la plus basse. Décision 5 : le devis est refusé.
    expect(() => compute({ population: null })).toThrow();
  });
});
