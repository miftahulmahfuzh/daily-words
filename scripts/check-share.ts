/**
 * Executable assertions for every pure decision F16 makes.
 *
 * Run with:  npm run share:check
 *
 * There is no test runner in this project, so these are plain assertions in a
 * file that exits non-zero — the same shape as `check-journal.ts` and
 * `check-nav.ts`. Nothing here touches the database, the network or the
 * environment.
 *
 * Three of the sections below are worth more than the rest:
 *
 *   1. **`isPublicSharePath`.** It is the function the auth middleware calls,
 *      and the `startsWith('/s')` version of it would silently exempt
 *      `/settings`, `/stats` and `/signin` from the sign-in gate. That bug is
 *      invisible in a browser — the author is signed in — and it is caught here.
 *   2. **The DTO allowlist.** Asserted by exact key list *and* by grepping the
 *      serialised payload for poison markers, so a newly added `vocab_entries`
 *      column is a failure rather than a pass.
 *   3. **The claim cookie.** Fed tampered signatures, expired stamps, three
 *      dots, none, and a 10 kB string.
 *
 * The database half — the CHECK constraint, the anonymous read, revoke by the
 * wrong user, the cascade from a deleted word — is `npm run share:db`.
 */
import { createHmac } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { VocabEntry } from '../src/lib/db/types'
import {
  isPublicSharePath,
  isShareSlug,
  isShareWordIndex,
  shareClaimHref,
  shareHref,
  SHARE_ACTION_LABEL,
  SHARE_CLAIM_COOKIE,
  SHARE_CLAIM_COOKIE_OPTIONS,
  SHARE_CLAIM_TTL_SECONDS,
  SHARE_COPIED_NOTICE,
  SHARE_COPY_LABEL,
  SHARE_EXAMPLES_MAX,
  SHARE_GONE_BODY,
  SHARE_GONE_TITLE,
  SHARE_PRACTISE_LABEL,
  SHARE_REVOKE_LABEL,
  SHARE_SLUG_ALPHABET,
  SHARE_SLUG_BITS,
  SHARE_SLUG_BYTES,
  SHARE_SLUG_LENGTH,
} from '../src/lib/share/policy'
import { newShareSlug } from '../src/lib/share/slug'
import { createShareSchema, sharedPayloadSchema } from '../src/lib/share/schemas'
import { toSharedWordPayload } from '../src/lib/share/serialize'
import { decodeClaimIntent, encodeClaimIntent } from '../src/lib/share/intent'

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

/* ------------------------------ Slug generation ----------------------------- */

section('the slug is 80 bits of base32, and the arithmetic is exact')

check('the alphabet has 32 symbols', SHARE_SLUG_ALPHABET.length, 32)
check('every symbol is distinct', new Set(SHARE_SLUG_ALPHABET).size, 32)
check(
  'i, l, o and u are excluded',
  ['i', 'l', 'o', 'u'].filter((c) => SHARE_SLUG_ALPHABET.includes(c)),
  [],
)
check('the alphabet is lowercase', SHARE_SLUG_ALPHABET, SHARE_SLUG_ALPHABET.toLowerCase())
check('length', SHARE_SLUG_LENGTH, 16)
check('bits', SHARE_SLUG_BITS, 80)
check('and 80 bits is exactly 10 bytes, so there is no modulo step', SHARE_SLUG_BYTES, 10)

const DRAWS = 10_000
const slugs = Array.from({ length: DRAWS }, () => newShareSlug())

check('every draw matches the pattern', slugs.every((s) => isShareSlug(s)), true)
check(`${DRAWS} draws are ${DRAWS} distinct values`, new Set(slugs).size, DRAWS)

/**
 * The assertion no eyeball makes: a truncated alphabet or a stray `% 31` still
 * produces plausible-looking slugs, and the only visible symptom is one symbol
 * that never appears.
 */
const drawn = new Set(slugs.join(''))
check(
  'every one of the 32 symbols is reachable',
  [...SHARE_SLUG_ALPHABET].filter((c) => !drawn.has(c)),
  [],
)

section('isShareSlug rejects everything that is not one')

const S = slugs[0]

