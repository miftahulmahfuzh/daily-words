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
  BADGE_KEYS,
  badgeTitle,
  evaluateBadges,
  type BadgeContext,
  type BadgeKey,
} from '../src/lib/gamification/badges'
import { BADGE_META, badgeMeta } from '../src/lib/gamification/badge-meta'
import { LEVEL_GLOSS } from '../src/lib/gamification/level-meta'
import {
  COLLECTOR_LEVELS,
  STREAK_LEVELS,
  levelArtKey,
  levelCaption,
  levelCondition,
  resolveCollectorLevel,
  resolveStreakLevel,
} from '../src/lib/gamification/levels'
import {
  computeStreaks,
  countInWeekEndingAt,
  runLengthEndingAt,
  toDayNumber,
} from '../src/lib/gamification/streaks'
import { countAtOrBefore } from '../src/lib/gamification/tallies'
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

/* ------------- The week counter, and the tally `five_shares` reads ----------- */

section('§8.3 the Monday-start week, and the counters that are not cards')

{
  // 2026-08-09 is a Sunday and 2026-08-10 the Monday after it. Every assertion
  // below turns on that pair, because a week that started on Sunday would make
  // `three_in_a_week` fire one day early forever and nothing would throw.
  const d = (s: LocalDate) => toDayNumber(s)
  const week = ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13'].map(d)

  check('three cards, asked on the third', countInWeekEndingAt(week, d('2026-08-12')), 3)
  check('the fourth day does not see the third again', countInWeekEndingAt(week, d('2026-08-13')), 4)
  check('never counts forward', countInWeekEndingAt(week, d('2026-08-10')), 1)
  check('a day with no card', countInWeekEndingAt(week, d('2026-08-14')), 0)
  check(
    'Sunday belongs to the week before, not the week after',
    countInWeekEndingAt([d('2026-08-09'), d('2026-08-10')], d('2026-08-10')),
    1,
  )
  check(
    'and that Sunday closes its own week',
    countInWeekEndingAt([d('2026-08-07'), d('2026-08-08'), d('2026-08-09')], d('2026-08-09')),
    3,
  )
  // Before the epoch, where `Math.floor` on a negative is the whole question.
  check(
    'a pre-epoch week counts the same way',
    countInWeekEndingAt([d('1969-12-29'), d('1969-12-30')], d('1969-12-30')),
    2,
  )

  const at = (iso: string) => new Date(iso)
  const instants = [at('2026-08-01T09:00:00Z'), at('2026-08-05T09:00:00Z')]
  check('countAtOrBefore — inclusive at the instant', countAtOrBefore(instants, at('2026-08-05T09:00:00Z')), 2)
  check('countAtOrBefore — between the two', countAtOrBefore(instants, at('2026-08-03T00:00:00Z')), 1)
  check('countAtOrBefore — before both', countAtOrBefore(instants, at('2026-07-01T00:00:00Z')), 0)
  check('countAtOrBefore — no previous card reads as zero', countAtOrBefore(instants, null), 0)
}

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

/* ------------------- §F22 — the level tier keys and conditions --------------- */

section('§F22 level tier keys — the identity F22 art filenames carry')

/**
 * A level has no `badges_awarded` row, so its key was invented (F22 D2) and is
 * load-bearing in exactly one place a type cannot see: the filename under
 * `public/levels/`, served `immutable` for a year. `npm run badges:check` owns
 * the disk; this owns the tables.
 */
{
  const allKeys = [...STREAK_LEVELS, ...COLLECTOR_LEVELS].map((b) => b.key)
  check('seventeen tiers', allKeys.length, 17)
  check('every key is unique', new Set(allKeys).size, allKeys.length)
  check(
    'every key is snake_case and names its kind',
    allKeys.filter((k) => !/^(streak|collector)_[a-z0-9_]+$/.test(k)),
    [],
  )
  check(
    'streak keys all carry the streak prefix',
    STREAK_LEVELS.filter((b) => !b.key.startsWith('streak_')).length,
    0,
  )
  check(
    'collector keys all carry the collector prefix',
    COLLECTOR_LEVELS.filter((b) => !b.key.startsWith('collector_')).length,
    0,
  )

  // The round trip the profile page depends on: the index `resolve()` returns
  // selects the art for the band it resolved, and nothing else. A positional key
  // would pass every assertion above and fail this one the moment a band moved.
  check(
    'levelArtKey round-trips every streak band',
    STREAK_LEVELS.map((b) => levelArtKey('streak', resolveStreakLevel(b.min).index)),
    STREAK_LEVELS.map((b) => b.key),
  )
  check(
    'levelArtKey round-trips every collector band',
    COLLECTOR_LEVELS.map((b) => levelArtKey('collector', resolveCollectorLevel(b.min)!.index)),
    COLLECTOR_LEVELS.map((b) => b.key),
  )
  check('an out-of-range index draws nothing rather than throwing', levelArtKey('streak', 99), null)

  check(
    'the condition names the band’s own threshold',
    [
      levelCondition('streak', 0),
      levelCondition('streak', 4),
      levelCondition('collector', 0),
      levelCondition('collector', 7),
    ],
    [
      'Held until a streak reaches 3 days.',
      'A longest streak of 30 days.',
      '1 word added by hand.',
      '1000 words added by hand.',
    ],
  )
}

