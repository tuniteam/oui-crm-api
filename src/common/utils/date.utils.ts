// UTC only: business dates are @db.Date columns handled as YYYY-MM-DD strings.

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

/** Today as a UTC midnight Date (for @db.Date columns). */
/** Last millisecond of the UTC day of `date` (inclusive upper bound of a calendar-day filter). */
export function endOfDayUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1) - 1);
}

export function todayUtc(now: Date = new Date()): Date {
  return toDate(formatDateField(now));
}
