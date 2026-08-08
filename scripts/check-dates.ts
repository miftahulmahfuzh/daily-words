/**
 * Executable assertions for every day-boundary decision F5 makes.
 *
 * Run with:  npm run dates:check
 *
 * There is no test runner in this project, so these are plain assertions in a
 * file that exits non-zero. They are not decoration: streaks, the calendar and
 * every date-triggered badge break in exactly one way — a day boundary computed
 * in the wrong zone — and the failure is invisible for six hours a day and
 * obvious for the other eighteen.
 *
 * Nothing here touches the database or the network. Every input is passed in.
 */
import {
  addLocalDays,
  addLocalMonths,
  compareLocalDates,
  diffLocalDays,
  formatLocalDateLong,
  formatLocalDateWeekday,
  formatMonthLabel,
  isLocalMonth,
  isValidTimeZone,
  localDateRange,
  localDayOfWeek,
  localHour,
  localMonthDates,
  localMonthOf,
  localMonthRange,
  toLocalDate,
  weekdayLetter,
} from '../src/lib/time/local-date'
import {
  buildRecentDays,
  classifyDay,
  isCardDay,
  isMarkable,
  resolveAnchor,
  toCalendarMark,
} from '../src/lib/cards/calendar'

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

/* ------------------- The worked examples from F5 §8, verbatim ---------------- */

section('card_date across a date boundary (server runs UTC; the user does not)')

const CASES: [string, string, string, number][] = [
  // instant (UTC),        timezone,               card_date,     local hour
  ['2026-08-08T23:00:00Z', 'Asia/Jakarta', '2026-08-09', 6],
  ['2026-08-09T01:00:00Z', 'Asia/Jakarta', '2026-08-09', 8],
  ['2026-08-08T17:30:00Z', 'Asia/Jakarta', '2026-08-09', 0], // → midnight_oil
  ['2026-08-09T01:00:00Z', 'America/Los_Angeles', '2026-08-08', 18],
  ['2026-12-31T11:05:00Z', 'Pacific/Auckland', '2027-01-01', 0], // → new_year, NOT year_end
  ['2026-03-08T06:30:00Z', 'America/New_York', '2026-03-08', 1], // EST, before the DST jump
  ['2026-03-08T07:30:00Z', 'America/New_York', '2026-03-08', 3], // EDT, after it
]

for (const [iso, tz, expectedDate, expectedHour] of CASES) {
  const instant = new Date(iso)
  check(`${iso} in ${tz} → date`, toLocalDate(instant, tz), expectedDate)
  check(`${iso} in ${tz} → hour`, localHour(instant, tz), expectedHour)
}

// DST shifts times, never dates. Both March instants above land on the 8th,
// which is why F5 contains no DST-specific code at all.
check(
  'DST is a non-event for dates',
  toLocalDate(new Date('2026-03-08T06:30:00Z'), 'America/New_York') ===
    toLocalDate(new Date('2026-03-08T07:30:00Z'), 'America/New_York'),
  true,
)

/* --------------------------- Calendar arithmetic ---------------------------- */

section('calendar arithmetic on YYYY-MM-DD strings')

check('2026 is not a leap year', addLocalDays('2026-02-28', 1), '2026-03-01')
check('2024 is', addLocalDays('2024-02-28', 1), '2024-02-29')
check('across a month end', addLocalDays('2026-07-31', 1), '2026-08-01')
check('across a year end', addLocalDays('2026-12-31', 1), '2027-01-01')
check('backwards', addLocalDays('2026-01-01', -1), '2025-12-31')
check('diffLocalDays', diffLocalDays('2026-07-31', '2026-08-01'), 1)
check('diffLocalDays, negative', diffLocalDays('2026-08-01', '2026-07-31'), -1)
check('diffLocalDays, a year', diffLocalDays('2026-01-01', '2027-01-01'), 365)
check('9 August 2026 is a Sunday', localDayOfWeek('2026-08-09'), 0)
check('weekday letter', weekdayLetter('2026-08-09'), 'S')
check('weekday letter, Monday', weekdayLetter('2026-08-10'), 'M')
check('lexicographic order is chronological', compareLocalDates('2026-08-09', '2026-08-10'), -1)
check('localDateRange is inclusive', localDateRange('2026-08-08', '2026-08-10').length, 3)

section('months')

