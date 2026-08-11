import { requireApiUser } from "@/lib/api/guards";
import { fail, noStore, ok, readJson } from "@/lib/api/respond";
import { resolveTimezone } from "@/lib/db/queries/cards";
import { getProfile, setBirthday } from "@/lib/db/queries/profiles";
import { BIRTHDAY_ERRORS, normalizeBirthday } from "@/lib/profile/birthday";
import { setBirthdaySchema, type SetBirthdayResponse } from "@/lib/profile/schemas";
import { localDateNow } from "@/lib/time/local-date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The one question that is not one of the five. Written from two places — the
 * `/birthday` screen and `/profile/edit` — and from nowhere else.
 *
 * **A skip is a write.** `{ birthday: null }` stores nothing in the column and
 * stamps `birthday_asked_at` anyway, which is what stops the gate asking again
 * tomorrow. So there is no "cancel" on this route: every request the screen makes
 * is a decision the user made.
 *
 * `onboarded_at` is never touched, and a caller who has not finished the flow
 * gets a 409 — the same rule `PATCH /api/profile` keeps, for the same reason. A
 * route handler sits outside every layout, so the gate that already ran on the
 * screen has to run again here.
 *
 * There is no GET. Server components read the row through
 * `lib/db/queries/profiles.ts`; a second read path would be free to diverge.
 */
export async function POST(req: Request): Promise<Response> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const userId = auth.user.id;

  const body = await readJson(req, setBirthdaySchema);
  if (!body.ok) return body.response;

  const existing = await getProfile(userId);
  if (!existing || !existing.onboardedAt) {
    return noStore(fail(409, "Finish the questions first.", "not_onboarded"));
  }

  /**
   * The zone decides one thing only: where "in the future" starts.
   *
   * The convention this reads against — reads may fall back to a default zone,
   * writes may not — is about a value the *app* dates, and `POST /api/cards`
   * refuses rather than guess for exactly that reason. Nothing is being dated
   * here; the user typed the date, and the zone is only bounding it. A fallback
   * therefore costs a one-day-wide window at the very edge of the range, which is
   * not the same class of error as a daily card dated a day wrong for ever.
   */
  const today = localDateNow(resolveTimezone(existing).timezone);

  const parsed = normalizeBirthday(body.data.birthday, today);
  if (!parsed.ok) {
    return noStore(fail(400, BIRTHDAY_ERRORS[parsed.reason], parsed.reason));
  }

  try {
    const row = await setBirthday(userId, parsed.value);
    if (!row) return noStore(fail(409, "Finish the questions first.", "not_onboarded"));
    // The stored date and nothing else. `birthday_asked_at` is deliberately not
    // returned: no client reads it, and serialising a timestamp here would put a
    // ninth instant-serialiser in the tree — which `npm run share:check` fails on,
    // correctly. That grep is the app's guard against a *day* being sent as an
    // instant, and the cheapest way to keep it meaningful is to not add a hit it
    // would have to sanction. (The check reads raw text, so naming the method in a
    // comment fails it too — which is why this sentence talks around it.)
    return noStore(ok<SetBirthdayResponse>({ birthday: row.birthday }));
  } catch (err) {
    console.error("[api/profile/birthday] write failed", { userId, err });
    return noStore(fail(500, "Couldn't save. Try again.", "internal"));
  }
}
