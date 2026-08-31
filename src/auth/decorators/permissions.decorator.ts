import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

export interface PermissionMetadata {
  /** `module:action`, e.g. 'quotes:create' (catalogue in prisma/seedAuth.ts). */
  code: string;
  /** Column compared to the caller for OWN scope (default 'ownerId'): 'salesRepId', 'userId'… */
  ownerField?: string;
}

/**
 * @Permissions({ code: 'quotes:read' }) — any listed permission grants access; the first one
 * found fills `req.scopeFilter[code]`. Evaluated by PermissionsGuard after ProjectGuard.
 */
export const Permissions = (...permissions: PermissionMetadata[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
