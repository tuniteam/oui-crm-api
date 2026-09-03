import { BATCH_APPLIED_AT_KEY, batchAppliedAt, stampAppliedAt } from './import.constants';

describe('import — instant de référence d’un lot', () => {
  it('stamps the totals with an ISO instant, keeping them untouched', () => {
    const stamped = stampAppliedAt({ created: 3, updated: 1 });
    expect(stamped.created).toBe(3);
    expect(stamped.updated).toBe(1);
    expect(new Date(stamped[BATCH_APPLIED_AT_KEY]).getTime()).toBeGreaterThan(0);
  });

  it('reads the instant back', () => {
    const totals = stampAppliedAt({ created: 1 });
    expect(batchAppliedAt(totals)?.toISOString()).toBe(totals[BATCH_APPLIED_AT_KEY]);
  });

  it('answers null for a batch predating the stamp, so the caller falls back', () => {
    expect(batchAppliedAt({ created: 1 })).toBeNull();
    expect(batchAppliedAt(null)).toBeNull();
    expect(batchAppliedAt(undefined)).toBeNull();
  });

  it('answers null on a corrupted value rather than an Invalid Date', () => {
    expect(batchAppliedAt({ appliedAt: 'pas une date' })).toBeNull();
    expect(batchAppliedAt({ appliedAt: 42 })).toBeNull();
  });
});
