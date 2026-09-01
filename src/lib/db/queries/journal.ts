import "server-only";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { journalEntries } from "@/lib/db/schema";
import type { JournalEntry } from "@/lib/db/types";
import type { JournalCursor } from "@/lib/journal/cursor";
import { INSIGHT_STALE_MS } from "@/lib/journal/limits";
import type { Insight } from "@/lib/journal/schemas";

/**
 * Every Drizzle statement F10 issues.
 *
 * The `lib/db/queries/` convention, stated in `queries/profiles.ts`: `userId` is
 * the first parameter of every function and appears in every WHERE clause, and
 * route handlers build no queries of their own. There is no ambient current user
 * at this layer, so an ownership check cannot be forgotten in one place and
 * remembered in another.
 */

/**
 * Every timestamp this file writes comes from the **database** clock, never from
 * `new Date()`.
 *
 * `edited` on the entry page is `updated_at > created_at`, and `created_at` is
 * written by the column default — so a JS timestamp puts the two on different
 * clocks and any skew between the app server and Neon decides whether an edit
 * shows. Measured: a local run against a Neon instance a few hundred
 * milliseconds ahead reported a real edit as unedited. Same reasoning for the
 * insight's stale window, which is compared against `now()` in SQL below.
 *
 * A SQL function inside a `sql` template is safe; a JS `Date` inside one is not
 * — postgres.js takes it as an unmapped parameter and the query dies at bind
 * time. `queries/profiles.ts` documents the same edge.
 */
const NOW = sql`now()`;

/**
 * The search predicate: case-insensitive substring over the two fields the user
 * wrote. `lib/journal/search.ts` is the prose record of the rule and why the
 * insight is not among them.
 *
 * `position(... in ...)` rather than `ILIKE`, matching `matchesQuery` in
 * `queries/vocab.ts` — it has no metacharacters, so a search for `100%` is a
 * search for `100%` and there is no escape rule for a caller to forget.
 *
 * Deliberately **not** an index. The scan is bounded by `user_id` first and by
 * `journal_entries_user_created_idx`'s range when a cursor is present; at the
 * stated scale a trigram index would be an extension plus an index for no
 * measurable gain, which is the same call `queries/vocab.ts` records.
 *
 * The filter is an extra WHERE and touches neither the ordering nor the cursor
 * predicate, so page 2 of a filtered list is the same index range scan as page 2
 * of an unfiltered one — provided the caller passes the same `q` to both. It is
 * the caller that can get that wrong, and silently: the rows would arrive in the
 * right order and simply not belong.
 */
const matchesEntryQuery = (q: string) => sql`(
  position(lower(${q}) in lower(${journalEntries.text})) > 0
  or position(lower(${q}) in lower(coalesce(${journalEntries.sourceNote}, ''))) > 0
)`;

/**
 * One page, newest first.
 *
 * `(created_at, id) DESC` is exactly `journal_entries_user_created_idx`, so both
 * the ordering and the cursor predicate are an index range scan and page 400
 * costs what page 1 costs.
 *
 * The caller asks for `limit + 1` and discards the extra row to learn whether a
 * further page exists — cheaper than a second `count(*)` on every scroll.
 */
export async function listEntries(
  userId: string,
  opts: { cursor?: JournalCursor | null; limit: number; q?: string },
): Promise<JournalEntry[]> {
  const where = [eq(journalEntries.userId, userId)];
  if (opts.q) where.push(matchesEntryQuery(opts.q));
  if (opts.cursor) {
    where.push(
      // The cursor's `createdAt` is an ISO **string**, not a Date. A Date
      // inside a raw `sql` template reaches postgres.js as an unmapped
      // parameter and the query dies at bind time — see `lib/journal/cursor.ts`.
      sql`(${journalEntries.createdAt}, ${journalEntries.id}) < (${opts.cursor.createdAt}::timestamptz, ${opts.cursor.id}::uuid)`,
    );
  }

  return db
    .select()
    .from(journalEntries)
    .where(and(...where))
    .orderBy(desc(journalEntries.createdAt), desc(journalEntries.id))
    .limit(opts.limit);
}

