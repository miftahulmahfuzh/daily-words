/**
 * A best-effort per-user cap on non-English lookup calls. In memory, no table,
 * no dependency — deliberately the same shape as
 * `lib/vocab/suggestion-rate-limit.ts`, and honest about the same limits: on
 * Vercel's free tier a burst spread across cold starts can exceed the window.
 *
 * **Why it has to exist at all**, which is sharper than F8's case. The 50-a-day
 * cap that protects the typed add path is `countEntriesCreatedSince` — it counts
 * *rows*. `POST /api/vocab/lookup` writes no row, so without this it would be an
 * uncapped model-call endpoint: worse than the thing the daily cap was added to
 * prevent, since a user tapping Look up and then Cancel would burn quota and
 * leave no trace that they had.
 *
 * A second module rather than a second function in F8's: its constants are F8's,
 * its comments are about suggestions, and `npm run discover:check` exercises it.
 * Factoring the two together is a fair refactor and is not this feature's job.
 *
 * No `server-only`: `npm run vocab:check` exercises it offline, and there is
 * nothing secret in a counter.
 */

const WINDOW_MS = 60 * 60 * 1000;

/**
 * Thirty an hour. Higher than F8's ten because this is a foreground action the
 * user is waiting on rather than a background suggestion sweep — someone
 * working through a page of a foreign novel might reasonably look up a dozen
 * words — and lower than the 50-a-day add cap it sits behind, so a user who
 * hits it has been holding the button rather than reading.
 */
export const MAX_LOOKUP_CALLS_PER_HOUR = 30;

/** Bounds memory on an instance serving many users. Eviction is oldest-first. */
const MAX_TRACKED_USERS = 500;

const hits = new Map<string, number[]>();

function evictIfCrowded(): void {
  if (hits.size <= MAX_TRACKED_USERS) return;
  const oldest = hits.keys().next();
  if (!oldest.done) hits.delete(oldest.value);
}

/**
 * Records the call as well as judging it. A refused call is **not** recorded —
 * otherwise a user hammering a disabled button would extend their own lockout
 * indefinitely. F8's reasoning, and it holds here for the same reason.
 */
export function checkLookupRate(userId: string, now = Date.now()): { ok: boolean } {
  const since = now - WINDOW_MS;
  const recent = (hits.get(userId) ?? []).filter((at) => at > since);

  if (recent.length >= MAX_LOOKUP_CALLS_PER_HOUR) {
    hits.set(userId, recent);
    return { ok: false };
  }

  recent.push(now);
  hits.set(userId, recent);
  evictIfCrowded();
  return { ok: true };
}

/** Test seam. Never called from application code. */
export function resetLookupRateLimit(): void {
  hits.clear();
}
