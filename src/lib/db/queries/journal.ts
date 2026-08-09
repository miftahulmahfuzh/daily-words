import "server-only";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
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
  opts: { cursor?: JournalCursor | null; limit: number },
): Promise<JournalEntry[]> {
  const where = [eq(journalEntries.userId, userId)];
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
 * Hard delete. Nothing references a journal entry, so there is nothing to refuse
 * — this is not [R1]'s vocab situation, where a word can be part of a day that
 * happened.
 */
export async function deleteEntry(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(journalEntries)
    .where(and(eq(journalEntries.id, id), eq(journalEntries.userId, userId)))
    .returning({ id: journalEntries.id });
  return rows.length > 0;
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
 */
export async function completeInsight(
  userId: string,
  id: string,
  textAtRequest: string,
  insight: Insight,
): Promise<JournalEntry | null> {
  const [row] = await db
    .update(journalEntries)
    .set({ insight, insightStatus: "ready", updatedAt: NOW })
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

/** The same guard, for the failure path. `insight` is left exactly as it was. */
export async function failInsight(
  userId: string,
  id: string,
  textAtRequest: string,
): Promise<JournalEntry | null> {
  const [row] = await db
    .update(journalEntries)
    .set({ insightStatus: "failed", updatedAt: NOW })
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
