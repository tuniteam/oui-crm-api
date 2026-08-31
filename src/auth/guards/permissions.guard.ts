import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { apiError } from '@/common/api-error';
import { PERMISSIONS_KEY, PermissionMetadata } from '../decorators/permissions.decorator';
import { RequestWithScope } from '../types/request-with-scope.interface';
import { findPermission } from '../utils/permissions.util';
import { buildScopeWhere } from '../utils/scope-filter.util';

/**
 * Third guard (SPEC-02 §4.1). The route's permission must be granted, for the current project
 * (req.projectId, or the backoffice level when the route is not project-scoped), by one of the
 * caller's relations — already corrected by overrides in JwtStrategy. Fills
 * req.scopeFilter[code] with the Prisma where fragment of the granted scope.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.get<PermissionMetadata[]>(PERMISSIONS_KEY, ctx.getHandler()) ?? [];
    if (!required.length) return true;

    const req = ctx.switchToHttp().getRequest<RequestWithScope>();
    const user = req.user;
    if (!user) throw apiError.unauthorized('UNAUTHORIZED');

    const projectId = req.projectId ?? null;
    for (const perm of required) {
      if (findPermission(user, projectId, perm.code)) {
        req.scopeFilter = {
          ...(req.scopeFilter ?? {}),
          [perm.code]: buildScopeWhere(user, perm.code, projectId, perm.ownerField),
        };
        return true;
      }
    }

    throw apiError.forbidden('ACCESS_DENIED');
  }
}
