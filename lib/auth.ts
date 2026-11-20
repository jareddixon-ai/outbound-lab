import { timingSafeEqual } from "node:crypto";

/**
 * True when `given` equals `expected`, compared in constant time so the
 * response speed doesn't leak how much of the secret was right. Missing on
 * either side is always false (fail closed).
 */
export function safeEqual(given: string | null | undefined, expected: string | null | undefined): boolean {
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * True when the value equals LEADS_API_SECRET. Used by every route that
 * changes data, so one secret protects them all.
 */
export function secretMatches(given: string | null): boolean {
  return safeEqual(given, process.env.LEADS_API_SECRET);
}

/**
 * The retry worker accepts either the API secret, or Vercel Cron's
 * "Authorization: Bearer <CRON_SECRET>" header.
 */
export function workerAllowed(headers: Headers): boolean {
  if (secretMatches(headers.get("x-api-secret"))) return true;
  const bearer = headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return safeEqual(bearer, process.env.CRON_SECRET);
}
