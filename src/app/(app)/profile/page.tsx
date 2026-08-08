import { Screen, ScreenBody } from "@/components/layout/screen";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { BadgeRow } from "@/components/ui/badge-row";
import { LevelPill } from "@/components/ui/level-pill";
import { Eyebrow, Meta, Prose } from "@/components/ui/text";
import { requireUser } from "@/lib/auth/session";
import { signOutAction } from "@/lib/auth/actions";
import { STATS, BADGES, PROFILE } from "@/lib/sample-data";

/* The pride screen. No nagging, no loss-aversion, no unseen-badge dots —
   the tone is dry and affectionate, matching the level names.

   F1 owns only the identity line and the sign-out control here — they are what
   prove the auth loop closes. Every figure below is still sample data; F9 owns
   replacing it with real queries, and [R11] requires it to recompute the streak
   on read rather than trust the `user_stats` cache. */
export default async function ProfilePage() {
  const user = await requireUser();

  return (
    <Screen tabs>
      <ScreenBody scroll className="pb-4">
        <div className="flex shrink-0 flex-col gap-3 pb-5.5">
          <Eyebrow>{user.name ?? user.email}</Eyebrow>
          <LevelPill
            kind="streak"
            label={PROFILE.streakLevel}
            tier={5}
            tierCount={9}
            className="self-start"
          />
          <Meta>Next: {PROFILE.nextLevel}.</Meta>
        </div>

        {/* A ruled grid rather than four cards: these are readings off one
            instrument, not four separate things. */}
        <div className="grid shrink-0 grid-cols-2 border-t border-l border-rule">
          {STATS.map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col gap-[5px] border-r border-b border-rule px-3.5 py-4"
            >
              <span className="text-[32px] leading-none tracking-display tabular-nums">
                {stat.n}
              </span>
              <Eyebrow size="sm" className="tracking-[0.16em]">
                {stat.label}
              </Eyebrow>
            </div>
          ))}
        </div>

        <Prose className="shrink-0 py-4.5 pb-6">{PROFILE.since}</Prose>

        <Eyebrow size="sm">Badges</Eyebrow>
        <div className="flex shrink-0 flex-col pt-2">
          {BADGES.map((badge) => (
            <BadgeRow key={badge.key} label={badge.name} count={badge.count} />
          ))}
        </div>

        <form action={signOutAction} className="shrink-0 pt-7">
          <SignOutButton />
        </form>
      </ScreenBody>
    </Screen>
  );
}
