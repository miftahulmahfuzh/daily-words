/**
 * F10's database-shaped guarantees, against a real Postgres.
 *
 * Run with:  npm run journal:db
 *
 * Four things in this feature can only be wrong in the database, and every one
 * of them is silent when it is:
 *
 *   1. **The insight claim.** It is a conditional UPDATE taken *before* the
 *      model call, so two taps a few milliseconds apart cannot both spend a
 *      call. Written as a SELECT then an UPDATE this passes every offline check
 *      and doubles the bill.
 *   2. **The stale window.** A `pending` row left by a function that died must
 *      become re-claimable after 120s, or the entry is unretryable forever.
 *   3. **What an edit does to an insight.** Changing the text clears it;
 *      changing only the source note keeps it. The comparison happens in SQL,
 *      in one statement, and getting it backwards either burns a call on a typo
 *      fix or leaves an explanation of a line that is no longer there.
 *   4. **Keyset pagination.** Page two must not repeat or skip a row, including
 *      when rows share a `created_at`.
 *
 * **No LLM calls.** The prompt is exercised by `npm run journal:dry-run`.
 *
 * Seeds two throwaway users and deletes them in a `finally`; deletion cascades.
 * A crashed run leaves at most two row sets behind, findable by
 * `@example.invalid`.
 */
import 'dotenv/config'
import { eq, sql } from 'drizzle-orm'
import { db } from '../src/lib/db'
import { users, journalEntries, journalEntryEmbeddings } from '../src/lib/db/schema'
import {
  claimInsight,
  completeInsight,
  createEntry,
  deleteEntry,
  failInsight,
  getEntry,
  listEntries,
  updateEntry,
} from '../src/lib/db/queries/journal'
import {
  coverage,
  findByNormSha,
  findNearest,
  listUserIdsWithEntries,
  selectPendingForBackfill,
  upsertEmbedding,
} from '../src/lib/db/queries/journal-embeddings'
import { cursorFor, encodeCursor } from '../src/lib/journal/cursor'
import { INSIGHT_STALE_MS } from '../src/lib/journal/limits'
import { EMBEDDING_DIMENSIONS, normShaFor, textShaFor } from '../src/lib/journal/similarity'
import type { Insight } from '../src/lib/journal/schemas'

let failures = 0

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    console.log(`  ok   ${label}`)
  } else {
    failures++
    console.error(`  FAIL ${label}\n         expected ${e}\n         actual   ${a}`)
  }
}

function section(title: string) {
  console.log(`\n${title}`)
}

const INSIGHT: Insight = {
  meaning:
    'Failure teaches. The proverb does not soften the loss; it treats the understanding gained as what the loss bought.',
  whenItApplies: [
    'Reviewing a project that failed and working out what it taught.',
    'Reassuring someone who has just made an expensive mistake.',
  ],
}

const OTHER_INSIGHT: Insight = {
  ...INSIGHT,
  meaning: 'A different explanation entirely, long enough to satisfy the schema minimum.',
}

