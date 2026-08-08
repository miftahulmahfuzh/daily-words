> ## ⚠ SUPERSEDED IN PART — read `ROADMAP_v0.1.0.md` § Reconciliation Decisions first.
>
> - **[R14]** §9 layout budget is superseded. Rows are **52 px** and the card is **347 px** (F2 proved it against iPhone SE with the URL bar expanded). Import from `LAYOUT` at `@/lib/ui/layout`; do not restate numbers.
> - **[R15]** Your `CardCreatedEvent` hook wins over F9's proposal. Unchanged.
> - **[R1]** Your warning about the `daily_card_items` FK was correct and is now roadmap policy — the FK is `ON DELETE RESTRICT`.
>
> These plans were written in parallel by agents that could not see each other.
> The Reconciliation section wins over anything below.

# F5 — Daily Card & Calendar

> Implementation plan. Read `ROADMAP_v0.1.0.md` first — it is the authoritative shared
> contract. Where this file adds detail, follow it. Where this file appears to contradict
> the roadmap, the roadmap wins: stop and report the discrepancy.

> **The origin.** A 13×8 cm card in a trouser pocket, hand-written, six unknown words and
> what they mean, glanced at through the day. Everything below exists to reproduce that
> object and the small deliberate act of writing it out. Build it with that in mind.

---

## 1. Goal

Ship `/today` — a six-word card that the user *presses a button* to bring into existence,
never generated automatically — and `/calendar`, a month of ticks and crosses recording
which days have a card. Every day boundary is the user's local calendar date, taken from
their profile timezone. The card must never scroll at 375 px width.

---

## 2. Depends on / blocks

### Depends on

| Feature | What F5 needs from it | Hard blocker? |
|---|---|---|
| **F1** | Drizzle schema for `daily_cards`, `daily_card_items`, `vocab_entries`, `profiles`; the db client; Auth.js session helper (`auth()`); app shell + bottom tab bar; safe-area handling | **Yes** |
| **F2** | Design tokens, card surface, list-row primitive, button, empty state; the vertical layout budget between header and tab bar | **Yes** for final styling; F5 can be built against raw Tailwind and re-skinned |
| **F3** | Populates `vocab_entries` with `definition`, `part_of_speech`, `enrichment_status` | Soft — F5 renders gracefully when `definition` is null |
| **F7** | Writes `profiles.timezone` at onboarding | **Yes for card creation.** Without a valid timezone, F5 refuses to create a card (see §8) |
| **F4** | `/vocab/[id]` route that card rows link to; the "mastered" toggle that retires words | Soft — rows link there; a 404 during development is acceptable |

### Blocks

| Feature | What it needs from F5 |
|---|---|
| **F9** | The `onCardCreated` hook (§11). Streaks, `user_stats`, and every date-triggered badge fire from card creation. F9 also reads `daily_cards.card_date` history directly |
| **F8** | Nothing structural. Discover is a destination for F5's under-supplied prompt |

F5 **must not** import anything from F9. See §11.

---

## 3. In scope / explicitly out of scope

### In scope

- `/today` page: header, recent-day strip, the card, the nudge button, empty and
  under-supplied states.
- `/calendar` page: month grid of ticks and crosses, month navigation.
- `POST /api/cards` — the nudge. The only way a card is ever created.
- `GET /api/cards/calendar?month=YYYY-MM` — month grid data for client-side navigation.
- The selection algorithm and the single point at which `last_shown_on` is written.
- All timezone primitives (`lib/date/tz.ts`), which other features may import.
- The `CardCreatedEvent` contract and its no-op handler, for F9 to fill in.
- One migration: an index, and one optional column (§5).

### Explicitly out of scope

- **Any automatic card creation.** No cron, no `revalidate`-driven creation, no creation
  on page load, no "create it for them if they haven't by 9pm". Principle 5 of the
  roadmap. If you find yourself writing a scheduler, stop.
- **Any anti-repeat logic** beyond the least-recently-shown preference. Seeing "genteel"
  every day for a week is correct. Do not add cooldowns, do not exclude yesterday's words,
  do not deduplicate against the previous card.
- **Spaced repetition.** Named out of scope in the roadmap. The card is deliberately
  dumber than SRS.
- **Editing or regenerating a card.** One card per local date, fixed at creation. No
  reroll button, no "swap this word", no delete.
- **Padding an under-supplied card.** Fewer than six active words means fewer than six
  rows. Never insert filler, never repeat a word within one card, never fall back to
  suggested-but-unadded words.
- Streak counts, badges, levels, `user_stats`, `badges_awarded` — all F9.
- Word enrichment, definitions, examples — F3/F4.
- A per-day card history route (`/calendar/[date]`). Not in the roadmap route map.
  Calendar cells are marks, not links.
- Notifications or reminders of any kind (roadmap out-of-scope list).

---

## 4. Files to create

> If F1 placed authenticated routes inside a route group (e.g. `app/(app)/…`), put
> `today/` and `calendar/` inside that same group. Paths below assume no group.

| Path | Purpose |
|---|---|
| `lib/date/tz.ts` | All timezone and calendar-date primitives; the only place `Intl.DateTimeFormat` is constructed |
| `lib/cards/schemas.ts` | Zod schemas for every F5 request and response shape |
| `lib/cards/selection.ts` | The selection SQL and its TypeScript wrapper; the single definition of the algorithm |
| `lib/cards/hooks.ts` | `CardCreatedEvent` type + no-op `onCardCreated`; the seam F9 attaches to |
| `lib/db/queries/cards.ts` | Every database read/write for cards — create, today, month, recent strip, calendar anchor |
| `app/api/cards/route.ts` | `POST /api/cards` — the nudge; idempotent card creation |
| `app/api/cards/calendar/route.ts` | `GET /api/cards/calendar?month=YYYY-MM` — month grid data |
| `app/today/page.tsx` | `/today` server component: resolves timezone, loads today's card + recent strip, composes the screen |
| `app/today/nudge-button.tsx` | Client component: the press, its pending/error states, `router.refresh()` on success |
| `components/daily-card/daily-card.tsx` | The card surface and its six flex rows; owns the no-scroll layout |
| `components/daily-card/card-row.tsx` | One row: term + one-line definition, whole row links to `/vocab/[id]` |
| `components/daily-card/card-empty.tsx` | No-active-words empty state pointing at `/vocab/new` and Discover |
| `components/daily-card/under-supplied-note.tsx` | The single quiet line shown when a card has fewer than six rows |
| `components/daily-card/recent-strip.tsx` | Compact seven-day strip on `/today`; taps through to `/calendar` |
| `app/calendar/page.tsx` | `/calendar` server component: renders the current local month on first paint |
| `app/calendar/month-view.tsx` | Client component: month state, prev/next navigation, fetches `/api/cards/calendar` |
| `components/calendar/month-grid.tsx` | The 7-column grid, weekday header, leading/trailing blanks |
| `components/calendar/day-cell.tsx` | One calendar cell: date number + mark |
| `components/calendar/day-mark.tsx` | The tick / cross / open-ring / blank glyph; shared by grid and strip |
| `drizzle/XXXX_f5_daily_card.sql` | Migration: index on `vocab_entries (user_id, status)`, and the optional `daily_cards.timezone` column (§5). Number is whatever `drizzle-kit generate` produces |
| `scripts/check-tz.ts` | Executable assertions for `lib/date/tz.ts` across date boundaries and DST; run with `npx tsx` |
| `scripts/check-selection.sql` | A psql script that seeds a fixture user and reports selection frequencies over 1000 draws |

---

## 5. Data

### Tables read

