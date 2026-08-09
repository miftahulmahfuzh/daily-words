/**
 * F16's database-shaped guarantees, against a real Postgres.
 *
 * Run with:  npm run share:db
 *            npm run share:db -- --keep      (leaves one row and prints its URL)
 *
 * Five things in this feature can only be wrong in the database, and every one
 * of them is silent when it is:
 *
 *   1. **The anonymous read.** `getShareBySlug` takes no user id. The assertion
 *      that its result carries neither the sharer's identity nor the entity's
 *      uuid is the one thing that makes D7's departure *safe* rather than merely
 *      documented.
 *   2. **Create under concurrency.** Two taps a few milliseconds apart must
 *      produce one row and one slug. Written as a read-then-insert this passes
 *      every offline check and mints two links for one word.
 *   3. **The CHECK constraint.** `entity_type` agreeing with which id column is
 *      set is a claim only Postgres can enforce; `$type<>()` is a compile-time
 *      wish.
 *   4. **The cascade.** F16 D2 departs from `daily_card_items`' RESTRICT on
 *      purpose. RESTRICT would make a shared word permanently undeletable and
 *      500 [R1]'s typo-recovery path, so "delete the word, the delete succeeds,
 *      and the link dies with it" is asserted rather than reasoned about.
 *   5. **Revoke by the wrong user.** The single authenticated authorisation
 *      decision this feature makes.
 *
 * **No LLM calls and no network.** Seeds throwaway users at `@example.invalid`
 * and deletes them in a `finally`; deletion cascades. A crashed run leaves at
 * most two row sets behind, findable by that domain.
 */
import 'dotenv/config'
import { count, eq } from 'drizzle-orm'
import { db } from '../src/lib/db'
import { dailyCardItems, dailyCards, shares, users } from '../src/lib/db/schema'
import {
  createShare,
  deleteShare,
  getShareBySlug,
  getShareForEntity,
  listShares,
} from '../src/lib/db/queries/shares'
import {
  createVocabEntry,
  deleteVocabEntry,
  writeEnrichmentSuccess,
} from '../src/lib/db/queries/vocab'
import { isShareSlug, shareHref } from '../src/lib/share/policy'
import { sharedPayloadSchema } from '../src/lib/share/schemas'
import { toSharedWordPayload } from '../src/lib/share/serialize'
import type { VocabEntry } from '../src/lib/db/types'

const KEEP = process.argv.includes('--keep')

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

/** A `ready` entry whose private columns carry markers the payload must drop. */
async function seedWord(userId: string, term: string): Promise<VocabEntry> {
  const entry = await createVocabEntry(userId, term)
  const ready = await writeEnrichmentSuccess(userId, entry.id, {
    partOfSpeech: 'adjective',
    pronunciation: '/dʒɛnˈtiːl/',
    definition: 'polite in a way that is trying too hard',
    examples: ['His genteel manners fooled nobody.'],
    suggestedCorrection: 'LEAK-correction',
  })
  if (!ready) throw new Error('fixture enrichment failed')
  return ready
}

const share = (userId: string, entry: VocabEntry) =>
  createShare(userId, {
    entityType: 'vocab',
    entityId: entry.id,
    payload: toSharedWordPayload(entry),
  })

async function shareCount(userId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(shares).where(eq(shares.userId, userId))
  return row?.n ?? 0
}

/** Did this statement raise? Constraints are asserted, never described. */
async function rejected(run: () => Promise<unknown>): Promise<boolean> {
  try {
    await run()
    return false
  } catch {
    return true
  }
}

