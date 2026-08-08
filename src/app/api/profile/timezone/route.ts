import { requireApiUser } from "@/lib/api/guards";
import { fail, noStore, ok, readJson } from "@/lib/api/respond";
import { getProfile, setTimezone } from "@/lib/db/queries/profiles";
import { setTimezoneSchema, type SetTimezoneResponse } from "@/lib/profile/schemas";
import { TIMEZONE_HEADER, resolveRequestTimezone } from "@/lib/profile/timezone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Upsert the user's IANA zone. Idempotent, and never fatal to its caller.
 *
 * Three callers: `<TimezoneCapture />` once during onboarding, `<TimezoneSync />`
 * on a mismatch, and the manual override on /profile/edit. The first two discard
 * the response entirely — a failed timezone POST must not be visible during the
 * flow, let alone blocking.
 *
 * Creating the profile row here leaves `onboarded_at` null, so hitting this route
 * can never accidentally onboard anyone or open a back door around the gate.
 */
export async function POST(req: Request): Promise<Response> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const userId = auth.user.id;

  const body = await readJson(req, setTimezoneSchema);
  if (!body.ok) return body.response;

  const existing = await getProfile(userId);

  // Step 2 of the chain. Unverified on Vercel's free tier (ROADMAP open
  // question 2) — when the header is absent the chain simply falls through, and
  // no request ever fails over it.
  const timezone = resolveRequestTimezone({
    requested: body.data.timezone,
    header: req.headers.get(TIMEZONE_HEADER),
    stored: existing?.timezone,
  });

  try {
    const result = await setTimezone(userId, timezone, body.data.manual);
    return noStore(ok<SetTimezoneResponse>(result));
  } catch (err) {
    console.error("[api/profile/timezone] write failed", { userId, err });
    return noStore(fail(500, "Couldn't save that. Try again.", "internal"));
  }
}
