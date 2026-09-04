import { ContractStatus, QuoteType } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { addMonths, nextDay, toDate } from '@/common/utils/date.utils';
import { QuoteConfig } from '@/pricing/pricing.types';
import { amendmentConfig, amendmentStartDate, assertAmendable, contractData } from './contracts.utils';

const config = (over: Partial<QuoteConfig> = {}): QuoteConfig => ({
  plan: 'CONFORT',
  subscriptionDiscount: 0,
  options: [],
  setup: { deployment: { included: true }, configuration: { included: true }, training: { included: false } },
  extras: [],
  globalDiscount: { mode: 'NONE' },
  commitmentMonths: 36,
  cancellable: false,
  trialClause: false,
  billing: 'MONTHLY',
  ...over,
});

const signedQuote = {
  id: 'q1',
  projectId: 'p1',
  organizationId: 'o1',
  number: 'DEV-2026-247-AS001',
  startDate: toDate('2026-10-04'),
  config: null as never,
  mrrList: new Prisma.Decimal('450.00'),
  mrrNet: new Prisma.Decimal('405.00'),
  arrList: new Prisma.Decimal('5400.00'),
  arrNet: new Prisma.Decimal('4860.00'),
  oneShotTotal: new Prisma.Decimal('1800.00'),
  sourceContractId: null,
};

describe('contractData (US-02-07, SPEC-14 D1)', () => {
  it('derives the number from the quote and never renumbers', () => {
    const data = contractData(signedQuote, config(), toDate('2026-09-04'), 2);
    expect(data.number).toBe('CTR-2026-247-AS001');
  });

  it('copies the frozen amounts instead of recomputing them', () => {
    const data = contractData(signedQuote, config(), toDate('2026-09-04'), 2);
    expect(data.mrrNet).toBe(signedQuote.mrrNet);
    expect(data.arrList).toBe(signedQuote.arrList);
    expect(data.oneShotTotal).toBe(signedQuote.oneShotTotal);
  });

  it('ends the contract after the commitment, counted from the start date', () => {
    const data = contractData(signedQuote, config({ commitmentMonths: 36 }), toDate('2026-09-04'), 2);
    expect(data.endDate).toEqual(toDate('2029-10-04'));
  });

  it('takes the notice from the project settings and renews by default (D15)', () => {
    const data = contractData(signedQuote, config(), toDate('2026-09-04'), 3);
    expect(data.noticeMonths).toBe(3);
    expect(data.autoRenew).toBeUndefined(); // le défaut du modèle, jamais écrit à la main
  });

  it('carries the amendment chain over from the quote', () => {
    const data = contractData({ ...signedQuote, sourceContractId: 'c0' }, config(), toDate('2026-09-04'), 2);
    expect(data.sourceContractId).toBe('c0');
  });
});

describe('assertAmendable (SPEC-14 D16)', () => {
  it('accepts a running contract', () => {
    expect(() => assertAmendable({ status: ContractStatus.ACTIVE })).not.toThrow();
  });

  it('refuses a contract that already carries an amendment', () => {
    expect(() => assertAmendable({ status: ContractStatus.AMENDING })).toThrow(/AMENDING/);
  });

  it('refuses a closed contract', () => {
    expect(() => assertAmendable({ status: ContractStatus.CLOSED })).toThrow(/CLOSED/);
  });
});

describe('amendmentConfig (US-02-10)', () => {
  it('carries a renewal over untouched', () => {
    const base = config();
    expect(amendmentConfig(base, QuoteType.RENEWAL)).toBe(base);
  });

  it('drops the setup fees of an addition — the service is already deployed', () => {
    const amended = amendmentConfig(config(), QuoteType.ADDITIONAL);
    expect(Object.values(amended.setup).every((entry) => entry.included === false)).toBe(true);
  });

  it('leaves the rest of the configuration alone', () => {
    const amended = amendmentConfig(config({ subscriptionDiscount: 15 }), QuoteType.ADDITIONAL);
    expect(amended.plan).toBe('CONFORT');
    expect(amended.subscriptionDiscount).toBe(15);
    expect(amended.commitmentMonths).toBe(36);
  });
});

describe('amendmentStartDate (US-02-10)', () => {
  it('starts a renewal the day after the contract ends', () => {
    expect(amendmentStartDate({ endDate: toDate('2029-10-04') }, QuoteType.RENEWAL)).toEqual(toDate('2029-10-05'));
  });

  it('leaves an addition to the default start date of a quote', () => {
    expect(amendmentStartDate({ endDate: toDate('2029-10-04') }, QuoteType.ADDITIONAL)).toBeNull();
  });
});

describe('addMonths / nextDay', () => {
  it('keeps the day of the month', () => {
    expect(addMonths(toDate('2026-10-04'), 36)).toEqual(toDate('2029-10-04'));
    expect(addMonths(toDate('2026-01-15'), 1)).toEqual(toDate('2026-02-15'));
  });

  it('falls back to the last day when the target month is shorter', () => {
    expect(addMonths(toDate('2026-01-31'), 1)).toEqual(toDate('2026-02-28'));
    expect(addMonths(toDate('2028-01-31'), 1)).toEqual(toDate('2028-02-29'));
  });

  it('crosses a year end', () => {
    expect(addMonths(toDate('2026-11-30'), 3)).toEqual(toDate('2027-02-28'));
    expect(nextDay(toDate('2026-12-31'))).toEqual(toDate('2027-01-01'));
  });
});
