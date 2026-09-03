import { Prisma } from '@prisma/client';
import { PERISCOLIA_PRICING_GRID_V1 } from './periscolia-grid.constants';
import { PopulationBracket } from './pricing.types';
import {
  applyDiscount,
  clampDiscount,
  money,
  priceAt,
  resolveBracketIndex,
  resolveBracketLabel,
  safeQty,
  setupFeePrices,
  sumMoney,
  validateGridContent,
} from './pricing.utils';

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

  it('reads the price table of a fee post by plan, and tolerates an unknown plan', () => {
    const fee = { label: 'Formation', CONFORT: [750, 750], PREMIUM: [900, 900] };
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
