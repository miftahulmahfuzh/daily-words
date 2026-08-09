import 'server-only'
import { and, asc, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { shares } from '@/lib/db/schema'
import type { Share, ShareEntityType } from '@/lib/db/types'
import { isUniqueViolation } from '@/lib/db/errors'
import { newShareSlug } from '@/lib/share/slug'

/**
 * **This file contains the one function in the application that reads a row
 * without a user id.**
 *
 * Every other file in this directory takes `userId` first and puts it in every
 * WHERE clause, because the user id is the entire authorisation story there —
 * `queries/vocab.ts` says it plainly: "There is no ambient current user at this
 * layer." `getShareBySlug` cannot honour that. Its caller is a stranger with no
 * session and no id.
 *
 * What replaces `userId` as the safety property is the slug: **the slug is the
 * capability.** It is 80 bits of CSPRNG output ([D6]), it exists only because
 * the owner tapped Share ([S3]), and deleting the row revokes it. The read is
 * therefore `WHERE slug = $1` and nothing else — adding a second predicate would
 * not make it safer, it would only hide that the slug is doing all the work.
 *
 * The second half of the safety property is that this function returns a
 * **snapshot column, not a join** ([D3]). It must never reference `users`,
 * `profiles`, `vocab_entries`, `daily_cards`, `journal_entries` or `user_stats`.
 * `npm run share:check` greps this file for those table names; a hit is a bug,
 * not a refactor.
 *
 * Every other function here — `createShare`, `deleteShare`, `getShareForEntity`,
 * `listShares` — keeps `userId` first and in the WHERE clause, because creating
 * and revoking are authenticated acts. The exception is one function wide.
 */

/** Which column a given entity type writes into. The union, made mechanical. */
const ENTITY_COLUMN = {
  vocab: shares.vocabEntryId,
  card: shares.dailyCardId,
  journal: shares.journalEntryId,
} as const satisfies Record<ShareEntityType, unknown>

/**
 * How many fresh slugs to try before giving up.
 *
 * A collision at 80 bits is not a thing that happens; this exists so that if it
 * somehow does, the request fails rather than spins. One retry, never a loop —
 * the same discipline `POST /api/vocab` uses for its duplicate race and the
 * roadmap requires of LLM parses.
 */
const SLUG_ATTEMPTS = 3

export type CreateShareInput = {
  entityType: ShareEntityType
  /** The uuid of the entity being shared. Ownership is the caller's to verify. */
  entityId: string
  /** Built by `lib/share/serialize.ts`. The only thing a stranger ever sees. */
  payload: unknown
}

/**
 * Mint a share, or hand back the one that already exists.
 *
 * **Idempotent per entity, and idempotent under concurrency**, which are two
 * different claims. The first is what makes the Share button safe to double-tap;
 * the second is what makes it correct, and it is why this catches `23505` rather
 * than reading first. A read-then-insert passes every offline check and then
 * mints two slugs for one word the first time two tabs race.
 *
 * A unique violation here can mean one of two things, and they are told apart by
 * looking rather than by parsing a constraint name: if a share for this entity
 * now exists, that is the entity index and the existing row is the answer;
 * otherwise it was the slug index, and a fresh slug is drawn.
 */
export async function createShare(
  userId: string,
  input: CreateShareInput,
): Promise<Share> {
  const columns = {
    vocabEntryId: input.entityType === 'vocab' ? input.entityId : null,
    dailyCardId: input.entityType === 'card' ? input.entityId : null,
    journalEntryId: input.entityType === 'journal' ? input.entityId : null,
  }

  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
    try {
      const [row] = await db
        .insert(shares)
        .values({
          slug: newShareSlug(),
          userId,
          entityType: input.entityType,
          payload: input.payload,
          ...columns,
        })
        .returning()
      return row
    } catch (err) {
      if (!isUniqueViolation(err)) throw err

      const existing = await getShareForEntity(userId, input.entityType, input.entityId)
      if (existing) return existing
      // Not the entity index, so it was `shares_slug_uniq`. Draw again.
    }
  }

  throw new Error('could not mint a unique share slug')
}

/**
 * The public read. **No user id, deliberately — see this file's header.**
 *
 * An explicit column list rather than `select()`: it is not possible for this
 * function to return `user_id` or a column added to `shares` later, which is a
 * stronger guarantee than remembering not to select them.
 */
export async function getShareBySlug(slug: string): Promise<{
  entityType: ShareEntityType
  payload: unknown
  payloadVersion: number
} | null> {
  const [row] = await db
    .select({
      entityType: shares.entityType,
      payload: shares.payload,
      payloadVersion: shares.payloadVersion,
    })
    .from(shares)
    .where(eq(shares.slug, slug))
    .limit(1)
  return row ?? null
}

