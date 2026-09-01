import { Permission, Prisma } from '@prisma/client';
import { apiError } from '@/common/api-error';
import { PrismaService } from '@/prisma/prisma.service';
import { PermissionItemDto, RoleResponseDto } from './dto/response-role.dto';
import { PERMISSION_CODE_SEPARATOR } from './roles.constants';

export const roleWithGrants = Prisma.validator<Prisma.RoleDefaultArgs>()({
  include: { permissions: { include: { permission: true } } },
});
export type RoleWithGrants = Prisma.RoleGetPayload<typeof roleWithGrants>;

/** Roles visible from a project: non-backoffice system roles + the project's own roles. */
export function buildRolesWhere(projectId: string): Prisma.RoleWhereInput {
  return { OR: [{ projectId: null, isSystem: true, isBackoffice: false }, { projectId }] };
}

/** A role editable by the project: its own (non-system). System roles → 403, others → 404. */
export async function getProjectRoleOrThrow(
  db: Pick<PrismaService, 'role'> | Prisma.TransactionClient,
  projectId: string,
  roleId: string,
): Promise<RoleWithGrants> {
  const role = await db.role.findFirst({ where: { id: roleId, ...buildRolesWhere(projectId) }, ...roleWithGrants });
  if (!role) throw apiError.notFound('ROLE_NOT_FOUND', roleId);
  if (role.isSystem || role.projectId !== projectId) throw apiError.forbidden('ROLE_IS_SYSTEM');
  return role;
}

export function mapToRoleResponse(role: RoleWithGrants, usersCount: number): RoleResponseDto {
  return {
    id: role.id,
    code: role.code,
    label: role.label,
    isSystem: role.isSystem,
    outOfScopeAccess: role.outOfScopeAccess,
    permissions: role.permissions.map((rp) => ({ code: rp.permission.code, scope: rp.scope })),
    usersCount,
  };
}

export function mapToPermissionItem(permission: Permission): PermissionItemDto {
  const [module, action] = permission.code.split(PERMISSION_CODE_SEPARATOR);
  return { code: permission.code, module, action, label: permission.label };
}
