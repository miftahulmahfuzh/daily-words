import type { CalendarMark } from "@/lib/ui/types";
import type { CalendarDay, DayState } from "@/lib/cards/schemas";
import {
  addLocalDays,
  localMonthDates,
  toLocalDate,
  type LocalDate,
  type LocalMonth,
} from "@/lib/time/local-date";

/**
 * How a date becomes a mark. Pure, and shared by the /today week strip, the
 * /calendar month grid and the calendar route — so the three can never disagree
 * about what happened on a given day.
 *
 * No `server-only`: the month view is a client component and imports the
 * mapping half. Nothing here touches the database or the clock; every input is
 * passed in.
 */

export type CalendarContext = {
  /** The user's local calendar date, right now. */
  today: LocalDate;
  /**
   * The first day this calendar may mark — `min(earliest card_date,
   * profile.created_at in local time)`. Null for a user with no history at all.
   */
  anchor: LocalDate | null;
  /** Local dates the user has a card for. */
  cardDates: ReadonlySet<LocalDate>;
};

/**
 * The earliest day the calendar is allowed to judge.
 *
 * `min(first card, the day the profile was created)`. Both may be absent — a
 * brand-new user whose profile row somehow predates nothing — and then the
 * calendar marks only today. This is the whole mechanism behind `pre_start`:
 * without it a user who joined on 8 August opens the month and finds seven
 * crosses for days they were not here for.
 */
export function resolveAnchor(
  firstCardDate: LocalDate | null,
  profileCreatedAt: Date | null,
  timezone: string,
): LocalDate | null {
  const joined = profileCreatedAt ? toLocalDate(profileCreatedAt, timezone) : null;
  if (!firstCardDate) return joined;
  if (!joined) return firstCardDate;
  // ISO dates sort lexicographically, so this is chronological.
  return firstCardDate < joined ? firstCardDate : joined;
}

export function classifyDay(date: LocalDate, ctx: CalendarContext): DayState {
  const hasCard = ctx.cardDates.has(date);

  if (date > ctx.today) return "future";
  if (date === ctx.today) return hasCard ? "today_card" : "today_none";

  // Before the anchor test, so a card always reads as a card. `anchor` is
  // derived data; a tick is a fact, and a fact outranks a derivation.
  if (hasCard) return "card";

  // A card made abroad can carry a local date later than today's — moving west
  // repeats a date. Clamping keeps that from turning today into `pre_start`.
  const start = ctx.anchor && ctx.anchor < ctx.today ? ctx.anchor : ctx.today;
  return date < start ? "pre_start" : "miss";
}

export function buildMonthDays(month: LocalMonth, ctx: CalendarContext): CalendarDay[] {
  return localMonthDates(month).map((date) => ({ date, state: classifyDay(date, ctx) }));
}

/** The last `count` days ending today, oldest first. The /today strip. */
export function buildRecentDays(ctx: CalendarContext, count = 7): CalendarDay[] {
  const days: CalendarDay[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const date = addLocalDays(ctx.today, -i);
    days.push({ date, state: classifyDay(date, ctx) });
  }
  return days;
}

/** Days the calendar is entitled to judge: at or after the anchor, up to today. */
const MARKABLE: ReadonlySet<DayState> = new Set<DayState>([
  "card",
  "miss",
  "today_card",
  "today_none",
]);

export const isMarkable = (state: DayState) => MARKABLE.has(state);

export const isCardDay = (state: DayState) => state === "card" || state === "today_card";

/**
 * State → the kit's two orthogonal inputs.
 *
 * `today_none` maps to `missed` + `isToday`, which `CalendarMarkGlyph` draws as
 * an open ring rather than a cross — the design's rule that a day is not a
 * failure until it is over.
 *
 * `pre_start` and `future` both draw the "nothing to say yet" hairline. They
 * differ in meaning but not in what a user needs to see; the distinction
 * survives in the accessible label.
 */
export function toCalendarMark(state: DayState): { mark: CalendarMark; isToday: boolean } {
  switch (state) {
    case "card":
      return { mark: "made", isToday: false };
    case "today_card":
      return { mark: "made", isToday: true };
    case "miss":
      return { mark: "missed", isToday: false };
    case "today_none":
      return { mark: "missed", isToday: true };
    default:
      return { mark: "future", isToday: false };
  }
}

/** Never encode state by colour alone; this is the glyph's other half. */
export function dayStateLabel(state: DayState): string {
  switch (state) {
    case "card":
      return "card made";
    case "today_card":
      return "today, card made";
    case "miss":
      return "no card";
    case "today_none":
      return "today, no card yet";
    default:
      return "not yet";
  }
}
