/**
 * Executable assertions for every pure decision F14 makes.
 *
 * Run with:  npm run vocab:check
 *
 * There is no test runner in this project, so these are plain assertions in a
 * file that exits non-zero — the same shape as `check-discover.ts`,
 * `check-dates.ts` and `check-chat.ts`. Nothing here touches the database, the
 * network or the environment.
 *
 * The first section is the one that matters: the add path's outcome table. A
 * regression there either lets a second spelling of a word the user already owns
 * become a durable row — which can be carded, and then never deleted ([R1]) — or
 * warns about a word that is genuinely new.
 *
 * What is NOT here, because it cannot be: whether iOS lets a typo reach the
 * server at all. `autoCorrect="off"` is what makes the whole correction path
 * reachable, and only a real iPhone can confirm it. F14 §7 lists it.
 */
import { normalizeForDedup } from '../src/lib/vocab/dedup'
import {
  ENRICHMENT_COPY,
  EXISTING_WORD_SITUATIONS,
  correctionCopy,
  existingWordCopy,
} from '../src/lib/vocab/display'
import { findNearDuplicate } from '../src/lib/vocab/near-duplicate'
import { normalizeTerm } from '../src/lib/vocab/normalize'
import {
  ENRICHMENT_ERROR_CODES,
  acceptCorrectionResponseSchema,
  createVocabRequestSchema,
  createVocabResponseSchema,
} from '../src/lib/vocab/schemas'
import type { VocabStatus } from '../src/lib/vocab/schemas'
import {
  VOCAB_CLIENT_INDEX_MAX,
  canIndexLocally,
  filterBySearch,
  matchesSearch,
  searchNeedle,
} from '../src/lib/vocab/search'

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

/* --------------------- §1 the add-path outcome table ----------------------- */

section('§1 the add path — (held, typed) → outcome')

type AddOutcome = 'created' | 'duplicate' | 'near_duplicate'

/**
 * `POST /api/vocab`'s decision, with the database's two halves replaced by the
 * pure ones: `lower(term)` equality for the exact case, `findNearDuplicate` for
 * the fold. The route runs exactly this order — exact first, then the fold, then
 * the insert — and the `23505` catch behind it is the backstop the two cannot
 * be wrong in a way that loses.
 */
function addOutcome(held: readonly string[], typedRaw: string): AddOutcome {
  const typed = normalizeTerm(typedRaw)
  const rows = held.map((term, i) => ({ id: String(i), term }))

  if (rows.some((row) => row.term.toLowerCase() === typed.toLowerCase())) {
    return 'duplicate'
  }
  return findNearDuplicate(rows, typed) ? 'near_duplicate' : 'created'
}

/** [what the user holds, what they typed, what the route must answer, why] */
const TABLE: ReadonlyArray<readonly [string, string, AddOutcome, string]> = [
  ['genteel', 'genteell', 'created', 'the fold is not a spell-checker — Gap 1 owns this, not Gap 2'],
  ['genteel', 'Genteel', 'duplicate', 'lower(term)'],
  ['bus', 'Bus', 'duplicate', 'same, and `bus` is too short to fold'],
  ['Bus', 'bus', 'duplicate', 'the reverse direction'],
  ['study', 'studying', 'near_duplicate', 'ying → y'],
  ['studying', 'study', 'near_duplicate', 'symmetric'],
  ['naive', 'naïve', 'near_duplicate', 'the hole the accept path opens'],
  ['naïve', 'naive', 'near_duplicate', 'symmetric'],
  ['cafe', 'café', 'near_duplicate', 'same class'],
  ['resume', 'résumé', 'near_duplicate', 'a real English pair — refusable, never blocked'],
  ['create', 'creative', 'near_duplicate', "dedup.ts's own table"],
  ['sob', 'sober', 'created', 'MIN_DERIVED_STEM holds'],
  ['form', 'formal', 'created', 'same'],
  ['gentle', 'genteel', 'created', 'different words stay different'],
  ['formal', 'so formal', 'created', 'the phrase gate: the fold is not applied to phrases'],
  ['so formal', 'so form', 'created', "proves the gate — dedupKey('so formal') is 'so form'"],
  ['in the nick of time', 'in the nick of time.', 'duplicate', 'normalizeTerm strips the sole trailing stop'],
]