| Table | Columns | Use |
|---|---|---|
| `profiles` | `user_id`, `timezone`, `created_at` | The timezone for every day boundary; `created_at` anchors the calendar start |
| `vocab_entries` | `id`, `user_id`, `term`, `status`, `part_of_speech`, `definition`, `enrichment_status`, `last_shown_on` | Selection candidates and card row rendering |
| `daily_cards` | `id`, `user_id`, `card_date`, `created_at` | Today's card, month grid, recent strip |
| `daily_card_items` | `card_id`, `vocab_entry_id`, `position` | The six chosen words, in order |

### Tables written

| Table | Write | When |
|---|---|---|
| `daily_cards` | `INSERT … ON CONFLICT (user_id, card_date) DO NOTHING` | Only on a successful nudge |
| `daily_card_items` | `INSERT` × up to 6 | Same transaction, only when the card row was genuinely inserted |
| `vocab_entries.last_shown_on` | `UPDATE` on the chosen entries | Same transaction, only when the card row was genuinely inserted |

F5 writes **nothing else**. It never touches `user_stats` or `badges_awarded` — those are
F9's, reached through the hook in §11.

### Proposed additions to the roadmap schema

Both are additive. Neither renames or restructures anything.

**A. Index — required.**

```sql
CREATE INDEX IF NOT EXISTS vocab_entries_user_status_idx
  ON vocab_entries (user_id, status);
```

*Justification:* the selection query filters `user_id = $1 AND status = 'active'` and then
sorts the whole candidate set by a volatile expression. The sort cannot be indexed, but the
filter must be, or every nudge sequentially scans the user's entire vocabulary. The existing
`UNIQUE (user_id, lower(term))` index cannot serve this predicate.

**B. Column — recommended, optional.**

```sql
ALTER TABLE daily_cards ADD COLUMN IF NOT EXISTS timezone text;
```

Drizzle: `timezone: text('timezone')` on the `dailyCards` table. Populated at creation with
the IANA string actually used to compute `card_date`.

*Justification:* `card_date` alone is uninterpretable after a user changes timezone. When a
user reports "I made a card but the calendar shows the wrong day", this column is the
difference between a five-minute diagnosis and an unanswerable question. It also lets F9
recompute a card's local hour and weekday historically without assuming the *current*
profile timezone applied at the time. Cost: one nullable text column.

*If the implementer prefers zero schema drift from F1, skip B.* Nothing else in F5 depends
on it — `lib/cards/hooks.ts` carries the timezone in its event payload either way. Do not
skip A.

### Indexes NOT needed

- `daily_cards (user_id, card_date)` — the `UNIQUE (user_id, card_date)` constraint already
  creates exactly this btree index. Every calendar range scan uses it. Do not add a duplicate.
- `daily_card_items (card_id)` — covered by the `UNIQUE (card_id, position)` index.

### Drizzle column modes — read this before writing any query

`card_date` and `last_shown_on` are Postgres `DATE`. They must round-trip as
**`'YYYY-MM-DD'` strings**, never as JavaScript `Date` objects.

```ts
card_date: date('card_date', { mode: 'string' }).notNull(),
last_shown_on: date('last_shown_on', { mode: 'string' }),
```

A JS `Date` bound to a `DATE` parameter is serialised through UTC and silently shifts the
day for any user east or west of UTC — this is the single most likely way F5 breaks. Step 1
of §10 verifies the round trip empirically, because driver behaviour differs between
`@neondatabase/serverless` (HTTP, returns strings) and `pg` (returns `Date` for OID 1082
unless a type parser is registered).

If F1's schema declared these without `mode: 'string'`, changing the mode is a
TypeScript-level change only — no migration, no data change.

---

## 6. API contract

Both routes: `export const dynamic = 'force-dynamic'`, respond with
`Cache-Control: no-store`, and validate with zod at the boundary. Both return
`401 { error: 'unauthenticated' }` when `auth()` yields no session.

### `POST /api/cards` — the nudge

The only path that creates a card. Idempotent per `(user_id, card_date)`.

**Request body** (all fields optional; an empty object is the normal case):

```ts
export const createCardRequestSchema = z.object({
  // Purely advisory. Used ONLY to set `timezoneMismatch` in the response so the UI can
  // suggest updating the profile. NEVER used to compute card_date.
  clientTimezone: z.string().min(1).max(64).optional(),
}).strict();
```

The client never sends a date. The server derives `card_date` from its own clock and the
profile timezone, always.

**200 — success** (both first press and repeat press):

```ts
export const cardItemSchema = z.object({
  position: z.number().int().min(1).max(6),
  entryId: z.string().uuid(),
  term: z.string(),
  partOfSpeech: z.string().nullable(),
  definition: z.string().nullable(),
  enrichmentStatus: z.enum(['pending', 'ready', 'failed']),
});

export const dailyCardSchema = z.object({
  id: z.string().uuid(),
  cardDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  createdAt: z.string(),            // ISO instant, UTC
  items: z.array(cardItemSchema),   // length 1..6, ascending position
});

export const createCardResponseSchema = z.object({
  created: z.boolean(),             // false = card already existed; NOT an error
  card: dailyCardSchema,
  underSupplied: z.boolean(),       // card.items.length < 6
  activeWordCount: z.number().int().min(0),
  timezone: z.string(),             // IANA actually used
  timezoneMismatch: z.boolean(),    // clientTimezone was sent and differs from profile
});
```

**Error responses:**

| Status | Body | Meaning | UI response |
|---|---|---|---|
| 401 | `{ error: 'unauthenticated' }` | No session | Redirect `/signin` |
| 409 | `{ error: 'timezone_missing' }` | No profile row, or `timezone` empty/not a valid IANA zone | Redirect `/onboarding` |
| 409 | `{ error: 'no_active_words' }` | Zero entries with `status='active'` | Render the empty state; no card row is created |
| 500 | `{ error: 'internal' }` | Anything else | Inline "Couldn't make the card. Try again." Button re-enabled; retry is safe |

**A card is never created with zero items.** A zero-word card would register as a day the
ritual happened while teaching nothing, and would corrupt F9's streak. One active word is
enough for a card; zero is not.

### `GET /api/cards/calendar?month=YYYY-MM`

```ts
export const calendarQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});

export const dayStateSchema = z.enum([
  'card',        // past day, card exists            → tick
  'miss',        // past day, in range, no card      → cross
  'today_card',  // today, card exists               → tick, ringed
  'today_none',  // today, no card yet               → open ring (an invitation, not a cross)
  'future',      // after today                      → number only
  'pre_start',   // before the user's first recorded day → number only, no mark
]);

export const calendarResponseSchema = z.object({
  month: z.string(),                 // 'YYYY-MM'
  timezone: z.string(),
  today: z.string(),                 // user-local 'YYYY-MM-DD'
  anchor: z.string().nullable(),     // first day the calendar can mark; null = brand new user
  cardCount: z.number().int(),       // cards in this month
  markableCount: z.number().int(),   // days in this month at or after anchor and <= today
  days: z.array(z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    state: dayStateSchema,
  })),                               // exactly the days of that month, ascending
});
```

**404** is never returned for an empty month. **400 `{ error: 'bad_month' }`** on a query
that fails the regex. Months after the user's current local month return all `future`; they
are reachable only by a malformed request because the UI clamps navigation.

### Not an API

`/today` and `/calendar` render server-side via `lib/db/queries/cards.ts` directly. They do
**not** fetch their own API routes. `POST /api/cards` exists because the nudge is a client
interaction; `GET /api/cards/calendar` exists because month navigation is a client
interaction. No other endpoints.

No server actions are added for card creation. The route handler is the contract — it is
`curl`-testable, which §13 depends on.

---

## 7. The selection algorithm

### The rule, in one sentence

Words never shown fill the card first, in random order; remaining slots are drawn by
weighted random sampling without replacement from words already shown, weighted by how long
ago they were last shown.

