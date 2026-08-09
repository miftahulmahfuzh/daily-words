/**
 * Executable assertions for every pure decision F11 makes.
 *
 * Run with:  npm run nav:check
 *
 * There is no test runner in this project, so these are plain assertions in a
 * file that exits non-zero — the same shape as `check-dates.ts`,
 * `check-discover.ts` and `check-chat.ts`. Nothing here touches the database,
 * the network or the environment.
 *
 * The single most important assertion is §3's: an unrecognised `?from=` must
 * land on the Collection, identically to no `?from=` at all. Everything else in
 * this feature is a label; that one is the difference between a back link and
 * an open redirect.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  BACK_TARGETS,
  backTarget,
  DEFAULT_ORIGIN,
  isWordOrigin,
  parseOrigin,
  vocabChatHref,
  vocabDetailHref,
  vocabListHref,
  type WordOrigin,
} from '../src/lib/vocab/links'

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

const ORIGINS: readonly WordOrigin[] = ['today', 'collection', 'discover', 'new']

/* ------------------- §1 the whitelist is closed and total ------------------- */

section('§1 the whitelist is closed and total')

check('exactly four origins, in D4 order', Object.keys(BACK_TARGETS), [
  'today',
  'collection',
  'discover',
  'new',
])

// A whitelist entry is the only thing that could ever produce an off-site back
// link, so it is the thing to assert about.
for (const origin of ORIGINS) {
  const { href, label } = BACK_TARGETS[origin]
  check(`${origin} href is a site-relative path`, href.startsWith('/') && !href.startsWith('//'), true)
  check(
    `${origin} href carries no scheme, backslash or whitespace`,
    !/[:\\\s]/.test(href),
    true,
  )
  check(`${origin} label is non-empty`, label.length > 0, true)
}

check('today label', BACK_TARGETS.today.label, 'Today')
check('collection label', BACK_TARGETS.collection.label, 'Collection')
check('discover label', BACK_TARGETS.discover.label, 'Discover')
check('new label', BACK_TARGETS.new.label, 'Add a word')

// D5: the Discover entry is built through `vocabListHref`, never as a literal,
// so a change to the tab param cannot leave the back link behind.
check(
  'discover href === vocabListHref({ tab: "discover" })',
  BACK_TARGETS.discover.href,
  vocabListHref({ tab: 'discover' }),
)
check('collection href === vocabListHref()', BACK_TARGETS.collection.href, vocabListHref())
check('the default origin is collection', DEFAULT_ORIGIN, 'collection')

/* ------------------ §2 parseOrigin accepts four strings -------------------- */

section('§2 parseOrigin accepts exactly four strings')

for (const origin of ORIGINS) {
  check(`${origin} round-trips to itself`, parseOrigin(origin), origin)
  check(`isWordOrigin("${origin}")`, isWordOrigin(origin), true)
}

check('undefined', parseOrigin(undefined), null)

/** Near misses. Case, whitespace and plurals are all rejections, not repairs. */
for (const value of ['', 'Today', 'TODAY', ' today', 'today ', 'todays', 'collections']) {
  check(`near miss ${JSON.stringify(value)}`, parseOrigin(value), null)
}

/**
 * D2, the reason `isWordOrigin` uses `Object.hasOwn`. Each of these is truthy
 * under `value in BACK_TARGETS` or `BACK_TARGETS[value]`, and a naive lookup
 * would hand `backTarget` something that is not a `BackTarget`.
 */
for (const value of ['toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf']) {
  check(`prototype key ${JSON.stringify(value)}`, parseOrigin(value), null)
}

/** Hostile. None of these is a union member, so none can become an href. */
for (const value of [
  'https://evil.example',
  '//evil.example',
  'http://evil.example',
  '/today',
  '../../etc/passwd',
  'javascript:alert(1)',
  'data:text/html,x',
  'today?x=1',
  'today#f',
  '%2Ftoday',
  'today%00',
  'x'.repeat(4096),
]) {
  const shown = value.length > 32 ? `<${value.length} chars>` : JSON.stringify(value)
  check(`hostile ${shown}`, parseOrigin(value), null)
}

/**
 * An array is discarded, never sampled.
 *
 * Note this is no longer the repeated-param case: measured on Next 15.5.23, a
 * repeated `from` reaches the page as the *first* occurrence, a string, so this
 * branch is defensive rather than load-bearing. See `parseOrigin`'s comment.
 */
