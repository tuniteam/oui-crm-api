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

/** Initials feed the quote numbering: 2-3 uppercase letters or digits, unique per project. */
export const INITIALS_PATTERN = /^[A-Z0-9]{2,3}$/;

/** A project admin = an active assignment whose role grants this permission (last-admin rule). */
export const ADMIN_PERMISSION_CODE = 'users:update';

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
