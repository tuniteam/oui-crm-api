import { Request } from 'express';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

/**
 * Express request enriched by the guards:
 * - JwtAuthGuard sets `user`
 * - ProjectGuard sets `projectId` (from the x-project-id header, validated)
 * - PermissionsGuard sets `scopeFilter[permissionCode]` (Prisma where fragment)
 */
export interface RequestWithScope extends Request {
  user: AuthenticatedUser;
  projectId: string;
  scopeFilter?: Record<string, Record<string, unknown>>;
}
