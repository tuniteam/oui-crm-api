import { Injectable } from '@nestjs/common';
import { RelationshipStatus, UserStatus } from '@prisma/client';
import { ActivationService } from '@/auth/activation.service';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { AuditLogService } from '@/audit-log/audit-log.service';
import { AUDIT_OBJECTS } from '@/audit-log/audit-log.constants';
import { apiError } from '@/common/api-error';
import { isUniqueViolation } from '@/common/utils/prisma.utils';
import { buildPaginationMeta, paginationSkip } from '@/common/dto/pagination.dto';
import { normalizeEmail } from '@/common/utils/email.utils';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateBackofficeUserDto, CreateBackofficeUserResponseDto } from './dto/create-user-backoffice.dto';
import { BackofficeUserListQueryDto } from './dto/query-user-backoffice-list.dto';
import { BackofficeRolesResponseDto, BackofficeUserListResponseDto, BackofficeUserResponseDto } from './dto/response-user-backoffice.dto';
import { UpdateBackofficeUserDto } from './dto/update-user-backoffice.dto';
import { BACKOFFICE_INITIALS, USERS_BACKOFFICE_AUDIT } from './users-backoffice.constants';
import {
  BACKOFFICE_RELATION_WHERE,
  backofficeRelation,
  buildBackofficeWhere,
  getBackofficeRelationOrThrow,
  mapToBackofficeUser,
  resolveBackofficeRoleOrThrow,
} from './users-backoffice.utils';

