import { ReferenceItem } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { REFERENCE_KEY_PATTERN, REFERENCE_USAGE_COUNTERS, registerUsageCounter } from './reference-items.constants';
import { mapToReferenceItemResponse, usageCounts } from './reference-items.utils';

const item = (overrides: Partial<ReferenceItem> = {}): ReferenceItem => ({
  id: 'ri1',
  projectId: 'p1',
  category: 'LEAD_SOURCE',
  key: 'WEB_FORM',
  label: 'Formulaire site web',
  order: 1,
  active: true,
  metadata: { ics: true },
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('reference-items.utils', () => {
  it('accepts UPPER_SNAKE keys only (seed convention)', () => {
    expect(REFERENCE_KEY_PATTERN.test('TRADE_SHOW')).toBe(true);
    expect(REFERENCE_KEY_PATTERN.test('BL_ENFANCE_2')).toBe(true);
    expect(REFERENCE_KEY_PATTERN.test('trade_show')).toBe(false);
    expect(REFERENCE_KEY_PATTERN.test('2ND')).toBe(false);
    expect(REFERENCE_KEY_PATTERN.test('TRADE SHOW')).toBe(false);
  });

  it('maps a row with its usage count and a plain metadata object', () => {
    expect(mapToReferenceItemResponse(item(), 3)).toEqual({
      id: 'ri1',
      category: 'LEAD_SOURCE',
      key: 'WEB_FORM',
      label: 'Formulaire site web',
      order: 1,
      active: true,
      metadata: { ics: true },
      usageCount: 3,
    });
    expect(mapToReferenceItemResponse(item({ metadata: null as never }), 0).metadata).toEqual({});
  });

  it('usage counts come from the registry — empty map when no counter (L0), counter result otherwise', async () => {
    const prisma = {} as PrismaService;
    expect(await usageCounts(prisma, 'p1', 'TAG')).toEqual(new Map());

    registerUsageCounter('TAG', async () => new Map([['HOT', 4]]));
    expect((await usageCounts(prisma, 'p1', 'TAG')).get('HOT')).toBe(4);
    delete REFERENCE_USAGE_COUNTERS.TAG;
  });
});
