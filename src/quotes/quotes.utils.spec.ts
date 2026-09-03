import { Prisma, QuoteLine, QuoteLineNature, QuoteStatus } from '@prisma/client';
import { PERISCOLIA_PRICING_GRID_V1 } from '@/pricing/periscolia-grid.constants';
import { PricingService } from '@/pricing/pricing.service';
import { PricingGridContent } from '@/pricing/pricing.types';
import {
  QuoteConfigInput,
  amountsOf,
  assertSetupShape,
  defaultStartDate,
  linesToCreate,
  normalizeQuoteConfig,
  resolveQuoteResult,
  validUntilFrom,
} from './quotes.utils';

const pricing = new PricingService();
const grid = PERISCOLIA_PRICING_GRID_V1 as unknown as PricingGridContent;
const defaults = { vatRate: 20, quoteValidityDays: 30, defaultCommitmentMonths: 36, discountCap: 30 };
const d = (value: string) => new Prisma.Decimal(value);

const minimalConfig = (): QuoteConfigInput => ({ plan: 'CONFORT' });

describe('quotes — configuration normalisée (SPEC-04 §2.1)', () => {
  it('fills every default so the stored config never depends on later settings', () => {
    const config = normalizeQuoteConfig(minimalConfig(), defaults);
    expect(config).toEqual({
      plan: 'CONFORT',
      subscriptionDiscount: 0,
      options: [],
      setup: {},
      extras: [],
      globalDiscount: { mode: 'NONE' },
      commitmentMonths: 36,
      cancellable: true,
      trialClause: false,
      billing: 'MONTHLY',
    });
  });

  it('takes the commitment from the project settings, not from a constant', () => {
    expect(normalizeQuoteConfig(minimalConfig(), { ...defaults, defaultCommitmentMonths: 24 }).commitmentMonths).toBe(24);
  });

  it('keeps what the caller sent', () => {
    const sent = {
      ...minimalConfig(),
      subscriptionDiscount: 15,
      commitmentMonths: 12,
      cancellable: false,
      billing: 'YEARLY',
      globalDiscount: { mode: 'PERCENT', percent: 20, months: 6 },
    } as QuoteConfigInput;
    const config = normalizeQuoteConfig(sent, defaults);
    expect(config.subscriptionDiscount).toBe(15);
    expect(config.commitmentMonths).toBe(12);
    expect(config.cancellable).toBe(false);
    expect(config.billing).toBe('YEARLY');
    expect(config.globalDiscount).toEqual({ mode: 'PERCENT', percent: 20, months: 6 });
  });
});

describe('quotes — postes de frais', () => {
  it('accepts an entry carrying a boolean and an optional discount', () => {
    expect(() => assertSetupShape({ deployment: { included: true }, training: { included: false, discount: 25 } })).not.toThrow();
    expect(() => assertSetupShape({})).not.toThrow();
  });

  it('refuses an entry without a boolean, naming the faulty key', () => {
    expect(() => assertSetupShape({ training: {} as never })).toThrow(/training/);
    expect(() => assertSetupShape({ training: { included: 'yes' } as never })).toThrow(/training/);
    expect(() => assertSetupShape({ training: { included: true, discount: 'half' } as never })).toThrow(/training/);
  });
});

describe('quotes — dates', () => {
  const issue = new Date(Date.UTC(2026, 7, 31));

  it('starts 30 days after the quote date (SPEC-04 déc. 4)', () => {
    expect(defaultStartDate(issue).toISOString().slice(0, 10)).toBe('2026-09-30');
  });

  it('expires after the validity configured on the project', () => {
    expect(validUntilFrom(issue, 30).toISOString().slice(0, 10)).toBe('2026-09-30');
    expect(validUntilFrom(issue, 45).toISOString().slice(0, 10)).toBe('2026-10-15');
  });
});

