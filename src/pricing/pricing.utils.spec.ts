import { Prisma, QuoteLineNature } from '@prisma/client';
import { PERISCOLIA_PRICING_GRID_V1 } from './periscolia-grid.constants';
import { GRID_MAX_EXTRAS, GRID_MAX_OPTIONS, SETUP_FEE_NATURE } from './pricing.constants';
import { PopulationBracket } from './pricing.types';
import { applyDiscount, assertBaseUpToDate, assertEffectiveDateValid, clampDiscount, money, priceAt, resolveBracketIndex, resolveBracketLabel, safeQty, assignItemIds, countUnidentifiedItems, draftsUsingItems, removedGridItems, setupFeePrices, splitOneShot, sumMoney, trainingFeeLabels, validateGridContent } from './pricing.utils';

/** Règles pures du moteur — SPEC-04 §3 règle 1 et §4.7. */

const brackets: PopulationBracket[] = [
  { label: '0 – 500 hab.', min: 0, max: 500 },
  { label: '501 – 1 000 hab.', min: 501, max: 1000 },
  { label: 'Plus de 10 000 hab.', min: 10001, max: null },
];

describe('pricing.utils — strates', () => {
  it('picks the first bracket whose bounds contain the population (inclusive)', () => {
    expect(resolveBracketLabel(brackets, 500)).toBe('0 – 500 hab.');
    expect(resolveBracketLabel(brackets, 501)).toBe('501 – 1 000 hab.');
    expect(resolveBracketLabel(brackets, 105512)).toBe('Plus de 10 000 hab.');
    expect(resolveBracketIndex(brackets, 105512)).toBe(2);
  });

  it('no population, zero, a gap, or no active grid → no bracket (the quote is blocked)', () => {
    expect(resolveBracketLabel(brackets, null)).toBeNull();
    expect(resolveBracketLabel(brackets, 0)).toBeNull();
    expect(resolveBracketLabel(brackets, 5000)).toBeNull(); // trou entre 1 000 et 10 001
    expect(resolveBracketLabel([], 1200)).toBeNull();
    expect(resolveBracketIndex(brackets, 5000)).toBe(-1);
  });
});

describe('pricing.utils — bornes de saisie', () => {
  it('clamps a discount into 0-100 (§4.7)', () => {
    expect(clampDiscount(150)).toBe(100);
    expect(clampDiscount(-20)).toBe(0);
    expect(clampDiscount(Number.NaN)).toBe(0);
    expect(clampDiscount(undefined)).toBe(0);
    expect(clampDiscount(33)).toBe(33);
  });

  it('treats a negative or non-numeric quantity as zero, but keeps fractions', () => {
    expect(safeQty(-3)).toBe(0);
    expect(safeQty(Number.NaN)).toBe(0);
    expect(safeQty(null)).toBe(0);
    expect(safeQty(2.5)).toBe(2.5); // une prestation spécifique se vend à l'heure
  });
});

describe('pricing.utils — montants', () => {
  it('rounds HALF_UP to the cent', () => {
    expect(money('93.063').toFixed(2)).toBe('93.06');
    expect(money('93.065').toFixed(2)).toBe('93.07');
    expect(money('0.005').toFixed(2)).toBe('0.01');
  });

  it('sums already-rounded amounts so an aggregate matches its lines', () => {
    expect(sumMoney([money('93.06'), money('5.00'), money('20.00')]).toFixed(2)).toBe('118.06');
    expect(sumMoney([]).toFixed(2)).toBe('0.00');
  });

  it('applies a line discount without rounding on the way', () => {
    expect(applyDiscount(new Prisma.Decimal('138.90'), 33).toString()).toBe('93.063');
    expect(applyDiscount(new Prisma.Decimal('100'), 0).toFixed(2)).toBe('100.00');
    expect(applyDiscount(new Prisma.Decimal('100'), 100).toFixed(2)).toBe('0.00');
  });
});

