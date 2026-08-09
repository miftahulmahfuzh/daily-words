/**
 * Executable assertions for every rule F9 decides on its own.
 *
 * Run with:  npm run stats:check
 *
 * There is no test runner in this project — F9's plan §15.7 named that as a
 * possibility and allowed plain assertions in its place, which is also what
 * `check-dates.ts`, `check-profile.ts`, `check-chat.ts` and `check-discover.ts`
 * already are. Nothing here touches the database or the network.
 *
 * The three things worth being paranoid about, all covered below:
 *
 *  1. **"Not yet today" must never read as failure.** A user with cards on the
 *     4th–7th, asked on the 8th, has a streak of 4. Not 3, not 0, at 09:00 and
 *     at 23:50 alike.
 *  2. **`full_week` fires once per completed week**, not on every day past the
 *     seventh — [R12]. The literal reading would put ×94 on a 100-day streak.
 *  3. **Level titles are the roadmap's, character for character**, apostrophes
 *     excepted (see the note at the top of `levels.ts`).
 */
import {
  BADGE_CATALOG,
  badgeTitle,
  evaluateBadges,
  type BadgeContext,
  type BadgeKey,
} from '../src/lib/gamification/badges'
import {
  COLLECTOR_LEVELS,
  STREAK_LEVELS,
  levelCaption,
  resolveCollectorLevel,
  resolveStreakLevel,
} from '../src/lib/gamification/levels'
import {
  computeStreaks,
  runLengthEndingAt,
  toDayNumber,
} from '../src/lib/gamification/streaks'
import { toRewardLines } from '../src/lib/gamification/reveal'
import { localHour, toLocalDate, type LocalDate } from '../src/lib/time/local-date'

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

const range = (from: LocalDate, days: number): LocalDate[] => {
  const start = toDayNumber(from)
  return Array.from({ length: days }, (_, i) => {
    const d = new Date((start + i) * 86_400_000)
    return d.toISOString().slice(0, 10)
  })
}

/* ------------------------ §6.5 — the worked examples ------------------------ */

section('§6.5 streaks — the worked examples')

{
  // A. Not yet today. The case that must not look like failure.
  const a = computeStreaks(
    ['2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07'],
    '2026-08-08',
  )
  check('A  four days, asked the next morning → current 4', a.currentStreak, 4)
  check('A  longest is the same run', a.longestStreak, 4)
  check('A  totalCards', a.totalCards, 4)
  check('A  firstCardOn', a.firstCardOn, '2026-08-04')
  check('A  lastCardOn', a.lastCardOn, '2026-08-07')

  // B. Broken streak. Levels are keyed on longest, so nothing is taken away.
  const b = computeStreaks(['2026-08-01', '2026-08-02', '2026-08-03'], '2026-08-08')
  check('B  five days later → current 0', b.currentStreak, 0)
  check('B  longest survives', b.longestStreak, 3)
  check('B  the title survives too', resolveStreakLevel(b.longestStreak).title, 'Pocket Fuzz')

  // C. Year rollover is not special-cased: the dates are consecutive integers.
  const c = computeStreaks(['2025-12-31', '2026-01-01'], '2026-01-01')
  check('C  a run crosses the year boundary unbroken', c.currentStreak, 2)

  // D. Timezone change east→west. The run is unbroken because a calendar date
  //    has no offset.
  const d = computeStreaks(range('2026-08-01', 6), '2026-08-06')
  check('D  travel does not break the run', d.currentStreak, 6)

  // E. DST. 2026-03-08 is 23 hours long in New York and it makes no difference.
  const e = computeStreaks(['2026-03-07', '2026-03-08', '2026-03-09'], '2026-03-09')
  check('E  spring forward → run of 3', e.longestStreak, 3)

  // F. Empty and single-card.
  const empty = computeStreaks([], '2026-08-08')
  check('F  no cards', [empty.currentStreak, empty.longestStreak, empty.totalCards, empty.firstCardOn], [0, 0, 0, null])
  check('F  one card today', computeStreaks(['2026-08-08'], '2026-08-08').currentStreak, 1)
  check('F  one card yesterday', computeStreaks(['2026-08-07'], '2026-08-08').currentStreak, 1)
  check('F  one card two days ago', computeStreaks(['2026-08-06'], '2026-08-08').currentStreak, 0)
}

