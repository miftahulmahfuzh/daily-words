import "server-only";
import { and, asc, count, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { dailyCards, userStats, vocabEntries } from "@/lib/db/schema";
import type { UserStats } from "@/lib/db/types";
import type { LocalDate } from "@/lib/time/local-date";

/**
 * F9's reads and its one cache write. As everywhere, `userId` is the first
 * parameter and appears in every WHERE clause.
 *
 * `user_stats` is a **cache** ([R11]) and this file is the only thing that
 * writes it. Nothing here decides anything — the arithmetic is in
 * `lib/gamification/`, so it can be checked without a database.
 */

/** Any Drizzle handle: the pool, or an open transaction. */
export type StatsTx = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

/* ---------------------------------- Reads ----------------------------------- */

/**
 * Every card date the user has, ascending. Served by the existing
 * `UNIQUE (user_id, card_date)` index; no pagination, because the list grows by
 * at most 365 rows a year.
 *
 * These come back as 'YYYY-MM-DD' **strings** — `date` columns are declared
 * `{ mode: 'string' }` in the schema. If they ever arrive as JS `Date`s, every
 * number in this feature silently shifts by a timezone offset, which is why
 * `npm run stats:db` asserts the type against a real row.
 */
export async function getCardDates(
  userId: string,
  tx: StatsTx = db,
): Promise<LocalDate[]> {
  const rows = await tx
    .select({ cardDate: dailyCards.cardDate })
    .from(dailyCards)
    .where(eq(dailyCards.userId, userId))
    .orderBy(asc(dailyCards.cardDate));
  return rows.map((r) => r.cardDate);
}

export type CardHistoryRow = {
  cardDate: LocalDate;
  createdAt: Date;
  /** The zone the card was made in. Null on rows written before F5 recorded it. */
  timezone: string | null;
};

/**
 * The same list plus what a badge replay needs: the instant of creation and the
 * zone it was created in.
 *
 * The zone is read from the row rather than from the profile on purpose. A user
 * who has since moved would otherwise have `midnight_oil` re-judged under a zone
 * that did not apply at the time, and the backfill would disagree with the live
 * award — the exact failure the pure evaluator exists to prevent.
 */
export async function getCardHistory(
  userId: string,
  tx: StatsTx = db,
): Promise<CardHistoryRow[]> {
  return tx
    .select({
      cardDate: dailyCards.cardDate,
      createdAt: dailyCards.createdAt,
      timezone: dailyCards.timezone,
    })
    .from(dailyCards)
    .where(eq(dailyCards.userId, userId))
    .orderBy(asc(dailyCards.cardDate));
}

/**
 * Words the user added themselves. The collector level's only input.
 *
 * **No `status` filter, deliberately.** "Count of manually added words" is a
 * record of what someone collected; mastering a word retires it from daily cards
 * but does not un-collect it. Demoting a collector level for succeeding would be
 * the exact opposite of what this page is for.
 *
 * Counted live rather than cached in `user_stats`. A column there would oblige
 * F3 and F4 to call an F9 write hook on every vocab mutation — a cross-feature
 * coupling F9 neither owns nor can verify — to avoid one indexed count at hobby
 * scale.
 */
export async function countManualWords(
  userId: string,
  tx: StatsTx = db,
): Promise<number> {
  const [row] = await tx
    .select({ n: count() })
    .from(vocabEntries)
    .where(and(eq(vocabEntries.userId, userId), eq(vocabEntries.source, "manual")));
  return row?.n ?? 0;
}

/** Null before the user's first card. Never created for a user with zero cards. */
export async function readUserStats(
  userId: string,
  tx: StatsTx = db,
): Promise<UserStats | null> {
  const [row] = await tx
    .select()
    .from(userStats)
    .where(eq(userStats.userId, userId))
    .limit(1);
  return row ?? null;
}

/* --------------------------------- The write -------------------------------- */

export type UserStatsValues = {
  currentStreak: number;
  longestStreak: number;
  totalCards: number;
  firstCardOn: LocalDate | null;
  lastCardOn: LocalDate | null;
};

/**
 * Write the cache. Every field is overwritten from a full recomputation, never
 * incremented — an increment is a second implementation of the streak rules,
 * and it would be the one nothing checks.
 */
export async function upsertUserStats(
  userId: string,
  values: UserStatsValues,
  tx: StatsTx = db,
): Promise<void> {
  await tx
    .insert(userStats)
    .values({ userId, ...values, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: userStats.userId,
      set: { ...values, updatedAt: new Date() },
    });
}

/** How long ago the cache was written. Guards `POST /api/profile/recompute`. */
export async function userStatsAgeSeconds(userId: string): Promise<number | null> {
  const [row] = await db
    .select({ age: sql<number>`extract(epoch from (now() - ${userStats.updatedAt}))` })
    .from(userStats)
    .where(eq(userStats.userId, userId))
    .limit(1);
  return row ? Number(row.age) : null;
}
