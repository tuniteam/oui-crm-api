import { OutOfScopeAccess, RelationshipStatus, ScopeType } from '@prisma/client';
import { AuthenticatedRelation, AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import {
  applyOverrides,
  findPermission,
  hasAllScope,
  isRelationActive,
  relationsForProject,
  userHasPermission,
} from './permissions.util';

const relation = (partial: Partial<AuthenticatedRelation>): AuthenticatedRelation => ({
  roleId: 'role',
  roleCode: 'SALES_REP',
  isBackoffice: false,
  outOfScopeAccess: OutOfScopeAccess.RESTRICTED,
  projectId: 'p1',
  projectName: 'Périscolia',
  projectSlug: 'periscolia',
  scopeId: null,
  initials: 'WB',
  expiresAt: null,
  permissions: [],
  features: [],
  ...partial,
});

const user = (relations: AuthenticatedRelation[]): AuthenticatedUser => ({
  id: 'u1',
  email: 'u1@example.com',
  firstName: 'U',
  lastName: 'One',
  sessionId: 's1',
  relations,
});

describe('applyOverrides (SPEC-06 §2 — removal > addition > role)', () => {
  const role = [
    { code: 'quotes:read', scope: ScopeType.OWN },
    { code: 'quotes:create', scope: ScopeType.OWN },
  ];

  it('keeps role grants without overrides', () => {
    expect(applyOverrides(role, [])).toEqual([
      { code: 'quotes:read', scope: 'OWN', source: 'ROLE' },
      { code: 'quotes:create', scope: 'OWN', source: 'ROLE' },
    ]);
  });

  it('removes a role grant when the override is granted = false', () => {
    const result = applyOverrides(role, [{ code: 'quotes:create', granted: false }]);
    expect(result.map((p) => p.code)).toEqual(['quotes:read']);
  });

  it('adds a missing permission with scope PROJECT when granted = true', () => {
    const result = applyOverrides(role, [{ code: 'quotes:validate', granted: true }]);
    expect(result).toContainEqual({ code: 'quotes:validate', scope: 'PROJECT', source: 'OVERRIDE' });
  });

  it('keeps the role scope when the override adds a permission the role already grants', () => {
    const result = applyOverrides(role, [{ code: 'quotes:read', granted: true }]);
    expect(result).toContainEqual({ code: 'quotes:read', scope: 'OWN', source: 'ROLE' });
    expect(result.filter((p) => p.code === 'quotes:read')).toHaveLength(1);
  });
});

describe('isRelationActive', () => {
  const now = new Date('2026-08-31T10:00:00Z');

  it('rejects SUSPENDED relations', () => {
    expect(isRelationActive({ status: RelationshipStatus.SUSPENDED, expiresAt: null }, now)).toBe(false);
  });

  it('accepts an ACTIVE relation without expiry', () => {
    expect(isRelationActive({ status: RelationshipStatus.ACTIVE, expiresAt: null }, now)).toBe(true);
  });

  it('accepts a relation expiring today (inclusive date)', () => {
    expect(isRelationActive({ status: RelationshipStatus.ACTIVE, expiresAt: new Date('2026-08-31T00:00:00Z') }, now)).toBe(true);
  });

  it('rejects a relation that expired yesterday', () => {
    expect(isRelationActive({ status: RelationshipStatus.ACTIVE, expiresAt: new Date('2026-08-30T00:00:00Z') }, now)).toBe(false);
  });
});

describe('findPermission / relationsForProject / hasAllScope', () => {
  const backoffice = relation({
    roleCode: 'SUPER_ADMIN',
    isBackoffice: true,
    projectId: null,
    projectName: null,
    projectSlug: null,
    initials: 'SA',
    permissions: [{ code: 'quotes:read', scope: ScopeType.ALL, source: 'ROLE' }],
  });
  const sales = relation({
    permissions: [{ code: 'quotes:read', scope: ScopeType.OWN, source: 'ROLE' }],
  });

  it('only considers the relations of the requested project plus backoffice ones', () => {
    const u = user([sales, relation({ projectId: 'p2', initials: 'XX' }), backoffice]);
    expect(relationsForProject(u, 'p1').map((r) => r.projectId)).toEqual(['p1', null]);
  });

  it('returns undefined when the permission is not granted for the project', () => {
    expect(findPermission(user([sales]), 'p2', 'quotes:read')).toBeUndefined();
    expect(userHasPermission(user([sales]), 'p1', 'quotes:delete')).toBe(false);
  });

  it('prefers the widest scope when several relations grant the same code', () => {
    expect(findPermission(user([sales, backoffice]), 'p1', 'quotes:read')?.scope).toBe('ALL');
  });

  it('hasAllScope is true only for backoffice relations with scope ALL', () => {
    expect(hasAllScope(user([backoffice]), 'quotes:read')).toBe(true);
    expect(hasAllScope(user([sales]), 'quotes:read')).toBe(false);
    const projectAll = relation({ permissions: [{ code: 'quotes:read', scope: ScopeType.ALL, source: 'ROLE' }] });
    expect(hasAllScope(user([projectAll]), 'quotes:read')).toBe(false);
  });
});
