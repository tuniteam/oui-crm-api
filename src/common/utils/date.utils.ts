/**
 * Parse YYYY-MM-DD string to UTC midnight Date.
 */
export function toDate(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

/**
 * Format a @db.Date field to YYYY-MM-DD string.
 */
export function formatDateField(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Parse a HH:mm string to a @db.Time Date (1970-01-01 UTC).
 * Always UTC — no server timezone dependency.
 */
export function parseTimeField(time: string): Date {
  return new Date(`1970-01-01T${time}:00.000Z`);
}

/**
 * Format a @db.Time Date to HH:mm string.
 * Reads UTC hours — consistent with parseTimeField, no timezone conversion.
 */
export function formatTimeField(time: Date): string {
  return time.toISOString().substring(11, 16);
}

/**
 * Convert a local date + local time in the given IANA timezone to a UTC instant.
 * Used for "has this slot ended?" comparisons.
 *
 * Example: localTimeToUtc("2025-05-04", "14:00", "America/Guadeloupe")
 *        → 2025-05-04T18:00:00.000Z
 */
export function localTimeToUtc(dateStr: string, timeStr: string, timezone: string): Date {
  const candidate = new Date(`${dateStr}T${timeStr}:00.000Z`);
  const localStr = candidate.toLocaleString('sv-SE', { timeZone: timezone });
  const diff = candidate.getTime() - new Date(localStr.replace(' ', 'T') + '.000Z').getTime();
  return new Date(candidate.getTime() + diff);
}
