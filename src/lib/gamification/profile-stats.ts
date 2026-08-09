import "server-only";
import type { SessionUser } from "@/lib/auth/session";
import { getCardContext } from "@/lib/db/queries/cards";
import { getBadgeCounts } from "@/lib/db/queries/badges";
import {
  countManualWords,
  getCardDates,
  readUserStats,
  upsertUserStats,
} from "@/lib/db/queries/stats";
import { badgeTitle } from "@/lib/gamification/badges";
import { resolveCollectorLevel, resolveStreakLevel } from "@/lib/gamification/levels";
import { computeStreaks } from "@/lib/gamification/streaks";
import {
  profileStatsSchema,
  type EarnedBadge,
  type ProfileStats,
} from "@/lib/gamification/schemas";
import { localDateNow } from "@/lib/time/local-date";

/**
 * The single read behind `/profile` and `GET /api/profile/stats`. The page is a
 * server component and calls this directly; the route calls the same function,
 * so the two can never drift.
 *
 * **Streaks are recomputed here, on every read, and `user_stats` is never
 * displayed** — [R11], and §5.3 of the plan spells out why. Three of the cached
 * fields are monotonic and safe (`longest_streak`, `total_cards`,
 * `first_card_on`); `current_streak` is not. It decays with the mere passage of
 * time: a user whose last card was 7 August has `current_streak = 5` written on
 * that date, and that value is still sitting in the row on 1 September when the
 * true answer is 0. Nothing writes to correct it, because the user did nothing.
 *
 * So the cache is treated as a value to verify and repair, not to read.
 */
export async function getProfileStats(user: SessionUser): Promise<ProfileStats> {
  // Reads may fall back to a default zone; writes may not. A profile rendered
  // under a guessed zone is a cosmetic error for one session, and a 500 here for
  // a user who abandoned onboarding would be worse.
  const { timezone } = await getCardContext(user.id);
  const tz = timezone.timezone;
  const today = localDateNow(tz);

  const [cardDates, totalManualWords, badgeCounts] = await Promise.all([
    getCardDates(user.id),
    countManualWords(user.id),
    getBadgeCounts(user.id),
  ]);

  const streaks = computeStreaks(cardDates, today);

  await repairCache(user.id, streaks);

  const badges: EarnedBadge[] = badgeCounts
    .map((row) => {
      const title = badgeTitle(row.badgeKey);
      // A key the catalog no longer knows — possible after a rule is renamed.
      // Skipped rather than rendered with an undefined title; `--prune` cleans
      // it up.
      if (!title) {
        console.warn("[F9] unknown badge key on shelf", { key: row.badgeKey });
        return null;
      }
      return {
        key: row.badgeKey,
        title,
        count: row.count,
        firstAwardedOn: row.firstAwardedOn,
        lastAwardedOn: row.lastAwardedOn,
      };
    })
    .filter((b): b is EarnedBadge => b !== null)
    // Most recent achievement first — the thing a returning user came to see.
    .sort((a, b) => (a.lastAwardedOn < b.lastAwardedOn ? 1 : -1));

  return profileStatsSchema.parse({
    user: { name: user.name, email: user.email },
    timezone: tz,
    todayLocal: today,
    hasCardToday: streaks.lastCardOn === today,
    isEmpty: streaks.totalCards === 0,
    sinceDate: streaks.firstCardOn,
    currentStreak: streaks.currentStreak,
    longestStreak: streaks.longestStreak,
    totalCards: streaks.totalCards,
    totalManualWords,
    streakLevel: resolveStreakLevel(streaks.longestStreak),
    collectorLevel: resolveCollectorLevel(totalManualWords),
    badges,
  } satisfies ProfileStats);
}

/**
 * The one number /today's header shows. Recomputed on read like everything else
 * in this feature — §5.3's rule binds every consumer, not just /profile, and
 * `user_stats.current_streak` is exactly as stale on /today as it is here.
 *
 * Returns 0 when the run has ended, which is what makes the header pill
 * disappear rather than announce a loss.
 */
export async function getCurrentStreak(
  userId: string,
  timezone: string,
): Promise<number> {
  const dates = await getCardDates(userId);
  return computeStreaks(dates, localDateNow(timezone)).currentStreak;
}

/**
 * Opportunistic repair. The page has just computed the truth; if the cache
 * disagrees, correct it while we are here.
 *
 * No row is created for a user with zero cards — an all-zero row would be a
 * record of nothing. A failure is swallowed: the cache is not what the page
 * renders, so a write problem must not cost the user their profile.
 */
async function repairCache(
  userId: string,
  truth: ReturnType<typeof computeStreaks>,
): Promise<void> {
  if (truth.totalCards === 0) return;

  try {
    const cached = await readUserStats(userId);
    const agrees =
      cached !== null &&
      cached.currentStreak === truth.currentStreak &&
      cached.longestStreak === truth.longestStreak &&
      cached.totalCards === truth.totalCards &&
      cached.firstCardOn === truth.firstCardOn &&
      cached.lastCardOn === truth.lastCardOn;

    if (agrees) return;
    await upsertUserStats(userId, truth);
  } catch (err) {
    console.error("[F9] user_stats repair failed", { userId, err });
  }
}
