import { diffLocalDays, type LocalDate } from "@/lib/time/local-date";

/**
 * Streak arithmetic. Pure, and deliberately dull.
 *
 * F9's plan §6.1 proposed a `lib/gamification/dates.ts` carrying its own
 * `Intl.DateTimeFormat`, `toDayNumber` and `dayOfWeek`. That file is not built:
 * `lib/time/local-date.ts` already is all of it, and the project contract says
 * it is the *only* place a day boundary is computed or a date is added. Two
 * implementations of "what day is it" is the one bug this whole feature cannot
 * survive, so this module does no date arithmetic of its own — it converts to
 * integers through `diffLocalDays` and stays there.
 */

/**
 * Days since 1970-01-01, from the date **string**.
 *
 * The distinction that matters: this never parses a local-time `Date`. Once a
 * card's local date is a string, DST, leap seconds and offset changes cannot
 * touch it, because a calendar date has no duration.
 */
const EPOCH: LocalDate = "1970-01-01";

export function toDayNumber(date: LocalDate): number {
  return diffLocalDays(EPOCH, date);
}

export type StreakResult = {
  currentStreak: number;
  longestStreak: number;
  totalCards: number;
  firstCardOn: LocalDate | null;
  /** [R11] the column that makes a stale `current_streak` detectable. */
  lastCardOn: LocalDate | null;
};

export const EMPTY_STREAKS: StreakResult = {
  currentStreak: 0,
  longestStreak: 0,
  totalCards: 0,
  firstCardOn: null,
  lastCardOn: null,
};

/**
 * A streak is a run of consecutive local calendar dates carrying a card.
 *
 * Two rules do all the work, and both exist to keep the page from ever reading
 * as an accusation:
 *
 *  - **The current streak is the run ending at today OR at yesterday.** Not
 *    having made today's card breaks nothing — the day is not over. A user with
 *    cards on the 4th–7th, asked on the 8th, has a streak of 4, at 09:00 and
 *    still at 23:50. The app never counts down.
 *  - A streak breaks only in retrospect: from a gap between two cards, never
 *    from the clock passing midnight.
 *
 * `last >= today - 1` rather than an equality pair, so a card dated in the
 * *future* — reachable by a westward timezone change — still anchors the run
 * instead of silently zeroing it.
 *
 * @param dates every `card_date` for the user, any order; duplicates tolerated.
 * @param today the user's local date right now, computed in their timezone.
 */
export function computeStreaks(dates: LocalDate[], today: LocalDate): StreakResult {
  if (dates.length === 0) return EMPTY_STREAKS;

  const nums = [...new Set(dates.map(toDayNumber))].sort((a, b) => a - b);

  let longest = 1;
  let run = 1; // length of the run ending at nums[i]
  for (let i = 1; i < nums.length; i++) {
    run = nums[i] === nums[i - 1] + 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }
  // `run` now holds the length of the final run — the one ending at the last date.

  const last = nums[nums.length - 1];
  const sorted = [...new Set(dates)].sort();

  return {
    currentStreak: last >= toDayNumber(today) - 1 ? run : 0,
    longestStreak: longest,
    totalCards: nums.length,
    firstCardOn: sorted[0],
    lastCardOn: sorted[sorted.length - 1],
  };
}

/**
 * Length of the consecutive run ending exactly at `target`. 0 if `target` has no
 * card. Drives `full_week`, which is the one badge that is a fact about history
 * rather than about a date.
 *
 * The caller passes only the dates up to and including the card being judged —
 * a replay must not see the future, or a backfilled `full_week` would disagree
 * with what was awarded live.
 */
export function runLengthEndingAt(dayNums: number[], target: number): number {
  const set = new Set(dayNums);
  if (!set.has(target)) return 0;
  let n = 0;
  for (let d = target; set.has(d); d--) n++;
  return n;
}

/**
 * Which Monday-start week a day number falls in.
 *
 * 1970-01-01 was a Thursday, so `+ 3` puts every Monday on a multiple of seven
 * and `Math.floor` carries that correctly into negative day numbers — a date
 * before the epoch is reachable here, because a user may type any birth year
 * into a card date the database will accept.
 *
 * Integer arithmetic on day numbers, like everything else in this file. It is
 * deliberately not `Intl`'s idea of a week: `lib/time/local-date.ts` is the only
 * module allowed to ask a calendar anything, and a locale-dependent first day of
 * the week would make `three_in_a_week` mean different things in two zones.
 */
function weekIndex(dayNum: number): number {
  return Math.floor((dayNum + 3) / 7);
}

/**
 * How many cards fall in `target`'s Monday-start week, counting only days up to
 * and including `target`. 0 if `target` itself has no card.
 *
 * Drives `three_in_a_week`. The caller passes only the dates up to and including
 * the card being judged, for the same reason `runLengthEndingAt` requires it: a
 * replay that saw the rest of the week would award the badge on Monday.
 */
export function countInWeekEndingAt(dayNums: number[], target: number): number {
  const set = new Set(dayNums);
  if (!set.has(target)) return 0;
  const week = weekIndex(target);
  let n = 0;
  for (const d of set) {
    if (d <= target && weekIndex(d) === week) n++;
  }
  return n;
}
