import "server-only";
import { and, asc, count, desc, eq, gte, lt, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { chatSessions, dailyCardItems, vocabEntries } from "@/lib/db/schema";
import type { VocabEntry, VocabSource, VocabStatus } from "@/lib/db/types";
import type { VocabCursor } from "@/lib/vocab/cursor";
import type { EnrichmentErrorCode } from "@/lib/vocab/schemas";

/**
 * Every Drizzle statement F3 and F4 issue. Route handlers and components do not
 * build queries inline — the convention set in `queries/profiles.ts`, and the
 * reason `userId` is the first parameter of every function here and appears in
 * every WHERE clause. There is no ambient current user at this layer.
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

/**
 * F17's claim: the word, the four fields copied off the share snapshot, and
 * `source = 'shared'` — **in one INSERT.**
 *
 * Not an insert-then-update, and that is the whole reason this function exists
 * rather than the claim calling `createVocabEntry` and then
 * `writeEnrichmentSuccess`. Between those two statements the row is `pending`,
 * and `pending` is precisely the state `/vocab/[id]/chat` refuses to render
 * ("Still looking this word up"): the claim redirects there immediately, so a
 * two-statement version would race its own redirect and show a brand-new user a
 * dead end for as long as the second statement took. The row must never be
 * observable in a state the chat page would refuse.
 *
 * `enrichment` is null when the snapshot had no definition to copy. The row then
 * lands `pending` with `enrichment_attempts = 0` — the claimer keeps all three of
 * their own retries — and the claim sends them to the detail page, which owns
 * that state and the retry button.
 *
 * **Can throw `23505`** against `UNIQUE (user_id, lower(term))`, exactly as
 * `createVocabEntry` can. The caller catches it and re-reads, the same shape
 * `POST /api/vocab` uses; F17 does not fork the duplicate logic.
 */
export async function createClaimedVocabEntry(
  userId: string,
  term: string,
  enrichment: {
    partOfSpeech: string | null;
    pronunciation: string | null;
    definition: string;
    examples: string[];
  } | null,
): Promise<VocabEntry> {
  const [row] = await db
    .insert(vocabEntries)
    .values({
      userId,
      term,
      // F17 D7. Never 'manual' — F9's collector level counts manually added
      // words, and a claimed word must not inflate it.
      source: "shared" satisfies VocabSource,
      ...(enrichment
        ? {
            partOfSpeech: enrichment.partOfSpeech,
            pronunciation: enrichment.pronunciation,
            definition: enrichment.definition,
            examples: enrichment.examples,
            enrichmentStatus: "ready" as const,
          }
        : {}),
    })
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

/** The four columns the add path's duplicate layer needs from every row. */
export type DedupRow = {
  id: string;
  term: string;
  status: VocabStatus;
  enrichmentStatus: VocabEntry["enrichmentStatus"];
};

/**
 * Every term the user holds, for F14's add-path duplicate layer — **NO status
 * filter**, and this is the one line in the function that matters.
 *
 * A `where status = 'active'` here would compile, pass every offline check, and
 * then let somebody re-add `studying` a month after they mastered `study`. It is
 * the same mistake `listAllUserTerms` warns about at length, for the same
 * reason: mastered means retired from daily cards, not forgotten. The two
 * functions stay separate because Discovery needs only the strings and this
 * needs the id and the status to draw a notice with a link in it.
 *
 * One indexed read on `user_id`. At the stated scale — hundreds of short
 * strings, low thousands at the outside — this is a scan of a few tens of
 * kilobytes on a page the user opens a handful of times a day. F14 §4 rejects a
 * stored `dedup_key` column: the fold is application logic that `discover:check`
 * keeps tuning, and a stored key turns every future tweak into a backfill that
 * silently disagrees with `dedup.ts` until it runs.
 */
export async function listTermsForDedup(userId: string): Promise<DedupRow[]> {
  return db
    .select({
      id: vocabEntries.id,
      term: vocabEntries.term,
      status: vocabEntries.status,
      enrichmentStatus: vocabEntries.enrichmentStatus,
    })
    .from(vocabEntries)
    .where(eq(vocabEntries.userId, userId))
    .orderBy(desc(vocabEntries.createdAt));
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
  | {
      /**
       * `renamed` / `noop` — `entry` is the row that was posted.
       * `merged` — the typo is gone; `entry` is the spelling that survived.
       * `kept_both` — the typo has been carded, so [R1] forbids deleting it.
       *   Both rows survive and `entry` is still the survivor, never the typo.
       *   Renamed from `in_use` by F14 D2: nothing failed, so it stopped being
       *   an error envelope, and the moment it did it could carry an id.
       */
      outcome: "renamed" | "merged" | "kept_both" | "noop";
      entry: VocabEntry;
      /**
       * A practice transcript went with the merge. F14 D4 — only ever true for
       * `merged`, because that is the only branch that deletes a row.
       */
      practiceLost: boolean;
    }
  | { outcome: "not_found"; entry: null; practiceLost: false };

/**
 * Accept the stored suggestion. The corrected word is never sent by the client,
 * so a stale tab cannot rename an entry to something arbitrary.
 *
 * **Can throw `23505`, and the route must catch it.** The "does the corrected
 * spelling already exist" SELECT below takes no lock on that term — there is no
 * row to lock when the collision is an *insert* — so a concurrent
 * `POST /api/vocab` landing between it and the `UPDATE … SET term` raises a
 * unique violation inside the transaction. F14 D3 answers that with one retry
 * in the route, exactly as `POST /api/vocab` already does: the second run finds
 * the row that raced in and takes the merge branch. One retry, never a loop.
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

    if (!entry) return { outcome: "not_found", entry: null, practiceLost: false };

    const correction = entry.suggestedCorrection;
    // Already accepted, already dismissed, or a double tap.
    if (!correction) return { outcome: "noop", entry, practiceLost: false };

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
        return { outcome: "kept_both", entry: existing, practiceLost: false };
      }

      /**
       * F14 D4. The typo row is reachable for practice — the chat needs only
       * `enrichment_status = 'ready'` and a definition, both of which it has,
       * because the enrichment describes the *corrected* word — so a user can
       * spend eight turns on `genteell` and lose the transcript to this delete.
       *
       * Refusing the merge instead was rejected: it would contradict [R5] and
       * `deleteVocabEntry`'s documented cascade, both locked. The loss is
       * roadmap policy. Being silent about it is not, and one indexed lookup on
       * `chat_sessions_user_entry_uniq` buys the sentence.
       */
      const [practised] = await tx
        .select({ id: chatSessions.id })
        .from(chatSessions)
        .where(eq(chatSessions.vocabEntryId, entry.id))
        .limit(1);

      // Cascades the typo's chat session with it. [R5]: days are permanent,
      // practice is not.
      await tx.delete(vocabEntries).where(eq(vocabEntries.id, entry.id));
      return { outcome: "merged", entry: existing, practiceLost: Boolean(practised) };
    }

    const [renamed] = await tx
      .update(vocabEntries)
      .set({ term: correction, suggestedCorrection: null })
      .where(eq(vocabEntries.id, entry.id))
      .returning();
    return { outcome: "renamed", entry: renamed, practiceLost: false };
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

/* ------------------------------- F4 collection ------------------------------ */

/**
 * The five columns a list row draws, plus the sort key.
 *
 * `sortKey` is `lower(term)` **as Postgres computed it**, carried out so the
 * cursor can be byte-exact. Recomputing it in JS with `toLowerCase()` would
 * agree for ASCII and disagree for the cases that matter (Turkish dotted I,
 * final sigma), and the failure would be an invisible one-row gap in the middle
 * of somebody's collection.
 */
const listColumns = {
  id: vocabEntries.id,
  term: vocabEntries.term,
  definition: vocabEntries.definition,
  status: vocabEntries.status,
  enrichmentStatus: vocabEntries.enrichmentStatus,
  sortKey: sql<string>`lower(${vocabEntries.term})`,
};

export type VocabListRow = {
  id: string;
  term: string;
  definition: string | null;
  status: VocabStatus;
  enrichmentStatus: VocabEntry["enrichmentStatus"];
  sortKey: string;
};

/**
 * Substring search over the user's own rows, in term and definition.
 *
 * `position()` rather than `LIKE '%q%'`: neither is indexable, so they cost the
 * same scan, but `position` has no metacharacters. `LIKE` would need every `%`,
 * `_` and `\` escaped and an `ESCAPE` clause to stop a user searching for
 * "100%" matching their entire collection — a whole class of bug that simply
 * does not exist here.
 *
 * The scan is always bounded by `user_id` first. At the stated scale (hundreds
 * of words, thousands at the outside) this is sub-millisecond, and a trigram
 * index would be an extension plus an index for no measurable gain.
 */
const matchesQuery = (q: string) => sql`(
  position(lower(${q}) in lower(${vocabEntries.term})) > 0
  or position(lower(${q}) in lower(coalesce(${vocabEntries.definition}, ''))) > 0
)`;

/**
 * One page of the collection, ordered `lower(term)` then `id`.
 *
 * Alphabetical and nothing else. The design ([R18]) draws A–Z groups with no
 * sort control, and one order means one cursor shape, one index and no way for
 * a page-2 request to arrive under a different ordering than page 1.
 *
 * `UNIQUE (user_id, lower(term))` is a functional index on exactly this key, so
 * both the ordering and the cursor predicate are an index range scan.
 *
 * Ask for `limit + 1` and discard the extra to learn whether another page
 * exists — a second `count(*)` per scroll would cost more than the row.
 */
export async function listVocabEntries(
  userId: string,
  opts: { q?: string; cursor?: VocabCursor | null; limit: number },
): Promise<VocabListRow[]> {
  const where = [eq(vocabEntries.userId, userId)];
  if (opts.q) where.push(matchesQuery(opts.q));
  if (opts.cursor) {
    where.push(
      sql`(lower(${vocabEntries.term}), ${vocabEntries.id}) > (${opts.cursor.term}::text, ${opts.cursor.id}::uuid)`,
    );
  }

  return db
    .select(listColumns)
    .from(vocabEntries)
    .where(and(...where))
    .orderBy(sql`lower(${vocabEntries.term}) asc`, asc(vocabEntries.id))
    .limit(opts.limit);
}

/** The whole collection's size. Drawn into the search field's placeholder. */
export async function countVocabEntries(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(vocabEntries)
    .where(eq(vocabEntries.userId, userId));
  return row?.n ?? 0;
}

export type VocabEntryDetail = VocabEntry & {
  /** True once the word has appeared on any daily card. [R1] refuses deletion. */
  carded: boolean;
};

/**
 * One entry, with the single fact the detail page cannot derive from it.
 *
 * Two statements rather than a correlated subquery, deliberately. Written as
 * one, Drizzle renders a raw `sql` fragment's column references **unqualified**
 * when it believes a single table is in scope — so
 * `exists (select 1 from daily_card_items where vocab_entry_id = id)` became
 * `daily_card_items.vocab_entry_id = daily_card_items.id`, which is false for
 * every row that has ever existed. It threw nothing, returned a clean `false`,
 * and would have shipped a Delete button on words with history. Both statements
 * below are single-table index lookups on a page the user opens a handful of
 * times a week; the cleverness was not buying anything.
 *
 * `limit(1)` rather than `count(*)`: the page asks whether the word has history,
 * never how much, and the scan stops at the first row of
 * `daily_card_items_vocab_idx`.
 */
export async function getVocabEntryDetail(
  userId: string,
  id: string,
): Promise<VocabEntryDetail | null> {
  const [entry] = await db
    .select()
    .from(vocabEntries)
    .where(and(eq(vocabEntries.id, id), eq(vocabEntries.userId, userId)))
    .limit(1);

  if (!entry) return null;

  const [item] = await db
    .select({ id: dailyCardItems.id })
    .from(dailyCardItems)
    .where(eq(dailyCardItems.vocabEntryId, entry.id))
    .limit(1);

  return { ...entry, carded: Boolean(item) };
}

/**
 * Retire a word from future daily cards, or put it back.
 *
 * `coalesce(mastered_at, now())` is what makes a double tap harmless: the
 * timestamp records the *first* master of a contiguous run, so two devices
 * PATCHing the same target converge instead of racing the clock. Un-mastering
 * clears it, which is what makes a later re-master start a fresh run.
 *
 * `last_shown_on` is deliberately untouched. An un-mastered word rejoins the
 * rotation at its old priority rather than jumping the queue, and F5 owns that
 * column outright.
 *
 * **This never writes `daily_card_items`.** That is the whole of the roadmap's
 * "mastering preserves history" requirement, satisfied by not having the code.
 */
export async function setVocabStatus(
  userId: string,
  id: string,
  status: VocabStatus,
): Promise<VocabEntry | null> {
  const [row] = await db
    .update(vocabEntries)
    .set(
      status === "mastered"
        ? { status, masteredAt: sql`coalesce(${vocabEntries.masteredAt}, now())` }
        : { status: "active", masteredAt: null },
    )
    .where(and(eq(vocabEntries.id, id), eq(vocabEntries.userId, userId)))
    .returning();
  return row ?? null;
}

export type DeleteOutcome = "deleted" | "in_use" | "not_found";

/**
 * Hard delete, or a refusal. There is no soft delete in v0.1.0 — [R1].
 *
 * A word with zero `daily_card_items` rows is the typo-recovery path and is
 * removed outright; its `chat_sessions` row goes with it through the FK's
 * `ON DELETE CASCADE` ([R5]: days are permanent, practice is not). A word that
 * has ever been carded is refused, and the caller offers "mastered" instead.
 *
 * The `FOR UPDATE` is load-bearing. Without it, F5 creating today's card can
 * insert a `daily_card_items` row between the check and the delete: we would
 * observe zero references, delete, and F5's insert would fail against a missing
 * FK target. Holding the entry row makes the two transactions serialise — the
 * card commits first and the delete then refuses, or the delete commits first
 * and F5 re-selects.
 */
export async function deleteVocabEntry(
  userId: string,
  id: string,
): Promise<DeleteOutcome> {
  return db.transaction(async (tx) => {
    const [entry] = await tx
      .select({ id: vocabEntries.id })
      .from(vocabEntries)
      .where(and(eq(vocabEntries.id, id), eq(vocabEntries.userId, userId)))
      .limit(1)
      .for("update");

    if (!entry) return "not_found";

    const [carded] = await tx
      .select({ id: dailyCardItems.id })
      .from(dailyCardItems)
      .where(eq(dailyCardItems.vocabEntryId, id))
      .limit(1);

    if (carded) return "in_use";

    await tx.delete(vocabEntries).where(eq(vocabEntries.id, id));
    return "deleted";
  });
}
