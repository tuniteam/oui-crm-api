import { OpportunityStageCode, QuoteStatus, SalesStatus } from '@prisma/client';
import {
  BUMPS_TO_IN_PROGRESS_FROM,
  OPPORTUNITY_STAGE_BY_QUOTE_STATUS,
  QUOTE_SENT_STATUSES,
  QUOTE_TRANSITIONS,
  canTransition,
} from './quotes.constants';

describe('quotes — table des transitions (SPEC-01 §3.8)', () => {
  it('lets a draft go out, either to the client or to validation', () => {
    expect(canTransition(QuoteStatus.DRAFT, QuoteStatus.SENT)).toBe(true);
    expect(canTransition(QuoteStatus.DRAFT, QuoteStatus.PENDING_VALIDATION)).toBe(true);
  });

  it('never lets a draft reach an outcome without being submitted', () => {
    expect(canTransition(QuoteStatus.DRAFT, QuoteStatus.SIGNED)).toBe(false);
    expect(canTransition(QuoteStatus.DRAFT, QuoteStatus.REJECTED)).toBe(false);
    expect(canTransition(QuoteStatus.DRAFT, QuoteStatus.EXPIRED)).toBe(false);
  });

  it('sends a quote awaiting validation either out or back to draft', () => {
    expect(QUOTE_TRANSITIONS[QuoteStatus.PENDING_VALIDATION]).toEqual([QuoteStatus.SENT, QuoteStatus.DRAFT]);
  });

  it('lets a sent quote be followed up again and again', () => {
    expect(canTransition(QuoteStatus.FOLLOWED_UP, QuoteStatus.FOLLOWED_UP)).toBe(true);
  });

  it('freezes the three outcomes: nothing leaves them', () => {
    for (const outcome of [QuoteStatus.SIGNED, QuoteStatus.REJECTED, QuoteStatus.EXPIRED]) {
      expect(QUOTE_TRANSITIONS[outcome]).toEqual([]);
      for (const to of Object.values(QuoteStatus)) expect(canTransition(outcome, to)).toBe(false);
    }
  });

  it('never walks a negotiation back to a follow-up', () => {
    expect(canTransition(QuoteStatus.NEGOTIATING, QuoteStatus.FOLLOWED_UP)).toBe(false);
    expect(canTransition(QuoteStatus.NEGOTIATING, QuoteStatus.SENT)).toBe(false);
  });

  it('covers every status of the enum — a new one cannot be forgotten', () => {
    expect(Object.keys(QUOTE_TRANSITIONS).sort()).toEqual(Object.values(QuoteStatus).sort());
  });
});

describe('quotes — ce que le statut impose à son entourage', () => {
  it('drives the opportunity as SPEC-01 §3.8 says', () => {
    expect(OPPORTUNITY_STAGE_BY_QUOTE_STATUS[QuoteStatus.SENT]).toBe(OpportunityStageCode.QUOTE_SENT);
    expect(OPPORTUNITY_STAGE_BY_QUOTE_STATUS[QuoteStatus.FOLLOWED_UP]).toBe(OpportunityStageCode.QUOTE_SENT);
    expect(OPPORTUNITY_STAGE_BY_QUOTE_STATUS[QuoteStatus.NEGOTIATING]).toBe(OpportunityStageCode.NEGOTIATING);
    expect(OPPORTUNITY_STAGE_BY_QUOTE_STATUS[QuoteStatus.SIGNED]).toBe(OpportunityStageCode.WON);
    expect(OPPORTUNITY_STAGE_BY_QUOTE_STATUS[QuoteStatus.REJECTED]).toBe(OpportunityStageCode.LOST);
    expect(OPPORTUNITY_STAGE_BY_QUOTE_STATUS[QuoteStatus.EXPIRED]).toBe(OpportunityStageCode.LOST);
  });

  it('leaves the opportunity alone while the quote only awaits validation', () => {
    expect(OPPORTUNITY_STAGE_BY_QUOTE_STATUS[QuoteStatus.PENDING_VALIDATION]).toBeUndefined();
    expect(OPPORTUNITY_STAGE_BY_QUOTE_STATUS[QuoteStatus.DRAFT]).toBeUndefined();
  });

  it('warms a cold record when the quote leaves, and only from a cold status', () => {
    expect(QUOTE_SENT_STATUSES).toContain(QuoteStatus.SENT);
    expect(QUOTE_SENT_STATUSES).not.toContain(QuoteStatus.PENDING_VALIDATION);
    expect(BUMPS_TO_IN_PROGRESS_FROM).toEqual([SalesStatus.NOT_CONTACTED, SalesStatus.TO_CONTACT]);
    expect(BUMPS_TO_IN_PROGRESS_FROM).not.toContain(SalesStatus.MEETING_SCHEDULED);
  });
});
