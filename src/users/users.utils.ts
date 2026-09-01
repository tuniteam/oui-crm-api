import { Prisma, RelationshipStatus, Role, UserStatus } from '@prisma/client';
import { effectivePermissions } from '@/auth/utils/permissions.util';
import { apiError } from '@/common/api-error';
import { PrismaService } from '@/prisma/prisma.service';
import {
  UserDetailResponseDto,
  UserListItemResponseDto,
} from './dto/response-user.dto';
import { ProjectUserStatus } from './users.constants';

/** One project assignment with everything the users screens need. */
export const relationWithAccess = Prisma.validator<Prisma.UserRoleProjectDefaultArgs>()({
  include: {
    user: { include: { overrides: { include: { permission: true } } } },
    role: { include: { permissions: { include: { permission: true } } } },
    scope: { select: { id: true, name: true } },
  },
});
export type RelationWithAccess = Prisma.UserRoleProjectGetPayload<typeof relationWithAccess>;

export function buildUserWhere(
  projectId: string,
  filters: { search?: string; roleCode?: string; status?: ProjectUserStatus },
): Prisma.UserRoleProjectWhereInput {
  const where: Prisma.UserRoleProjectWhereInput = { projectId };

  if (filters.roleCode) where.role = { code: filters.roleCode };

  if (filters.status === ProjectUserStatus.SUSPENDED) {
    where.status = RelationshipStatus.SUSPENDED;
  } else if (filters.status) {
    where.status = RelationshipStatus.ACTIVE;
    where.user = { status: filters.status as unknown as UserStatus };
  }

  if (filters.search) {
    const search = filters.search;
    where.OR = [
      { initials: { equals: search, mode: 'insensitive' } },
      { user: { email: { contains: search, mode: 'insensitive' } } },
      { user: { firstName: { contains: search, mode: 'insensitive' } } },
      { user: { lastName: { contains: search, mode: 'insensitive' } } },
    ];
  }
  return where;
}

/** 404 USER_NOT_FOUND also when the user exists but is not assigned to this project (no leak). */
export async function getRelationOrThrow(
  db: Pick<PrismaService, 'userRoleProject'> | Prisma.TransactionClient,
  projectId: string,
  userId: string,
): Promise<RelationWithAccess> {
  const relation = await db.userRoleProject.findFirst({
    where: { projectId, userId },
    ...relationWithAccess,
  });
  if (!relation) throw apiError.notFound('USER_NOT_FOUND');
  return relation;
}

/** Role assignable on this project: a non-backoffice system role, or a role of the project. */
export async function resolveRoleOrThrow(
  db: Pick<PrismaService, 'role'> | Prisma.TransactionClient,
  projectId: string,
  roleCode: string,
): Promise<Role> {
  const role = await db.role.findFirst({
    where: {
      code: roleCode,
      OR: [{ projectId: null, isSystem: true, isBackoffice: false }, { projectId }],
    },
  });
  if (!role) throw apiError.badRequest('INVALID_ROLE');
  return role;
}

export async function assertScopeInProject(
  db: Pick<PrismaService, 'scope'> | Prisma.TransactionClient,
  projectId: string,
  scopeId: string,
): Promise<void> {
  const scope = await db.scope.findFirst({ where: { id: scopeId, projectId }, select: { id: true } });
  if (!scope) throw apiError.notFound('SCOPE_NOT_FOUND', scopeId);
}

function projectStatus(rel: RelationWithAccess): ProjectUserStatus {
  if (rel.status === RelationshipStatus.SUSPENDED) return ProjectUserStatus.SUSPENDED;
  return rel.user.status as unknown as ProjectUserStatus;
}

export function mapToUserListItem(rel: RelationWithAccess): UserListItemResponseDto {
  const overrides = rel.user.overrides.filter((o) => o.projectId === rel.projectId);
  return {
    id: rel.userId,
    email: rel.user.email,
    firstName: rel.user.firstName,
    lastName: rel.user.lastName,
    initials: rel.initials,
    status: projectStatus(rel),
    roleCode: rel.role.code,
    roleLabel: rel.role.label,
    scope: rel.scope,
    expiresAt: rel.expiresAt,
    isExternal: rel.expiresAt !== null,
    overridesCount: {
      added: overrides.filter((o) => o.granted).length,
      removed: overrides.filter((o) => !o.granted).length,
    },
    lastLoginAt: rel.user.lastLoginAt,
  };
}

export function mapToUserDetail(rel: RelationWithAccess): UserDetailResponseDto {
  return {
    ...mapToUserListItem(rel),
    phone: rel.user.phone,
    permissions: effectivePermissions(rel, rel.user.overrides),
  };
}
