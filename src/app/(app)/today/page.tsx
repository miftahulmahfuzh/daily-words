import Link from "next/link";
import { Screen, ScreenBody, ScreenHeader } from "@/components/layout/screen";
import { DailyCard } from "@/components/daily/daily-card";
import { DayStrip, type DayStripItem } from "@/components/daily/day-strip";
import { NoCardYet } from "@/components/daily/no-card-yet";
import { RewardToast } from "@/components/gamification/reward-toast";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Eyebrow } from "@/components/ui/text";
import { buildRecentDays, resolveAnchor, toCalendarMark } from "@/lib/cards/calendar";
import { toDailyCardItemView } from "@/lib/cards/serialize";
import { requireUser } from "@/lib/auth/session";
import {
  countActiveWords,
  countWords,
  getCardContext,
  getCardDatesBetween,
  getCardForDate,
  getFirstCardDate,
} from "@/lib/db/queries/cards";
import { cardPermalinkHref } from "@/lib/cards/links";
import { getCurrentStreak } from "@/lib/gamification/profile-stats";
import {
  addLocalDays,
  formatLocalDateWeekday,
  localDateNow,
  parseLocalDate,
  weekdayLetter,
} from "@/lib/time/local-date";
import { LAYOUT } from "@/lib/ui/layout";
import { vocabListHref } from "@/lib/vocab/links";
import { CardEmpty } from "./card-empty";
import { NudgeButton } from "./nudge-button";

/**
 * The centrepiece, and the only screen in the app that does not scroll.
 *
 * `ScreenBody` without `scroll` is what enforces that: the pane is
 * `overflow: hidden`, so even a miscalculation clips — which is loud and gets
 * noticed — rather than quietly making the card draggable. The card between the
 * header and the strip is `flex-1` and absorbs every device's slack ([R19]).
 *
 * Everything here is a database read. **Nothing on this page creates a card**;
 * the only thing that does is the button, and only when a finger lands on it.
 */
export const dynamic = "force-dynamic";

const STRIP_DAYS = 7;

