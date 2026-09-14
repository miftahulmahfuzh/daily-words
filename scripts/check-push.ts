/**
 * Executable assertions for every pure decision phase 1 of F30 makes.
 *
 * Run with:  npm run push:check
 *
 * There is no test runner in this project, so these are plain assertions in a
 * file that exits non-zero — the same shape as `check-share.ts` and
 * `check-journal.ts`. Nothing here touches the database, the network or the
 * environment, and that is not a convenience: the two modules it reads are the
 * ones that decide *when* a stranger's phone lights up and *what* it says, and
 * both were written import-free precisely so this could be proved rather than
 * sampled.
 *
 * Four of the sections below are worth more than the rest:
 *
 *   1. **The derivation.** `[7, 9, 11, 13, 15, 17, 19]` is asserted, but so is
 *      `deriveReminderSlots` against triples that are *not* the shipped three —
 *      because with the shipped three an exclusive and an inclusive bound agree,
 *      and a derivation tested only on the input it was written for is untested.
 *   2. **The catch-up matrix.** All 24 local hours against all 128 subsets of
 *      the seven slots, asserted as properties rather than as a table of
 *      expected answers: at most one send per tick, never a slot the clock has
 *      not reached, never one already delivered, and `{slot} ∪ superseded`
 *      exactly equal to what is outstanding. This is what stops an outage from
 *      becoming a burst of four notifications at 15:01.
 *   3. **The deck's cycle.** Coprimality per band, seven distinct lines on each
 *      of four hundred consecutive days, every line used, and a whole-day repeat
 *      period of 176 days.
 *   4. **The secret grep, written as a property.** Every file under `src/` that
 *      names `VAPID_PRIVATE_KEY` or `CRON_SECRET` begins with
 *      `import 'server-only'` — so neither literal can reach a client bundle.
 *      Not a list of sanctioned filenames: `lib/push/send.ts` and the tick route
 *      both name one legitimately, and a list would need editing by every phase
 *      that adds a reader.
 *
 * The database half — the unique index, the cascade, the 410 sweep — is
 * `npm run push:db`. Whether the copy is worth reading is a human's judgement
 * against the register in `reminders.ts`'s own doc comment.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import {
  deriveReminderSlots,
  dueSlot,
  isReminderSlot,
  REMINDER_EVERY_HOURS,
  REMINDER_FIRST_HOUR,
  REMINDER_SLOTS,
  REMINDER_UNTIL_HOUR,
} from '../src/lib/push/schedule'
import {
  bandForSlot,
  reminderByKey,
  reminderFor,
  REMINDER_BANDS,
  REMINDER_BODY_MAX,
  REMINDER_EPOCH,
  REMINDER_LINES,
  REMINDER_TITLE_MAX,
} from '../src/lib/push/reminders'
import { addLocalDays, isLocalDate } from '../src/lib/time/local-date'

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

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

/* ------------------------- The user's three numbers ------------------------- */

section('the schedule is derived from the sentence, not typed out')

check('first hour', REMINDER_FIRST_HOUR, 7)
check('step', REMINDER_EVERY_HOURS, 2)
check('window bound', REMINDER_UNTIL_HOUR, 20)
check('seven slots', [...REMINDER_SLOTS], [7, 9, 11, 13, 15, 17, 19])
check('and 20:00 is a bound, not a slot', REMINDER_SLOTS.includes(20), false)
check('nor is 21:00', REMINDER_SLOTS.includes(21), false)
check('the array is frozen', Object.isFrozen(REMINDER_SLOTS), true)

/**
 * With the shipped triple an exclusive bound and an inclusive one agree — no
 * two-hour step from 07:00 lands on 20:00 at all — so asserting only
 * `deriveReminderSlots(7, 2, 20)` proves nothing about the `<`. These triples
 * separate them, and cover the two degenerate inputs that would otherwise loop
 * forever or run off the clock.
 */
check('an exclusive bound really is exclusive', deriveReminderSlots(8, 2, 20), [8, 10, 12, 14, 16, 18])
check('a step that lands on the bound stops short', deriveReminderSlots(0, 4, 20), [0, 4, 8, 12, 16])
check('hourly', deriveReminderSlots(7, 1, 11), [7, 8, 9, 10])
check('a single slot', deriveReminderSlots(7, 2, 8), [7])
check('an empty window', deriveReminderSlots(20, 2, 20), [])
check('a zero step does not hang', deriveReminderSlots(7, 0, 20), [])
check('a negative step does not hang', deriveReminderSlots(7, -2, 20), [])
check('a fractional step is refused', deriveReminderSlots(7, 1.5, 20), [])
check('an hour past the clock is refused', deriveReminderSlots(24, 2, 30), [])
check('and the derivation never runs past 23:00', deriveReminderSlots(20, 2, 99), [20, 22])