check('localMonthOf', localMonthOf('2026-08-09'), '2026-08')
check('February 2026 has 28 days', localMonthDates('2026-02').length, 28)
check('February 2024 has 29', localMonthDates('2024-02').length, 29)
check('August has 31', localMonthDates('2026-08').length, 31)
check('month range', localMonthRange('2026-02'), { start: '2026-02-01', end: '2026-02-28' })
check('addLocalMonths across a year', addLocalMonths('2026-12', 1), '2027-01')
check('addLocalMonths backwards', addLocalMonths('2026-01', -1), '2025-12')
check('isLocalMonth rejects month 13', isLocalMonth('2026-13'), false)
check('isLocalMonth rejects a word', isLocalMonth('August'), false)
check('isLocalMonth accepts', isLocalMonth('2026-08'), true)

section('formatting (English throughout, per principle 4)')

check('month label', formatMonthLabel('2026-08'), 'August 2026')
check('/today header', formatLocalDateWeekday('2026-08-09'), 'Sunday, 9 August')
check('long date', formatLocalDateLong('2026-08-08'), '8 August 2026')

section('timezone validation')

check('a real zone', isValidTimeZone('Asia/Jakarta'), true)
check('UTC', isValidTimeZone('UTC'), true)
check('an invented zone', isValidTimeZone('Mars/Olympus'), false)
check('the empty string', isValidTimeZone(''), false)
check('whitespace', isValidTimeZone('   '), false)
check('null', isValidTimeZone(null), false)

/* ------------------------------ Day states ---------------------------------- */

section('the six day states')

const today = '2026-08-09'
const ctx = {
  today,
  anchor: '2026-08-05',
  cardDates: new Set(['2026-08-05', '2026-08-07', '2026-08-09']),
}

check('a past day with a card', classifyDay('2026-08-07', ctx), 'card')
check('a past day without one', classifyDay('2026-08-06', ctx), 'miss')
check('today, with a card', classifyDay('2026-08-09', ctx), 'today_card')
check('tomorrow', classifyDay('2026-08-10', ctx), 'future')
check('before the anchor', classifyDay('2026-08-04', ctx), 'pre_start')
check('the anchor day itself', classifyDay('2026-08-05', ctx), 'card')

// The distinction that keeps the screen from being a punishment chart: a day is
// not a failure until it is over.
const noCardToday = { ...ctx, cardDates: new Set(['2026-08-07']) }
check('today, no card yet, is NOT a miss', classifyDay(today, noCardToday), 'today_none')

// A user who joined on the 8th must not find seven crosses waiting for the 1st.
const joinedYesterday = { today, anchor: '2026-08-08', cardDates: new Set<string>() }
check('the week before joining', classifyDay('2026-08-01', joinedYesterday), 'pre_start')
check('the day they joined', classifyDay('2026-08-08', joinedYesterday), 'miss')

// A tick is a fact; the anchor is derived. The fact wins.
const strayCard = { today, anchor: '2026-08-08', cardDates: new Set(['2026-08-02']) }
check('a card before the anchor still shows', classifyDay('2026-08-02', strayCard), 'card')

// Moving west repeats a local date and can push a card_date past today.
const movedWest = { today, anchor: '2026-08-20', cardDates: new Set<string>() }
check('a clamped anchor cannot swallow today', classifyDay(today, movedWest), 'today_none')

section('the strip and the ratio under the grid')

const strip = buildRecentDays(ctx, 7)
check('seven days', strip.length, 7)
check('oldest first', strip[0].date, '2026-08-03')
check('today last', strip[6].date, today)
check('cards in the window', strip.filter((d) => isCardDay(d.state)).length, 3)
check('markable days', strip.filter((d) => isMarkable(d.state)).length, 5)

section('state → mark')

check('card', toCalendarMark('card'), { mark: 'made', isToday: false })
check('today_card', toCalendarMark('today_card'), { mark: 'made', isToday: true })
check('miss', toCalendarMark('miss'), { mark: 'missed', isToday: false })
check('today_none is a ring, not a cross', toCalendarMark('today_none'), {
  mark: 'missed',
  isToday: true,
})
check('pre_start draws nothing', toCalendarMark('pre_start'), {
  mark: 'future',
  isToday: false,
})

section('the calendar anchor')

check(
  'min(first card, joined)',
  resolveAnchor('2026-08-05', new Date('2026-08-07T02:00:00Z'), 'Asia/Jakarta'),
  '2026-08-05',
)
check(
  'joined, when there are no cards',
  resolveAnchor(null, new Date('2026-08-07T17:30:00Z'), 'Asia/Jakarta'),
  '2026-08-08', // 00:30 the next day in Jakarta
)
check('nothing at all', resolveAnchor(null, null, 'Asia/Jakarta'), null)

/* ---------------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`)
  process.exit(1)
}
console.log('\nAll date and calendar assertions passed.')
