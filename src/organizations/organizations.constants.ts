// ============================================
// OUI-CRM - Organizations constants (US-01-01 → 03, 13)
// ============================================

import { Prisma, SalesStatus } from '@prisma/client';

/** Audit actions of the module (AUDIT_OBJECTS.ORGANIZATION). */
export const ORGANIZATION_AUDIT = {
  CREATE: 'organization.create',
  UPDATE: 'organization.update',
  DELETE: 'organization.delete',
  SALES_STATUS: 'organization.salesStatus',
} as const;

/**
 * Completeness criteria, reproduced from the V8 mockup (`req` in the drawer): a record is
 * complete when the six are filled. `PRIMARY_CONTACT` is the only one that does not live on
 * the organization row — hence the recompute on every Contact write (SPEC-13 §2.4).
 */
export const COMPLETENESS_FIELDS = [
  'SIRET',
  'ADDRESS',
  'POSTAL_CODE',
  'POPULATION',
  'PRIMARY_CONTACT',
  'EMAIL',
] as const;

export type CompletenessField = (typeof COMPLETENESS_FIELDS)[number];

/** Without a population there is no pricing bracket, so no quote (SPEC-04 décision 5). */
export const QUOTE_BLOCKING_FIELDS: CompletenessField[] = ['POPULATION'];

/** A contract needs the legal identity of the buyer and someone to sign it (V8 wording). */
export const CONTRACT_BLOCKING_FIELDS: CompletenessField[] = [
  'SIRET',
  'ADDRESS',
  'POSTAL_CODE',
  'POPULATION',
  'PRIMARY_CONTACT',
];

/**
 * Columns exposed outside the caller's geographic scope when the role allows a restricted
 * read (SPEC-07 US-01-01). Anything absent from this list must never leave the API.
 */
export const RESTRICTED_SELECT = {
  id: true,
  name: true,
  type: true,
  city: true,
  department: true,
  salesStatus: true,
  customerStatus: true,
  salesRepId: true,
} satisfies Prisma.OrganizationSelect;

/** Sortable columns of the list. Anything else is rejected by the DTO. */
export const ORGANIZATION_SORT_FIELDS = [
  'name',
  'city',
  'department',
  'population',
  'salesStatus',
  'customerStatus',
  'priority',
  'completenessScore',
  'lastActivityAt',
  'nextActivityAt',
  'createdAt',
] as const;

export type OrganizationSortField = (typeof ORGANIZATION_SORT_FIELDS)[number];
export const DEFAULT_ORGANIZATION_SORT: OrganizationSortField = 'name';

/** Duplicate detection on creation: same name at the same postal code (US-01-02). */
export const DUPLICATE_CHECK_LIMIT = 5;

/** Kanban (US-01-10): the 5 columns in pipeline order; per-column payload cap. */
export const BOARD_COLUMNS: readonly SalesStatus[] = [
  SalesStatus.NOT_CONTACTED,
  SalesStatus.TO_CONTACT,
  SalesStatus.IN_PROGRESS,
  SalesStatus.MEETING_SCHEDULED,
  SalesStatus.CLOSED,
];
/**
 * Cartes servies par colonne au premier appel. Un kanban se lit colonne par colonne : la
 * valeur est plus généreuse que les 20 d'une liste, sans aller jusqu'au maximum — la suite
 * se demande colonne par colonne (`salesStatus` + `page`).
 */
export const BOARD_DEFAULT_LIMIT = 50;
export const SALES_STATUS_REASON_MAX_LENGTH = 500;

/** Bulk operations (US-01-05). DELETE additionally requires organizations:delete. */
/** One business invariant, one pattern: the API create path and the imports share it. */
export const SIRET_PATTERN = /^\d{14}$/;
/** 5 characters; Corsica writes its letter in SECOND position (2A004, 2B033). */
export const INSEE_PATTERN = /^(?:\d{5}|2[ABab]\d{3})$/;

export const BULK_ACTIONS = ['ASSIGN_SALES_REP', 'SET_SALES_STATUS', 'SET_PRIORITY', 'ADD_TO_CAMPAIGN', 'DELETE'] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];
export type BulkSkipReason = 'NOT_FOUND' | 'OUT_OF_SCOPE';
export const BULK_BATCH_MAX = 500;
/** The payload field each action requires — anything else in the payload is a mistake. */
export const BULK_PAYLOAD_FIELD: Record<BulkAction, 'salesRepId' | 'salesStatus' | 'priority' | 'campaignId' | null> = {
  ASSIGN_SALES_REP: 'salesRepId',
  SET_SALES_STATUS: 'salesStatus',
  SET_PRIORITY: 'priority',
  ADD_TO_CAMPAIGN: 'campaignId',
  DELETE: null,
};
export const BULK_AUDIT_ACTION = 'organization.bulk';
