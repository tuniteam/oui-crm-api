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
/**
 * Tolérance de **repli**, pour les lots d'avant l'horodatage `totals.appliedAt` : sans point de
 * référence, une fiche est réputée modifiée quand son `updatedAt` s'écarte de sa création de
 * plus de cette fenêtre. Les lots récents n'en dépendent plus — voir `batchAppliedAt`.
 */
export const IMPORT_BATCH_MODIFIED_TOLERANCE_MS = 2000;

/** Clé de `ImportBatch.totals` portant la fin de l'application (ISO 8601). */
export const BATCH_APPLIED_AT_KEY = 'appliedAt';

/** Totaux d'un lot, complétés de l'instant où son application s'est terminée. */
export function stampAppliedAt<T extends Record<string, unknown>>(totals: T): T & { appliedAt: string } {
  return { ...totals, [BATCH_APPLIED_AT_KEY]: new Date().toISOString() } as T & { appliedAt: string };
}

/** L'instant de référence d'un lot, ou `null` pour un lot antérieur à cet horodatage. */
export function batchAppliedAt(totals: unknown): Date | null {
  const value = (totals as Record<string, unknown> | null)?.[BATCH_APPLIED_AT_KEY];
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export type TerritoryItemStatus = 'CREATED' | 'UPDATED' | 'SKIPPED';
export type TerritorySkipReason = 'ALREADY_EXISTS';