section('isReminderSlot narrows to a member and nothing shaped like one')

check('7 is a slot', isReminderSlot(7), true)
check('19 is a slot', isReminderSlot(19), true)
check('8 is not', isReminderSlot(8), false)
check('20 is not', isReminderSlot(20), false)
check('"7" is not', isReminderSlot('7'), false)
check('7.0 is, because it is 7', isReminderSlot(7.0), true)
check('7.5 is not', isReminderSlot(7.5), false)
check('NaN is not', isReminderSlot(NaN), false)
check('null is not', isReminderSlot(null), false)

/* ------------------------------ The catch-up rule ---------------------------- */

section('dueSlot — the greatest reached slot that has not been delivered')

check('before the first slot, nothing', dueSlot({ localHour: 6, delivered: [] }), null)
check('at 07:00 on a clean day', dueSlot({ localHour: 7, delivered: [] }), { slot: 7, superseded: [] })
check('at 08:00, still the 07:00 line', dueSlot({ localHour: 8, delivered: [] }), { slot: 7, superseded: [] })
check('once it has gone out, nothing', dueSlot({ localHour: 8, delivered: [7] }), null)
check('at 09:00 the next one is due', dueSlot({ localHour: 9, delivered: [7] }), { slot: 9, superseded: [] })

/**
 * The outage. Six hours of missed ticks must produce **one** notification and
 * three closed slots, not four notifications in the same minute.
 */
check(
  'a six-hour gap sends once and passes over the rest',
  dueSlot({ localHour: 15, delivered: [7] }),
  { slot: 15, superseded: [9, 11, 13] },
)
check(
  'a whole morning missed',
  dueSlot({ localHour: 19, delivered: [] }),
  { slot: 19, superseded: [7, 9, 11, 13, 15, 17] },
)
check('after the last slot, nothing new', dueSlot({ localHour: 23, delivered: [...REMINDER_SLOTS] }), null)
check('and a tick at 22:00 with 19:00 undelivered still catches up', dueSlot({ localHour: 22, delivered: [7, 9, 11, 13, 15, 17] }), { slot: 19, superseded: [] })

section('and the same rule, as properties, over every hour and every subset')

const subsets: number[][] = []
for (let mask = 0; mask < 1 << REMINDER_SLOTS.length; mask++) {
  subsets.push(REMINDER_SLOTS.filter((_, i) => (mask >> i) & 1))
}
check('128 subsets of seven slots', subsets.length, 128)

let cases = 0
const violations: string[] = []
for (let hour = 0; hour <= 23; hour++) {
  for (const delivered of subsets) {
    cases++
    const done = new Set(delivered)
    const outstanding = REMINDER_SLOTS.filter((s) => s <= hour && !done.has(s))
    const got = dueSlot({ localHour: hour, delivered })
    const label = `h=${hour} d=[${delivered}]`
    if (outstanding.length === 0) {
      if (got !== null) violations.push(`${label}: expected null`)
      continue
    }
    if (got === null) {
      violations.push(`${label}: expected a slot`)
      continue
    }
    if (got.slot !== outstanding[outstanding.length - 1]) violations.push(`${label}: not the greatest`)
    if (got.slot > hour) violations.push(`${label}: slot past the clock`)
    if (done.has(got.slot)) violations.push(`${label}: already delivered`)
    if (!REMINDER_SLOTS.includes(got.slot)) violations.push(`${label}: not a slot`)
    if (got.superseded.some((s) => s >= got.slot)) violations.push(`${label}: superseded not earlier`)
    if (got.superseded.some((s) => done.has(s))) violations.push(`${label}: superseded already delivered`)
    if (JSON.stringify([...got.superseded, got.slot]) !== JSON.stringify(outstanding)) {
      violations.push(`${label}: the union is not what is outstanding`)
    }
  }
}
check('24 hours x 128 subsets', cases, 24 * 128)
check('no violation anywhere in the matrix', violations.slice(0, 5), [])

