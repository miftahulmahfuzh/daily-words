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
import { eq } from 'drizzle-orm'
import { db } from '../src/lib/db'
import { users, journalEntries } from '../src/lib/db/schema'
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
import { cursorFor, encodeCursor } from '../src/lib/journal/cursor'
import { INSIGHT_STALE_MS } from '../src/lib/journal/limits'
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
