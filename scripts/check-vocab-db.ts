/**
 * F14's database-shaped guarantees, against a real Postgres.
 *
 * Run with:  npm run vocab:db
 *
 * Four things in this feature can only be wrong in the database, and every one
 * of them is silent when it is:
 *
 *   1. `applyCorrection` must return `kept_both` — not a delete, not an error —
 *      when the misspelling has been carded. [R1] is enforced by an
 *      `ON DELETE RESTRICT` FK, so getting this wrong is a 500 in production
 *      and nothing at all in an offline check.
 *   2. It must report `practiceLost` **before** the delete, because the
 *      `chat_sessions` row is gone the instant the delete lands (F14 D4, [R5]).
 *   3. `listTermsForDedup` must return **mastered** rows. A
 *      `where status = 'active'` would compile, pass `vocab:check`, and let
 *      somebody re-add `studying` a month after mastering `study`.
 *   4. The add path must write no row for a near duplicate, and must write one
 *      when overruled.
 *
 * F14 §7 writes the HTTP half as `curl` against a signed-in browser session,
 * which cannot be automated here. The HTTP is not the interesting part: the
 * functions the routes call are driven directly below, and `addWord` is a
 * faithful transcription of `POST /api/vocab`'s layer — same order, same
 * comparisons. If that route's layer changes, this changes with it.
 *
 * **No LLM calls.** `suggested_correction` is written directly.
 *
 * Seeds a throwaway user and deletes it in a `finally`; deletion cascades. A
 * crashed run leaves at most one row set behind, findable by `@example.invalid`.
 */
import 'dotenv/config'
import { and, eq } from 'drizzle-orm'
import { db } from '../src/lib/db'
import {
  chatSessions,
  dailyCardItems,
  dailyCards,
  users,
  vocabEntries,
} from '../src/lib/db/schema'
import {
  applyCorrection,
  attachOrigin,
  createLookedUpVocabEntry,
  createVocabEntry,
  getEntryForUser,
  listTermsForDedup,
  setVocabStatus,
} from '../src/lib/db/queries/vocab'
import { findNearDuplicate } from '../src/lib/vocab/near-duplicate'

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

/** Write the suggestion the enrichment prompt would have written. */
async function suggest(id: string, correction: string) {
  await db
    .update(vocabEntries)
    .set({
      suggestedCorrection: correction,
      enrichmentStatus: 'ready',
      definition: `what ${correction} means`,
    })
    .where(eq(vocabEntries.id, id))
}

/** `POST /api/vocab`'s duplicate layer, transcribed. See the header. */
async function addWord(
  userId: string,
  term: string,
  allowNearDuplicate = false,
): Promise<{ outcome: 'created' | 'duplicate' | 'near_duplicate'; id: string; status: string }> {
  const held = await listTermsForDedup(userId)
  const lowered = term.toLowerCase()

  const exact = held.find((row) => row.term.toLowerCase() === lowered)
  if (exact) return { outcome: 'duplicate', id: exact.id, status: exact.status }

  if (!allowNearDuplicate) {
    const near = findNearDuplicate(held, term)
    if (near) return { outcome: 'near_duplicate', id: near.id, status: near.status }
  }

  const entry = await createVocabEntry(userId, term)
  return { outcome: 'created', id: entry.id, status: entry.status }
}

async function countRows(userId: string): Promise<number> {
  const rows = await db
    .select({ id: vocabEntries.id })
    .from(vocabEntries)
    .where(eq(vocabEntries.userId, userId))
  return rows.length
}

