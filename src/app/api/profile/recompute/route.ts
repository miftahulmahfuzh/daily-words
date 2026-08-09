import { requireApiUser } from "@/lib/api/guards";
import { fail, noStore, ok } from "@/lib/api/respond";
import { userStatsAgeSeconds } from "@/lib/db/queries/stats";
import { getProfileStats } from "@/lib/gamification/profile-stats";
import { recomputeUserGamification } from "@/lib/gamification/recompute";
import type { ProfileStats } from "@/lib/gamification/schemas";

/**
 * Rebuild the signed-in user's stats and replay their badges.
 *
 * A maintenance escape hatch, reachable by hand and **not linked from the UI**.
 * It never prunes: deleting badge rows is `scripts/recompute-stats.ts --prune`,
 * behind a dry run and an explicit flag, and it should not be one HTTP request
 * away from a browser.
 *
 * Operates on the session user only, for the same reason `GET .../stats` does.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hobby-scale spam guard, not a rate limiter. */
const COOLDOWN_SECONDS = 10;

export async function POST(): Promise<Response> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  try {
    const age = await userStatsAgeSeconds(auth.user.id);
    if (age === null || age >= COOLDOWN_SECONDS) {
      const report = await recomputeUserGamification(auth.user.id, { prune: false });
      if (report.warnings.length > 0) {
        console.warn("[api/profile/recompute]", {
          userId: auth.user.id,
          warnings: report.warnings,
        });
      }
    }

    // Returned freshly rather than from the report, so the response is the same
    // shape `GET /api/profile/stats` gives and can be diffed against it.
    return noStore(ok<ProfileStats>(await getProfileStats(auth.user)));
  } catch (err) {
    console.error("[api/profile/recompute] failed", { userId: auth.user.id, err });
    return noStore(fail(500, "Couldn’t rebuild your stats.", "recompute_failed"));
  }
}
