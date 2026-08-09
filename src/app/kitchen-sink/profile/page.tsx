import { notFound } from "next/navigation";
import { Screen, ScreenBody } from "@/components/layout/screen";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow, Prose } from "@/components/ui/text";
import { BadgeShelf } from "@/app/(app)/profile/badge-shelf";
import { LevelBlock } from "@/app/(app)/profile/level-block";
import { StatsGrid } from "@/app/(app)/profile/stats-grid";
import { BADGE_CATALOG } from "@/lib/gamification/badges";
import { resolveCollectorLevel, resolveStreakLevel } from "@/lib/gamification/levels";
import type { ProfileStats } from "@/lib/gamification/schemas";
import { formatLocalDateLong } from "@/lib/time/local-date";

/**
 * /profile without a session, so its four states can be read at 375px in both
 * colour schemes. Same components the real page mounts; only the numbers are
 * invented.
 *
 *   ?state=full     a long-running user
 *   ?state=lapsed   cards, but the run has ended — the copy that must not scold
 *   ?state=nowords  cards, zero manually added words ([R13]'s null level)
 *   ?state=empty    a brand-new user
 *
 *   ?badge=<key>    opens F13's badge dialog on load
 *
 * `?badge=` is what makes the modal reviewable at 375px in both colour schemes
 * without a session, and it is the target `tests/e2e/no-scroll.spec.ts` drives:
 * a dialog that only opens on a tap cannot be asserted on before the tap, and a
 * Playwright click is one more thing between the assertion and the claim.
 * `?badge=leap_day` is unearned and `?badge=tolkien` is earned twice, which is
 * both of the dialog's two states.
 *
 * Gated off in production, like the rest of /kitchen-sink.
 */

type State = "full" | "lapsed" | "nowords" | "empty";

function fixture(state: State): ProfileStats {
  const base = {
    user: { name: "Barnaby", email: "barnaby@example.invalid" },
    timezone: "Asia/Jakarta",
    todayLocal: "2026-09-18",
    badges: [] as ProfileStats["badges"],
  };

  if (state === "empty") {
    return {
      ...base,
      hasCardToday: false,
      isEmpty: true,
      sinceDate: null,
      currentStreak: 0,
      longestStreak: 0,
      totalCards: 0,
      totalManualWords: 0,
      streakLevel: resolveStreakLevel(0),
      collectorLevel: null,
    };
  }

  // Five earned badges, including the longest title in the catalog — the one
  // that has to wrap without clipping at 375px — and `tolkien`, whose gloss is
  // the longest string in `badge-meta.ts` and therefore the one that decides
  // whether the dialog needs its scrolling escape hatch.
  const badges: ProfileStats["badges"] = (
    [
      ["sunday", 18, "2026-05-03", "2026-09-13"],
      ["full_week", 3, "2026-06-07", "2026-09-06"],
      ["midnight_oil", 1, "2026-08-22", "2026-08-22"],
      ["first_card", 1, "2026-08-08", "2026-08-08"],
      ["tolkien", 2, "2025-09-02", "2026-09-02"],
    ] as const
  ).map(([key, count, first, last]) => ({
    key,
    title: BADGE_CATALOG.find((b) => b.key === key)!.title,
    count,
    firstAwardedOn: first,
    lastAwardedOn: last,
  }));

  const words = state === "nowords" ? 0 : 86;

  return {
    ...base,
    badges,
    hasCardToday: state === "full",
    isEmpty: false,
    sinceDate: "2026-08-08",
    currentStreak: state === "lapsed" ? 0 : 12,
    longestStreak: 19,
    totalCards: 38,
    totalManualWords: words,
    streakLevel: resolveStreakLevel(19),
    collectorLevel: resolveCollectorLevel(words),
  };
}

export default async function KitchenSinkProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; badge?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const { state, badge } = await searchParams;
  const stats = fixture((state as State) ?? "full");

  return (
    <Screen tabs>
      <ScreenBody scroll className="pb-4">
        <div className="flex shrink-0 flex-col gap-5 pb-5.5">
          <Eyebrow>{stats.user.name}</Eyebrow>
          <LevelBlock kind="streak" label="Streak" level={stats.streakLevel} />
          <LevelBlock kind="collector" label="Collection" level={stats.collectorLevel} />
        </div>

        {stats.sinceDate === null ? (
          <EmptyState
            className="flex-none py-6"
            title="The pocket is empty"
            body="It starts with one card."
            action={{ label: "Make today’s card", href: "/today" }}
          />
        ) : (
          <>
            <StatsGrid stats={stats} />
            <Prose className="shrink-0 py-4.5 pb-6">
              Keeping a card since {formatLocalDateLong(stats.sinceDate)}.
            </Prose>
          </>
        )}

        <BadgeShelf badges={stats.badges} initialBadgeKey={badge} />
      </ScreenBody>
    </Screen>
  );
}
