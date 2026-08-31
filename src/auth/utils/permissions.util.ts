import { RelationshipStatus, ScopeType } from '@prisma/client';
import {
  AuthenticatedPermission,
  AuthenticatedRelation,
  AuthenticatedUser,
} from '../interfaces/authenticated-user.interface';

/** Widest scope wins when the same code is granted twice (backoffice + project). */
const SCOPE_RANK: Record<ScopeType, number> = { ALL: 3, PROJECT: 2, OWN: 1 };

export interface PermissionOverrideInput {
  code: string;
  granted: boolean;
}

/**
 * Effective permissions of one relation: role grants corrected by the user's overrides for
 * that project (SPEC-06 §2 — removal > addition > role):
 * - granted = false → the code is removed even if the role grants it;
 * - granted = true  → the code is added with scope PROJECT when the role does not grant it,
 *                     the role scope is kept when it does.
 */
export function applyOverrides(
  rolePermissions: { code: string; scope: ScopeType }[],
  overrides: PermissionOverrideInput[],
): AuthenticatedPermission[] {
  const removed = new Set(overrides.filter((o) => !o.granted).map((o) => o.code));
  const effective = new Map<string, AuthenticatedPermission>();

  for (const p of rolePermissions) {
    if (!removed.has(p.code)) {
      effective.set(p.code, { code: p.code, scope: p.scope, source: 'ROLE' });
    }
  }
  for (const o of overrides) {
    if (o.granted && !removed.has(o.code) && !effective.has(o.code)) {
      effective.set(o.code, { code: o.code, scope: ScopeType.PROJECT, source: 'OVERRIDE' });
    }
  }
  return [...effective.values()];
}

/**
 * A relation is usable when its status is ACTIVE and it has not expired. `expiresAt` is a
 * DATE (last day of validity, inclusive), compared to the current UTC day.
 */
export function isRelationActive(
  relation: { status: RelationshipStatus; expiresAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (relation.status !== RelationshipStatus.ACTIVE) return false;
  if (!relation.expiresAt) return true;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return relation.expiresAt.getTime() >= today;
}

/**
 * Relations that apply to a given project: the project's own relation plus any backoffice
 * relation (projectId null). Expired or suspended relations are never present on the
 * principal (filtered by JwtStrategy).
 */
export function relationsForProject(
  user: AuthenticatedUser,
  projectId: string | null,
): AuthenticatedRelation[] {
  return user.relations.filter((r) => r.isBackoffice || r.projectId === projectId);
}

export function isBackofficeUser(user: AuthenticatedUser): boolean {
  return user.relations.some((r) => r.isBackoffice);
}

/**
 * Effective permission (already corrected by overrides) for a project, or undefined.
 * When several relations grant the same code (backoffice + project), the widest scope wins.
 */
export function findPermission(
  user: AuthenticatedUser,
  projectId: string | null,
  code: string,
): AuthenticatedPermission | undefined {
  let best: AuthenticatedPermission | undefined;
  for (const relation of relationsForProject(user, projectId)) {
    const found = relation.permissions.find((p) => p.code === code);
    if (found && (!best || SCOPE_RANK[found.scope] > SCOPE_RANK[best.scope])) best = found;
  }
  return best;
}

export function userHasPermission(
  user: AuthenticatedUser,
  projectId: string | null,
  code: string,
): boolean {
  return findPermission(user, projectId, code) !== undefined;
}

/** True when a backoffice relation grants the code with scope ALL (any project). */
export function hasAllScope(user: AuthenticatedUser, code: string): boolean {
  return user.relations.some(
    (r) =>
      r.isBackoffice && r.permissions.some((p) => p.code === code && p.scope === ScopeType.ALL),
  );
}
