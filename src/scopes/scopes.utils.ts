import { OutOfScopeAccess, Prisma, PrismaClient, Scope } from '@prisma/client';
import { apiError } from '@/common/api-error';
import { PrismaService } from '@/prisma/prisma.service';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { ScopeResponseDto } from './dto/response-scope.dto';
import { ScopeContext, ScopeService } from './scope.service';
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
/**
 * Closure review L1 — the point-access twin of whereVisible's campaign criterion: access()
 * reads org.campaignIds, which no standard query loads. Hydrates the memberships that matter
 * to THIS context (one query, only when the scope carries campaigns).
 */
export async function hydrateCampaignMembership(
  db: { campaignOrganization: { findMany: (args: unknown) => Promise<{ organizationId: string; campaignId: string }[]> } },
  ctx: ScopeContext,
  organizations: { id: string; campaignIds?: string[] }[],
): Promise<void> {
  const wanted = ctx.scope?.campaignIds ?? [];
  if (!wanted.length || !organizations.length) return;
  const rows = await db.campaignOrganization.findMany({
    where: { campaignId: { in: wanted }, organizationId: { in: organizations.map((o) => o.id) } },
    select: { organizationId: true, campaignId: true },
  });
  const byOrg = new Map<string, string[]>();
  for (const row of rows) {
    const list = byOrg.get(row.organizationId) ?? [];
    list.push(row.campaignId);
    byOrg.set(row.organizationId, list);
  }
  for (const org of organizations) org.campaignIds = byOrg.get(org.id) ?? [];
}

/**
 * Closure review L1 — the NONE-hides-records merge, in ONE place: a NONE role gets the scope
 * fragment ANDed into the where; RESTRICTED/FULL roles see every row (projection applies later).
 */
export function mergeVisibilityWhere(
  where: { AND?: unknown },
  ctx: ScopeContext,
  scopeService: ScopeService,
): void {
  if (ctx.outOfScopeAccess !== 'NONE') return;
  const scopeWhere = scopeService.whereVisible(ctx);
  if (!Object.keys(scopeWhere).length) return;
  where.AND = [...(Array.isArray(where.AND) ? where.AND : []), scopeWhere];
}

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