/**
 * The **second** read here that takes no user id, and the last one that should
 * ever be added. F17's claim needs three facts `getShareBySlug` deliberately does
 * not return, and its caller is the same stranger: someone who has just signed in
 * for the first time and holds nothing but a slug out of a cookie.
 *
 * Read this file's header first. The safety property is identical — the slug is
 * the capability, and it is the whole WHERE clause — with one addition worth
 * stating plainly: **this function reads `user_id`, and that column is used for
 * exactly one thing.** It answers "is the viewer the sharer?", which turns a
 * claim of your own link into a no-op. It is never passed as an insert's
 * `userId`. The share tells us *what* to copy; the session tells us *who* to copy
 * it to; those two facts come from different places and are never allowed to
 * swap. That is the one line in F17 to review.
 *
 * **Still not a join.** F16 D3's snapshot is what makes the claim cheap *and*
 * safe: the four enrichment fields are already on the share row, so a claim
 * copies them without reading the sharer's live entry, and the copy survives the
 * owner deleting their word. F17 §4 planned to join `vocab_entries` here; the
 * snapshot made that unnecessary, and `npm run share:check` greps this file for
 * the names of user-owned tables precisely so it stays that way.
 *
 * `vocabEntryId` is returned for the owner short-circuit's destination, which is
 * the sharer's *own* entry id — a uuid they already have in their own URL bar.
 * It is never rendered to anyone else: nothing that reaches a stranger's screen
 * comes from this function except `payload`.
 */
export async function getShareTargetForClaim(slug: string): Promise<{
  userId: string
  entityType: ShareEntityType
  vocabEntryId: string | null
  payload: unknown
} | null> {
  const [row] = await db
    .select({
      userId: shares.userId,
      entityType: shares.entityType,
      vocabEntryId: shares.vocabEntryId,
      payload: shares.payload,
    })
    .from(shares)
    .where(eq(shares.slug, slug))
    .limit(1)
  return row ?? null
}

/**
 * Does this user already share this entity? One indexed read, issued by
 * `/vocab/[id]` beside `getVocabEntryDetail` so the page can draw the shared
 * state without a round trip.
 */
export async function getShareForEntity(
  userId: string,
  entityType: ShareEntityType,
  entityId: string,
): Promise<Share | null> {
  const [row] = await db
    .select()
    .from(shares)
    .where(and(eq(shares.userId, userId), eq(ENTITY_COLUMN[entityType], entityId)))
    .limit(1)
  return row ?? null
}

export type RevokeOutcome = 'deleted' | 'not_found'

/**
 * Revoking is deleting the row ([S3]). Scoped by `userId`: the single
 * authenticated authorisation decision this feature makes, and the reason
 * `share:db` asserts that a stranger's DELETE leaves the row standing.
 *
 * `not_found` for a slug that never existed *and* for someone else's — a 403
 * would confirm that the slug exists.
 */
export async function deleteShare(userId: string, slug: string): Promise<RevokeOutcome> {
  const rows = await db
    .delete(shares)
    .where(and(eq(shares.userId, userId), eq(shares.slug, slug)))
    .returning({ id: shares.id })
  return rows.length > 0 ? 'deleted' : 'not_found'
}

/**
 * Revoke by entity rather than by slug — **F18's revoke-on-edit** (D12).
 *
 * A share is a *snapshot* of what was shared (F16 D3), so a journal entry whose
 * text is edited leaves a public URL quoting a line the owner has replaced. That
 * is worse than a stale word definition, because the journal is the one entity in
 * the app with a documented rule that editing the text **destroys** the derived
 * text: `updateEntry` nulls the insight in the same statement.
 *
 * So `PATCH /api/journal/[id]` calls this when the text actually changed. The
 * user's own control says the same thing in the other direction — there is no
 * "update the shared copy", because publishing an edit should mint a new link
 * rather than silently rewrite what you already sent somebody.
 *
 * Scoped by `userId` like every other authenticated act here. Returns the number
 * of rows removed so a caller can log or assert it; zero is the ordinary case.
 */
export async function deleteSharesForEntity(
  userId: string,
  entityType: ShareEntityType,
  entityId: string,
): Promise<number> {
  const rows = await db
    .delete(shares)
    .where(and(eq(shares.userId, userId), eq(ENTITY_COLUMN[entityType], entityId)))
    .returning({ id: shares.id })
  return rows.length
}

/**
 * Everything this user is sharing, newest first.
 *
 * Nothing renders it in F16 — D9 declines to add a "things I've shared" screen,
 * because the tab bar is exactly four items and the revoke path lives on the
 * entity where the user's mental model already is. It is written and exercised
 * by `share:db` anyway, so that a later `Shared` block on `/profile` costs a
 * component and not a query. Served by `shares_user_created_idx`.
 */
export async function listShares(userId: string): Promise<Share[]> {
  return db
    .select()
    .from(shares)
    .where(eq(shares.userId, userId))
    .orderBy(desc(shares.createdAt))
}

/**
 * When each of this user's **word** shares was created, oldest first. F9's
 * `five_shares` badge and nothing else.
 *
 * `entity_type = 'vocab'` is the whole point: the badge is for handing somebody
 * a word, and a shared card or a shared journal line is a different act with its
 * own reasons. One column, so the filter cannot drift from the title.
 *
 * **This counts live rows, and a revoked share is a deleted row.** The badge
 * rule reads the count as a crossing and refuses to award when it has gone down
 * (`crossedMultipleOf` in `lib/gamification/badges.ts` documents the whole
 * consequence). It is not a monotonic tally and must not be described as one.
 *
 * Timestamps rather than a `count(*)`, because the caller needs the count as it
 * stood at two different instants — at this card and at the one before it — and
 * a user's shares are tens of rows. Served by `shares_user_created_idx`.
 */
export async function listVocabShareCreatedAts(userId: string): Promise<Date[]> {
  const rows = await db
    .select({ createdAt: shares.createdAt })
    .from(shares)
    .where(and(eq(shares.userId, userId), eq(shares.entityType, 'vocab')))
    .orderBy(asc(shares.createdAt))
  return rows.map((r) => r.createdAt)
}
