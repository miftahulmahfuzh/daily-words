import Link from "next/link";
import { Screen, ScreenBody, ScreenHeader } from "@/components/layout/screen";
import { DailyCard } from "@/components/daily/daily-card";
import { DayStrip, type DayStripItem } from "@/components/daily/day-strip";
import { NoCardYet } from "@/components/daily/no-card-yet";
import { Button } from "@/components/ui/button";
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

  const [card, recentCardDates, firstCardDate] = await Promise.all([
    getCardForDate(user.id, today),
    getCardDatesBetween(user.id, addLocalDays(today, -(STRIP_DAYS - 1)), today),
    getFirstCardDate(user.id),
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
        {/* The trailing slot is deliberately empty. The design puts a streak
            pill there, and a streak is F9's — F5 must not import it, and
            inventing a substitute would only have to be removed later. */}
        <ScreenHeader
          className="pb-3"
          eyebrow={<Eyebrow>{formatLocalDateWeekday(today)}</Eyebrow>}
          title="Today’s card"
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
             a wrong date in a permanent record. */
          <CardEmpty
            title="Set your timezone to start a card."
            actions={
              <Button variant="filled" size="sm" fullWidth={false} href="/onboarding">
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
      </ScreenBody>
    </Screen>
  );
}
