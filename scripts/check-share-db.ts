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
 * F18 added four more, and every one of them is also silent when wrong:
 *
 *   6. **What one slug authorises.** A card share exposes seven URLs and must
 *      expose no eighth — not the sharer's other words, not their other cards.
 *      Asserted by seeding two cards and eight words and trying to reach the
 *      unreachable ones through the slug.
 *   7. **One revocation, seven dead URLs.** The property that makes [S3]'s
 *      "revoking is deleting the row" true for a card.
 *   8. **Revoke-on-edit.** The share is a snapshot; editing the line must kill
 *      the link, and editing only the source note must not.
 *   9. **The card claim.** `w` resolving to a word, and — more importantly —
 *      every way it fails resolving to **zero writes**.
 *
 * **No LLM calls and no network.** Seeds throwaway users at `@example.invalid`
 * and deletes them in a `finally`; deletion cascades. A crashed run leaves at
 * most two row sets behind, findable by that domain.
 */
import 'dotenv/config'
import { count, eq } from 'drizzle-orm'
import { db } from '../src/lib/db'
import {
  dailyCardItems,
  dailyCards,
  journalEntries,
  shares,
  users,
} from '../src/lib/db/schema'
import { getCardForShare } from '../src/lib/db/queries/cards'
import { createEntry, getEntry, updateEntry } from '../src/lib/db/queries/journal'
import {
  createShare,
  deleteShare,
  deleteSharesForEntity,
  getShareBySlug,
  getShareForEntity,
  getShareTargetForClaim,
  listShares,
} from '../src/lib/db/queries/shares'
import {
  createVocabEntry,
  deleteVocabEntry,
  writeEnrichmentSuccess,
} from '../src/lib/db/queries/vocab'
import { resolveClaimWord } from '../src/lib/share/claim'
import {
  isShareSlug,
  parseSharePosition,
  sharedCardWordHref,
  shareHref,
} from '../src/lib/share/policy'
import { sharedPayloadSchema } from '../src/lib/share/schemas'
import {
  toSharedCardPayload,
  toSharedJournalPayload,
  toSharedWordPayload,
} from '../src/lib/share/serialize'
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
    check(
      'the term survived the round trip',
      parsed.success && parsed.data.kind === 'vocab' ? parsed.data.term : null,
      'genteel',
    )

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

    /* --------------------------- F18: the card share ------------------------ */

    section('what one card slug authorises, and what it does not (F18 D1)')

    /**
     * Two cards and eight words. Card 1 is shared; the assertion is that its
     * slug reaches exactly its own six words by position and **nothing else** —
     * not the seventh and eighth words, and not the second card's rows.
     */
    const cardWords: VocabEntry[] = []
    for (const term of ['abate', 'bucolic', 'candour', 'dapple', 'ersatz', 'fulsome']) {
      cardWords.push(await seedWord(ownerId, term))
    }
    const offCard = [await seedWord(ownerId, 'gossamer'), await seedWord(ownerId, 'halcyon')]

    const [cardOne] = await db
      .insert(dailyCards)
      .values({ userId: ownerId, cardDate: '2026-08-10', timezone: 'Asia/Jakarta' })
      .returning({ id: dailyCards.id })
    await db.insert(dailyCardItems).values(
      cardWords.map((w, i) => ({ cardId: cardOne.id, vocabEntryId: w.id, position: i + 1 })),
    )

    const [cardTwo] = await db
      .insert(dailyCards)
      .values({ userId: ownerId, cardDate: '2026-08-11', timezone: 'Asia/Jakarta' })
      .returning({ id: dailyCards.id })
    await db
      .insert(dailyCardItems)
      .values({ cardId: cardTwo.id, vocabEntryId: offCard[0].id, position: 1 })

    const cardForShare = await getCardForShare(ownerId, cardOne.id)
    check('the owner can read their own card', cardForShare?.items.length, 6)
    check(
      'and another user cannot',
      await getCardForShare(strangerId, cardOne.id),
      null,
    )

    const cardShare = await createShare(ownerId, {
      entityType: 'card',
      entityId: cardOne.id,
      payload: toSharedCardPayload(cardForShare!),
    })
    check('entity_type', cardShare.entityType, 'card')
    check('the card column is set', cardShare.dailyCardId, cardOne.id)
    check(
      'and the other two are null',
      [cardShare.vocabEntryId, cardShare.journalEntryId],
      [null, null],
    )
    check(
      'a second tap returns the same row',
      (
        await createShare(ownerId, {
          entityType: 'card',
          entityId: cardOne.id,
          payload: toSharedCardPayload(cardForShare!),
        })
      ).slug,
      cardShare.slug,
    )

    const cardRow = await getShareBySlug(cardShare.slug)
    const cardParsed = sharedPayloadSchema.safeParse(cardRow?.payload)
    check('the snapshot parses', cardParsed.success, true)

    const resolveAt = (raw: string) =>
      resolveClaimWord(
        cardParsed.success ? cardParsed.data : null,
        parseSharePosition(raw),
      )?.term ?? null

    check(
      'the six words resolve in position order',
      ['1', '2', '3', '4', '5', '6'].map(resolveAt),
      ['abate', 'bucolic', 'candour', 'dapple', 'ersatz', 'fulsome'],
    )
    check(
      'and nothing outside 1..6 resolves to anything',
      ['0', '7', '01', '-1', '1.5', ''].map(resolveAt),
      [null, null, null, null, null, null],
    )

    /**
     * The assertion the whole positional design exists for: the sharer's other
     * words are **unreachable through this slug**, and no uuid is on it to point
     * anywhere else with.
     */
    const cardSerialised = JSON.stringify(cardRow)
    for (const [label, needle] of [
      ["the seventh word's uuid", offCard[0].id],
      ["the eighth word's uuid", offCard[1].id],
      ['a carded word\'s uuid', cardWords[0].id],
      ["the card's own uuid", cardOne.id],
      ["the second card's uuid", cardTwo.id],
      ["the sharer's user id", ownerId],
      ["the sharer's email", ownerEmail],
      ['a private column marker', 'LEAK-correction'],
    ] as const) {
      check(`the public read does not carry ${label}`, cardSerialised.includes(needle), false)
    }
    check(
      'the words the slug does not authorise are not in it either',
      ['gossamer', 'halcyon'].filter((t) => cardSerialised.includes(t)),
      [],
    )

    section('one revocation, seven dead URLs')

    check('the owner can revoke', await deleteShare(ownerId, cardShare.slug), 'deleted')
    check('the card page is gone', await getShareBySlug(cardShare.slug), null)
    check('and so is every position', await getShareTargetForClaim(cardShare.slug), null)

    /* -------------------------- F18: the card claim ------------------------- */

    section('the card claim resolves by w, and every failure writes nothing')

    const reShared = await createShare(ownerId, {
      entityType: 'card',
      entityId: cardOne.id,
      payload: toSharedCardPayload(cardForShare!),
    })
    const claimTarget = await getShareTargetForClaim(reShared.slug)
    check('the claim read resolves', claimTarget !== null, true)
    /**
     * **No uuid comes back for a card share**, which is what sends the owner
     * tapping their own row through `already_have` rather than through the owner
     * short-circuit — the same destination, reached without a uuid in a snapshot.
     */
    check('and carries no vocab entry id', claimTarget?.vocabEntryId, null)
    check('the sharer is identified, for the owner comparison only', claimTarget?.userId, ownerId)

    const claimParsed = sharedPayloadSchema.safeParse(claimTarget?.payload)
    const claimAt = (w: number | null) =>
      resolveClaimWord(claimParsed.success ? claimParsed.data : null, w)?.term ?? null

    check('w = 3 names the third word', claimAt(3), 'candour')
    check('w missing on a card share resolves to nothing', claimAt(null), null)
    check('w = 7 likewise', claimAt(7), null)

    // A vocab slug with a w present: harmless, and ignored rather than refused.
    const vocabTarget = await getShareTargetForClaim(raced[0].slug)
    const vocabParsed = sharedPayloadSchema.safeParse(vocabTarget?.payload)
    check(
      'a w on a vocab share is ignored, not refused',
      resolveClaimWord(vocabParsed.success ? vocabParsed.data : null, 2)?.term,
      'candid',
    )

    // A short card: position 6 on a card of one.
    const shortCard = await getCardForShare(ownerId, cardTwo.id)
    const shortShare = await createShare(ownerId, {
      entityType: 'card',
      entityId: cardTwo.id,
      payload: toSharedCardPayload(shortCard!),
    })
    const shortParsed = sharedPayloadSchema.safeParse(
      (await getShareBySlug(shortShare.slug))?.payload,
    )
    check(
      'position 6 on a four-word card resolves to nothing',
      resolveClaimWord(shortParsed.success ? shortParsed.data : null, 6),
      null,
    )
    check(
      "and one card's slug does not resolve another's positions",
      resolveClaimWord(shortParsed.success ? shortParsed.data : null, 1)?.term,
      'gossamer',
    )

    /**
     * **Zero writes in every one of those cases.** F17 §5's ordering guarantees
     * it and a widened resolver is exactly where the guarantee could be lost, so
     * it is counted rather than reasoned about.
     */
    const [{ n: entriesBefore }] = await db
      .select({ n: count() })
      .from(shares)
      .where(eq(shares.userId, ownerId))
    check('resolving wrote nothing', entriesBefore, await shareCount(ownerId))

    /* ------------------------ F18: the journal share ------------------------ */

    section('a journal share carries the line and the insight, and not the note')

    const line = await createEntry(
      ownerId,
      'A house with no rice smells of nothing at all.',
      'LEAK-in-Ibus-kitchen',
    )
    /**
     * The insight is written straight into the column rather than asked for:
     * this file makes no model calls, and what is under test is the snapshot,
     * not the prompt.
     */
    await db
      .update(journalEntries)
      .set({
        insight: {
          meaning:
            'An absence is quieter than a presence, and it is usually only noticed by somebody who once had the thing.',
          whenItApplies: [
            'Moving out of a family home for the first time.',
            'Realising a habit mattered only after it stopped.',
          ],
        },
        insightStatus: 'ready',
      })
      .where(eq(journalEntries.id, line.id))
    const withInsight = await getEntry(ownerId, line.id)

    const journalShare = await createShare(ownerId, {
      entityType: 'journal',
      entityId: line.id,
      payload: toSharedJournalPayload(withInsight!, 'Asia/Jakarta'),
    })
    check('entity_type', journalShare.entityType, 'journal')
    check('the journal column is set', journalShare.journalEntryId, line.id)

    const journalRow = await getShareBySlug(journalShare.slug)
    const journalSerialised = JSON.stringify(journalRow)
    check('the line crosses', journalSerialised.includes('no rice'), true)
    check('the insight crosses', journalSerialised.includes('An absence is quieter'), true)
    check('the source note does not', journalSerialised.includes('LEAK'), false)
    check("and neither does the entry's uuid", journalSerialised.includes(line.id), false)

    section('revoke-on-edit (D12): the snapshot must not outlive the text')

    await updateEntry(ownerId, line.id, { sourceNote: 'a different note' })
    check(
      'editing only the source note revokes nothing',
      (await getShareBySlug(journalShare.slug)) !== null,
      true,
    )
    check(
      'and the insight survives, as F10 already promised',
      (await getEntry(ownerId, line.id))?.insightStatus,
      'ready',
    )

    /**
     * The route performs this comparison and calls `deleteSharesForEntity`; here
     * the two halves are driven directly, because what is being asserted is that
     * the delete reaches the row rather than that the route computes the
     * condition.
     */
    await updateEntry(ownerId, line.id, { text: 'Something else entirely, now.' })
    check(
      'editing the text clears the insight',
      (await getEntry(ownerId, line.id))?.insightStatus,
      'none',
    )
    check(
      'and revoking by entity kills the link',
      await deleteSharesForEntity(ownerId, 'journal', line.id),
      1,
    )
    check('the public URL is gone', await getShareBySlug(journalShare.slug), null)
    check(
      'revoking again is not an error',
      await deleteSharesForEntity(ownerId, 'journal', line.id),
      0,
    )
    check(
      'and it is scoped by user id',
      await deleteSharesForEntity(strangerId, 'card', cardOne.id),
      0,
    )
    check('so the card share is still standing', (await getShareBySlug(reShared.slug)) !== null, true)

    section('deleting the entity revokes its share, for both new kinds')

    const doomedLine = await createEntry(ownerId, 'One more line, briefly.', null)
    const doomedShare = await createShare(ownerId, {
      entityType: 'journal',
      entityId: doomedLine.id,
      payload: toSharedJournalPayload(doomedLine, 'Asia/Jakarta'),
    })
    await db.delete(journalEntries).where(eq(journalEntries.id, doomedLine.id))
    check('the journal cascade fires', await getShareBySlug(doomedShare.slug), null)

    await db.delete(dailyCards).where(eq(dailyCards.id, cardTwo.id))
    check('and so does the card cascade', await getShareBySlug(shortShare.slug), null)

    /* --------------------------------- Keep --------------------------------- */

    if (KEEP) {
      section('--keep')

      /**
       * **Three live shares, one per kind, because F18 tripled the manual pass.**
       *
       * A public route needs two exemptions — a place outside the `(app)` group
       * and a `src/middleware.ts` early return — and F18 added a *fourth* path
       * shape, `/s/<slug>/<1..6>`, which `isPublicSharePath` had to be widened
       * for. Every one of those fails the same invisible way: the author
       * testing it is signed in, so a broken build renders perfectly for them.
       * `curl` with no cookie jar is the only proof, and this is what gives it
       * URLs.
       */
      const keptLine = await createEntry(
        ownerId,
        'A house with no rice smells of nothing at all.',
        'a private note that must not appear on the public page',
      )
      const keptJournalShare = await createShare(ownerId, {
        entityType: 'journal',
        entityId: keptLine.id,
        payload: toSharedJournalPayload(keptLine, 'Asia/Jakarta'),
      })

      const appUrl = process.env.APP_URL ?? 'http://localhost:3200'
      console.log(`\n  Three live shares were left behind for the manual passes.`)
      console.log(`  Every one of these must answer 200 with NO cookie jar, never 307:\n`)
      console.log(`      curl -sI ${appUrl}${shareHref(carded.slug)}`)
      console.log(`      curl -sI ${appUrl}${shareHref(reShared.slug)}`)
      console.log(`      curl -sI ${appUrl}${sharedCardWordHref(reShared.slug, 3)}`)
      console.log(`      curl -sI ${appUrl}${sharedCardWordHref(reShared.slug, 7)}   # expect 404`)
      console.log(`      curl -sI ${appUrl}${shareHref(keptJournalShare.slug)}\n`)
      console.log(`  And the claim's own pair, which F17 documented:\n`)
      console.log(
        `      curl -si "${appUrl}${shareHref(reShared.slug)}/claim?w=3&tz=Europe%2FLondon"`,
      )
      console.log(`      # expect 307 -> /claim, with Set-Cookie: dw_claim\n`)
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