/**
 * A tick never sends twice. Stated as its own assertion because it is the
 * sentence a reader wants to find, and because "returns one slot" is the shape
 * of the type rather than a property of the rule.
 */
check(
  'every answer is at most one notification',
  subsets.every((d) => {
    const got = dueSlot({ localHour: 23, delivered: d })
    return got === null || typeof got.slot === 'number'
  }),
  true,
)

section('and garbage in the arguments buys silence, never a 03:00 notification')

check('NaN', dueSlot({ localHour: NaN, delivered: [] }), null)
check('negative', dueSlot({ localHour: -1, delivered: [] }), null)
check('Infinity is just "after every slot"', dueSlot({ localHour: Infinity, delivered: [] }), { slot: 19, superseded: [7, 9, 11, 13, 15, 17] })
check('a fractional hour floors naturally', dueSlot({ localHour: 7.9, delivered: [] }), { slot: 7, superseded: [] })
check('duplicates in delivered', dueSlot({ localHour: 9, delivered: [7, 7, 7] }), { slot: 9, superseded: [] })
check('values that are not slots at all', dueSlot({ localHour: 9, delivered: [8, 20, -3, NaN] }), { slot: 9, superseded: [7] })
check('an empty iterable', dueSlot({ localHour: 7, delivered: new Set<number>() }), { slot: 7, superseded: [] })

/* --------------------------------- The deck --------------------------------- */

section('the bands partition the schedule, and each one cycles')

check('three bands', REMINDER_BANDS.map((b) => b.name), ['morning', 'afternoon', 'evening'])
check(
  'their slots concatenate to exactly REMINDER_SLOTS, in order',
  REMINDER_BANDS.flatMap((b) => [...b.slots]),
  [...REMINDER_SLOTS],
)
check(
  'so no slot belongs to two bands',
  new Set(REMINDER_BANDS.flatMap((b) => [...b.slots])).size,
  REMINDER_SLOTS.length,
)
check('bandForSlot is total over the schedule', REMINDER_SLOTS.filter((s) => bandForSlot(s) === null), [])
check('and null outside it', [8, 20, 0, -1].filter((s) => bandForSlot(s) !== null), [])

/**
 * The coprimality, asserted per band rather than as three literal numbers, so
 * adding a line to a sub-deck fails here rather than silently halving the deck.
 */
for (const band of REMINDER_BANDS) {
  check(
    `${band.name}: gcd(${band.slots.length} slots, ${band.lines.length} lines) is 1`,
    gcd(band.slots.length, band.lines.length),
    1,
  )
  check(`${band.name}: more lines than slots`, band.lines.length > band.slots.length, true)
}

section('every written line obeys the copy rules')

check('forty-three lines', REMINDER_LINES.length, 43)
check('and the flattened list is the bands', REMINDER_LINES.length, REMINDER_BANDS.reduce((n, b) => n + b.lines.length, 0))

const keys = REMINDER_LINES.map((l) => l.key)
const titles = REMINDER_LINES.map((l) => l.title)
const bodies = REMINDER_LINES.map((l) => l.body)

check('keys are distinct', new Set(keys).size, keys.length)
check('keys are [a-z0-9_]', keys.filter((k) => !/^[a-z0-9_]+$/.test(k)), [])
check('keys name their band', keys.filter((k) => !/^(morning|afternoon|evening)_/.test(k)), [])
check('titles are distinct', new Set(titles).size, titles.length)
check('bodies are distinct', new Set(bodies).size, bodies.length)
check('reminderByKey round-trips every one', keys.filter((k) => reminderByKey(k)?.key !== k), [])
check('and answers null for a key that is not in the deck', reminderByKey('morning_nope'), null)

check(`no title over ${REMINDER_TITLE_MAX} characters`, titles.filter((t) => t.length > REMINDER_TITLE_MAX), [])
check(`no body over ${REMINDER_BODY_MAX} characters`, bodies.filter((b) => b.length > REMINDER_BODY_MAX), [])
check('nothing is empty or untrimmed', REMINDER_LINES.filter((l) => l.title !== l.title.trim() || l.body !== l.body.trim() || !l.title || !l.body), [])

/**
 * Title and body are tested **separately**, never concatenated. Joining them
 * invents phrases neither one contains — "Quiet again" followed by "Today’s
 * card…" reads as "again today" to a regex, and a false positive in a rule
 * about tone is how a check script stops being believed.
 */
