import { timingSafeEqual } from "node:crypto";

/**
 * True when the given value equals LEADS_API_SECRET. Used by every route
 * that changes data, so one secret protects them all.
 */
export function secretMatches(given: string | null): boolean {
  const expected = process.env.LEADS_API_SECRET;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  // Compare in constant time so the response speed doesn't leak the secret.
  return a.length === b.length && timingSafeEqual(a, b);
}
