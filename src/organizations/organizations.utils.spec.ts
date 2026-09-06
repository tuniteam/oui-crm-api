import { CustomerStatus, Priority, SalesStatus } from '@prisma/client';
import { regionOfDepartment } from '@/scopes/geo.constants';
import {
  bracketPopulationFilter,
  buildOrganizationWhere,
  completenessScore,
  computeCompleteness,
} from './organizations.utils';

const complete = {
  siret: '10298517300016',
  address: '1 rue de la Mairie',
  postalCode: '89300',
  population: 9820,
  email: 'contact@joigny.fr',
  hasPrimaryContact: true,
};

describe('completeness (V8 rule: 6 criteria)', () => {
  it('scores 100 when everything is filled', () => {
    expect(completenessScore(complete)).toBe(100);
  });

  it('scores 0 on an empty record', () => {
    expect(
      completenessScore({
        siret: null,
        address: null,
        postalCode: null,
        population: null,
        email: null,
        hasPrimaryContact: false,
      }),
    ).toBe(0);
  });

  it('counts a missing criterion as one sixth', () => {
    expect(completenessScore({ ...complete, siret: null })).toBe(83);
    expect(completenessScore({ ...complete, siret: null, email: null })).toBe(67);
  });

  it('treats a population of 0 as filled, unlike null', () => {
    expect(completenessScore({ ...complete, population: 0 })).toBe(100);
    expect(completenessScore({ ...complete, population: null })).toBe(83);
  });

  it('depends on the primary contact, which lives in another table', () => {
    expect(completenessScore({ ...complete, hasPrimaryContact: false })).toBe(83);
  });

  it('lists the missing criteria and blocks the quote without a population', () => {
    const result = computeCompleteness({ ...complete, population: null, email: null });
    expect(result.missing).toEqual(['POPULATION', 'EMAIL']);
    expect(result.blocks).toEqual({ quote: true, contract: true });
  });

  it('does not block the quote when only the email is missing', () => {
    const result = computeCompleteness({ ...complete, email: null });
    expect(result.missing).toEqual(['EMAIL']);
    expect(result.blocks).toEqual({ quote: false, contract: false });
  });
});

describe('buildOrganizationWhere', () => {
  it('always scopes to the project', () => {
    expect(buildOrganizationWhere('p1', {})).toEqual({ projectId: 'p1' });
  });

  it('searches name and city on a text input, and trims it', () => {
    const where = buildOrganizationWhere('p1', { search: ' Joigny ' });
    expect(where.AND).toEqual([
      {
        OR: [
          { name: { contains: 'Joigny', mode: 'insensitive' } },
          { city: { contains: 'Joigny', mode: 'insensitive' } },
        ],
      },
    ]);
  });

  it('adds the SIRET on a numeric input, spaces removed', () => {
    const where = buildOrganizationWhere('p1', { search: '102 985 173' });
    expect(where.AND).toEqual([
      {
        OR: [
          { name: { contains: '102 985 173', mode: 'insensitive' } },
          { city: { contains: '102 985 173', mode: 'insensitive' } },
          { siret: { startsWith: '102985173' } },
        ],
      },
    ]);
  });

  it('expands a region into its departments rather than filtering in memory', () => {
    const where = buildOrganizationWhere('p1', { region: 'Corse' });
    expect(where.AND).toEqual([{ department: { in: ['2A', '2B'] } }]);
  });

  it('matches nothing for an unknown region instead of matching everything', () => {
    const where = buildOrganizationWhere('p1', { region: 'Atlantide' });
    expect(where.AND).toEqual([{ department: { in: ['__none__'] } }]);
  });

  it('combines filters and keeps completenessMax inclusive', () => {
    const where = buildOrganizationWhere('p1', {
      department: '89',
      salesStatus: SalesStatus.TO_CONTACT,
      customerStatus: CustomerStatus.NOT_CUSTOMER,
      priority: Priority.HIGH,
      tag: 'HOT',
      completenessMax: 99,
    });
    expect(where.AND).toEqual([
      { department: '89' },
      { tags: { has: 'HOT' } },
      { salesStatus: SalesStatus.TO_CONTACT },
      { customerStatus: CustomerStatus.NOT_CUSTOMER },
      { priority: Priority.HIGH },
      { completenessScore: { lte: 99 } },
    ]);
  });

  it('keeps a completenessMax of 0, which is a real filter', () => {
    const where = buildOrganizationWhere('p1', { completenessMax: 0 });
    expect(where.AND).toEqual([{ completenessScore: { lte: 0 } }]);
  });
});

describe('bracketPopulationFilter (SPEC-16: the bracket is a population range)', () => {
  const brackets = [
    { label: '0 – 500 hab.', min: 0, max: 500 },
    { label: '1 001 – 2 500 hab.', min: 1001, max: 2500 },
    { label: 'Plus de 10 000 hab.', min: 10001, max: null },
  ];

  it('turns a closed bracket into an inclusive range', () => {
    expect(bracketPopulationFilter(brackets, '1 001 – 2 500 hab.')).toEqual({ gte: 1001, lte: 2500 });
  });

  it('leaves the open-ended bracket without an upper bound', () => {
    expect(bracketPopulationFilter(brackets, 'Plus de 10 000 hab.')).toEqual({ gte: 10001 });
  });

  it('keeps the first bracket starting at zero, not at one', () => {
    expect(bracketPopulationFilter(brackets, '0 – 500 hab.')).toEqual({ gte: 0, lte: 500 });
  });

  it('refuses a label the active grid does not know — a wrong ask, not an empty result', () => {
    expect(() => bracketPopulationFilter(brackets, 'Strate inventée')).toThrow();
  });

  it('refuses any label when the project has no active grid', () => {
    expect(() => bracketPopulationFilter([], '0 – 500 hab.')).toThrow();
  });
});

describe('buildOrganizationWhere with the SPEC-16 filters', () => {
  const brackets = [{ label: 'Plus de 10 000 hab.', min: 10001, max: null }];

  it('pushes the bracket down as a population range', () => {
    const where = buildOrganizationWhere('p1', { bracket: 'Plus de 10 000 hab.' }, brackets);
    expect(where.population).toEqual({ gte: 10001 });
  });

  it('queries the JSON column for the opening day', () => {
    const where = buildOrganizationWhere('p1', { openOn: 'WEDNESDAY' });
    expect(where.openingHours).toEqual({ path: ['days'], array_contains: [{ day: 'WEDNESDAY' }] });
  });

  it('adds nothing when neither filter is asked for', () => {
    const where = buildOrganizationWhere('p1', {});
    expect(where.population).toBeUndefined();
    expect(where.openingHours).toBeUndefined();
  });
});

describe('regionOfDepartment (region is derived, never stored)', () => {
  it('resolves a department to its region', () => {
    expect(regionOfDepartment('89')).toBe('Bourgogne-Franche-Comté');
    expect(regionOfDepartment('2B')).toBe('Corse');
    expect(regionOfDepartment('974')).toBe('Outre-mer');
  });

  it('returns null for a missing or unknown department', () => {
    expect(regionOfDepartment(null)).toBeNull();
    expect(regionOfDepartment('99')).toBeNull();
  });
});

