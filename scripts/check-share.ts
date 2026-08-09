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
  clipForMeta,
  isPublicSharePath,
  isShareNextDestination,
  isShareSlug,
  isShareWordIndex,
  nextDestinationHref,
  parseSharePosition,
  shareCardMetaDescription,
  shareCardMetaTitle,
  shareClaimHref,
  sharedCardWordHref,
  shareHref,
  shareJournalMetaDescription,
  shareJournalMetaTitle,
  SHARE_ACTION_LABEL,
  SHARE_CLAIM_COOKIE,
  SHARE_CLAIM_COOKIE_OPTIONS,
  SHARE_CLAIM_TTL_SECONDS,
  SHARE_COPIED_NOTICE,
  SHARE_COPY_LABEL,
  SHARE_EXAMPLES_MAX,
  SHARE_GONE_BODY,
  SHARE_GONE_TITLE,
  SHARE_JOURNAL_CTA_LABEL,
  SHARE_JOURNAL_META_TITLE_MAX,
  SHARE_NEXT_COOKIE,
  SHARE_NEXT_COOKIE_OPTIONS,
  SHARE_NEXT_TTL_SECONDS,
  SHARE_PRACTISE_LABEL,
  SHARE_REVOKE_LABEL,
  SHARE_SLUG_ALPHABET,
  SHARE_SLUG_BITS,
  SHARE_SLUG_BYTES,
  SHARE_SLUG_LENGTH,
} from '../src/lib/share/policy'
import { newShareSlug } from '../src/lib/share/slug'
import { createShareSchema, sharedPayloadSchema } from '../src/lib/share/schemas'
import {
  toSharedCardPayload,
  toSharedJournalPayload,
  toSharedWordPayload,
} from '../src/lib/share/serialize'
import { cardFreshness, freshnessLabel, toCardListWords } from '../src/lib/share/card-view'
import { resolveClaimWord } from '../src/lib/share/claim'
import {
  decodeClaimIntent,
  decodeNextDestination,
  encodeClaimIntent,
  encodeNextDestination,
} from '../src/lib/share/intent'
import type { CardForShare } from '../src/lib/db/queries/cards'
import type { JournalEntry } from '../src/lib/db/types'

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
check('sharedCardWordHref', sharedCardWordHref(S, 3), `/s/${S}/3`)
check(
  'none of the three is protocol-relative',
  [shareHref(S), shareClaimHref(S), sharedCardWordHref(S, 1)].filter((h) =>
    h.startsWith('//'),
  ),
  [],
)

/* ---------------------------- F18: the position ---------------------------- */

section('parseSharePosition — the 1..6 boundary, and the security-relevant line')

/**
 * A table with the input printed on failure, because a silent widening here is
 * the whole risk: `parseSharePosition` is what stands between a URL segment and
 * an index into somebody's card, and every rejection below is a string a real
 * client will eventually send.
 */
const POSITIONS: [string, number | null][] = [
  ['1', 1],
  ['2', 2],
  ['3', 3],
  ['4', 4],
  ['5', 5],
  ['6', 6],
  ['0', null],
  ['7', null],
  ['-1', null],
  ['1.5', null],
  // `Number()` accepts all four of these. The regex is what refuses them, and
  // a leading zero accepted here would make two URLs for one word.
  ['01', null],
  ['+1', null],
  [' 1', null],
  ['1e0', null],
  ['', null],
  ['1;--', null],
  ['3f2504e0-4f89-41d3-9a0c-0305e82c3301', null],
  ['1 OR 1=1', null],
  ['٣', null],
]
for (const [input, expected] of POSITIONS) {
  check(`parseSharePosition(${JSON.stringify(input)})`, parseSharePosition(input), expected)
}
check('a number is not a string', parseSharePosition(3), null)
check('null', parseSharePosition(null), null)
check('undefined', parseSharePosition(undefined), null)

section('isPublicSharePath — the function the middleware calls')