### Definitions

Let `D` be the card's date — the user's local calendar date, as a `'YYYY-MM-DD'` string.

For each candidate entry `v` where `v.user_id = $userId AND v.status = 'active'`:

```
tier(v)      = 0 if v.last_shown_on IS NULL, else 1
staleness(v) = 0                                    if tier = 0
             = max(D − v.last_shown_on, 0) in days  if tier = 1
weight(v)    = 1                if tier = 0
             = staleness(v) + 1 if tier = 1
```

`staleness` is clamped at 0 so that a word whose `last_shown_on` is somehow *after* `D`
(possible after a westward timezone change) gets weight 1 rather than a negative exponent.

Each candidate is assigned an Efraimidis–Spirakis key:

```
key(v) = u ^ (1 / weight(v))     where u ~ Uniform(0, 1), drawn independently per row
```

Candidates are ordered by `tier` ascending, then `key` descending. The first six are the
card, in that order, at positions 1…6.

Sorting the top-k by `u^(1/w)` descending is exact weighted random sampling without
replacement: an item's probability of being drawn first is `w / Σw`. Tier-0 items have
`weight = 1`, so `key = u`, giving them a uniform random order among themselves — the
"nulls first" of the roadmap, with the tie broken randomly rather than arbitrarily.

### The query

`lib/cards/selection.ts` holds exactly this SQL and nothing else selects cards:

```sql
-- $1 = user_id (uuid), $2 = card_date ('YYYY-MM-DD' string)
SELECT v.id, v.term, v.part_of_speech, v.definition, v.enrichment_status
FROM vocab_entries v
CROSS JOIN LATERAL (
  SELECT (
    CASE
      WHEN v.last_shown_on IS NULL THEN 1
      ELSE GREATEST($2::date - v.last_shown_on, 0) + 1
    END
  )::double precision AS weight
) w
WHERE v.user_id = $1
  AND v.status = 'active'
ORDER BY
  (v.last_shown_on IS NOT NULL) ASC,               -- tier 0 (never shown) first
  power(random(), 1.0 / w.weight) DESC             -- weighted random within tier
LIMIT 6;
```

Notes for the implementer:

- `random()` is volatile; Postgres evaluates it once per row. This is what makes the sort
  a sample rather than a fixed ranking.
- `(v.last_shown_on IS NOT NULL) ASC` sorts `false` before `true` — never-shown first.
- `$2::date - v.last_shown_on` is `date − date` → `integer` days. This is pure calendar
  arithmetic on stored `DATE` values; no timezone is involved and none should be introduced.
- `enrichment_status` is **not** filtered. A word the user chose to learn belongs on the
  card even while its definition is still being generated; excluding it would silently
  shrink an already-small collection. `card-row.tsx` renders an em-dash for a null
  definition (§9).
- The set is scanned in full and sorted. At hobby scale (hundreds to a few thousand entries
  per user) this is microseconds. Do not optimise it into something harder to reason about.

### When `last_shown_on` is written — exactly once, exactly here

Immediately after the six items are inserted, in the **same transaction**, for exactly the
selected entries:

```sql
UPDATE vocab_entries
SET last_shown_on = GREATEST(COALESCE(last_shown_on, $2::date), $2::date)
WHERE id = ANY($3::uuid[]);
```

`GREATEST` prevents a westward timezone move from dragging a word's recency backwards.

`last_shown_on` is **never** written:

- on rendering `/today`,
- on tapping a card row,
- on visiting `/vocab/[id]`,
- when the nudge hits an existing card (`created: false`),
- by any other feature.

It is a record of *what was put on a card*, not *what was looked at*.

### Worked example — the normal case

User has 8 active words. `D = 2026-08-09`.

| term | `last_shown_on` | tier | staleness | weight | key |
|---|---|---|---|---|---|
| aplomb | `NULL` | 0 | — | 1 | `u` |
| bucolic | `NULL` | 0 | — | 1 | `u` |
| obviate | 2026-08-09 | 1 | 0 | 1 | `u` |
| genteel | 2026-08-08 | 1 | 1 | 2 | `u^0.500` |
| louche | 2026-08-08 | 1 | 1 | 2 | `u^0.500` |
| maunder | 2026-08-02 | 1 | 7 | 8 | `u^0.125` |
| natter | 2026-07-10 | 1 | 30 | 31 | `u^0.032` |
| pellucid | 2026-06-01 | 1 | 69 | 70 | `u^0.014` |

Positions 1–2 are always **aplomb** and **bucolic** (tier 0), in random order. The remaining
four slots are drawn from tier 1, total weight `1+2+2+8+31+70 = 114`. Probability of being
drawn first: pellucid 61%, natter 27%, maunder 7%, genteel 1.8%, louche 1.8%, obviate 0.9%.
Over four draws, pellucid and natter are near-certain, maunder likely, and one of
{genteel, louche, obviate} takes the last slot.

**Note that genteel can appear on consecutive days.** That is the design. After appearing
on 2026-08-09 its `last_shown_on` becomes 2026-08-09, so tomorrow its weight is 2 again
while everything unshown climbs — the pressure toward variety is gentle and probabilistic,
never a hard exclusion. The user who wants "genteel" for a week gets it.

### Worked example — everything shown today already

User has 6 active words, all with `last_shown_on = 2026-08-09`, and it is 2026-08-09. They
already have a card, so the nudge returns `created: false` and the existing card. No
selection runs. If instead the date has rolled to 2026-08-10, all six have weight 2, all
six are drawn (there are only six), and the card is identical to yesterday's. Correct.

### Worked example — the under-supplied case

User has 3 active words: **aplomb** (`NULL`), **genteel** (2026-08-01), **louche** (`NULL`).
`D = 2026-08-09`.

1. Candidate count = 3, which is ≥ 1, so a card is created.
2. `LIMIT 6` returns all 3. Tier 0 first: aplomb and louche in random order at positions
   1 and 2; genteel at position 3.
3. Three `daily_card_items` rows are inserted with positions 1, 2, 3. **Positions 4–6 do
   not exist.** No placeholder rows, no repeated words, no filler.
4. All three get `last_shown_on = '2026-08-09'`.
5. Response: `created: true`, `underSupplied: true`, `activeWordCount: 3`.
6. `/today` renders three rows and, beneath them,
   `under-supplied-note.tsx`: *"3 words. Add more →"* linking to `/vocab/new`, with a
   secondary link to Discover. The card surface still fills its region — the rows flex to
   share the space (§9), so three words read as a deliberately short list, not a broken grid.

### Worked example — zero active words

User has 0 active words (new account, or every word is `mastered`).

- `POST /api/cards` returns **409 `no_active_words`**. No `daily_cards` row is created,
  so the day stays a cross on the calendar. Nothing happened, and the record says so.
- `/today` never shows the nudge button in this state. It renders `card-empty.tsx`:
  *"No words yet."* with **Add a word** → `/vocab/new` and **Discover** → `/vocab?tab=discover`.
- If every word is `mastered`, the copy differs: *"Every word mastered."* with the same two
  actions. Detect via `activeWordCount === 0 && totalWordCount > 0`.

Position numbering is **1-based** throughout (`position ∈ 1..6`).

---

## 8. Timezone handling

> The roadmap says to read its time section twice. This section is the operational form of
> it. Every rule here is load-bearing.

### The four rules

1. **The user's local calendar date is computed from an instant plus their IANA timezone,
   using `Intl.DateTimeFormat` — never by adding an offset, never from
   `Date.prototype.getDate()`, never from `toISOString().slice(0,10)`.**
