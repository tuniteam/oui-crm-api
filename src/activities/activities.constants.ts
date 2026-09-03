// ============================================
// OUI-CRM - Activities constants (US-01-08, US-01-09)
// ============================================

import { SalesStatus } from '@prisma/client';

/** Audit actions of the module (AUDIT_OBJECTS.ACTIVITY). */
export const ACTIVITIES_AUDIT = {
  CREATE: 'activity.create',
  UPDATE: 'activity.update',
  COMPLETE: 'activity.complete',
  CANCEL: 'activity.cancel',
  DELETE: 'activity.delete',
} as const;

/** Local wall-clock time, displayed as-is; ICS exports it as floating time (SPEC-13 D9). */
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
export const ACTIVITY_TYPE_MAX_LENGTH = 60;
export const LOCATION_MAX_LENGTH = 255;
export const REPORT_MAX_LENGTH = 4000;
export const MAX_DURATION_MIN = 24 * 60;

/**
 * Sales-status automatisms (US-01-08): completing an activity starts the follow-up;
 * planning a meeting-like activity (referential metadata `ics: true`) books the record.
 */
export const BUMPS_TO_IN_PROGRESS: readonly SalesStatus[] = [SalesStatus.NOT_CONTACTED, SalesStatus.TO_CONTACT];
export const BUMPS_TO_MEETING: readonly SalesStatus[] = [
  SalesStatus.NOT_CONTACTED,
  SalesStatus.TO_CONTACT,
  SalesStatus.IN_PROGRESS,
];

/** Agenda sources; only ACTIVITY answers at L1, the other kinds arrive with lots L2-L4. */
export const AGENDA_KINDS = ['ACTIVITY', 'TRAINING', 'CONTRACT_END', 'QUOTE_EXPIRY'] as const;
export type AgendaKind = (typeof AGENDA_KINDS)[number];

/** Les natures nommées, pour ne pas écrire 'ACTIVITY' en littéral dans un service. */
export const AGENDA_KIND = Object.fromEntries(AGENDA_KINDS.map((k) => [k, k])) as Record<AgendaKind, AgendaKind>;

/** Décomptes à zéro sur toutes les natures : le service ne remplit que celles qu'il sert. */
export function emptyAgendaCounts(): Record<AgendaKind, number> {
  return Object.fromEntries(AGENDA_KINDS.map((k) => [k, 0])) as Record<AgendaKind, number>;
}

/** ICS export (US-01-09) — floating local time, no timezone (SPEC-13 D9). */
export const ICS = {
  CONTENT_TYPE: 'text/calendar',
  DEFAULT_DURATION_MIN: 60,
  PROD_ID: '-//OUI-CRM//Agenda//FR',
} as const;
