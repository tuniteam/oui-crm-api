// UTC only: business dates are @db.Date columns handled as YYYY-MM-DD strings.
import { apiError } from '@/common/api-error';

/** Calendar day: YYYY-MM-DD (shape only — parseDayOrThrow also rejects impossible dates). */
export const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Parse YYYY-MM-DD to a UTC midnight Date (value to write in a @db.Date column). */
export function toDate(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

/** Format a Date (or @db.Date field) as YYYY-MM-DD. */
export function formatDateField(date: Date): string {
  return date.toISOString().split('T')[0];
}

/** Last millisecond of the UTC day of `date` (inclusive upper bound of a calendar-day filter). */
export function endOfDayUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1) - 1);
}

/** Today as a UTC midnight Date (for @db.Date columns). */
export function todayUtc(now: Date = new Date()): Date {
  return toDate(formatDateField(now));
}

/**
 * Strict calendar-day parsing: shape AND existence (2027-02-30 or 2026-13-45 → 400 INVALID_DATA,
 * never an Invalid Date reaching Prisma as a 500).
 */
export function parseDayOrThrow(s: string): Date {
  if (!DAY_PATTERN.test(s)) throw apiError.badRequest('INVALID_DATA');
  const date = toDate(s);
  if (Number.isNaN(date.getTime()) || formatDateField(date) !== s) throw apiError.badRequest('INVALID_DATA');
  return date;
}
