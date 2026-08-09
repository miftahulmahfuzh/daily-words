/**
 * Counting rows that are not cards.
 *
 * `five_shares` and `ten_journal_lines` are the first badges in the deck that
 * ask a question about a table other than `daily_cards`, and both ask it the
 * same way: *how many of these existed at the moment this card was made?* The
 * live hook and `npm run stats:recompute` both need that number, and two
 * implementations of it is exactly the disagreement `evaluateBadges`' purity
 * exists to prevent — so it is one function, here, rather than a `.filter()`
 * written twice.
 *
 * Pure, no clock, no database. The instants arrive from
 * `lib/db/queries/{shares,journal}.ts`; this module only counts them.
 *
 * Linear rather than a binary search on purpose. The input is one user's shares
 * or journal lines — tens of rows, not thousands — and it is walked once per
 * card in a backfill that is already documented as "well under a second". A
 * bisect here would be three more lines and one more off-by-one to get wrong.
 */

/**
 * How many of `instants` had already happened at `at`, inclusive.
 *
 * `at` is nullable because the first card a user ever makes has no card before
 * it, and the honest count at "the previous card" is then zero — which is also
 * what makes a user who shared five words *before* their first card earn
 * `five_shares` on that card rather than never.
 */
export function countAtOrBefore(instants: Date[], at: Date | null): number {
  if (at === null) return 0;
  const t = at.getTime();
  let n = 0;
  for (const i of instants) {
    if (i.getTime() <= t) n++;
  }
  return n;
}