2. **All day-boundary arithmetic happens in TypeScript on `'YYYY-MM-DD'` strings.**
   Postgres stores and compares `DATE` values and does `date − date` arithmetic; it is never
   asked to convert between zones. The only conversion point in the system is `lib/date/tz.ts`.
3. **The client never supplies a date.** Not the card date, not "today", not a month
   boundary. `clientTimezone` is advisory telemetry only.
4. **A card is never created without a valid profile timezone.** Reads may fall back; writes
   may not.

### `lib/date/tz.ts`

```ts
export type LocalDate = string;   // 'YYYY-MM-DD'

const fmtCache = new Map<string, Intl.DateTimeFormat>();

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.trim() === '') return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; }
  catch { return false; }
}

/** The user's local calendar date at `instant`. */
export function localDate(instant: Date, tz: string): LocalDate {
  const key = `d:${tz}`;
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    });
    fmtCache.set(key, f);
  }
  const p = f.formatToParts(instant);
  const get = (t: string) => p.find((x) => x.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Local hour 0–23. Feeds F9's `midnight_oil` badge. */
export function localHour(instant: Date, tz: string): number { /* hourCycle: 'h23' */ }

/** 0 = Sunday … 6 = Saturday, derived from the date string, not from a locale. */
export function weekdayOf(d: LocalDate): number {
  return new Date(`${d}T00:00:00Z`).getUTCDay();
}

export function addDays(d: LocalDate, n: number): LocalDate { /* via Date.UTC, UTC setters */ }
export function daysBetween(a: LocalDate, b: LocalDate): number { /* b − a, in days */ }
export function monthOf(d: LocalDate): string;              // 'YYYY-MM'
export function daysInMonth(month: string): LocalDate[];    // ascending, full month
export function addMonths(month: string, n: number): string;
export function formatLongDate(d: LocalDate): string;       // 'Saturday, 8 August'
```

Implementation constraints:

- Cache `Intl.DateTimeFormat` instances per timezone. Construction is expensive and the
  nudge path is latency-visible.
- `addDays` / `daysBetween` parse `'YYYY-MM-DD'` into `Date.UTC(y, m-1, d)` and use **UTC**
  getters and setters exclusively. A single local-time getter anywhere in this file
  reintroduces the bug the file exists to prevent.
- `weekdayOf` takes a date *string*, not an instant — a weekday is a property of the local
  calendar date, and deriving it from the string is exact in every zone.
- `formatLongDate` may use `Intl.DateTimeFormat('en-GB', …)` on the UTC-parsed date. English
  throughout, per roadmap principle 4.

### Resolving the timezone

```ts
export const FALLBACK_TIMEZONE = 'UTC';

type Resolved =
  | { ok: true;  tz: string }
  | { ok: false; tz: 'UTC'; reason: 'no_profile' | 'invalid' };
```

`resolveTimezone(profile)` in `lib/db/queries/cards.ts`:

- profile row exists and `isValidTimeZone(profile.timezone)` → `{ ok: true, tz }`
- profile row missing → `{ ok: false, tz: 'UTC', reason: 'no_profile' }`
- profile row present, timezone empty or not a valid IANA zone →
  `{ ok: false, tz: 'UTC', reason: 'invalid' }`, and `console.warn` with the user id and the
  offending string

**How each path uses it:**

| Path | `ok: false` behaviour |
|---|---|
| `POST /api/cards` | **409 `timezone_missing`. No card is created, ever.** |
| `/today` page | Render with UTC so the screen is not blank, but replace the nudge button with a link to `/onboarding` ("Set your timezone to start a card") |
| `/calendar`, `GET /api/cards/calendar` | Render with UTC; historical `card_date` values are already stored and are displayed as-is |

Refusing to write is the important half. A card written under a guessed timezone is a wrong
date in the permanent record and a wrong streak forever after; a page rendered under a
guessed timezone is a cosmetic error for one session.

### Worked examples across a date boundary

Server (Vercel) always runs in UTC. `now` is the server instant.

| # | `now` (UTC) | Profile tz | Local wall time | UTC date | **`card_date`** |
|---|---|---|---|---|---|
| 1 | `2026-08-08T23:00:00Z` | `Asia/Jakarta` (+07) | Sun 9 Aug, 06:00 | 2026-08-08 | **2026-08-09** |
| 2 | `2026-08-09T01:00:00Z` | `Asia/Jakarta` | Sun 9 Aug, 08:00 | 2026-08-09 | **2026-08-09** |
| 3 | `2026-08-08T17:30:00Z` | `Asia/Jakarta` | Sun 9 Aug, 00:30 | 2026-08-08 | **2026-08-09** |
| 4 | `2026-08-09T01:00:00Z` | `America/Los_Angeles` (−07) | Sat 8 Aug, 18:00 | 2026-08-09 | **2026-08-08** |
| 5 | `2026-12-31T11:05:00Z` | `Pacific/Auckland` (+13) | Fri 1 Jan 2027, 00:05 | 2026-12-31 | **2027-01-01** |
| 6 | `2026-03-08T06:30:00Z` | `America/New_York` (EST, −05) | Sun 8 Mar, 01:30 | 2026-03-08 | **2026-03-08** |
| 7 | `2026-03-08T07:30:00Z` | `America/New_York` (EDT, −04, DST began 02:00) | Sun 8 Mar, 03:30 | 2026-03-08 | **2026-03-08** |

Row 1 is the case the brief names: 08:00 Jakarta on 9 August must be `2026-08-09`, and
here even 06:00 works while UTC still says the 8th.

Row 3 also yields `localHour = 0`, which F9 turns into the `midnight_oil` badge.

Row 5 is why F9 must consume `cardDate` and `localWeekday` from the hook payload rather than
doing its own UTC arithmetic: the correct badge is `new_year`, but any UTC-based check would
award `year_end`.

Rows 6–7 show DST is a non-event for this feature. DST shifts *times*, never *dates* —
`Intl` handles the offset change and both instants land on 8 March. Do not write DST-specific
code.

### If the timezone changes

The profile timezone is a live value, read fresh on every request. F7 owns editing it. F5's
contract:

- **History is never rewritten.** Existing `card_date` values are facts about days that
  happened. No backfill, no migration, no recompute.
- **New cards use the new zone from the next request onward.**
- **Moving west can repeat a local date.** A user in `Asia/Jakarta` creates a card at
  10 Aug 20:00 local (`card_date = 2026-08-10`), flies to `America/Los_Angeles`, updates
  their profile, and presses the button — local date is still 2026-08-10 there. The insert
  conflicts, `created: false` is returned, and they see the card they already made. Correct
  and non-destructive.
- **Moving east can skip a local date.** Jakarta → Auckland can advance the local date by
  one; the skipped day is a cross on the calendar. This is honest: no card was made that day.
  Do not backfill it.
- **`last_shown_on` is protected** by the `GREATEST(…)` in §7 so a westward move cannot make
  a word look staler than it is.
- The optional `daily_cards.timezone` column (§5B) is what makes any of this diagnosable
  after the fact.

### Clock skew between render and press

`/today` renders at 23:59:58 local and computes `today = D`. The user presses at 00:00:03
local. The server recomputes and creates `card_date = D+1`. The response carries the actual
`cardDate`; the client calls `router.refresh()` unconditionally, and the page re-renders
against `D+1`. **Never** compare the response's `cardDate` to a value the client captured at
render time and treat a difference as an error — the server is right by definition.

---

## 9. UI/UX spec

### The no-scroll constraint

**`/today` must never scroll at 375 px width.** Tested at 375×667 (iPhone SE — the tightest
realistic target) and 375×812.

The technique is to make overflow structurally impossible rather than to compute pixel
heights that happen to fit:

```
/today root
  height: 100dvh            ← dynamic viewport height; survives iOS URL-bar collapse
  display: grid
  grid-template-rows: auto auto 1fr auto   ← header / strip / card region / tab bar
  overflow: hidden
  overscroll-behavior: none
```