describe('pricing.utils — lecture de la grille', () => {
  it('reads the price of a bracket', () => {
    expect(priceAt([19.9, 24.9, 39.9], 1).toFixed(2)).toBe('24.90');
  });

  it('extends a price table that is shorter than the brackets with its last value', () => {
    // Une grille incohérente est refusée à l'enregistrement (US-02-01) ; ici on ne produit
    // jamais un NaN silencieux.
    expect(priceAt([19.9, 24.9], 5).toFixed(2)).toBe('24.90');
    expect(priceAt([], 2).toFixed(2)).toBe('0.00');
  });

  it('names the training posts by their nature, whatever their key (SPEC-19 D5)', () => {
    const grid = JSON.parse(JSON.stringify(PERISCOLIA_PRICING_GRID_V1));
    grid.setupFees.formation = grid.setupFees.training;
    delete grid.setupFees.training;
    expect([...trainingFeeLabels(grid)]).toEqual(['Formation']);

    grid.setupFees.formation.nature = SETUP_FEE_NATURE.SETUP;
    expect([...trainingFeeLabels(grid)]).toEqual([]);
  });

  it('ventilates the one-shot fees on those labels', () => {
    const line = (label: string, nature: QuoteLineNature, total: string) =>
      ({ nature, label, sublabel: '', qty: money(1), unitPrice: money(total), discount: 0, total: money(total) });
    const lines = [
      line('Formation', QuoteLineNature.SETUP, '750'),
      line('Déploiement', QuoteLineNature.SETUP, '375'),
      line('Tablette', QuoteLineNature.EXTRA, '500'),
    ];
    const split = splitOneShot(lines, new Set(['Formation']));
    expect(split.training.toFixed(2)).toBe('750.00');
    expect(split.setup.toFixed(2)).toBe('375.00');
    expect(split.hardware.toFixed(2)).toBe('500.00');
    expect(split.total.toFixed(2)).toBe('1625.00');
  });

  it('reads the price table of a fee post by plan, and tolerates an unknown plan', () => {
    const fee = { label: 'Formation', nature: SETUP_FEE_NATURE.TRAINING, CONFORT: [750, 750], PREMIUM: [900, 900] };
    expect(setupFeePrices(fee, 'CONFORT')).toEqual([750, 750]);
    expect(setupFeePrices(fee, 'GOLD')).toEqual([]);
    expect(setupFeePrices(fee, 'label')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// US-02-01 — validation d'une grille enregistrée
// ---------------------------------------------------------------------------

describe('validateGridContent (US-02-01)', () => {
  const valid = () => JSON.parse(JSON.stringify(PERISCOLIA_PRICING_GRID_V1));

  it('accepts the seeded Périscolia grid as is', () => {
    expect(validateGridContent(valid())).toEqual([]);
  });

  it('refuses anything that is not an object', () => {
    expect(validateGridContent(null)).toEqual(['content: must be an object']);
    expect(validateGridContent([])).toEqual(['content: must be an object']);
    expect(validateGridContent('grid')).toEqual(['content: must be an object']);
  });

  it('names the price table whose length does not match the brackets', () => {
    const grid = valid();
    grid.subscription.CONFORT = [24.9, 39.9];
    expect(validateGridContent(grid)).toContain('subscription.CONFORT: 2 prices for 6 brackets');
  });

  it('names a faulty option and fee post by their path', () => {
    const grid = valid();
    grid.options[2].unitPrice = [4, 4, 10];
    grid.setupFees.training.CONFORT = [750];
    const issues = validateGridContent(grid);
    expect(issues).toContain('options[2].unitPrice: 3 prices for 6 brackets');
    expect(issues).toContain('setupFees.training.CONFORT: 1 prices for 6 brackets');
  });

  it('requires a price table for every plan of the grid', () => {
    const grid = valid();
    grid.plans.push('GOLD');
    expect(validateGridContent(grid)).toContain('subscription.GOLD: missing price table');
  });

  it('refuses a plan without brackets, and brackets without a plan', () => {
    expect(validateGridContent({ ...valid(), brackets: [] })).toContain('brackets: at least one bracket is required');
    expect(validateGridContent({ ...valid(), plans: [] })).toContain('plans: at least one plan is required');
  });

  it('refuses overlapping or inverted brackets — the resolution must not depend on the order', () => {
    const grid = valid();
    grid.brackets[1].min = 400;
    expect(validateGridContent(grid)).toContain('brackets[1]: overlaps the previous bracket');

    const inverted = valid();
    inverted.brackets[0] = { label: '0 – 500 hab.', min: 500, max: 0 };
    expect(validateGridContent(inverted)).toContain('brackets[0]: max is below min');
  });

  it('refuses an open-ended bracket that is not the last one', () => {
    const grid = valid();
    grid.brackets[0].max = null;
    expect(validateGridContent(grid)).toContain('brackets[0]: open-ended bracket must be the last');
  });

  it('refuses negative or non-numeric prices', () => {
    const grid = valid();
    grid.subscription.ESSENTIEL = [19.9, 24.9, 39.9, 49.9, 79.9, -1];
    expect(validateGridContent(grid)).toContain('subscription.ESSENTIEL: prices must be numbers ≥ 0');

    const text = valid();
    text.extras[0].unitPrice = '500';
    expect(validateGridContent(text)).toContain('extras[0].unitPrice: must be a number ≥ 0');
  });

  it('refuses duplicate identifiers on options and extras', () => {
    const grid = valid();
    grid.options[1].id = 0;
    grid.extras[1].id = 0;
    const issues = validateGridContent(grid);
    expect(issues).toContain('options: duplicate id');
    expect(issues).toContain('extras: duplicate id');
  });

  it('requires the labels a document prints', () => {
    const grid = valid();
    grid.brackets[3].label = '  ';
    grid.setupFees.deployment.label = '';
    grid.options[0].name = '';
    const issues = validateGridContent(grid);
    expect(issues).toContain('brackets[3].label: required');
    expect(issues).toContain('setupFees.deployment.label: required');
    expect(issues).toContain('options[0].name: required');
  });

  // ------------------------------------------------------------------ SPEC-19

  it('refuses a gap between two brackets — some populations would have no price at all', () => {
    const grid = valid();
    grid.brackets[1].min = 600;
    expect(validateGridContent(grid)).toContain('brackets[1]: leaves a gap after the previous bracket');
  });

  it('refuses a grid that does not cover both ends', () => {
    const low = valid();
    low.brackets[0].min = 1;
    expect(validateGridContent(low)).toContain('brackets[0].min: the first bracket must start at 0');

    const high = valid();
    high.brackets[high.brackets.length - 1].max = 50000;
    expect(validateGridContent(high)).toContain('brackets: the last bracket must be open-ended');
  });

  it('refuses a price table left behind by a deleted plan', () => {
    const grid = valid();
    grid.plans = grid.plans.filter((plan: string) => plan !== 'PREMIUM');
    const issues = validateGridContent(grid);
    expect(issues).toContain('subscription.PREMIUM: no such plan');
    expect(issues).toContain('setupFees.training.PREMIUM: no such plan');
  });

  it('requires the nature of each fee post — it commands the one-shot split', () => {
    const grid = valid();
    delete grid.setupFees.deployment.nature;
    expect(validateGridContent(grid)).toContain('setupFees.deployment.nature: TRAINING or SETUP required');

    const wrong = valid();
    wrong.setupFees.training.nature = 'FORMATION';
    expect(validateGridContent(wrong)).toContain('setupFees.training.nature: TRAINING or SETUP required');
  });

  it('refuses two fee posts sharing a label — a frozen quote could not tell them apart', () => {
    const grid = valid();
    grid.setupFees.configuration.label = grid.setupFees.deployment.label;
    expect(validateGridContent(grid)).toContain('setupFees: duplicate label');
  });

  it('refuses a plan named like an attribute of a fee post', () => {
    const grid = valid();
    grid.plans = ['nature'];
    grid.subscription = { nature: [0, 0, 0, 0, 0, 0] };
    expect(validateGridContent(grid)).toContain('plans: "nature" is a reserved name');
  });

  it('caps the number of options, fee posts and extras', () => {
    const grid = valid();
    grid.options = Array.from({ length: GRID_MAX_OPTIONS + 1 }, (_, id) => ({
      id,
      name: `Option ${id}`,
      unitPrice: [0, 0, 0, 0, 0, 0],
    }));
    expect(validateGridContent(grid)).toContain(`options: at most ${GRID_MAX_OPTIONS} options`);

    const extras = valid();
    extras.extras = Array.from({ length: GRID_MAX_EXTRAS + 1 }, (_, id) => ({ id, name: `Extra ${id}`, unitPrice: 1 }));
    expect(validateGridContent(extras)).toContain(`extras: at most ${GRID_MAX_EXTRAS} extras`);
  });

  it('accepts a grid without options, fees or extras — a project may sell a flat subscription', () => {
    expect(
      validateGridContent({
        brackets: [{ label: 'Tous', min: 0, max: null }],
        plans: ['STANDARD'],
        subscription: { STANDARD: [0] },
      }),
    ).toEqual([]);
  });
});

describe('identifiants et éléments retirés (SPEC-19 D2 et D4)', () => {
  it('pose un identifiant sur chaque élément qui arrive sans, options et extras à la suite', () => {
    const assigned = assignItemIds({ options: [{ id: 1, name: 'A' }, { name: 'B' }], extras: [{ name: 'C' }] }, 6);
    expect(assigned.options).toEqual([{ id: 1, name: 'A' }, { id: 6, name: 'B' }]);
    expect(assigned.extras).toEqual([{ id: 7, name: 'C' }]);
  });

  it('compte ce qu’il y a à réserver avant de toucher au compteur', () => {
    expect(countUnidentifiedItems({ options: [{ id: 1 }, {}], extras: [{}] })).toBe(2);
    expect(countUnidentifiedItems({ options: [{ id: 1 }] })).toBe(0);
    expect(countUnidentifiedItems({})).toBe(0);
  });

  it('refuse un identifiant que le projet n’a jamais distribué', () => {
    expect(() => assignItemIds({ options: [{ id: 99, name: 'A' }] }, 6)).toThrow();
    expect(() => assignItemIds({ options: [{ id: -1, name: 'A' }] }, 6)).toThrow();
  });

  it('accepte un identifiant déjà distribué : rendre un élément retiré reste possible', () => {
    expect(assignItemIds({ options: [{ id: 0, name: 'A' }] }, 6)).toEqual({ options: [{ id: 0, name: 'A' }] });
  });

  it('laisse un contenu mal formé au validateur', () => {
    expect(assignItemIds({ options: 'nope' }, 6)).toEqual({ options: 'nope' });
  });

  it('nomme ce qu’un contenu fait disparaître', () => {
    const before = { plans: ['A', 'B'], options: [{ id: 0 }, { id: 1 }], extras: [{ id: 0 }] } as never;
    const after = { plans: ['A'], options: [{ id: 0 }], extras: [{ id: 0 }] } as never;
    expect(removedGridItems(before, after)).toEqual({ plans: ['B'], options: [1], extras: [] });
  });

  it('ne retient que les brouillons qui portent réellement l’élément retiré', () => {
    const drafts = [
      { number: 'DEV-1', config: { plan: 'B', options: [], extras: [] } },
      { number: 'DEV-2', config: { plan: 'A', options: [{ id: 1, qty: 1 }], extras: [] } },
      { number: 'DEV-3', config: { plan: 'A', options: [{ id: 0, qty: 1 }], extras: [] } },
      { number: 'DEV-4', config: null },
    ];
    const used = draftsUsingItems(drafts, { plans: ['B'], options: [1], extras: [] });
    expect(used.quotes).toEqual(['DEV-1', 'DEV-2']);
    expect(used.items).toEqual(['plan B', 'option 1']);
  });
});

describe('assertBaseUpToDate — le garde-fou de filiation (SPEC-14 D21)', () => {
  it('laisse passer une version préparée sur la grille active', () => {
    expect(() => assertBaseUpToDate(5, 5, false)).not.toThrow();
  });

  it('laisse passer une grille écrite de zéro : elle ne dérive de rien', () => {
    expect(() => assertBaseUpToDate(null, 5, false)).not.toThrow();
  });

  it('laisse passer quand le projet n’a pas encore de grille active', () => {
    expect(() => assertBaseUpToDate(1, null, false)).not.toThrow();
  });

  it('refuse une version préparée sur une grille périmée', () => {
    // C'est le cas qui effaçait trois mois de travail sans rien dire.
    expect(() => assertBaseUpToDate(1, 5, false)).toThrow(/version 1 while version 5 is active/);
  });

  it('porte les deux numéros en meta, pour que l’écran n’ait pas à lire une phrase', () => {
    try {
      assertBaseUpToDate(1, 5, false);
      throw new Error('aurait dû refuser');
    } catch (error) {
      const body = (error as { getResponse: () => Record<string, unknown> }).getResponse();
      expect(body.meta).toEqual({ activeVersion: 5, basedOnVersion: 1 });
    }
  });

  it('cède à une demande explicite : revenir à une grille antérieure est légitime', () => {
    expect(() => assertBaseUpToDate(1, 5, true)).not.toThrow();
  });
});

describe('assertEffectiveDateValid (SPEC-18 §4)', () => {
  const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
  const today = day('2026-09-07');

  it('accepts today', () => {
    expect(() => assertEffectiveDateValid(today, today, null)).not.toThrow();
  });

  it('accepts a future date', () => {
    expect(() => assertEffectiveDateValid(day('2027-01-01'), today, null)).not.toThrow();
  });

  it('refuses a date in the past — a grid does not start applying before it exists', () => {
    expect(() => assertEffectiveDateValid(day('2026-06-11'), today, null)).toThrow();
  });

  it('refuses a date earlier than the active version, whose date is still ahead', () => {
    expect(() => assertEffectiveDateValid(day('2026-09-20'), today, day('2026-10-01'))).toThrow();
  });

  it('accepts a date on the active version day', () => {
    expect(() => assertEffectiveDateValid(day('2026-10-01'), today, day('2026-10-01'))).not.toThrow();
  });

  it('ignores an active version dated in the past: today is then the floor', () => {
    expect(() => assertEffectiveDateValid(today, today, day('2026-08-31'))).not.toThrow();
  });
});
