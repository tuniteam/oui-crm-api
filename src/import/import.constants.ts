// ============================================
// OUI-CRM - Import framework constants (US-01-06, US-01-14)
// ============================================

/** geo.api.gouv.fr — Découpage administratif, open data, no API key (US-01-14). */
export const TERRITORY = {
  GEO_API_URL: 'https://geo.api.gouv.fr',
  /** One request returns every commune of a department with these fields (~43 KB for 423 rows). */
  COMMUNE_FIELDS: 'nom,code,codesPostaux,population,codeEpci',
  TIMEOUT_MS: 10_000,
  /** Hard cap on the communes of one call — beyond it the request is refused (413), not queued. */
  MAX_ROWS: 2000,
  /** Every created record is a commune (decision D5, 01/09/2026): EPCIs are never created. */
  STRUCTURE_TYPE: 'COMMUNE',
} as const;

export const IMPORT_AUDIT = {
  RUN: 'import.run',
  CANCEL: 'import.cancel',
} as const;

/**
 * A record whose `updatedAt` drifted beyond this from `createdAt` was modified after the
 * import (imports never rewrite what they create) — its batch can no longer be cancelled.
 * The margin absorbs the client/database clock difference of the insert itself.
 */
export const IMPORT_BATCH_MODIFIED_TOLERANCE_MS = 2000;

export type TerritoryItemStatus = 'CREATED' | 'UPDATED' | 'SKIPPED';
export type TerritorySkipReason = 'ALREADY_EXISTS';
