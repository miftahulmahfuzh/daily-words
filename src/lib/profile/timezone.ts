/**
 * Timezone detection, validation and the fallback chain.
 *
 * No `server-only` — `detectTimeZone()` runs in the browser and the other two
 * run on the server. The module is deliberately importable from both, and the
 * validator is shared so the two halves cannot disagree about what a zone is.
 */

import { FALLBACK_TIMEZONE, MAX_TIMEZONE_LEN } from "@/lib/profile/constants";
import { isValidTimeZone } from "@/lib/time/local-date";

/**
 * Re-exported rather than reimplemented. F7's plan §7.3 specifies exactly the
 * try/catch form `lib/time/local-date` already ships — `Intl.DateTimeFormat`
 * throws on a bad zone and accepts the aliases (`Asia/Calcutta`) that
 * `Intl.supportedValuesOf('timeZone')` omits.
 */
export { isValidTimeZone };

/**
 * The browser's own zone, or null.
 *
 * Never trusted as-is: it is one candidate in `resolveRequestTimezone()`, which
 * runs on the server and validates before anything is written.
 */
export function detectTimeZone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && tz.length > 0 ? tz : null;
  } catch {
    return null;
  }
}

/** Length-capped before `Intl` sees it, so a pasted essay is cheap to reject. */
function usable(tz: unknown): string | null {
  if (typeof tz !== "string") return null;
  const trimmed = tz.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_TIMEZONE_LEN) return null;
  return isValidTimeZone(trimmed) ? trimmed : null;
}

/**
 * The fallback chain, first valid value wins. Applied on the server only.
 *
 * Named `resolveRequestTimezone` and not `resolveTimezone` on purpose:
 * `lib/db/queries/cards.ts` already exports a `resolveTimezone(profile)` that
 * answers a different question — "is the stored zone trustworthy enough to
 * write a card with?". Two functions with one name across two modules is a
 * mis-import waiting to happen.
 *
 * 1. What the client sent, if it is a real zone.
 * 2. `x-vercel-ip-timezone`, if the platform populated it. Best-effort — it is
 *    unverified on Vercel's free tier (ROADMAP open question 2), and when it is
 *    absent the chain simply falls through. Never fail a request over it.
 * 3. The zone already on the row.
 * 4. `FALLBACK_TIMEZONE`.
 */
export function resolveRequestTimezone(candidates: {
  requested?: unknown;
  header?: unknown;
  stored?: unknown;
}): string {
  return (
    usable(candidates.requested) ??
    usable(candidates.header) ??
    usable(candidates.stored) ??
    FALLBACK_TIMEZONE
  );
}

/** The request header carrying the platform's guess at the caller's zone. */
export const TIMEZONE_HEADER = "x-vercel-ip-timezone";

/**
 * Every zone this runtime knows, for the `<select>` on /profile/edit.
 *
 * Returns null where `supportedValuesOf` is missing (below iOS 15.4), and the
 * edit form falls back to a validated text input. This is the one place the
 * enumerated list is acceptable: it is a picker, not a validator.
 */
export function supportedTimeZones(): string[] | null {
  try {
    const supported = Intl.supportedValuesOf?.("timeZone");
    return supported && supported.length > 0 ? [...supported] : null;
  } catch {
    return null;
  }
}
