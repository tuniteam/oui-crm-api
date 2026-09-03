import { OrganizationWithRefs } from '@/organizations/organizations.mapper';
import { buildExportRow, toCsv } from './exports.utils';

const org = (over: Partial<OrganizationWithRefs> = {}): OrganizationWithRefs =>
  ({
    id: 'o1',
    name: 'Commune de Joigny',
    type: 'COMMUNE',
    department: '89',
    city: 'Joigny',
    postalCode: '89300',
    address: '1 rue de la Mairie',
    siret: '12345678900011',
    inseeCode: '89206',
    population: 9550,
    epci: '248900532',
    salesStatus: 'TO_CONTACT',
    customerStatus: 'NOT_CUSTOMER',
    priority: 'HIGH',
    tags: ['HOT'],
    solution: 'INOE',
    leadSource: 'OUTBOUND',
    email: 'mairie@joigny.fr',
    phone: '03 86 00 00 00',
    website: null,
    schoolCount: 4,
    childCount: 320,
    services: ['CANTINE', 'GARDERIE'],
    completenessScore: 83,
    lastActivityAt: new Date('2026-08-30T00:00:00Z'),
    nextActivityAt: null,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    salesRep: { id: 'u1', firstName: 'Wiem', lastName: 'Bousaid' },
    ...over,
  }) as unknown as OrganizationWithRefs;

const brackets = [{ label: '5 001 à 10 000 hab.', min: 5001, max: 10000 }];

describe('buildExportRow', () => {
  it('fills every requested column of a FULL row, lists piped, dates as days', () => {
    const row = buildExportRow(org(), 'FULL', brackets, [
      'name',
      'bracketLabel',
      'tags',
      'services',
      'salesRep',
      'lastActivityAt',
      'nextActivityAt',
    ]);
    expect(row).toEqual([
      'Commune de Joigny',
      '5 001 à 10 000 hab.',
      'HOT',
      'CANTINE | GARDERIE',
      'Wiem Bousaid',
      '2026-08-30',
      '',
    ]);
  });

  it('a RESTRICTED row only carries the restricted subset — everything else stays empty', () => {
    const row = buildExportRow(org(), 'RESTRICTED', brackets, [
      'name',
      'department',
      'salesStatus',
      'salesRep',
      'siret',
      'population',
      'email',
      'notes' as never,
    ]);
    expect(row.slice(0, 4)).toEqual(['Commune de Joigny', '89', 'TO_CONTACT', 'Wiem Bousaid']);
    expect(row.slice(4, 7)).toEqual(['', '', '']);
  });

  it('respects the requested column order', () => {
    const row = buildExportRow(org(), 'FULL', [], ['department', 'name']);
    expect(row).toEqual(['89', 'Commune de Joigny']);
  });
});

describe('toCsv', () => {
  it('starts with the BOM, separates with ;, ends lines with CRLF', () => {
    const csv = toCsv(['Nom', 'Ville'], [['Joigny', 'Joigny']]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('Nom;Ville\r\nJoigny;Joigny\r\n');
  });

  it('neutralizes formula-leading cells — CSV injection (closure review L1)', () => {
    const csv = toCsv(['A'], [['=HYPERLINK("http://evil")'], ['+33 1 00'], ['-2'], ['@x'], ['safe']]);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+33 1 00");
    expect(csv).toContain("'-2");
    expect(csv).toContain("'@x");
    expect(csv).toContain('safe');
  });

  it('quotes cells holding separators, quotes or line breaks', () => {
    const csv = toCsv(['A'], [['a;b'], ['dit "oui"'], ['ligne\nsuite']]);
    expect(csv).toContain('"a;b"');
    expect(csv).toContain('"dit ""oui"""');
    expect(csv).toContain('"ligne\nsuite"');
  });
});
