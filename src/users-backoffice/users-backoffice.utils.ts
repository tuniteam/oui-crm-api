import { Prisma, RelationshipStatus, Role, UserStatus } from '@prisma/client';
import { BACKOFFICE_ROLE_WHERE } from '@/auth/utils/roles.util';
import { apiError } from '@/common/api-error';
import { PrismaService } from '@/prisma/prisma.service';
import { ProjectUserStatus } from '@/users/users.constants';
import { compositeStatus, userSearchOr } from '@/users/users.utils';
import { BackofficeUserResponseDto } from './dto/response-user-backoffice.dto';

/** The backoffice relation of a user: no project, backoffice role. */
export const backofficeRelation = Prisma.validator<Prisma.UserRoleProjectDefaultArgs>()({
  include: { user: true, role: true },
});
export type BackofficeRelation = Prisma.UserRoleProjectGetPayload<typeof backofficeRelation>;

export const BACKOFFICE_RELATION_WHERE: Prisma.UserRoleProjectWhereInput = { projectId: null, role: { isBackoffice: true } };

export function buildBackofficeWhere(filters: { search?: string; status?: ProjectUserStatus }): Prisma.UserRoleProjectWhereInput {
  const where: Prisma.UserRoleProjectWhereInput = { ...BACKOFFICE_RELATION_WHERE };
  const user: Prisma.UserWhereInput = {};

  if (filters.status === ProjectUserStatus.SUSPENDED) {
    where.status = RelationshipStatus.SUSPENDED;
  } else if (filters.status) {
    where.status = RelationshipStatus.ACTIVE;
    user.status = filters.status as unknown as UserStatus;
  }
  if (filters.search) user.OR = userSearchOr(filters.search);
  if (Object.keys(user).length) where.user = user;
  return where;
}

/** 404 USER_NOT_FOUND also when the user exists but is not a backoffice account (no leak). */
export async function getBackofficeRelationOrThrow(
  db: Pick<PrismaService, 'userRoleProject'> | Prisma.TransactionClient,
  userId: string,
): Promise<BackofficeRelation> {
  const relation = await db.userRoleProject.findFirst({ where: { ...BACKOFFICE_RELATION_WHERE, userId }, ...backofficeRelation });
  if (!relation) throw apiError.notFound('USER_NOT_FOUND');
  return relation;
}

/** Only a backoffice system role can be assigned here (soft-m: getRoleBackofficeOrThrow). */
export async function resolveBackofficeRoleOrThrow(
  db: Pick<PrismaService, 'role'> | Prisma.TransactionClient,
  roleCode: string,
): Promise<Role> {
  const role = await db.role.findFirst({ where: { code: roleCode, ...BACKOFFICE_ROLE_WHERE } });
  if (!role) throw apiError.badRequest('INVALID_ROLE');
  return role;
}

export function mapToBackofficeUser(rel: BackofficeRelation): BackofficeUserResponseDto {
  return {
    id: rel.userId,
    email: rel.user.email,
    firstName: rel.user.firstName,
    lastName: rel.user.lastName,
    status: compositeStatus(rel.status, rel.user.status),
    roleCode: rel.role.code,
    roleLabel: rel.role.label,
    lastLoginAt: rel.user.lastLoginAt,
    createdAt: rel.user.createdAt,
  };
}