const PUBLIC = [
  '/s',
  `/s/${S}`,
  `/s/${S}/claim`,
  `/s/${S}/`,
  '/s/anything-at-all',
  /**
   * F18's nested word route, and the reason this list grew. A middleware that
   * still recognised only `claim` would bounce every row of a shared card to
   * /signin — invisibly, because the author testing it is signed in.
   */
  `/s/${S}/1`,
  `/s/${S}/6`,
  `/s/${S}/3/`,
  /**
   * Position-**shaped**, not position-valid. `/s/<slug>/5` on a four-word card
   * is a URL a real person will follow, and it must reach the share's own
   * one-sentence 404 rather than /signin — the same rule this function already
   * keeps for a slug that does not exist. `parseSharePosition` in the route is
   * what decides which of these name a word.
   */
  `/s/${S}/0`,
  `/s/${S}/7`,
  `/s/${S}/01`,
  `/s/${S}/99`,
]
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
  // The enumeration stayed closed when F18 widened it. A fourth segment that is
  // not `claim` and not digit-shaped is still gated.
  `/s/${S}/1.5`,
  `/s/${S}/-1`,
  `/s/${S}/1e0`,
  `/s/${S}/100`,
  `/s/${S}/3f2504e0-4f89-41d3-9a0c-0305e82c3301`,
  `/s/${S}/1/2`,
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

/* --------------------- F18: the card and journal payloads ------------------- */

section('toSharedCardPayload is an allowlist too, and it drops every uuid')

/** Every uuid-shaped string, anywhere, under any key. The deep-walk assertion. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i

function uuidsIn(value: unknown, path = '$'): string[] {
  if (typeof value === 'string') return UUID_RE.test(value) ? [path] : []
  if (Array.isArray(value)) return value.flatMap((v, i) => uuidsIn(v, `${path}[${i}]`))
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => uuidsIn(v, `${path}.${k}`))
  }
  return []
}

check(
  'the walker finds a uuid nested anywhere',
  uuidsIn({ a: [{ b: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' }] }),
  ['$.a[0].b'],
)

/**
 * The leak this serialiser exists to prevent. `toDailyCardItemView` — one import
 * away — returns `{ id: item.entryId }`, so reusing it would hand a stranger six
 * real vocab uuids on one tap of Share.
 */
const POISONED_CARD: CardForShare = {
  id: 'ba5eba11-0000-4000-8000-000000000001',
  cardDate: '2026-08-09',
  items: [
    {
      position: 1,
      entryId: 'ba5eba11-0000-4000-8000-000000000002',
      term: 'genteel',
      partOfSpeech: 'adjective',
      pronunciation: '/d\u0292\u025Bn\u02C8ti\u02D0l/',
      definition: 'polite in a way that is trying too hard',
      examples: ['His genteel manners fooled nobody.', 42, 'b', 'c', 'd'],
      enrichmentStatus: 'ready',
    },
    {
      position: 2,
      entryId: 'ba5eba11-0000-4000-8000-000000000003',
      term: 'truculent',
      partOfSpeech: null,
      pronunciation: null,
      // Still enriching: the definition must be dropped rather than published.
      definition: 'LEAK-pending-definition',
      examples: ['LEAK-pending-example'],
      enrichmentStatus: 'pending',
    },
  ],
}

const cardPayload = toSharedCardPayload(POISONED_CARD)

check(
  'the key list is exact',
  Object.keys(cardPayload).sort(),
  ['cardDate', 'dateLabel', 'kind', 'words'],
)
check(
  "and so is a word's",
  Object.keys(cardPayload.words[0]).sort(),
  ['definition', 'examples', 'partOfSpeech', 'position', 'pronunciation', 'term'],
)
check('no uuid survives, anywhere', uuidsIn(cardPayload), [])
check('and neither does a pending definition', JSON.stringify(cardPayload).includes('LEAK'), false)
check('a pending word keeps its term', cardPayload.words[1].term, 'truculent')
check('but its definition is null, which draws the skeleton', cardPayload.words[1].definition, null)
check('and its examples are empty', cardPayload.words[1].examples, [])
check('positions come from the row, not the array index', cardPayload.words.map((w) => w.position), [1, 2])
check(
  `examples are capped at ${SHARE_EXAMPLES_MAX} and non-strings dropped`,
  cardPayload.words[0].examples,
  ['His genteel manners fooled nobody.', 'b', 'c'],
)

