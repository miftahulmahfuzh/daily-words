import "server-only";
import { and, cosineDistance, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { journalEntries, journalEntryEmbeddings } from "@/lib/db/schema";

/**
 * Every Drizzle statement F15 issues against `journal_entry_embeddings`.
 *
 * The `lib/db/queries/` convention holds here exactly as elsewhere: `userId` is
 * the first parameter of every function and appears in every WHERE clause. On
 * this table that is not housekeeping — the search returns *another entry's
 * text*, so a missing owner predicate is a privacy incident rather than a bug,
 * and `npm run journal:db` asserts it against a second fixture user with a
 * byte-identical vector.
 *
 * `user_id` is denormalised onto this table for that reason: the filter never
 * has to reach `journal_entries` to know who a vector belongs to.
 */

/**
 * `text_sha` still describes the row's current text.
 *
 * Computed in SQL, which is the whole of [D3]: `sha256()` is built into
 * Postgres (11+; this instance is 18.4), so an edit makes both hashes stale
 * *by arithmetic* and `PATCH /api/journal/[id]` needs no invalidation write at
 * all. Every read below is guarded by it, so a stale row is invisible to both
 * layers until the backfill refreshes it — under-warning, which is the direction
 * [D5] chose.
 *
 * Note it guards **Layer 1 too**, not only the vector. `norm_sha` cannot be
 * recomputed in SQL — normalisation is JavaScript — so this is the only
 * available proof that it still describes what the row says today.
 */
const TEXT_SHA_IS_CURRENT = sql`${journalEntryEmbeddings.textSha} = encode(sha256(${journalEntries.text}::bytea), 'hex')`;

/** What the composer's warning needs: a line, where it came from, and when. */
export type DuplicateMatchRow = {
  id: string;
  text: string;
  sourceNote: string | null;
  createdAt: Date;
};

const MATCH_COLUMNS = {
  id: journalEntries.id,
  text: journalEntries.text,
  sourceNote: journalEntries.sourceNote,
  createdAt: journalEntries.createdAt,
} as const;

/* --------------------------------- Layer 1 -------------------------------- */

/**
 * The free layer: an exact hit on the normalised hash.
 *
 * No status filter, deliberately — a `'failed'` sibling row still carries a
 * usable `norm_sha`, and in Phase A *every* row is `'failed'`. Filtering on
 * `'ready'` here would switch Layer 1 off entirely whenever there is no provider,
 * which is precisely the case it exists to cover.
 *
 * Newest first, so the entry the user is shown is the one they kept most
 * recently and are likeliest to remember.
 */
export async function findByNormSha(
  userId: string,
  normSha: string,
): Promise<DuplicateMatchRow | null> {
  const [row] = await db
    .select(MATCH_COLUMNS)
    .from(journalEntryEmbeddings)
    .innerJoin(journalEntries, eq(journalEntries.id, journalEntryEmbeddings.entryId))
    .where(
      and(
        eq(journalEntryEmbeddings.userId, userId),
        eq(journalEntryEmbeddings.normSha, normSha),
        TEXT_SHA_IS_CURRENT,
      ),
    )
    .orderBy(sql`${journalEntries.createdAt} desc`)
    .limit(1);

  return row ?? null;
}

/* --------------------------------- Layer 2 -------------------------------- */

export type NearestRow = DuplicateMatchRow & { distance: number };

/**
 * The paid layer: the closest lines this user has kept, by cosine distance.
 *
 * **Three rows rather than one**, so the server log can carry the runner-up
 * distance. That log is how the threshold gets re-tuned against a real journal
 * instead of against a twenty-pair corpus, and the second-nearest number is the
 * interesting half of it.
 *
 * `status = 'ready'`, a non-null vector, and `TEXT_SHA_IS_CURRENT` between them
 * are the whole of [D3]: a row that was never embedded, that failed, or that the
 * user edited after it was embedded is simply not here, and the caller reports
 * `unchecked` rather than `unique`. Under-warning, deliberately.
 *
 * **On the plan Postgres will choose.** This is a selective equality filter
 * beside an ANN order-by, which is the classic pgvector foot-gun: under a plain
 * HNSW scan the index yields `ef_search` neighbours *globally* and the other
 * users' rows are discarded afterwards, so a user outside the global top-40 gets
 * zero rows and no error. Correctness here does not depend on the index — at a
 * few hundred vectors per user the planner prefers a filtered sequential scan
 * with exact distances, which is sub-millisecond and has perfect recall, and
 * that is the intended plan today. **When one user passes ~5 000 entries, and
 * only then**, set `SET LOCAL hnsw.iterative_scan = relaxed_order` in this
 * transaction (pgvector 0.8.1 on this instance supports it) and re-verify recall
 * with `npm run journal:db`. Doing it sooner is a slower plan for no gain.
 */
export async function findNearest(
  userId: string,
  vector: number[],
  limit = 3,
): Promise<NearestRow[]> {
  const distance = cosineDistance(journalEntryEmbeddings.embedding, vector);

  return db
    .select({ ...MATCH_COLUMNS, distance: sql<number>`(${distance})::float8` })
    .from(journalEntryEmbeddings)
    .innerJoin(journalEntries, eq(journalEntries.id, journalEntryEmbeddings.entryId))
    .where(
      and(
        eq(journalEntryEmbeddings.userId, userId),
        eq(journalEntryEmbeddings.status, "ready"),
        isNotNull(journalEntryEmbeddings.embedding),
        TEXT_SHA_IS_CURRENT,
      ),
    )
    .orderBy(distance)
    .limit(limit);
}

/* ---------------------------------- Writes -------------------------------- */

/**
 * What is known about one entry's embedding, and the `entryId` is not part of
 * it.
 *
 * Kept separate so the discriminated union survives: `Omit<Facts & {entryId},
 * "entryId">` collapses the two arms into one object with an optional `reason`,
 * and the compiler stops being able to tell a `ready` row from a `failed` one.
 * `upsertEmbedding` takes the id as its own parameter for the same reason.
 */
export type EmbeddingFacts = {
  /** sha256 of the exact text. Both layers' staleness proof. */
  textSha: string;
  /** sha256 of the normalised text. Layer 1's key. */
  normSha: string;
} & (
  | { status: "ready"; model: string; embedding: number[] }
  | { status: "failed"; reason: string }
);

/**
 * One embedding per entry, and re-running is free.
 *
 * `ON CONFLICT (entry_id) DO UPDATE` is what makes the backfill interruptible at
 * any point: every batch is committed before the next starts, and a second run
 * over rows already done writes the same bytes rather than failing.
 *
 * `countAttempt` exists so the backfill can count a *provider* failure without
 * the save path counting itself. A Phase-A row is written `'failed'` on every
 * save — see the route — and that is not an attempt at anything; it is the
 * `norm_sha` being recorded so Layer 1 works with no provider at all.
 */
export async function upsertEmbedding(
  userId: string,
  entryId: string,
  facts: EmbeddingFacts,
  opts: { countAttempt?: boolean } = {},
): Promise<void> {
  const attempts = opts.countAttempt
    ? sql`${journalEntryEmbeddings.attempts} + 1`
    : sql`0`;

  const values = {
    entryId,
    userId,
    status: facts.status,
    textSha: facts.textSha,
    normSha: facts.normSha,
    model: facts.status === "ready" ? facts.model : null,
    embedding: facts.status === "ready" ? facts.embedding : null,
    failedReason: facts.status === "ready" ? null : facts.reason,
    attempts: opts.countAttempt ? 1 : 0,
  };
  const ready = facts.status === "ready";

  await db
    .insert(journalEntryEmbeddings)
    .values(values)
    .onConflictDoUpdate({
      target: journalEntryEmbeddings.entryId,
      set: {
        status: values.status,
        textSha: values.textSha,
        normSha: values.normSha,
        model: values.model,
        embedding: values.embedding,
        failedReason: values.failedReason,
        // A success resets the counter; only a counted failure advances it.
        attempts: ready ? sql`0` : attempts,
        updatedAt: sql`now()`,
      },
    });
}

/* -------------------------------- Backfill -------------------------------- */

export type PendingRow = { id: string; text: string };

/**
 * What the backfill has to do for one user, in the order it should do it.
 *
 * Three cases, and they are [D3]'s three states minus the one that is finished:
 *
 *   - **no sibling row** — never attempted. A pre-F15 entry, or a save while the
 *     provider was down. Highest priority, and the reason `LEFT JOIN` rather
 *     than a join.
 *   - **stale** — `text_sha` no longer matches the text, because the user edited
 *     the line after it was embedded.
 *   - **failed** — only under `retryFailed`, and only below the attempt cap, so
 *     a line the provider refuses forever cannot be retried forever.
 */
export async function selectPendingForBackfill(
  userId: string,
  opts: { limit: number; retryFailed?: boolean; maxAttempts?: number },
): Promise<PendingRow[]> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const retry = opts.retryFailed
    ? sql`or (${journalEntryEmbeddings.status} = 'failed' and ${journalEntryEmbeddings.attempts} < ${maxAttempts})`
    : sql``;

  return db
    .select({ id: journalEntries.id, text: journalEntries.text })
    .from(journalEntries)
    .leftJoin(
      journalEntryEmbeddings,
      eq(journalEntryEmbeddings.entryId, journalEntries.id),
    )
    .where(
      and(
        eq(journalEntries.userId, userId),
        sql`(${journalEntryEmbeddings.entryId} is null
             or (${journalEntryEmbeddings.status} = 'ready' and not ${TEXT_SHA_IS_CURRENT})
             ${retry})`,
      ),
    )
    .orderBy(journalEntries.createdAt)
    .limit(opts.limit);
}

