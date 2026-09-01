import { OutOfScopeAccess, RelationshipStatus, ScopeType, UserStatus } from '@prisma/client';
import { buildUserWhere, mapToUserDetail, mapToUserListItem, RelationWithAccess } from './users.utils';
import { ProjectUserStatus } from './users.constants';

const relation = (over: Partial<RelationWithAccess> = {}): RelationWithAccess =>
  ({
    id: 'urp1',
    userId: 'u1',
    projectId: 'p1',
    roleId: 'role1',
    scopeId: 's1',
    initials: 'WB',
    status: RelationshipStatus.ACTIVE,
    displayOrder: 1,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: {
      id: 'u1',
      email: 'u1@example.com',
      password: 'hash',
      firstName: 'Wiem',
      lastName: 'Bousaid',
      phone: null,
      status: UserStatus.ACTIVE,
      lastLoginAt: new Date('2026-08-31T10:00:00Z'),
      lastLoginIp: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
      passwordChangedAt: null,
      cguVersion: 1,
      cguAcceptedAt: new Date(),
      rgpdVersion: 1,
      rgpdAcceptedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      overrides: [
        {
          id: 'o1',
          userId: 'u1',
          projectId: 'p1',
          permissionId: 'perm2',
          granted: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          permission: { id: 'perm2', code: 'quotes:validate', label: '' },
        },
        {
          id: 'o2',
          userId: 'u1',
          projectId: 'p1',
          permissionId: 'perm3',
          granted: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          permission: { id: 'perm3', code: 'organizations:export', label: '' },
        },
        {
          id: 'o3',
          userId: 'u1',
          projectId: 'OTHER',
          permissionId: 'perm4',
          granted: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          permission: { id: 'perm4', code: 'tickets:read', label: '' },
        },
      ],
    },
    role: {
      id: 'role1',
      projectId: null,
      code: 'SALES_REP',
      label: 'Sales representative',
      isBackoffice: false,
      isSystem: true,
      outOfScopeAccess: OutOfScopeAccess.RESTRICTED,
      createdAt: new Date(),
      updatedAt: new Date(),
      permissions: [
        {
          id: 'rp1',
          roleId: 'role1',
          permissionId: 'perm1',
          scope: ScopeType.OWN,
          permission: { id: 'perm1', code: 'quotes:read', label: '' },
        },
        {
          id: 'rp2',
          roleId: 'role1',
          permissionId: 'perm3',
          scope: ScopeType.PROJECT,
          permission: { id: 'perm3', code: 'organizations:export', label: '' },
        },
      ],
    },
    scope: { id: 's1', name: 'Normandie' },
    ...over,
  }) as RelationWithAccess;

describe('buildUserWhere', () => {
  it('always scopes by project', () => {
    expect(buildUserWhere('p1', {})).toEqual({ projectId: 'p1' });
  });

  it('SUSPENDED filters on the assignment, account statuses on ACTIVE assignments', () => {
    expect(buildUserWhere('p1', { status: ProjectUserStatus.SUSPENDED })).toMatchObject({
      status: RelationshipStatus.SUSPENDED,
    });
    expect(buildUserWhere('p1', { status: ProjectUserStatus.PENDING })).toMatchObject({
      status: RelationshipStatus.ACTIVE,
      user: { status: 'PENDING' },
    });
  });

  it('search covers e-mail, names and initials; roleCode filters the role', () => {
    const where = buildUserWhere('p1', { search: 'wb', roleCode: 'SALES_REP' });
    expect(where.role).toEqual({ code: 'SALES_REP' });
    expect(where.OR).toHaveLength(4);
  });
});

describe('mapToUserListItem / mapToUserDetail (US-00-05)', () => {
  it('maps the row: composite status, isExternal derived, overrides counted for THIS project', () => {
    const item = mapToUserListItem(relation());
    expect(item).toMatchObject({
      id: 'u1',
      initials: 'WB',
      status: 'ACTIVE',
      roleCode: 'SALES_REP',
      roleLabel: 'Sales representative',
      scope: { id: 's1', name: 'Normandie' },
      isExternal: false,
      overridesCount: { added: 1, removed: 1 },
    });
  });

  it('SUSPENDED assignment wins over the account status; expiresAt makes it external', () => {
    const item = mapToUserListItem(
      relation({ status: RelationshipStatus.SUSPENDED, expiresAt: new Date('2027-08-31') }),
    );
    expect(item.status).toBe('SUSPENDED');
    expect(item.isExternal).toBe(true);
  });

  it('detail exposes effective permissions (overrides of this project applied)', () => {
    const detail = mapToUserDetail(relation());
    expect(detail.permissions).toContainEqual({ code: 'quotes:read', scope: 'OWN', source: 'ROLE' });
    expect(detail.permissions).toContainEqual({ code: 'quotes:validate', scope: 'PROJECT', source: 'OVERRIDE' });
    expect(detail.permissions.find((p) => p.code === 'organizations:export')).toBeUndefined();
    expect(detail.permissions.find((p) => p.code === 'tickets:read')).toBeUndefined();
  });
});
