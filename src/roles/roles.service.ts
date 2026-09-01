import { Injectable } from '@nestjs/common';
import { Prisma, RelationshipStatus, ScopeType } from '@prisma/client';
import { AUDIT_OBJECTS } from '@/audit-log/audit-log.constants';
import { AuditLogService } from '@/audit-log/audit-log.service';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { apiError } from '@/common/api-error';
import { isForeignKeyViolation, isUniqueViolation } from '@/common/utils/prisma.utils';
import { PRISMA_ERROR } from '@/common/constants/app.constants';
import { PrismaService } from '@/prisma/prisma.service';
import { DuplicateRoleDto, DuplicateRoleResponseDto } from './dto/duplicate-role.dto';
import { PermissionsListResponseDto, RoleResponseDto, RolesListResponseDto } from './dto/response-role.dto';
import { RoleGrantDto, UpdateRoleDto } from './dto/update-role.dto';
import { ROLES_AUDIT } from './roles.constants';
import { buildRolesWhere, getProjectRoleOrThrow, mapToPermissionItem, mapToRoleResponse, roleWithGrants } from './roles.utils';

/** US-00-06 — role matrix of a project: system roles (read-only) and project roles. */
@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async findAll(projectId: string): Promise<RolesListResponseDto> {
    const [roles, counts] = await Promise.all([
      this.prisma.role.findMany({ where: buildRolesWhere(projectId), orderBy: [{ isSystem: 'desc' }, { code: 'asc' }], ...roleWithGrants }),
      this.prisma.userRoleProject.groupBy({
        by: ['roleId'],
        where: { projectId, status: RelationshipStatus.ACTIVE },
        _count: { _all: true },
      }),
    ]);
    const countByRole = new Map(counts.map((c) => [c.roleId, c._count._all]));
    return { data: roles.map((role) => mapToRoleResponse(role, countByRole.get(role.id) ?? 0)) };
  }

  async findPermissions(): Promise<PermissionsListResponseDto> {
    const permissions = await this.prisma.permission.findMany({ orderBy: { code: 'asc' } });
    return { data: permissions.map(mapToPermissionItem) };
  }

  /** Copies a visible role (grants included) into an editable role of the project. */
  async duplicate(projectId: string, sourceId: string, dto: DuplicateRoleDto, actor: AuthenticatedUser): Promise<DuplicateRoleResponseDto> {
    const source = await this.prisma.role.findFirst({ where: { id: sourceId, ...buildRolesWhere(projectId) }, ...roleWithGrants });
    if (!source) throw apiError.notFound('ROLE_NOT_FOUND', sourceId);
    await this.assertCodeFree(projectId, dto.code);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const role = await tx.role.create({
          data: {
            projectId,
            code: dto.code,
            label: dto.label,
            isSystem: false,
            isBackoffice: false,
            outOfScopeAccess: source.outOfScopeAccess,
            permissions: {
              createMany: { data: source.permissions.map((rp) => ({ permissionId: rp.permissionId, scope: rp.scope })) },
            },
          },
        });
        await this.audit.log(tx, {
          projectId,
          userId: actor.id,
          action: ROLES_AUDIT.DUPLICATE,
          objectType: AUDIT_OBJECTS.ROLE,
          objectId: role.id,
          metadata: { from: source.code, code: role.code },
        });
        return role;
      });
      return { id: created.id, code: created.code };
    } catch (err) {
      this.rethrowUniqueAsCode(err);
      throw err;
    }
  }

  async update(projectId: string, roleId: string, dto: UpdateRoleDto, actor: AuthenticatedUser): Promise<RoleResponseDto> {
    if (Object.keys(dto).length === 0) throw apiError.badRequest('EMPTY_UPDATE_PAYLOAD');
    await getProjectRoleOrThrow(this.prisma, projectId, roleId);
    const grants = dto.permissions ? await this.resolveGrants(dto.permissions) : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id: roleId },
        data: { label: dto.label, outOfScopeAccess: dto.outOfScopeAccess },
      });
      if (grants) {
        await tx.rolePermission.deleteMany({ where: { roleId } });
        if (grants.length) await tx.rolePermission.createMany({ data: grants.map((g) => ({ roleId, ...g })) });
      }
      await this.audit.log(tx, {
        projectId,
        userId: actor.id,
        action: ROLES_AUDIT.UPDATE,
        objectType: AUDIT_OBJECTS.ROLE,
        objectId: roleId,
        metadata: { fields: Object.keys(dto) },
      });
    });

    const [role, usersCount] = await Promise.all([
      getProjectRoleOrThrow(this.prisma, projectId, roleId),
      this.prisma.userRoleProject.count({ where: { projectId, roleId, status: RelationshipStatus.ACTIVE } }),
    ]);
    return mapToRoleResponse(role, usersCount);
  }

  async remove(projectId: string, roleId: string, actor: AuthenticatedUser): Promise<void> {
    await getProjectRoleOrThrow(this.prisma, projectId, roleId);
    const inUse = await this.prisma.userRoleProject.count({ where: { projectId, roleId } });
    if (inUse > 0) throw apiError.conflict('ROLE_IN_USE');

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.role.delete({ where: { id: roleId } });
        await this.audit.log(tx, {
          projectId,
          userId: actor.id,
          action: ROLES_AUDIT.DELETE,
          objectType: AUDIT_OBJECTS.ROLE,
          objectId: roleId,
        });
      });
    } catch (err) {
      // Concurrent assignment racing the precheck: onDelete Restrict wins → same 409
      if (isForeignKeyViolation(err)) throw apiError.conflict('ROLE_IN_USE');
      throw err;
    }
  }

  // ----------------------------------------------------------------------------------------

  /** Codes must exist; scope ALL is reserved to backoffice roles (SPEC-06 §4.1). */
  private async resolveGrants(grants: RoleGrantDto[]): Promise<{ permissionId: string; scope: ScopeType }[]> {
    const codes = [...new Set(grants.map((g) => g.code))];
    if (codes.length !== grants.length) throw apiError.badRequest('INVALID_DATA');
    if (grants.some((g) => g.scope === ScopeType.ALL)) throw apiError.badRequest('INVALID_DATA');

    const permissions = await this.prisma.permission.findMany({ where: { code: { in: codes } } });
    const byCode = new Map(permissions.map((p) => [p.code, p.id]));
    const missing = codes.find((code) => !byCode.has(code));
    if (missing) throw apiError.badRequest('PERMISSION_NOT_FOUND', missing);
    return grants.map((g) => ({ permissionId: byCode.get(g.code)!, scope: g.scope }));
  }

  private async assertCodeFree(projectId: string, code: string): Promise<void> {
    const taken = await this.prisma.role.findFirst({
      where: { code, OR: [{ projectId }, { projectId: null }] },
      select: { id: true },
    });
    if (taken) throw apiError.conflict('ROLE_CODE_EXISTS');
  }

  private rethrowUniqueAsCode(err: unknown): void {
    if (isUniqueViolation(err)) {
      throw apiError.conflict('ROLE_CODE_EXISTS');
    }
  }
}
