import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { badgesAwarded } from "@/lib/db/schema";
import type { StatsTx } from "@/lib/db/queries/stats";
import type { LocalDate } from "@/lib/time/local-date";

/**
 * `badges_awarded` is insert-only in normal operation. The single destructive
 * path is `pruneBadges`, reachable only from `scripts/recompute-stats.ts --prune`.
 */

export type BadgeAwardKey = { badgeKey: string; awardedForDate: LocalDate };

/**
 * Insert awards, ignoring the ones already there, and return **only what was
 * genuinely new**.
 *
 * `ON CONFLICT DO NOTHING` against `UNIQUE (user_id, badge_key, awarded_for_date)`
 * is what makes every path in this feature idempotent — the live hook, a retried
 * request and a tenth run of the backfill all converge on the same rows. The
 * returned set is also exactly what deserves a toast: a duplicate award is
 * silent because it produces no row, not because anything checks for it.
 */
export async function awardBadges(
  userId: string,
  awards: BadgeAwardKey[],
  tx: StatsTx = db,
): Promise<BadgeAwardKey[]> {
  if (awards.length === 0) return [];

  const inserted = await tx
    .insert(badgesAwarded)
    .values(awards.map((a) => ({ userId, ...a })))
    .onConflictDoNothing({
      target: [
        badgesAwarded.userId,
        badgesAwarded.badgeKey,
        badgesAwarded.awardedForDate,
      ],
    })
    .returning({
      badgeKey: badgesAwarded.badgeKey,
      awardedForDate: badgesAwarded.awardedForDate,
    });

  return inserted;
}

export type BadgeCount = {
  badgeKey: string;
  count: number;
  firstAwardedOn: LocalDate;
  lastAwardedOn: LocalDate;
};

/** The shelf. One row per key, however many times it has been earned. */
export async function getBadgeCounts(
  userId: string,
  tx: StatsTx = db,
): Promise<BadgeCount[]> {
  return tx
    .select({
      badgeKey: badgesAwarded.badgeKey,
      count: sql<number>`count(*)::int`,
      firstAwardedOn: sql<LocalDate>`min(${badgesAwarded.awardedForDate})::text`,
      lastAwardedOn: sql<LocalDate>`max(${badgesAwarded.awardedForDate})::text`,
    })
    .from(badgesAwarded)
    .where(eq(badgesAwarded.userId, userId))
    .groupBy(badgesAwarded.badgeKey);
}

/** Every award as a `(key, date)` pair. What `--prune` diffs against. */
export async function listBadgeAwards(
  userId: string,
  tx: StatsTx = db,
): Promise<BadgeAwardKey[]> {
  return tx
    .select({
      badgeKey: badgesAwarded.badgeKey,
      awardedForDate: badgesAwarded.awardedForDate,
    })
    .from(badgesAwarded)
    .where(eq(badgesAwarded.userId, userId));
}

/**
 * The only delete in F9. For the case where a badge rule is corrected after
 * launch and old awards no longer qualify — never part of a normal recompute,
 * and gated behind an explicit flag plus a dry run.
 */
export async function pruneBadges(
  userId: string,
  stale: BadgeAwardKey[],
  tx: StatsTx = db,
): Promise<number> {
  if (stale.length === 0) return 0;

  const deleted = await tx
    .delete(badgesAwarded)
    .where(
      and(
        eq(badgesAwarded.userId, userId),
        // A tuple IN list rather than a per-row DELETE: the pairs are the unit
        // of identity here, and matching on `badge_key` alone would take every
        // year's award of a repeating badge with it.
        inArray(
          sql`(${badgesAwarded.badgeKey}, ${badgesAwarded.awardedForDate})`,
          stale.map((s) => sql`(${s.badgeKey}, ${s.awardedForDate}::date)`),
        ),
      ),
    )
    .returning({ id: badgesAwarded.id });

  return deleted.length;
}
