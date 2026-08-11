import { localDayOfWeek, parseLocalDate, type LocalDate } from "@/lib/time/local-date";

/**
 * The twenty badges, and the one function that decides which of them a card
 * earns.
 *
 * **Pure. No database, no `new Date()`, no ambient clock.** This is the most
 * important property in the feature: the live award path and the backfill call
 * this same function, so replaying a user's whole history can never disagree
 * with what was awarded at the time. Every input arrives in the context.
 *
 * Keys and titles are ROADMAP_v0.1.0.md's badge table. The apostrophes are
 * typographic for the reason given at the top of `levels.ts`.
 *
 * `tolkien` is the fourteenth and post-dates v0.1.0 — see [R22]. The roadmap's
 * table was amended rather than left at thirteen, so this file and it still
 * agree; F13 §D8 is where the key, the title and the spelling were argued.
 *
 * **The prose lives next door.** Each badge's `condition` and `gloss` are in
 * `badge-meta.ts`, deliberately not here: `reveal.ts` imports this module and
 * ships it to every `/today` visit, and ~4.6 kB of explanation that only
 * `/profile` renders has no business in that bundle (F13 D1). This file stays a
 * pure array of keys and titles.
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
  // Appended, and appended for a reason: catalog order is shelf order, toast
  // order and evaluator return order, and `check-gamification.ts` asserts a
  // specific index tuple. Adding at the end preserves every existing index.
  // The key names the trigger, as every other key here does — `sauron` names a
  // joke and would be unreadable in a `badges_awarded` row or a recompute diff.
  { key: "tolkien", title: "Sauron’s Favourite" },
  // Badges #15–#20, appended for the reason above and in the order they were
  // asked for. Two of them — `five_shares` and `ten_journal_lines` — are the
  // first badges in the deck that read a fact about a table other than
  // `daily_cards`; see the note above `crossedMultipleOf` for what that costs.
  { key: "three_in_a_week", title: "Three Times the Charm" },
  { key: "thirty_day_streak", title: "This Is the Way" },
  // Title names the incantation; the key still names the man, and stays that
  // way for `ibu`'s reason above — it is the value in `badges_awarded`, in the
  // art filename and in `style.md`'s scene list. The title carries no meaning
  // for the reader who has not read the books, so `condition` names the day and
  // the man instead of leaning on it.
  { key: "dumbledore", title: "Avada Kedavra" },
  // Retitled. The key stays `dobby` for `ibu`'s reason above. The old title
  // quoted the moment of the freeing and needed the sock to be known; this one
  // names the state instead, and is four of the six words on the stone that
  // `gloss` counts without quoting. The gloss is left alone deliberately: its
  // move is that the date is reconstructed rather than read, which the title
  // does not spend — unlike `dumbledore` above, where it did.
  { key: "dobby", title: "Dobby The Free Elf" },
  { key: "five_shares", title: "The Good Samaritan" },
  // Retitled. The key stays `ten_journal_lines` for `ibu`'s reason above — it is
  // the value in `badges_awarded`, in the art filename and in `style.md`'s scene
  // list. "Another Link in the Chain" was a defect rather than a preference: as
  // an English idiom it means *one more of the same*, which is close to the
  // opposite of what a maester's chain is, where no two links are alike and each
  // one is a different subject. The `gloss` in `badge-meta.ts` was already about
  // maesters and the art was already the chain; only the title disagreed.
  { key: "ten_journal_lines", title: "Maester of the Seven Kingdoms" },
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
  /**
   * Cards in the Monday-start calendar week containing `cardDate`, counting up
   * to and including this one. Monday-start because the app's own fiction says
   * so — `sunday`'s gloss has the ration week ending on a Sunday — and because
   * a week that ends mid-count would award `three_in_a_week` twice for the same
   * three cards.
   */
  cardsThisLocalWeek: number;
  /**
   * Words shared, at this card's instant and at the previous card's. A pair
   * rather than a total because the rule is a **crossing**: see
   * `crossedMultipleOf`.
   */
  sharedWordsNow: number;
  sharedWordsAtPreviousCard: number;
  /** Journal lines written, same pair and same reason. */
  journalLinesNow: number;
  journalLinesAtPreviousCard: number;
};