check(
  'a seventh word is sliced off defensively',
  toSharedCardPayload({
    ...POISONED_CARD,
    items: Array.from({ length: 9 }, (_, i) => ({ ...POISONED_CARD.items[0], position: i + 1 })),
  }).words.length,
  6,
)

section('toSharedJournalPayload — three fields, and two load-bearing absences')

const POISONED_ENTRY: JournalEntry = {
  id: 'ba5eba11-0000-4000-8000-000000000004',
  userId: 'ba5eba11-0000-4000-8000-000000000005',
  text: 'A house with no rice smells of nothing at all.',
  sourceNote: 'LEAK-in-Ibus-kitchen',
  insight: {
    meaning: 'An absence is quieter than a presence, and only the one who had it notices.',
    whenItApplies: ['Moving out for the first time.', 'A habit noticed only once it stops.'],
  },
  insightStatus: 'ready',
  insightRequestedAt: new Date('2026-08-03T02:00:00.000Z'),
  createdAt: new Date('2026-08-03T02:00:00.000Z'),
  updatedAt: new Date('2026-08-04T02:00:00.000Z'),
}

const journalPayload = toSharedJournalPayload(POISONED_ENTRY, 'Asia/Jakarta')

check(
  'the key list is exact',
  Object.keys(journalPayload).sort(),
  ['dateLabel', 'insight', 'kind', 'text'],
)
/**
 * Named individually even though the equality above subsumes them, because these
 * three are exactly what a future edit adds back "just for the date line".
 */
check('no sourceNote', 'sourceNote' in journalPayload, false)
check('no id', 'id' in journalPayload, false)
check('no updatedAt', 'updatedAt' in journalPayload, false)
check('and no uuid anywhere', uuidsIn(journalPayload), [])
check('nothing marked LEAK survives', JSON.stringify(journalPayload).includes('LEAK'), false)
check('the insight crosses — the user asked for exactly this', journalPayload.insight !== null, true)

check(
  'a pending entry shares as a bare line rather than a button nobody can press',
  toSharedJournalPayload({ ...POISONED_ENTRY, insightStatus: 'pending' }, 'Asia/Jakarta').insight,
  null,
)
check(
  'and so does one whose stored insight will not parse',
  toSharedJournalPayload(
    { ...POISONED_ENTRY, insight: { nonsense: true } as unknown as JournalEntry['insight'] },
    'Asia/Jakarta',
  ).insight,
  null,
)

section('the day is the OWNER\'s, not the reader\'s')

/**
 * `created_at` is 02:00 UTC on the 3rd, which is 09:00 on the 3rd in Jakarta and
 * 19:00 on the **2nd** in Los Angeles. `toJournalEntryDto` would use the reader's
 * zone; on a public page the reader is a stranger, so the day has to come from
 * the owner's — resolved once, at share time.
 */
check(
  'Jakarta',
  toSharedJournalPayload(POISONED_ENTRY, 'Asia/Jakarta').dateLabel,
  '3 Aug 2026',
)
check(
  'Los Angeles is a different day, and the owner decides which',
  toSharedJournalPayload(POISONED_ENTRY, 'America/Los_Angeles').dateLabel,
  '2 Aug 2026',
)

section('a card date has no offset, so every viewer reads the same string')

/**
 * The viewer-in-a-different-timezone claim, tested from the viewer's side: the
 * process TZ is moved to three zones a day apart and the label must not budge.
 * `formatLocalDateLong` pins `Intl` to UTC precisely so the weekday and month
 * are properties of the calendar date rather than of the machine reading it.
 */
