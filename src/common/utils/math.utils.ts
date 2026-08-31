/**
 * Round to 2 decimal places — currency amounts (quote lines, totals, invoices).
 */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Round to 4 decimal places — intermediate unit prices and coefficients of the pricing engine.
 */
export function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

const BYTES_PER_MB = 1024 * 1024;

/** "5MB" style label for size limits in error messages. */
export function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / BYTES_PER_MB)}MB`;
}
