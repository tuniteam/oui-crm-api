import { Prisma } from '@prisma/client';
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
