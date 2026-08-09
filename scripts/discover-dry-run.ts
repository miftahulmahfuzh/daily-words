/**
 * F8's prompt against the live model. **No database, no writes.**
 *
 *   npm run discover:dry-run
 *   npm run discover:dry-run -- --profile empty
 *   npm run discover:dry-run -- --avoid genteel,laconic,winnow --count 5
 *   npm run discover:dry-run -- --runs 3
 *
 * One model call per run. This is the tool for F8's prompt-tuning pass, and the
 * prompt is the feature: the dedup fold and the routes are testable offline
 * (`npm run discover:check`), but "are these words worth having?" is a judgement
 * only a human reading the output can make.
 *
 * What to look for:
 *   - five *different roots*, not five endings of two words
 *   - a spread of parts of speech, not five adjectives
 *   - words a well-read adult meets in a newspaper or a novel — not jargon, not
 *     archaic curiosities, not `ubiquitous`
 *   - glosses of eight words or fewer, in the register of a dictionary
 *   - with `--profile full`, words that visibly answer *that* reader; run it
 *     twice with different fixtures and compare. Two identical sets mean the
 *     profile block is not reaching the model.
 */
import { runPrompt } from '../src/lib/llm/json'
import {
  buildSuggestWordsPrompt,
  SUGGESTION_COUNT,
  suggestWordsPrompt,
} from '../src/lib/llm/prompts/suggest-words'
import { buildProfileContext, type ProfileContextInput } from '../src/lib/profile/context'
import { buildKnownKeySet, isKnown, isSingleWord } from '../src/lib/vocab/dedup'

const args = process.argv.slice(2)

function flag(name: string, fallback: string): string {
  const at = args.indexOf(`--${name}`)
  return at === -1 ? fallback : (args[at + 1] ?? fallback)
}

const FIXTURES: Record<string, ProfileContextInput | null> = {
  full: {
    occupation: 'backend engineer',
    interests: ['19th-century novels', 'cycling', 'Indonesian history'],
    currentlyConsuming: 'Bleak House by Charles Dickens',
    englishContexts: ['work', 'reading', 'writing'],
    chatTone: 'blunt',
  },
  partial: { currentlyConsuming: 'The Three-Body Problem' },
  // Every question skipped — F7 permits it, and this is the case that must
  // still produce plausible general-register words rather than an empty LEARNER
  // heading and an invented reader.
  empty: {},
  none: null,
}

const which = flag('profile', 'full')
const fixture = FIXTURES[which]
if (fixture === undefined) {
  console.error(`unknown --profile ${which}. one of: ${Object.keys(FIXTURES).join(', ')}`)
  process.exit(1)
}

const avoid = flag('avoid', '')
  .split(',')
  .map((t) => t.trim())
  .filter(Boolean)

const count = Number(flag('count', String(SUGGESTION_COUNT)))
const runs = Number(flag('runs', '1'))

const profile = fixture === null ? null : buildProfileContext(fixture)
const known = buildKnownKeySet(avoid)

async function once(n: number) {
  const input = { profile, avoid, count }

  if (n === 1) {
    console.log('─'.repeat(72))
    console.log(buildSuggestWordsPrompt(input))
    console.log('─'.repeat(72))
  }

  const result = await runPrompt(suggestWordsPrompt, input)

  if (!result.ok) {
    console.error(`\nrun ${n}: ${result.error.kind} — ${result.error.detail}`)
    return
  }

  console.log(`\nrun ${n}`)
  for (const item of result.data.suggestions) {
    // The same two filters the service applies, so the dry run shows what the
    // user would actually have been offered rather than what the model said.
    const verdict = !isSingleWord(item.term)
      ? 'DROPPED shape'
      : isKnown(known, item.term)
        ? 'DROPPED known'
        : item.gloss.length > 80
          ? 'truncated'
          : ''
    const pos = `(${item.partOfSpeech})`.padEnd(12)
    console.log(`  ${item.term.padEnd(18)} ${pos} ${item.gloss}${verdict ? `   ← ${verdict}` : ''}`)
  }
}

async function main() {
  console.log(`profile: ${which}   avoid: ${avoid.length} term(s)   count: ${count}`)
  for (let n = 1; n <= runs; n++) await once(n)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