for (const [held, typed, expected, why] of TABLE) {
  check(`${held} / ${typed} → ${expected}  (${why})`, addOutcome([held], typed), expected)
}

section('§1 the fold returns the row it collided with, not a boolean')

const collection = [
  { id: 'a', term: 'study', status: 'active' as const },
  { id: 'b', term: 'winnow', status: 'mastered' as const },
]
check('the near-duplicate names the word it means', findNearDuplicate(collection, 'studying')?.id, 'a')
check('a mastered row is a collision too', findNearDuplicate(collection, 'winnowing')?.id, 'b')
check('and an unrelated word is none', findNearDuplicate(collection, 'laconic'), null)

// The exact normalised form beats the morphological one. With one pass the row
// that happened to come first in the collection would win, and the user would be
// shown the less obvious of two true answers.
const both = [
  { id: 'folded', term: 'studying' },
  { id: 'exact', term: 'study' },
]
check('an exact normalised match outranks a folded one', findNearDuplicate(both, 'study')?.id, 'exact')

section('§1 an empty collection collides with nothing')

check('no rows, no collision', findNearDuplicate([], 'genteel'), null)
check('and a term that normalises to nothing matches nothing', findNearDuplicate([{ term: 'x' }], '...'), null)

/* ------------ §2 the two normalizers still disagree on purpose ------------- */

section('§2 normalizeTerm and normalizeForDedup answer different questions')

// CLAUDE.md's invariant. A merge of the two files would pass every other check
// in this repository and silently destroy both behaviours.
check('normalizeTerm keeps diacritics', normalizeTerm('naïve'), 'naïve')
check('normalizeForDedup destroys them', normalizeForDedup('naïve'), 'naive')
check('normalizeTerm keeps case', normalizeTerm('Genteel'), 'Genteel')
check('normalizeForDedup destroys it', normalizeForDedup('Genteel'), 'genteel')
check('normalizeTerm keeps interior punctuation', normalizeTerm("i.e."), 'i.e.')
check('normalizeForDedup strips the edges', normalizeForDedup('  "Genteel!" '), 'genteel')

/* --------------------------- §3 the wire contracts -------------------------- */

section('§3 the create request — allowNearDuplicate (D5)')

const bare = createVocabRequestSchema.safeParse({ term: 'studying' })
check('a plain add parses', bare.success, true)
// The default matters more than the parse: an absent flag must mean "warn me",
// never "the client forgot, so let it through".
check('and defaults to warning', bare.data?.allowNearDuplicate, false)
check(
  'the override parses',
  createVocabRequestSchema.safeParse({ term: 'studying', allowNearDuplicate: true }).data
    ?.allowNearDuplicate,
  true,
)
check(
  'a truthy string is not a boolean',
  createVocabRequestSchema.safeParse({ term: 'studying', allowNearDuplicate: 'yes' }).success,
  false,
)

section('§3 the create response is a discriminant, not two booleans (D6)')

const created = createVocabResponseSchema.safeParse({
  id: '11111111-1111-4111-8111-111111111111',
  term: 'studying',
  status: 'active',
  enrichmentStatus: 'pending',
  outcome: 'near_duplicate',
})
check('the three outcomes parse', created.success, true)
check(
  'and the old boolean shape does not',
  createVocabResponseSchema.safeParse({
    id: '11111111-1111-4111-8111-111111111111',
    term: 'studying',
    status: 'active',
    enrichmentStatus: 'pending',
    duplicate: true,
  }).success,
  false,
)

section('§3 the correction response carries the survivor (D2)')

