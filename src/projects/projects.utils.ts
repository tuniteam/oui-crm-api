import { FeatureCode, FileOwnerType, Prisma, ProjectStatus } from '@prisma/client';
import { apiError } from '@/common/api-error';
import { PrismaService } from '@/prisma/prisma.service';
import {
  ProjectFeatureDto,
  ProjectListItemResponseDto,
  ProjectResponseDto,
} from './dto/response-project.dto';

export const projectWithFeatures = Prisma.validator<Prisma.ProjectDefaultArgs>()({
  include: {
    features: { orderBy: { feature: 'asc' } },
    _count: { select: { userRoleProjects: true } },
  },
});
export type ProjectWithFeatures = Prisma.ProjectGetPayload<typeof projectWithFeatures>;

export function buildProjectWhere(filters: {
  status?: ProjectStatus;
  search?: string;
}): Prisma.ProjectWhereInput {
  const where: Prisma.ProjectWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.search) {
    where.OR = [
      { slug: { contains: filters.search, mode: 'insensitive' } },
      { name: { contains: filters.search, mode: 'insensitive' } },
      { productName: { contains: filters.search, mode: 'insensitive' } },
    ];
  }
  return where;
}

export async function getProjectOrThrow(
  db: Pick<PrismaService, 'project'> | Prisma.TransactionClient,
  id: string,
): Promise<ProjectWithFeatures> {
  const project = await db.project.findFirst({ where: { id }, ...projectWithFeatures });
  if (!project) throw apiError.notFound('PROJECT_NOT_FOUND', id);
  return project;
}

/** Mutations of the project's content are refused once it is archived. */
export function assertNotArchived(project: { status: ProjectStatus }): void {
  if (project.status === ProjectStatus.ARCHIVED) throw apiError.conflict('PROJECT_ARCHIVED');
}

export function assertNameMatches(project: { name: string }, typedName: string): void {
  if (project.name !== typedName) throw apiError.badRequest('PROJECT_NAME_MISMATCH');
}

/** Business rows that hold a project back from deletion — only the non-zero counts. */
export async function countProjectData(
  db: Prisma.TransactionClient,
  projectId: string,
): Promise<Record<string, number>> {
  const where = { projectId };
  const [organizations, contacts, activities, campaigns, opportunities, quotes, contracts] = await Promise.all([
    db.organization.count({ where }),
    db.contact.count({ where }),
    db.activity.count({ where }),
    db.campaign.count({ where }),
    db.opportunity.count({ where }),
    db.quote.count({ where }),
    db.contract.count({ where }),
  ]);
  const counts = { organizations, contacts, activities, campaigns, opportunities, quotes, contracts };
  return Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 0));
}

/**
 * Members whose account goes with the project: attached to no other project nor to the
 * backoffice, and who uploaded no file that outlives it — `File.uploader` would hold the
 * account back. What dies with the project: its own files and the member's account files.
 */
export function accountsToDelete(
  projectId: string,
  memberIds: string[],
  otherRelations: { userId: string }[],
  uploads: { uploadedBy: string; projectId: string | null; ownerType: FileOwnerType; ownerId: string }[],
): string[] {
  const kept = new Set(otherRelations.map((r) => r.userId));
  for (const file of uploads) {
    const ownAccountFile = file.projectId === null && file.ownerType === FileOwnerType.USER && file.ownerId === file.uploadedBy;
    if (file.projectId !== projectId && !ownAccountFile) kept.add(file.uploadedBy);
  }
  return memberIds.filter((id) => !kept.has(id));
}

/** Every FeatureCode, in enum order, with its enabled flag (missing row = disabled). */
export function mapToFeatures(rows: { feature: FeatureCode; enabled: boolean }[]): ProjectFeatureDto[] {
  const enabled = new Map(rows.map((r) => [r.feature, r.enabled]));
  return Object.values(FeatureCode).map((code) => ({ code, enabled: enabled.get(code) ?? false }));
}

export function mapToProjectListItem(project: ProjectWithFeatures): ProjectListItemResponseDto {
  return {
    id: project.id,
    slug: project.slug,
    name: project.name,
    productName: project.productName,
    status: project.status,
    features: project.features.filter((f) => f.enabled).map((f) => f.feature),
    userCount: project._count.userRoleProjects,
    createdAt: project.createdAt,
  };
}

export function mapToProjectResponse(project: ProjectWithFeatures): ProjectResponseDto {
  return {
    id: project.id,
    slug: project.slug,
    name: project.name,
    productName: project.productName,
    description: project.description,
    status: project.status,
    activatedAt: project.activatedAt,
    features: mapToFeatures(project.features),
    userCount: project._count.userRoleProjects,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}
