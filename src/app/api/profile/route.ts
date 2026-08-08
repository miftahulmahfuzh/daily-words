import { requireApiUser } from "@/lib/api/guards";
import { fail, noStore, ok, readJson } from "@/lib/api/respond";
import { getProfile, updateProfileAnswers } from "@/lib/db/queries/profiles";
import { normalizeProfileAnswers } from "@/lib/profile/normalize";
import { patchProfileSchema, type ProfileResponse } from "@/lib/profile/schemas";
import { toProfileResponse } from "@/lib/profile/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Partial update of the five answers, from /profile/edit and nowhere else.
 *
 * Absent key = leave alone. Explicit `null` = clear. Both matter: "I no longer
 * want to answer that" has to be expressible, and a form that only sent the
 * fields it drew must not wipe the ones it did not.
 *
 * `onboarded_at` is never touched. A 409 for a not-yet-onboarded caller closes
 * the one hole this route could otherwise open — the edit surface is not a way
 * around the flow.
 *
 * There is no GET. Server components read through `lib/db/queries/profiles.ts`;
 * a second read path would be free to diverge from the first.
 */
export async function PATCH(req: Request): Promise<Response> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const userId = auth.user.id;

  const body = await readJson(req, patchProfileSchema);
  if (!body.ok) return body.response;

  const existing = await getProfile(userId);
  if (!existing || !existing.onboardedAt) {
    return noStore(fail(409, "Finish the questions first.", "not_onboarded"));
  }

  const answers = normalizeProfileAnswers(body.data);

  // An empty body is a no-op rather than an error: a Save with nothing changed
  // should land the user back on /profile, not show them a failure.
  if (Object.keys(answers).length === 0) {
    return noStore(ok<ProfileResponse>(toProfileResponse(existing)));
  }

  try {
    const row = await updateProfileAnswers(userId, answers);
    if (!row) return noStore(fail(409, "Finish the questions first.", "not_onboarded"));
    return noStore(ok<ProfileResponse>(toProfileResponse(row)));
  } catch (err) {
    console.error("[api/profile] update failed", { userId, err });
    return noStore(fail(500, "Couldn't save. Try again.", "internal"));
  }
}
