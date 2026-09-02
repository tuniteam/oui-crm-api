import { OutOfScopeAccess, Prisma, PrismaClient, Scope } from '@prisma/client';
import { apiError } from '@/common/api-error';
import { PrismaService } from '@/prisma/prisma.service';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { ScopeResponseDto } from './dto/response-scope.dto';
import { ScopeContext } from './scope.service';
import { findRegion, resolveDepartments } from './geo.constants';

export async function getScopeOrThrow(
  db: Pick<PrismaService, 'scope'> | Prisma.TransactionClient,
  projectId: string,
  scopeId: string,
): Promise<Scope> {
  const scope = await db.scope.findFirst({ where: { id: scopeId, projectId } });
  if (!scope) throw apiError.notFound('SCOPE_NOT_FOUND', scopeId);
  return scope;
}

/** Region names must exist in the static table (GET /geo/regions). */
export function assertRegionsKnown(regions: readonly string[]): void {
  const unknown = regions.find((name) => !findRegion(name));
  if (unknown) throw apiError.badRequest('INVALID_DATA');
}

export function mapToScopeResponse(scope: Scope, usersCount: number): ScopeResponseDto {
  return {
    id: scope.id,
    name: scope.name,
    description: scope.description,
    regions: scope.regions,
    departments: scope.departments,
    portfolioOnly: scope.portfolioOnly,
    nature: scope.nature,
    campaignIds: scope.campaignIds,
    usersCount,
    resolvedDepartments: resolveDepartments(scope.regions, scope.departments),
  };
}

/**
 * Scope context of a user on a project, ready for ScopeService. The relation carries only the
 * scope id: the criteria live in the Scope row and are loaded here. Backoffice relations
 * (projectId null) and relations without a scope see everything.
 *
 * Shared by every module that filters organizations — never rebuilt per module.
 */
export async function loadScopeContext(
  prisma: PrismaClient | Prisma.TransactionClient,
  user: AuthenticatedUser,
  projectId: string,
): Promise<ScopeContext> {
  const relation =
    user.relations.find((r) => r.projectId === projectId) ??
    user.relations.find((r) => r.isBackoffice);

  const base = { userId: user.id, outOfScopeAccess: relation?.outOfScopeAccess ?? OutOfScopeAccess.FULL };
  if (!relation?.scopeId) return { ...base, scope: null };

  const scope = await prisma.scope.findFirst({
    where: { id: relation.scopeId, projectId },
    select: { regions: true, departments: true, portfolioOnly: true, nature: true, campaignIds: true },
  });
  return { ...base, scope: scope ?? null };
}

/** Every campaign a scope cites must belong to the project (US-01-11 / D7). */
export async function assertCampaignsInProject(
  db: Pick<PrismaService, 'campaign'>,
  projectId: string,
  campaignIds: readonly string[] | undefined,
): Promise<void> {
  if (!campaignIds?.length) return;
  const found = await db.campaign.count({ where: { projectId, id: { in: [...campaignIds] } } });
  if (found !== campaignIds.length) throw apiError.badRequest('INVALID_DATA');
}