export default async function TodayPage() {
  const user = await requireUser();

  const { timezone, profileCreatedAt } = await getCardContext(user.id);
  const tz = timezone.timezone;
  const today = localDateNow(tz);

  const [card, recentCardDates, firstCardDate, currentStreak] = await Promise.all([
    getCardForDate(user.id, today),
    getCardDatesBetween(user.id, addLocalDays(today, -(STRIP_DAYS - 1)), today),
    getFirstCardDate(user.id),
    getCurrentStreak(user.id, tz),
  ]);

  // Only asked when the answer changes what is drawn. A card on the screen
  // already proves there were words to make it from.
  const [activeWordCount, totalWordCount] = card
    ? [0, 0]
    : await Promise.all([countActiveWords(user.id), countWords(user.id)]);

  const anchor = resolveAnchor(firstCardDate, profileCreatedAt, tz);
  const strip: DayStripItem[] = buildRecentDays(
    { today, anchor, cardDates: new Set(recentCardDates) },
    STRIP_DAYS,
  ).map((day) => ({
    date: day.date,
    day: parseLocalDate(day.date).day,
    weekday: weekdayLetter(day.date),
    ...toCalendarMark(day.state),
  }));

  return (
    <Screen tabs>
      <ScreenBody>
        {/* F9 filled the slot F5 left empty: the design's "12 day run" pill,
            taking the same tap to /calendar as the strip below.

            Hidden at zero rather than showing "0 day run". A user between runs
            is told nothing, because a zero here would be the app pointing at an
            absence — and the profile page is where the honest number lives. */}
        <ScreenHeader
          className="pb-3"
          /**
           * **F18 D3's fallback, taken on measurement.**
           *
           * The plan wanted a Share pill beside the streak pill, at the streak
           * pill's height, costing zero vertical pixels — and named the width as
           * its own R7: "the title, `gap-3`, a three-digit streak pill and a
           * Share pill in 331px is roughly 33px of slack **by calculation**."
           * The calculation was wrong. Measured at 375×667 with `?streak=365`,
           * the header goes from 70.4px to **117px**: the trailing block wins the
           * space and "Today's card" wraps to two lines. That costs each card row
           * ~4.8px, and 60.8px still clears the 52px floor — so all eighteen
           * existing assertions would have stayed green while the screen got
           * visibly worse. The new single-row assertion in `no-scroll.spec.ts`
           * exists for exactly that blind spot, and it is what caught this.
           *
           * So the date becomes the link, as D3 instructed — "take the fallback
           * rather than shrinking the title or truncating the streak" — and the
           * full-size Share control lives on `/card/[date]`, one tap away, where
           * a scrolling screen can afford a real 44px target and where D18's
           * revocation already lives.
           *
           * Only when there is a card. On a day with no card the eyebrow is
           * still the date, but it leads nowhere, because there is nothing there
           * yet.
           */
          eyebrow={
            card ? (
              <Link href={cardPermalinkHref(today)} className="w-fit">
                <Eyebrow>{formatLocalDateWeekday(today)}</Eyebrow>
              </Link>
            ) : (
              <Eyebrow>{formatLocalDateWeekday(today)}</Eyebrow>
            )
          }
          title="Today’s card"
          trailing={
            currentStreak > 0 ? (
              // Same className as `/kitchen-sink/today`'s fixture, which is what
              // the no-scroll spec has been measuring the header against since
              // F2 — the 70.4px header in the budget ledger already includes
              // this pill. Change one, change both.
              <Pill href="/calendar" mono className="min-h-[32px] text-mono-xs">
                {currentStreak} day run
              </Pill>
            ) : undefined
          }
        />

        {card ? (
          <DailyCard
            items={card.items.map(toDailyCardItemView)}
            /**
             * The one page in the app that pays for a full prefetch, and the one
             * that earns it: these six rows are the app's most-tapped links, and
             * the card never scrolls, so all six are in the viewport by
             * construction — the prefetch fires for every ready row without the
             * user doing anything.
             *
             * `true` is `PrefetchKind.FULL`, whose payload is *reusable* for
             * `STATIC_STALETIME_MS` (300s). The default `auto` kind is only
             * `stale`, reusing a loading boundary and lazy-fetching the real data
             * on tap, which is what made the tap slow. No `staleTimes` config:
             * setting `dynamic` would extend reuse to every dynamic navigation in
             * the app, where `FULL` buys it on this one page.
             *
             * The cost is deliberate and was priced: six page renders fire once
             * this screen settles, at ~3 Neon round trips each, at low priority,
             * once per view. That is why `getSessionUser`, `getProfile` and
             * `getVocabEntryDetail` were made to stop duplicating reads first —
             * the amplification is what makes those round trips worth removing.
             *
             * **None of this is observable in `next dev`**: viewport prefetching
             * returns early outside production (`client/components/links.js`),
             * which is also why `npm run test:layout` — which boots `npm run
             * dev` — is untouched by it, and cannot cover it. The verification is
             * a production build and the Network panel; the procedure is in
             * `docs/plans/2026-08-11-today-card-prefetch-design.md`.
             */
            prefetch
            shortCardAction={
              card.items.length < LAYOUT.cardSize ? (
                <Button variant="quiet" size="sm" fullWidth={false} href="/vocab/new">
                  Add more words
                </Button>
              ) : undefined
            }
          />
        ) : !timezone.ok ? (
          /* Reads fall back to a default zone so the screen is not blank, but
             the button is withheld: a card written under a guessed timezone is
             a wrong date in a permanent record.

             F7 made the destination /profile/edit rather than /onboarding. The
             gate guarantees a profile row by the time this renders, so the only
             way to be here is a stored zone that is not a valid IANA name — and
             /onboarding would bounce an onboarded user straight back to /today,
             which is a dead end. The manual override is the actual fix. */
          <CardEmpty
            title="Set your timezone to start a card."
            actions={
              <Button variant="filled" size="sm" fullWidth={false} href="/profile/edit">
                Set timezone
              </Button>
            }
          />
        ) : activeWordCount > 0 ? (
          <NoCardYet action={<NudgeButton />} />
        ) : (
          <CardEmpty
            title={totalWordCount > 0 ? "Every word mastered." : "No words yet."}
            actions={
              <>
                <Button variant="filled" size="sm" fullWidth={false} href="/vocab/new">
                  Add a word
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  fullWidth={false}
                  href={vocabListHref({ tab: "discover" })}
                >
                  Discover
                </Button>
              </>
            }
          />
        )}

        {/* The strip answers "have I been keeping it up?" and taps through to
            the month, where a day becomes something you can point at. */}
        <Link href="/calendar" aria-label="Open the calendar" className="block shrink-0">
          <DayStrip days={strip} />
        </Link>

        {/* Mounted unconditionally and outside the card/no-card branch, because
            `NudgeButton` — which receives the payload — is inside that branch
            and unmounts the instant the card replaces it. Fixed-position, so it
            costs the no-scroll budget nothing. */}
        <RewardToast />
      </ScreenBody>
    </Screen>
  );
}