describe('quotes — recalculer ou relire (SPEC-14 §2.5)', () => {
  const amounts = {
    mrrList: d('79.90'),
    mrrNet: d('79.90'),
    arrList: d('958.80'),
    arrNet: d('958.80'),
    oneShotTotal: d('2750'),
    firstYearHt: d('3708.80'),
    firstYearVat: d('741.76'),
    firstYearTtc: d('4450.56'),
    maxDiscount: 0,
  };
  const draft = {
    status: QuoteStatus.DRAFT,
    config: normalizeQuoteConfig(
      { plan: 'CONFORT', setup: { deployment: { included: true }, configuration: { included: true }, training: { included: true } } } as QuoteConfigInput,
      defaults,
    ) as unknown as Prisma.JsonValue,
    startDate: new Date(Date.UTC(2027, 0, 1)),
    ...amounts,
  };

  it('recomputes a draft from the grid it is given', () => {
    const { lines, result, amounts: computed } = resolveQuoteResult(pricing, draft, grid, 2600, 20);
    expect(result).not.toBeNull();
    expect(computed.mrrList.toFixed(2)).toBe('79.90');
    expect(computed.oneShotTotal.toFixed(2)).toBe('2750.00');
    expect(lines.map((l) => l.nature)).toEqual(['ABONNEMENT', 'SETUP', 'SETUP', 'SETUP']);
  });

  it('follows the grid it is given: another bracket, another price', () => {
    const { amounts: computed } = resolveQuoteResult(pricing, draft, grid, 12000, 20);
    expect(computed.mrrList.toFixed(2)).toBe('199.00');
  });

  it('refuses to recompute a draft when the project has no active grid', () => {
    expect(() => resolveQuoteResult(pricing, draft, null, 2600, 20)).toThrow();
  });

  it('serves a submitted quote from its frozen lines, without calling the engine', () => {
    const frozen = {
      ...draft,
      status: QuoteStatus.SENT,
      lines: [
        { id: 'l1', quoteId: 'q1', nature: QuoteLineNature.ABONNEMENT, order: 0, label: 'Abonnement CONFORT', sublabel: 'strate', qty: d('1'), unitPrice: d('79.90'), discount: 0, total: d('79.90') },
        { id: 'l2', quoteId: 'q1', nature: QuoteLineNature.SETUP, order: 1, label: 'Déploiement', sublabel: null, qty: d('1'), unitPrice: d('500'), discount: 0, total: d('500') },
      ] as QuoteLine[],
    };
    const { lines, result, amounts: served } = resolveQuoteResult(pricing, frozen, grid, 999999, 20);
    expect(result).toBeNull();
    expect(lines).toHaveLength(2);
    // La population absurde n'a rien changé : les lignes figées font foi.
    expect(served.mrrList.toFixed(2)).toBe('79.90');
    expect(lines[1].sublabel).toBe('');
  });

  it('serves an imported quote (no config) from its lines too', () => {
    const imported = { ...draft, status: QuoteStatus.DRAFT, config: null, lines: [] };
    const { result, lines } = resolveQuoteResult(pricing, imported, grid, 2600, 20);
    expect(result).toBeNull();
    expect(lines).toEqual([]);
  });

  it('orders the frozen lines by their stored order', () => {
    const frozen = {
      ...draft,
      status: QuoteStatus.SENT,
      lines: [
        { id: 'l2', quoteId: 'q1', nature: QuoteLineNature.SETUP, order: 5, label: 'Formation', sublabel: null, qty: d('1'), unitPrice: d('1250'), discount: 0, total: d('1250') },
        { id: 'l1', quoteId: 'q1', nature: QuoteLineNature.ABONNEMENT, order: 0, label: 'Abonnement', sublabel: null, qty: d('1'), unitPrice: d('79.90'), discount: 0, total: d('79.90') },
      ] as QuoteLine[],
    };
    expect(resolveQuoteResult(pricing, frozen, grid, 2600, 20).lines.map((l) => l.label)).toEqual(['Abonnement', 'Formation']);
  });
});

describe('quotes — figeage des lignes', () => {
  it('numbers the lines in reading order, subscription first', () => {
    const result = pricing.computeQuote({
      grid,
      population: 2600,
      vatRate: 20,
      startDate: '2027-01-01',
      config: normalizeQuoteConfig(
        {
          plan: 'CONFORT',
          options: [{ id: 5, qty: 1, discount: 0 }],
          setup: { deployment: { included: true }, configuration: { included: true }, training: { included: true } },
          extras: [{ id: 0, qty: 2, discount: 0 }],
        } as QuoteConfigInput,
        defaults,
      ),
    });
    const lines = linesToCreate('q1', result);
    expect(lines.map((l) => [l.order, l.nature])).toEqual([
      [0, 'ABONNEMENT'],
      [1, 'OPTION'],
      [2, 'SETUP'],
      [3, 'SETUP'],
      [4, 'SETUP'],
      [5, 'EXTRA'],
    ]);
    expect(lines.every((l) => l.quoteId === 'q1')).toBe(true);
  });

  it('carries the amounts of the result into the cached columns', () => {
    const result = pricing.computeQuote({
      grid,
      population: 2600,
      vatRate: 20,
      startDate: '2027-01-01',
      config: normalizeQuoteConfig({ plan: 'CONFORT' } as QuoteConfigInput, defaults),
    });
    const cached = amountsOf(result);
    expect(cached.mrrList.toFixed(2)).toBe('79.90');
    expect(cached.arrList.toFixed(2)).toBe('958.80');
    expect(cached.firstYearHt.toFixed(2)).toBe('958.80'); // aucun poste de frais retenu
    expect(cached.maxDiscount).toBe(0);
  });
});
