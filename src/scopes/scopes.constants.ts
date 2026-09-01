/** Audit actions written by the scopes module (SPEC-02 §4.3). */
export const SCOPES_AUDIT = {
  CREATE: 'scope.create',
  UPDATE: 'scope.update',
  DELETE: 'scope.delete',
} as const;

export const SCOPE_NAME_MAX_LENGTH = 100;
export const SCOPE_DESCRIPTION_MAX_LENGTH = 500;
/** French department code: 01-95, 2A/2B, 971-976. */
export const DEPARTMENT_CODE_PATTERN = /^(\d{2}|2A|2B|97[1-6])$/;