export async function getEntry(userId: string, id: string): Promise<JournalEntry | null> {
  const [row] = await db
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.id, id), eq(journalEntries.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function createEntry(
  userId: string,
  text: string,
  sourceNote: string | null,
): Promise<JournalEntry> {
  const [row] = await db
    .insert(journalEntries)
    .values({ userId, text, sourceNote })
    .returning();
  return row;
}

export type EntryPatch = {
  text?: string;
  sourceNote?: string | null;
};

/**
 * Edit an entry, clearing the insight if and only if the text actually changed.
 *
 * A stored insight describes stored text. Change the text and the insight is a
 * statement about a line that is no longer there, so it goes — along with
 * `insight_requested_at`, which also neutralises a call that is still in flight
 * (the completion write matches on the old text and will find nothing).
 *
 * Changing only the source note **preserves** the insight: the note is not part
 * of what was explained, and burning a model call over a typo in "where I found
 * it" would be the wrong trade on a free tier.
 *
 * One statement, and the comparison is done in SQL rather than in a read-then-
 * write, so two devices editing at once cannot both decide the text was
 * unchanged and leave a stale insight behind.
 */
export async function updateEntry(
  userId: string,
  id: string,
  patch: EntryPatch,
): Promise<JournalEntry | null> {
  const textChanged =
    patch.text === undefined
      ? sql`false`
      : sql`${journalEntries.text} is distinct from ${patch.text}`;

  const [row] = await db
    .update(journalEntries)
    .set({
      ...(patch.text === undefined ? {} : { text: patch.text }),
      ...(patch.sourceNote === undefined ? {} : { sourceNote: patch.sourceNote }),
      insight: sql`case when ${textChanged} then null else ${journalEntries.insight} end`,
      insightStatus: sql`case when ${textChanged} then 'none' else ${journalEntries.insightStatus} end`,
      insightRequestedAt: sql`case when ${textChanged} then null else ${journalEntries.insightRequestedAt} end`,
      updatedAt: NOW,
    })
    .where(and(eq(journalEntries.id, id), eq(journalEntries.userId, userId)))
    .returning();
  return row ?? null;
}

/**
 * Hard delete.
 *
 * The only thing that references a journal entry is `shares.journal_entry_id`,
 * added by F16 and `ON DELETE CASCADE` — so deleting the entry revokes its share
 * rather than refusing. That is not [R1]'s vocab situation, where a word can be
 * part of a day that happened and RESTRICT protects the record; a share is a link
 * the user chose to hand out, and taking the line down should take the link down
 * with it.
 */
export async function deleteEntry(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(journalEntries)
    .where(and(eq(journalEntries.id, id), eq(journalEntries.userId, userId)))
    .returning({ id: journalEntries.id });
  return rows.length > 0;
}

/**
 * When each of this user's entries was written, oldest first. F9's
 * `ten_journal_lines` badge and nothing else.
 *
 * **`created_at`, deliberately not `updated_at`.** A line counts from when it
 * was written; editing it later is not a new line, and reading `updated_at`
 * here would let a single edit reorder a user's whole history and move an award
 * that has already been made.
 *
 * Live rows only, and `deleteEntry` above is a hard delete — so this count can
 * fall. `crossedMultipleOf` in `lib/gamification/badges.ts` owns that
 * consequence and refuses to award on a count that has gone down. Served by
 * `journal_entries_user_created_idx`.
 */
export async function listEntryCreatedAts(userId: string): Promise<Date[]> {
  const rows = await db
    .select({ createdAt: journalEntries.createdAt })
    .from(journalEntries)
    .where(eq(journalEntries.userId, userId))
    .orderBy(asc(journalEntries.createdAt));
  return rows.map((r) => r.createdAt);
}

/* --------------------------------- Insight --------------------------------- */

export type InsightClaim = {
  text: string;
  sourceNote: string | null;
};

/**
 * Take the insight slot, atomically.
 *
 * One statement does the ownership check, the "not already ready" check, the
 * "not already running" check and the transition to `pending`. Split into a
 * SELECT and an UPDATE, two taps a few milliseconds apart both read `none` and
 * both call the model — and the roadmap's one-call-per-entry rule becomes
 * advisory. Zero rows back means somebody else holds the claim.
 *
 * A `pending` row older than `INSIGHT_STALE_MS` is re-claimable: the previous
 * attempt died with its function and nothing else will ever finish it.
 *
 * The returned `text` is the text **as it was when the work was claimed**. Every
 * later write in this route matches on it, which is what stops an insight
 * describing a line the user has since edited.
 */
export async function claimInsight(userId: string, id: string): Promise<InsightClaim | null> {
  const stale = sql`${journalEntries.insightRequestedAt} < now() - make_interval(secs => ${
    INSIGHT_STALE_MS / 1000
  })`;

  const [row] = await db
    .update(journalEntries)
    .set({ insightStatus: "pending", insightRequestedAt: NOW })
    .where(
      and(
        eq(journalEntries.id, id),
        eq(journalEntries.userId, userId),
        or(
          inArray(journalEntries.insightStatus, ["none", "failed"]),
          and(eq(journalEntries.insightStatus, "pending"), stale),
        ),
      ),
    )
    .returning({
      text: journalEntries.text,
      sourceNote: journalEntries.sourceNote,
    });

  return row ?? null;
}

/**
 * Write the result, but only onto the row the work was claimed against.
 *
 * `text = $textAtRequest` is the guard: if the user edited the line while the
 * model was thinking, this matches nothing and the insight is discarded rather
 * than attached to a sentence it does not describe. `insight_status = 'pending'`
 * is the second half of it, so a re-claim after a stale window cannot overwrite
 * an insight the original attempt eventually delivered.
 *
 * `text` and `source_note` are never written here. This route may only ever move
 * insight state.
 *
 * **And `updated_at` is not written here either — F27.** That column answers
 * "when did the *user* last change this", and it is what `edited` is derived
 * from. Stamping it on a completion made every explained entry report itself as
 * edited, on a line nobody had touched: `edited` came to mean "something
 * happened to this row" rather than "a human changed this", which is the whole
 * of the flag's purpose. Nothing else reads the column for freshness — the list
 * orders and pages on `created_at` — so leaving it alone costs nothing and buys
 * back the flag. `claimInsight` above never wrote it, which is why a `pending`
 * row was already honest and only the two terminal writes were not.
 */
export async function completeInsight(
  userId: string,
  id: string,
  textAtRequest: string,
  insight: Insight,
): Promise<JournalEntry | null> {
  const [row] = await db
    .update(journalEntries)
    .set({ insight, insightStatus: "ready" })
    .where(
      and(
        eq(journalEntries.id, id),
        eq(journalEntries.userId, userId),
        eq(journalEntries.text, textAtRequest),
        eq(journalEntries.insightStatus, "pending"),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * The same guard, for the failure path. `insight` is left exactly as it was, and
 * so is `updated_at` — see `completeInsight`. This is the write that made the
 * gate in `toJournalEntryDto` insufficient on its own: a `failed` row is not
 * `ready`, so a bumped clock here would have reported a never-edited entry as
 * edited with nothing to clear it.
 */
export async function failInsight(
  userId: string,
  id: string,
  textAtRequest: string,
): Promise<JournalEntry | null> {
  const [row] = await db
    .update(journalEntries)
    .set({ insightStatus: "failed" })
    .where(
      and(
        eq(journalEntries.id, id),
        eq(journalEntries.userId, userId),
        eq(journalEntries.text, textAtRequest),
        eq(journalEntries.insightStatus, "pending"),
      ),
    )
    .returning();
  return row ?? null;
}
