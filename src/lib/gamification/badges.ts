import { localDayOfWeek, parseLocalDate, type LocalDate } from "@/lib/time/local-date";

/**
 * The thirteen badges, and the one function that decides which of them a card
 * earns.
 *
 * **Pure. No database, no `new Date()`, no ambient clock.** This is the most
 * important property in the feature: the live award path and the backfill call
 * this same function, so replaying a user's whole history can never disagree
 * with what was awarded at the time. Every input arrives in the context.
 *
 * Keys and titles are ROADMAP_v0.1.0.md's badge table. The apostrophes are
 * typographic for the reason given at the top of `levels.ts`.
 */

export const BADGE_CATALOG = [
  { key: "first_card", title: "The Uncle’s Trick" },
  { key: "full_week", title: "Full Week Ration" },
  { key: "sunday", title: "No Weekend Without Ration Card" },
  { key: "midnight_oil", title: "Burning the Midnight Oil" },
  { key: "new_year", title: "Resolution, Documented" },
  { key: "womens_day", title: "Words for Her" },
  { key: "world_book_day", title: "The Bard’s Regard" },
  { key: "fathers_day", title: "For the Old Man" },
  { key: "indonesia_independence", title: "National Speaker" },
  // Title reads "Mama", key stays `ibu`. The key is identity — it is the value
  // in `badges_awarded.badge_key`, in the art filename and in `style.md`'s scene
  // list — and renaming it would orphan every award already made under it
  // (`badgeTitle` returns null for an unknown key, the shelf drops the row, and
  // `--prune` deletes it). The title is display and costs nothing to change.
  { key: "ibu", title: "Mama Would Be Proud" },
  { key: "christmas", title: "Ghost of Christmas Vocab" },
  { key: "year_end", title: "Last Word of the Year" },
  { key: "leap_day", title: "Leap Year Lexicographer" },
] as const;

export type BadgeKey = (typeof BADGE_CATALOG)[number]["key"];

export const BADGE_KEYS: readonly BadgeKey[] = BADGE_CATALOG.map((b) => b.key);

const TITLE_BY_KEY = new Map<string, string>(
  BADGE_CATALOG.map((b) => [b.key, b.title]),
);

/**
 * Null for a key that is not in the catalog — possible after a rule is renamed,
 * and a `undefined` interpolated into a badge list is a worse outcome than a
 * skipped row. The shelf drops unknown keys; `--prune` removes them.
 */
export function badgeTitle(key: string): string | null {
  return TITLE_BY_KEY.get(key) ?? null;
}

export type BadgeContext = {
  /** The card's user-local calendar date. Every date-matching badge reads this. */
  cardDate: LocalDate;
  /**
   * Local wall-clock hour of `created_at`, 0–23, in the zone the card was made
   * in. Only `midnight_oil` uses it, and it is the one badge that is about an
   * instant rather than a day.
   */
  localHour: number;
  /** The user's first card ever, by `card_date`. */
  isFirstCardEver: boolean;
  /** Consecutive-day run ending exactly at `cardDate`, >= 1 for a real card. */
  runLength: number;
};

/**
 * Which badges this card earns. Order follows `BADGE_CATALOG`, which is also
 * shelf order and toast order.
 *
 * Several can fire at once and all are awarded: 2026-12-25 at 01:30 is
 * `christmas` + `midnight_oil`; a first card on a Sunday is `first_card` +
 * `sunday`; 2026-06-21 is `fathers_day` + `sunday`.
 */
export function evaluateBadges(ctx: BadgeContext): BadgeKey[] {
  const { month, day } = parseLocalDate(ctx.cardDate);
  const dow = localDayOfWeek(ctx.cardDate); // 0 = Sunday
  const earned: BadgeKey[] = [];

  // History-based. [R12]: the user's first card ever.
  if (ctx.isFirstCardEver) earned.push("first_card");

  // History-based, and [R12]'s correction to the roadmap's wording. Read
  // literally, "7 cards in 7 consecutive days" is satisfied by *every* day past
  // the seventh, which is 94 awards on a 100-day streak. One award per
  // completed week: 7, 14, 21… A 30-day run yields ×4.
  if (ctx.runLength > 0 && ctx.runLength % 7 === 0) earned.push("full_week");

  if (dow === 0) earned.push("sunday");

  // Time-of-day, on `created_at`, not `card_date`. [R12]: 04:00:00 exactly does
  // NOT qualify, so the window is 00:00:00–03:59:59.999 local.
  if (ctx.localHour < 4) earned.push("midnight_oil");

  if (month === 1 && day === 1) earned.push("new_year");
  if (month === 3 && day === 8) earned.push("womens_day");
  if (month === 4 && day === 23) earned.push("world_book_day");

  // Third Sunday of June, computed rather than looked up: days 1–7 hold the
  // first Sunday, 8–14 the second, 15–21 the third, in every June of every year.
  if (month === 6 && dow === 0 && day >= 15 && day <= 21) earned.push("fathers_day");

  if (month === 8 && day === 17) earned.push("indonesia_independence");
  if (month === 12 && day === 22) earned.push("ibu");
  if (month === 12 && day === 25) earned.push("christmas");
  if (month === 12 && day === 31) earned.push("year_end");

  // No leap-year test: a non-leap year has no card dated 29 February.
  if (month === 2 && day === 29) earned.push("leap_day");

  return earned;
}
