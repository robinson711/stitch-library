// Ids and dates in the exact form the backup format requires.
import type { Stamp } from './types';

/** Current time as "YYYY-MM-DDTHH:MM:SSZ". */
export function nowStamp(date: Date = new Date()): Stamp {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Lowercase random UUID. */
export function newId(): string {
  return crypto.randomUUID().toLowerCase();
}

/** A later stamp sorts after an earlier one, because the format is fixed-width. */
export function isNewer(a: Stamp, b: Stamp): boolean {
  return a > b;
}