const originalTZ = process.env.TZ
for (const tz of ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
  process.env.TZ = tz
  check(`TZ=${tz}`, toSharedCardPayload(POISONED_CARD).dateLabel, '9 August 2026')
}
process.env.TZ = originalTZ

section('freshness is a bounded shape, and it never says "Today"')

check('the sharer\'s own day', cardFreshness('2026-08-09', '2026-08-09'), { kind: 'today' })
check('the day after', cardFreshness('2026-08-09', '2026-08-10'), { kind: 'yesterday' })
check('a week later', cardFreshness('2026-08-09', '2026-08-16'), { kind: 'older', daysAgo: 7 })
/**
 * A viewer whose local date is *behind* the sharer's — Los Angeles reading a
 * card made in Kiritimati. There is no honest label for a card from tomorrow, so
 * it reads as today rather than as a negative number.
 */
check('a card from ahead of the viewer', cardFreshness('2026-08-10', '2026-08-09'), { kind: 'today' })
check(
  'the labels are lower case and none of them is the word Today',
  ['today', 'yesterday', 'older'].map((k) =>
    freshnessLabel(k === 'older' ? { kind: 'older', daysAgo: 3 } : { kind: k as 'today' }),
  ),
  ['today', 'yesterday', '3 days ago'],
)

section('the list view narrows, and carries no uuid even by accident')

const listWords = toCardListWords(cardPayload)
check('one row per word', listWords.length, 2)
check(
  'the row id is a position, never an entry uuid',
  listWords.map((w) => w.id),
  ['p1', 'p2'],
)
check('no uuid anywhere in the rendered props', uuidsIn(listWords), [])
check(
  'and the detail fields do not ride along into the first paint',
  Object.keys(listWords[0]).sort(),
  ['definition', 'id', 'tag', 'term'],
)

section('resolveClaimWord — F18 adds an entity kind and no outcome')

const CARD_PAYLOAD = toSharedCardPayload(POISONED_CARD)
const WORD_PAYLOAD = toSharedWordPayload(POISONED)

check('a vocab share ignores w entirely', resolveClaimWord(WORD_PAYLOAD, null)?.term, 'genteel')
check('and still resolves when one is present', resolveClaimWord(WORD_PAYLOAD, 4)?.term, 'genteel')
check('a card share resolves by position', resolveClaimWord(CARD_PAYLOAD, 2)?.term, 'truculent')
check('a card share with no w resolves to nothing', resolveClaimWord(CARD_PAYLOAD, null), null)
check('a position the card does not have', resolveClaimWord(CARD_PAYLOAD, 6), null)
check('no payload at all', resolveClaimWord(null, 1), null)
check(
  'a journal share is never claimable',
  resolveClaimWord(toSharedJournalPayload(POISONED_ENTRY, 'UTC'), 1),
  null,
)
/**
 * The narrowing drops `position`, which is meaningless to a claim and must not
 * ride into the inserted row.
 */