const keptBoth = acceptCorrectionResponseSchema.safeParse({
  outcome: 'kept_both',
  id: '22222222-2222-4222-8222-222222222222',
  term: 'genteel',
  status: 'mastered',
  practiceLost: false,
})
check('kept_both is a real outcome now, not a 409', keptBoth.success, true)
check('and it names the survivor', keptBoth.data?.term, 'genteel')
check(
  'in_use is gone from the union',
  acceptCorrectionResponseSchema.safeParse({
    outcome: 'in_use',
    id: '22222222-2222-4222-8222-222222222222',
    term: 'genteel',
    status: 'active',
    practiceLost: false,
  }).success,
  false,
)

/* ----------------------------- §4 copy completeness ------------------------- */

section('§4 every notice state has a sentence (D10)')

const STATUSES: readonly VocabStatus[] = ['active', 'mastered']

for (const situation of EXISTING_WORD_SITUATIONS) {
  for (const status of STATUSES) {
    const line = existingWordCopy({ situation, term: 'genteel', status })
    check(`${situation} × ${status}`, line.length > 0 && line.includes('genteel'), true)
  }
}

section('§4 every correction outcome has a sentence')

for (const outcome of ['renamed', 'merged', 'kept_both', 'noop'] as const) {
  for (const status of STATUSES) {
    check(
      `${outcome} × ${status}`,
      correctionCopy({ outcome, term: 'genteel', status }).length > 0,
      true,
    )
  }
}

// Gap 1e: merging into a mastered word produces nothing any future card can
// show, and "You already had genteel." does not say that.
check(
  'a mastered survivor reads differently from an active one',
  existingWordCopy({ situation: 'merged', term: 'genteel', status: 'active' }) !==
    existingWordCopy({ situation: 'merged', term: 'genteel', status: 'mastered' }),
  true,
)

section('§4 the enrichment table stays total, and no verdict offers a retry')

for (const code of ENRICHMENT_ERROR_CODES) {
  check(`${code} has copy`, ENRICHMENT_COPY[code].message.length > 0, true)
}

// This is what stops Gap 5's distinction regressing into a retry loop on a
// verdict: the model answered, and the answer will not change on a second ask.
check('not_english offers no retry', ENRICHMENT_COPY.not_english.retry, false)
check('unverified_spelling offers no retry', ENRICHMENT_COPY.unverified_spelling.retry, false)

for (const code of ['llm_timeout', 'llm_unreachable', 'llm_rate_limited', 'bad_response'] as const) {
  check(`${code} does offer one`, ENRICHMENT_COPY[code].retry, true)
}

// D9. Both verdicts keep the word, and until F14 only one of them said so.
check('not_english says the word was kept', ENRICHMENT_COPY.not_english.message.startsWith('Kept as typed.'), true)
check(
  'unverified_spelling still does too',
  ENRICHMENT_COPY.unverified_spelling.message.startsWith('Kept as typed.'),
  true,
)

/* ------------------- §5 the collection search rule (F19) -------------------- */

section('§5 the search filter is a transcription of the SQL, not of dedup.ts')

/**
 * The oracle: `matchesQuery` in `lib/db/queries/vocab.ts`, re-read in JS.
 *
 *   position(lower($q) in lower(term)) > 0
 *   or position(lower($q) in lower(coalesce(definition, ''))) > 0
 *
 * `position(x in y) > 0` is `y.indexOf(x) !== -1`. Written out longhand rather
 * than by calling `matchesSearch`, because a check that calls the thing it is
 * checking asserts nothing.
 */
function sqlOracle(item: { term: string; definition: string | null }, q: string): boolean {
  const needle = q.trim().slice(0, 64).toLowerCase()
  if (needle === '') return true
  return (
    item.term.toLowerCase().indexOf(needle) !== -1 ||
    (item.definition ?? '').toLowerCase().indexOf(needle) !== -1
  )
}

const ROWS: { term: string; definition: string | null }[] = [
  { term: 'genteel', definition: 'Polite, refined, or respectable.' },
  { term: 'Café', definition: 'A small restaurant selling light meals.' },
  { term: 'naïve', definition: null },
  { term: 'sober', definition: 'Not affected by alcohol.' },
  { term: 'sob', definition: 'To weep with convulsive gasps.' },
  { term: 'i.e.', definition: 'That is; in other words.' },
  { term: 'margin', definition: 'A 100% increase in the edge of a page.' },
  { term: 'winnow', definition: 'To blow a current of air through grain.' },
]

