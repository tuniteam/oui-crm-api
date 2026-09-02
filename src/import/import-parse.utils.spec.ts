import { ReportBuilder, cellBool, csvToRows, normalizeOrgKey, splitList } from './import-parse.utils';

describe('normalizeOrgKey', () => {
  it('matches the same commune through prefixes, case and accents (SPEC-05 §5)', () => {
    const expected = normalizeOrgKey('76', 'Avesnes-en-Val');
    expect(normalizeOrgKey('76', "Mairie d'Avesnes-en-Val")).toBe(expected);
    expect(normalizeOrgKey('76', 'Commune de  AVESNES-EN-VAL')).toBe(expected);
    expect(normalizeOrgKey('76', 'Ville de Avesnes-en-Val')).toBe(expected);
  });

  it('keeps different departments apart', () => {
    expect(normalizeOrgKey('76', 'Rennes')).not.toBe(normalizeOrgKey('35', 'Rennes'));
  });

  it('strips accents without merging distinct names', () => {
    expect(normalizeOrgKey('89', 'Époisses')).toBe(normalizeOrgKey('89', 'epoisses'));
    expect(normalizeOrgKey('89', 'Époisses')).not.toBe(normalizeOrgKey('89', 'Epines'));
  });
});

describe('csvToRows', () => {
  it('reads comma CSV with quoted separators, keyed by header, Excel-style row numbers', () => {
    const rows = csvToRows('name,city\n"Commune, la vraie",Caen\nJoigny,');
    expect(rows).toHaveLength(2);
    expect(rows[0].row).toBe(2);
    expect(rows[0].cells).toEqual({ name: 'Commune, la vraie', city: 'Caen' });
    expect(rows[1].cells.city).toBe('');
  });

  it('detects semicolon files (French Excel default)', () => {
    const rows = csvToRows('name;department\nJoigny;89');
    expect(rows[0].cells).toEqual({ name: 'Joigny', department: '89' });
  });

  it('unescapes doubled quotes', () => {
    const rows = csvToRows('name\n"Mairie ""Le Bourg"""');
    expect(rows[0].cells.name).toBe('Mairie "Le Bourg"');
  });
});

describe('splitList / cellBool', () => {
  it('splits pipe lists and drops blanks', () => {
    expect(splitList(' HOT |  | COLD')).toEqual(['HOT', 'COLD']);
    expect(splitList('')).toEqual([]);
  });

  it('accepts the usual truthy spellings', () => {
    for (const v of ['true', '1', 'OUI', 'x', 'Yes']) expect(cellBool(v)).toBe(true);
    for (const v of ['', 'false', '0', 'non']) expect(cellBool(v)).toBe(false);
  });
});

describe('ReportBuilder', () => {
  it('derives the totals from resources and rows — never counted twice', () => {
    const b = new ReportBuilder();
    b.created('organizations');
    b.created('organizations');
    b.updated('organizations');
    b.skipped('contacts');
    b.error('Organizations', 4, 'UNKNOWN_DEPARTMENT', 'nope', 'department');
    b.warn('Contacts', 9, 'PRIMARY_ALREADY_SET', 'demoted');
    const report = b.build(true);
    expect(report.ok).toBe(false);
    expect(report.totals).toEqual({ created: 2, updated: 1, skipped: 1, errors: 1, warnings: 1 });
    expect(report.resources).toHaveLength(2);
    expect(report.errors[0]).toMatchObject({ sheet: 'Organizations', row: 4, field: 'department' });
    expect(report.batchId).toBeUndefined();
  });

  it('is ok with warnings only, and carries the batch id of a real run', () => {
    const b = new ReportBuilder();
    b.warn('Settings', 2, 'UNKNOWN_SETTING', 'ignored');
    const report = b.build(false, 'cmtk123');
    expect(report.ok).toBe(true);
    expect(report.batchId).toBe('cmtk123');
  });
});
