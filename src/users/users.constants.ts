/** Audit actions written by the users module (SPEC-02 §4.3). */
export const USERS_AUDIT = {
  CREATE: 'user.create',
  ATTACH: 'user.attach',
  UPDATE: 'user.update',
  OVERRIDES_UPDATE: 'user.overrides.update',
  SUSPEND: 'user.suspend',
  REACTIVATE: 'user.reactivate',
  ACTIVATION_RESEND: 'user.activation.resend',
} as const;

/**
 * Status of a user AS SEEN FROM a project: the account status, or SUSPENDED when the
 * assignment to the current project is suspended (US-00-05 delete).
 */
export enum ProjectUserStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
}
