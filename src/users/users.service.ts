import { Injectable } from '@nestjs/common';
import { Prisma, RelationshipStatus, UserStatus } from '@prisma/client';
import { ActivationService } from '@/auth/activation.service';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { AuditLogService } from '@/audit-log/audit-log.service';
import { AUDIT_OBJECTS } from '@/audit-log/audit-log.constants';
import { apiError } from '@/common/api-error';
import { PRISMA_ERROR } from '@/common/constants/app.constants';
import { buildPaginationMeta, paginationSkip } from '@/common/dto/pagination.dto';
import { toDate } from '@/common/utils/date.utils';
import { normalizeEmail } from '@/common/utils/email.utils';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateUserDto, CreateUserResponseDto } from './dto/create-user.dto';
import { UserListQueryDto } from './dto/query-user-list.dto';
import { UserDetailResponseDto, UserListResponseDto } from './dto/response-user.dto';
import { SetOverridesDto } from './dto/set-overrides.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { USERS_AUDIT } from './users.constants';
import {
  assertScopeInProject,
  buildUserWhere,
  getRelationOrThrow,
  mapToUserDetail,
  mapToUserListItem,
  relationWithAccess,
  resolveRoleOrThrow,
} from './users.utils';

const expiresAtOf = (dto: CreateUserDto): Date | null => (dto.expiresAt ? toDate(dto.expiresAt) : null);

