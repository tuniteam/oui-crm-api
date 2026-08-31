import { BadRequestException, ConflictException } from '@nestjs/common';
import { FeatureCode, ProjectStatus } from '@prisma/client';
import { assertNameMatches, assertNotArchived, buildProjectWhere, mapToFeatures } from './projects.utils';

describe('buildProjectWhere', () => {
  it('is empty without filters', () => {
    expect(buildProjectWhere({})).toEqual({});
  });

  it('filters by status and searches slug, name and product name case-insensitively', () => {
    const where = buildProjectWhere({ status: ProjectStatus.ACTIVE, search: 'peri' });
    expect(where.status).toBe('ACTIVE');
    expect(where.OR).toEqual([
      { slug: { contains: 'peri', mode: 'insensitive' } },
      { name: { contains: 'peri', mode: 'insensitive' } },
      { productName: { contains: 'peri', mode: 'insensitive' } },
    ]);
  });
});

describe('mapToFeatures', () => {
  it('lists every feature code, missing rows being disabled', () => {
    const result = mapToFeatures([{ feature: FeatureCode.SALES, enabled: true }]);
    expect(result).toHaveLength(Object.values(FeatureCode).length);
    expect(result).toContainEqual({ code: 'SALES', enabled: true });
    expect(result).toContainEqual({ code: 'BILLING', enabled: false });
  });
});

describe('guards on project state', () => {
  it('assertNotArchived rejects ARCHIVED with 409 PROJECT_ARCHIVED', () => {
    expect(() => assertNotArchived({ status: ProjectStatus.ARCHIVED })).toThrow(ConflictException);
    expect(() => assertNotArchived({ status: ProjectStatus.DRAFT })).not.toThrow();
  });

  it('assertNameMatches requires the exact name (T13)', () => {
    expect(() => assertNameMatches({ name: 'Périscolia' }, 'periscolia')).toThrow(BadRequestException);
    expect(() => assertNameMatches({ name: 'Périscolia' }, 'Périscolia')).not.toThrow();
  });
});