/* ------------------------------ §8 — the badges ----------------------------- */

section('§8.3 badges — one positive and one negative per key')

const ordinary: BadgeContext = {
  cardDate: '2026-09-15', // a Tuesday
  localHour: 14,
  isFirstCardEver: false,
  runLength: 4,
  // Two cards so far this week, and both counters standing still since the last
  // card — the state in which none of badges #15–#20 has anything to say.
  cardsThisLocalWeek: 2,
  sharedWordsNow: 3,
  sharedWordsAtPreviousCard: 3,
  journalLinesNow: 7,
  journalLinesAtPreviousCard: 7,
  // No birthday on the profile — the state every user who predates the column is
  // in, and the state a user who skipped the question stays in. It is the right
  // default for this fixture for the same reason `isFirstCardEver: false` is: the
  // ordinary card must earn nothing.
  birthday: null,
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

check('new_year    + 2027-01-01', on({ cardDate: '2027-01-01' }), ['new_year', 'friday_blessing'])
check('new_year    − 2027-01-02', on({ cardDate: '2027-01-02' }), [])

check('womens_day  + 2026-03-08 (a Sunday)', on({ cardDate: '2026-03-08' }), ['sunday', 'womens_day'])
check('womens_day  − 2026-03-09', on({ cardDate: '2026-03-09' }), [])

check('world_book_day + 2026-04-23', on({ cardDate: '2026-04-23' }), ['world_book_day'])
// The day after, and a Friday — so the negative is `world_book_day` absent
// rather than an empty list. Kept on this date rather than moved to a quieter
// one: "the day after" is the assertion, and a `−` case that has to dodge the
// rest of the deck to stay empty is testing the calendar, not the rule.
check('world_book_day − 2026-04-24', on({ cardDate: '2026-04-24' }), ['friday_blessing'])

check('fathers_day + 2026-06-21 (third Sunday)', on({ cardDate: '2026-06-21' }), ['sunday', 'fathers_day'])
check('fathers_day − 2026-06-14 (second Sunday)', on({ cardDate: '2026-06-14' }), ['sunday'])
check('fathers_day − 2026-06-28 (fourth Sunday)', on({ cardDate: '2026-06-28' }), ['sunday'])
check('fathers_day + 2027-06-20', on({ cardDate: '2027-06-20' }), ['sunday', 'fathers_day'])

check('indonesia_independence + 2026-08-17', on({ cardDate: '2026-08-17' }), ['indonesia_independence'])
check('indonesia_independence − 2026-08-18', on({ cardDate: '2026-08-18' }), [])

check('ibu         + 2026-12-22', on({ cardDate: '2026-12-22' }), ['ibu'])
check('ibu         − 2026-12-23', on({ cardDate: '2026-12-23' }), [])

// `christmas` was #11 and is gone — key, title, rule, prose and art. The date it
// used to fire on is asserted here as earning NOTHING, which is a stronger
// statement than the absence of an assertion: a rule left behind in
// `evaluateBadges` after its catalog entry was deleted would not typecheck, but a
// rule re-added by a merge would, and this is what fails then.
// 2026-12-25 is a Friday, so this list stopped being empty when #22 landed. The
// assertion is unchanged in force — `christmas` is absent — but it is worth
// saying out loud that an empty list was never what made it work, and reaching
// for a non-Friday Christmas to keep the `[]` would have been the wrong repair.
check('christmas   − 2026-12-25, the key is gone', on({ cardDate: '2026-12-25' }), [
  'friday_blessing',
])

check('year_end    + 2026-12-31', on({ cardDate: '2026-12-31' }), ['year_end'])
check('year_end    − 2026-12-30', on({ cardDate: '2026-12-30' }), [])

check('leap_day    + 2028-02-29', on({ cardDate: '2028-02-29' }), ['leap_day'])
check('leap_day    − 2028-02-28', on({ cardDate: '2028-02-28' }), [])

// F13's fourteenth. Weekdays below are `localDayOfWeek`'s answers, not guesses:
// 1973-09-02 and 2029-09-02 are Sundays, 2026-09-02 a Wednesday, 2028-09-02 a
// Saturday.
check('tolkien     + 2026-09-02 (a Wednesday)', on({ cardDate: '2026-09-02' }), ['tolkien'])
check('tolkien     − 2026-09-01', on({ cardDate: '2026-09-01' }), [])
check('tolkien     − 2026-09-03', on({ cardDate: '2026-09-03' }), [])
// 2027, not 2026: 2026-08-02 is a Sunday, and an expectation of `[]` there
// would fail on `sunday` rather than on anything to do with this rule. 2027-08-02
// is a Monday, so the empty result is about the month and nothing else.
check('tolkien     − 2027-08-02 (right day, wrong month)', on({ cardDate: '2027-08-02' }), [])
check('tolkien     − 2026-09-22 (right month, wrong day)', on({ cardDate: '2026-09-22' }), [])
check(
  'tolkien     + 1973-09-02, the day itself (a Sunday)',
  on({ cardDate: '1973-09-02' }),
  ['sunday', 'tolkien'],
)
check('tolkien     + 2029-09-02 (a Sunday)', on({ cardDate: '2029-09-02' }), ['sunday', 'tolkien'])
check(
  'tolkien     + 2026-09-02 at 02:00',
  on({ cardDate: '2026-09-02', localHour: 2 }),
  ['midnight_oil', 'tolkien'],
)

// The pair that catches a transposed comparison. `tolkien` is (month 9, day 2)
// and `leap_day` is (month 2, day 29); written the wrong way round — `month === 2
// && day === 9`, or `month === 29` — either one passes a single-date test and
// fails here. Evaluated in sequence, because it also asserts that
// `evaluateBadges` holds no state between calls.
{
  const leap = on({ cardDate: '2028-02-29' })
  const tolkien = on({ cardDate: '2028-09-02' })
  check('2 September and 29 February do not leak into each other', [leap, tolkien], [
    ['leap_day'],
    ['tolkien'],
  ])
}

// #15. `=== 3`, and the negatives are the badge: days four through seven of the
// same week must say nothing, or one good week awards five times.
check('three_in_a_week + on the third', on({ cardsThisLocalWeek: 3 }), ['three_in_a_week'])
check('three_in_a_week − on the second', on({ cardsThisLocalWeek: 2 }), [])
check('three_in_a_week − on the fourth', on({ cardsThisLocalWeek: 4 }), [])
check('three_in_a_week − on the seventh', on({ cardsThisLocalWeek: 7 }), [])
check('three_in_a_week − with no card that day', on({ cardsThisLocalWeek: 0 }), [])

// #16. Thirty, sixty, ninety — and 30 is not a multiple of 7, so these four
// assertions also prove the two streak badges are reading the same number
// without colliding.
check('thirty_day_streak + at 30', on({ runLength: 30 }), ['thirty_day_streak'])
check('thirty_day_streak + at 60', on({ runLength: 60 }), ['thirty_day_streak'])
check('thirty_day_streak + at 90', on({ runLength: 90 }), ['thirty_day_streak'])
check('thirty_day_streak − at 29', on({ runLength: 29 }), [])
check('thirty_day_streak − at 31', on({ runLength: 31 }), [])
check('thirty_day_streak − at 0', on({ runLength: 0 }), [])
check(
  'thirty_day_streak + full_week at 210, the first day both fall on',
  on({ runLength: 210 }),
  ['full_week', 'thirty_day_streak'],
)

// #17. 2026-06-30 is a Tuesday and 1997-06-30 — the day itself — was a Monday,
// so both expectations are about the date and nothing else.
check('dumbledore  + 2026-06-30 (a Tuesday)', on({ cardDate: '2026-06-30' }), ['dumbledore'])
check('dumbledore  + 1997-06-30, the day itself', on({ cardDate: '1997-06-30' }), ['dumbledore'])
check('dumbledore  − 2026-06-29', on({ cardDate: '2026-06-29' }), [])
check('dumbledore  − 2026-07-30 (right day, wrong month)', on({ cardDate: '2026-07-30' }), [])
check(
  'dumbledore  + midnight_oil at 00:30, which is when it happened',
  on({ cardDate: '2026-06-30', localHour: 0 }),
  ['midnight_oil', 'dumbledore'],
)

// #18. 2026-03-30 and 1998-03-30 are both Mondays. The 29th is a Sunday in 2026,
// which is the useful negative: it fails on `sunday` alone if the day is wrong.
check('dobby       + 2026-03-30 (a Monday)', on({ cardDate: '2026-03-30' }), ['dobby'])
check('dobby       + 1998-03-30, the day itself', on({ cardDate: '1998-03-30' }), ['dobby'])
check('dobby       − 2026-03-29 (a Sunday, the day before)', on({ cardDate: '2026-03-29' }), ['sunday'])
check('dobby       − 2026-03-31 (the funeral, not the death)', on({ cardDate: '2026-03-31' }), [])

// The pair that catches a month-blind comparison, exactly as `leap_day` and
// `tolkien` do above. Both of these fall on day 30; written as `day === 30`
// alone, each fires on the other's date and a single-date test still passes.
{
  const march = on({ cardDate: '2026-03-30' })
  const june = on({ cardDate: '2026-06-30' })
  check('30 March and 30 June do not leak into each other', [march, june], [
    ['dobby'],
    ['dumbledore'],
  ])
}

// #19 and #20. Crossings, not totals — the negatives are the entire rule, and
// the "count stood still" case is the one that would otherwise award on every
// card for the rest of the user's life.
check('five_shares + crossing 4 → 5', on({ sharedWordsAtPreviousCard: 4, sharedWordsNow: 5 }), ['five_shares'])
check('five_shares + crossing 9 → 10', on({ sharedWordsAtPreviousCard: 9, sharedWordsNow: 10 }), ['five_shares'])
check('five_shares + 0 → 5 on a first card', on({ sharedWordsAtPreviousCard: 0, sharedWordsNow: 5 }), ['five_shares'])
check('five_shares − the count stood still at 5', on({ sharedWordsAtPreviousCard: 5, sharedWordsNow: 5 }), [])
check('five_shares − 5 → 9, same bucket', on({ sharedWordsAtPreviousCard: 5, sharedWordsNow: 9 }), [])
check('five_shares − 4 → 4', on({ sharedWordsAtPreviousCard: 4, sharedWordsNow: 4 }), [])
// A revoked share makes the count fall. It must not re-award on the way back up,
// and it must not award on the way down.
check('five_shares − a revoked share, 12 → 10', on({ sharedWordsAtPreviousCard: 12, sharedWordsNow: 10 }), [])
// Two milestones between one pair of cards is one award, deliberately.
check('five_shares + 0 → 12 awards once, not twice', on({ sharedWordsAtPreviousCard: 0, sharedWordsNow: 12 }), ['five_shares'])

check('ten_journal_lines + crossing 9 → 10', on({ journalLinesAtPreviousCard: 9, journalLinesNow: 10 }), ['ten_journal_lines'])
check('ten_journal_lines + crossing 19 → 20', on({ journalLinesAtPreviousCard: 19, journalLinesNow: 20 }), ['ten_journal_lines'])
check('ten_journal_lines − the count stood still at 10', on({ journalLinesAtPreviousCard: 10, journalLinesNow: 10 }), [])
check('ten_journal_lines − 10 → 19, same bucket', on({ journalLinesAtPreviousCard: 10, journalLinesNow: 19 }), [])
check('ten_journal_lines − a deleted line, 25 → 20', on({ journalLinesAtPreviousCard: 25, journalLinesNow: 20 }), [])

// #21. The anniversary, not the birth: month and day only, and the year on the
// card is never compared with the year on the profile.
//
// The dates below are 11 August, a Tuesday in 2026, chosen the way this file
// already chose `tolkien`'s: 10 May 2026 is a Sunday, so every `[]` there would
// be `['sunday']` and every expectation would be about a different rule.
check(
  'birthday    + the anniversary (a Tuesday)',
  on({ cardDate: '2026-08-11', birthday: '1996-08-11' }),
  ['birthday'],
)
check(
  'birthday    + the day itself, thirty years earlier (a Sunday)',
  on({ cardDate: '1996-08-11', birthday: '1996-08-11' }),
  ['sunday', 'birthday'],
)
check('birthday    − the day after', on({ cardDate: '2026-08-12', birthday: '1996-08-11' }), [])
check('birthday    − the day before', on({ cardDate: '2026-08-10', birthday: '1996-08-11' }), [])
// The state every user who predates the column is in, and the state a user who
// declined the question stays in. It must be silent rather than lucky.
check('birthday    − no birthday given', on({ cardDate: '2026-08-11', birthday: null }), [])
// The transposition trap, the same one the `leap_day`/`tolkien` and
// `dobby`/`dumbledore` pairs exist for. Compared the wrong way round, this fires
// and every single-date assertion above still passes. Both directions, so neither
// is the lucky one — and 2027 for the second, because 8 November 2026 is a Sunday.
check(
  'birthday    − 8 November against a card on 11 August',
  on({ cardDate: '2026-08-11', birthday: '1996-11-08' }),
  [],
)
check(
  'birthday    − 11 August against a card on 8 November 2027 (a Monday)',
  on({ cardDate: '2027-11-08', birthday: '1996-08-11' }),
  [],
)
// A column a person typed into is the only input here that is not a number or a
// date this app computed, and `parseLocalDate` THROWS. A throw would cost the user
// every other badge on the card, so an unreadable birthday earns nothing and takes
// nothing with it — which is exactly what a null earns.
check('birthday    − a shaped non-date', on({ cardDate: '2026-08-11', birthday: '2026-13-99' }), [])
check('birthday    − not a date at all', on({ cardDate: '2026-08-11', birthday: 'sometime' }), [])
check('birthday    − an empty string', on({ cardDate: '2026-08-11', birthday: '' }), [])

// #22. A card made on a Friday, and the second rule in the deck keyed on a bare
// day of the week.
//
// **The pair is the point.** `sunday` reads `dow === 0` and this reads
// `dow === 5` off the same value, so a rule written against the wrong constant
// passes every single-date test you would think to write — the same trap the
// `leap_day`/`tolkien` and `dobby`/`dumbledore` pairs already exist for, and
// the reason those two are asserted in both directions rather than once each.
// The three dates below are one week in September 2026, so the contrast is
// legible without arithmetic: the 11th is a Friday and the 13th is a Sunday.
check('friday_blessing + 2026-09-11 (a Friday)', on({ cardDate: '2026-09-11' }), ['friday_blessing'])
check('friday_blessing − 2026-09-12 (the Saturday after)', on({ cardDate: '2026-09-12' }), [])
check('friday_blessing − 2026-09-10 (the Thursday before)', on({ cardDate: '2026-09-10' }), [])
// Neither direction, so neither is the lucky one. A Sunday must not earn the
// Friday badge and a Friday must not earn the Sunday one.
check('friday_blessing − 2026-09-13, which is the Sunday', on({ cardDate: '2026-09-13' }), ['sunday'])
// Ordering, not just membership. `friday_blessing` is last in `BADGE_CATALOG`,
// so it comes last however many fire with it — which is what fails if its
// `earned.push` is ever moved up beside `sunday`'s line in `evaluateBadges`,
// where it reads more naturally and is wrong.
check(
  'friday_blessing + comes last on a first card made on a Friday',
  on({ cardDate: '2026-09-11', isFirstCardEver: true }),
  ['first_card', 'friday_blessing'],
)
check(
  'and a broken birthday costs the card nothing else',
  on({ cardDate: '2026-08-11', birthday: 'sometime', isFirstCardEver: true, runLength: 7 }),
  ['first_card', 'full_week'],
)
// Born on a leap day: earned in leap years only, roughly once in 1,461 days, and
// always beside `leap_day`. No substitute date is invented — 28 February and
// 1 March are both somebody else's birthday.
check(
  'birthday    + 29 February in a leap year, with leap_day',
  on({ cardDate: '2028-02-29', birthday: '2004-02-29' }),
  ['leap_day', 'birthday'],
)
check(
  'birthday    − 28 February, which is not it',
  on({ cardDate: '2028-02-28', birthday: '2004-02-29' }),
  [],
)
/**
 * **The changed-birthday rule, in the half that lives here.**
 *
 * Asked for as: award under date A, change the profile to date B, and the count
 * already earned stands; a card on date B later takes it to two. The evaluator's
 * share of that is the pair below — under date B, date A earns nothing, so nothing
 * re-fires and nothing is re-judged, and date B earns the award that makes it two.
 * The other half is that no write path deletes an award row: `setBirthday` touches
 * one table and it is not `badges_awarded`. `stats:db` is where writes are
 * asserted, and `recompute.ts` names the one path — `--prune` — that would undo it.
 */
check(
  'birthday    − the old date, once the profile says another (a Tuesday)',
  on({ cardDate: '2026-05-12', birthday: '1996-08-11' }),
  [],
)
check(
  'birthday    + the new date, which is what makes the count two',
  on({ cardDate: '2027-08-11', birthday: '1996-08-11' }),
  ['birthday'],
)

section('§8.3 badges — combinations, and the order they come back in')

check(
  'both counters cross on the same card',
  on({
    sharedWordsAtPreviousCard: 4,
    sharedWordsNow: 5,
    journalLinesAtPreviousCard: 9,
    journalLinesNow: 10,
  }),
  ['five_shares', 'ten_journal_lines'],
)
check(
  'the third card of the week, on a thirty-day run, on 30 June',
  on({ cardDate: '2026-06-30', cardsThisLocalWeek: 3, runLength: 30 }),
  ['three_in_a_week', 'thirty_day_streak', 'dumbledore'],
)

check(
  'New Year’s Eve at 01:30 on a full week',
  on({ cardDate: '2026-12-31', localHour: 1, runLength: 14 }),
  ['full_week', 'midnight_oil', 'year_end'],
)
check(
  'a first card on a Sunday',
  on({ cardDate: '2026-09-13', isFirstCardEver: true }),
  ['first_card', 'sunday'],
)
// The tuple that catches an insertion in the middle of the catalog. It used to be
// driven by 25 December and `christmas`'s index 10; `year_end` inherited that
// index when `christmas` was removed, so the assertion is the same shape against
// the date four days later.
check(
  'returned in BADGE_CATALOG order',
  on({ cardDate: '2026-12-31', localHour: 1, runLength: 7, isFirstCardEver: true }).map(
    (k) => BADGE_CATALOG.findIndex((b) => b.key === k),
  ),
  [0, 1, 3, 10],
)
check(
  'a first card on a Sunday 2 September',
  on({ cardDate: '2029-09-02', isFirstCardEver: true }),
  ['first_card', 'sunday', 'tolkien'],
)
// #21 is last in the catalog, so it comes last however many fire with it.
check(
  'a first card on a birthday that is also a Sunday (10 May 2026)',
  on({ cardDate: '2026-05-10', birthday: '1996-05-10', isFirstCardEver: true }),
  ['first_card', 'sunday', 'birthday'],
)

section('§8.4 [R12] — how often each repeating badge repeats on a 100-day run')

/**
 * [R12]'s trap, written down as numbers instead of as a warning.
 *
 * Every rule here reads literally as something that would fire on *every* day
 * past its threshold: "three cards in a week" is true on days four to seven too,
 * "thirty consecutive days" is true on day thirty-one. These counts are the
 * assertion that none of them does. If a rule is ever loosened by accident, this
 * block moves before anything else in the file notices.
 *
 * 100 consecutive days from a Monday: fourteen whole weeks and two days over.
 */
{
  const days = range('2026-01-05', 100) // 2026-01-05 is a Monday
  const nums = days.map(toDayNumber)
  const tally = new Map<string, number>()

  for (const [i, date] of days.entries()) {
    const n = toDayNumber(date)
    for (const key of evaluateBadges({
      cardDate: date,
      localHour: 14,
      isFirstCardEver: i === 0,
      runLength: runLengthEndingAt(nums, n),
      cardsThisLocalWeek: countInWeekEndingAt(nums, n),
      sharedWordsNow: 0,
      sharedWordsAtPreviousCard: 0,
      journalLinesNow: 0,
      journalLinesAtPreviousCard: 0,
      // Null here on purpose: this block's job is the badges that *repeat*, and
      // the run below re-runs the same hundred days with a birthday in them.
      birthday: null,
    })) {
      tally.set(key, (tally.get(key) ?? 0) + 1)
    }
  }

  check('first_card        ×1 — once, ever', tally.get('first_card'), 1)
  check('full_week         ×14 — one per completed week', tally.get('full_week'), 14)
  check('sunday            ×14', tally.get('sunday'), 14)
  // Fourteen for the same reason `sunday` is: fourteen whole weeks, and the two
  // days over are a Monday and a Tuesday. That the two counts match is a
  // property of the window rather than of the rules, so it is not evidence that
  // both read the day correctly — the September pair above is what shows that.
  check('friday_blessing   ×14', tally.get('friday_blessing'), 14)
  // Fourteen, not fifteen: the run ends on a Tuesday, so the fifteenth week
  // never reaches a third card.
  check('three_in_a_week   ×14 — one per week that reaches three', tally.get('three_in_a_week'), 14)
  check('thirty_day_streak ×3 — at 30, 60 and 90', tally.get('thirty_day_streak'), 3)
  // The window is 2026-01-05 to 2026-04-14, which contains 8 March and 30 March.
  // Both are worth having here: a calendar badge inside a 100-day run must fire
  // exactly once, and these are the assertion that a date rule cannot repeat
  // within a year the way a counting rule repeats within a month.
  check('womens_day        ×1', tally.get('womens_day'), 1)
  check('dobby             ×1', tally.get('dobby'), 1)
  check('birthday          ×0 — nothing to match against', tally.get('birthday'), undefined)
  check('and nothing else fires at all', [...tally.keys()].sort(), [
    'dobby',
    'first_card',
    'friday_blessing',
    'full_week',
    'sunday',
    'thirty_day_streak',
    'three_in_a_week',
    'womens_day',
  ])
}

/**
 * The same hundred days again, with a birthday inside the window.
 *
 * **The answer to [R12]'s question for #21 is one.** Every calendar badge in the
 * deck reads as something that could repeat — "a card on my birthday" is true of
 * one day a year, and a rule written against the day *number* alone would fire in
 * every month of the run. A year is longer than any streak this block can
 * express, so once is the ceiling as well as the count, and the only way to earn
 * it twice is to move the date, which is the one thing the rule allows.
 *
 * 14 February 2026 is a Saturday and falls inside 2026-01-05 … 2026-04-14, so the
 * expected difference from the run above is exactly one award and nothing else.
 */
{
  const days = range('2026-01-05', 100)
  const nums = days.map(toDayNumber)
  let birthdays = 0

  for (const [i, date] of days.entries()) {
    const n = toDayNumber(date)
    const earned = evaluateBadges({
      cardDate: date,
      localHour: 14,
      isFirstCardEver: i === 0,
      runLength: runLengthEndingAt(nums, n),
      cardsThisLocalWeek: countInWeekEndingAt(nums, n),
      sharedWordsNow: 0,
      sharedWordsAtPreviousCard: 0,
      journalLinesNow: 0,
      journalLinesAtPreviousCard: 0,
      birthday: '1996-02-14',
    })
    if (earned.includes('birthday')) birthdays++
  }

  check('birthday          ×1 on a 100-day run — once a year, ever', birthdays, 1)
}

section('§8.1 badges — the catalog')

check('twenty-one badges, no more', BADGE_CATALOG.length, 21)
check('keys are unique', new Set(BADGE_CATALOG.map((b) => b.key)).size, 21)
check('titles are unique', new Set(BADGE_CATALOG.map((b) => b.title)).size, 21)
// Appending is what preserves the index tuple asserted above, and the toast
// ordering of everything that came before. Badges #15–#20 went on the end for
// that reason, so `tolkien` keeps index 13 and the tuple keeps its meaning.
check('friday_blessing is last in the catalog', BADGE_CATALOG.at(-1)?.key, 'friday_blessing')
// **`christmas` was removed from the middle, and that is the one edit appending
// does not protect against.** It held index 10, so everything after it moved down
// one: `tolkien` from 13 to 12. Indices 0–9 did not move, nothing persisted
// carries an index, and these two assertions are the whole blast radius.
check(
  'the first ten did not move',
  BADGE_CATALOG.slice(0, 10).map((b) => b.key),
  [
    'first_card',
    'full_week',
    'sunday',
    'midnight_oil',
    'new_year',
    'womens_day',
    'world_book_day',
    'fathers_day',
    'indonesia_independence',
    'ibu',
  ],
)
check(
  'and tolkien moved down exactly one',
  BADGE_CATALOG.findIndex((b) => b.key === 'tolkien'),
  12,
)
check('§13.15 an unknown key has no title', badgeTitle('six_before_noon'), null)

/* ------------------------ §F13 — the badge metadata ------------------------ */

section('§F13 the badge metadata — parity with the catalog')

// Both directions. The `Record<BadgeKey, …>` type already catches a catalog key
// with no metadata at `npm run typecheck`; this catches the same thing one step
// later and also catches the reverse, which the type cannot see because an extra
// key in an object literal is only an error when it is literal-inferred.
check(
  'every catalog key has metadata',
  BADGE_CATALOG.filter((b) => !BADGE_META[b.key]).map((b) => b.key),
  [],
)
check(
  'no metadata key is absent from the catalog',
  Object.keys(BADGE_META).filter((k) => !BADGE_KEYS.includes(k as BadgeKey)),
  [],
)
check('badgeMeta mirrors badgeTitle on an unknown key', badgeMeta('six_before_noon'), null)

// Length caps. `condition` sits on one to two lines under the title and `gloss`
// on three to five; past these the dialog reaches for §4.5's scrolling escape
// hatch on a 375×667 screen, which is the documented degradation and not the
// intended state.
check(
  'every condition is non-empty and ≤ 140 characters',
  BADGE_CATALOG.filter((b) => {
    const c = BADGE_META[b.key].condition
    return c.length === 0 || c.length > 140
  }).map((b) => `${b.key} (${BADGE_META[b.key].condition.length})`),
  [],
)
check(
  'every gloss is non-empty and ≤ 320 characters',
  BADGE_CATALOG.filter((b) => {
    const g = BADGE_META[b.key].gloss
    return g.length === 0 || g.length > 320
  }).map((b) => `${b.key} (${BADGE_META[b.key].gloss.length})`),
  [],
)

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
      ...ordinary,
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
  toRewardLines(rewards(['year_end', 'first_card', 'sunday'])).map((l) => l.text),
  ['The Uncle’s Trick', 'No Weekend Without Ration Card', 'Last Word of the Year'],
)
check(
  'a fourth item collapses rather than queuing',
  toRewardLines(rewards(['first_card', 'sunday', 'year_end', 'midnight_oil'], true)).map(
    (l) => l.text,
  ),
  ['The Small Scribe', 'The Uncle’s Trick', 'and 3 more — see profile'],
)

