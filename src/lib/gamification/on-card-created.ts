import "server-only";
import { db } from "@/lib/db";
import { awardBadges } from "@/lib/db/queries/badges";
import { listEntryCreatedAts } from "@/lib/db/queries/journal";
import { getBirthday } from "@/lib/db/queries/profiles";
import { listVocabShareCreatedAts } from "@/lib/db/queries/shares";
import { getCardHistory, readUserStats, upsertUserStats } from "@/lib/db/queries/stats";
import { badgeTitle, evaluateBadges, type BadgeKey } from "@/lib/gamification/badges";
import { resolveStreakLevel } from "@/lib/gamification/levels";
import type { AwardedBadge, CardCreatedRewards } from "@/lib/gamification/schemas";
import { countAtOrBefore } from "@/lib/gamification/tallies";
import {
  computeStreaks,
  countInWeekEndingAt,
  runLengthEndingAt,
  toDayNumber,
} from "@/lib/gamification/streaks";
import type { CardCreatedEvent } from "@/lib/cards/hooks";
import { localDateNow } from "@/lib/time/local-date";

/**
 * The body behind F5's `onCardCreated` seam. [R15]: the hook is F5's, and F9
 * fills it in rather than touching card creation.
 *
 * F9's own plan (§9.4) proposed a differently-shaped hook that ran *inside* F5's
 * transaction and took a `tx`. §15.1 said F5 wins if it had already frozen a
 * contract, and it had: `CardCreatedEvent`, delivered **after the commit**. The
 * plan explicitly allows that variant, and it is the better one here — every
 * write below is idempotent, so the worst case of a post-commit failure is a
 * badge the backfill restores, while the worst case of a rollback is a day the
 * user did the ritual and the app forgot.
 *
 * Nothing is re-derived from `created_at`. `cardDate`, `localCreatedAtHour` and
 * `isFirstCardEver` all arrive already resolved, because a card made at 00:05 in
 * Auckland on 1 January was created at 11:05 UTC on 31 December, and a second
 * derivation is a second chance to get that wrong.
 */
export async function applyCardCreated(
  event: CardCreatedEvent,
): Promise<CardCreatedRewards | null> {
  try {
    // Read outside the transaction, and before it. Both are reads of tables this
    // hook does not write, so they need no snapshot of their own; keeping them
    // out here is also what lets `queries/shares.ts` and `queries/journal.ts`
    // stay free of a stats-only transaction type they have no other use for.
    // The birthday joins these two for the same reason: a read of a table this
    // hook does not write, needing no snapshot of its own. It is read here rather
    // than carried on `CardCreatedEvent` so that F5's creation path learns nothing
    // about badges — the hook's contract allows optional new fields, but adding one
    // would mean F5 reading `profiles` to fill it in.
    const [shareInstants, journalInstants, birthday] = await Promise.all([
      listVocabShareCreatedAts(event.userId),
      listEntryCreatedAts(event.userId),
      getBirthday(event.userId),
    ]);

    return await db.transaction(async (tx): Promise<CardCreatedRewards> => {
      const previous = await readUserStats(event.userId, tx);
      const previousLongest = previous?.longestStreak ?? 0;

      // Post-commit, so this includes the card that just landed. `getCardHistory`
      // rather than `getCardDates` because the milestone badges need the instant
      // of the *previous* card, not only its date.
      const history = await getCardHistory(event.userId, tx);
      const dates = history.map((h) => h.cardDate);
      const streaks = computeStreaks(dates, localDateNow(event.timezone));

      await upsertUserStats(event.userId, streaks, tx);

      // The card before this one, by `card_date` — the history is ordered by it,
      // so the last row below this card's date is that card. Its instant is when
      // the share and journal counters were last read, which is what makes
      // `five_shares` and `ten_journal_lines` fire on a crossing rather than on
      // a total. Null on the user's first card ever, and `countAtOrBefore` reads
      // that as zero.
      const previousCardAt =
        history.filter((h) => h.cardDate < event.cardDate).at(-1)?.createdAt ?? null;

      const dayNums = dates.map(toDayNumber);
      const today = toDayNumber(event.cardDate);

      const earned = evaluateBadges({
        cardDate: event.cardDate,
        localHour: event.localCreatedAtHour,
        isFirstCardEver: event.isFirstCardEver,
        runLength: runLengthEndingAt(dayNums, today),
        cardsThisLocalWeek: countInWeekEndingAt(dayNums, today),
        sharedWordsNow: shareInstants.length,
        sharedWordsAtPreviousCard: countAtOrBefore(shareInstants, previousCardAt),
        journalLinesNow: journalInstants.length,
        journalLinesAtPreviousCard: countAtOrBefore(journalInstants, previousCardAt),
        // As it stands right now, which is the only reading available on the live
        // path and is also the one the rule wants: a birthday changed after an
        // award leaves that award alone and starts earning on the new date.
        birthday,
      });

      // Only rows the INSERT genuinely created come back, so a re-delivered
      // event awards nothing and reveals nothing.
      const inserted = await awardBadges(
        event.userId,
        earned.map((key) => ({ badgeKey: key, awardedForDate: event.cardDate })),
        tx,
      );

      const insertedKeys = new Set(inserted.map((row) => row.badgeKey));
      const awardedBadges: AwardedBadge[] = earned
        .filter((key) => insertedKeys.has(key))
        .map((key) => ({
          key,
          title: badgeTitle(key) as string, // key came from the catalog
          awardedForDate: event.cardDate,
        }));

      return {
        currentStreak: streaks.currentStreak,
        longestStreak: streaks.longestStreak,
        totalCards: streaks.totalCards,
        awardedBadges,
        levelUp: resolveLevelUp(previousLongest, streaks.longestStreak),
      };
    });
  } catch (err) {
    // The hook must not throw: F5's call site swallows, and a hook that throws
    // on every card would be silent breakage. A missing badge is recoverable by
    // `npm run stats:recompute`; a missing card is not.
    console.error("[F9] applyCardCreated failed", { cardId: event.cardId, err });
    return null;
  }
}

/**
 * A level-up is a change of *band*, not a change of number. Compared on the
 * longest streak, which is the only input the streak table takes.
 */
function resolveLevelUp(
  previousLongest: number,
  longest: number,
): CardCreatedRewards["levelUp"] {
  const before = resolveStreakLevel(previousLongest);
  const after = resolveStreakLevel(longest);
  if (after.index <= before.index) return null;
  return { kind: "streak", previousTitle: before.title, title: after.title };
}

/** Re-exported so the recompute path and the checks share one badge-key type. */
export type { BadgeKey };
