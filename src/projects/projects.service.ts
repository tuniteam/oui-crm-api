import { Injectable, Logger } from '@nestjs/common';
import { FeatureCode, Prisma, ProjectStatus } from '@prisma/client';
import { AuditLogService } from '@/audit-log/audit-log.service';
import { AUDIT_OBJECTS } from '@/audit-log/audit-log.constants';
import { apiError } from '@/common/api-error';
import { PRISMA_ERROR } from '@/common/constants/app.constants';
import { PrismaService } from '@/prisma/prisma.service';
import { buildPaginationMeta, paginationSkip } from '@/common/dto/pagination.dto';
import { CreateProjectDto, CreateProjectResponseDto } from './dto/create-project.dto';
import { ProjectListQueryDto } from './dto/query-project-list.dto';
import {
  ProjectFeaturesResponseDto,
  ProjectListResponseDto,
  ProjectResponseDto,
} from './dto/response-project.dto';
import { ChangeProjectStatusDto } from './dto/change-project-status.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { upsertProjectFeatures } from './project-bootstrap';
import { ProjectBootstrapService } from './project-bootstrap.service';
import { PROJECT_AUDIT, PROJECT_TRANSITIONS } from './projects.constants';
import {
  assertNameMatches,
  assertNotArchived,
  buildProjectWhere,
  getProjectOrThrow,
  mapToFeatures,
  mapToProjectListItem,
  mapToProjectResponse,
  projectWithFeatures,
} from './projects.utils';

/** US-00-04 — platform-level administration of projects (backoffice). */
@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bootstrap: ProjectBootstrapService,
    private readonly audit: AuditLogService,
  ) {}

  async findAll(query: ProjectListQueryDto): Promise<ProjectListResponseDto> {
    const { page, limit, status, search } = query;
    const where = buildProjectWhere({ status, search });
    const [total, projects] = await Promise.all([
      this.prisma.project.count({ where }),
      this.prisma.project.findMany({
        where,
        skip: paginationSkip(page, limit),
        take: limit,
        orderBy: { createdAt: 'asc' },
        ...projectWithFeatures,
      }),
    ]);
    return { data: projects.map(mapToProjectListItem), meta: buildPaginationMeta(total, page, limit) };
  }

  async findOne(id: string): Promise<ProjectResponseDto> {
    return mapToProjectResponse(await getProjectOrThrow(this.prisma, id));
  }

  /** DRAFT project + generic bootstrap (+ optional copy) in one transaction (SPEC-10 §3.1, §3.4). */
  async create(dto: CreateProjectDto, userId: string): Promise<CreateProjectResponseDto> {
    const existing = await this.prisma.project.findUnique({ where: { slug: dto.slug }, select: { id: true } });
    if (existing) throw apiError.conflict('PROJECT_SLUG_EXISTS');
    if (dto.copyFromProjectId) await getProjectOrThrow(this.prisma, dto.copyFromProjectId);

    let project;
    try {
      project = await this.prisma.$transaction(async (tx) => {
        const created = await tx.project.create({
          data: {
            slug: dto.slug,
            name: dto.name,
            productName: dto.productName,
            description: dto.description ?? null,
            status: ProjectStatus.DRAFT,
          },
        });
        await this.bootstrap.bootstrap(tx, created.id);
        if (dto.copyFromProjectId) {
          await this.bootstrap.copyConfigurationData(tx, dto.copyFromProjectId, created.id, userId);
        }
        await this.audit.log(tx, {
          projectId: created.id,
          userId,
          action: PROJECT_AUDIT.CREATE,
          objectType: AUDIT_OBJECTS.PROJECT,
          objectId: created.id,
          metadata: { slug: created.slug, copiedFrom: dto.copyFromProjectId ?? null },
        });
        return created;
      });
    } catch (err) {
      // Concurrent creation with the same slug between the precheck and the write
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === PRISMA_ERROR.UNIQUE_VIOLATION) {
        throw apiError.conflict('PROJECT_SLUG_EXISTS');
      }
      throw err;
    }

    // Template/stamp files are copied AFTER the commit: MinIO I/O must not hold (or roll back
    // with) the transaction. A failure leaves a usable project without templates — logged,
    // recoverable through the settings screens (phase G).
    if (dto.copyFromProjectId) {
      try {
        await this.bootstrap.copyConfigurationFiles(dto.copyFromProjectId, project.id, userId);
      } catch (err) {
        this.logger.error(
          `Configuration files copy failed for project ${project.id}: ${(err as Error).message}`,
        );
      }
    }

    return { id: project.id, slug: project.slug };
  }

  async update(id: string, dto: UpdateProjectDto, userId: string): Promise<CreateProjectResponseDto> {
    if (Object.keys(dto).length === 0) throw apiError.badRequest('EMPTY_UPDATE_PAYLOAD');
    const project = await getProjectOrThrow(this.prisma, id);
    assertNotArchived(project);

    await this.prisma.$transaction(async (tx) => {
      await tx.project.update({ where: { id }, data: dto });
      await this.audit.log(tx, {
        projectId: id,
        userId,
        action: PROJECT_AUDIT.UPDATE,
        objectType: AUDIT_OBJECTS.PROJECT,
        objectId: id,
        metadata: { fields: Object.keys(dto) },
      });
    });
    return { id, slug: project.slug };
  }

  /** The list is the enabled set; every other feature is disabled. */
  async updateFeatures(id: string, enabled: FeatureCode[], userId: string): Promise<ProjectFeaturesResponseDto> {
    const project = await getProjectOrThrow(this.prisma, id);
    assertNotArchived(project);
    const enabledSet = new Set(enabled);

    const rows = await this.prisma.$transaction(async (tx) => {
      const flags = Object.fromEntries(
        Object.values(FeatureCode).map((feature) => [feature, enabledSet.has(feature)]),
      ) as Record<FeatureCode, boolean>;
      const updated = await upsertProjectFeatures(tx, id, flags);
      await this.audit.log(tx, {
        projectId: id,
        userId,
        action: PROJECT_AUDIT.FEATURES_UPDATE,
        objectType: AUDIT_OBJECTS.PROJECT,
        objectId: id,
        metadata: { enabled: [...enabledSet] },
      });
      return updated;
    });
    return { features: mapToFeatures(rows) };
  }

  /**
   * Single status route (decision 31/08/2026): the transition table PROJECT_TRANSITIONS decides
   * what is allowed; archiving requires the project name; the audit entry names the transition.
   */
  async changeStatus(id: string, dto: ChangeProjectStatusDto, userId: string): Promise<void> {
    const project = await getProjectOrThrow(this.prisma, id);
    const action = PROJECT_TRANSITIONS[project.status][dto.status];
    if (!action) throw apiError.conflict('INVALID_STATUS_TRANSITION', project.status);
    if (dto.status === ProjectStatus.ARCHIVED) assertNameMatches(project, dto.name ?? '');

    const activatedAt = project.status === ProjectStatus.DRAFT ? new Date() : undefined;
    await this.prisma.$transaction(async (tx) => {
      await tx.project.update({ where: { id }, data: { status: dto.status, activatedAt } });
      await this.audit.log(tx, {
        projectId: id,
        userId,
        action,
        objectType: AUDIT_OBJECTS.PROJECT,
        objectId: id,
        metadata: { from: project.status, to: dto.status },
      });
    });
  }
}