check('array ["today"]', parseOrigin(['today']), null)
check('array ["today","discover"]', parseOrigin(['today', 'discover']), null)
check('array []', parseOrigin([]), null)

/* ------------------- §3 backTarget is total and defaults -------------------- */

section('§3 backTarget is total and defaults correctly')

const COLLECTION = { href: '/vocab', label: 'Collection' }

check('backTarget(null)', backTarget(null), COLLECTION)
check('backTarget(undefined)', backTarget(undefined), COLLECTION)
check('backTarget("collection")', backTarget('collection'), COLLECTION)
check('backTarget(parseOrigin("nonsense"))', backTarget(parseOrigin('nonsense')), COLLECTION)
check(
  'backTarget(parseOrigin("https://evil.example"))',
  backTarget(parseOrigin('https://evil.example')),
  COLLECTION,
)

check('today', backTarget('today'), { href: '/today', label: 'Today' })
check('discover', backTarget('discover'), { href: '/vocab?tab=discover', label: 'Discover' })
check('new', backTarget('new'), { href: '/vocab/new', label: 'Add a word' })

// The resolver hands out a copy: a caller that mutates its target must not be
// able to rewrite where every later visitor goes.
const mutated = backTarget('today')
mutated.href = '/evil'
mutated.label = 'Evil'
check('the whitelist survives a mutated return value', backTarget('today'), {
  href: '/today',
  label: 'Today',
})

/* ---------------------------- §4 the href builders -------------------------- */

section('§4 the href builders')

check('vocabDetailHref("abc")', vocabDetailHref('abc'), '/vocab/abc')
check('vocabDetailHref("abc", null)', vocabDetailHref('abc', null), '/vocab/abc')
check('vocabDetailHref("abc", "today")', vocabDetailHref('abc', 'today'), '/vocab/abc?from=today')
check('vocabChatHref("abc")', vocabChatHref('abc'), '/vocab/abc/chat')
check(
  'vocabChatHref("abc", "discover")',
  vocabChatHref('abc', 'discover'),
  '/vocab/abc/chat?from=discover',
)

/**
 * The round trip, as a property over all four origins. If this holds the
 * feature works; if it fails, no amount of UI is going to save it.
 */
function readFrom(href: string): string | null {
  return new URL(href, 'http://x').searchParams.get('from')
}

for (const origin of ORIGINS) {
  check(`detail round trip ${origin}`, parseOrigin(readFrom(vocabDetailHref('id', origin)) ?? undefined), origin)
  check(`chat round trip ${origin}`, parseOrigin(readFrom(vocabChatHref('id', origin)) ?? undefined), origin)
}

/* ------------------------------ §5 the chat hop ----------------------------- */

section('§5 the chat hop (D6), simulated')

/** Today → word → chat → word, exactly as the three pages compose it. */
function chatChain(seed: string | undefined) {
  const detail = vocabDetailHref('id', parseOrigin(seed))
  const chat = vocabChatHref('id', parseOrigin(readFrom(detail) ?? undefined))
  const back = vocabDetailHref('id', parseOrigin(readFrom(chat) ?? undefined))
  return backTarget(parseOrigin(readFrom(back) ?? undefined))
}

check('Today → word → chat → word → back', chatChain('today'), { href: '/today', label: 'Today' })
check('Discover → word → chat → word → back', chatChain('discover'), {
  href: '/vocab?tab=discover',
  label: 'Discover',
})
check('no origin → word → chat → word → back', chatChain(undefined), COLLECTION)
check('garbage → word → chat → word → back', chatChain('//evil.example'), COLLECTION)

/* ------------------------- §6 one place builds the param -------------------- */

section('§6 exactly one file builds the from= param')

/**
 * The mechanical version of `links.ts`'s own warning — "a template literal in a
 * fifth file is how it drifts". Consumers read the value as a property
 * (`.from`), not as the literal `from=`, so they do not trip this.
 *
 * It is a plain substring scan, so a *comment* spelling the param out trips it
 * too. That is deliberate rather than tolerated: the cheap check is the one
 * that gets kept, and the fix is to write `from` without the `=` in prose.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(path)
  }
  return out
}

const root = join(import.meta.dirname, '..')
const offenders = walk(join(root, 'src'))
  .filter((path) => readFileSync(path, 'utf8').includes('from='))
  .map((path) => relative(root, path).replaceAll('\\', '/'))
  .sort()

check('files containing the literal `from=`', offenders, ['src/lib/vocab/links.ts'])

/* ---------------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`)
  process.exit(1)
}
console.log('\nAll navigation-origin assertions passed.')
