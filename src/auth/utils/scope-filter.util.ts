import { ScopeType } from '@prisma/client';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { findPermission } from './permissions.util';

/**
 * Prisma `where` fragment derived from the scope of an effective permission (SPEC-06 §2):
 * - ALL     → {}                                   (backoffice)
 * - PROJECT → { projectId }                        (whole project)
 * - OWN     → { projectId, [ownerField]: userId }  (only the caller's own objects)
 * - none    → { id: { in: [] } }                   (matches nothing — defensive)
 *
 * `ownerField` depends on the object: `salesRepId` (organizations), `ownerId`
 * (opportunities, quotes, campaigns), `userId` (activities). Default `ownerId`.
 */
export function buildScopeWhere(
  user: AuthenticatedUser,
  permissionCode: string,
  projectId: string | null,
  ownerField = 'ownerId',
): Record<string, unknown> {
  const permission = findPermission(user, projectId, permissionCode);

  switch (permission?.scope) {
    case ScopeType.ALL:
      return {};
    case ScopeType.PROJECT:
      return { projectId: projectId ?? '' };
    case ScopeType.OWN:
      return { projectId: projectId ?? '', [ownerField]: user.id };
    default:
      return { id: { in: [] } };
  }
}
