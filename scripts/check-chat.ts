/**
 * Executable assertions for every pure decision F6 makes.
 *
 * Run with:  npm run chat:check
 *
 * There is no test runner in this project, so these are plain assertions in a
 * file that exits non-zero — the same shape as `check-dates.ts` and
 * `check-profile.ts`. Nothing here touches the database, the network or the
 * environment: the turn policy, the sanitiser, the transcript builder, the
 * scenario picker and the prompt interpolation are all total functions of their
 * inputs, and that is exactly why they are worth asserting offline.
 *
 * What is NOT here, because it cannot be: whether the model obeys the prompt.
 * That is `npm run chat:dry-run`, read by a human against the §13.6 rubric.
 */
import {
  canSend,
  deriveStatus,
  isClosing,
  MAX_ASSISTANT_TURNS,
  MAX_LLM_CALLS_PER_ROUND,
  needsOpener,
  turnsRemaining,
} from '../src/lib/chat/turn-policy'
import { sanitizeReply, sanitizeVerdict, softTruncate } from '../src/lib/chat/sanitize'
import {
  buildConversation,
  hasUserTurns,
  renderTranscript,
  SCENE_ANCHOR,
} from '../src/lib/chat/transcript'
import { pickScenario, SCENARIOS } from '../src/lib/llm/prompts/chat-scenarios'
import {
  chatSystemPrompt,
  SCENARIO_BLOCK_OPENING,
  SCENARIO_BLOCK_UNDERWAY,
} from '../src/lib/llm/prompts/chat-system'
import { chatOpenerPrompt } from '../src/lib/llm/prompts/chat-opener'
import { fallbackVerdict, verdictPrompt } from '../src/lib/llm/prompts/chat-verdict'
import { buildProfileContext } from '../src/lib/profile/context'
import { PROFILE_CONTEXT_GUARD } from '../src/lib/profile/context'
import { startOfLocalDayUtc } from '../src/lib/time/local-date'

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

/* ------------------------------- The turn cap ------------------------------- */

section('[R6] the cap: one opener plus seven replies')

check('eight assistant turns', MAX_ASSISTANT_TURNS, 8)
check('nine model calls per round — the verdict is not a turn', MAX_LLM_CALLS_PER_ROUND, 9)

const live = (turnCount: number, messageCount: number) =>
  deriveStatus({ closedAt: null, turnCount, messageCount })

check('a fresh round', live(0, 0), 'empty')
check('the opener has landed', live(1, 1), 'open')
check('mid-conversation', live(4, 7), 'open')
check('one turn left', live(7, 13), 'open')
check('the cap is reached', live(8, 15), 'closing')
check(
  'closed wins over everything',
  deriveStatus({ closedAt: new Date(0), turnCount: 8, messageCount: 16 }),
  'closed',
)
// The window between reserving turn 1 and the opener row landing. `empty` is
// the right reading: the screen shows a typing bubble and a disabled composer,
// which is exactly what "the opener is in flight" should look like. Reading it
// as `open` would enable a composer above an empty transcript.
check('reserved, opener still in flight', live(1, 0), 'empty')

check('the composer is live only while open', [
  canSend('empty'),
  canSend('open'),
  canSend('closing'),
  canSend('closed'),
], [false, true, false, false])

check('closing is the signal to fire /close', isClosing('closing'), true)
check('an empty round wants an opener', needsOpener('empty'), true)
check('an open round does not', needsOpener('open'), false)
check('pips left at four turns', turnsRemaining(4), 4)
check('never negative', turnsRemaining(99), 0)

/* -------------------------------- Sanitising -------------------------------- */

section('what the model says, reduced to what a person would say')

check(
  'a name label is stripped',
  sanitizeReply('You: The queue has not moved in ten minutes.'),
  'The queue has not moved in ten minutes.',
)
check(
  'an Assistant: label too',
  sanitizeReply('Assistant: Still nothing.'),
  'Still nothing.',
)
check(
  'stage directions lose their asterisks',
  sanitizeReply('*sighs* This is the third delay.'),
  'sighs This is the third delay.',
)
check('bold is unwrapped', sanitizeReply('That was **very** polished.'), 'That was very polished.')
check(
  'a bullet list is flattened',
  sanitizeReply('- one thing\n- another thing'),
  'one thing another thing',
)
check('emoji go', sanitizeReply('Right then 😀 what did he say?'), 'Right then what did he say?')
check(
  'wrapping quotes go',
  sanitizeReply('"He answered in three paragraphs."'),
  'He answered in three paragraphs.',
)
// The reply that quotes the user back is the behaviour rule 5 asks for, and it
// often starts and ends with a quotation mark. Unwrapping it would eat both.
check(
  'a reply with interior quotes keeps its own',
  sanitizeReply('"I trust this clarifies matters" — that is the whole species in one line."'),
  '"I trust this clarifies matters" — that is the whole species in one line."',
)
check(
  'a parenthetical on its own line goes',
  sanitizeReply('(He puts the cup down.)\nSo what did you tell him?'),
  'So what did you tell him?',
)
// An inline aside is how people talk and must survive.
check(
  'an inline aside survives',
  sanitizeReply('He replied (eventually) with nothing at all.'),
  'He replied (eventually) with nothing at all.',
)
check('whitespace collapses', sanitizeReply('  two   spaces\n\nand a break '), 'two spaces and a break')
check('an all-emoji reply sanitises to nothing', sanitizeReply('👍👍'), '')