/**
 * True when `now` has passed a multiple of `step` that `before` had not.
 *
 * **Why a crossing and not `total % step === 0`.** Badges are judged once per
 * card, and `badges_awarded` is unique on `(user_id, badge_key,
 * awarded_for_date)` — so a rule that is a property of a *total* re-fires on
 * every subsequent card while the total sits still. Five shared words followed
 * by thirty quiet days would award `five_shares` thirty times. A crossing fires
 * on the one card that follows the fifth share and never again.
 *
 * **Two consequences, both deliberate.** Several milestones passed between two
 * cards award once, not once each: sharing ten words in an afternoon is one
 * award, because the badge marks the moment the app noticed. And a count that
 * has gone *down* — shares and journal lines are both hard-deletable, unlike
 * `daily_cards` — awards nothing rather than re-awarding on the way back up.
 *
 * That deletability is the one place this deck is not perfectly replayable.
 * `npm run stats:recompute` recounts from the rows that exist *now*, so a user
 * who deletes a shared word can make the replay disagree with what was awarded
 * on the day. A plain recompute only inserts and is therefore harmless; only
 * `--prune` would act on the difference, and it already refuses `--all` without
 * `--force`. The alternative was a monotonic counter column, which is a
 * migration and a write hook in two features this one does not own.
 */
function crossedMultipleOf(before: number, now: number, step: number): boolean {
  if (now <= before) return false;
  return Math.floor(now / step) > Math.floor(before / step);
}

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

  // J.R.R. Tolkien died on 2 September 1973, aged 81. No year test: the
  // anniversary is the trigger, and 1973 itself qualifies. Note that this is
  // (9, 2) and `leap_day` above is (2, 29) — a transposed comparison passes a
  // single-date test and fails the pair `check-gamification.ts` runs.
  if (month === 9 && day === 2) earned.push("tolkien");

  // Three cards in one Monday-start week, on the third card and only on the
  // third. `=== 3`, never `>= 3`: the literal reading awards again on days four
  // through seven, which is [R12]'s trap in the same form `full_week` already
  // documents. Once per calendar week is the whole rule.
  if (ctx.cardsThisLocalWeek === 3) earned.push("three_in_a_week");

  // Thirty consecutive days, and again at sixty and ninety — `full_week`'s
  // shape with a longer stride. A calendar month was rejected: February would
  // make it two days cheaper than August, and a run that starts on the 3rd
  // could never earn it at all.
  if (ctx.runLength > 0 && ctx.runLength % 30 === 0) earned.push("thirty_day_streak");

  // Albus Dumbledore, killed on the Astronomy Tower shortly after midnight on
  // 30 June 1997. "Shortly after midnight" is why the gloss can promise this
  // one arrives with `midnight_oil` for anyone who keeps the hour.
  if (month === 6 && day === 30) earned.push("dumbledore");

  // Dobby, killed at Shell Cottage on 30 March 1998; buried the next morning.
  // The books give no date — this is the Harry Potter Lexicon's reconstruction
  // from the Easter 1998 chronology, unlike `tolkien`, which is a fact about a
  // real person. Note the pair: this is (3, 30) and `dumbledore` above is
  // (6, 30). Written with the month dropped, either one fires on both days.
  if (month === 3 && day === 30) earned.push("dobby");

  // Every fifth word handed to somebody else, and every tenth journal line.
  // Crossings, not totals — see `crossedMultipleOf`, which is the whole reason
  // these two arrive as a pair of counts rather than one.
  if (crossedMultipleOf(ctx.sharedWordsAtPreviousCard, ctx.sharedWordsNow, 5)) {
    earned.push("five_shares");
  }
  if (crossedMultipleOf(ctx.journalLinesAtPreviousCard, ctx.journalLinesNow, 10)) {
    earned.push("ten_journal_lines");
  }

  return earned;
}
