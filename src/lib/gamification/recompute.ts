import "server-only";
import { db } from "@/lib/db";
import { awardBadges, listBadgeAwards, pruneBadges } from "@/lib/db/queries/badges";
import {
  getCardHistory,
  readUserStats,
  upsertUserStats,
  type StatsTx,
} from "@/lib/db/queries/stats";
import { resolveTimezone } from "@/lib/db/queries/cards";
import { profiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { listEntryCreatedAts } from "@/lib/db/queries/journal";
import { listVocabShareCreatedAts } from "@/lib/db/queries/shares";
import { evaluateBadges } from "@/lib/gamification/badges";
import type { RecomputeReport } from "@/lib/gamification/schemas";
import { countAtOrBefore } from "@/lib/gamification/tallies";
import {
  computeStreaks,
  countInWeekEndingAt,
  runLengthEndingAt,
  toDayNumber,
} from "@/lib/gamification/streaks";
import {
  isValidTimeZone,
  localDateNow,
  localHour,
  type LocalDate,
} from "@/lib/time/local-date";

/**
 * Rebuild `user_stats` and replay every badge from `daily_cards` history.
 *
 * It exists because four things are true at once: the card-created hook can fail
 * in isolation, badge rules will be tightened after launch, `current_streak`
 * goes stale by the passage of time, and rows on a hobby project get edited by
 * hand in the Neon console.
 *
 * **Silent by construction.** A backfill produces no toast, marks nothing as
 * new, and never announces "you earned 14 badges while we weren't looking". The
 * user simply finds the shelf correct next time they open /profile.
 *
 * Cost: three years of daily cards is ~1,095 rows and fourteen pure evaluations
 * each. No network, no LLM, well under a second.
 */
export async function recomputeUserGamification(
  userId: string,
  opts: { prune?: boolean; dryRun?: boolean } = {},
): Promise<RecomputeReport> {
  const prune = opts.prune ?? false;
  const dryRun = opts.dryRun ?? false;
  const warnings: string[] = [];

  const [profile] = await db
    .select({ timezone: profiles.timezone, birthday: profiles.birthday })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  const resolved = resolveTimezone(profile ?? null);
  if (!resolved.ok) {
    warnings.push(
      `profile timezone unusable (${resolved.reason}); read as ${resolved.timezone}`,
    );
  }
  const profileTz = resolved.timezone;

  const history = await getCardHistory(userId);
  const before = await readUserStats(userId);
  const after = computeStreaks(
    history.map((h) => h.cardDate),
    localDateNow(profileTz),
  );

  /* --------------------------- Replay the badges --------------------------- */

  // The two counters `five_shares` and `ten_journal_lines` read. Fetched whole
  // and counted per card, so the replay asks "how many existed when this card
  // was made" exactly the way the live hook did.
  //
  // **This is the one place the replay can honestly disagree with what was
  // awarded on the day**, and it is not fixable here: shares and journal lines
  // are hard-deletable, so a user who revokes a share makes the count at every
  // later card smaller than it was. Insert-only recomputes are unaffected — they
  // never remove an award. `--prune` is the path that would act on the
  // difference, which is one more reason it refuses `--all` without `--force`.
  const shareInstants = await listVocabShareCreatedAts(userId);
  const journalInstants = await listEntryCreatedAts(userId);
  let previousShared = 0;
  let previousJournal = 0;

  const seen: number[] = [];
  const expected: { badgeKey: string; awardedForDate: LocalDate }[] = [];

  for (const [i, card] of history.entries()) {
    const dayNum = toDayNumber(card.cardDate);
    seen.push(dayNum);

    const sharedNow = countAtOrBefore(shareInstants, card.createdAt);
    const journalNow = countAtOrBefore(journalInstants, card.createdAt);

    // The zone the card was actually made in, not the user's current one. A
    // user who has since moved must not have `midnight_oil` re-judged under a
    // zone that did not apply at the time.
    const cardTz = isValidTimeZone(card.timezone) ? card.timezone : profileTz;
    if (!isValidTimeZone(card.timezone) && card.timezone !== null) {
      warnings.push(`card ${card.cardDate} has an unusable timezone; read as ${cardTz}`);
    }

    for (const key of evaluateBadges({
      cardDate: card.cardDate,
      localHour: localHour(card.createdAt, cardTz),
      // The chronologically first card, and only that one. History is ordered
      // by `card_date`, so index 0 is it.
      isFirstCardEver: i === 0,
      // `seen` holds the dates up to and including this card. A replay must not
      // see the future, or a backfilled `full_week` would disagree with the
      // award the live hook made on the day.
      runLength: runLengthEndingAt(seen, dayNum),
      // `seen` again, for the same reason and with the same consequence if it
      // were `history`: a replay that could see the rest of the week would award
      // `three_in_a_week` on the week's first card.
      cardsThisLocalWeek: countInWeekEndingAt(seen, dayNum),
      sharedWordsNow: sharedNow,
      sharedWordsAtPreviousCard: previousShared,
      journalLinesNow: journalNow,
      journalLinesAtPreviousCard: previousJournal,
      // The birthday **as it stands now**, not as it stood on the day — the
      // column keeps no history, and inventing one would be the only way to
      // replay it faithfully. Insert-only recomputes are unaffected: a card on
      // the old birthday keeps its award because nothing here removes one. See
      // the prune warning below, which is where this becomes visible.
      birthday: profile?.birthday ?? null,
    })) {
      expected.push({ badgeKey: key, awardedForDate: card.cardDate });
    }

    previousShared = sharedNow;
    previousJournal = journalNow;
  }

  /* ------------------------------ Apply, or not ---------------------------- */

  const existing = await listBadgeAwards(userId);
  const expectedSet = new Set(expected.map(keyOf));
  const stale = prune ? existing.filter((a) => !expectedSet.has(keyOf(a))) : [];

  /**
   * A stale `birthday` row is the one prune candidate that is very likely
   * **correct**, and it is named here rather than left to be discovered.
   *
   * The rule the badge was asked for is that changing a birthday is additive:
   * the count already earned stands, and a card on the new date adds to it. That
   * survives every insert-only recompute by construction. `--prune` is the single
   * path that undoes it, because the replay judges the whole history against the
   * date on the profile *today* and cannot know the row was earned under the old
   * one. The same exposure `five_shares` and `ten_journal_lines` carry — see the
   * note above the two counters — and the same mitigation: this is why `--prune`
   * refuses `--all` without `--force`.
   *
   * A stale row under a key the catalog no longer knows — `christmas` — is a
   * different thing and wants no warning: deleting it is the point.
   */
  const prunedBirthdays = stale.filter((a) => a.badgeKey === "birthday");
  if (prunedBirthdays.length > 0) {
    warnings.push(
      `prune would drop ${prunedBirthdays.length} birthday award(s) (${prunedBirthdays
        .map((a) => a.awardedForDate)
        .join(", ")}) that the birthday on the profile no longer matches; a changed birthday is meant to keep them`,
    );
  }

  if (dryRun) {
    const existingSet = new Set(existing.map(keyOf));
    return {
      userId,
      timezone: profileTz,
      before: before && snapshot(before),
      after,
      badgesInserted: expected
        .filter((a) => !existingSet.has(keyOf(a)))
        .map((a) => ({ key: a.badgeKey, awardedForDate: a.awardedForDate })),
      badgesPruned: stale.map((a) => ({
        key: a.badgeKey,
        awardedForDate: a.awardedForDate,
      })),
      warnings,
      dryRun: true,
    };
  }

  // One transaction per user, so a half-applied recompute is impossible.
  const { inserted, pruned } = await db.transaction(async (tx: StatsTx) => {
    if (history.length > 0) await upsertUserStats(userId, after, tx);
    const insertedRows = await awardBadges(userId, expected, tx);
    const prunedCount = prune ? await pruneBadges(userId, stale, tx) : 0;
    return { inserted: insertedRows, pruned: prunedCount };
  });

  if (prune && pruned !== stale.length) {
    warnings.push(`prune deleted ${pruned} rows but expected ${stale.length}`);
  }

  return {
    userId,
    timezone: profileTz,
    before: before && snapshot(before),
    after,
    badgesInserted: inserted.map((a) => ({
      key: a.badgeKey,
      awardedForDate: a.awardedForDate,
    })),
    badgesPruned: stale.map((a) => ({
      key: a.badgeKey,
      awardedForDate: a.awardedForDate,
    })),
    warnings,
    dryRun: false,
  };
}

const keyOf = (a: { badgeKey: string; awardedForDate: string }) =>
  `${a.badgeKey}@${a.awardedForDate}`;

function snapshot(row: NonNullable<Awaited<ReturnType<typeof readUserStats>>>) {
  return {
    currentStreak: row.currentStreak,
    longestStreak: row.longestStreak,
    totalCards: row.totalCards,
    firstCardOn: row.firstCardOn,
    lastCardOn: row.lastCardOn,
  };
}