async function main() {
  const email = `f14-vocab-check-${process.pid}@example.invalid`
  let userId: string | null = null
  /** Section 12's second user, so the ownership assertion has someone else. */
  let strangerId: string | null = null

  try {
    const [user] = await db.insert(users).values({ email }).returning({ id: users.id })
    userId = user.id

    /* ---------------------- 1. the plain merge ---------------------------- */

    section('1 — the typo merges into the spelling already held')

    const genteel = await createVocabEntry(userId, 'genteel')
    const genteell = await createVocabEntry(userId, 'genteell')
    await suggest(genteell.id, 'genteel')

    const merged = await applyCorrection(userId, genteell.id)
    check('the outcome is merged', merged.outcome, 'merged')
    check('and the survivor is the spelling that already existed', merged.entry?.id, genteel.id)
    check('no practice was lost', merged.practiceLost, false)
    check('the typo row is gone', await getEntryForUser(userId, genteell.id), null)

    /* ------------------- 2. [R1] refuses the delete ----------------------- */

    section('2 — a carded typo keeps both rows (D2, [R1])')

    const laconic = await createVocabEntry(userId, 'laconic')
    const laconicc = await createVocabEntry(userId, 'laconicc')
    await suggest(laconicc.id, 'laconic')

    // A real card, so the FK is what refuses — not an `if` in the query.
    const [card] = await db
      .insert(dailyCards)
      .values({ userId, cardDate: '2026-08-09', timezone: 'Asia/Jakarta' })
      .returning({ id: dailyCards.id })
    await db
      .insert(dailyCardItems)
      .values({ cardId: card.id, vocabEntryId: laconicc.id, position: 1 })

    const keptBoth = await applyCorrection(userId, laconicc.id)
    check('the outcome is kept_both, not in_use and not an error', keptBoth.outcome, 'kept_both')
    check('and it still names the survivor', keptBoth.entry?.id, laconic.id)
    check('the survivor keeps its term', keptBoth.entry?.term, 'laconic')

    const typoAfter = await getEntryForUser(userId, laconicc.id)
    check('the carded typo survives', typoAfter?.id, laconicc.id)
    check('and its suggestion is cleared, so it is not asked again', typoAfter?.suggestedCorrection, null)

    /* --------------- 3. merging into a mastered survivor ------------------ */

    section('3 — merging into a mastered word says so (Gap 1e)')

    const winnow = await createVocabEntry(userId, 'winnow')
    await setVocabStatus(userId, winnow.id, 'mastered')
    const winnoww = await createVocabEntry(userId, 'winnoww')
    await suggest(winnoww.id, 'winnow')

    const intoMastered = await applyCorrection(userId, winnoww.id)
    check('the merge still happens', intoMastered.outcome, 'merged')
    check('and the survivor reports mastered', intoMastered.entry?.status, 'mastered')

    /* ------------------ 4. the practice transcript ------------------------ */

    section('4 — a merge that destroys a transcript reports it (D4, [R5])')

    await createVocabEntry(userId, 'quixotic')
    const quixoticc = await createVocabEntry(userId, 'quixoticc')
    await suggest(quixoticc.id, 'quixotic')
    const [session] = await db
      .insert(chatSessions)
      .values({ userId, vocabEntryId: quixoticc.id })
      .returning({ id: chatSessions.id })

    const withPractice = await applyCorrection(userId, quixoticc.id)
    check('the merge happens', withPractice.outcome, 'merged')
    check('and the loss is reported', withPractice.practiceLost, true)

    const sessionRows = await db
      .select({ id: chatSessions.id })
      .from(chatSessions)
      .where(eq(chatSessions.id, session.id))
    check('the session went with the row (cascade)', sessionRows.length, 0)

    /* ------------------------ 5. the plain rename ------------------------- */

    section('5 — no pre-existing correct term is a rename')

    const perusse = await createVocabEntry(userId, 'perusse')
    await suggest(perusse.id, 'peruse')

    const renamed = await applyCorrection(userId, perusse.id)
    check('the outcome is renamed', renamed.outcome, 'renamed')
    check('and the row now carries the corrected spelling', renamed.entry?.term, 'peruse')
    check('with no suggestion left', renamed.entry?.suggestedCorrection, null)

    /* ------------------------- 6. idempotence ----------------------------- */

    section('6 — a second tap is a noop, not a second rename')

    const again = await applyCorrection(userId, perusse.id)
    check('the outcome is noop', again.outcome, 'noop')
    check('and the term is untouched', again.entry?.term, 'peruse')

    /* --------------------- 7. the near-duplicate layer -------------------- */

    section('7 — a near duplicate writes no row until it is overruled (D5)')

    const study = await createVocabEntry(userId, 'study')
    const before = await countRows(userId)

    const warned = await addWord(userId, 'studying')
    check('the add is refused as a near duplicate', warned.outcome, 'near_duplicate')
    check('and it names the word it means', warned.id, study.id)
    check('no row was written', await countRows(userId), before)

    const forced = await addWord(userId, 'studying', true)
    check('overruling it writes one', forced.outcome, 'created')
    check('and both now exist', await countRows(userId), before + 1)

    /* ------------------ 8. the hole the accept path opens ------------------ */

    section('8 — naive / naïve, the hole Discover opens (Gap 2)')

    // `POST /api/vocab/suggestions/accept` stores `normalizeForDedup(term)`,
    // which strips diacritics — so a Discover-accepted `naïve` lands as `naive`.
    // A later manual add stores what the user typed, and `lower(term)` sees two
    // different strings. The unique index cannot close this; the fold can.
    const naive = await createVocabEntry(userId, 'naive', 'suggested')
    const diacritic = await addWord(userId, 'naïve')
    check('the fold catches it', diacritic.outcome, 'near_duplicate')
    check('and points at the accepted row', diacritic.id, naive.id)

    const bothSpellings = await addWord(userId, 'naïve', true)
    check('forcing it is accepted by the index — the hole, demonstrated', bothSpellings.outcome, 'created')

    /* --------------------- 9. the mastered dead end ----------------------- */

    section('9 — a mastered duplicate has a way forward (D8)')

    const sober = await createVocabEntry(userId, 'sober')
    await setVocabStatus(userId, sober.id, 'mastered')

    const dupe = await addWord(userId, 'Sober')
    check('a differently cased add is an exact duplicate', dupe.outcome, 'duplicate')
    check('and it reports the status the notice needs', dupe.status, 'mastered')

    const restored = await setVocabStatus(userId, sober.id, 'active')
    check('putting it back in rotation succeeds', restored?.status, 'active')
    check('and clears the mastered timestamp, so a later re-master starts fresh', restored?.masteredAt, null)

    /* -------------------- 10. the no-status-filter rule ------------------- */

    section('10 — listTermsForDedup has NO status filter')

    await setVocabStatus(userId, sober.id, 'mastered')
    const terms = await listTermsForDedup(userId)
    const masteredTerms = terms.filter((row) => row.status === 'mastered').map((row) => row.term)
    // A `where status = 'active'` here would pass every other check in this
    // file. It is the same mistake `listAllUserTerms` warns about at length.
    check('mastered rows come back', masteredTerms.sort(), ['sober', 'winnow'])
    check('and so does everything else', terms.length, await countRows(userId))

    /* ------------- 11–13. the non-English lookup (2026-08-12) ------------- */

    section('11 — a looked-up word lands ready, with its origin, in ONE statement')

    /**
     * The property that matters is `enrichment_status`. F17 established why:
     * between an insert and a follow-up update the row is `pending`, and
     * `pending` is exactly the state `/vocab/[id]/chat` refuses to render. The
     * add form links straight there, so a two-statement version would race its
     * own navigation.
     */
    const smear = await createLookedUpVocabEntry(
      userId,
      'smear',
      {
        partOfSpeech: 'verb',
        pronunciation: '/smɪə/',
        definition: 'to spread a greasy substance over a surface',
        examples: ['She smeared butter across the warm toast.'],
      },
      {
        term: 'melumuri',
        language: 'Indonesian',
        context: 'mereka melumuri budi dengan minyak panas',
      },
    )

    check('it is ready on arrival, never pending', smear.enrichmentStatus, 'ready')
    check('the definition is there in the same row', smear.definition, 'to spread a greasy substance over a surface')
    check('the origin term is stored', smear.originTerm, 'melumuri')
    check('the detected language is stored', smear.originLanguage, 'Indonesian')
    check('and the as-in sentence', smear.originContext, 'mereka melumuri budi dengan minyak panas')

    /**
     * The one that is easy to get wrong by tidying. F17 chose `'shared'` so a
     * claimed word would not inflate F9's collector level; this is the inverse
     * case and must count, because the user typed the foreign word themselves.
     */
    check('source stays manual — F9 counts this word', smear.source, 'manual')

    section('12 — attachOrigin is conditional, and the first origin wins')

    const held = await createVocabEntry(userId, 'daub')
    check('a fresh row has no origin', held.originTerm, null)

    const attached = await attachOrigin(userId, held.id, {
      term: 'melumuri',
      language: 'Indonesian',
      context: null,
    })
    check('the first attach lands', attached?.originTerm, 'melumuri')
    check('with no context when none was given', attached?.originContext, null)

    // Conditional in the statement, not in a read-then-write. Two lookups
    // resolving to the same held word cannot both attach.
    const second = await attachOrigin(userId, held.id, {
      term: 'mengoles',
      language: 'Indonesian',
      context: null,
    })
    check('a second attach matches nothing', second, null)
    const stillFirst = await getEntryForUser(userId, held.id)
    check('and the row keeps the first origin', stillFirst?.originTerm, 'melumuri')

    // `userId` is first and in the WHERE clause, like every function in
    // queries/vocab.ts. Another user's row is not reachable.
    const [stranger] = await db
      .insert(users)
      .values({ email: `f14-vocab-stranger-${process.pid}@example.invalid` })
      .returning({ id: users.id })
    strangerId = stranger.id
    check(
      "another user's row cannot be given an origin",
      await attachOrigin(strangerId, smear.id, {
        term: 'x',
        language: 'Indonesian',
        context: null,
      }),
      null,
    )

    section('13 — the CHECK refuses a context with no term')

    /**
     * Migration 0008's constraint. Asserted against the database rather than
     * reasoned about, because the whole point of putting it in DDL was that no
     * future caller can represent the state — including one that does not go
     * through `createLookedUpVocabEntry`.
     */
    let refused = false
    try {
      await db.insert(vocabEntries).values({
        userId,
        term: 'orphaned-context',
        source: 'manual',
        originContext: 'a sentence with nothing to be the context of',
      })
    } catch {
      refused = true
    }
    check('the database refuses it', refused, true)

    // And the legal converse: an origin term with no sentence is the common
    // case, not an error — most lookups will not supply one.
    const noContext = await createLookedUpVocabEntry(
      userId,
      'coat',
      {
        partOfSpeech: 'verb',
        pronunciation: '/kəʊt/',
        definition: 'to cover a surface with a layer of something',
        examples: ['Coat the pan with oil.'],
      },
      { term: 'melapisi', language: 'Indonesian', context: null },
    )
    check('an origin with no sentence is legal', noContext.originContext, null)
    check('and still carries its term', noContext.originTerm, 'melapisi')

    /* ----------------------- the ledger, at the end ----------------------- */

    section('the collection, at the end of all that')

    const finalRows = await db
      .select({ term: vocabEntries.term })
      .from(vocabEntries)
      .where(eq(vocabEntries.userId, userId))
    check(
      'exactly the words the run should have left',
      finalRows.map((r) => r.term).sort(),
      [
        'coat',
        'daub',
        'genteel',
        'laconic',
        'laconicc',
        'naive',
        'naïve',
        'peruse',
        'quixotic',
        /* Sections 11–13. `smear` and `coat` arrived through the lookup, `daub`
           was typed and then given an origin. `orphaned-context` is deliberately
           absent: the CHECK refused it, which is section 13's whole point. */
        'smear',
        'sober',
        'study',
        'studying',
        'winnow',
      ],
    )

    const orphan = await db
      .select({ id: vocabEntries.id })
      .from(vocabEntries)
      .where(and(eq(vocabEntries.userId, userId), eq(vocabEntries.term, 'genteell')))
    check('and no merged typo survived anywhere', orphan.length, 0)
  } finally {
    if (userId) await db.delete(users).where(eq(users.id, userId))
    if (strangerId) await db.delete(users).where(eq(users.id, strangerId))
  }

  console.log()
  if (failures > 0) {
    console.error(`${failures} check(s) failed`)
    process.exit(1)
  }
  console.log('all vocab duplicate database checks passed')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
