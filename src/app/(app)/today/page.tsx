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
          eyebrow={<Eyebrow>{formatLocalDateWeekday(today)}</Eyebrow>}
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
