/**
 * Executable assertions for every pure decision F8 makes.
 *
 * Run with:  npm run discover:check
 *
 * There is no test runner in this project, so these are plain assertions in a
 * file that exits non-zero — the same shape as `check-dates.ts`,
 * `check-profile.ts` and `check-chat.ts`. Nothing here touches the database, the
 * network or the environment.
 *
 * The first section is the single most important check in F8: every row of the
 * plan's §8 worked-examples table, driven through `dedupKey`. A regression there
 * either proposes a word the user already owns or — far worse, because it is
 * silent — hides a good word from them forever.
 *
 * What is NOT here, because it cannot be: whether the model returns words worth
 * having. That is `npm run discover:dry-run`, read by a human.
 */
import {
  buildKnownKeySet,
  dedupKey,
  isKnown,
  isSingleWord,
  normalizeForDedup,
} from '../src/lib/vocab/dedup'
import {
  AVOID_CAP,
  DEFAULT_REGISTER,
  NO_AVOID_LIST,
  buildSuggestWordsPrompt,
  renderAvoidList,
  renderProfileBlock,
  SUGGEST_WORDS_SYSTEM,
  SUGGESTION_COUNT,
  suggestWordsResponseSchema,
} from '../src/lib/llm/prompts/suggest-words'
import { buildProfileContext, PROFILE_CONTEXT_GUARD } from '../src/lib/profile/context'
import {
  acceptSuggestionRequestSchema,
  suggestRequestSchema,
} from '../src/lib/vocab/schemas'
import {
  checkSuggestionRate,
  MAX_SUGGEST_CALLS_PER_HOUR,
  resetSuggestionRateLimit,
} from '../src/lib/vocab/suggestion-rate-limit'

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

/* ------------------------- §8 the worked examples -------------------------- */

section('§8 dedup — every row of the worked-examples table')

/** [what the user has, what the model returned, must they collide?] */
const TABLE: ReadonlyArray<readonly [string, string, boolean]> = [
  ['Genteel', 'genteel', true], //     mastered rows are in `known` too
  ['naïve', 'Naive', true], //         diacritics folded in layer 2
  ['run', 'running', true], //         inflection + dedouble
  ['peruse', 'perusing', true], //     -ing, then final-e cleanup on the known term
  ['obfuscate', 'obfuscation', true], // the case the prompt itself warns about
  ['lucid', 'lucidity', true], //      -ity, stem is exactly 5
  ['create', 'creative', true], //     -ive, stem is exactly 5
  ['study', 'studies', true], //       -ies → y
  ['bus', 'buses', true], //           -es after s; `bus` is too short to fold
  ['glass', 'glass', true], //         the -s guard holds; normalised forms match
  ['sob', 'sober', false], //          -er would leave 3 chars: guard refuses
  ['form', 'formal', false], //        -al would leave 4 chars: guard refuses
  ['gentle', 'genteel', false], //     different words, and they stay different
]

for (const [held, proposed, collides] of TABLE) {
  check(
    `${held} / ${proposed} → ${collides ? 'dropped' : 'kept'}`,
    dedupKey(held) === dedupKey(proposed),
    collides,
  )
}

section('§8 the guards that stop false collisions')

check('cover does not fold to cov', dedupKey('cover'), 'cover')
check('letter does not fold to lett', dedupKey('letter'), 'letter')
check('genius is not a plural', dedupKey('genius'), 'genius')
check('crisis is not a plural', dedupKey('crisis'), 'crisis')
check('bias is not a plural', dedupKey('bias'), 'bias')
check('passing keeps its double s', dedupKey('passing'), 'pass')
check('stopped dedoubles', dedupKey('stopped'), 'stop')
check('wishes folds through the sibilant rule', dedupKey('wishes'), 'wish')
check('boxes folds through the sibilant rule', dedupKey('boxes'), 'box')

section('§8 normalisation')

check('trims, strips and lowercases', normalizeForDedup('  Naïve. '), 'naive')
check('quotes and stops at the edges go', normalizeForDedup('"Genteel!"'), 'genteel')
check('a phrase is left as a phrase', normalizeForDedup('New York'), 'new york')
check('a phrase fails the shape filter', isSingleWord('New York'), false)
check('one letter fails the shape filter', isSingleWord('a'), false)
// The trap `isSingleWord` exists for: edge-stripping would have made this pass
// as `web`, and the user would be offered a word the model never proposed.
check('digits fail the shape filter', isSingleWord('web3'), false)
check('a hyphenated compound fails', isSingleWord('self-evident'), false)
check('a plain word passes', isSingleWord('Laconic'), true)
check('and so does an accented one', isSingleWord('naïve'), true)

section('§8 the known set carries both forms')

const known = buildKnownKeySet(['Genteel', 'obfuscate'], ['quixotic'])
check('exact, case-folded', isKnown(known, 'genteel'), true)
check('morphological', isKnown(known, 'obfuscation'), true)
check('a session decline', isKnown(known, 'Quixotic'), true)
check('an unrelated word', isKnown(known, 'winnow'), false)

/* --------------------------- §7 the prompt ---------------------------------- */

section('§7.3 the profile block — the one seam onto F7')

const populated = buildProfileContext({
  occupation: 'backend engineer',
  interests: ['19th-century novels', 'cycling'],
  currentlyConsuming: 'Bleak House',
  englishContexts: ['work'],
  chatTone: 'blunt',
})
const skipped = buildProfileContext({})

