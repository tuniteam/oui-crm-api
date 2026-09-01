/**
 * Audit object-type vocabulary, shared by every module that writes entries — a typo here
 * would silently split the audit trail. Per-module ACTION constants stay local
 * (PROJECT_AUDIT, PROFILE_AUDIT, LEGAL_AUDIT, AUTH_AUDIT).
 */
export const AUDIT_OBJECTS = {
  USER: 'User',
  PROJECT: 'Project',
  ROLE: 'Role',
  SCOPE: 'Scope',
  SETTINGS: 'Settings',
  REFERENCE_ITEM: 'ReferenceItem',
  FILE: 'File',
} as const;

export type AuditObjectType = (typeof AUDIT_OBJECTS)[keyof typeof AUDIT_OBJECTS];
export const AUDIT_OBJECT_TYPES: readonly AuditObjectType[] = Object.values(AUDIT_OBJECTS);

export const AUDIT_ACTION_MAX_LENGTH = 45;
/** Query date filters are calendar days: `YYYY-MM-DD`, inclusive bounds. */
export const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
