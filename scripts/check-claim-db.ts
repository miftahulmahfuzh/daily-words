/**
 * F17's database-shaped guarantees, against a real Postgres.
 *
 * Run with:  npm run claim:db
 *
 * Seven things in this feature can only be wrong in the database, and every one
 * of them is silent when it is:
 *
 *   1. **The single INSERT.** The claimed row must never be observable in the
 *      `pending` state, because the claim redirects straight to a chat page that
 *      refuses to render one. An insert-then-update passes every offline check.
 *   2. **The five nulls.** A claim completes onboarding on the claimer's behalf,
 *      and the row it leaves must be byte-identical to a `Skip all` row — all
 *      five answer columns null, a real detected zone, `timezone_source`
 *      unchanged.
 *   3. **The established user.** Claiming must not touch an existing profile.
 *      This is the regression that matters most, and it is invisible until
 *      somebody's answers are gone.
 *   4. **The owner no-op.** Claiming your own link writes nothing at all.
 *   5. **`source = 'shared'`.** Asserted through `countManualWords`, the query
 *      F9's collector level actually calls, rather than by reading the column.
 *   6. **The 23505 path.** Two concurrent claims of one word by one user leave
 *      one row, and both callers get an href pointing at it. This proves the
 *      duplicate branch is *reached*, not merely present.
 *   7. **Zero writes on every failure.** A stranger whose link went stale must
 *      be left un-onboarded, or the honest `/onboarding` fallback on the failure
 *      screen leads somewhere they have already been past.
 *
 * **No LLM calls and no network.** Seeds throwaway users at `@example.invalid`
 * and deletes them in a `finally`; deletion cascades through profiles, vocab
 * entries, shares and sessions. A crashed run leaves at most four row sets
 * behind, findable by that domain.
 */
import 'dotenv/config'
import { count, eq } from 'drizzle-orm'
import { db } from '../src/lib/db'
import { profiles, shares, users, vocabEntries } from '../src/lib/db/schema'
import { createShare, deleteShare, getShareForEntity } from '../src/lib/db/queries/shares'
import {
  completeOnboarding,
  ensureProfile,
  getProfile,
  setTimezone,
} from '../src/lib/db/queries/profiles'
import { countManualWords } from '../src/lib/db/queries/stats'
import {
  createVocabEntry,
  deleteVocabEntry,
  setVocabStatus,
  writeEnrichmentSuccess,
  DAILY_ADD_LIMIT,
} from '../src/lib/db/queries/vocab'
import { completeProfileAnswers } from '../src/lib/profile/normalize'
import { resolveAndClaim } from '../src/lib/share/claim.server'
import { toSharedWordPayload } from '../src/lib/share/serialize'
import type { ClaimIntentFields } from '../src/lib/share/claim'
import type { VocabEntry } from '../src/lib/db/types'

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

const ZONE = 'Europe/London'

/** The intent the cookie would have carried. No cookie, no HTTP, no OAuth. */
const intent = (slug: string, tz: string | null = ZONE): ClaimIntentFields => ({
  slug,
  w: null,
  tz,
})

/** A `ready` entry whose private columns carry markers a claim must not copy. */
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

const shareOf = (userId: string, entry: VocabEntry) =>
  createShare(userId, {
    entityType: 'vocab',
    entityId: entry.id,
    payload: toSharedWordPayload(entry),
  })

async function rowCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(vocabEntries)
    .where(eq(vocabEntries.userId, userId))
  return row?.n ?? 0
}

async function onlyEntry(userId: string): Promise<VocabEntry> {
  const [row] = await db.select().from(vocabEntries).where(eq(vocabEntries.userId, userId))
  return row
}

