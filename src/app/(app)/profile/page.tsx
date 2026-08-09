import { Screen, ScreenBody } from "@/components/layout/screen";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { EditProfileLink } from "@/components/profile/edit-profile-link";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow, Prose } from "@/components/ui/text";
import { requireUser } from "@/lib/auth/session";
import { signOutAction } from "@/lib/auth/actions";
import { getProfileStats } from "@/lib/gamification/profile-stats";
import { formatLocalDateLong } from "@/lib/time/local-date";
import { BadgeShelf } from "./badge-shelf";
import { LevelBlock } from "./level-block";
import { StatsGrid } from "./stats-grid";

/**
 * The pride screen.
 *
 * Every number here is recomputed from `daily_cards` on this request. [R11]:
 * `user_stats` is a cache, and `current_streak` in particular rots by the mere
 * passage of time — nothing writes to that row when a user simply stops
 * appearing. `getProfileStats` verifies and repairs it; the page never shows it.
 *
 * What is deliberately not on this page: no "your streak is at risk", no
 * countdown, no freeze tokens, no red states, no leaderboard, no share button,
 * no unseen-badge dot. A long-time user should feel a record kept. A brand-new
 * one should find it inviting without being credited with anything they have not
 * done — which is why the counters vanish at zero cards rather than reading
 * "0 · 0", and why the badge shelf still shows all fourteen names.
 *
 * F13 made those rows tappable. This page is unchanged by it — still a server
 * component, still `force-dynamic`, still passing the same plain-JSON
 * `EarnedBadge[]`. The dialog, its state and its client boundary all live inside
 * `BadgeShelf`.
 */
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser();
  const stats = await getProfileStats(user);

  return (
    <Screen tabs>
      <ScreenBody scroll className="pb-4">
        <div className="flex shrink-0 flex-col gap-5 pb-5.5">
          <Eyebrow>{stats.user.name ?? stats.user.email}</Eyebrow>
          {/* Both tables, always. The streak level is keyed on the *longest*
              streak, so a lapse never takes a title away. */}
          <LevelBlock kind="streak" label="Streak" level={stats.streakLevel} />
          <LevelBlock
            kind="collector"
            label="Collection"
            level={stats.collectorLevel}
          />
        </div>

        {/* Branching on `sinceDate` rather than on `isEmpty`, which is the same
            question — both are "has this user ever made a card" — but this one
            also narrows the date for the line below it. */}
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

        <BadgeShelf badges={stats.badges} />

        {/* F7's row and F1's sign-out, kept at the foot where the page turns
            from a record into settings. */}
        <div className="shrink-0 pt-7">
          <EditProfileLink />
        </div>

        <form action={signOutAction} className="shrink-0 pt-7">
          <SignOutButton />
        </form>
      </ScreenBody>
    </Screen>
  );
}
