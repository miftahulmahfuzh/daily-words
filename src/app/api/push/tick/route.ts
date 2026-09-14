import "server-only";
import { timingSafeEqual } from "node:crypto";
import { fail, noStore, ok } from "@/lib/api/respond";
import { env } from "@/lib/env";
import { runTick, type TickSummary } from "@/lib/push/tick";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The fan-out is sequential and the ceiling is named in the plan's D8. Sixty
 * seconds is the Hobby-plan maximum and roughly a hundred and fifty push
 * requests from `sin1`; past that the answer is to batch, not to raise this.
 */
export const maxDuration = 60;

/**
 * The reminder tick. **The only scheduled entry point in the application.**
 *
 * It creates nothing. `src/app/api/cards/route.ts` is still the only path that
 * writes a `daily_cards` row, and this handler does not reach it, import it, or
 * know how to. What it does is ask, per subscribed user and in that user's own
 * timezone, whether a two-hourly slot is due on a day with no card — and put
 * one sentence on their lock screen if so.
 *
 * **`POST`, not `GET`.** F17 D5 already ruled in this codebase that a `GET`
 * which mutates is prefetchable, replayable and invisible to Next's action CSRF
 * machinery. This route is under `/api` — outside the middleware matcher — and
 * holds no session, so the ruling is about consistency rather than danger. That
 * is the point: the rule is worth more than the exception. If Vercel Cron ever
 * replaces the workflow, add a `GET` that delegates to `POST` and say in a
 * comment that it exists for a caller that cannot choose its verb.
 *
 * **Auth is a bearer secret compared in constant time.** There is no session
 * here and there cannot be: the caller is a scheduler, not a person.
 *
 * **An unconfigured deploy answers 503, never 200.** A tick endpoint that
 * happily accepts anonymous callers because nobody set the variable is the worst
 * available default — it is indistinguishable from working, right up until a
 * stranger is spending the app's push quota.
 */

export type TickResponse = { ok: true } & TickSummary;

/**
 * Constant-time, and length-safe: `timingSafeEqual` **throws** on a length
 * mismatch, so the lengths are compared first — the same guard
 * `lib/share/intent.ts` carries for the claim cookie's signature.
 */
function secretMatches(header: string | null, secret: string): boolean {
  if (!header) return false;
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;

  const given = Buffer.from(header.slice(prefix.length), "utf8");
  const want = Buffer.from(secret, "utf8");
  return given.length === want.length && timingSafeEqual(given, want);
}

export async function POST(req: Request): Promise<Response> {
  const secret = env.CRON_SECRET;
  if (!secret) {
    console.error("[api/push/tick] no scheduler secret is configured — refusing");
    return noStore(
      fail(503, "Reminders are not configured.", "not_configured"),
    );
  }

  if (!secretMatches(req.headers.get("authorization"), secret)) {
    return noStore(fail(401, "Not authorised.", "unauthenticated"));
  }

  let summary: TickSummary;
  try {
    summary = await runTick();
  } catch (err) {
    console.error("[api/push/tick] tick failed", { err });
    return noStore(fail(500, "The tick failed.", "internal"));
  }

  /**
   * **No user ids in the body.** This response is printed verbatim into a
   * GitHub Actions log, and a run log is a more public place than it looks.
   * Counts are what the scheduler needs in order to fail loudly; the per-user
   * detail is in the server logs, where it belongs.
   */
  return noStore(ok<TickResponse>({ ok: true, ...summary }));
}
