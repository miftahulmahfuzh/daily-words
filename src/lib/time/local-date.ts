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

/** Validate an IANA identifier. F7 uses this on the value captured from the browser. */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}
