import { OpportunityStageCode, Prisma } from '@prisma/client';
import { PERISCOLIA_PRICING_GRID_V1 } from '@/pricing/periscolia-grid.constants';
import { PricingGridContent } from '@/pricing/pricing.types';
import { DEFAULT_STAGE_PROBABILITIES } from '@/projects/project-config.constants';
import { effectiveProbability, estimateValue, quoteValue, resolveOpportunityValue, weightedTotal } from './opportunities.utils';

const grid = PERISCOLIA_PRICING_GRID_V1 as unknown as PricingGridContent;
const d = (value: string) => new Prisma.Decimal(value);
const quote = (arrList: string, oneShotTotal: string) => ({ arrList: d(arrList), oneShotTotal: d(oneShotTotal) });

describe('opportunities — probabilité effective (SPEC-01 §3.7)', () => {
  it('takes the probability of the stage from the project settings', () => {
    expect(effectiveProbability(OpportunityStageCode.QUALIFICATION, null, DEFAULT_STAGE_PROBABILITIES)).toBe(10);
    expect(effectiveProbability(OpportunityStageCode.QUOTE_SENT, null, DEFAULT_STAGE_PROBABILITIES)).toBe(50);
    expect(effectiveProbability(OpportunityStageCode.VERBAL_AGREEMENT, null, DEFAULT_STAGE_PROBABILITIES)).toBe(90);
  });

  it('lets a hand-set weighting win, including 0 (SPEC-05 Q4)', () => {
    expect(effectiveProbability(OpportunityStageCode.QUALIFICATION, 75, DEFAULT_STAGE_PROBABILITIES)).toBe(75);
    expect(effectiveProbability(OpportunityStageCode.VERBAL_AGREEMENT, 0, DEFAULT_STAGE_PROBABILITIES)).toBe(0);
  });

  it('follows a project that reconfigured its probabilities', () => {
    expect(effectiveProbability(OpportunityStageCode.QUOTE_SENT, null, { QUOTE_SENT: 42 })).toBe(42);
  });

  it('falls back to 0 rather than NaN when the stage has no probability', () => {
    expect(effectiveProbability(OpportunityStageCode.DEMONSTRATION, null, {})).toBe(0);
  });
});

describe('opportunities — valorisation (SPEC-01 §3.7, SPEC-04 déc. 8)', () => {
  it('values a quote as its annual list subscription plus the one-shot fees', () => {
    expect(quoteValue(quote('4796.40', '3625')).toFixed(2)).toBe('8421.40');
  });

  it('keeps the highest attached quote, and says the value comes from a quote', () => {
    const result = resolveOpportunityValue(
      [quote('958.80', '2750'), quote('4796.40', '3625'), quote('2448', '3625')],
      grid,
      { population: 9820, targetPlan: 'PREMIUM' },
    );
    expect(result.source).toBe('QUOTE');
    expect(result.value.toFixed(2)).toBe('8421.40');
  });

  it('estimates from the target plan when no quote is attached (Joigny, PREMIUM, 9 820 hab.)', () => {
    const result = resolveOpportunityValue([], grid, { population: 9820, targetPlan: 'PREMIUM' });
    expect(result.source).toBe('ESTIMATE');
    // 204,90 × 12 = 2 458,80 + (500 + 1 250 + 1 875) de frais
    expect(result.value.toFixed(2)).toBe('6083.80');
  });

  it('falls back to the first plan of the grid when the record has no target plan', () => {
    // ESSENTIEL sur la strate 5 000-10 000 : 79,90 × 12 = 958,80 + (500 + 750 + 1 250)
    expect(estimateValue(grid, { population: 9820, targetPlan: null }).toFixed(2)).toBe('3458.80');
  });

  it('ignores a target plan the grid does not carry', () => {
    expect(estimateValue(grid, { population: 9820, targetPlan: 'GOLD' }).toFixed(2)).toBe('3458.80');
  });

  it('values at 0 without a usable population — there is no bracket, so no price', () => {
    expect(estimateValue(grid, { population: null, targetPlan: 'PREMIUM' }).toFixed(2)).toBe('0.00');
    expect(estimateValue(grid, { population: 0, targetPlan: 'PREMIUM' }).toFixed(2)).toBe('0.00');
  });

  it('values at 0 when the project has no active grid', () => {
    expect(estimateValue(null, { population: 9820, targetPlan: 'PREMIUM' }).toFixed(2)).toBe('0.00');
  });
});

describe('opportunities — pipeline pondéré', () => {
  it('weights a value by its probability', () => {
    expect(weightedTotal([{ value: d('8421.40'), probability: 50 }]).toFixed(2)).toBe('4210.70');
  });

  it('sums the weighted values of a column, rounding once per line', () => {
    const total = weightedTotal([
      { value: d('8421.40'), probability: 50 },
      { value: d('6083.80'), probability: 10 },
      { value: d('3458.80'), probability: 90 },
    ]);
    // 4 210,70 + 608,38 + 3 112,92
    expect(total.toFixed(2)).toBe('7932.00');
  });

  it('weighs nothing at probability 0, and the whole value at 100', () => {
    expect(weightedTotal([{ value: d('1000'), probability: 0 }]).toFixed(2)).toBe('0.00');
    expect(weightedTotal([{ value: d('1000'), probability: 100 }]).toFixed(2)).toBe('1000.00');
    expect(weightedTotal([]).toFixed(2)).toBe('0.00');
  });
});