The card region is the `1fr` track with `min-height: 0` (without it, grid children refuse to
shrink below content size and the page overflows — this is the classic failure). Inside it:

```
.card        display: flex; flex-direction: column; min-height: 0; overflow: hidden
.card-row    flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; justify-content: center
```

Six rows each take `1fr` of whatever height exists. On a short viewport the rows compress;
they never overflow. Both text lines are single-line and clipped:

```
.term        white-space: nowrap; overflow: hidden; text-overflow: ellipsis
.definition  white-space: nowrap; overflow: hidden; text-overflow: ellipsis
```

Below a threshold the definition is dropped rather than squeezed, using a container query on
the card:

```css
.card { container-type: size; }
@container (max-height: 320px) { .definition { display: none; } }
```

**Vertical budget** — target 375×667, iOS Safari with chrome, `100dvh ≈ 560 px`:

| Region | Height |
|---|---|
| Header (date line) | 44 |
| Recent strip (+ margin) | 52 |
| **Card region** | **~366** |
| Bottom tab bar (F2) + safe-area inset | ~98 |

366 px across six rows ≈ 61 px per row: term at 16/22, definition at 13/18, ~10 px vertical
padding. Comfortably above the 44 px minimum tap target. **Coordinate these numbers with
F2** — if F2's header or tab bar is taller, the rows absorb the difference automatically and
the definition line disappears on the shortest devices. That degradation is intended.

The card region is the only flexible track. Do not add anything else to `/today` that
consumes fixed vertical space.

### `/today` — anatomy

```
┌─────────────────────────────┐
│ Sunday, 9 August            │  header, local date, formatted in the user's tz
├─────────────────────────────┤
│  M  T  W  T  F  S  S        │  recent strip: 7 days, oldest → newest, today rightmost
│  ✓  ✓  ✗  ✓  ✓  ✓  ○        │  whole strip taps through to /calendar
├─────────────────────────────┤
│  genteel                    │
│  polite in a refined way    │
│  ─────────────────────────  │
│  louche                     │  six rows, hairline rules between them,
│  disreputable in an …       │  like a ruled card
│  ─────────────────────────  │
│  … four more …              │
└─────────────────────────────┘
        [ bottom tab bar ]
```

**Card surface.** A nod to the object: warm paper tone, hairline border, one soft shadow,
hairline rules between rows. Use F2 tokens; add no new colours. Do **not** force the physical
13×8 cm aspect ratio — landscape 1.625:1 cannot hold six rows on a phone held upright, and
the ritual matters more than the geometry.

**Card row** (`card-row.tsx`). The entire row is a `next/link` to `/vocab/[entryId]`,
`display: block`, with the whole area tappable. Line 1: `term`. Line 2: `definition`; when
`definition` is null (enrichment `pending` or `failed`), render an em-dash `—` in muted
colour — never "loading", never a spinner, never blank. A small chevron on the right at
low opacity. Active state: a brief background tint, no animation longer than 150 ms.

**States of the card region:**

| Condition | What renders |
|---|---|
| Card exists for today | The rows. No button. |
| No card, `activeWordCount ≥ 1` | The nudge: one large primary button, **"Make today's card"**, and one line under it: *"One press. Six words."* |
| No card, `activeWordCount = 0`, no words at all | `card-empty.tsx`: *"No words yet."* + **Add a word** → `/vocab/new`, **Discover** → `/vocab?tab=discover` |
| No card, `activeWordCount = 0`, all mastered | `card-empty.tsx`: *"Every word mastered."* + the same two actions |
| Timezone unresolved | *"Set your timezone to start a card."* → `/onboarding`. No nudge button. |
| Card exists with fewer than 6 rows | The rows, plus `under-supplied-note.tsx`: *"3 words. Add more →"* → `/vocab/new` |

**Nudge button states.** Idle → pressed (`disabled`, `aria-busy="true"`, label "…") →
success (`router.refresh()`; the card replaces the button in place) or error (button
re-enabled, one muted line beneath: *"Couldn't make the card. Try again."*). Guard against
double submission with a `useTransition` pending flag **and** rely on server idempotency —
belt and braces, because the server guarantee is the real one.

Copy is terse everywhere. Roadmap principle 2: LLM text sprawls; this screen must not.

### Recent strip (`recent-strip.tsx`)

Seven days ending today, oldest at the left. Each cell: a single weekday letter above a mark.
Fixed height ~44 px, no wrapping, no horizontal scroll. The whole strip is one link to
`/calendar`. States are the same as the calendar's, minus `future`.

### `/calendar` — month view

```
┌─────────────────────────────┐
│  ‹      August 2026      ›  │
│  M  T  W  T  F  S  S        │  Monday-first
│              1  2  3  4     │
│  5  6  7  8  9 10 11        │
│  …                          │
│                             │
│  12 of 31 days              │
│  ✓ card   ✗ none            │
└─────────────────────────────┘
```

- **Monday-first** week. State it in the code; do not derive it from locale.
- 6 rows × 7 columns, fixed cell size, leading and trailing blanks for days outside the
  month. `/calendar` **may** scroll — the no-scroll rule applies only to `/today` — but at
  375×667 the grid plus legend should fit without it.
- **Navigation is clamped**: back to the month containing `anchor`, forward to the user's
  current local month. Out-of-range arrows are disabled and visibly dimmed, not hidden.
- Cells are **not** links. There is no per-day detail route in the roadmap route map. The
  only interactive cell is today, which navigates to `/today`.
- Below the grid: `cardCount of markableCount days` and a two-item legend.

### The six day states, precisely

| State | When | Mark | Feel |
|---|---|---|---|
| `card` | past day, `daily_cards` row exists | **✓** in the accent colour, full opacity | the record of a day kept |
| `miss` | past day, on or after `anchor`, no row | **✗** in a muted grey, ~40% opacity | quiet, factual, never red, never alarming |
| `today_card` | today, row exists | **✓** with a ring around the cell | today, done |
| `today_none` | today, no row | an **open ring**, no glyph inside | an invitation — **not** a cross. Today is not a failure until it is over |
| `future` | after today | the date number at low contrast, no mark | nothing to say yet |
| `pre_start` | before `anchor` | the date number at low contrast, no mark | before the user existed here. **A user who joined on 8 August must not see seven crosses for 1–7 August.** |

`anchor = min(earliest card_date, localDate(profile.created_at, tz))`, compared as strings
(ISO dates sort lexicographically). If neither exists, `anchor = today` and every earlier day
is `pre_start`.

The distinction between `today_none` and `miss`, and the existence of `pre_start`, are the
two things that keep this screen from feeling like a punishment chart. Get them right.

### Accessibility

- Marks carry `aria-label`: `"9 August — card"` / `"9 August — no card"` / `"9 August — today, no card yet"`.
- Never encode state by colour alone; the glyph is the signal, colour is reinforcement.
- Tap targets ≥ 44×44 px on card rows and calendar arrows.
- The nudge button is a real `<button>` with an accessible name.

---

## 10. Implementation steps

Each step is independently verifiable. Do them in order.

**1. Verify `DATE` round-trips as a string.**
Confirm F1's schema declares `card_date` and `last_shown_on` with `{ mode: 'string' }`; add
it if missing. Then insert one row with `card_date: '2026-08-09'`, read it back, and assert
`typeof row.cardDate === 'string' && row.cardDate === '2026-08-09'`. If a `Date` object comes
back, register a type parser for OID 1082 (`(v) => v`) in the db client module before going
further. *Verify:* the assertion passes.

**2. Write `lib/date/tz.ts`.**
All functions from §8. `Intl` formatter cache. UTC-only arithmetic. *Verify:* step 3.