const NOT_SLUGS: [string, unknown][] = [
  ['the empty string', ''],
  ['one short', 'abcdefghjkmnpqr'],
  ['one long', 'abcdefghjkmnpqrst'],
  ['uppercase', 'ABCDEFGHJKMNPQRS'],
  ['containing i', 'ibcdefghjkmnpqrs'],
  ['containing l', 'lbcdefghjkmnpqrs'],
  ['containing o', 'obcdefghjkmnpqrs'],
  ['containing u', 'ubcdefghjkmnpqrs'],
  ['a uuid', '3f2504e0-4f89-41d3-9a0c-0305e82c3301'],
  ['a traversal', '../../etc/passwd'],
  ['a trailing slash', `${S.slice(0, 15)}/`],
  ['a newline injection', `${S}\n${S}`],
  ['a number', 1234567890123456],
  ['null', null],
  ['undefined', undefined],
]
for (const [label, value] of NOT_SLUGS) check(label, isShareSlug(value), false)
check('and a real one passes', isShareSlug(S), true)

/* --------------------------------- The URLs -------------------------------- */

section('share hrefs')

check('shareHref', shareHref(S), `/s/${S}`)
check('shareClaimHref', shareClaimHref(S), `/s/${S}/claim`)
check('the share path has exactly two segments', shareHref(S).split('/').length - 1, 2)
check('the claim path nests under it', shareClaimHref(S).startsWith(`${shareHref(S)}/`), true)
check(
  'neither is protocol-relative',
  [shareHref(S), shareClaimHref(S)].filter((h) => h.startsWith('//')),
  [],
)

section('isPublicSharePath — the function the middleware calls')

const PUBLIC = ['/s', `/s/${S}`, `/s/${S}/claim`, `/s/${S}/`, '/s/anything-at-all']
for (const p of PUBLIC) check(`exempt: ${p}`, isPublicSharePath(p), true)

/**
 * The `startsWith('/s')` bug, caught offline. Every one of these would be
 * exempted from the auth gate by a prefix test, and `/signin` is the one that
 * makes it a security bug rather than a future one.
 */
const PRIVATE = [
  '/signin',
  '/settings',
  '/stats',
  '/search',
  '/s-omething',
  '/some',
  '/today',
  '/vocab',
  '/vocab/s/1',
  '/',
  '',
  '/s/abc/claim/extra',
  '/s/abc/practise',
  '//s/abc',
]
for (const p of PRIVATE) check(`gated: ${p || '(empty)'}`, isPublicSharePath(p), false)

/* ------------------------------ The DTO allowlist --------------------------- */

section('toSharedWordPayload is an allowlist, not an omission list')

/**
 * Every column a stranger must never see carries a poison marker, so the payload
 * is asserted two independent ways: by exact key list — a *new* key is a failure,
 * where an omission-based test would let the next added field through — and by
 * grepping the serialised JSON.
 *
 * `examples` deliberately carries no marker: it is published, so a marker there
 * would be asserting the opposite of the rule.
 */
const POISONED: VocabEntry = {
  id: 'LEAK-id',
  userId: 'LEAK-user',
  term: 'genteel',
  source: 'manual',
  status: 'mastered',
  partOfSpeech: 'adjective',
  pronunciation: '/dʒɛnˈtiːl/',
  definition: 'polite in a way that is trying too hard',
  examples: ['His genteel manners fooled nobody.', 42 as unknown as string],
  enrichmentStatus: 'ready',
  suggestedCorrection: 'LEAK-correction',
  enrichmentError: 'LEAK-error',
  enrichmentAttempts: 3,
  lastShownOn: 'LEAK-date',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  masteredAt: new Date('2026-02-02T00:00:00.000Z'),
}

const payload = toSharedWordPayload(POISONED)

check(
  'the key list is exact',
  Object.keys(payload).sort(),
  ['definition', 'examples', 'kind', 'partOfSpeech', 'pronunciation', 'term'],
)
check('and nothing marked LEAK survives', JSON.stringify(payload).includes('LEAK'), false)
check('the sharer is not in there either', JSON.stringify(payload).includes('mastered'), false)
check('kind', payload.kind, 'vocab')
check('term', payload.term, 'genteel')
check('pronunciation', payload.pronunciation, '/dʒɛnˈtiːl/')
check('partOfSpeech', payload.partOfSpeech, 'adjective')
check('definition', payload.definition, 'polite in a way that is trying too hard')
check('non-strings are dropped from examples', payload.examples, [
  'His genteel manners fooled nobody.',
])

