/**
 * F8's two database-shaped guarantees, against a real Postgres.
 *
 * Run with:  npm run discover:db
 *
 * Two things in this feature can only be wrong in the database, and both are
 * silent when they are:
 *
 *   1. `listAllUserTerms` must return **mastered** rows. A `where status =
 *      'active'` would compile, pass every offline check, and then propose
 *      `genteel` to somebody who told the app last month they had mastered it.
 *   2. The accept path must write `source = 'suggested'` and must resolve the
 *      unique constraint rather than surfacing a 23505. F9 counts *manually*
 *      added words for the collector level, so the wrong value there inflates a
 *      level the user did not earn.
 *
 * F8 §14 writes both as `curl` against a signed-in browser session, which
 * cannot be automated here — but the HTTP is not the interesting half. The
 * functions the routes call are driven directly below.
 *
 * **No LLM calls.** The prompt is exercised by `npm run discover:dry-run`.
 *
 * Seeds a throwaway user and deletes it in a `finally`; deletion cascades. A
 * crashed run leaves at most one row set behind, findable by `@example.invalid`.
 */
import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { db } from '../src/lib/db'
import { users, vocabEntries } from '../src/lib/db/schema'
import {
  listAllUserTerms,
  listKeptFromDiscover,
} from '../src/lib/db/queries/vocab-suggestions'
import {
  createVocabEntry,
  findEntryByNormalizedTerm,
  setVocabStatus,
} from '../src/lib/db/queries/vocab'
import { isUniqueViolation } from '../src/lib/db/errors'
import { buildKnownKeySet, isKnown } from '../src/lib/vocab/dedup'

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

async function main() {
  const email = `f8-discover-check-${process.pid}@example.invalid`
  let userId: string | null = null

  try {
    const [user] = await db.insert(users).values({ email }).returning({ id: users.id })
    userId = user.id

    section('§8 layer 4 — mastered words still block a suggestion')

    const active = await createVocabEntry(userId, 'winnow')
    const retired = await createVocabEntry(userId, 'Genteel')
    await setVocabStatus(userId, retired.id, 'mastered')

    const terms = await listAllUserTerms(userId)
    check('both terms come back, whatever their status', terms.slice().sort(), ['Genteel', 'winnow'])

    const known = buildKnownKeySet(terms)
    check('the mastered word is known', isKnown(known, 'genteel'), true)
    check('and so is a variant of the active one', isKnown(known, 'winnowing'), true)
    check('an unrelated word is not', isKnown(known, 'laconic'), false)

    section('§6.2 accept forces source = suggested')

    const kept = await createVocabEntry(userId, 'laconic', 'suggested')
    check('the row records where it came from', kept.source, 'suggested')
    check('and enrichment has not run yet', kept.enrichmentStatus, 'pending')
    check('a manually added word is unaffected', active.source, 'manual')

    section('§8 layer 5 — the unique constraint never surfaces')

    // Exactly what the accept route does when two tabs race: the insert throws
    // 23505 and the existing row is read back rather than a 500 being returned.
    let violated = false
    try {
      await createVocabEntry(userId, 'LACONIC', 'suggested')
    } catch (err) {
      violated = isUniqueViolation(err)
    }
    check('a differently cased duplicate is refused by the index', violated, true)

    const resolved = await findEntryByNormalizedTerm(userId, 'laconic')
    check('and resolves to the row that already existed', resolved?.id, kept.id)

    const rows = await db
      .select({ id: vocabEntries.id })
      .from(vocabEntries)
      .where(eq(vocabEntries.userId, userId))
    check('so there is still one row per word', rows.length, 3)

    section('the kept-from-Discover strip')

    const strip = await listKeptFromDiscover(userId)
    check('shows only accepted suggestions', strip.map((w) => w.term), ['laconic'])
  } finally {
    if (userId) await db.delete(users).where(eq(users.id, userId))
  }

  console.log()
  if (failures > 0) {
    console.error(`${failures} check(s) failed`)
    process.exit(1)
  }
  console.log('all discovery database checks passed')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
