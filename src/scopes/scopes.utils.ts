import { Prisma, Scope } from '@prisma/client';
import { apiError } from '@/common/api-error';
import { PrismaService } from '@/prisma/prisma.service';
import { ScopeResponseDto } from './dto/response-scope.dto';
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
    usersCount,
    resolvedDepartments: resolveDepartments(scope.regions, scope.departments),
  };
}
