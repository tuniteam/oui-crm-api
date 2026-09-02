import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestWithScope } from '../types/request-with-scope.interface';

/**
 * Injects the Prisma where fragment PermissionsGuard computed for one permission code
 * (ALL → {}, PROJECT → { projectId }, OWN → { projectId, [ownerField]: userId }).
 * Defensive default: a fragment that matches nothing, so a wiring mistake never widens access.
 */
export const ScopeFilter = createParamDecorator(
  (code: string, ctx: ExecutionContext): Record<string, unknown> => {
    const req = ctx.switchToHttp().getRequest<RequestWithScope>();
    return req.scopeFilter?.[code] ?? { id: { in: [] } };
  },
);
