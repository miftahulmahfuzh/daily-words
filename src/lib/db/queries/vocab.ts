import "server-only";
import { and, count, desc, eq, gte, lt, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { dailyCardItems, vocabEntries } from "@/lib/db/schema";
import type { VocabEntry, VocabSource } from "@/lib/db/types";
import type { EnrichmentErrorCode } from "@/lib/vocab/schemas";

/**
 * Every Drizzle statement F3 issues. Route handlers and components do not build
 * queries inline — the convention set in `queries/profiles.ts`, and the reason
 * `userId` is the first parameter of every function here and appears in every
 * WHERE clause. There is no ambient current user at this layer.
 */

/** Free-tier quota protection. The retry button stops offering itself here. */
export const MAX_ENRICHMENT_ATTEMPTS = 3;

/** Rolling window, not a calendar day: needs no timezone and no profile. */
export const DAILY_ADD_LIMIT = 50;

/**
 * Case-insensitive term match, spelled the same way as the unique index so the
 * planner uses it. `UNIQUE (user_id, lower(term))` is a functional index; an
 * `eq(vocabEntries.term, x)` here would miss `Genteel` and sequentially scan.
 */
const sameTerm = (term: string) => sql`lower(${vocabEntries.term}) = lower(${term})`;

export async function createVocabEntry(
  userId: string,
  term: string,
  source: VocabSource = "manual",
): Promise<VocabEntry> {
  const [row] = await db
    .insert(vocabEntries)
    .values({ userId, term, source })
    .returning();
  return row;
}

export async function findEntryByNormalizedTerm(
  userId: string,
  term: string,
): Promise<VocabEntry | null> {
  const [row] = await db
    .select()
    .from(vocabEntries)
    .where(and(eq(vocabEntries.userId, userId), sameTerm(term)))
    .limit(1);
  return row ?? null;
}

export async function getEntryForUser(
  userId: string,
  id: string,
): Promise<VocabEntry | null> {
  const [row] = await db
    .select()
    .from(vocabEntries)
    .where(and(eq(vocabEntries.userId, userId), eq(vocabEntries.id, id)))
    .limit(1);
  return row ?? null;
}

/** Newest first. Feeds the "Just added" chips on /vocab/new. */
export async function recentEntries(userId: string, limit = 3): Promise<VocabEntry[]> {
  return db
    .select()
    .from(vocabEntries)
    .where(eq(vocabEntries.userId, userId))
    .orderBy(desc(vocabEntries.createdAt))
    .limit(limit);
}

export async function countEntriesCreatedSince(
  userId: string,
  since: Date,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(vocabEntries)
    .where(and(eq(vocabEntries.userId, userId), gte(vocabEntries.createdAt, since)));
  return row?.n ?? 0;
}

/**
 * Take the enrichment slot, atomically.
 *
 * One statement does the ownership check, the "not already ready" check, the
 * attempt cap, and the increment. Split into a SELECT and an UPDATE, a
 * double-tapped retry button reads `attempts = 2` twice and writes 3 twice, and
 * the cap the roadmap asked for silently becomes advisory.
 *
 * Returns null when nothing was claimed — the caller then reads the row to tell
 * "no such entry" from "already ready" from "out of attempts".
 */
export async function claimEnrichment(
  userId: string,
  id: string,
): Promise<VocabEntry | null> {
  const [row] = await db
    .update(vocabEntries)
    .set({ enrichmentAttempts: sql`${vocabEntries.enrichmentAttempts} + 1` })
    .where(
      and(
        eq(vocabEntries.id, id),
        eq(vocabEntries.userId, userId),
        ne(vocabEntries.enrichmentStatus, "ready"),
        lt(vocabEntries.enrichmentAttempts, MAX_ENRICHMENT_ATTEMPTS),
      ),
    )
    .returning();
  return row ?? null;
}

export type EnrichmentFields = {
  partOfSpeech: string;
  pronunciation: string;
  definition: string;
  examples: string[];
  /** Non-null only when the model returned status "corrected". */
  suggestedCorrection: string | null;
};

export async function writeEnrichmentSuccess(
  userId: string,
  id: string,
  fields: EnrichmentFields,
): Promise<VocabEntry | null> {
  const [row] = await db
    .update(vocabEntries)
    .set({ ...fields, enrichmentStatus: "ready", enrichmentError: null })
    .where(and(eq(vocabEntries.id, id), eq(vocabEntries.userId, userId)))
    .returning();
  return row ?? null;
}

/**
 * The word stays. Only the enrichment failed, and F3's whole failure contract is
 * that nothing the user does on /vocab/new can lose what they typed.
 */
export async function writeEnrichmentFailure(
  userId: string,
  id: string,
  code: EnrichmentErrorCode,
): Promise<VocabEntry | null> {
  const [row] = await db
    .update(vocabEntries)
    .set({
      enrichmentStatus: "failed",
      enrichmentError: code,
      // 'not_english' means the model answered and the answer was "no". Anything
      // it half-filled describes nothing, so it is cleared rather than shown.
      partOfSpeech: null,
      pronunciation: null,
      definition: null,
      examples: [],
      suggestedCorrection: null,
    })
    .where(and(eq(vocabEntries.id, id), eq(vocabEntries.userId, userId)))
    .returning();
  return row ?? null;
}

export type CorrectionOutcome =
  | { outcome: "renamed" | "noop"; entry: VocabEntry }
  /** The typo is gone; `entry` is the spelling that survived. */
  | { outcome: "merged"; entry: VocabEntry }
  /** The typo has been carded, so [R1] forbids deleting it. Both survive. */
  | { outcome: "in_use"; entry: VocabEntry }
  | { outcome: "not_found"; entry: null };

/**
 * Accept the stored suggestion. The corrected word is never sent by the client,
 * so a stale tab cannot rename an entry to something arbitrary.
 */
export async function applyCorrection(
  userId: string,
  id: string,
): Promise<CorrectionOutcome> {
  return db.transaction(async (tx) => {
    const [entry] = await tx
      .select()
      .from(vocabEntries)
      .where(and(eq(vocabEntries.id, id), eq(vocabEntries.userId, userId)))
      .limit(1)
      .for("update");

    if (!entry) return { outcome: "not_found", entry: null };

    const correction = entry.suggestedCorrection;
    // Already accepted, already dismissed, or a double tap.
    if (!correction) return { outcome: "noop", entry };

    const [existing] = await tx
      .select()
      .from(vocabEntries)
      .where(
        and(
          eq(vocabEntries.userId, userId),
          sameTerm(correction),
          ne(vocabEntries.id, entry.id),
        ),
      )
      .limit(1);

    if (existing) {
      // The FK on daily_card_items is ON DELETE RESTRICT and that is roadmap
      // policy, not an oversight: a past card is a record of a day that
      // happened. Check before deleting so the user gets a sentence rather
      // than a 500.
      const [carded] = await tx
        .select({ id: dailyCardItems.id })
        .from(dailyCardItems)
        .where(eq(dailyCardItems.vocabEntryId, entry.id))
        .limit(1);

      if (carded) {
        await tx
          .update(vocabEntries)
          .set({ suggestedCorrection: null })
          .where(eq(vocabEntries.id, entry.id));
        return { outcome: "in_use", entry: existing };
      }

      // Cascades the typo's chat session with it. [R5]: days are permanent,
      // practice is not.
      await tx.delete(vocabEntries).where(eq(vocabEntries.id, entry.id));
      return { outcome: "merged", entry: existing };
    }

    const [renamed] = await tx
      .update(vocabEntries)
      .set({ term: correction, suggestedCorrection: null })
      .where(eq(vocabEntries.id, entry.id))
      .returning();
    return { outcome: "renamed", entry: renamed };
  });
}

/**
 * Dismiss the suggestion: the user asserts the spelling they typed was meant.
 *
 * The enrichment fields go with it, because they described the *corrected* word.
 * Leaving "genteel"'s definition attached to an entry the user insists is spelled
 * "genteell" would put a lie on the daily card.
 *
 * A no-op when there was no suggestion. F3 §6.4 reads as though a bare dismiss
 * should still land the entry in `failed`; it must not — that would let a
 * double-tap erase a perfectly good `ready` entry.
 */
export async function clearCorrection(
  userId: string,
  id: string,
): Promise<VocabEntry | null> {
  const entry = await getEntryForUser(userId, id);
  if (!entry) return null;
  if (!entry.suggestedCorrection) return entry;

  const [row] = await db
    .update(vocabEntries)
    .set({
      suggestedCorrection: null,
      partOfSpeech: null,
      pronunciation: null,
      definition: null,
      examples: [],
      enrichmentStatus: "failed",
      enrichmentError: "unverified_spelling" satisfies EnrichmentErrorCode,
    })
    .where(and(eq(vocabEntries.id, id), eq(vocabEntries.userId, userId)))
    .returning();
  return row ?? null;
}
