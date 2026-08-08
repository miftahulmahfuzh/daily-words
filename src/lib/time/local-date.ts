/**
 * The user-local calendar date, as 'YYYY-MM-DD'.
 *
 * This is the ONLY representation of a "day" in this app. Postgres `date` columns
 * (card_date, last_shown_on, awarded_for_date, first_card_on, last_card_on) map to
 * it 1:1 because they are declared with { mode: 'string' }.
 *
 * Never derive a day boundary from a JS Date's local getters, and never from UTC.
 * Vercel runs UTC; the user does not.
 */
export type LocalDate = string

/** A user-local calendar month, as 'YYYY-MM'. The unit /calendar navigates in. */
export type LocalMonth = string

export const DEFAULT_TIMEZONE = 'Asia/Jakarta'

/** Zone-aware calendar/clock parts for an instant. */
type ZonedParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23', // NOT hour12:false — that yields "24" at midnight
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const p = Object.fromEntries(
    fmt.formatToParts(instant).map((x) => [x.type, x.value]),
  ) as Record<string, string>
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Convert an absolute instant to the user's local calendar date. */
export function toLocalDate(instant: Date, timeZone: string): LocalDate {
  const { year, month, day } = zonedParts(instant, timeZone)
  return `${year}-${pad(month)}-${pad(day)}`
}

/** "What is today, for this user?" The helper F5, F9 and the badge logic call. */
export function localDateNow(timeZone: string, now: Date = new Date()): LocalDate {
  return toLocalDate(now, timeZone)
}

/** Local hour of day, 0–23. Drives the `midnight_oil` badge (local hour < 4). */
export function localHour(instant: Date, timeZone: string): number {
  return zonedParts(instant, timeZone).hour
}

export function parseLocalDate(date: LocalDate): {
  year: number
  month: number
  day: number
} {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) throw new Error(`Not a LocalDate: ${date}`)
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
}

/** Day of week for a LocalDate: 0 = Sunday … 6 = Saturday. Locale-independent. */
export function localDayOfWeek(date: LocalDate): number {
  const { year, month, day } = parseLocalDate(date)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

/**
 * Calendar arithmetic on LocalDate. Anchored in UTC on purpose: a LocalDate has
 * no time and no offset, so DST can never apply to it. Adding 1 day to
 * '2026-03-08' is always '2026-03-09', in every zone.
 */
export function addLocalDays(date: LocalDate, days: number): LocalDate {
  const { year, month, day } = parseLocalDate(date)
  const d = new Date(Date.UTC(year, month - 1, day))
  d.setUTCDate(d.getUTCDate() + days)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** Whole days from `from` to `to`. Positive when `to` is later. Streak arithmetic. */
export function diffLocalDays(from: LocalDate, to: LocalDate): number {
  const a = parseLocalDate(from)
  const b = parseLocalDate(to)
  const ms = Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)
  return Math.round(ms / 86_400_000)
}

/** Lexicographic ordering is correct chronological ordering for 'YYYY-MM-DD'. */
export function compareLocalDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Inclusive list of dates. Used by F5's month calendar. */
export function localDateRange(from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = []
  for (let d = from; compareLocalDates(d, to) <= 0; d = addLocalDays(d, 1)) out.push(d)
  return out
}

/** First and last day of the month containing `date`. F5's calendar bounds. */
export function localMonthBounds(date: LocalDate): { start: LocalDate; end: LocalDate } {
  const { year, month } = parseLocalDate(date)
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { start: `${year}-${pad(month)}-01`, end: `${year}-${pad(month)}-${pad(last)}` }
}

/** "8 August 2026" — the format F9 uses for "keeping a card since …". */
export function formatLocalDateLong(date: LocalDate): string {
  const { year, month, day } = parseLocalDate(date)
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

/**
 * "Friday, 18 September" — the /today header line.
 *
 * No year: the header answers "what day is it", and a user looking at their own
 * phone knows the year. Formatted from the date string in UTC, so the weekday is
 * a property of the local calendar date rather than of the reader's machine.
 */
export function formatLocalDateWeekday(date: LocalDate): string {
  const { year, month, day } = parseLocalDate(date)
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

/** One letter for the week strip: S M T W T F S. English throughout, per principle 4. */
const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const

export function weekdayLetter(date: LocalDate): string {
  return WEEKDAY_LETTERS[localDayOfWeek(date)]
}

/* ---------------------------------- Months ---------------------------------- */

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/

export function isLocalMonth(value: unknown): value is LocalMonth {
  return typeof value === 'string' && MONTH_RE.test(value)
}

export function parseLocalMonth(month: LocalMonth): { year: number; month: number } {
  const m = MONTH_RE.exec(month)
  if (!m) throw new Error(`Not a LocalMonth: ${month}`)
  return { year: Number(m[1]), month: Number(m[2]) }
}

/** The month a date falls in. Lexicographic ordering works on these too. */
export function localMonthOf(date: LocalDate): LocalMonth {
  return date.slice(0, 7)
}

/** First and last day of a month, as LocalDates. */
export function localMonthRange(month: LocalMonth): { start: LocalDate; end: LocalDate } {
  const { year, month: m } = parseLocalMonth(month)
  // Day 0 of the following month is the last day of this one — the standard
  // trick, and the reason no month-length table appears anywhere in this file.
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate()
  return { start: `${month}-01`, end: `${month}-${pad(last)}` }
}

/** Every day of the month, ascending. What the calendar grid iterates. */
export function localMonthDates(month: LocalMonth): LocalDate[] {
  const { start, end } = localMonthRange(month)
  return localDateRange(start, end)
}

export function addLocalMonths(month: LocalMonth, n: number): LocalMonth {
  const { year, month: m } = parseLocalMonth(month)
  const d = new Date(Date.UTC(year, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
}

/** "August 2026" — the /calendar title. */
export function formatMonthLabel(month: LocalMonth): string {
  const { year, month: m } = parseLocalMonth(month)
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, m - 1, 1)))
}

/** Validate an IANA identifier. F7 uses this on the value captured from the browser. */
export function isValidTimeZone(tz: unknown): tz is string {
  // `unknown` rather than `string` because the caller that matters most reads
  // the value out of a database column: NOT NULL guarantees a string to
  // TypeScript, not a zone to Intl. '' and '   ' both throw here, which is the
  // behaviour F5 leans on when it refuses to write a card.
  if (typeof tz !== 'string' || tz.trim() === '') return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}