const fields = REMINDER_LINES.flatMap((l) => [l.title, l.body])
check('eighty-six strings in the deck', fields.length, REMINDER_LINES.length * 2)
check('no exclamation marks', fields.filter((c) => c.includes('!')), [])
check("no straight apostrophes — the app draws ’ everywhere", fields.filter((c) => c.includes("'")), [])
check('no emoji or other non-Latin-1 punctuation', fields.filter((c) => !/^[\x20-\x7E’—]*$/.test(c)), [])

/**
 * [R11]'s rule, applied where it matters most. `/profile` refuses to say "your
 * streak is at risk" to a user who opened the app on purpose; a notification
 * says it to someone who did not.
 */
const THREAT = [/streak/i, /\brisk\b/i, /last chance/i, /miss(ing|ed)?\s+out/i, /don’t lose/i, /keep it going/i, /before it’s gone/i, /running out/i]
check('nothing threatens a streak', fields.filter((c) => THREAT.some((re) => re.test(c))), [])

/** Nothing counts, congratulates or implies a history — day one and day four hundred read alike. */
const HISTORY = [/\byour \d/i, /\bwell done\b/i, /\bgreat\b/i, /\bproud\b/i, /so far this (week|month|year)/i, /\bagain today\b/i]
check('nothing credits the reader with anything', fields.filter((c) => HISTORY.some((re) => re.test(c))), [])

/* --------------------------- reminderFor, as a function ---------------------- */

section('reminderFor is a pure function of (date, slot)')

check('the epoch is a real date', isLocalDate(REMINDER_EPOCH), true)
check('total over the schedule', REMINDER_SLOTS.filter((s) => reminderFor('2026-09-14', s) === null), [])
check('null outside it', [8, 20, 0].filter((s) => reminderFor('2026-09-14', s) !== null), [])

check(
  'the same arguments give the same line, twice',
  JSON.stringify(reminderFor('2026-09-14', 13)),
  JSON.stringify(reminderFor('2026-09-14', 13)),
)
check(
  'and the identical object, because the deck is frozen data',
  reminderFor('2026-09-14', 13) === reminderFor('2026-09-14', 13),
  true,
)
check('a date before the epoch does not index off the front', reminderFor('2019-03-04', 7) !== null, true)
check('nor a long way before it', reminderFor('1970-01-01', 19) !== null, true)

section('and no two of a day’s seven reminders read alike, for 400 days')

const DAYS = 400
let date = REMINDER_EPOCH
const used = new Set<string>()
const dayShapes: string[] = []
let clashes = 0
for (let i = 0; i < DAYS; i++) {
  const day = REMINDER_SLOTS.map((s) => reminderFor(date, s)!)
  if (new Set(day.map((l) => l.key)).size !== REMINDER_SLOTS.length) clashes++
  day.forEach((l) => used.add(l.key))
  dayShapes.push(day.map((l) => l.key).join('|'))
  date = addLocalDays(date, 1)
}
check(`${DAYS} days with a repeated line`, clashes, 0)
check('every line in the deck is used', used.size, REMINDER_LINES.length)

/**
 * lcm(16, 16, 11) = 176. The whole day's seven-line shape repeats twice a year
 * and no sooner — which is the number the sub-deck sizes were chosen to produce.
 */
const period = dayShapes.findIndex((s, i) => i > 0 && s === dayShapes[0])
check('the whole-day shape repeats after 176 days', period, 176)
check('and there are exactly 176 distinct day shapes in 400', new Set(dayShapes).size, 176)

/* ------------------------------- The greps ---------------------------------- */

section('the secrets stay out of the client, and the modules stay importable')

const SRC = join(import.meta.dirname, '..', 'src')

