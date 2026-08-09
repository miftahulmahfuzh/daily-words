"use client";

import { useState, useTransition } from "react";
import { BackLink } from "@/components/layout/back-link";
import { CalendarCell, CalendarMarkGlyph } from "@/components/ui/calendar-cell";
import { Meta } from "@/components/ui/text";
import { dayStateLabel, toCalendarMark } from "@/lib/cards/calendar";
import { fetchCalendarMonth } from "@/lib/cards/client";
import { cardPermalinkHref } from "@/lib/cards/links";
import type { CalendarResponse, DayState } from "@/lib/cards/schemas";
import {
  addLocalMonths,
  formatLocalDateLong,
  formatMonthLabel,
  localDayOfWeek,
  localMonthOf,
  parseLocalDate,
} from "@/lib/time/local-date";
import { cn } from "@/lib/ui/cn";

/**
 * Ticks and crosses, a month at a time.
 *
 * Month navigation is prev/next controls, never a horizontal swipe. A swipe
 * starting within ~20px of the screen edge is claimed by iOS for back
 * navigation, which is exactly where a one-handed thumb lands first.
 *
 * The server renders the first month; this component only ever *replaces* it.
 * The previous month stays on screen while the next one loads — a grid that
 * blanks for 200ms on every arrow press reads as breakage, and there is nothing
 * useful to show in its place.
 */

const DOW = ["M", "T", "W", "T", "F", "S", "S"];

export function MonthView({ initial }: { initial: CalendarResponse }) {
  const [data, setData] = useState(initial);
  const [loading, startLoad] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);

  // The clamps. `today` and `anchor` come from the server, which owns what day
  // it is; an unclamped forward arrow would walk into months of `future` and an
  // unclamped back arrow into months the user was not here for.
  const currentMonth = localMonthOf(data.today);
  const anchorMonth = data.anchor ? localMonthOf(data.anchor) : currentMonth;
  const canGoBack = data.month > anchorMonth;
  const canGoForward = data.month < currentMonth;

  function go(delta: number) {
    if (loading) return;
    const month = addLocalMonths(data.month, delta);
    setProblem(null);
    startLoad(async () => {
      const result = await fetchCalendarMonth(month);
      if (!result.ok) {
        setProblem(result.message);
        return;
      }
      setData(result.data);
    });
  }

  const first = data.days[0];
  // Monday-first, stated in the code rather than derived from a locale: the
  // grid's leading blanks and the weekday header have to agree, and a locale
  // that disagreed with the header would silently shift every mark by a day.
  const leading = first ? (localDayOfWeek(first.date) + 6) % 7 : 0;

  return (
    <>
      <div className="flex items-center justify-between pb-4">
        <BackLink href="/today" label="Today" />
        <div className="flex items-center gap-1.5">
          <Arrow
            direction="prev"
            disabled={!canGoBack}
            onClick={() => go(-1)}
            label="Previous month"
          />
          <span className="min-w-[9.5rem] text-center text-[19px]">
            {formatMonthLabel(data.month)}
          </span>
          <Arrow
            direction="next"
            disabled={!canGoForward}
            onClick={() => go(1)}
            label="Next month"
          />
        </div>
      </div>

      <div className="grid grid-cols-7 gap-0.5 pb-2">
        {DOW.map((letter, i) => (
          <span
            key={i}
            className="text-center font-mono text-mono-2xs tracking-chip text-ink-3 uppercase"
          >
            {letter}
          </span>
        ))}
      </div>

      <div
        className={cn("grid grid-cols-7 gap-0.5", loading && "opacity-60")}
        aria-busy={loading || undefined}
      >
        {Array.from({ length: leading }, (_, i) => (
          <CalendarCell key={`blank-${i}`} day={null} mark="future" />
        ))}
        {data.days.map((day) => (
          <CalendarCell
            key={day.date}
            day={parseLocalDate(day.date).day}
            accessibleDate={formatLocalDateLong(day.date)}
            {...toCalendarMark(day.state)}
            /* F18 gave a past card a destination. Today's card keeps `/today`,
               which is the live screen and where the nudge lives; every earlier
               day with a card goes to `/card/<date>`, the app's first
               owner-side view of a day that happened.

               A day with no card is still a mark rather than a destination, and
               `CalendarCell` refuses `href` unless `mark === "made"` — the same
               rule from the other side, so nothing else here needs guarding. */
            href={
              day.state === "today_card"
                ? "/today"
                : day.state === "card"
                  ? cardPermalinkHref(day.date)
                  : undefined
            }
          />
        ))}
      </div>

      <div className="flex flex-col gap-3.5 pt-5 pb-4">
        <div className="flex flex-wrap gap-x-[18px] gap-y-3.5 font-mono text-mono-xs tracking-[0.08em] text-ink-3">
          <Legend state="card">card made</Legend>
          <Legend state="miss">missed</Legend>
          <Legend state="today_none">today</Legend>
          <Legend state="future">not yet</Legend>
        </div>
        {/* The one number on this screen a user might feel judged by, so it is
            measured against the days they were actually here for. */}
        <Meta>
          {data.cardCount} of {data.markableCount}{" "}
          {data.markableCount === 1 ? "day" : "days"}
        </Meta>
        {problem && <Meta className="text-red">{problem}</Meta>}
      </div>
    </>
  );
}

/**
 * Out-of-range arrows are disabled and dimmed, never hidden: a control that
 * vanishes leaves the user wondering whether they broke something, and the
 * chevron's position is how they know which way is which.
 */
function Arrow({
  direction,
  disabled,
  onClick,
  label,
}: {
  direction: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-11 items-center justify-center font-mono text-mono-xl text-ink-3",
        disabled && "opacity-30",
      )}
    >
      {direction === "prev" ? "‹" : "›"}
    </button>
  );
}

/** The key, drawn with the same glyph component as the grid so it cannot lie. */
function Legend({ state, children }: { state: DayState; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <CalendarMarkGlyph {...toCalendarMark(state)} />
      <span className="sr-only">{dayStateLabel(state)}:</span> {children}
    </span>
  );
}
