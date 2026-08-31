import { FeatureCode, OutOfScopeAccess, ScopeType } from '@prisma/client';

/**
 * Effective permission for a project relation: role grant corrected by user overrides
 * (removal > addition > role — SPEC-06 §2).
 */
export interface AuthenticatedPermission {
  code: string;
  scope: ScopeType;
  source: 'ROLE' | 'OVERRIDE';
}

/**
 * One row of UserRoleProject, resolved. projectId is null for backoffice relations.
 */
export interface AuthenticatedRelation {
  roleId: string;
  roleCode: string;
  isBackoffice: boolean;
  outOfScopeAccess: OutOfScopeAccess;
  projectId: string | null;
  projectName: string | null;
  projectSlug: string | null;
  scopeId: string | null;
  initials: string;
  expiresAt: Date | null;
  permissions: AuthenticatedPermission[];
  features: FeatureCode[];
}

/**
 * Request principal, rebuilt from the session on every request (JwtStrategy).
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  sessionId: string;
  relations: AuthenticatedRelation[];
}