/** Every `.ts`/`.tsx` under `src/`, so a grep is an assertion and not a habit. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name)
    if (e.isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(e.name) ? [full] : []
  })
}

const files = sourceFiles(SRC)
const rel = (f: string) => relative(SRC, f).split(sep).join('/')

/**
 * **The property, not a filename list.** The first draft of this asserted "at
 * most one file, and if there is one it is `lib/env.ts`", which is wrong and
 * would fail the build: `lib/push/send.ts` names `VAPID_PRIVATE_KEY` because it
 * is the file that signs with it, and `app/api/push/tick/route.ts` names
 * `CRON_SECRET` because it is the file that compares it. A list of sanctioned
 * filenames would have to be edited by every phase that adds a legitimate
 * reader, which is how a check stops being believed.
 *
 * What is actually worth guaranteeing is that neither literal can reach a
 * client bundle, and the mechanism for that in this codebase is one line:
 * **every file under `src/` that names either secret begins with
 * `import 'server-only'`**, which turns a client import into a build error
 * rather than a leak. That is a real safety claim, it is true at every point in
 * the phase sequence (it is vacuously true now, before Phase 2 exists), and it
 * is false the moment a component reads a secret.
 *
 * The tick route carries the import even though a route handler is already
 * server-side — redundant, deliberate and honest, so this assertion can be a
 * property rather than a one-file exemption. See Phase 4's Step 2.
 */
const SERVER_ONLY = /^import\s+["']server-only["']/m
for (const name of ['VAPID_PRIVATE_KEY', 'CRON_SECRET']) {
  const naming = files
    .map((f) => [rel(f), readFileSync(f, 'utf8')] as const)
    .filter(([, text]) => text.includes(name))
  check(
    `every file under src/ naming ${name} is server-only`,
    naming.filter(([, text]) => !SERVER_ONLY.test(text)).map(([r]) => r),
    [],
  )
}

/**
 * The other half, and the one that would otherwise be assumed: the browser half
 * of this feature must never become server-only, because it ships to the phone.
 * Asserted here rather than in Phase 2 because this file is the one that runs
 * offline with no environment, and because a check that only exists in the
 * phase that created the hazard is a check nobody re-reads.
 */
const clientPath = join(SRC, 'lib', 'push', 'client.ts')
if (existsSync(clientPath)) {
  const clientSrc = readFileSync(clientPath, 'utf8')
  check('lib/push/client.ts is not server-only', SERVER_ONLY.test(clientSrc), false)
  check(
    'and names neither secret',
    ['VAPID_PRIVATE_KEY', 'CRON_SECRET'].filter((n) => clientSrc.includes(n)),
    [],
  )
}

/**
 * `schedule.ts` imports nothing at all, and `reminders.ts` imports only
 * `lib/time/local-date` — not even its sibling, so the deck's slot arrays are
 * held to the schedule by the assertion above rather than by a reference. That
 * is what lets the tick, a client bundle and this offline process read the same
 * two files, and it is the property that quietly dies the first time somebody
 * reaches for zod here.
 */
const scheduleSrc = readFileSync(join(SRC, 'lib', 'push', 'schedule.ts'), 'utf8')
const remindersSrc = readFileSync(join(SRC, 'lib', 'push', 'reminders.ts'), 'utf8')
const importsIn = (src: string) => [...src.matchAll(/^\s*import\s[^\n]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]).sort()

check('schedule.ts imports nothing', importsIn(scheduleSrc), [])
check('reminders.ts imports only the date module', importsIn(remindersSrc), ['@/lib/time/local-date'])
check('neither is server-only', [scheduleSrc, remindersSrc].filter((s) => s.includes("'server-only'") || s.includes('"server-only"')).length, 0)

/**
 * The day-boundary contract, enforced on the one directory most likely to break
 * it. `lib/time/local-date.ts` is the only file allowed an `Intl.DateTimeFormat`
 * or any date arithmetic; a `new Date()` in `lib/push/` would compute 07:00 in
 * Vercel's UTC and send the morning line at lunchtime in Jakarta, silently.
 */
const pushCode = files
  .filter((f) => rel(f).startsWith('lib/push/'))
  .map((f) => [rel(f), stripComments(readFileSync(f, 'utf8'))] as const)
// Comments are stripped first, and they have to be: both modules *name* the
// trap in prose so the next reader knows why it is not there.
check('lib/push/ constructs no Intl.DateTimeFormat', pushCode.filter(([, c]) => c.includes('Intl.DateTimeFormat')).map(([r]) => r), [])
check('lib/push/ serialises no instant as a day', pushCode.filter(([, c]) => c.includes('toISOString')).map(([r]) => r), [])
check('and the two pure modules hold no clock', [scheduleSrc, remindersSrc].filter((s) => stripComments(s).includes('new Date')).length, 0)

/** Strips block and line comments, so a grep reads code rather than prose. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/* ---------------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`)
  process.exit(1)
}
console.log('\nAll push assertions passed.')
