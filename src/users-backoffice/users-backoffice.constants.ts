/** Audit actions written by the backoffice users module — platform level (projectId null). */
export const USERS_BACKOFFICE_AUDIT = {
  CREATE: 'user.backoffice.create',
  UPDATE: 'user.backoffice.update',
  SUSPEND: 'user.backoffice.suspend',
  REACTIVATE: 'user.backoffice.reactivate',
  ACTIVATION_RESEND: 'user.backoffice.activation.resend',
} as const;

/** Backoffice relations carry no project; initials are unused there (quote numbering is per project). */
export const BACKOFFICE_INITIALS = 'BO';
