import { FileOwnerType, Prisma, RelationshipStatus, Role, UserStatus } from '@prisma/client';
import { effectivePermissions } from '@/auth/utils/permissions.util';
import { roleVisibleFromProjectWhere } from '@/auth/utils/roles.util';
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
      ...userSearchOr(search).map((clause) => ({ user: clause })),
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

/** The user's own avatar: it goes with the account, so it never holds a deletion back. */
function ownAccountFile(userId: string): Prisma.FileWhereInput {
  return { projectId: null, ownerType: FileOwnerType.USER, ownerId: userId };
}

/**
 * What would lose its author if the account went away — only the non-zero counts.
 * `projectId` null (backoffice account) looks at every project at once.
 */
export async function countUserReferences(
  db: Prisma.TransactionClient,
  userId: string,
  projectId: string | null,
): Promise<Record<string, number>> {
  const scope = projectId ? { projectId } : {};
  const [organizations, opportunities, quotes, contracts, campaigns, activities, files, pricingGrids] =
    await Promise.all([
      db.organization.count({
        where: { ...scope, OR: [{ salesRepId: userId }, { consultantId: userId }, { trainerId: userId }] },
      }),
      db.opportunity.count({ where: { ...scope, ownerId: userId } }),
      db.quote.count({ where: { ...scope, OR: [{ ownerId: userId }, { validatedById: userId }] } }),
      db.contract.count({ where: { ...scope, ownerId: userId } }),
      db.campaign.count({ where: { ...scope, ownerId: userId } }),
      db.activity.count({ where: { ...scope, userId } }),
      db.file.count({ where: { ...scope, uploadedBy: userId, NOT: ownAccountFile(userId) } }),
      db.pricingGrid.count({ where: { ...scope, createdById: userId } }),
    ]);
  const counts = { organizations, opportunities, quotes, contracts, campaigns, activities, files, pricingGrids };
  return Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 0));
}

/**
 * Removes the assignment, and the account itself when it was the last one — the pattern of
 * soft-m `removeMembership`. An account still referenced somewhere else (a project the user
 * left earlier) is kept: deleting it would erase the author of records nobody asked about.
 * Returns the storage objects to delete once the transaction is committed.
 */
export async function removeAssignmentAndMaybeAccount(
  tx: Prisma.TransactionClient,
  userId: string,
  relationId: string,
): Promise<{ accountDeleted: boolean; objectKeys: string[] }> {
  await tx.userRoleProject.delete({ where: { id: relationId } });
  const remaining = await tx.userRoleProject.count({ where: { userId } });
  if (remaining > 0) return { accountDeleted: false, objectKeys: [] };

  const elsewhere = await countUserReferences(tx, userId, null);
  if (Object.keys(elsewhere).length > 0) return { accountDeleted: false, objectKeys: [] };

  const avatars = await tx.file.findMany({ where: ownAccountFile(userId), select: { filePath: true } });
  await tx.file.deleteMany({ where: ownAccountFile(userId) });
  // Sessions and tokens follow through the schema cascades
  await tx.user.delete({ where: { id: userId } });
  return { accountDeleted: true, objectKeys: avatars.map((file) => file.filePath) };
}

/**
 * Best effort, once the transaction is committed: the rows are already gone, an object left
 * behind in MinIO is not worth failing a deletion the caller saw succeed.
 */
export async function deleteAvatarObjects(
  storage: { deleteObject(projectId: string | null, userId: string, objectKey: string): Promise<void> },
  userId: string,
  objectKeys: string[],
): Promise<void> {
  await Promise.all(objectKeys.map((key) => storage.deleteObject(null, userId, key).catch(() => undefined)));
}

/** Role assignable on this project: a non-backoffice system role, or a role of the project. */
export async function resolveRoleOrThrow(
  db: Pick<PrismaService, 'role'> | Prisma.TransactionClient,
  projectId: string,
  roleCode: string,
): Promise<Role> {
  const role = await db.role.findFirst({ where: { code: roleCode, ...roleVisibleFromProjectWhere(projectId) } });
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

/** SUSPENDED assignment wins over the account status (users and backoffice screens). */
export function compositeStatus(relationStatus: RelationshipStatus, accountStatus: UserStatus): ProjectUserStatus {
  if (relationStatus === RelationshipStatus.SUSPENDED) return ProjectUserStatus.SUSPENDED;
  return accountStatus as unknown as ProjectUserStatus;
}

/** Case-insensitive search on the account identity fields. */
export function userSearchOr(search: string): Prisma.UserWhereInput[] {
  return [
    { email: { contains: search, mode: 'insensitive' } },
    { firstName: { contains: search, mode: 'insensitive' } },
    { lastName: { contains: search, mode: 'insensitive' } },
  ];
}

export function mapToUserListItem(rel: RelationWithAccess): UserListItemResponseDto {
  const overrides = rel.user.overrides.filter((o) => o.projectId === rel.projectId);
  return {
    id: rel.userId,
    email: rel.user.email,
    firstName: rel.user.firstName,
    lastName: rel.user.lastName,
    initials: rel.initials,
    status: compositeStatus(rel.status, rel.user.status),
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
