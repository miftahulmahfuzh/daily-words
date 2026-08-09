/**
 * A best-effort per-user cap on suggestion calls. In memory, no table, no
 * dependency.
 *
 * **Honest about what it is.** Vercel's free tier runs multiple ephemeral
 * instances, so a burst spread across cold starts can exceed the window. It is
 * still worth having: it catches the common case — one warm instance serving one
 * user leaning on a button — and the real hard bounds are the free-tier quota
 * itself and the per-session cap in the client. A Postgres-backed counter would
 * be exact at the price of a table and a write on every suggestion, for a hobby
 * project with one user. Revisit only if quota is actually exhausted.
 *
 * No `server-only`: the check script exercises it offline, and there is nothing
 * secret in a counter.
 */

const WINDOW_MS = 60 * 60 * 1000;

/** Ten an hour is roughly fifty candidate words. Nobody keeps fifty in an hour. */
export const MAX_SUGGEST_CALLS_PER_HOUR = 10;

/**
 * The map is pruned lazily on read, so an instance serving many users would
 * otherwise hold an entry per user forever. Eviction is oldest-first and the
 * only cost of getting it wrong is a user briefly getting a fresh allowance.
 */
const MAX_TRACKED_USERS = 500;

const hits = new Map<string, number[]>();

function evictIfCrowded(): void {
  if (hits.size <= MAX_TRACKED_USERS) return;
  // Map iterates in insertion order, so the first key is the least recently
  // *created* entry. Good enough for a backstop that exists to bound memory.
  const oldest = hits.keys().next();
  if (!oldest.done) hits.delete(oldest.value);
}

/**
 * Records the call as well as judging it. A refused call is **not** recorded —
 * otherwise a user hammering a disabled button would extend their own lockout
 * indefinitely.
 */
export function checkSuggestionRate(
  userId: string,
  now = Date.now(),
): { ok: boolean } {
  const since = now - WINDOW_MS;
  const recent = (hits.get(userId) ?? []).filter((at) => at > since);

  if (recent.length >= MAX_SUGGEST_CALLS_PER_HOUR) {
    hits.set(userId, recent);
    return { ok: false };
  }

  recent.push(now);
  hits.set(userId, recent);
  evictIfCrowded();
  return { ok: true };
}

/** Test seam. Never called from application code. */
export function resetSuggestionRateLimit(): void {
  hits.clear();
}