check(
  'nulls stay null rather than becoming empty strings',
  toSharedWordPayload({
    ...POISONED,
    pronunciation: null,
    partOfSpeech: null,
    definition: null,
  }),
  {
    kind: 'vocab',
    term: 'genteel',
    pronunciation: null,
    partOfSpeech: null,
    definition: null,
    examples: ['His genteel manners fooled nobody.'],
  },
)

check(
  'a null examples column is an empty array, never a crash',
  toSharedWordPayload({ ...POISONED, examples: null }).examples,
  [],
)

check(
  `examples are capped at ${SHARE_EXAMPLES_MAX}`,
  toSharedWordPayload({ ...POISONED, examples: ['a', 'b', 'c', 'd', 'e'] }).examples,
  ['a', 'b', 'c'],
)

section('sharedPayloadSchema is the second, independent net on read')

const parsed = sharedPayloadSchema.safeParse({
  kind: 'vocab',
  term: 'genteel',
  pronunciation: null,
  partOfSpeech: null,
  definition: null,
  examples: [],
  email: 'someone@example.com',
  userId: 'LEAK-user',
})
check('an unknown key still parses', parsed.success, true)
check(
  'and is stripped rather than rendered',
  parsed.success ? Object.keys(parsed.data).sort() : null,
  ['definition', 'examples', 'kind', 'partOfSpeech', 'pronunciation', 'term'],
)
check('an unknown kind is refused', sharedPayloadSchema.safeParse({ kind: 'card' }).success, false)
check('a payload of null is refused', sharedPayloadSchema.safeParse(null).success, false)
check('a payload of a string is refused', sharedPayloadSchema.safeParse('genteel').success, false)
check(
  'four examples are refused rather than truncated on read',
  sharedPayloadSchema.safeParse({
    kind: 'vocab',
    term: 'x',
    pronunciation: null,
    partOfSpeech: null,
    definition: null,
    examples: ['a', 'b', 'c', 'd'],
  }).success,
  false,
)

section('createShareSchema')

const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
check('a vocab share', createShareSchema.safeParse({ entityType: 'vocab', id: UUID }).success, true)
check(
  'a non-uuid id',
  createShareSchema.safeParse({ entityType: 'vocab', id: 'genteel' }).success,
  false,
)
// F18's two arms do not exist yet, and the route cannot be talked into them.
check(
  'a card share is refused until F18 adds the arm',
  createShareSchema.safeParse({ entityType: 'card', id: UUID }).success,
  false,
)

/* ------------------------------ The claim cookie ---------------------------- */

section('the dw_claim cookie contract')

check('name', SHARE_CLAIM_COOKIE, 'dw_claim')
check('httpOnly', SHARE_CLAIM_COOKIE_OPTIONS.httpOnly, true)
// The attribute that fails silently and completely: a Strict cookie is not sent
// on the top-level navigation back from accounts.google.com, which is exactly
// when it is read.
check('sameSite is lax, never strict', SHARE_CLAIM_COOKIE_OPTIONS.sameSite, 'lax')
check('path is /', SHARE_CLAIM_COOKIE_OPTIONS.path, '/')
check('maxAge matches the signed TTL', SHARE_CLAIM_COOKIE_OPTIONS.maxAge, SHARE_CLAIM_TTL_SECONDS)
check('and the TTL is ten minutes', SHARE_CLAIM_TTL_SECONDS, 600)

const SECRET = 'a-fixture-secret-that-is-not-the-real-one'
const OTHER_SECRET = 'a-different-fixture-secret'
const NOW = 1_800_000_000

const round = (intent: { slug: string; w: number | null; tz: string | null }) =>
  decodeClaimIntent(encodeClaimIntent(intent, SECRET, NOW), SECRET, NOW)

check('a vocab intent round-trips', round({ slug: S, w: null, tz: 'Asia/Jakarta' }), {
  slug: S,
  w: null,
  tz: 'Asia/Jakarta',
  exp: NOW + SHARE_CLAIM_TTL_SECONDS,
})
// [C2]: F18 shares a card, so the claim has to say which of the six words.
check('a card intent carries the word index', round({ slug: S, w: 4, tz: null }), {
  slug: S,
  w: 4,
  tz: null,
  exp: NOW + SHARE_CLAIM_TTL_SECONDS,
})
check(
  'no zone stays null rather than becoming a default',
  round({ slug: S, w: null, tz: null })?.tz,
  null,
)
check(
  'an alias Intl.supportedValuesOf omits is still a zone',
  round({ slug: S, w: null, tz: 'Asia/Calcutta' })?.tz,
  'Asia/Calcutta',
)
check(
  'a zone that does not resolve degrades to null, it does not drop the claim',
  round({ slug: S, w: null, tz: 'Not/AZone' })?.tz,
  null,
)
check(
  'and neither does a 500-character one',
  round({ slug: S, w: null, tz: 'x'.repeat(500) })?.tz,
  null,
)