async function main() {
  const email = `f10-journal-check-${process.pid}@example.invalid`
  const strangerEmail = `f10-journal-stranger-${process.pid}@example.invalid`
  let userId: string | null = null
  let strangerId: string | null = null

  try {
    const [user] = await db.insert(users).values({ email }).returning({ id: users.id })
    userId = user.id
    const [stranger] = await db
      .insert(users)
      .values({ email: strangerEmail })
      .returning({ id: users.id })
    strangerId = stranger.id

    /* ---------------------------- The claim ---------------------------- */

    section('the insight claim is taken before the model call')

    const entry = await createEntry(userId, "a fall in a pit, a gain in one's wit", 'Chinese proverb')
    check('a new entry starts at none', entry.insightStatus, 'none')
    check('and has no requested-at', entry.insightRequestedAt, null)

    // The double tap, in the worst order it can happen in: both requests reach
    // the claim before either reaches the model.
    const [first, second] = await Promise.all([
      claimInsight(userId, entry.id),
      claimInsight(userId, entry.id),
    ])
    const claimed = [first, second].filter(Boolean)
    check('exactly one tap claims the work', claimed.length, 1)
    check('and it carries the text as it stood', claimed[0]?.text, "a fall in a pit, a gain in one's wit")
    check('and the source note', claimed[0]?.sourceNote, 'Chinese proverb')

    const pending = await getEntry(userId, entry.id)
    check('the row is pending', pending?.insightStatus, 'pending')
    check('with a timestamp to recover by', pending?.insightRequestedAt !== null, true)

    // A third tap while the first is still in flight changes nothing.
    check('a later tap inside the window is refused', await claimInsight(userId, entry.id), null)

    section('completion is conditional on the text not having moved')

    check(
      'a stale text does not match',
      await completeInsight(userId, entry.id, 'some other text', INSIGHT),
      null,
    )
    const completed = await completeInsight(
      userId,
      entry.id,
      "a fall in a pit, a gain in one's wit",
      INSIGHT,
    )
    check('the claimed text does', completed?.insightStatus, 'ready')
    check('and the insight is stored as jsonb, not a string', completed?.insight, INSIGHT)

    check('a ready row cannot be re-claimed', await claimInsight(userId, entry.id), null)
    check(
      'and a second completion cannot overwrite it',
      await completeInsight(userId, entry.id, "a fall in a pit, a gain in one's wit", OTHER_INSIGHT),
      null,
    )
    const stillFirst = await getEntry(userId, entry.id)
    check('so the first insight survives', stillFirst?.insight, INSIGHT)

    /* ------------------------- Editing an insight ------------------------ */

    section('an edit to the source note keeps the insight')

    const noteEdited = await updateEntry(userId, entry.id, { sourceNote: 'Chinese proverb, heard in a film' })
    check('the note changed', noteEdited?.sourceNote, 'Chinese proverb, heard in a film')
    check('the status did not', noteEdited?.insightStatus, 'ready')
    check('nor the insight', noteEdited?.insight, INSIGHT)
    check('and updated_at moved', (noteEdited?.updatedAt.getTime() ?? 0) > entry.createdAt.getTime(), true)

    section('an edit to the text clears it')

    const same = await updateEntry(userId, entry.id, { text: "a fall in a pit, a gain in one's wit" })
    check('an identical text is not a change', same?.insightStatus, 'ready')
    check('so the insight stays', same?.insight, INSIGHT)

    const textEdited = await updateEntry(userId, entry.id, { text: 'a fall in a pit, a gain in wit' })
    check('a real change resets the status', textEdited?.insightStatus, 'none')
    check('and drops the insight', textEdited?.insight, null)
    check('and the recovery timestamp with it', textEdited?.insightRequestedAt, null)

    /* --------------------------- The stale window ------------------------ */

    section('a pending row killed mid-flight becomes re-claimable')

    const stuck = await createEntry(userId, 'Nothing to be done.', null)
    await claimInsight(userId, stuck.id)
    check('inside the window it is held', await claimInsight(userId, stuck.id), null)

    // Backdate the claim rather than sleeping two minutes.
    await db
      .update(journalEntries)
      .set({ insightRequestedAt: new Date(Date.now() - INSIGHT_STALE_MS - 1000) })
      .where(eq(journalEntries.id, stuck.id))
    const reclaimed = await claimInsight(userId, stuck.id)
    check('past it the next tap re-claims', reclaimed?.text, 'Nothing to be done.')

    section('a failure leaves the line untouched')

    const failed = await failInsight(userId, stuck.id, 'Nothing to be done.')
    check('status is failed', failed?.insightStatus, 'failed')
    check('the text is byte-identical', failed?.text, 'Nothing to be done.')
    check('the source note too', failed?.sourceNote, null)
    check('and nothing was written to insight', failed?.insight, null)
    // 'failed' is claimable — that is what the Try again button relies on.
    check('a failed row can be retried', (await claimInsight(userId, stuck.id))?.text, 'Nothing to be done.')

    /* ------------------------------ Ownership ---------------------------- */

    section('ownership is in every WHERE clause')

    check('a stranger cannot read the row', await getEntry(strangerId, entry.id), null)
    check('nor claim its insight', await claimInsight(strangerId, entry.id), null)
    check('nor edit it', await updateEntry(strangerId, entry.id, { text: 'mine now' }), null)
    check('nor delete it', await deleteEntry(strangerId, entry.id), false)
    const untouched = await getEntry(userId, entry.id)
    check('and the row is exactly as it was', untouched?.text, 'a fall in a pit, a gain in wit')

    /* ----------------------------- Pagination ---------------------------- */

    section('keyset pagination')

    const pageUserEmail = `f10-journal-pages-${process.pid}@example.invalid`
    const [pageUser] = await db
      .insert(users)
      .values({ email: pageUserEmail })
      .returning({ id: users.id })

    try {
      // Written with one timestamp on purpose: `created_at` alone is not a total
      // order, and the `id` tiebreaker in the cursor is what stops page two
      // repeating or skipping the row on the boundary.
      const stamp = new Date('2026-08-08T04:12:03.221Z')
      await db.insert(journalEntries).values(
        Array.from({ length: 5 }, (_, i) => ({
          userId: pageUser.id,
          text: `line ${i}`,
          createdAt: stamp,
          updatedAt: stamp,
        })),
      )

      const pageOne = await listEntries(pageUser.id, { limit: 2 })
      check('page one is two rows', pageOne.length, 2)

      const cursor = cursorFor(pageOne[1])
      const pageTwo = await listEntries(pageUser.id, { cursor, limit: 2 })
      const pageThree = await listEntries(pageUser.id, {
        cursor: cursorFor(pageTwo[1]),
        limit: 2,
      })

      const seen = [...pageOne, ...pageTwo, ...pageThree].map((r) => r.id)
      check('five rows across three pages', seen.length, 5)
      check('with no row on two pages', new Set(seen).size, 5)
      check('and the last page is short', pageThree.length, 1)
      // The cursor the route hands the client is opaque and round-trips through
      // the same predicate the query uses.
      check('the encoded cursor is url-safe', /^[A-Za-z0-9_-]+$/.test(encodeCursor(cursor)), true)

      const all = await listEntries(pageUser.id, { limit: 50 })
      check('one page of everything agrees on the order', all.map((r) => r.id), seen)
    } finally {
      await db.delete(users).where(eq(users.id, pageUser.id))
    }

    /* ------------------------------- Delete ------------------------------ */

    section('delete')

    check('deletes once', await deleteEntry(userId, entry.id), true)
    check('and reports nothing the second time', await deleteEntry(userId, entry.id), false)
    check('the row is gone', await getEntry(userId, entry.id), null)

    /* ------------------------- F15: the sibling table ------------------------ */

    section('the vector extension is really installed')

    // A migration that silently did not run is a real failure mode, and every
    // assertion below would fail confusingly without this one to name it.
    const [ext] = await db.execute(
      sql`select extversion from pg_extension where extname = 'vector'`,
    )
    check('pg_extension has vector', typeof ext?.extversion, 'string')

    section('layer 1 works with no vector at all — the Phase-A path')

    // Both rows are written exactly as `POST /api/journal` writes them when no
    // provider is configured: status 'failed', no embedding, a real norm_sha.
    // **This must pass with EMBEDDING_API_KEY unset**, and it does, because
    // nothing here needs one.
    const kept = await createEntry(userId, 'Nothing to be done.', 'Waiting for Godot')
    await upsertEmbedding(userId, kept.id, {
      status: 'failed',
      textSha: textShaFor(kept.text),
      normSha: normShaFor(kept.text),
      reason: 'not embedded',
    })

    const repasted = '  “Nothing   to be\ndone.” '
    const hit = await findByNormSha(userId, normShaFor(repasted))
    check('a re-paste with different whitespace and quotes finds it', hit?.id, kept.id)
    check('and carries the text the warning needs', hit?.text, 'Nothing to be done.')
    check('and its source note', hit?.sourceNote, 'Waiting for Godot')
    check(
      'a genuinely different line does not',
      await findByNormSha(userId, normShaFor('Nothing to be gained.')),
      null,
    )

    section('an edit makes the sibling stale, with no invalidation write anywhere')

    // [D3]: `text_sha = encode(sha256(j.text::bytea),'hex')` is evaluated inside
    // the query, so this is the whole reason PATCH needed no change.
    await updateEntry(userId, kept.id, { text: 'Nothing to be done, still.' })
    check(
      'the stale row is invisible to layer 1',
      await findByNormSha(userId, normShaFor('Nothing to be done.')),
      null,
    )
    check(
      'and so is its new text, which was never hashed',
      await findByNormSha(userId, normShaFor('Nothing to be done, still.')),
      null,
    )

    section('ownership is in every WHERE clause here too')

    // The one bug in this feature that would be a privacy incident: the search
    // returns another entry's text.
    const strangerKept = await createEntry(strangerId, 'A stranger kept this.', null)
    await upsertEmbedding(strangerId, strangerKept.id, {
      status: 'failed',
      textSha: textShaFor(strangerKept.text),
      normSha: normShaFor(strangerKept.text),
      reason: 'not embedded',
    })
    check(
      'a byte-identical hash belonging to somebody else is never returned',
      await findByNormSha(userId, normShaFor('A stranger kept this.')),
      null,
    )
    check(
      'while its owner still finds it',
      (await findByNormSha(strangerId, normShaFor('A stranger kept this.')))?.id,
      strangerKept.id,
    )

    section('the vector column round-trips, and the cascades hold')

    const unit = (i: number) => {
      const v = new Array(EMBEDDING_DIMENSIONS).fill(0)
      v[i] = 1
      return v
    }

    const embedded = await createEntry(userId, 'Carpe diem.', null)
    await upsertEmbedding(userId, embedded.id, {
      status: 'ready',
      textSha: textShaFor(embedded.text),
      normSha: normShaFor(embedded.text),
      model: 'fixture',
      embedding: unit(0),
    })
    const [stored] = await db
      .select({ embedding: journalEntryEmbeddings.embedding })
      .from(journalEntryEmbeddings)
      .where(eq(journalEntryEmbeddings.entryId, embedded.id))
    // The postgres.js ↔ drizzle mapToDriverValue path, worth one assertion.
    check('1536 numbers came back', stored?.embedding?.length, EMBEDDING_DIMENSIONS)
    check('and the first one is 1', stored?.embedding?.[0], 1)

    const siblingCount = async (entryId: string) =>
      (
        await db
          .select({ entryId: journalEntryEmbeddings.entryId })
          .from(journalEntryEmbeddings)
          .where(eq(journalEntryEmbeddings.entryId, entryId))
      ).length

    check('the sibling row exists', await siblingCount(embedded.id), 1)
    await deleteEntry(userId, embedded.id)
    // Counted rather than assumed: a missing onDelete is invisible until the FK
    // blocks a delete in production.
    check('deleting the entry cascades to it', await siblingCount(embedded.id), 0)

    section('findNearest orders by distance, and the numbers are exact')

    /**
     * Vectors are **constructed by hand, never fetched**.
     *
     * A 1536-wide array of zeros with a 1 at index 0 is a unit vector; one with
     * a 1 at index 1 is orthogonal to it; `[0.6, 0.8, 0, …]` sits at a known
     * angle. The cosine distances are therefore exact constants, and every
     * assertion below is about *the query* rather than about a model. No network
     * call is made by this script.
     */
    const nearEmail = `f15-nearest-${process.pid}@example.invalid`
    const [nearUser] = await db.insert(users).values({ email: nearEmail }).returning({ id: users.id })
    const otherEmail = `f15-nearest-other-${process.pid}@example.invalid`
    const [otherUser] = await db.insert(users).values({ email: otherEmail }).returning({ id: users.id })

    try {
      const seed = async (owner: string, text: string, embedding: number[]) => {
        const row = await createEntry(owner, text, null)
        await upsertEmbedding(owner, row.id, {
          status: 'ready',
          textSha: textShaFor(text),
          normSha: normShaFor(text),
          model: 'fixture',
          embedding,
        })
        return row
      }

      const query = unit(0)
      const sameDir = await seed(nearUser.id, 'identical direction', unit(0))
      const angled = await seed(nearUser.id, 'known angle', [0.6, 0.8, ...new Array(EMBEDDING_DIMENSIONS - 2).fill(0)])
      const orthogonal = await seed(nearUser.id, 'orthogonal', unit(1))

      const near = await findNearest(nearUser.id, query)
      check('three rows, nearest first', near.map((r) => r.id), [sameDir.id, angled.id, orthogonal.id])
      const close = (a: number, b: number) => Math.abs(a - b) < 1e-6
      check('an identical vector is at distance 0', close(near[0].distance, 0), true)
      check('cos⁻¹(0.6) lands at 0.4', close(near[1].distance, 0.4), true)
      check('and an orthogonal one at 1', close(near[2].distance, 1), true)
      check('the row carries the text the warning needs', near[0].text, 'identical direction')

      // The one bug in this feature that would be a privacy incident.
      await seed(otherUser.id, 'somebody else’s line', unit(0))
      const mine = await findNearest(nearUser.id, query)
      check('a byte-identical vector owned by somebody else is never returned', mine.length, 3)
      check('and none of the rows belong to them', mine.some((r) => r.text.includes('somebody else')), false)

      section('what findNearest refuses to look at')

      // [D3]: stale, failed and never-attempted rows are all invisible, and the
      // caller reports `unchecked` rather than `unique`.
      await updateEntry(nearUser.id, sameDir.id, { text: 'identical direction, edited' })
      const afterEdit = await findNearest(nearUser.id, query)
      check('an edited row drops out with no invalidation write', afterEdit.map((r) => r.id), [angled.id, orthogonal.id])

      await upsertEmbedding(nearUser.id, angled.id, {
        status: 'failed',
        textSha: textShaFor('known angle'),
        normSha: normShaFor('known angle'),
        reason: 'provider refused',
      })
      const afterFail = await findNearest(nearUser.id, query)
      check('a failed row drops out too', afterFail.map((r) => r.id), [orthogonal.id])
      check('and does not suppress the ready row beside it', afterFail[0]?.text, 'orthogonal')

      await createEntry(nearUser.id, 'never embedded at all', null)
      check('an entry with no sibling row is simply not there', (await findNearest(nearUser.id, query)).length, 1)

      const emptyEmail = `f15-empty-${process.pid}@example.invalid`
      const [emptyUser] = await db.insert(users).values({ email: emptyEmail }).returning({ id: users.id })
      try {
        await createEntry(emptyUser.id, 'a line nobody embedded', null)
        // Zero rows and no error. This is the `unchecked` case, and the reason
        // it is not `unique`: nothing was compared.
        check('a journal with no vectors returns nothing and raises nothing', await findNearest(emptyUser.id, query), [])
      } finally {
        await db.delete(users).where(eq(users.id, emptyUser.id))
      }
    } finally {
      await db.delete(users).where(eq(users.id, nearUser.id))
      await db.delete(users).where(eq(users.id, otherUser.id))
    }

    section('backfill selection and idempotence, with no network call')

    const backfillEmail = `f15-backfill-${process.pid}@example.invalid`
    const [backfillUser] = await db
      .insert(users)
      .values({ email: backfillEmail })
      .returning({ id: users.id })

    try {
      const a = await createEntry(backfillUser.id, 'Little by little.', null)
      const b = await createEntry(backfillUser.id, 'A hill is built of grains.', null)

      const pending = await selectPendingForBackfill(backfillUser.id, { limit: 50 })
      check('both un-embedded rows are selected', pending.map((r) => r.id).sort(), [a.id, b.id].sort())
      check('coverage of an unembedded journal is zero', await coverage(backfillUser.id), {
        total: 2,
        ready: 0,
      })

      // A stub embedder: a local function returning a fixed vector. The script
      // makes no network call, so this asserts the *selection and the writes*
      // rather than a model.
      for (const row of pending) {
        await upsertEmbedding(backfillUser.id, row.id, {
          status: 'ready',
          textSha: textShaFor(row.text),
          normSha: normShaFor(row.text),
          model: 'fixture',
          embedding: unit(1),
        })
      }

      check('a second run selects nothing', await selectPendingForBackfill(backfillUser.id, { limit: 50 }), [])
      check('and coverage is complete', await coverage(backfillUser.id), { total: 2, ready: 2 })

      await updateEntry(backfillUser.id, b.id, { text: 'A hill is built of single grains.' })
      const afterEdit = await selectPendingForBackfill(backfillUser.id, { limit: 50 })
      check('an edited row comes back, and only it', afterEdit.map((r) => r.id), [b.id])
      check('and it carries the NEW text to embed', afterEdit[0]?.text, 'A hill is built of single grains.')
      check('coverage drops to match', await coverage(backfillUser.id), { total: 2, ready: 1 })

      // A 'failed' row is not retried unless asked, and then only below the cap.
      await upsertEmbedding(
        backfillUser.id,
        b.id,
        { status: 'failed', textSha: textShaFor('A hill is built of single grains.'), normSha: normShaFor('A hill is built of single grains.'), reason: 'provider refused' },
        { countAttempt: true },
      )
      check('a failed row is skipped by default', await selectPendingForBackfill(backfillUser.id, { limit: 50 }), [])
      check(
        'and returned under --retry-failed',
        (await selectPendingForBackfill(backfillUser.id, { limit: 50, retryFailed: true })).map((r) => r.id),
        [b.id],
      )
      check(
        'until the attempt cap is reached',
        await selectPendingForBackfill(backfillUser.id, { limit: 50, retryFailed: true, maxAttempts: 1 }),
        [],
      )

      check('the user is listed as having entries', (await listUserIdsWithEntries()).includes(backfillUser.id), true)
    } finally {
      await db.delete(users).where(eq(users.id, backfillUser.id))
    }

    section('deleting the user takes the vectors with them')

    const cascadeEmail = `f15-cascade-${process.pid}@example.invalid`
    const [cascadeUser] = await db
      .insert(users)
      .values({ email: cascadeEmail })
      .returning({ id: users.id })
    const doomed = await createEntry(cascadeUser.id, 'Gone tomorrow.', null)
    await upsertEmbedding(cascadeUser.id, doomed.id, {
      status: 'ready',
      textSha: textShaFor(doomed.text),
      normSha: normShaFor(doomed.text),
      model: 'fixture',
      embedding: unit(2),
    })
    check('the sibling exists first', await siblingCount(doomed.id), 1)
    await db.delete(users).where(eq(users.id, cascadeUser.id))
    check('and both rows go with the user', await siblingCount(doomed.id), 0)
  } finally {
    if (userId) await db.delete(users).where(eq(users.id, userId))
    if (strangerId) await db.delete(users).where(eq(users.id, strangerId))
  }

  console.log()
  if (failures > 0) {
    console.error(`${failures} check(s) failed`)
    process.exit(1)
  }
  console.log('all journal database checks passed')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