**3. Write and run `scripts/check-tz.ts`.**
Assert every row of the §8 worked-example table, plus: `addDays('2026-02-28', 1) === '2026-03-01'`
(2026 is not a leap year), `addDays('2024-02-28', 1) === '2024-02-29'`,
`daysBetween('2026-07-31', '2026-08-01') === 1`, `weekdayOf('2026-08-09') === 0` (Sunday),
`isValidTimeZone('Asia/Jakarta') === true`, `isValidTimeZone('Mars/Olympus') === false`,
`isValidTimeZone('') === false`, `daysInMonth('2026-02').length === 28`,
`addMonths('2026-12', 1) === '2027-01'`. *Verify:* `npx tsx scripts/check-tz.ts` exits 0.

**4. Write the migration.**
`npx drizzle-kit generate` after adding the index (and the optional `timezone` column) to the
Drizzle schema. Apply to Neon. *Verify:* `\d vocab_entries` in psql shows
`vocab_entries_user_status_idx`.

**5. Write `lib/cards/schemas.ts`.**
Every zod schema from §6, exported. *Verify:* `npx tsc --noEmit` is clean.

**6. Write `lib/cards/selection.ts`.**
The exact SQL of §7 plus a typed wrapper `selectCardCandidates(tx, userId, cardDate)`.
*Verify:* step 7.

**7. Write and run `scripts/check-selection.sql`.**
Seed one fixture user with the eight entries of §7's worked example. Run the selection query
1000 times, tally how often each term appears. Assert: aplomb and bucolic appear 1000/1000;
pellucid > natter > maunder; obviate is the rarest but appears at least once. *Verify:*
the tallies match those inequalities.

**8. Write `lib/db/queries/cards.ts`.**
`resolveTimezone`, `getTodayCard`, `getRecentDays`, `getMonthCardDates`, `getCalendarAnchor`,
`countActiveWords`, `countAllWords`, and `createCard`. `createCard` is the transaction of §12:
insert-on-conflict-do-nothing, branch on whether a row came back, and only on a genuine
insert run selection → insert items → update `last_shown_on`. Read `POST` twice against the
transaction-isolation note in §12 before writing it. *Verify:* step 9.

**9. Write `app/api/cards/route.ts`.**
Session check → resolve timezone (409 if unresolved) → `today = localDate(new Date(), tz)` →
count active words (409 if 0) → `createCard` → fire `onCardCreated` after commit inside
try/catch → respond. *Verify:* with a signed-in session cookie,
`curl -X POST .../api/cards` returns `created: true` with 6 items; the **same command run
again** returns `created: false`, the same `card.id`, HTTP 200, and no new rows in
`daily_cards`.

**10. Write `lib/cards/hooks.ts`.**
The `CardCreatedEvent` type and the no-op `onCardCreated` of §11. *Verify:* card creation
still succeeds; a `console.log` inside the stub fires exactly once per genuine creation and
zero times on a repeat press.

**11. Build `/today`.**
`app/today/page.tsx` as a server component with `export const dynamic = 'force-dynamic'`.
Load timezone, today's card, recent seven days, and word counts in one pass. Compose header,
`recent-strip`, and the card region. `nudge-button.tsx` is the only client component.
*Verify:* all six card-region states of §9 render — force each by manipulating fixture data.

**12. Enforce and measure the no-scroll constraint.**
Apply the grid/flex/`min-height: 0` structure of §9. *Verify:* in Chrome DevTools device
mode at 375×667 and 375×812, with six rows and the longest term and definition in the
fixture data, `document.scrollingElement.scrollHeight <= document.scrollingElement.clientHeight`
and the card element's `scrollHeight <= clientHeight`. Then check on a real iPhone in Safari,
scrolling the page up and down to force the URL bar to collapse and expand.

**13. Write `app/api/cards/calendar/route.ts`.**
Validate `month`, resolve timezone, compute `anchor` and `today`, fetch the month's
`card_date` values into a `Set`, and classify every day of the month per §9. *Verify:*
`curl '.../api/cards/calendar?month=2026-08'` returns 31 days with correct states; a month
before the anchor returns all `pre_start`; a future month returns all `future`;
`?month=2026-13` returns 400.

**14. Build `/calendar`.**
Server component renders the current local month; `month-view.tsx` handles navigation and
refetches. Clamp both arrows. *Verify:* the current month matches the recent strip on
`/today` for the overlapping days; the back arrow disables at the anchor month; the forward
arrow disables at the current month.

**15. End-to-end pass at a date boundary.**
Set the fixture profile to `Pacific/Auckland`, press the button, and confirm `card_date`
matches Auckland's local date rather than the UTC date. Repeat with `America/Los_Angeles`.
*Verify:* both `card_date` values match the §8 table.

**16. Final sweep.**
Run §13's checklist end to end.

---

## 11. Shared contracts this feature exports

### `lib/cards/hooks.ts` — the seam F9 attaches to

F5 defines the event and calls a no-op. **F9 replaces the body of `onCardCreated`.** F5
never imports F9; F9 never modifies F5's card-creation logic. This is the whole contract.

```ts
export type CardCreatedEvent = {
  userId: string;
  cardId: string;
  /** User-local calendar date of the card, 'YYYY-MM-DD'. The authoritative date for
   *  streaks and every date-triggered badge. Never re-derive this from createdAt. */
  cardDate: string;
  /** IANA zone actually used to compute cardDate. */
  timezone: string;
  /** ISO instant, UTC, of the insert. */
  createdAt: string;
  /** 0–23 in the user's zone. Drives `midnight_oil` (00:00–04:00). */
  localCreatedAtHour: number;
  /** 0 = Sunday … 6 = Saturday, in the user's zone. Drives `sunday` and `fathers_day`. */
  localWeekday: number;
  /** Number of daily_card_items written (1–6). */
  itemCount: number;
  /** Entry ids placed on the card, in position order. */
  vocabEntryIds: string[];
  /** True when this is the user's first card ever. Drives `first_card`. */
  isFirstCardEver: boolean;
};

/**
 * Called exactly once per genuinely created card, AFTER the transaction commits.
 * NOT called when the nudge hits an existing card (created: false).
 *
 * F9 replaces this body with streak recomputation and badge awarding.
 * Contract for F9:
 *  - Must not throw. F5 wraps the call in try/catch and swallows, but a hook that
 *    throws on every card means silent breakage — handle your own errors.
 *  - Must be idempotent per cardId. Retries and duplicate delivery are possible.
 *  - Must not mutate daily_cards or daily_card_items.
 *  - May add OPTIONAL fields to CardCreatedEvent. May not remove or repurpose existing ones.
 */
export async function onCardCreated(_event: CardCreatedEvent): Promise<void> {
  // no-op in F5
}
```

Call site, in `app/api/cards/route.ts`, **after** the transaction commits and **only** when
`created === true`:

```ts
if (result.created) {
  try { await onCardCreated(buildEvent(result)); }
  catch (err) { console.error('[F5] onCardCreated failed', { cardId: result.card.id, err }); }
}
```

Failure of the hook must never fail the request. The card exists; the streak can be
recomputed. The reverse is not recoverable.

**Response extension point.** F9 may add an optional `stats` field to
`createCardResponseSchema` (e.g. `{ currentStreak, newBadges }`) so the nudge can show a
toast. F5 does not populate it and does not depend on it. Until F9 lands, the client's
`router.refresh()` is sufficient.

### Other exports