const VALID = encodeClaimIntent({ slug: S, w: 2, tz: 'Europe/London' }, SECRET, NOW)
const [, VALID_PAYLOAD, VALID_SIG] = VALID.split('.')

const HOSTILE: [string, unknown][] = [
  ['undefined', undefined],
  ['a number', 12345],
  ['the empty string', ''],
  ['no dots', 'v1'],
  ['two parts', `v1.${VALID_PAYLOAD}`],
  ['four parts', `${VALID}.extra`],
  ['a bumped version', `v2.${VALID_PAYLOAD}.${VALID_SIG}`],
  ['a 10 kB string', 'x'.repeat(10_000)],
  ['//evil.com', '//evil.com'],
  ['/\\evil.com', '/\\evil.com'],
  ['https://evil.com', 'https://evil.com'],
  ['javascript:alert(1)', 'javascript:alert(1)'],
  ['%2f%2fevil.com', '%2f%2fevil.com'],
  ['a header injection', '\r\nLocation: https://evil.com'],
  ['a flipped payload byte', `v1.${flip(VALID_PAYLOAD)}.${VALID_SIG}`],
  ['a flipped signature byte', `v1.${VALID_PAYLOAD}.${flip(VALID_SIG)}`],
  ['a truncated signature', VALID.slice(0, -4)],
  [
    'signed with another secret',
    encodeClaimIntent({ slug: S, w: null, tz: null }, OTHER_SECRET, NOW),
  ],
]
for (const [label, value] of HOSTILE) {
  check(`decode rejects ${label}`, decodeClaimIntent(value, SECRET, NOW), null)
}

/** One base64url character changed, which is one byte of the decoded value. */
function flip(s: string): string {
  return (s[0] === 'A' ? 'B' : 'A') + s.slice(1)
}

check(
  'an expired cookie is refused, at exp',
  decodeClaimIntent(VALID, SECRET, NOW + SHARE_CLAIM_TTL_SECONDS),
  null,
)
check(
  'and is live one second before it',
  decodeClaimIntent(VALID, SECRET, NOW + SHARE_CLAIM_TTL_SECONDS - 1)?.slug,
  S,
)

/**
 * Cookies whose payload is well-formed but whose *fields* are not. Only
 * reachable by someone who already holds the secret, so these are a regression
 * guard on the field validation rather than a threat model: the property is that
 * `decodeClaimIntent` never hands its caller a slug it did not check.
 */
function signFields(fields: string): string {
  const p = Buffer.from(fields, 'utf8').toString('base64url')
  return `v1.${p}.${createHmac('sha256', SECRET).update(`v1.${p}`).digest('base64url')}`
}
const forge = (fields: string) => decodeClaimIntent(signFields(fields), SECRET, NOW)

const EXP = NOW + 60
check('a signed but non-slug slug', forge(`../../etc/passwd|||${EXP}`), null)
check('a signed slug of the wrong length', forge(`abc||Asia/Jakarta|${EXP}`), null)
check('three fields instead of four', forge(`${S}||${EXP}`), null)
check('five fields', forge(`${S}|||${EXP}|extra`), null)
check('a word index of 0', forge(`${S}|0||${EXP}`), null)
check('a word index of 7', forge(`${S}|7||${EXP}`), null)
check('a fractional word index', forge(`${S}|1.5||${EXP}`), null)
check('a non-numeric exp', forge(`${S}|||later`), null)
check('an exp in scientific notation', forge(`${S}|||1e99`), null)
check('and a well-formed forgery still decodes', forge(`${S}|6|Europe/London|${EXP}`), {
  slug: S,
  w: 6,
  tz: 'Europe/London',
  exp: EXP,
})
check(
  'the word index bounds',
  [1, 6, 0, 7, 1.5, '3'].map((v) => isShareWordIndex(v)),
  [true, true, false, false, false, false],
)

/* ----------------------------------- Copy ----------------------------------- */

section('the copy register')

