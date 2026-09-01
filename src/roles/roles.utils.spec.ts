import { OutOfScopeAccess, ScopeType } from '@prisma/client';
import { buildRolesWhere, mapToPermissionItem, mapToRoleResponse, RoleWithGrants } from './roles.utils';

const role = (over: Partial<RoleWithGrants> = {}): RoleWithGrants =>
  ({
    id: 'r1',
    projectId: null,
    code: 'SALES_REP',
    label: 'Sales representative',
    isBackoffice: false,
    isSystem: true,
    outOfScopeAccess: OutOfScopeAccess.RESTRICTED,
    createdAt: new Date(),
    updatedAt: new Date(),
    permissions: [
      { id: 'rp1', roleId: 'r1', permissionId: 'p1', scope: ScopeType.OWN, permission: { id: 'p1', code: 'quotes:read', label: 'Read quotes' } },
    ],
    ...over,
  }) as RoleWithGrants;

describe('roles.utils (US-00-06)', () => {
  it('buildRolesWhere: non-backoffice system roles + the project roles, nothing else', () => {
    expect(buildRolesWhere('p1')).toEqual({
      OR: [{ projectId: null, isSystem: true, isBackoffice: false }, { projectId: 'p1' }],
    });
  });

  it('mapToRoleResponse flattens grants and carries the usage count', () => {
    expect(mapToRoleResponse(role(), 3)).toEqual({
      id: 'r1',
      code: 'SALES_REP',
      label: 'Sales representative',
      isSystem: true,
      outOfScopeAccess: 'RESTRICTED',
      permissions: [{ code: 'quotes:read', scope: 'OWN' }],
      usersCount: 3,
    });
  });

  it('mapToPermissionItem splits module:action', () => {
    expect(mapToPermissionItem({ id: 'p', code: 'quotes:discountAboveCap', label: 'Grant a discount above the cap on quotes' })).toEqual({
      code: 'quotes:discountAboveCap',
      module: 'quotes',
      action: 'discountAboveCap',
      label: 'Grant a discount above the cap on quotes',
    });
  });
});