| Export | From | Consumers |
|---|---|---|
| `localDate`, `localHour`, `weekdayOf`, `addDays`, `daysBetween`, `isValidTimeZone`, `FALLBACK_TIMEZONE` | `lib/date/tz.ts` | F7 (validating the onboarding timezone), F9 (streak day arithmetic), F10 (entry dates) |
| `resolveTimezone(profile)` | `lib/db/queries/cards.ts` | Any feature needing the user's zone with the same fallback rules |
| `dailyCardSchema`, `cardItemSchema` | `lib/cards/schemas.ts` | F9, if it renders card history on `/profile` |
| `dayStateSchema` | `lib/cards/schemas.ts` | F9, if it reuses the mark vocabulary |
| `components/calendar/day-mark.tsx` | — | F9 for any streak visualisation |

**Invariants other features may rely on:**

1. `daily_cards` has at most one row per `(user_id, card_date)`, enforced in the database.
2. Every `daily_cards` row has between 1 and 6 `daily_card_items`. Zero-item cards are never
   created.
3. `daily_card_items.position` is 1-based and contiguous from 1.
4. `card_date` is always a user-local calendar date, never UTC.
5. A `daily_cards` row exists **if and only if** the user pressed the button that day.
   F9 may treat its presence as proof of the ritual.

---

## 12. Edge cases and failure modes

### Idempotency — the double tap

`UNIQUE (user_id, card_date)` is the guarantee. The transaction:

```
BEGIN                                  -- READ COMMITTED (Postgres default). Do NOT raise it.
  INSERT INTO daily_cards (user_id, card_date, timezone)
  VALUES ($1, $2, $3)
  ON CONFLICT (user_id, card_date) DO NOTHING
  RETURNING id, card_date, created_at;

  IF no row returned:
      SELECT the existing card and its items
      COMMIT
      RETURN { created: false, card }        -- no selection, no last_shown_on write

  ELSE:
      run the selection query (§7)
      INSERT the items, positions 1..n
      UPDATE vocab_entries SET last_shown_on = GREATEST(...) WHERE id = ANY(...)
      COMMIT
      RETURN { created: true, card }
```

Two concurrent presses: the second `INSERT` blocks on the unique index until the first
commits, then finds the conflicting row and inserts nothing. Under **READ COMMITTED** the
following `SELECT` takes a fresh snapshot and sees the committed row, so the loser returns
the winner's card. **Under REPEATABLE READ the `SELECT` would see the older snapshot, find
nothing, and the request would fail.** Do not change the isolation level.

Critically, the losing transaction runs no selection and writes no `last_shown_on`.

**Interactive transactions are required.** `drizzle-orm/neon-http` does not support them —
if F1 wired the HTTP driver, switch that module to `drizzle-orm/neon-serverless` with a
`Pool`. That is a legitimate F5 requirement, not a schema change.

*Fallback if interactive transactions are genuinely unavailable:* express the whole thing as
one statement with data-modifying CTEs (`ins` → `picked` → `items` → `upd`), gating `picked`
on `EXISTS (SELECT 1 FROM ins)`. It is atomic and race-safe but markedly harder to read.
Prefer the transaction.

### The full list

| Case | Behaviour |
|---|---|
| Double tap / double submit | Idempotent. Second press: HTTP 200, `created: false`, same `card.id`. No error, no second card. |
| Two devices press simultaneously | Same as above — the database, not the client, arbitrates. |
| Zero active words | 409 `no_active_words`. No card row. The day stays a cross. |
| 1–5 active words | Card created with that many items. `underSupplied: true`. Never padded. |
| Every word `mastered` | Same as zero active words, with different copy (§7). |
| A word is mastered *after* appearing on a card | The card still shows it. **Card items are a historical snapshot.** Never filter `daily_card_items` by current `status` when reading. Mastering only affects *future* selections. |
| A word is edited after appearing on a card | The card shows the current text — items reference the entry, they do not copy it. Acceptable; the card is a pointer, not a photocopy. |
| A vocab entry is deleted | `daily_card_items.vocab_entry_id` has no `ON DELETE` clause in the roadmap schema, so the default `NO ACTION` blocks the delete. **This is desirable** — it protects history. Flagged to F4 in §14. |
| Timezone missing or invalid, on write | 409 `timezone_missing`. **No card is created.** |
| Timezone missing or invalid, on read | UTC fallback for display; nudge button replaced by a link to `/onboarding`. |
| Timezone changed between cards | History untouched; new cards use the new zone. Repeated or skipped local dates are handled as in §8. |
| DST transition | No effect — dates never shift, only times. No special code. |
| Card created just before local midnight, viewed just after | `/today` correctly shows no card and offers the nudge. The recent strip shows yesterday's tick, so the card is visibly not lost. |
| Server clock skew | Vercel's clock is authoritative. The client's clock is never consulted. |
| Definition is null (`enrichment_status` `pending`/`failed`) | Row renders an em-dash. The word is still on the card. |
| A very long term | `white-space: nowrap` + ellipsis. Truncation is fine — the row taps through to the full detail page. |
| A very long definition | Same. One line, always. |
| Network failure on POST | Button re-enables, one muted error line. Retry is safe: worst case the card was created and the retry returns `created: false`. |
| Slow POST | Button `disabled` + `aria-busy`, label "…". No spinner overlay, no blocking modal. |
| `onCardCreated` throws | Caught and logged. The card stands. The request succeeds. |
| Calendar month with no cards | All `miss` (if within range) or `pre_start`. Never an error, never an empty screen. |
| Calendar navigated before the anchor | Arrow disabled. A hand-crafted request returns all `pre_start`. |
| Calendar navigated past the current local month | Arrow disabled. A hand-crafted request returns all `future`. |
| Malformed `?month=` | 400 `bad_month`. |
| Card row exists whose `vocab_entry_id` is dangling | Should be impossible (FK). If it occurs, skip the row rather than throwing; log an error. |
| Card exists with zero items | Should be impossible (guarded at creation). Render the empty state; do not crash. |
| Unauthenticated POST | 401. |
| User has never onboarded, hits `/today` directly | Page renders with the UTC fallback and the "Set your timezone" prompt. F1/F7's middleware may redirect first; F5 must not assume it does. |

---

## 13. Verification checklist

Run all of these. Each has a stated expected result.

### Timezone

- [ ] `npx tsx scripts/check-tz.ts` — exits 0, every assertion in step 3 passes.
- [ ] Fixture profile `Asia/Jakarta`; freeze server time at `2026-08-08T23:00:00Z`; press the
      button. **Expect `card_date = 2026-08-09`.**
- [ ] Fixture profile `America/Los_Angeles`; same instant `2026-08-09T01:00:00Z`.
      **Expect `card_date = 2026-08-08`.**
- [ ] Fixture profile `Pacific/Auckland`; instant `2026-12-31T11:05:00Z`.
      **Expect `card_date = 2027-01-01`.**
- [ ] Delete the profile row; POST. **Expect 409 `timezone_missing` and zero new rows in
      `daily_cards`.**
- [ ] Set `timezone = 'Not/AZone'`; POST. **Expect 409 `timezone_missing`.** Load `/today`.
      **Expect a rendered page with the onboarding prompt, no crash, no nudge button.**
- [ ] `SELECT pg_typeof(card_date) FROM daily_cards LIMIT 1;` → `date`. In app code, log
      `typeof card.cardDate` → `'string'`.

### Idempotency

- [ ] `curl -X POST .../api/cards` twice in a row. **Expect** first: 200 `created: true`;
      second: 200 `created: false`, identical `card.id`.
- [ ] `SELECT count(*) FROM daily_cards WHERE user_id = $u AND card_date = $today;` → **1**.
- [ ] Fire 10 concurrent POSTs: `seq 10 | xargs -P10 -I{} curl -s -X POST .../api/cards`.
      **Expect** exactly one `created: true`, nine `created: false`, no 500s, and one row
      in `daily_cards`.