section('soft truncation cuts at a sentence, never mid-word')

check(
  'the last full sentence that fits',
  softTruncate('One. Two. Three that is far too long.', 12),
  'One. Two.',
)
check('short text is untouched', softTruncate('One. Two.', 100), 'One. Two.')
check(
  'no sentence in range falls back to a word boundary',
  softTruncate('a rambling clause with no full stop at all', 20),
  'a rambling clause',
)

section('the verdict keeps its three lines')

check(
  'three lines, blank lines dropped, numbering stripped',
  sanitizeVerdict('1. You landed it.\n\n2. The slip was speed.\n\n3. Say this tomorrow.'),
  ['You landed it.', 'The slip was speed.', 'Say this tomorrow.'],
)
check(
  'never more than three',
  sanitizeVerdict('one\ntwo\nthree\nfour').length,
  3,
)
check(
  'the fallback names itself a fallback',
  fallbackVerdict('genteel').includes('The transcript is above'),
  true,
)

/* -------------------------------- Transcript -------------------------------- */

section('what the model receives')

const round = [
  { role: 'assistant' as const, kind: 'opener' as const, content: 'So the payments lead has answered.' },
  { role: 'user' as const, kind: 'reply' as const, content: 'It was very genteel of him.' },
  { role: 'assistant' as const, kind: 'reply' as const, content: 'Genteel is the manner, not the speed.' },
]

const built = buildConversation(round)

check('the anchor goes first', built[0], { role: 'user', content: SCENE_ANCHOR })
check('the array always starts with a user turn', built[0].role, 'user')
check('four elements for a three-message round', built.length, 4)
check(
  'roles alternate',
  built.map((m) => m.role),
  ['user', 'assistant', 'user', 'assistant'],
)
check('the anchor is byte-stable', SCENE_ANCHOR, '(The scene begins. You speak first.)')

// A repaired round could carry one. The model must never see its own
// out-of-character assessment as a conversational turn.
const withVerdict = [
  ...round,
  { role: 'assistant' as const, kind: 'verdict' as const, content: 'You landed it.' },
]
check('the verdict is filtered out', buildConversation(withVerdict).length, 4)

check(
  'the plain-text rendering labels the learner Them',
  renderTranscript(round),
  'You: So the payments lead has answered.\n' +
    'Them: It was very genteel of him.\n' +
    'You: Genteel is the manner, not the speed.',
)
check('the verdict is excluded there too', renderTranscript(withVerdict).includes('You landed it.'), false)
check('a round the user never answered', hasUserTurns([round[0]]), false)
check('a round they did', hasUserTurns(round), true)

/* -------------------------------- Scenarios --------------------------------- */

section('the fallback scenario bank')

const ENTRY_A = '9f1c7f4e-1a2b-4c3d-8e5f-6a7b8c9d0e1f'
const ENTRY_B = '00000000-1111-2222-3333-444444444444'

check('deterministic across calls', pickScenario(ENTRY_A, 1), pickScenario(ENTRY_A, 1))
check('always in the bank', SCENARIOS.includes(pickScenario(ENTRY_A, 1)), true)
// A second round on the same word must land somewhere new, or practising twice
// is the same conversation twice.
check(
  'round 2 differs from round 1',
  pickScenario(ENTRY_A, 1) !== pickScenario(ENTRY_A, 2),
  true,
)
check(
  'two different words differ',
  pickScenario(ENTRY_A, 1) !== pickScenario(ENTRY_B, 1),
  true,
)

/* --------------------------------- Prompts ---------------------------------- */

section('system prompt interpolation')

const FULL = buildProfileContext({
  occupation: 'backend engineer at a bank',
  interests: ['football', 'film & tv'],
  currentlyConsuming: 'Bleak House',
  englishContexts: ['work'],
  chatTone: 'playful',
})

const EMPTY = buildProfileContext(null)

