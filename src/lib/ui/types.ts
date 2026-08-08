/**
 * Presentational types shared between the UI kit and the features that feed it.
 *
 * These are view shapes, not database rows. A feature maps its Drizzle result
 * into one of these; the kit never imports from `lib/db`.
 */

/** One word as it appears on the daily card. */
export type DailyCardItemView = {
  /** `vocab_entries.id` — also the `/vocab/[id]` segment. */
  id: string;
  term: string;
  /** Null while `enrichment_status !== 'ready'`; the row renders a Skeleton. */
  definition: string | null;
  /** Part of speech, set in mono beside the term. Optional. */
  tag?: string | null;
};

/**
 * A day in the week strip or the month grid.
 *
 * `isToday` is orthogonal to `mark` on purpose. The design's rule is that today
 * is drawn as an open ring rather than a cross when no card exists yet — a day
 * is not a failure until it is over — but a card made today still earns its
 * tick. Collapsing the two into one enum loses that.
 */
export type CalendarMark = "made" | "missed" | "future";

export type CalendarDayView = {
  /** "YYYY-MM-DD", the user's local calendar date. */
  date: string;
  /** 1..31, the numeral drawn in the cell. */
  day: number;
  mark: CalendarMark;
  isToday?: boolean;
};

export type ChatRole = "user" | "assistant";

export type LevelKind = "streak" | "collector";
