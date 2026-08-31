import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProjectStatus } from '@prisma/client';
import { apiError } from '@/common/api-error';
import { PrismaService } from '@/prisma/prisma.service';
import { PROJECT_ID_HEADER } from '../auth.constants';
import { PERMISSIONS_KEY, PermissionMetadata } from '../decorators/permissions.decorator';
import { PROJECT_SCOPED_KEY } from '../decorators/project-scoped.decorator';
import { RequestWithScope } from '../types/request-with-scope.interface';
import { hasAllScope, isBackofficeUser } from '../utils/permissions.util';

/**
 * Second guard (SPEC-02 §4.1). On @ProjectScoped() routes the x-project-id header is required
 * and must match one of the caller's active relations; a backoffice user whose role grants one
 * of the route's permissions with scope ALL may address any existing project. Sets req.projectId.
 */
@Injectable()
export class ProjectGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<RequestWithScope>();
    const user = req.user;
    if (!user) throw apiError.unauthorized('UNAUTHORIZED');

    const scoped = this.reflector.getAllAndOverride<boolean>(PROJECT_SCOPED_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!scoped) return true;

    const header = req.headers[PROJECT_ID_HEADER];
    const projectId = Array.isArray(header) ? header[0] : header;
    if (!projectId) throw apiError.badRequest('PROJECT_IS_REQUIRED', PROJECT_ID_HEADER);

    // Backoffice with a global (ALL) grant on one of the route's permissions: any project
    const permissions =
      this.reflector.get<PermissionMetadata[]>(PERMISSIONS_KEY, ctx.getHandler()) ?? [];
    if (isBackofficeUser(user) && permissions.some((p) => hasAllScope(user, p.code))) {
      const project = await this.prisma.project.findFirst({ where: { id: projectId }, select: { id: true } });
      if (!project) throw apiError.forbidden('PROJECT_MISMATCH');
      req.projectId = projectId;
      return true;
    }

    // Everyone else: the header must be one of the caller's (active, non-expired) projects,
    // and the project itself must be open (ACTIVE) — DRAFT and ARCHIVED are backoffice-only
    const projectIds = user.relations.map((r) => r.projectId).filter((id): id is string => !!id);
    if (!projectIds.length) throw apiError.forbidden('USER_HAS_NO_PROJECT');
    if (!projectIds.includes(projectId)) throw apiError.forbidden('PROJECT_MISMATCH');

    const project = await this.prisma.project.findFirst({ where: { id: projectId }, select: { status: true } });
    if (!project) throw apiError.forbidden('PROJECT_MISMATCH');
    if (project.status !== ProjectStatus.ACTIVE) throw apiError.forbidden('PROJECT_NOT_ACTIVE');

    req.projectId = projectId;
    return true;
  }
}