async function main() {
  const emails = {
    sharer: `f17-claim-sharer-${process.pid}@example.invalid`,
    fresh: `f17-claim-fresh-${process.pid}@example.invalid`,
    established: `f17-claim-established-${process.pid}@example.invalid`,
    spare: `f17-claim-spare-${process.pid}@example.invalid`,
  }
  const ids: Record<keyof typeof emails, string | null> = {
    sharer: null,
    fresh: null,
    established: null,
    spare: null,
  }

  try {
    for (const key of Object.keys(emails) as (keyof typeof emails)[]) {
      const [row] = await db
        .insert(users)
        .values({ email: emails[key], name: 'LEAK-name' })
        .returning({ id: users.id })
      ids[key] = row.id
    }
    const sharer = ids.sharer!
    const fresh = ids.fresh!
    const established = ids.established!
    const spare = ids.spare!

    // The sharer is an ordinary onboarded user with one shared word.
    await completeOnboarding(sharer, completeProfileAnswers({ occupation: 'teacher' }), ZONE)
    const genteel = await seedWord(sharer, 'genteel')
    const share = await shareOf(sharer, genteel)

    // The claimer is what Auth.js leaves behind after a first sign-in: a users
    // row and a profile with `onboarded_at` null. Nothing else.
    await ensureProfile(fresh)

    /* --------------------------- 1. Brand-new claim -------------------------- */

    section('a brand-new claimer, straight off their first Google sign-in')

    const first = await resolveAndClaim(fresh, intent(share.slug))
    check('outcome', first.outcome, 'claim_new')
    check('one row was written', await rowCount(fresh), 1)

    const claimed = await onlyEntry(fresh)
    check('the href points at the row that was just written', first.href, `/vocab/${claimed.id}/chat`)
    check('the term', claimed.term, 'genteel')
    check('the source is shared, never manual', claimed.source, 'shared')
    check(
      'the row is ready on arrival — the chat page would refuse a pending one',
      claimed.enrichmentStatus,
      'ready',
    )
    check(
      'the four enrichment fields are the sharer’s, byte for byte',
      [claimed.partOfSpeech, claimed.pronunciation, claimed.definition, claimed.examples],
      [genteel.partOfSpeech, genteel.pronunciation, genteel.definition, genteel.examples],
    )
    check(
      'and nothing else came with them',
      [
        claimed.suggestedCorrection,
        claimed.enrichmentError,
        claimed.masteredAt,
        claimed.lastShownOn,
      ],
      [null, null, null, null],
    )
    check('the claimer keeps all three of their own retries', claimed.enrichmentAttempts, 0)
    check('the sharer’s practice state did not come with it', claimed.status, 'active')
    check(
      'and a claimed word does not inflate F9’s collector level',
      await countManualWords(fresh),
      0,
    )

    const freshProfile = await getProfile(fresh)
    check('onboarded_at is now set', Boolean(freshProfile?.onboardedAt), true)
    check('with the zone the browser detected', freshProfile?.timezone, ZONE)
    check('recorded as detected, not manual', freshProfile?.timezoneSource, 'detected')
    check(
      'and all five answers are null — the row a Skip all leaves',
      [
        freshProfile?.occupation,
        freshProfile?.interests,
        freshProfile?.currentlyConsuming,
        freshProfile?.englishContexts,
        freshProfile?.chatTone,
      ],
      [null, null, null, null, null],
    )
    check('the sharer’s own collection is untouched', await rowCount(sharer), 1)

    /* ---------------------------- 2. Re-claiming ---------------------------- */

    section('the same person, the same link, a second time')

    const again = await resolveAndClaim(fresh, intent(share.slug))
    check('outcome', again.outcome, 'already_have')
    check('the href is the one from the first claim', again.href, first.href)
    check('and no second row appeared', await rowCount(fresh), 1)
    check(
      'onboarded_at is unchanged to the millisecond — coalesce, proven',
      (await getProfile(fresh))?.onboardedAt?.toISOString(),
      freshProfile?.onboardedAt?.toISOString(),
    )

    section('and again after they have mastered the word')

    await setVocabStatus(fresh, claimed.id, 'mastered')
    const mastered = await resolveAndClaim(fresh, intent(share.slug))
    check('still already_have', mastered.outcome, 'already_have')
    check(
      'and the claim did not resurrect it',
      (await onlyEntry(fresh)).status,
      'mastered',
    )

    /* ------------------------------- 3. The owner ---------------------------- */

    section('the sharer follows their own link')

    const before = await rowCount(sharer)
    const own = await resolveAndClaim(sharer, intent(share.slug))
    check('outcome', own.outcome, 'owner')
    check('it goes to the entry the share points at', own.href, `/vocab/${genteel.id}/chat`)
    check('and writes nothing at all', await rowCount(sharer), before)

    /* --------------------------- 4. Established user ------------------------- */

    section('an established claimer — the regression that matters most')

    const ANSWERS = completeProfileAnswers({
      occupation: 'nurse',
      interests: ['music', 'history'],
      currentlyConsuming: 'a long novel',
      englishContexts: ['work'],
      chatTone: 'blunt',
    })
    await completeOnboarding(established, ANSWERS, 'Asia/Jakarta')
    const profileBefore = await getProfile(established)

    const candid = await seedWord(sharer, 'candid')
    const candidShare = await shareOf(sharer, candid)

    const est = await resolveAndClaim(established, intent(candidShare.slug))
    check('outcome', est.outcome, 'claim_new')
    check('one row', await rowCount(established), 1)

    const estProfile = await getProfile(established)
    check(
      'every answer survived the claim',
      [
        estProfile?.occupation,
        estProfile?.interests,
        estProfile?.currentlyConsuming,
        estProfile?.englishContexts,
        estProfile?.chatTone,
      ],
      [
        profileBefore?.occupation,
        profileBefore?.interests,
        profileBefore?.currentlyConsuming,
        profileBefore?.englishContexts,
        profileBefore?.chatTone,
      ],
    )
    check(
      'and so did their timezone — the cookie’s zone did not overwrite it',
      [estProfile?.timezone, estProfile?.timezoneSource],
      ['Asia/Jakarta', 'detected'],
    )
    check(
      'onboarded_at was not rewritten',
      estProfile?.onboardedAt?.toISOString(),
      profileBefore?.onboardedAt?.toISOString(),
    )

    /**
     * The manual-override guard, end to end. `setTimezone` refuses to let an
     * automatic sync touch a row a human corrected — and `completeOnboarding` is
     * handed the zone `setTimezone` settled on rather than the requested one, so
     * the claim cannot walk around that guard through the back door.
     */
    section('a hand-corrected timezone survives a claim')

    await ensureProfile(spare)
    await setTimezone(spare, 'Asia/Tokyo', true)
    const spareClaim = await resolveAndClaim(spare, intent(share.slug))
    check('the claim still succeeds', spareClaim.outcome, 'claim_new')
    const spareProfile = await getProfile(spare)
    check(
      'and the corrected zone is still there',
      [spareProfile?.timezone, spareProfile?.timezoneSource],
      ['Asia/Tokyo', 'manual'],
    )
    check('onboarded, all the same', Boolean(spareProfile?.onboardedAt), true)

    /* ------------------------------ 5. Failures ------------------------------ */

    section('a share of a word with no definition lands on the detail page')

    const pending = await createVocabEntry(sharer, 'unlooked')
    const pendingShare = await shareOf(sharer, pending)
    const pendingClaim = await resolveAndClaim(established, intent(pendingShare.slug))
    check('outcome', pendingClaim.outcome, 'claim_pending')
    check('and the href does not end in /chat', pendingClaim.href?.endsWith('/chat'), false)
    const [pendingRow] = await db
      .select()
      .from(vocabEntries)
      .where(eq(vocabEntries.term, 'unlooked'))
      .orderBy(vocabEntries.createdAt)
    check('the row exists', Boolean(pendingRow), true)
    check('two rows for the established claimer now', await rowCount(established), 2)

    section('a revoked link, claimed by somebody who has never been onboarded')

    const neverEmail = `f17-claim-never-${process.pid}@example.invalid`
    const [never] = await db
      .insert(users)
      .values({ email: neverEmail })
      .returning({ id: users.id })
    await ensureProfile(never.id)

    const doomed = await seedWord(sharer, 'ephemeral')
    const doomedShare = await shareOf(sharer, doomed)
    check('revoking is deleting the row', await deleteShare(sharer, doomedShare.slug), 'deleted')

    const revoked = await resolveAndClaim(never.id, intent(doomedShare.slug))
    check('outcome', revoked.outcome, 'expired')
    check('nothing was written', await rowCount(never.id), 0)
    check(
      'and they are still un-onboarded, so the fallback screen leads somewhere',
      (await getProfile(never.id))?.onboardedAt,
      null,
    )

    section('deleting the word revokes the share, and the claim says the same thing')

    const doomedWord = await seedWord(sharer, 'transient')
    const wordShare = await shareOf(sharer, doomedWord)
    check('the word deletes', await deleteVocabEntry(sharer, doomedWord.id), 'deleted')
    check(
      'the share went with it — ON DELETE CASCADE, not RESTRICT',
      await getShareForEntity(sharer, 'vocab', doomedWord.id),
      null,
    )
    const goneClaim = await resolveAndClaim(never.id, intent(wordShare.slug))
    check('outcome', goneClaim.outcome, 'expired')
    check('nothing was written', await rowCount(never.id), 0)

    section('no detected zone: the honest five screens, and no onboarding here')

    const zoneless = await resolveAndClaim(never.id, intent(share.slug, null))
    check('outcome', zoneless.outcome, 'no_timezone')
    check('it goes to onboarding', zoneless.href, '/onboarding')
    check('nothing was written', await rowCount(never.id), 0)
    check(
      'and onboarded_at is still null — a guessed zone would date every card wrong',
      (await getProfile(never.id))?.onboardedAt,
      null,
    )

    section('the daily limit applies to a claim too')

    /**
     * `DAILY_ADD_LIMIT` rows inside the rolling window. Seeded through the query
     * layer rather than one INSERT so `created_at` is the database's own `now()`,
     * which is what the counter reads.
     */
    for (let i = 0; i < DAILY_ADD_LIMIT; i++) {
      await createVocabEntry(never.id, `limitword${i}`)
    }
    const atLimit = await resolveAndClaim(never.id, intent(share.slug))
    check('outcome', atLimit.outcome, 'over_limit')
    check('and no row was added', await rowCount(never.id), DAILY_ADD_LIMIT)
    check(
      'the sentence is the one the API already returns',
      `${atLimit.stop?.title}. ${atLimit.stop?.body}`,
      "That's 50 words in a day. Come back tomorrow.",
    )

    /* ----------------------------- 6. Concurrency ---------------------------- */

    section('two claims of one word, at once — the 23505 path, reached')

    const raced = await Promise.all([
      resolveAndClaim(established, intent(share.slug)),
      resolveAndClaim(established, intent(share.slug)),
    ])
    check('neither threw', raced.length, 2)
    check(
      'exactly one row was written for the word',
      (await db
        .select({ n: count() })
        .from(vocabEntries)
        .where(eq(vocabEntries.userId, established)))[0].n,
      3,
    )
    check('both hrefs point at the same row', new Set(raced.map((r) => r.href)).size, 1)
    check(
      'and one of them took the duplicate branch',
      raced.map((r) => r.outcome).filter((o) => o === 'already_have').length,
      1,
    )

    /* ------------------------------- Teardown -------------------------------- */

    await db.delete(users).where(eq(users.id, never.id))

    section('the fixtures cascade cleanly')

    const doomedSharer = sharer
    await db.delete(users).where(eq(users.id, doomedSharer))
    ids.sharer = null
    const [{ n: leftShares }] = await db
      .select({ n: count() })
      .from(shares)
      .where(eq(shares.userId, doomedSharer))
    check('the sharer’s shares are gone', leftShares, 0)
    const [{ n: leftProfiles }] = await db
      .select({ n: count() })
      .from(profiles)
      .where(eq(profiles.userId, doomedSharer))
    check('and their profile', leftProfiles, 0)
    check(
      'while the claimed rows survive — a claim is a copy, not a reference',
      await rowCount(fresh),
      1,
    )
  } finally {
    for (const id of Object.values(ids)) {
      if (id) await db.delete(users).where(eq(users.id, id))
    }
    await db.delete(users).where(eq(users.email, `f17-claim-never-${process.pid}@example.invalid`))
  }

  console.log()
  if (failures > 0) {
    console.error(`${failures} check(s) failed`)
    process.exit(1)
  }
  console.log('all claim database checks passed')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
