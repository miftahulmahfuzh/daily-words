import { requireApiUser } from "@/lib/api/guards";
import { fail, noStore, ok } from "@/lib/api/respond";
import { getProfileStats } from "@/lib/gamification/profile-stats";
import type { ProfileStats } from "@/lib/gamification/schemas";

/**
 * The same payload `/profile` renders, over HTTP.
 *
 * **This is not how the page renders.** `/profile` is a server component that
 * calls `getProfileStats` directly, per the roadmap's rule that server-side data
 * access goes through `lib/db/queries/`. This route exists so the numbers can be
 * inspected by hand — `curl` against a signed-in session is how §14's checks are
 * run — and so a client could refresh them later. Both paths call one function,
 * so they cannot disagree.
 *
 * There is no `userId` parameter and there must never be one. No social features
 * means no reading another user's profile.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  try {
    return noStore(ok<ProfileStats>(await getProfileStats(auth.user)));
  } catch (err) {
    // Never a partial page of zeroes. A user with a decade of cards must not be
    // told they have none because one query failed.
    console.error("[api/profile/stats] failed", { userId: auth.user.id, err });
    return noStore(fail(500, "Couldn’t load your profile.", "stats_failed"));
  }
}