section('§6.3 streaks — the edges')

check(
  'duplicates are folded, not counted twice',
  computeStreaks(['2026-08-01', '2026-08-01', '2026-08-02'], '2026-08-02').totalCards,
  2,
)
check(
  'unsorted input gives the same answer',
  computeStreaks(['2026-08-03', '2026-08-01', '2026-08-02'], '2026-08-03').longestStreak,
  3,
)
check(
  'the longest run is not the last one',
  computeStreaks(
    [...range('2026-01-01', 9), '2026-03-01', '2026-03-02'],
    '2026-03-02',
  ),
  { currentStreak: 2, longestStreak: 9, totalCards: 11, firstCardOn: '2026-01-01', lastCardOn: '2026-03-02' },
)
check(
  '§13.3 a card dated in the future still anchors the run',
  computeStreaks(['2026-08-08', '2026-08-09'], '2026-08-08').currentStreak,
  2,
)

check('runLengthEndingAt — absent target', runLengthEndingAt([1, 2, 3], 5), 0)
check('runLengthEndingAt — a seven-day run', runLengthEndingAt([1, 2, 3, 4, 5, 6, 7], 7), 7)
check('runLengthEndingAt — mid-run', runLengthEndingAt([1, 2, 3, 9], 3), 3)
check('runLengthEndingAt — gap before target', runLengthEndingAt([1, 2, 9], 9), 1)

/* ------------------------------ §7 — the levels ----------------------------- */

section('§7 levels — every band boundary in both tables')

for (const [i, band] of STREAK_LEVELS.entries()) {
  check(`streak ${band.min} → ${band.title}`, resolveStreakLevel(band.min).title, band.title)
  if (i > 0) {
    const previous = STREAK_LEVELS[i - 1]
    check(
      `streak ${band.min - 1} → ${previous.title}`,
      resolveStreakLevel(band.min - 1).title,
      previous.title,
    )
  }
}

for (const [i, band] of COLLECTOR_LEVELS.entries()) {
  check(`collector ${band.min} → ${band.title}`, resolveCollectorLevel(band.min)?.title, band.title)
  if (i > 0) {
    const previous = COLLECTOR_LEVELS[i - 1]
    check(
      `collector ${band.min - 1} → ${previous.title}`,
      resolveCollectorLevel(band.min - 1)?.title,
      previous.title,
    )
  }
}

check('[R13] collector is undefined at zero words', resolveCollectorLevel(0), null)
check('streak is never null — Blank Card at zero', resolveStreakLevel(0).title, 'Blank Card')

section('§7.4 levels — progress and copy')

check('longest 0 → 3 more days', resolveStreakLevel(0).remaining, 3)
check('longest 2 → progress 2/3', Number(resolveStreakLevel(2).progress.toFixed(2)), 0.67)
check('longest 3 → progress resets to 0', resolveStreakLevel(3).progress, 0)
check('longest 10 → 4 more, progress 3/7', [resolveStreakLevel(10).remaining, Number(resolveStreakLevel(10).progress.toFixed(2))], [4, 0.43])
check('longest 364 → 1 more day', levelCaption(resolveStreakLevel(364), 'streak'), '1 more day → Dickens Would Nod')
check('longest 365 → top band', levelCaption(resolveStreakLevel(365), 'streak'), 'nothing above this')
check('longest 900 → still the top band', resolveStreakLevel(900).title, 'Dickens Would Nod')
check('words 24 → 1 more word', levelCaption(resolveCollectorLevel(24)!, 'collector'), '1 more word → Shelf of Odds')
check('words 1 → 9 more words', levelCaption(resolveCollectorLevel(1)!, 'collector'), '9 more words → Jam Jar of Words')
check('words 1000 → top band', resolveCollectorLevel(1000)?.progress, 1)

/* ------------------------------ §8 — the badges ----------------------------- */

section('§8.3 badges — one positive and one negative per key')

