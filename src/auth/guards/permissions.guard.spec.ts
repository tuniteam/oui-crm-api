import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OutOfScopeAccess, ScopeType } from '@prisma/client';
import { PermissionMetadata } from '../decorators/permissions.decorator';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { PermissionsGuard } from './permissions.guard';

const sales: AuthenticatedUser = {
  id: 'u1',
  email: 'u1@example.com',
  firstName: 'U',
  lastName: 'One',
  sessionId: 's1',
  relations: [
    {
      roleId: 'r',
      roleCode: 'SALES_REP',
      isBackoffice: false,
      outOfScopeAccess: OutOfScopeAccess.RESTRICTED,
      projectId: 'p1',
      projectName: 'Périscolia',
      projectSlug: 'periscolia',
      scopeId: null,
      initials: 'WB',
      expiresAt: null,
      permissions: [
        { code: 'quotes:read', scope: ScopeType.OWN, source: 'ROLE' },
        { code: 'organizations:read', scope: ScopeType.PROJECT, source: 'ROLE' },
      ],
      features: [],
    },
  ],
};

function contextFor(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => 'handler',
    getClass: () => 'class',
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard (SPEC-02 §4.1)', () => {
  let required: PermissionMetadata[] | undefined;
  const reflector = { get: jest.fn(() => required) } as unknown as Reflector;
  const guard = new PermissionsGuard(reflector);

  it('lets routes without @Permissions through', () => {
    required = undefined;
    expect(guard.canActivate(contextFor({}))).toBe(true);
  });

  it('rejects an unauthenticated request', () => {
    required = [{ code: 'quotes:read' }];
    expect(() => guard.canActivate(contextFor({}))).toThrow(UnauthorizedException);
  });

  it('403 ACCESS_DENIED when no listed permission is granted for the project', () => {
    required = [{ code: 'quotes:delete' }];
    expect(() => guard.canActivate(contextFor({ user: sales, projectId: 'p1' }))).toThrow(ForbiddenException);
  });

  it('403 ACCESS_DENIED when the permission is granted on another project', () => {
    required = [{ code: 'quotes:read' }];
    expect(() => guard.canActivate(contextFor({ user: sales, projectId: 'p2' }))).toThrow(ForbiddenException);
  });

  it('fills req.scopeFilter[code] with the granted scope (OWN → owner field)', () => {
    required = [{ code: 'quotes:read', ownerField: 'ownerId' }];
    const req: Record<string, unknown> = { user: sales, projectId: 'p1' };
    expect(guard.canActivate(contextFor(req))).toBe(true);
    expect(req.scopeFilter).toEqual({ 'quotes:read': { projectId: 'p1', ownerId: 'u1' } });
  });

  it('uses the first granted permission of the list', () => {
    required = [{ code: 'quotes:delete' }, { code: 'organizations:read' }];
    const req: Record<string, unknown> = { user: sales, projectId: 'p1' };
    expect(guard.canActivate(contextFor(req))).toBe(true);
    expect(req.scopeFilter).toEqual({ 'organizations:read': { projectId: 'p1' } });
  });
});