/** US-00-11 — platform (backoffice) accounts: a dedicated user + one relation without project. */
@Injectable()
export class UsersBackofficeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activationService: ActivationService,
    private readonly audit: AuditLogService,
  ) {}

  async roles(): Promise<BackofficeRolesResponseDto> {
    const roles = await this.prisma.role.findMany({
      where: { projectId: null, isSystem: true, isBackoffice: true },
      orderBy: { code: 'asc' },
      select: { code: true, label: true },
    });
    return { data: roles };
  }

  async findAll(query: BackofficeUserListQueryDto): Promise<BackofficeUserListResponseDto> {
    const { page, limit, ...filters } = query;
    const where = buildBackofficeWhere(filters);
    const [total, relations] = await Promise.all([
      this.prisma.userRoleProject.count({ where }),
      this.prisma.userRoleProject.findMany({
        where,
        skip: paginationSkip(page, limit),
        take: limit,
        orderBy: { user: { createdAt: 'desc' } },
        ...backofficeRelation,
      }),
    ]);
    return { data: relations.map(mapToBackofficeUser), meta: buildPaginationMeta(total, page, limit) };
  }

  async findOne(userId: string): Promise<BackofficeUserResponseDto> {
    return mapToBackofficeUser(await getBackofficeRelationOrThrow(this.prisma, userId));
  }

  /**
   * Dedicated account: the e-mail must be unknown (409 EMAIL_ALREADY_TAKEN), except a suspended
   * backoffice account which is reactivated with the submitted role (same rule as US-00-05).
   */
  async create(dto: CreateBackofficeUserDto, actor: AuthenticatedUser): Promise<CreateBackofficeUserResponseDto> {
    const email = normalizeEmail(dto.email);
    const role = await resolveBackofficeRoleOrThrow(this.prisma, dto.roleCode);

    const existing = await this.prisma.user.findUnique({
      where: { email },
      include: { userRoleProjects: { where: BACKOFFICE_RELATION_WHERE, select: { id: true, status: true } } },
    });
    if (existing) {
      const suspended = existing.userRoleProjects.find((r) => r.status === RelationshipStatus.SUSPENDED);
      if (!suspended) throw apiError.conflict('EMAIL_ALREADY_TAKEN');
      await this.prisma.$transaction(async (tx) => {
        await tx.userRoleProject.update({ where: { id: suspended.id }, data: { status: RelationshipStatus.ACTIVE, roleId: role.id } });
        await this.audit.log(tx, {
          projectId: null,
          userId: actor.id,
          action: USERS_BACKOFFICE_AUDIT.REACTIVATE,
          objectType: AUDIT_OBJECTS.USER,
          objectId: existing.id,
          metadata: { roleCode: role.code },
        });
      });
      return { id: existing.id, status: existing.status };
    }

    let user;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: { email, password: '', firstName: dto.firstName, lastName: dto.lastName, status: UserStatus.PENDING },
        });
        await tx.userRoleProject.create({
          data: { userId: created.id, projectId: null, roleId: role.id, initials: BACKOFFICE_INITIALS, status: RelationshipStatus.ACTIVE },
        });
        await this.audit.log(tx, {
          projectId: null,
          userId: actor.id,
          action: USERS_BACKOFFICE_AUDIT.CREATE,
          objectType: AUDIT_OBJECTS.USER,
          objectId: created.id,
          metadata: { email, roleCode: role.code },
        });
        return created;
      });
    } catch (err) {
      // Concurrent create racing the precheck: the users.email unique index wins
      if (isUniqueViolation(err)) throw apiError.conflict('EMAIL_ALREADY_TAKEN');
      throw err;
    }
    // Activation e-mail outside the transaction (SMTP must not hold it)
    await this.activationService.sendActivationToken(user.id);
    return { id: user.id, status: UserStatus.PENDING };
  }

  async update(userId: string, dto: UpdateBackofficeUserDto, actor: AuthenticatedUser): Promise<BackofficeUserResponseDto> {
    if (Object.keys(dto).length === 0) throw apiError.badRequest('EMPTY_UPDATE_PAYLOAD');
    if (dto.roleCode && userId === actor.id) throw apiError.badRequest('CANNOT_UPDATE_OWN_ROLE');
    const relation = await getBackofficeRelationOrThrow(this.prisma, userId);
    const role = dto.roleCode ? await resolveBackofficeRoleOrThrow(this.prisma, dto.roleCode) : null;

    await this.prisma.$transaction(async (tx) => {
      if (dto.firstName !== undefined || dto.lastName !== undefined) {
        await tx.user.update({ where: { id: userId }, data: { firstName: dto.firstName, lastName: dto.lastName } });
      }
      if (role) await tx.userRoleProject.update({ where: { id: relation.id }, data: { roleId: role.id } });
      await this.audit.log(tx, {
        projectId: null,
        userId: actor.id,
        action: USERS_BACKOFFICE_AUDIT.UPDATE,
        objectType: AUDIT_OBJECTS.USER,
        objectId: userId,
        metadata: { fields: Object.keys(dto) },
      });
    });
    return this.findOne(userId);
  }

  async resendActivation(userId: string, actor: AuthenticatedUser): Promise<{ sent: boolean }> {
    const relation = await getBackofficeRelationOrThrow(this.prisma, userId);
    if (relation.user.status !== UserStatus.PENDING) throw apiError.conflict('USER_ALREADY_ACTIVE');
    const result = await this.activationService.sendActivationToken(userId);
    await this.audit.logNow({
      projectId: null,
      userId: actor.id,
      action: USERS_BACKOFFICE_AUDIT.ACTIVATION_RESEND,
      objectType: AUDIT_OBJECTS.USER,
      objectId: userId,
    });
    return result;
  }

  /**
   * Suspends the backoffice access (reversible by re-POST) and revokes every session.
   * No "last admin" guard: the actor is an active backoffice account and cannot suspend itself.
   */
  async suspend(userId: string, actor: AuthenticatedUser): Promise<void> {
    if (userId === actor.id) throw apiError.badRequest('CANNOT_DELETE_SELF');
    const relation = await getBackofficeRelationOrThrow(this.prisma, userId);

    await this.prisma.$transaction(async (tx) => {
      await tx.userRoleProject.update({ where: { id: relation.id }, data: { status: RelationshipStatus.SUSPENDED } });
      await tx.session.deleteMany({ where: { userId } });
      await this.audit.log(tx, {
        projectId: null,
        userId: actor.id,
        action: USERS_BACKOFFICE_AUDIT.SUSPEND,
        objectType: AUDIT_OBJECTS.USER,
        objectId: userId,
      });
    });
  }
}
