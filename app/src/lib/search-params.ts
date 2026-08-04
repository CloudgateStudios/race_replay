/**
 * Helpers for reading Next.js page searchParams safely.
 *
 * Next.js delivers each query param as string | string[] | undefined — a
 * repeated param (?q=a&q=b) arrives as an array. Pages that assume plain
 * strings throw at runtime, so always unwrap through these helpers.
 */

/** Returns the first value when a query param appears multiple times. */
export function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Parses a positive integer param, falling back for missing/invalid values. */
export function positiveInt(value: string | string[] | undefined, fallback: number): number {
  const n = parseInt(first(value) ?? "", 10);
  return Number.isNaN(n) ? fallback : Math.max(1, n);
}