const COPY = [
  SHARE_ACTION_LABEL,
  SHARE_COPY_LABEL,
  SHARE_REVOKE_LABEL,
  SHARE_COPIED_NOTICE,
  SHARE_PRACTISE_LABEL,
  SHARE_GONE_TITLE,
  SHARE_GONE_BODY,
]
check('none of it exclaims', COPY.some((s) => s.includes('!')), false)
check('none of it asks "are you sure"', COPY.some((s) => /are you sure/i.test(s)), false)
// The user's own words for the CTA, and the same label the private page uses.
check('the CTA is the label /vocab/[id] already carries', SHARE_PRACTISE_LABEL, 'Practise this word')
/**
 * D13: a revoked slug and a slug that never existed read identically. Anything
 * naming "revoked" or "expired" here would be a live oracle on the slug space.
 */
check(
  'the 404 copy does not distinguish revoked from never-existed',
  /revok|expir|delet|remov/i.test(`${SHARE_GONE_TITLE} ${SHARE_GONE_BODY}`),
  false,
)

/* --------------------------- Structural assertions -------------------------- */

section('structural assertions — the ones a convention alone would not keep')

const SRC = join(import.meta.dirname, '..', 'src')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name)
    if (e.isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(e.name) ? [full] : []
  })
}

const files = sourceFiles(SRC)
const rel = (f: string) => relative(SRC, f).split(sep).join('/')
const body = new Map(files.map((f) => [rel(f), readFileSync(f, 'utf8')]))

/**
 * D7's departure is one function wide. `getShareBySlug` is the only read in the
 * application that takes no user id, and its safety rests on the payload being a
 * snapshot rather than a join — so the query file must not name a user-owned
 * table. A grep, not a habit.
 */
const sharesQuery = body.get('lib/db/queries/shares.ts') ?? ''
check('queries/shares.ts exists', sharesQuery.length > 0, true)
check(
  'and it joins no user-owned table',
  ['vocabEntries', 'journalEntries', 'dailyCards', 'profiles', 'userStats', 'users'].filter(
    (t) => new RegExp(`\\b${t}\\b(?![^\\n]*\\*/)`).test(stripComments(sharesQuery)),
  ),
  [],
)

/**
 * D12: exactly one home for share URLs. `lib/vocab/links.ts` is left untouched,
 * and no other file builds a `/s/` path from a template literal — the same rule
 * `nav:check` enforces for `from=`.
 */
const buildsSharePath = [...body.entries()]
  .filter(([path]) => path !== 'lib/share/policy.ts')
  .filter(([, text]) => /['"`]\/s\/\$\{/.test(text))
  .map(([path]) => path)
check('only policy.ts builds a /s/ path', buildsSharePath, [])
check(
  'and no share URL leaked into lib/vocab/links.ts',
  /shareHref|shareClaimHref|['"`]\/s\//.test(body.get('lib/vocab/links.ts') ?? ''),
  false,
)

/**
 * `node:crypto` is what makes `slug.ts` and `intent.ts` server-only. A client
 * component importing either becomes a build error rather than a leak, and this
 * asserts the marker is actually there.
 */
for (const f of ['lib/share/slug.ts', 'lib/share/intent.ts', 'lib/db/queries/shares.ts']) {
  check(`${f} is server-only`, (body.get(f) ?? '').includes("import 'server-only'"), true)
}
/**
 * And the mirror image: `policy.ts` is imported by the middleware (Edge) and by
 * a client component, so it must stay dependency-free.
 */
check(
  'policy.ts imports nothing at all',
  /^\s*import\s/m.test(body.get('lib/share/policy.ts') ?? ''),
  false,
)

/**
 * The single highest-risk edit in the feature (D5): the middleware must call the
 * predicate, and it must not have grown an `s` inside the matcher's negative
 * lookahead, which would also exempt `/signin`.
 */
// Comments stripped, because that file *documents* the wrong version of the
// matcher in order to warn about it, and a grep over prose would read the
// warning as the bug.
const mw = stripComments(body.get('middleware.ts') ?? '')
check('the middleware calls isPublicSharePath', mw.includes('isPublicSharePath('), true)
check('and no bare `s` joined the matcher alternation', /\(\?!api\|s\|/.test(mw), false)

/** Strips block and line comments, so a grep reads code rather than prose. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/* ---------------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`)
  process.exit(1)
}
console.log('\nAll share assertions passed.')
