import { Injectable } from '@nestjs/common';
import { RelationshipStatus } from '@prisma/client';
import { AUDIT_OBJECTS } from '@/audit-log/audit-log.constants';
import { AuditLogService } from '@/audit-log/audit-log.service';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { apiError } from '@/common/api-error';
import { isUniqueViolation } from '@/common/utils/prisma.utils';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateScopeDto, ScopeIdResponseDto } from './dto/create-scope.dto';
import { GeoRegionsResponseDto, ScopeResponseDto, ScopesListResponseDto } from './dto/response-scope.dto';
import { UpdateScopeDto } from './dto/update-scope.dto';
import { REGIONS } from './geo.constants';
import { SCOPES_AUDIT } from './scopes.constants';
import { assertRegionsKnown, getScopeOrThrow, mapToScopeResponse } from './scopes.utils';

/** US-00-07 — geographic scopes of a project. */
@Injectable()
export class ScopesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async findAll(projectId: string): Promise<ScopesListResponseDto> {
    const [scopes, counts] = await Promise.all([
      this.prisma.scope.findMany({ where: { projectId }, orderBy: { name: 'asc' } }),
      this.prisma.userRoleProject.groupBy({
        by: ['scopeId'],
        where: { projectId, status: RelationshipStatus.ACTIVE, scopeId: { not: null } },
        _count: { _all: true },
      }),
    ]);
    const countByScope = new Map(counts.map((c) => [c.scopeId, c._count._all]));
    return { data: scopes.map((s) => mapToScopeResponse(s, countByScope.get(s.id) ?? 0)) };
  }

  regions(): GeoRegionsResponseDto {
    return { data: REGIONS.map((r) => ({ name: r.name, departments: [...r.departments] })) };
  }

  async create(projectId: string, dto: CreateScopeDto, actor: AuthenticatedUser): Promise<ScopeIdResponseDto> {
    assertRegionsKnown(dto.regions ?? []);
    await this.assertNameFree(projectId, dto.name);

    let scope;
    try {
      scope = await this.prisma.$transaction(async (tx) => {
        const created = await tx.scope.create({
          data: {
          projectId,
          name: dto.name,
          description: dto.description ?? '',
          regions: dto.regions ?? [],
          departments: dto.departments ?? [],
          portfolioOnly: dto.portfolioOnly ?? false,
          nature: dto.nature,
        },
      });
      await this.audit.log(tx, {
        projectId,
        userId: actor.id,
        action: SCOPES_AUDIT.CREATE,
        objectType: AUDIT_OBJECTS.SCOPE,
        objectId: created.id,
        metadata: { name: created.name },
      });
        return created;
      });
    } catch (err) {
      // Concurrent create racing the precheck: the (projectId, name) unique index wins
      if (isUniqueViolation(err)) throw apiError.conflict('SCOPE_NAME_EXISTS');
      throw err;
    }
    return { id: scope.id, name: scope.name };
  }

  async update(projectId: string, scopeId: string, dto: UpdateScopeDto, actor: AuthenticatedUser): Promise<ScopeResponseDto> {
    if (Object.keys(dto).length === 0) throw apiError.badRequest('EMPTY_UPDATE_PAYLOAD');
    const scope = await getScopeOrThrow(this.prisma, projectId, scopeId);
    if (dto.regions) assertRegionsKnown(dto.regions);
    if (dto.name && dto.name !== scope.name) await this.assertNameFree(projectId, dto.name);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.scope.update({ where: { id: scopeId }, data: dto });
      await this.audit.log(tx, {
        projectId,
        userId: actor.id,
        action: SCOPES_AUDIT.UPDATE,
        objectType: AUDIT_OBJECTS.SCOPE,
        objectId: scopeId,
        metadata: { fields: Object.keys(dto) },
      });
      return row;
    });
    const usersCount = await this.prisma.userRoleProject.count({
      where: { projectId, scopeId, status: RelationshipStatus.ACTIVE },
    });
    return mapToScopeResponse(updated, usersCount);
  }

  async remove(projectId: string, scopeId: string, actor: AuthenticatedUser): Promise<void> {
    await getScopeOrThrow(this.prisma, projectId, scopeId);
    const inUse = await this.prisma.userRoleProject.count({ where: { projectId, scopeId } });
    if (inUse > 0) throw apiError.conflict('SCOPE_IN_USE');

    await this.prisma.$transaction(async (tx) => {
      await tx.scope.delete({ where: { id: scopeId } });
      await this.audit.log(tx, {
        projectId,
        userId: actor.id,
        action: SCOPES_AUDIT.DELETE,
        objectType: AUDIT_OBJECTS.SCOPE,
        objectId: scopeId,
      });
    });
  }

  // ----------------------------------------------------------------------------------------

  /** Scope names are unique per project (bootstrap and copy rely on it too). */
  private async assertNameFree(projectId: string, name: string): Promise<void> {
    const taken = await this.prisma.scope.findFirst({ where: { projectId, name }, select: { id: true } });
    if (taken) throw apiError.conflict('SCOPE_NAME_EXISTS');
  }
}
