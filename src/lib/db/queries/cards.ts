import "server-only";
import { and, asc, count, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { dailyCardItems, dailyCards, profiles, vocabEntries } from "@/lib/db/schema";
import type { EnrichmentStatus, Profile } from "@/lib/db/types";
import { selectCardCandidates, type CardTx } from "@/lib/cards/selection";
import { DEFAULT_TIMEZONE, isValidTimeZone, type LocalDate } from "@/lib/time/local-date";

/**
 * Every Drizzle statement F5 issues. Route handlers and components do not build
 * queries inline — the convention set in `queries/profiles.ts`, and the reason
 * `userId` is the first parameter of every function here and appears in every
 * WHERE clause.
 *
 * F5 writes exactly three things, all in one transaction: a `daily_cards` row,
 * its `daily_card_items`, and `last_shown_on` on the chosen entries. It never
 * touches `user_stats` or `badges_awarded` — those are F9's, reached through
 * `lib/cards/hooks.ts`.
 */

/* -------------------------------- Timezone ---------------------------------- */

export type ResolvedTimezone =
  | { ok: true; timezone: string }
  | { ok: false; timezone: string; reason: "no_profile" | "invalid" };

/**
 * The user's zone, and whether it is trustworthy enough to write with.
 *
 * The fallback is `DEFAULT_TIMEZONE`, not the plan's UTC. F1 already made
 * `profiles.timezone` NOT NULL DEFAULT 'Asia/Jakarta' so `getUserTimezone()` is
 * total, and a display fallback that disagrees with the column default would
 * show two different "todays" for the same user. UTC is the honest neutral
 * choice in the abstract; here it is seven hours wrong for the only user the
 * app has, every night between midnight and 07:00.
 *
 * What matters far more than the fallback is who may use it: **reads may fall
 * back, writes may not.** A card written under a guessed zone is a wrong date in
 * a permanent record and a wrong streak forever after. A page rendered under a
 * guessed zone is a cosmetic error for one session.
 */
export function resolveTimezone(
  profile: Pick<Profile, "timezone"> | null,
): ResolvedTimezone {
  if (!profile) return { ok: false, timezone: DEFAULT_TIMEZONE, reason: "no_profile" };
  if (!isValidTimeZone(profile.timezone)) {
    console.warn("[cards] invalid profile timezone", { timezone: profile.timezone });
    return { ok: false, timezone: DEFAULT_TIMEZONE, reason: "invalid" };
  }
  return { ok: true, timezone: profile.timezone };
}

export type CardContext = {
  timezone: ResolvedTimezone;
  /** Anchors the calendar's `pre_start` boundary. Null when there is no profile. */
  profileCreatedAt: Date | null;
};

/** One profile read, serving both the day boundary and the calendar anchor. */
export async function getCardContext(userId: string): Promise<CardContext> {
  const [row] = await db
    .select({ timezone: profiles.timezone, createdAt: profiles.createdAt })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  return {
    timezone: resolveTimezone(row ?? null),
    profileCreatedAt: row?.createdAt ?? null,
  };
}

/* ---------------------------------- Reads ----------------------------------- */

export type CardItemRow = {
  position: number;
  entryId: string;
  term: string;
  partOfSpeech: string | null;
  definition: string | null;
  enrichmentStatus: EnrichmentStatus;
};

export type CardWithItems = {
  id: string;
  cardDate: LocalDate;
  createdAt: Date;
  items: CardItemRow[];
};

/**
 * A card's words, in position order.
 *
 * Deliberately **not** filtered by the entry's current `status`: card items are
 * a historical snapshot, and a word mastered last week was still on last week's
 * card. Mastering affects future selections only.
 *
 * An inner join, so a dangling `vocab_entry_id` drops its row rather than
 * throwing. The FK makes that impossible; if the impossible happens, a card
 * missing one line beats a 500 on /today.
 */
async function readCardItems(tx: CardTx | typeof db, cardId: string): Promise<CardItemRow[]> {
  return tx
    .select({
      position: dailyCardItems.position,
      entryId: vocabEntries.id,
      term: vocabEntries.term,
      partOfSpeech: vocabEntries.partOfSpeech,
      definition: vocabEntries.definition,
      enrichmentStatus: vocabEntries.enrichmentStatus,
    })
    .from(dailyCardItems)
    .innerJoin(vocabEntries, eq(vocabEntries.id, dailyCardItems.vocabEntryId))
    .where(eq(dailyCardItems.cardId, cardId))
    .orderBy(asc(dailyCardItems.position));
}

async function readCard(
  tx: CardTx | typeof db,
  userId: string,
  cardDate: LocalDate,
): Promise<CardWithItems | null> {
  const [card] = await tx
    .select({
      id: dailyCards.id,
      cardDate: dailyCards.cardDate,
      createdAt: dailyCards.createdAt,
    })
    .from(dailyCards)
    .where(and(eq(dailyCards.userId, userId), eq(dailyCards.cardDate, cardDate)))
    .limit(1);

  if (!card) return null;
  return { ...card, items: await readCardItems(tx, card.id) };
}

/** Today's card, or null. The only read /today needs for the card region. */
export function getCardForDate(
  userId: string,
  cardDate: LocalDate,
): Promise<CardWithItems | null> {
  return readCard(db, userId, cardDate);
}

/** Inclusive on both ends. Feeds the week strip and the month grid. */
export async function getCardDatesBetween(
  userId: string,
  from: LocalDate,
  to: LocalDate,
): Promise<LocalDate[]> {
  const rows = await db
    .select({ cardDate: dailyCards.cardDate })
    .from(dailyCards)
    .where(
      and(
        eq(dailyCards.userId, userId),
        gte(dailyCards.cardDate, from),
        lte(dailyCards.cardDate, to),
      ),
    )
    .orderBy(asc(dailyCards.cardDate));
  return rows.map((r) => r.cardDate);
}

/** Half of the calendar anchor. Uses the (user_id, card_date) unique index. */
export async function getFirstCardDate(userId: string): Promise<LocalDate | null> {
  const [row] = await db
    .select({ cardDate: dailyCards.cardDate })
    .from(dailyCards)
    .where(eq(dailyCards.userId, userId))
    .orderBy(asc(dailyCards.cardDate))
    .limit(1);
  return row?.cardDate ?? null;
}

/**
 * How many words are eligible for a card. Zero means no card can be made.
 *
 * Lives here rather than in `queries/vocab.ts` because the question is about the
 * card, not about the collection: it is what separates "press the button" from
 * "you have nothing to put on it".
 */
export async function countActiveWords(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(vocabEntries)
    .where(and(eq(vocabEntries.userId, userId), eq(vocabEntries.status, "active")));
  return row?.n ?? 0;
}

/** With `countActiveWords`, tells "no words yet" from "every word mastered". */
export async function countWords(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(vocabEntries)
    .where(eq(vocabEntries.userId, userId));
  return row?.n ?? 0;
}

/* --------------------------------- The write -------------------------------- */

export type CreateCardOutcome =
  | { status: "created"; card: CardWithItems; isFirstCardEver: boolean }
  | { status: "existed"; card: CardWithItems }
  | { status: "no_active_words" };

/** Rolls the transaction back rather than writing a card with nothing on it. */
class NoActiveWordsError extends Error {}

/**
 * The nudge, as one transaction. Idempotent per `(user_id, card_date)`.
 *
 *   BEGIN                       -- READ COMMITTED (the default). Do NOT raise it.
 *     INSERT … ON CONFLICT (user_id, card_date) DO NOTHING RETURNING …
 *     no row?  → SELECT the existing card, return created: false
 *     a row?   → select candidates → insert items → bump last_shown_on
 *   COMMIT
 *
 * Two concurrent presses: the second INSERT blocks on the unique index until the
 * first commits, then finds the conflicting row and inserts nothing. Under READ
 * COMMITTED the following SELECT takes a fresh snapshot and sees the committed
 * row, so the loser returns the winner's card. **Under REPEATABLE READ that
 * SELECT would see the older snapshot, find nothing, and the request would
 * fail.** The isolation level is load-bearing.
 *
 * Critically, the losing transaction runs no selection and writes no
 * `last_shown_on`.
 *
 * A card is never created with zero items. A zero-word card would register as a
 * day the ritual happened while teaching nothing, and F9 reads the presence of
 * a `daily_cards` row as proof the user showed up.
 */
export async function createCard(
  userId: string,
  cardDate: LocalDate,
  timezone: string,
): Promise<CreateCardOutcome> {
  try {
    return await db.transaction(async (tx): Promise<CreateCardOutcome> => {
      const [inserted] = await tx
        .insert(dailyCards)
        .values({ userId, cardDate, timezone })
        .onConflictDoNothing({ target: [dailyCards.userId, dailyCards.cardDate] })
        .returning({
          id: dailyCards.id,
          cardDate: dailyCards.cardDate,
          createdAt: dailyCards.createdAt,
        });

      if (!inserted) {
        const card = await readCard(tx, userId, cardDate);
        // Unreachable under READ COMMITTED: the conflict proves a committed row
        // exists, and this SELECT takes a fresh snapshot. Loud rather than a
        // null card, because reaching it means the isolation level changed.
        if (!card) throw new Error("card conflicted but could not be read back");
        return { status: "existed", card };
      }

      const candidates = await selectCardCandidates(tx, userId, cardDate);
      if (candidates.length === 0) throw new NoActiveWordsError();

      await tx.insert(dailyCardItems).values(
        candidates.map((candidate, i) => ({
          cardId: inserted.id,
          vocabEntryId: candidate.id,
          position: i + 1, // 1-based and contiguous, by contract
        })),
      );

      // The single point at which recency is written. Not on render, not on
      // tapping a row, not on a repeat press — `last_shown_on` records what was
      // put on a card, not what was looked at.
      //
      // GREATEST stops a westward timezone move from dragging a word's recency
      // backwards and making it look staler than it is.
      await tx
        .update(vocabEntries)
        .set({
          lastShownOn: sql`GREATEST(COALESCE(${vocabEntries.lastShownOn}, ${cardDate}::date), ${cardDate}::date)`,
        })
        .where(
          and(
            eq(vocabEntries.userId, userId),
            inArray(
              vocabEntries.id,
              candidates.map((c) => c.id),
            ),
          ),
        );

      const [{ n }] = await tx
        .select({ n: count() })
        .from(dailyCards)
        .where(eq(dailyCards.userId, userId));

      return {
        status: "created",
        isFirstCardEver: n === 1,
        card: {
          ...inserted,
          items: candidates.map((candidate, i) => ({
            position: i + 1,
            entryId: candidate.id,
            term: candidate.term,
            partOfSpeech: candidate.partOfSpeech,
            definition: candidate.definition,
            enrichmentStatus: candidate.enrichmentStatus,
          })),
        },
      };
    });
  } catch (err) {
    // The race the route's own count cannot close: every word mastered between
    // the check and the insert. The transaction is already rolled back, so no
    // empty card row survives.
    if (err instanceof NoActiveWordsError) return { status: "no_active_words" };
    throw err;
  }
}