/* --------------------------------- The tone -------------------------------- */

section('§14 the tone check — no loss aversion anywhere in this feature')

{
  const banned = [/keep it up/i, /at risk/i, /don['’]t lose/i, /streak is about to/i, /hurry/i]
  // F13's twenty-eight new strings ride the same list, and add three of their
  // own. They are the longest prose in the feature and the only prose in it that
  // explains rather than reports, which is exactly where a congratulation would
  // arrive disguised as copy.
  const meta = BADGE_CATALOG.flatMap((b) => [
    BADGE_META[b.key].condition,
    BADGE_META[b.key].gloss,
  ])
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
    ...meta,
    // F22's seventeen glosses and seventeen conditions ride the SAME list
    // rather than a second one. The register is the feature's, not the badge
    // deck's, and a level gloss is written in exactly the place a
    // congratulation would arrive disguised as copy.
    ...Object.values(LEVEL_GLOSS),
    ...STREAK_LEVELS.map((_, i) => levelCondition('streak', i)),
    ...COLLECTOR_LEVELS.map((_, i) => levelCondition('collector', i)),
  ]
  check('no nagging phrases', copy.filter((c) => banned.some((b) => b.test(c))), [])
  check('no exclamation marks', copy.filter((c) => c.includes('!')), [])

  // The conditions are facts about cards, never things the reader did — which is
  // what lets one string serve both the earned and the unearned state (D2).
  const secondPerson = /\byou\b|\byour\b|\byours\b|\byou['’]re\b/i
  check('no second person', copy.filter((c) => secondPerson.test(c)), [])

  const flattery = /congratulations|well done|amazing|nice work|proud of|impressive/i
  check('no flattery', copy.filter((c) => flattery.test(c)), [])

  // The exact class of bug `levels.ts` documents at the top of the file: a
  // straight quote beside a typographic one in the same serif reads as a typo.
  // This would have caught "Sauron's Favourite" as first typed.
  check('no straight apostrophes', copy.filter((c) => c.includes("'")), [])

  // The same cap `badge-meta.ts`'s gloss carries, for the same reason: past it
  // the dialog reaches for its scrolling escape hatch on a 375×667 screen,
  // which is the documented degradation rather than the intended state.
  check(
    'every level gloss is ≤ 320 characters',
    Object.entries(LEVEL_GLOSS)
      .filter(([, g]) => g.length > 320)
      .map(([k, g]) => `${k} (${g.length})`),
    [],
  )
}

console.log(
  failures === 0
    ? '\nAll gamification checks passed.'
    : `\n${failures} check(s) failed.`,
)
process.exit(failures === 0 ? 0 : 1)
