import { Prisma } from '@prisma/client';

/** Roles assignable/visible from a project: non-backoffice system roles + the project's own. */
export function roleVisibleFromProjectWhere(projectId: string): Prisma.RoleWhereInput {
  return { OR: [{ projectId: null, isSystem: true, isBackoffice: false }, { projectId }] };
}

/** The backoffice system roles (platform accounts, US-00-11). */
export const BACKOFFICE_ROLE_WHERE: Prisma.RoleWhereInput = { projectId: null, isSystem: true, isBackoffice: true };
