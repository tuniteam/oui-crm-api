// ============================================
// OUI-CRM - Contacts constants (US-01-04)
// ============================================

/** Audit actions of the module (AUDIT_OBJECTS.CONTACT). */
export const CONTACTS_AUDIT = {
  CREATE: 'contact.create',
  UPDATE: 'contact.update',
  DELETE: 'contact.delete',
} as const;

// Column widths of the Contact model (schema.prisma).
export const CIVILITY_MAX_LENGTH = 10;
export const ROLE_MAX_LENGTH = 120;
export const PHONE_MAX_LENGTH = 20;
export const EMAIL_MAX_LENGTH = 255;
export const NOTES_MAX_LENGTH = 2000;