check('a populated profile is sent as F7 rendered it', renderProfileBlock(populated), populated.text)
check(
  'a profile with every question skipped still gets the default register',
  renderProfileBlock(skipped).endsWith(DEFAULT_REGISTER),
  true,
)
check(
  'a skipped profile keeps its tags, so the guard stays truthful',
  renderProfileBlock(skipped).includes('<user_profile>'),
  true,
)
check(
  'no profile row at all reads exactly like a skipped one',
  renderProfileBlock(null),
  DEFAULT_REGISTER,
)
check(
  'the guard is in the system prompt verbatim',
  SUGGEST_WORDS_SYSTEM.includes(PROFILE_CONTEXT_GUARD),
  true,
)

section('§14 no second enrichment prompt')

for (const forbidden of ['pronunciation', 'part_of_speech', 'examples', 'IPA']) {
  check(`the prompt never asks for ${forbidden}`, SUGGEST_WORDS_SYSTEM.includes(forbidden), false)
}

section('§7.4 the AVOID list')

check('an empty collection says so', renderAvoidList([]), NO_AVOID_LIST)
check('one per line, lowercased', renderAvoidList(['Genteel', 'winnow']), 'genteel\nwinnow')
check('duplicates do not eat two lines of the cap', renderAvoidList(['a', 'A', 'b']), 'a\nb')

const many = Array.from({ length: 400 }, (_, i) => `word${i}`)
const rendered = renderAvoidList(many)
check(`capped at ${AVOID_CAP} lines`, rendered.split('\n').length, AVOID_CAP)
check('and it keeps the most recent, which lead the array', rendered.startsWith('word0\n'), true)
check('so the oldest fall off', rendered.includes('word399'), false)

section('§7.2 the assembled user prompt')

const prompt = buildSuggestWordsPrompt({
  profile: populated,
  avoid: ['genteel'],
  count: SUGGESTION_COUNT,
})
check('the count is asked for explicitly', prompt.includes('Return exactly 5 suggestions.'), true)
check('the learner block is present', prompt.includes(populated.text), true)
check('the avoid list is present', prompt.includes('\ngenteel'), true)
check('the batch size is five', SUGGESTION_COUNT, 5)

section('§7.6 the envelope schema is loose on purpose')

const loose = suggestWordsResponseSchema.safeParse({
  suggestions: [
    { term: 'New York', partOfSpeech: 'Noun.', gloss: 'a city' },
    { term: 'laconic', partOfSpeech: 'adjective', gloss: 'using very few words' },
  ],
})
check(
  'a batch with one bad item still parses, so the good ones survive',
  loose.success,
  true,
)
check(
  'the wrong envelope does not',
  suggestWordsResponseSchema.safeParse({ suggestions: [] }).success,
  false,
)
check(
  'and neither does prose',
  suggestWordsResponseSchema.safeParse({ words: ['laconic'] }).success,
  false,
)

/* ------------------------------ §6 the contracts ---------------------------- */

section('§6 the request schemas')

check(
  'an absent exclude list defaults to empty',
  suggestRequestSchema.safeParse({}).data?.exclude,
  [],
)
check('a non-array exclude is refused', suggestRequestSchema.safeParse({ exclude: 123 }).success, false)
check(
  'and more than fifty declines is refused',
  suggestRequestSchema.safeParse({ exclude: Array.from({ length: 51 }, () => 'x') }).success,
  false,
)

check('accept takes a term', acceptSuggestionRequestSchema.safeParse({ term: 'winnow' }).success, true)
// §14: the client must not be able to author provenance. F9 counts manually
// added words for the collector level, so a `source` the client picks is a level
// the user did not earn.
check(
  'and refuses a client-supplied source outright',
  acceptSuggestionRequestSchema.safeParse({ term: 'winnow', source: 'manual' }).success,
  false,
)
check(
  'and refuses a client-supplied definition',
  acceptSuggestionRequestSchema.safeParse({ term: 'winnow', gloss: 'anything' }).success,
  false,
)

/* ------------------------------ §12 the limiter ----------------------------- */

section('§12 the rate limiter')

resetSuggestionRateLimit()
const verdicts = Array.from({ length: MAX_SUGGEST_CALLS_PER_HOUR + 1 }, () =>
  checkSuggestionRate('u1').ok,
)
check(`the first ${MAX_SUGGEST_CALLS_PER_HOUR} pass`, verdicts.slice(0, -1).every(Boolean), true)
check('the eleventh does not', verdicts[verdicts.length - 1], false)
check('another user is unaffected', checkSuggestionRate('u2').ok, true)

// Two users rather than one, and each clock only ever runs forwards: the window
// prunes on read, so replaying an earlier timestamp against a user who has
// already been pruned tests nothing.
resetSuggestionRateLimit()
const t0 = 1_000_000_000_000
const HOUR = 60 * 60 * 1000

for (let i = 0; i < MAX_SUGGEST_CALLS_PER_HOUR; i++) checkSuggestionRate('u3', t0)
check('a minute later is still inside the window', checkSuggestionRate('u3', t0 + 60_000).ok, false)

for (let i = 0; i < MAX_SUGGEST_CALLS_PER_HOUR; i++) checkSuggestionRate('u4', t0)
check('an hour and a millisecond later is not', checkSuggestionRate('u4', t0 + HOUR + 1).ok, true)

// A refused call must not extend its own lockout, or a user leaning on a
// disabled button would never get back in.
resetSuggestionRateLimit()
for (let i = 0; i < MAX_SUGGEST_CALLS_PER_HOUR; i++) checkSuggestionRate('u5', t0)
for (let i = 0; i < 20; i++) checkSuggestionRate('u5', t0 + 1000)
check('a refusal is not recorded', checkSuggestionRate('u5', t0 + HOUR + 1).ok, true)

/* ---------------------------------- Result ---------------------------------- */

console.log()
if (failures > 0) {
  console.error(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('all discovery checks passed')
