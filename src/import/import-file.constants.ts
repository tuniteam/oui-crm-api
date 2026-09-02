// ============================================
// OUI-CRM - File import constants (US-01-06)
// ============================================

import { ImportProfile } from '@prisma/client';

export const IMPORT_FILE = {
  /** Multipart field carrying the workbook. */
  UPLOAD_FIELD: 'file',
  /** Hard cap on data rows in one file — beyond it the request is refused (413). */
  MAX_ROWS: 2000,
  /** Multi-valued cells (tags, services, regions, departments) use this separator. */
  LIST_SEPARATOR: '|',
} as const;

/** Profiles the file route accepts at L1 — OUICRM_V2_1 waits on decision D2, TERRITORY has its own route. */
export const FILE_PROFILES: readonly ImportProfile[] = [ImportProfile.GENERIC, ImportProfile.PROJECT_CONFIG];

export const GENERIC_SHEETS = {
  organizations: 'Organizations',
  contacts: 'Contacts',
} as const;

/** Column headers of the GENERIC template — the parser matches by header name, not position. */
export const GENERIC_ORGANIZATION_HEADERS = [
  'name',
  'type',
  'department',
  'displayPrefix',
  'siret',
  'inseeCode',
  'address',
  'postalCode',
  'city',
  'population',
  'epci',
  'phone',
  'email',
  'website',
  'solution',
  'leadSource',
  'priority',
  'tags',
  'services',
  'salesRep',
  'notes',
] as const;

export const GENERIC_CONTACT_HEADERS = [
  'organization',
  'department',
  'civility',
  'firstName',
  'lastName',
  'role',
  'email',
  'phone',
  'mobile',
  'isPrimary',
  'optOut',
  'notes',
] as const;

/** Row-level codes carried by the report (`errors[]` / `warnings[]`), never HTTP codes. */
export const IMPORT_ROW_CODES = {
  MISSING_REQUIRED: 'MISSING_REQUIRED',
  INVALID_VALUE: 'INVALID_VALUE',
  UNKNOWN_REFERENCE: 'UNKNOWN_REFERENCE',
  UNKNOWN_DEPARTMENT: 'UNKNOWN_DEPARTMENT',
  UNKNOWN_SALES_REP: 'UNKNOWN_SALES_REP',
  UNKNOWN_ROLE: 'UNKNOWN_ROLE',
  UNKNOWN_SCOPE: 'UNKNOWN_SCOPE',
  UNKNOWN_SHEET: 'UNKNOWN_SHEET',
  UNKNOWN_SETTING: 'UNKNOWN_SETTING',
  DUPLICATE_ROW: 'DUPLICATE_ROW',
  ORGANIZATION_NOT_FOUND: 'ORGANIZATION_NOT_FOUND',
  PRIMARY_ALREADY_SET: 'PRIMARY_ALREADY_SET',
  FIELD_NOT_OVERWRITTEN: 'FIELD_NOT_OVERWRITTEN',
  PROJECT_IDENTITY_IGNORED: 'PROJECT_IDENTITY_IGNORED',
  STAGE_PROBABILITY_FIXED: 'STAGE_PROBABILITY_FIXED',
  INITIALS_ALREADY_USED: 'INITIALS_ALREADY_USED',
  ALREADY_MEMBER: 'ALREADY_MEMBER',
} as const;
export type ImportRowCode = (typeof IMPORT_ROW_CODES)[keyof typeof IMPORT_ROW_CODES];

/** Resource names of the report's `resources[]` breakdown. */
export const IMPORT_RESOURCES = {
  ORGANIZATIONS: 'organizations',
  CONTACTS: 'contacts',
  SETTINGS: 'settings',
  STAGE_PROBABILITIES: 'stageProbabilities',
  REFERENCE_ITEMS: 'referenceItems',
  SCOPES: 'scopes',
  USERS: 'users',
} as const;