/** US-00-05 — users of the current project, always addressed through their assignment. */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activationService: ActivationService,
    private readonly audit: AuditLogService,
  ) {}

  async findAll(projectId: string, query: UserListQueryDto): Promise<UserListResponseDto> {
    const { page, limit, ...filters } = query;
    const where = buildUserWhere(projectId, filters);
    const [total, relations] = await Promise.all([
      this.prisma.userRoleProject.count({ where }),
      this.prisma.userRoleProject.findMany({
        where,
        skip: paginationSkip(page, limit),
        take: limit,
        orderBy: [{ initials: 'asc' }],
        ...relationWithAccess,
      }),
    ]);
    return { data: relations.map(mapToUserListItem), meta: buildPaginationMeta(total, page, limit) };
  }

  async findOne(projectId: string, userId: string): Promise<UserDetailResponseDto> {
    return mapToUserDetail(await getRelationOrThrow(this.prisma, projectId, userId));
  }

  /**
   * Globally unique e-mail: unknown → PENDING user + activation e-mail; already existing on
   * another project → attached (next displayOrder), never recreated.
   */
  async create(projectId: string, dto: CreateUserDto, actor: AuthenticatedUser): Promise<CreateUserResponseDto> {
    const email = normalizeEmail(dto.email);
    if (dto.isExternal && !dto.expiresAt) throw apiError.badRequest('EXPIRATION_REQUIRED_FOR_EXTERNAL');

    const role = await resolveRoleOrThrow(this.prisma, projectId, dto.roleCode);
    if (dto.scopeId) await assertScopeInProject(this.prisma, projectId, dto.scopeId);

    const existing = await this.prisma.user.findUnique({
      where: { email },
      include: { userRoleProjects: { select: { id: true, projectId: true, displayOrder: true, status: true, initials: true } } },
    });
    const onProject = existing?.userRoleProjects.find((r) => r.projectId === projectId);
    if (onProject?.status === RelationshipStatus.ACTIVE) {
      throw apiError.conflict('EMAIL_EXISTS_FOR_PROJECT');
    }
    if (onProject) {
      // Suspended assignment: re-creating the user REACTIVATES it with the submitted role/scope
      return this.reactivate(projectId, existing!.id, onProject.id, dto, role.id, expiresAtOf(dto), actor);
    }
    await this.assertInitialsFree(projectId, dto.initials);

    const expiresAt = expiresAtOf(dto);
    const nextOrder = existing
      ? Math.max(0, ...existing.userRoleProjects.map((r) => r.displayOrder)) + 1
      : 1;

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const target =
          existing ??
          (await tx.user.create({
            data: { email, password: '', firstName: dto.firstName, lastName: dto.lastName, status: UserStatus.PENDING },
          }));
        await tx.userRoleProject.create({
          data: {
            userId: target.id,
            projectId,
            roleId: role.id,
            scopeId: dto.scopeId ?? null,
            initials: dto.initials,
            status: RelationshipStatus.ACTIVE,
            displayOrder: nextOrder,
            expiresAt,
          },
        });
        await this.audit.log(tx, {
          projectId,
          userId: actor.id,
          action: existing ? USERS_AUDIT.ATTACH : USERS_AUDIT.CREATE,
          objectType: AUDIT_OBJECTS.USER,
          objectId: target.id,
          metadata: { email, roleCode: role.code },
        });
        return target;
      });

      // Activation e-mail outside the transaction (SMTP must not hold it); PENDING only
      if (!existing) await this.activationService.sendActivationToken(user.id);
      return { id: user.id, status: existing ? existing.status : UserStatus.PENDING };
    } catch (err) {
      this.rethrowUniqueAsInitials(err);
      throw err;
    }
  }

  async update(projectId: string, userId: string, dto: UpdateUserDto, actor: AuthenticatedUser): Promise<UserDetailResponseDto> {
    if (Object.keys(dto).length === 0) throw apiError.badRequest('EMPTY_UPDATE_PAYLOAD');
    if (dto.roleCode && userId === actor.id) throw apiError.badRequest('CANNOT_UPDATE_OWN_ROLE');

    const relation = await getRelationOrThrow(this.prisma, projectId, userId);
    const role = dto.roleCode ? await resolveRoleOrThrow(this.prisma, projectId, dto.roleCode) : null;
    if (dto.scopeId) await assertScopeInProject(this.prisma, projectId, dto.scopeId);
    if (dto.initials && dto.initials !== relation.initials) {
      await this.assertInitialsFree(projectId, dto.initials);
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        if (dto.firstName !== undefined || dto.lastName !== undefined) {
          await tx.user.update({
            where: { id: userId },
            data: { firstName: dto.firstName, lastName: dto.lastName },
          });
        }
        await tx.userRoleProject.update({
          where: { id: relation.id },
          data: {
            roleId: role?.id,
            initials: dto.initials,
            scopeId: dto.scopeId === undefined ? undefined : dto.scopeId,
            expiresAt: dto.expiresAt === undefined ? undefined : dto.expiresAt ? toDate(dto.expiresAt) : null,
          },
        });
        await this.audit.log(tx, {
          projectId,
          userId: actor.id,
          action: USERS_AUDIT.UPDATE,
          objectType: AUDIT_OBJECTS.USER,
          objectId: userId,
          metadata: { fields: Object.keys(dto) },
        });
      });
    } catch (err) {
      this.rethrowUniqueAsInitials(err);
      throw err;
    }
    return this.findOne(projectId, userId);
  }

  /** Replaces the whole override set (SPEC-06 §2 — removal > addition > role). */
  async setOverrides(projectId: string, userId: string, dto: SetOverridesDto, actor: AuthenticatedUser): Promise<UserDetailResponseDto> {
    const both = dto.added.filter((code) => dto.removed.includes(code));
    if (both.length) throw apiError.badRequest('INVALID_DATA');
    await getRelationOrThrow(this.prisma, projectId, userId);

    const codes = [...dto.added, ...dto.removed];
    const permissions = await this.prisma.permission.findMany({ where: { code: { in: codes } } });
    const byCode = new Map(permissions.map((p) => [p.code, p.id]));
    const missing = codes.find((code) => !byCode.has(code));
    if (missing) throw apiError.badRequest('PERMISSION_NOT_FOUND', missing);

    await this.prisma.$transaction(async (tx) => {
      await tx.userPermissionOverride.deleteMany({ where: { userId, projectId } });
      if (codes.length) {
        await tx.userPermissionOverride.createMany({
          data: [
            ...dto.added.map((code) => ({ userId, projectId, permissionId: byCode.get(code)!, granted: true })),
            ...dto.removed.map((code) => ({ userId, projectId, permissionId: byCode.get(code)!, granted: false })),
          ],
        });
      }
      await this.audit.log(tx, {
        projectId,
        userId: actor.id,
        action: USERS_AUDIT.OVERRIDES_UPDATE,
        objectType: AUDIT_OBJECTS.USER,
        objectId: userId,
        metadata: { added: dto.added, removed: dto.removed },
      });
    });
    return this.findOne(projectId, userId);
  }

  async resendActivation(projectId: string, userId: string, actor: AuthenticatedUser): Promise<{ sent: boolean }> {
    const relation = await getRelationOrThrow(this.prisma, projectId, userId);
    if (relation.user.status !== UserStatus.PENDING) throw apiError.conflict('USER_ALREADY_ACTIVE');
    const result = await this.activationService.sendActivationToken(userId);
    await this.audit.logNow({
      projectId,
      userId: actor.id,
      action: USERS_AUDIT.ACTIVATION_RESEND,
      objectType: AUDIT_OBJECTS.USER,
      objectId: userId,
    });
    return result;
  }

  /**
   * Suspends the assignment (reversible). Sessions are revoked only when the user has no
   * other active assignment — killing them would also log the user out of their other projects.
   */
  async suspend(projectId: string, userId: string, actor: AuthenticatedUser): Promise<void> {
    if (userId === actor.id) throw apiError.badRequest('CANNOT_DELETE_SELF');
    const relation = await getRelationOrThrow(this.prisma, projectId, userId);
    await this.assertNotLastAdmin(projectId, relation.id);

    await this.prisma.$transaction(async (tx) => {
      await tx.userRoleProject.update({
        where: { id: relation.id },
        data: { status: RelationshipStatus.SUSPENDED },
      });
      const remaining = await tx.userRoleProject.count({
        where: { userId, status: RelationshipStatus.ACTIVE },
      });
      if (remaining === 0) await tx.session.deleteMany({ where: { userId } });
      await this.audit.log(tx, {
        projectId,
        userId: actor.id,
        action: USERS_AUDIT.SUSPEND,
        objectType: AUDIT_OBJECTS.USER,
        objectId: userId,
        metadata: { sessionsRevoked: remaining === 0 },
      });
    });
  }

  // ----------------------------------------------------------------------------------------

  /** Re-POST of a suspended assignment: back to ACTIVE with the submitted role/scope/initials. */
  private async reactivate(
    projectId: string,
    userId: string,
    relationId: string,
    dto: CreateUserDto,
    roleId: string,
    expiresAt: Date | null,
    actor: AuthenticatedUser,
  ): Promise<CreateUserResponseDto> {
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        await tx.userRoleProject.update({
          where: { id: relationId },
          data: {
            status: RelationshipStatus.ACTIVE,
            roleId,
            scopeId: dto.scopeId ?? null,
            initials: dto.initials,
            expiresAt,
          },
        });
        await this.audit.log(tx, {
          projectId,
          userId: actor.id,
          action: USERS_AUDIT.REACTIVATE,
          objectType: AUDIT_OBJECTS.USER,
          objectId: userId,
        });
        return tx.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, status: true } });
      });
      return { id: user.id, status: user.status };
    } catch (err) {
      this.rethrowUniqueAsInitials(err);
      throw err;
    }
  }

  private async assertInitialsFree(projectId: string, initials: string): Promise<void> {
    const taken = await this.prisma.userRoleProject.findFirst({
      where: { projectId, initials },
      select: { id: true },
    });
    if (taken) throw apiError.conflict('INITIALS_ALREADY_USED');
  }

  /** Concurrent creation racing the precheck: the (projectId, initials) unique index wins. */
  private rethrowUniqueAsInitials(err: unknown): void {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === PRISMA_ERROR.UNIQUE_VIOLATION) {
      throw apiError.conflict('INITIALS_ALREADY_USED');
    }
  }

  /** An admin = an active assignment whose role grants users:update on the project. */
  private async assertNotLastAdmin(projectId: string, excludedRelationId: string): Promise<void> {
    const admins = await this.prisma.userRoleProject.count({
      where: {
        projectId,
        status: RelationshipStatus.ACTIVE,
        id: { not: excludedRelationId },
        role: { permissions: { some: { permission: { code: 'users:update' } } } },
      },
    });
    if (admins === 0) throw apiError.conflict('USER_IS_LAST_ADMIN');
  }
}