const QUERIES = [
  'gen', 'GEN', 'Gen', 'cafe', 'café', 'CAFÉ', 'naive', 'naïve',
  'sob', 'sober', '100%', '_', '\\', 'i.e.', 'i.e', '', '   ',
  'polite', 'POLITE', 'grain', 'zzz', 'e',
]

for (const q of QUERIES) {
  const needle = searchNeedle(q)
  check(
    `matchesSearch agrees with the SQL for ${JSON.stringify(q)}`,
    ROWS.map((row) => matchesSearch(row, needle)),
    ROWS.map((row) => sqlOracle(row, q)),
  )
}

// The three that would silently change meaning if someone reached for the wrong
// module, spelled out so a regression names itself.
check('diacritics are NOT folded — cafe does not find Café', matchesSearch(ROWS[1], searchNeedle('cafe')), false)
check('…and café does', matchesSearch(ROWS[1], searchNeedle('café')), true)
check('% is a literal, not a wildcard', ROWS.filter((r) => matchesSearch(r, searchNeedle('100%'))).length, 1)
check('a lone _ matches nothing', ROWS.filter((r) => matchesSearch(r, searchNeedle('_'))).length, 0)
check('a lone backslash matches nothing', ROWS.filter((r) => matchesSearch(r, searchNeedle('\\'))).length, 0)
check('the trailing full stop is NOT stripped — i.e. is searched as typed', matchesSearch(ROWS[5], searchNeedle('i.e.')), true)
check('a null definition never throws', matchesSearch(ROWS[2], searchNeedle('weep')), false)
check('an empty needle matches every row', ROWS.every((r) => matchesSearch(r, searchNeedle('  '))), true)

// searchNeedle: trim, then slice, then lowercase — in that order.
check('searchNeedle trims', searchNeedle('  gen  '), 'gen')
check('searchNeedle lowercases', searchNeedle('GEN'), 'gen')
check('searchNeedle caps at MAX_SEARCH_CHARS', searchNeedle('x'.repeat(200)).length, 64)
check('searchNeedle trims before slicing', searchNeedle(' ' + 'x'.repeat(64) + ' ').length, 64)

// Order is the database's and must survive the filter untouched.
const ordered = filterBySearch([...ROWS], searchNeedle('e'))
check(
  'filterBySearch preserves the database order',
  ordered.map((r) => r.term),
  ROWS.filter((r) => matchesSearch(r, searchNeedle('e'))).map((r) => r.term),
)
check('an empty needle returns the same array reference', filterBySearch(ROWS, '') === ROWS, true)

section('§5b the client-index ceiling is a number somebody checked')

check('at the ceiling, local', canIndexLocally(VOCAB_CLIENT_INDEX_MAX), true)
check('one over, server', canIndexLocally(VOCAB_CLIENT_INDEX_MAX + 1), false)
check('an empty collection is local', canIndexLocally(0), true)

/**
 * The arithmetic behind the constant. A worst-case row, serialised, times the
 * ceiling, against a raw-payload budget of 400 kB (~70 kB brotli). Raising
 * VOCAB_CLIENT_INDEX_MAX without raising the budget fails here rather than on a
 * user's phone.
 */
const WORST_ROW = JSON.stringify({
  id: '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  term: 'intellectualisation',
  definition: 'x'.repeat(110),
  status: 'active',
  enrichmentStatus: 'ready',
})
const budget = VOCAB_CLIENT_INDEX_MAX * WORST_ROW.length
console.log(`  note worst-case payload at the ceiling: ${Math.round(budget / 1024)} kB raw`)
check('the whole-collection payload stays under 400 kB raw', budget < 400_000, true)

/* ---------------------------------- Result ---------------------------------- */

console.log()
if (failures > 0) {
  console.error(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('all vocab duplicate checks passed')