/**
 * How much of one user's journal Layer 2 can actually see.
 *
 * For the scripts and the server log, **never for the UI**. "We only checked
 * 60 % of your journal" is a sentence about the application's internals, on the
 * screen least able to afford one, and the remedy is not the user's — see §5.1.
 */
export async function coverage(
  userId: string,
): Promise<{ total: number; ready: number }> {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      ready: sql<number>`count(*) filter (
        where ${journalEntryEmbeddings.status} = 'ready'
          and ${journalEntryEmbeddings.embedding} is not null
          and ${TEXT_SHA_IS_CURRENT}
      )::int`,
    })
    .from(journalEntries)
    .leftJoin(
      journalEntryEmbeddings,
      eq(journalEntryEmbeddings.entryId, journalEntries.id),
    )
    .where(eq(journalEntries.userId, userId));

  return row ?? { total: 0, ready: 0 };
}

/**
 * Every user with at least one journal entry.
 *
 * **The one function in this file with no `userId` parameter**, and a deliberate,
 * named departure from the convention rather than an oversight. It exists only
 * so `npm run journal:embed -- --all` can loop *per user*, calling the
 * owner-scoped functions above once each — which keeps every statement that
 * touches a vector or a line of text owner-filtered. It returns ids and nothing
 * else, and no route handler imports it.
 */
export async function listUserIdsWithEntries(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: journalEntries.userId })
    .from(journalEntries)
    .where(isNotNull(journalEntries.userId));
  return rows.map((r) => r.userId);
}