check(
  'the resolved word is exactly a vocab payload',
  Object.keys(resolveClaimWord(CARD_PAYLOAD, 1)!).sort(),
  ['definition', 'examples', 'kind', 'partOfSpeech', 'pronunciation', 'term'],
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
check(
  'a bare kind with no fields is still refused',
  sharedPayloadSchema.safeParse({ kind: 'card' }).success,
  false,
)
check('an unknown kind is refused', sharedPayloadSchema.safeParse({ kind: 'profile' }).success, false)
check(
  "F18's card arm parses",
  sharedPayloadSchema.safeParse(cardPayload).success,
  true,
)
check(
  "and F18's journal arm",
  sharedPayloadSchema.safeParse(journalPayload).success,
  true,
)
check(
  'a word index outside 1..6 is refused on read as well as on the way in',
  sharedPayloadSchema.safeParse({
    ...cardPayload,
    words: [{ ...cardPayload.words[0], position: 7 }],
  }).success,
  false,
)
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
// F18's two arms. The route's `switch` is exhaustive over this union, so a
// fourth entity type stops that file compiling until somebody has decided what
// a stranger may see of it.
check('a card share', createShareSchema.safeParse({ entityType: 'card', id: UUID }).success, true)
check(
  'a journal share',
  createShareSchema.safeParse({ entityType: 'journal', id: UUID }).success,
  true,
)
check(
  'and a kind nobody has taught it',
  createShareSchema.safeParse({ entityType: 'profile', id: UUID }).success,
  false,
)
check(
  'a card share still needs a uuid',
  createShareSchema.safeParse({ entityType: 'card', id: '2026-08-09' }).success,
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

/* -------------------------- F18: the dw_next cookie ------------------------- */

section('the dw_next cookie — a destination, and never a path')

check('name', SHARE_NEXT_COOKIE, 'dw_next')
check('httpOnly', SHARE_NEXT_COOKIE_OPTIONS.httpOnly, true)
// The same silent failure as dw_claim: a Strict cookie is not sent on the
// top-level navigation back from accounts.google.com.
check('sameSite is lax, never strict', SHARE_NEXT_COOKIE_OPTIONS.sameSite, 'lax')
check('path is /', SHARE_NEXT_COOKIE_OPTIONS.path, '/')
check('maxAge matches the signed TTL', SHARE_NEXT_COOKIE_OPTIONS.maxAge, SHARE_NEXT_TTL_SECONDS)
// An hour, not ten minutes: this has to survive the OAuth hop *and* five
// onboarding screens typed on a phone.
check('and the TTL is an hour', SHARE_NEXT_TTL_SECONDS, 3600)

check(
  'it round-trips',
  decodeNextDestination(encodeNextDestination('journal', SECRET, NOW), SECRET, NOW),
  'journal',
)
check(
  'and expires inside its own signature',
  decodeNextDestination(
    encodeNextDestination('journal', SECRET, NOW),
    SECRET,
    NOW + SHARE_NEXT_TTL_SECONDS,
  ),
  null,
)
for (const [label, value] of [
  ['undefined', undefined],
  ['the empty string', ''],
  ['a bare symbol', 'journal'],
  ['a path', '/journal'],
  ['a 10 kB string', 'x'.repeat(10_000)],
  ['signed with another secret', encodeNextDestination('journal', OTHER_SECRET, NOW)],
] as [string, unknown][]) {
  check(`decode rejects ${label}`, decodeNextDestination(value, SECRET, NOW), null)
}

/**
 * The property the whole design rests on: **no path is ever read out of the
 * cookie.** A signed value naming a destination nobody implemented decodes to
 * null, and the only way to a href is the literal `switch`.
 */
check(
  'a signed but unknown destination decodes to nothing',
  decodeNextDestination(
    // Hand-forged with the real secret, which is the strongest attacker there is
    // here, and it still cannot name a path.
    signFields('/evil.com|' + (NOW + 60)),
    SECRET,
    NOW,
  ),
  null,
)
check(
  'the value space is exactly one symbol',
  ['journal', '/journal', 'today', '', null, 1].map((v) => isShareNextDestination(v)),
  [true, false, false, false, false, false],
)
check('and it maps through a literal', nextDestinationHref('journal'), '/journal')

/* --------------------------------- F18: metadata ---------------------------- */

section('the unfurl builders')

check('a full card', shareCardMetaTitle('9 August 2026', 6), 'Six words — 9 August 2026')
check('a card of one', shareCardMetaTitle('9 August 2026', 1), 'One word — 9 August 2026')
check('and of four', shareCardMetaTitle('9 August 2026', 4), 'Four words — 9 August 2026')
check(
  'the description is the first three terms',
  shareCardMetaDescription(['genteel', 'truculent', 'perspicacious', 'sesquipedalian']),
  'genteel, truculent, perspicacious',
)
check(
  'and never empty',
  shareCardMetaDescription([]).length > 0,
  true,
)

const LINE =
  'Ibu used to say that a house with no rice smells of nothing at all, and I did not understand her until the year I lived alone, in a city where nobody had ever met her.'

/**
 * **The journal unfurl is the line, never the insight** (D14 rule 1). A
 * machine-written paragraph in a preview card, under a person's link, with no
 * room for the "Written by the machine" line, is exactly the misattribution the
 * shared page spends its argument avoiding.
 */
check(
  'the title is a clip of the line',
  LINE.startsWith(shareJournalMetaTitle(LINE).replace('…', '')),
  true,
)
check(
  'and it is not the insight',
  shareJournalMetaTitle(LINE).includes('An absence is quieter'),
  false,
)
check(
  'the description is a longer clip of the same line',
  shareJournalMetaDescription(LINE).length <= 161,
  true,
)
check(
  'neither builder can reach a source note — it is not in the payload at all',
  'sourceNote' in journalPayload,
  false,
)
check(
  'a short line is returned whole, with no ellipsis',
  shareJournalMetaTitle('Keep going.'),
  'Keep going.',
)
check(
  'newlines collapse rather than reaching a meta tag',
  shareJournalMetaTitle('one\ntwo\n\nthree'),
  'one two three',
)
check('clipping lands on a word boundary', clipForMeta('alpha beta gamma delta', 14), 'alpha beta…')
check(
  'and a single unbreakable token is hard-clipped rather than returned whole',
  clipForMeta('a'.repeat(80), 20).length,
  21,
)
check(
  'a title never exceeds its cap by more than the ellipsis',
  shareJournalMetaTitle(LINE).length <= SHARE_JOURNAL_META_TITLE_MAX + 1,
  true,
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
  SHARE_JOURNAL_CTA_LABEL,
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
// The user's own words for F18's CTA, and it means them: nothing is prefilled,
// so the label must not promise a line.
check("F18's CTA", SHARE_JOURNAL_CTA_LABEL, 'Start your own journal')

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

/* ------------------------- F18's structural assertions ---------------------- */

/**
 * **The public DTO rule** (F18 D8). Neither public serialiser may reuse the
 * private one, and the leak is one import away in both directions:
 * `toDailyCardItemView` returns the vocab entry's uuid, and `toJournalEntryDto`
 * returns the entry uuid, the source note and the reader's-timezone date.
 */
const PUBLIC_SURFACE = [...body.keys()].filter(
  (f) =>
    f.startsWith('app/s/') ||
    f.startsWith('components/share/') ||
    (f.startsWith('lib/share/') && f !== 'lib/share/serialize.ts'),
)
check('there is a public surface to check', PUBLIC_SURFACE.length > 0, true)
for (const forbidden of ['@/lib/cards/serialize', '@/lib/journal/serialize']) {
  check(
    `nothing on the public surface imports ${forbidden}`,
    PUBLIC_SURFACE.filter((f) => (body.get(f) ?? '').includes(forbidden)),
    [],
  )
}
/**
 * `lib/share/serialize.ts` is the one exception, and only for
 * `parseStoredInsight` — reading a `jsonb` column defensively, not building a
 * DTO. Asserted narrowly so the exemption cannot widen into `toJournalEntryDto`.
 */
// Comments stripped, because that file *names* the private serialisers in order
// to explain why it does not use them, and a grep over prose reads the warning
// as the bug.
const shareSerialize = stripComments(body.get('lib/share/serialize.ts') ?? '')
check(
  'and serialize.ts borrows only parseStoredInsight from it',
  /toJournalEntryDto|toDailyCardItemView|toDuplicateMatchDto/.test(shareSerialize),
  false,
)

/**
 * A public page must never link into the `(app)` group: an anonymous visitor
 * would be bounced to /signin, and the author testing it is signed in, so it
 * renders perfectly for them.
 */
for (const forbidden of ['@/lib/vocab/links', '@/lib/auth/session', 'requireUser']) {
  check(
    `nothing under app/s/ references ${forbidden}`,
    [...body.keys()]
      .filter((f) => f.startsWith('app/s/'))
      .filter((f) => (body.get(f) ?? '').includes(forbidden)),
    [],
  )
}

/**
 * The date discipline. `grep toISOString` must not gain a hit outside the four
 * files that serialise an *instant*, and the public DTOs must construct no clock
 * and do no date arithmetic of their own — everything goes through
 * `lib/time/local-date.ts`.
 */
/**
 * The eight files `grep -rn toISOString src/` yields today, every one of them
 * serialising an **instant** rather than a day. **F18 adds none**, which is the
 * assertion: a ninth is either a new sanctioned serialiser or the day-boundary
 * contract being broken, and either way it should be a decision rather than a
 * diff nobody read.
 */
const SANCTIONED_TO_ISO = [
  'app/(app)/journal/journal-feed.tsx',
  'app/api/cards/route.ts',
  'app/api/profile/complete/route.ts',
  'lib/cards/serialize.ts',
  'lib/chat/serialize.ts',
  'lib/journal/cursor.ts',
  'lib/journal/serialize.ts',
  'lib/profile/serialize.ts',
]
check(
  'toISOString appears in exactly the eight files it did before F18',
  [...body.entries()]
    .filter(([path, text]) => text.includes('toISOString') && !SANCTIONED_TO_ISO.includes(path))
    .map(([path]) => path),
  [],
)
for (const f of ['lib/share/serialize.ts', 'lib/share/card-view.ts']) {
  const text = stripComments(body.get(f) ?? '')
  check(
    `${f} constructs no clock and does no date arithmetic`,
    /toISOString|new Intl\.DateTimeFormat|getFullYear|getMonth\(\)|getDate\(\)/.test(text),
    false,
  )
}

/**
 * **F17 D2's frozen claim path, asserted from the outside.** `claim:check` owns
 * the literal; this owns the absence of a parameterised builder, so a later
 * session cannot reintroduce the open-redirect shape F18 explicitly did not ask
 * for. The word index rides in the signed cookie instead.
 */
check(
  'no claimHref builder exists anywhere',
  [...body.entries()].filter(([, text]) => /\bclaimHref\s*[:=]\s*\(/.test(text)).map(([p]) => p),
  [],
)
/**
 * And nothing anywhere concatenates a *variable* onto it. `policy.ts` builds
 * `${CLAIM_PATH}/` for the middleware's exact-match test, which is a comparison
 * rather than a destination; what would be a bug is a slug, a position or a
 * `next` reaching a redirect target.
 */
check(
  'and nothing interpolates a value into a claim URL',
  [...body.entries()]
    .filter(([, text]) => /\$\{CLAIM_PATH\}\$\{|CLAIM_PATH\s*\+\s*[a-z]/.test(stripComments(text)))
    .map(([path]) => path),
  [],
)

/**
 * `journal-signup-actions.ts` spells the destination out as a literal rather
 * than calling the helper, because `claim:check` greps every `redirectTo:` in
 * the application and requires one — F17 D2's defence, expressed as a property.
 * This is what stops the duplication drifting.
 */
check(
  'and the sign-up action redirects to exactly that string',
  (body.get('lib/share/journal-signup-actions.ts') ?? '').includes(
    `redirectTo: '${nextDestinationHref('journal')}'`,
  ),
  true,
)

/**
 * **`(app)/layout.tsx` gains no branch for any of this** — F17's restraint, and
 * F18 keeps it. The claim and the journal signup both work by writing the state
 * the app already has rather than by teaching the gate about a new one.
 */
const appLayout = stripComments(body.get('app/(app)/layout.tsx') ?? '')
check('app/(app)/layout.tsx exists', appLayout.length > 0, true)
check(
  'and knows nothing about shares, claims or destinations',
  /share|claim|dw_next|dw_claim/i.test(appLayout),
  false,
)

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