- [ ] After the concurrent run, `SELECT count(*) FROM daily_card_items WHERE card_id = $c;`
      → **≤ 6** (and equal to the active word count if under six).

### Selection

- [ ] `psql -f scripts/check-selection.sql` — never-shown words appear in 1000/1000 draws;
      frequency ordering is pellucid > natter > maunder; obviate appears at least once.
- [ ] After a genuine creation: `SELECT term, last_shown_on FROM vocab_entries WHERE id = ANY(...)`
      → all six equal the card's `card_date`.
- [ ] After a repeat press (`created: false`): **no `last_shown_on` value changed.** Snapshot
      the column before and after and diff.
- [ ] Load `/today` five times and tap a row. **Expect no `last_shown_on` change.**
- [ ] Set one entry to `status = 'mastered'`, create tomorrow's card. **Expect it absent from
      the new card and still present on yesterday's card.**
- [ ] Create cards on two consecutive days with exactly 6 active words. **Expect identical
      word sets — this is correct, not a bug.**

### Under-supplied and empty

- [ ] Fixture with 3 active words → POST. **Expect** `created: true`, `items.length === 3`,
      positions `[1,2,3]`, `underSupplied: true`.
- [ ] `/today` with that card: three rows plus the "Add more" line, **no placeholder rows**.
- [ ] Fixture with 0 active words → POST. **Expect 409 `no_active_words`** and
      `SELECT count(*) FROM daily_cards WHERE card_date = $today` → **0**.
- [ ] `/today` with 0 active words: empty state, **no nudge button visible**.
- [ ] Fixture with 0 active but 4 mastered: the "Every word mastered." copy.

### No-scroll

- [ ] Chrome DevTools, 375×667, six rows, longest fixture strings:
      `document.scrollingElement.scrollHeight <= document.scrollingElement.clientHeight` → **true**.
- [ ] Same at 375×812 → **true**.
- [ ] Card element: `el.scrollHeight <= el.clientHeight` → **true** at both sizes.
- [ ] Real iPhone, Safari: swipe up and down to collapse and expand the URL bar. **Expect no
      page scroll and no content clipped behind the tab bar or the home indicator.**
- [ ] With three rows instead of six: still no scroll, rows share the space.
- [ ] Term of 40 characters and definition of 120 characters: both ellipsised on one line,
      still no scroll.

### Calendar

- [ ] `curl '.../api/cards/calendar?month=2026-08'` → 31 day objects, ascending, no gaps.
- [ ] A day with a card in the past → `card`. A past day without → `miss`.
- [ ] Today with a card → `today_card`; without → `today_none` (**and not `miss`**).
- [ ] Tomorrow → `future`.
- [ ] A day before `anchor` → `pre_start`. **New user who joined 8 August: 1–7 August show no
      crosses.**
- [ ] `?month=2026-13` → 400 `bad_month`. `?month=August` → 400.
- [ ] `/calendar` UI: Monday-first header; back arrow disabled at the anchor month; forward
      arrow disabled at the current local month.
- [ ] The recent strip on `/today` and the calendar agree on every overlapping day.

### Hook

- [ ] `console.log` inside `onCardCreated` fires **once** on a genuine creation, **zero**
      times on a repeat press.
- [ ] The payload's `cardDate` equals the row's `card_date`; `localWeekday` matches the real
      weekday of that date; `localCreatedAtHour` matches the local wall-clock hour.
- [ ] First card ever → `isFirstCardEver: true`; second card → `false`.
- [ ] Make `onCardCreated` throw. **Expect the POST still returns 200 with `created: true`,
      the card exists, and the error is logged.**

### Sanity

- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run lint` clean.
- [ ] No import of anything under `lib/stats/`, `app/profile/`, or any F9 path anywhere in
      F5's files: `grep -rn "stats\|badge\|streak" app/today app/calendar lib/cards lib/db/queries/cards.ts`
      returns only the comments in `hooks.ts`.
- [ ] `grep -rn "toISOString\|getDate()\|getMonth()\|getDay()" lib/ app/` returns nothing
      outside `lib/date/tz.ts` — no ad-hoc date math anywhere else.
- [ ] No `setInterval`, `cron`, or `revalidate` path creates a card:
      `grep -rn "createCard" app/ lib/` shows call sites only in `app/api/cards/route.ts`.

---

## 14. Open questions / discrepancies with `ROADMAP_v0.1.0.md`

No contradictions with the roadmap were found. The following are gaps the roadmap does not
decide, with the choice F5 makes and why. Anything marked **needs a decision** should be
confirmed before or during implementation.

1. **Words with `enrichment_status` `pending` or `failed` are eligible for the card.**
   The roadmap's selection rule filters only on `status='active'`. F5 includes unenriched
   words and renders an em-dash for the missing definition. The alternative — hiding them —
   would silently shrink a small collection and violate "show what exists". *Low risk;
   revisit if F3's enrichment proves slow or unreliable.*

2. **A card requires at least one active word.** The roadmap says "if fewer than 6, show what
   exists" but does not say what zero means. F5 refuses to create a zero-item card, because a
   card row is F9's proof that the ritual happened. **Confirm this is the intent** — it means
   a user with no words cannot keep a streak, which seems right.

3. **`daily_cards.timezone` column proposed** (§5B). Additive and optional. Skipping it
   costs only diagnosability. **Needs a decision** at implementation time.

4. **`FALLBACK_TIMEZONE = 'UTC'` for reads.** UTC is the honest neutral choice, but the
   product's only user is in `Asia/Jakarta`, where UTC is 7 hours behind and produces a
   visibly wrong date between 00:00 and 07:00 local. Since the fallback is display-only and
   the nudge is blocked without a real timezone, the blast radius is one cosmetic session.
   *If the fallback ever becomes user-visible for long, reconsider.*

5. **Deleting a vocab entry that appears on a card will fail.** The roadmap gives
   `daily_card_items.card_id` an `ON DELETE CASCADE` but says nothing about
   `vocab_entry_id`, so the default `NO ACTION` blocks the delete. F5 treats this as correct —
   card history must not be silently rewritten. **F4 must be told**: implement "remove a
   word" as `status='mastered'` or a soft delete, not a hard `DELETE`. Flagged rather than
   changed, since F4 owns deletion.

6. **Interactive transactions.** F5 needs them (§12). If F1 wired
   `drizzle-orm/neon-http`, that module must move to `drizzle-orm/neon-serverless` with a
   `Pool`. This is an F1 file change made by F5. **Confirm with whoever built F1**, or use
   the documented single-statement CTE fallback.

7. **Monday-first calendar weeks.** The roadmap does not say. Chosen for an Indonesian /
   British-English audience. Trivial to flip if wrong.

8. **Calendar cells are not tappable.** There is no `/calendar/[date]` route in the roadmap
   route map, and adding one would violate "every screen explainable in one sentence" for
   little gain. Marks only. *Revisit in a later version if the history feels inert.*

9. **`clientTimezone` in the POST body is advisory only.** It sets `timezoneMismatch` so the
   UI can hint at updating the profile. Whether that hint is *shown*, and where it leads, is
   arguably F7's. F5 returns the flag and renders nothing unless F7 asks for it.

10. **No test framework is assumed.** F1's plan does not mention one, so F5 ships executable
    checks as `scripts/check-tz.ts` (`npx tsx`) and `scripts/check-selection.sql` (`psql`).
    If a runner (vitest) exists by the time F5 is built, port `check-tz.ts` to
    `lib/date/tz.test.ts` instead — the assertions are unchanged.

11. **The layout budget in §9 is provisional** until F2 fixes header and tab-bar heights.
    The flex structure absorbs any difference automatically, but the point at which the
    definition line disappears will move. **Reconcile the numbers with F2 during step 12.**