const system = chatSystemPrompt({
  term: 'genteel',
  partOfSpeech: 'adjective',
  definition: 'polite and refined, often in a slightly forced way',
  profileBlock: FULL.text,
  toneDirective: FULL.toneDirective,
  profileIsEmpty: FULL.isEmpty,
  scenarioBlock: SCENARIO_BLOCK_OPENING,
})

check('the term appears in the rules', system.includes('Never define or explain "genteel"'), true)
check('the definition is marked reference-only', system.includes('for your reference only'), true)
// F7's guard is the sentence that stops a model handed `unknown:` from opening
// by asking the user to go and fill in a profile.
check('F7 guard appears verbatim', system.includes(PROFILE_CONTEXT_GUARD), true)
check('the profile block is embedded whole', system.includes(FULL.text), true)
check('the tone is one instruction line', system.includes(`manner: ${FULL.toneDirective}`), true)
check('the opener scenario block is in', system.includes(SCENARIO_BLOCK_OPENING), true)
check('and the underway one is not', system.includes(SCENARIO_BLOCK_UNDERWAY), false)
// Rule 2 forbids the model these words; the prompt itself may name them, but
// the empty-profile note must not invent a biography instead.
check('the full-profile branch omits the empty note', system.includes('You know nothing at all about them'), false)

const systemEmpty = chatSystemPrompt({
  term: 'genteel',
  partOfSpeech: null,
  definition: 'polite and refined',
  profileBlock: EMPTY.text,
  toneDirective: EMPTY.toneDirective,
  profileIsEmpty: EMPTY.isEmpty,
  scenarioBlock: SCENARIO_BLOCK_OPENING,
})

check('an empty profile gets the do-not-invent note', systemEmpty.includes('do not invent facts about their life'), true)
check('a null part of speech degrades to "unknown"', systemEmpty.includes('part of speech: unknown'), true)
check('the default tone is patient', EMPTY.tone, 'patient')

section('opener prompt')

const scenario = pickScenario(ENTRY_A, 1)

const openerFull = chatOpenerPrompt({
  term: 'genteel',
  profileIsEmpty: false,
  fallbackScenario: scenario,
})
const openerEmpty = chatOpenerPrompt({
  term: 'genteel',
  profileIsEmpty: true,
  fallbackScenario: scenario,
})

check('with a profile, the bank is the escape hatch', openerFull.includes('If none of them will carry this word'), true)
check('without one, it is the instruction', openerEmpty.includes('because you know nothing about them'), true)
check('and it names no profile detail', openerEmpty.includes('their job, one interest'), false)
check('both carry the scenario text', [openerFull, openerEmpty].every((p) => p.includes(scenario)), true)
check('both forbid a greeting', [openerFull, openerEmpty].every((p) => p.includes('Never "hi"')), true)

section('verdict prompt')

const verdict = verdictPrompt({
  term: 'genteel',
  partOfSpeech: 'adjective',
  definition: 'polite and refined',
  transcript: renderTranscript(round),
})

check('the transcript is embedded', verdict.includes('Them: It was very genteel of him.'), true)
check('exactly three lines are asked for', verdict.includes('Exactly three lines'), true)
check('and no praise', verdict.includes('no praise'), true)

/* ------------------------------ The day boundary ---------------------------- */

section("the cost guard's day boundary is the user's, not the server's")

// Jakarta is UTC+7 with no DST: local midnight is 17:00 the previous day, UTC.
check(
  'Asia/Jakarta',
  startOfLocalDayUtc('2026-08-09', 'Asia/Jakarta').toISOString(),
  '2026-08-08T17:00:00.000Z',
)
check('UTC is its own inverse', startOfLocalDayUtc('2026-08-09', 'UTC').toISOString(), '2026-08-09T00:00:00.000Z')
// The two-pass offset lookup exists for exactly these two days a year.
check(
  'New York in winter (EST, -5)',
  startOfLocalDayUtc('2026-01-15', 'America/New_York').toISOString(),
  '2026-01-15T05:00:00.000Z',
)
check(
  'New York in summer (EDT, -4)',
  startOfLocalDayUtc('2026-07-15', 'America/New_York').toISOString(),
  '2026-07-15T04:00:00.000Z',
)
check(
  'the spring-forward day itself',
  startOfLocalDayUtc('2026-03-08', 'America/New_York').toISOString(),
  '2026-03-08T05:00:00.000Z',
)
check(
  'and the autumn one',
  startOfLocalDayUtc('2026-11-01', 'America/New_York').toISOString(),
  '2026-11-01T04:00:00.000Z',
)
check(
  'a zone ahead of the date line',
  startOfLocalDayUtc('2027-01-01', 'Pacific/Auckland').toISOString(),
  '2026-12-31T11:00:00.000Z',
)

/* ---------------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`)
  process.exit(1)
}
console.log('\nAll chat assertions passed.')
