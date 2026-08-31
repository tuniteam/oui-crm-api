import { OutOfScopeAccess, ScopeType } from '@prisma/client';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { buildScopeWhere } from './scope-filter.util';

const userWith = (scope: ScopeType | null, projectId: string | null = 'p1'): AuthenticatedUser => ({
  id: 'u1',
  email: 'u1@example.com',
  firstName: 'U',
  lastName: 'One',
  sessionId: 's1',
  relations: [
    {
      roleId: 'r',
      roleCode: 'X',
      isBackoffice: projectId === null,
      outOfScopeAccess: OutOfScopeAccess.FULL,
      projectId,
      projectName: null,
      projectSlug: null,
      scopeId: null,
      initials: 'XX',
      expiresAt: null,
      permissions: scope ? [{ code: 'quotes:read', scope, source: 'ROLE' }] : [],
      features: [],
    },
  ],
});

describe('buildScopeWhere (SPEC-02 §4.1)', () => {
  it('ALL → no restriction', () => {
    expect(buildScopeWhere(userWith(ScopeType.ALL, null), 'quotes:read', 'p1')).toEqual({});
  });

  it('PROJECT → restricted to the project', () => {
    expect(buildScopeWhere(userWith(ScopeType.PROJECT), 'quotes:read', 'p1')).toEqual({ projectId: 'p1' });
  });

  it('OWN → restricted to the project and the caller, on the requested owner field', () => {
    expect(buildScopeWhere(userWith(ScopeType.OWN), 'quotes:read', 'p1')).toEqual({
      projectId: 'p1',
      ownerId: 'u1',
    });
    expect(buildScopeWhere(userWith(ScopeType.OWN), 'quotes:read', 'p1', 'salesRepId')).toEqual({
      projectId: 'p1',
      salesRepId: 'u1',
    });
  });

  it('no grant → matches nothing', () => {
    expect(buildScopeWhere(userWith(null), 'quotes:read', 'p1')).toEqual({ id: { in: [] } });
  });
});
