import {
  GeoCommune,
  KNOWN_DEPARTMENTS,
  dedupeByInsee,
  departmentOfInsee,
  filterByPopulation,
  planTerritory,
} from './territory.utils';

const commune = (code: string, nom = 'X', population?: number): GeoCommune => ({ nom, code, population });

describe('departmentOfInsee', () => {
  it('reads the metropolitan department from the first two characters', () => {
    expect(departmentOfInsee('89024')).toBe('89');
    expect(departmentOfInsee('01053')).toBe('01');
  });

  it('keeps the Corsican letters', () => {
    expect(departmentOfInsee('2A004')).toBe('2A');
    expect(departmentOfInsee('2B033')).toBe('2B');
  });

  it('uses three characters overseas, 98x collectivities included (one shared rule)', () => {
    expect(departmentOfInsee('97105')).toBe('971');
    expect(departmentOfInsee('97613')).toBe('976');
    expect(departmentOfInsee('98735')).toBe('987');
  });
});

describe('KNOWN_DEPARTMENTS', () => {
  it('covers metropolitan, Corsican and overseas codes', () => {
    for (const d of ['01', '89', '2A', '2B', '971', '976']) expect(KNOWN_DEPARTMENTS.has(d)).toBe(true);
    expect(KNOWN_DEPARTMENTS.has('00')).toBe(false);
    expect(KNOWN_DEPARTMENTS.has('20')).toBe(false); // split into 2A/2B in 1976
  });
});

describe('filterByPopulation', () => {
  const rows = [commune('89001', 'A', 100), commune('89002', 'B', 5000), commune('89003', 'C')];

  it('is a no-op without bounds', () => {
    expect(filterByPopulation(rows, undefined, undefined)).toHaveLength(3);
  });

  it('applies inclusive bounds and drops unknown populations when a bound is set', () => {
    expect(filterByPopulation(rows, 100, undefined).map((c) => c.code)).toEqual(['89001', '89002']);
    expect(filterByPopulation(rows, undefined, 100).map((c) => c.code)).toEqual(['89001']);
    expect(filterByPopulation(rows, 200, 4999)).toHaveLength(0);
  });
});

describe('dedupeByInsee', () => {
  it('keeps the first occurrence when a department and an EPCI overlap', () => {
    const out = dedupeByInsee([commune('89001', 'First'), commune('89002'), commune('89001', 'Again')]);
    expect(out.map((c) => c.nom)).toEqual(['First', 'X']);
  });
});

describe('planTerritory', () => {
  const rows = [commune('89001', 'A', 120), commune('89002', 'B', 300), commune('89003', 'C', 50)];

  it('creates the unknown, skips the existing without touching it', () => {
    const items = planTerritory(rows, new Map([['89002', 300]]), false);
    expect(items.map((i) => i.status)).toEqual(['CREATED', 'SKIPPED', 'CREATED']);
    expect(items[1].reason).toBe('ALREADY_EXISTS');
  });

  it('updates only a differing population, and only behind the flag', () => {
    const existing = new Map<string, number | null>([
      ['89001', 100],
      ['89002', 300],
    ]);
    const withFlag = planTerritory(rows, existing, true);
    expect(withFlag.map((i) => i.status)).toEqual(['UPDATED', 'SKIPPED', 'CREATED']);
    const withoutFlag = planTerritory(rows, existing, false);
    expect(withoutFlag.map((i) => i.status)).toEqual(['SKIPPED', 'SKIPPED', 'CREATED']);
  });

  it('fills a population the base does not know yet', () => {
    const items = planTerritory([commune('89001', 'A', 120)], new Map([['89001', null]]), true);
    expect(items[0].status).toBe('UPDATED');
  });

  it('never "updates" toward an unknown population', () => {
    const items = planTerritory([commune('89001', 'A')], new Map([['89001', 100]]), true);
    expect(items[0].status).toBe('SKIPPED');
  });
});
