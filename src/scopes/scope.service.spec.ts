import { CustomerStatus, OutOfScopeAccess, ScopeNature } from '@prisma/client';
import { resolveDepartments } from './geo.constants';
import { ScopeContext, ScopedOrganization, ScopeService } from './scope.service';

const service = new ScopeService();

const ctx = (over: Partial<ScopeContext> = {}, scope: Partial<NonNullable<ScopeContext['scope']>> | null = {}): ScopeContext => ({
  userId: 'u1',
  outOfScopeAccess: OutOfScopeAccess.RESTRICTED,
  scope:
    scope === null
      ? null
      : { regions: [], departments: [], portfolioOnly: false, nature: ScopeNature.ALL, campaignIds: [], ...scope },
  ...over,
});

const org = (over: Partial<ScopedOrganization> = {}): ScopedOrganization => ({
  department: '14',
  salesRepId: null,
  consultantId: null,
  trainerId: null,
  customerStatus: CustomerStatus.NOT_CUSTOMER,
  ...over,
});

describe('resolveDepartments (GET /geo/regions table)', () => {
  it('expands regions, merges explicit departments, dedupes and sorts', () => {
    expect(resolveDepartments(['Normandie'], ['76', '89'])).toEqual(['14', '27', '50', '61', '76', '89']);
  });

  it('ignores unknown regions', () => {
    expect(resolveDepartments(['Atlantide'], [])).toEqual([]);
  });
});

describe('ScopeService.whereVisible (SPEC-02 §4.2)', () => {
  it('is unrestricted for FULL out-of-scope access, no scope, or an empty scope', () => {
    expect(service.whereVisible(ctx({ outOfScopeAccess: OutOfScopeAccess.FULL }, { regions: ['Corse'] }))).toEqual({});
    expect(service.whereVisible(ctx({}, null))).toEqual({});
    expect(service.whereVisible(ctx())).toEqual({});
  });

  it('restricts by resolved departments', () => {
    expect(service.whereVisible(ctx({}, { regions: ['Corse'], departments: ['06'] }))).toEqual({
      department: { in: ['06', '2A', '2B'] },
    });
  });

  it('ANDs departments, portfolio, nature and campaigns', () => {
    const where = service.whereVisible(
      ctx({}, { regions: ['Corse'], portfolioOnly: true, nature: ScopeNature.CUSTOMERS, campaignIds: ['c1'] }),
    );
    expect(where).toEqual({
      AND: [
        { department: { in: ['2A', '2B'] } },
        { OR: [{ salesRepId: 'u1' }, { consultantId: 'u1' }, { trainerId: 'u1' }] },
        { customerStatus: { not: CustomerStatus.NOT_CUSTOMER } },
        { campaigns: { some: { campaignId: { in: ['c1'] } } } },
      ],
    });
  });
});

describe('ScopeService.access', () => {
  const normandy = ctx({}, { regions: ['Normandie'] });

  it('FULL inside the scope', () => {
    expect(service.access(normandy, org({ department: '14' }))).toBe('FULL');
  });

  it('RESTRICTED outside the scope for a RESTRICTED role, NONE for a NONE role', () => {
    expect(service.access(normandy, org({ department: '75' }))).toBe('RESTRICTED');
    expect(service.access({ ...normandy, outOfScopeAccess: OutOfScopeAccess.NONE }, org({ department: '75' }))).toBe('NONE');
  });

  it('portfolio-only: inside only when the user owns the record', () => {
    const portfolio = ctx({ outOfScopeAccess: OutOfScopeAccess.NONE }, { portfolioOnly: true });
    expect(service.access(portfolio, org({ trainerId: 'u1' }))).toBe('FULL');
    expect(service.access(portfolio, org({ salesRepId: 'someone-else' }))).toBe('NONE');
  });

  it('nature: prospects-only scope hides customers', () => {
    const prospects = ctx({ outOfScopeAccess: OutOfScopeAccess.NONE }, { nature: ScopeNature.PROSPECTS });
    expect(service.access(prospects, org({ customerStatus: CustomerStatus.NOT_CUSTOMER }))).toBe('FULL');
    expect(service.access(prospects, org({ customerStatus: CustomerStatus.ACTIVE }))).toBe('NONE');
    // Un client résilié reste un client : il sort d'un périmètre PROSPECTS.
    expect(service.access(prospects, org({ customerStatus: CustomerStatus.TERMINATED }))).toBe('NONE');
  });

  it('a record without department is outside any department-restricted scope', () => {
    expect(service.access({ ...normandy, outOfScopeAccess: OutOfScopeAccess.NONE }, org({ department: null }))).toBe('NONE');
  });
});
