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