async function main() {
  const ownerEmail = `f16-share-owner-${process.pid}@example.invalid`
  const strangerEmail = `f16-share-stranger-${process.pid}@example.invalid`
  let ownerId: string | null = null
  let strangerId: string | null = null

  try {
    const [owner] = await db
      .insert(users)
      .values({ email: ownerEmail, name: 'LEAK-name' })
      .returning({ id: users.id })
    ownerId = owner.id
    const [stranger] = await db
      .insert(users)
      .values({ email: strangerEmail })
      .returning({ id: users.id })
    strangerId = stranger.id

    /* -------------------------------- Create -------------------------------- */

    section('creating a share')

    const genteel = await seedWord(ownerId, 'genteel')
    const first = await share(ownerId, genteel)

    check('the slug is a slug', isShareSlug(first.slug), true)
    check('entity_type', first.entityType, 'vocab')
    check('the vocab column is set', first.vocabEntryId, genteel.id)
    check('and the other two are null', [first.dailyCardId, first.journalEntryId], [null, null])
    check('payload_version defaults to 1', first.payloadVersion, 1)
    check('one row exists', await shareCount(ownerId), 1)
    check('a second tap returns the same row', (await share(ownerId, genteel)).slug, first.slug)
    check('and mints nothing', await shareCount(ownerId), 1)

    section('create is idempotent under concurrency')

    /**
     * The assertion that catches a read-then-insert implementation. Both calls
     * are issued against a word with **no** share yet and before either
     * resolves, so the loser genuinely takes a 23505 off the partial unique
     * index and re-reads rather than finding a row that was already there.
     */
    const candid = await seedWord(ownerId, 'candid')
    const raced = await Promise.all([share(ownerId, candid), share(ownerId, candid)])
    check('two concurrent calls agree on one slug', new Set(raced.map((r) => r.slug)).size, 1)
    check('and exactly one row was written', await shareCount(ownerId), 2)

    check(
      'getShareForEntity finds it',
      (await getShareForEntity(ownerId, 'vocab', genteel.id))?.slug,
      first.slug,
    )
    check('and it is scoped by user id', await getShareForEntity(strangerId, 'vocab', genteel.id), null)
    check(
      'listShares returns both, newest first',
      (await listShares(ownerId)).map((r) => r.slug),
      [raced[0].slug, first.slug],
    )
    check('and is scoped by user id too', await listShares(strangerId), [])

    /* ----------------------- The anonymous public read ---------------------- */

    section('reading as a stranger — no session, no user id')

    const publicRow = await getShareBySlug(first.slug)
    check('the row resolves', publicRow?.entityType, 'vocab')

    const serialised = JSON.stringify(publicRow)
    /**
     * The single most important assertion in this file. If any of these strings
     * can be found in what an anonymous caller receives, the snapshot has become
     * a join, or the explicit column list has become a `select()`.
     */
    for (const [label, needle] of [
      ["the sharer's email", ownerEmail],
      ["the sharer's name", 'LEAK-name'],
      ["the sharer's user id", ownerId],
      ["the entry's uuid", genteel.id],
      ['the share row id', first.id],
      ['a private column marker', 'LEAK-correction'],
    ] as const) {
      check(`it does not carry ${label}`, serialised.includes(needle), false)
    }

    const parsed = sharedPayloadSchema.safeParse(publicRow?.payload)
    check('the stored payload parses', parsed.success, true)
    check(
      'and its keys are exactly the allowlist',
      parsed.success ? Object.keys(parsed.data).sort() : null,
      ['definition', 'examples', 'kind', 'partOfSpeech', 'pronunciation', 'term'],
    )
    check('the term survived the round trip', parsed.success ? parsed.data.term : null, 'genteel')

    /* --------------------------- The CHECK constraint ---------------------- */

    section('the CHECK constraint — only ever true in the database')

    const [card] = await db
      .insert(dailyCards)
      .values({ userId: ownerId, cardDate: '2026-08-09', timezone: 'Asia/Jakarta' })
      .returning({ id: dailyCards.id })
    await db
      .insert(dailyCardItems)
      .values({ cardId: card.id, vocabEntryId: genteel.id, position: 1 })

    check(
      'two entity ids at once is rejected',
      await rejected(() =>
        db.insert(shares).values({
          slug: 'aaaaaaaaaaaaaaaa',
          userId: ownerId!,
          entityType: 'vocab',
          vocabEntryId: candid.id,
          dailyCardId: card.id,
          payload: {},
        }),
      ),
      true,
    )
    check(
      'an entity_type that disagrees with the column is rejected',
      await rejected(() =>
        db.insert(shares).values({
          slug: 'bbbbbbbbbbbbbbbb',
          userId: ownerId!,
          entityType: 'card',
          vocabEntryId: candid.id,
          payload: {},
        }),
      ),
      true,
    )
    check(
      'and so is a row with no entity at all',
      await rejected(() =>
        db.insert(shares).values({
          slug: 'cccccccccccccccc',
          userId: ownerId!,
          entityType: 'vocab',
          payload: {},
        }),
      ),
      true,
    )

    const truculent = await seedWord(ownerId, 'truculent')
    check(
      'a duplicate slug is rejected by shares_slug_uniq',
      await rejected(() =>
        db.insert(shares).values({
          slug: first.slug,
          userId: ownerId!,
          entityType: 'vocab',
          vocabEntryId: truculent.id,
          payload: {},
        }),
      ),
      true,
    )
    check('none of the four wrote a row', await shareCount(ownerId), 2)

    /* -------------------------------- Revoke -------------------------------- */

    section('revoking')

    check('a stranger cannot revoke it', await deleteShare(strangerId, first.slug), 'not_found')
    check('and the row survives', await shareCount(ownerId), 2)
    check('the owner can', await deleteShare(ownerId, first.slug), 'deleted')
    check('reading a revoked slug is null, not a throw', await getShareBySlug(first.slug), null)
    check(
      'and it says nothing different from a slug that never existed',
      await getShareBySlug('zzzzzzzzzzzzzzzz'),
      null,
    )
    check('revoking twice is not an error', await deleteShare(ownerId, first.slug), 'not_found')

    /* ------------------------- Deleting the entity -------------------------- */

    section('deleting the word revokes the share (D2 — CASCADE, not RESTRICT)')

    const doomed = await share(ownerId, truculent)
    check('the share exists first', (await getShareBySlug(doomed.slug)) !== null, true)
    // RESTRICT here would raise a bare 23503 that no caller catches, and the
    // user's typo-recovery path would 500 because they once tapped Share.
    check(
      'deleting an un-carded word succeeds',
      await deleteVocabEntry(ownerId, truculent.id),
      'deleted',
    )
    check('and the link is gone with it', await getShareBySlug(doomed.slug), null)

    section('a carded word is unaffected — F16 changed nothing about [R1]')

    const carded = await share(ownerId, genteel)
    check(
      'the carded word still refuses deletion',
      await deleteVocabEntry(ownerId, genteel.id),
      'in_use',
    )
    check('and keeps its share', (await getShareBySlug(carded.slug))?.entityType, 'vocab')

    /* --------------------------------- Keep --------------------------------- */

    if (KEEP) {
      section('--keep')
      const appUrl = process.env.APP_URL ?? 'http://localhost:3200'
      console.log(`\n  A live share was left behind for the manual passes:\n`)
      console.log(`      ${appUrl}${shareHref(carded.slug)}\n`)
      console.log(`  curl it with NO cookie jar and expect 200, not 307 -> /signin.`)
      console.log(`  Clean up with:  npm run share:db   (or delete the fixture users)`)
      console.log(`      delete from users where email like 'f16-share-%@example.invalid';\n`)
      ownerId = null
      strangerId = null
      return
    }

    section('deleting the user takes their shares with them')

    const doomedOwner = ownerId
    await db.delete(users).where(eq(users.id, doomedOwner))
    ownerId = null
    const [{ n }] = await db
      .select({ n: count() })
      .from(shares)
      .where(eq(shares.userId, doomedOwner))
    check('no shares remain', n, 0)
  } finally {
    if (ownerId) await db.delete(users).where(eq(users.id, ownerId))
    if (strangerId) await db.delete(users).where(eq(users.id, strangerId))
  }

  console.log()
  if (failures > 0) {
    console.error(`${failures} check(s) failed`)
    process.exit(1)
  }
  console.log('all share database checks passed')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