const ordinary: BadgeContext = {
  cardDate: '2026-09-15', // a Tuesday
  localHour: 14,
  isFirstCardEver: false,
  runLength: 4,
}
const on = (over: Partial<BadgeContext>): BadgeKey[] =>
  evaluateBadges({ ...ordinary, ...over })

check('an ordinary Tuesday afternoon earns nothing', on({}), [])

check('first_card  +', on({ isFirstCardEver: true }), ['first_card'])
check('first_card  −', on({ isFirstCardEver: false }), [])

check('full_week   + at 7', on({ runLength: 7 }), ['full_week'])
check('full_week   + at 14', on({ runLength: 14 }), ['full_week'])
check('full_week   + at 21', on({ runLength: 21 }), ['full_week'])
check('full_week   − at 8', on({ runLength: 8 }), [])
check('full_week   − at 13', on({ runLength: 13 }), [])
check('full_week   − at 20', on({ runLength: 20 }), [])
check('full_week   − at 0 (no card on that date)', on({ runLength: 0 }), [])

check('sunday      + 2026-09-13', on({ cardDate: '2026-09-13' }), ['sunday'])
check('sunday      − 2026-09-14', on({ cardDate: '2026-09-14' }), [])

check('midnight_oil + at 03:59', on({ localHour: 3 }), ['midnight_oil'])
check('midnight_oil + at 00:00', on({ localHour: 0 }), ['midnight_oil'])
check('midnight_oil − at 04:00 exactly [R12]', on({ localHour: 4 }), [])

check('new_year    + 2027-01-01', on({ cardDate: '2027-01-01' }), ['new_year'])
check('new_year    − 2027-01-02', on({ cardDate: '2027-01-02' }), [])

check('womens_day  + 2026-03-08 (a Sunday)', on({ cardDate: '2026-03-08' }), ['sunday', 'womens_day'])
check('womens_day  − 2026-03-09', on({ cardDate: '2026-03-09' }), [])

check('world_book_day + 2026-04-23', on({ cardDate: '2026-04-23' }), ['world_book_day'])
check('world_book_day − 2026-04-24', on({ cardDate: '2026-04-24' }), [])

check('fathers_day + 2026-06-21 (third Sunday)', on({ cardDate: '2026-06-21' }), ['sunday', 'fathers_day'])
check('fathers_day − 2026-06-14 (second Sunday)', on({ cardDate: '2026-06-14' }), ['sunday'])
check('fathers_day − 2026-06-28 (fourth Sunday)', on({ cardDate: '2026-06-28' }), ['sunday'])
check('fathers_day + 2027-06-20', on({ cardDate: '2027-06-20' }), ['sunday', 'fathers_day'])

check('indonesia_independence + 2026-08-17', on({ cardDate: '2026-08-17' }), ['indonesia_independence'])
check('indonesia_independence − 2026-08-18', on({ cardDate: '2026-08-18' }), [])

check('ibu         + 2026-12-22', on({ cardDate: '2026-12-22' }), ['ibu'])
check('ibu         − 2026-12-23', on({ cardDate: '2026-12-23' }), [])

check('christmas   + 2026-12-25', on({ cardDate: '2026-12-25' }), ['christmas'])
check('christmas   − 2026-12-26', on({ cardDate: '2026-12-26' }), [])

check('year_end    + 2026-12-31', on({ cardDate: '2026-12-31' }), ['year_end'])
check('year_end    − 2026-12-30', on({ cardDate: '2026-12-30' }), [])

check('leap_day    + 2028-02-29', on({ cardDate: '2028-02-29' }), ['leap_day'])
check('leap_day    − 2028-02-28', on({ cardDate: '2028-02-28' }), [])

section('§8.3 badges — combinations, and the order they come back in')

check(
  'Christmas at 01:30 on a full week',
  on({ cardDate: '2026-12-25', localHour: 1, runLength: 14 }),
  ['full_week', 'midnight_oil', 'christmas'],
)
check(
  'a first card on a Sunday',
  on({ cardDate: '2026-09-13', isFirstCardEver: true }),
  ['first_card', 'sunday'],
)
check(
  'returned in BADGE_CATALOG order',
  on({ cardDate: '2026-12-25', localHour: 1, runLength: 7, isFirstCardEver: true }).map(
    (k) => BADGE_CATALOG.findIndex((b) => b.key === k),
  ),
  [0, 1, 3, 10],
)

