import { Injectable } from '@nestjs/common';
import { OutOfScopeAccess, ScopeNature } from '@prisma/client';
import { resolveDepartments } from './geo.constants';

/**
 * Geographic scope of a user for a project, as carried by its assignment (UserRoleProject
 * + Scope + Role.outOfScopeAccess). Pure input: no Prisma dependency.
 */
export interface ScopeContext {
  userId: string;
  outOfScopeAccess: OutOfScopeAccess;
  scope: {
    regions: string[];
    departments: string[];
    portfolioOnly: boolean;
    nature: ScopeNature;
    campaignIds: string[];
  } | null;
}

/** The subset of an organization the scope rules look at (Organization model arrives at L1). */
export interface ScopedOrganization {
  department: string | null;
  salesRepId: string | null;
  consultantId: string | null;
  trainerId: string | null;
  isCustomer: boolean;
  campaignIds?: string[];
}

export type ScopeAccess = 'FULL' | 'RESTRICTED' | 'NONE';

/** Owner columns of an organization that make it part of a user's portfolio. */
export const PORTFOLIO_FIELDS = ['salesRepId', 'consultantId', 'trainerId'] as const;

/**
 * SPEC-02 §4.2 — visibility predicate of a scope, as a Prisma-compatible where fragment on
 * the organization table: `{}` when nothing restricts, else AND of the active criteria.
 * Wired to Organization queries at L1; unit-tested now.
 */
@Injectable()
export class ScopeService {
  /** True when no criterion applies: role sees everything, or no scope / empty scope. */
  isUnrestricted(ctx: ScopeContext): boolean {
    if (ctx.outOfScopeAccess === OutOfScopeAccess.FULL) return true;
    if (!ctx.scope) return true;
    return this.criteria(ctx).length === 0;
  }

  whereVisible(ctx: ScopeContext): Record<string, unknown> {
    if (this.isUnrestricted(ctx)) return {};
    const criteria = this.criteria(ctx);
    return criteria.length === 1 ? criteria[0] : { AND: criteria };
  }

  /**
   * FULL: inside the scope (or unrestricted); RESTRICTED / NONE: outside the scope, per the
   * role's outOfScopeAccess. Evaluated BEFORE loading the full entity (NONE → 404).
   */
  access(ctx: ScopeContext, organization: ScopedOrganization): ScopeAccess {
    if (this.isUnrestricted(ctx) || this.isInside(ctx, organization)) return 'FULL';
    return ctx.outOfScopeAccess === OutOfScopeAccess.RESTRICTED ? 'RESTRICTED' : 'NONE';
  }

  // ----------------------------------------------------------------------------------------

  private criteria(ctx: ScopeContext): Record<string, unknown>[] {
    const scope = ctx.scope!;
    const criteria: Record<string, unknown>[] = [];
    const departments = resolveDepartments(scope.regions, scope.departments);
    if (departments.length) criteria.push({ department: { in: departments } });
    if (scope.portfolioOnly) {
      criteria.push({ OR: PORTFOLIO_FIELDS.map((field) => ({ [field]: ctx.userId })) });
    }
    if (scope.nature !== ScopeNature.ALL) {
      criteria.push({ isCustomer: scope.nature === ScopeNature.CUSTOMERS });
    }
    if (scope.campaignIds.length) criteria.push({ campaignIds: { hasSome: scope.campaignIds } });
    return criteria;
  }

  private isInside(ctx: ScopeContext, org: ScopedOrganization): boolean {
    const scope = ctx.scope!;
    const departments = resolveDepartments(scope.regions, scope.departments);
    if (departments.length && (!org.department || !departments.includes(org.department))) return false;
    if (scope.portfolioOnly && !PORTFOLIO_FIELDS.some((field) => org[field] === ctx.userId)) return false;
    if (scope.nature !== ScopeNature.ALL && org.isCustomer !== (scope.nature === ScopeNature.CUSTOMERS)) return false;
    if (scope.campaignIds.length && !(org.campaignIds ?? []).some((id) => scope.campaignIds.includes(id))) return false;
    return true;
  }
}
