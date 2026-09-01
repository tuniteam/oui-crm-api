/** Audit actions written by the roles module (SPEC-02 §4.3). */
export const ROLES_AUDIT = {
  DUPLICATE: 'role.duplicate',
  UPDATE: 'role.update',
  DELETE: 'role.delete',
} as const;

/** Role code: uppercase snake case, unique per project (system roles live with projectId null). */
export const ROLE_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;
export const ROLE_CODE_MAX_LENGTH = 50;
export const ROLE_LABEL_MAX_LENGTH = 100;

/** Separator of `module:action` permission codes. */
export const PERMISSION_CODE_SEPARATOR = ':';