section('§8.1 badges — the catalog')

check('thirteen badges, no more', BADGE_CATALOG.length, 13)
check('keys are unique', new Set(BADGE_CATALOG.map((b) => b.key)).size, 13)
check('titles are unique', new Set(BADGE_CATALOG.map((b) => b.title)).size, 13)
check('§13.15 an unknown key has no title', badgeTitle('six_before_noon'), null)

/* ---------------- The Auckland case, end to end through the zone ------------ */

section('§6.5 C — the timezone boundary at the moment of creation')

{
  // 2025-12-31T11:20Z is 2026-01-01 00:20 in Auckland.
  const instant = new Date('2025-12-31T11:20:00Z')
  const cardDate = toLocalDate(instant, 'Pacific/Auckland')
  check('card_date is the local date, not the UTC one', cardDate, '2026-01-01')
  check('local hour is 0', localHour(instant, 'Pacific/Auckland'), 0)
  check(
    'so the badges are new_year + midnight_oil, never year_end',
    evaluateBadges({
      cardDate,
      localHour: localHour(instant, 'Pacific/Auckland'),
      isFirstCardEver: false,
      runLength: 3,
    }),
    ['midnight_oil', 'new_year'],
  )
}

check(
  '04:00 in Jakarta is hour 4, so midnight_oil does not fire',
  localHour(new Date('2026-08-08T21:00:00Z'), 'Asia/Jakarta'),
  4,
)

/* ------------------------- §10.4 — the reveal queue ------------------------- */

section('§10.4 the reveal queue')

const rewards = (keys: BadgeKey[], levelUp = false) => ({
  currentStreak: 7,
  longestStreak: 7,
  totalCards: 7,
  awardedBadges: keys.map((key) => ({
    key,
    title: badgeTitle(key) as string,
    awardedForDate: '2026-08-08',
  })),
  levelUp: levelUp
    ? ({ kind: 'streak', previousTitle: 'Pocket Fuzz', title: 'The Small Scribe' } as const)
    : null,
})

check('nothing to reveal', toRewardLines(null), [])
check('no badges and no level-up', toRewardLines(rewards([])), [])
check(
  'the level-up comes first',
  toRewardLines(rewards(['sunday'], true)).map((l) => l.text),
  ['The Small Scribe', 'No Weekend Without Ration Card'],
)
check(
  'badges follow catalog order, not award order',
  toRewardLines(rewards(['christmas', 'first_card', 'sunday'])).map((l) => l.text),
  ['The Uncle’s Trick', 'No Weekend Without Ration Card', 'Ghost of Christmas Vocab'],
)
check(
  'a fourth item collapses rather than queuing',
  toRewardLines(rewards(['first_card', 'sunday', 'christmas', 'midnight_oil'], true)).map(
    (l) => l.text,
  ),
  ['The Small Scribe', 'The Uncle’s Trick', 'and 3 more — see profile'],
)

/* --------------------------------- The tone -------------------------------- */

section('§14 the tone check — no loss aversion anywhere in this feature')

{
  const banned = [/keep it up/i, /at risk/i, /don['’]t lose/i, /streak is about to/i, /hurry/i]
  const copy = [
    levelCaption(resolveStreakLevel(10), 'streak'),
    levelCaption(resolveStreakLevel(365), 'streak'),
    levelCaption(resolveCollectorLevel(24)!, 'collector'),
    'today’s card is not made yet',
    'today’s card is made',
    'no streak right now',
    'no words yet',
    'The pocket is empty',
    'It starts with one card.',
    ...BADGE_CATALOG.map((b) => b.title),
    ...STREAK_LEVELS.map((l) => l.title),
    ...COLLECTOR_LEVELS.map((l) => l.title),
  ]
  check('no nagging phrases', copy.filter((c) => banned.some((b) => b.test(c))), [])
  check('no exclamation marks', copy.filter((c) => c.includes('!')), [])
}

console.log(
  failures === 0
    ? '\nAll gamification checks passed.'
    : `\n${failures} check(s) failed.`,
)
process.exit(failures === 0 ? 0 : 1)
