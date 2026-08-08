> ## ⚠ SUPERSEDED IN PART — read `ROADMAP_v0.1.0.md` § Reconciliation Decisions first.
>
> - **[R15]** Your §9.4 hook contract is superseded by F5's `CardCreatedEvent` in `lib/cards/hooks.ts`, exactly as you proposed.
> - **[R12]** `full_week` fires once per completed week (`runLength % 7 === 0`) — your reading is adopted.
> - **[R13]** Collector level is undefined at 0 words; render "no words yet".
> - **[R11]** `user_stats` is a cache only; `/profile` recomputes on read. `last_card_on` approved.
>
> These plans were written in parallel by agents that could not see each other.
> The Reconciliation section wins over anything below.

# F9 — Gamification: Streaks, Levels, Badges & Profile Page

> Read `ROADMAP_v0.1.0.md` first. It is the authoritative shared contract. Every level
> title, badge key, and threshold in this document is copied verbatim from the roadmap's
> "Gamification content" section. If this file appears to contradict the roadmap,
> **the roadmap wins** — stop and report, do not guess.

---

## 1. Goal

Make a long-time, consistent user feel genuine pride when they open `/profile` — the page
should read like the record of a habit kept, not a dashboard of engagement metrics. Every
number shown must be true, and the page must never imply the user has failed, lapsed, or
is about to lose something. A brand-new user sees the same page and finds it inviting
rather than barren, without being credited with achievements they do not have.

---

## 2. Depends on / blocks

### Depends on

| Feature | What F9 needs from it |
|---|---|
| **F1** | `users`, `profiles`, `daily_cards`, `vocab_entries`, `user_stats`, `badges_awarded` tables and migrations; Drizzle client; Auth.js session helper (`auth()`); the bottom tab bar with the **Profile** item already routing to `/profile`. |
| **F2** | Design tokens and shared components: card, list row, empty state, **badge chip**, button. F9 renders with F2 primitives and adds no new global tokens. |
| **F7** | `profiles.timezone` populated at onboarding. Every date boundary in F9 depends on it. |
| **F5** | The **card-created hook**. F9 attaches to it; it does not create its own trigger. See §9.4. F5 also owns the `/today` screen where the reveal moment renders. |
| **F3** | Writes `vocab_entries` with `source='manual'`. F9 only *reads* that count. No hook needed. |

### Blocks

Nothing. F9 is a leaf feature. F5, F6, F8, F10 do not depend on it.

### Ordering note

F9 must land **after** F5, because F5 owns the hook F9 attaches to and the screen the
reveal renders on. If F5's plan is not yet written when this is executed, see §15.1 — the
hook contract below is a *proposal from F9* and must be reconciled with F5 before coding.

---

## 3. In scope / explicitly out of scope

### In scope

- The `/profile` route and everything on it.
- Streak computation (current + longest) over `daily_cards.card_date` in the user's timezone.
- Streak-level and collector-level resolution and "progress to next".
- Badge evaluation on card creation, and the `badges_awarded` writes.
- Maintaining the `user_stats` cache, and keeping the read path truthful when the cache is stale.
- The badge / level-up **reveal moment** on the `/today` screen (rendered by an F9-owned
  component that F5 mounts).
- A recompute / backfill routine for `user_stats` and `badges_awarded`.

### Explicitly out of scope

- **Notifications, reminders, push, email of any kind.** Roadmap-level prohibition.
- **Loss-aversion mechanics.** No "your streak is at risk", no countdown, no freeze tokens,
  no repair-your-streak purchase, no red warning states.
- **Leaderboards, sharing, social comparison, following.** Roadmap-level prohibition.
- Points, XP bars beyond the two level progress bars, or any currency.
- Badge notifications for badges earned in the past (silent backfill only — see §11).
- Surfacing a *collector* level-up at the moment of adding a word. That happens on F3's
  screen and F3 owns it. F9 exports `resolveCollectorLevel()` for F3 to use later if it
  chooses. Not built here.
- Changing the tab bar, adding routes beyond `/profile` and its two API endpoints.
- Any new design tokens, colours, or fonts. F2 owns those.
- Editing the user's name/avatar. They come from Google via `users.name` / `users.image`
  and are read-only in v0.1.0.

---

## 4. Files to create

### Pure logic (no DB, no React, no I/O — all unit-testable)

| Path | Purpose |
|---|---|
| `lib/gamification/dates.ts` | Local-date primitives: `localDateOf`, `localHourOf`, `toDayNumber`, `fromDayNumber`, `dayOfWeek`, `addDays`, `formatSinceDate`. The only place `Intl.DateTimeFormat` is used for day boundaries. |
| `lib/gamification/streaks.ts` | `computeStreaks(dates, today)` and `runLengthEndingAt(dayNums, target)`. Pure. |
| `lib/gamification/levels.ts` | The two threshold tables (verbatim from the roadmap) and `resolveStreakLevel` / `resolveCollectorLevel`, both returning a `LevelProgress`. |
| `lib/gamification/badges.ts` | `BADGE_CATALOG` (key → title, in shelf order) and `evaluateBadges(ctx): BadgeKey[]`. Pure; identical code path for live awarding and backfill. |
| `lib/gamification/types.ts` | `IsoDate`, `BadgeKey`, `LevelProgress`, `StreakResult`, `BadgeContext`, `CardCreatedResult`. |
| `lib/gamification/schemas.ts` | zod schemas for every API boundary in §9. |

### Data access

| Path | Purpose |
|---|---|
| `lib/db/queries/stats.ts` | `getCardDates`, `getManualWordCount`, `readUserStats`, `upsertUserStats`, `getProfileStats` (the single read used by the page). |
| `lib/db/queries/badges.ts` | `awardBadges` (multi-row `ON CONFLICT DO NOTHING`), `getBadgeCounts`. |

### Orchestration

| Path | Purpose |
|---|---|
| `lib/gamification/onCardCreated.ts` | The F5 hook implementation: recompute stats, evaluate + award badges, detect level-up, return the reveal payload. Runs inside F5's card-creation transaction. |
| `lib/gamification/recompute.ts` | `recomputeUserGamification(userId, opts)` — rebuild `user_stats` and replay every badge from `daily_cards` history. Shared by the API route and the CLI script. |

### Routes and UI

| Path | Purpose |
|---|---|
| `app/profile/page.tsx` | The `/profile` server component. Reads via `getProfileStats`, renders header/stats/levels/shelf or the empty state. |
| `app/profile/loading.tsx` | Skeleton matching the profile layout so the page does not flash. |
| `app/profile/_components/ProfileHeader.tsx` | Avatar, Google name, and the "keeping a card since 8 August 2026" line. |
| `app/profile/_components/StreakBlock.tsx` | Current streak, longest streak, and the quiet not-yet-today caption. |
| `app/profile/_components/CountersRow.tsx` | Total cards and total manual words. |
| `app/profile/_components/LevelBlock.tsx` | One level: title, progress bar, "N more → Next Title". Used twice. |
| `app/profile/_components/BadgeShelf.tsx` | The shelf: earned chips with `×N`, then unearned slots at low emphasis. |
| `app/profile/_components/ProfileEmptyState.tsx` | The zero-card variant of the middle of the page. |
| `components/gamification/RewardToast.tsx` | Client component: the reveal moment. Fixed-position, zero-layout-impact overlay mounted by F5's `/today` screen. |
| `app/api/profile/stats/route.ts` | `GET` — the same payload the page uses, for client refresh and for manual verification. |
| `app/api/profile/recompute/route.ts` | `POST` — recompute the signed-in user's own stats and badges. |

### Script and tests

| Path | Purpose |
|---|---|
| `scripts/recompute-stats.ts` | CLI backfill: `--all`, `--user=<uuid\|email>`, `--dry-run`, `--prune`. |
| `lib/gamification/__tests__/dates.test.ts` | Timezone, DST, and day-number arithmetic cases. |
| `lib/gamification/__tests__/streaks.test.ts` | Every worked example in §6, plus the future-date and empty cases. |
| `lib/gamification/__tests__/levels.test.ts` | Every band boundary in both tables, exact title strings. |
| `lib/gamification/__tests__/badges.test.ts` | Every badge key, each with a positive and a negative case. |

---

## 5. Data

### Tables read

| Table | Columns | Why |
|---|---|---|
| `users` | `id`, `name`, `image` | Header. Read-only. |
| `profiles` | `user_id`, `timezone` | **Every** day boundary. If missing, see §13.1. |
| `daily_cards` | `user_id`, `card_date`, `created_at` | Source of truth for streaks and for badge replay. |
| `vocab_entries` | `user_id`, `source` | Manual word count → collector level. |
| `user_stats` | all | Cache read + consistency check. |
| `badges_awarded` | `user_id`, `badge_key`, `awarded_for_date` | Shelf counts. |

### Tables written

| Table | When |
|---|---|
| `user_stats` | On the card-created hook (upsert); on recompute; opportunistically on `/profile` read if the cache disagrees with the truth (§5.3). |
| `badges_awarded` | On the card-created hook; on recompute. Insert-only (`ON CONFLICT DO NOTHING`). Deletes only via `scripts/recompute-stats.ts --prune`. |

### 5.1 Proposed schema addition (one index, no columns)

```sql
CREATE INDEX IF NOT EXISTS idx_vocab_entries_user_source
  ON vocab_entries (user_id, source);
```

**Justification.** The profile read counts `vocab_entries WHERE user_id = $1 AND source = 'manual'`.
The roadmap's only stated index on that table is `UNIQUE (user_id, lower(term))`, which cannot
serve this filter efficiently. This is an additive index, permitted by the roadmap's
"Feature plans may add columns and indexes with justification". No column is renamed or
restructured.

`daily_cards` needs no addition: `UNIQUE (user_id, card_date)` already provides the index
that `WHERE user_id = $1 ORDER BY card_date` uses. `badges_awarded` likewise via
`UNIQUE (user_id, badge_key, awarded_for_date)`.

### 5.2 Rejected schema addition: `user_stats.total_manual_words`

The profile must show total manual words, and `user_stats` has no column for it. **Do not
add one.** Adding it would require F3 (vocab capture) and F4 (mastered toggle) to call an
F9 write hook on every vocab mutation — a cross-feature coupling F9 does not own and cannot
verify. Instead, count live:

```sql
SELECT count(*)::int FROM vocab_entries WHERE user_id = $1 AND source = 'manual';
```

At hobby scale this is a single indexed count. It is always correct and needs no invalidation.
Revisit only if the profile page shows measurable latency, which at these row counts it will not.

**Mastered words still count.** "Count of manually added words" is a record of what the user
collected. Mastering a word retires it from daily cards; it does not un-collect it. Demoting
someone's collector level for succeeding would be the exact opposite of this feature's goal.
Filter on `source = 'manual'` only — never on `status`.

### 5.3 What `user_stats` is for, and its one honest limitation

`user_stats` is a write-time cache, written by the card-created hook. Three of its fields are
**monotonic and safe to trust**: `longest_streak`, `total_cards`, `first_card_on`. They only
ever change when a card is created.

`current_streak` is **not** safe to trust. It decays with the mere passage of time: a user
whose last card was 2026-08-07 has `current_streak = 5` written on that date, and that value
is still sitting in the row on 2026-09-01 when the true current streak is 0. No write happens
to correct it, because the user did nothing.

**Rule:** `user_stats.current_streak` is only valid on the local date of its `updated_at`.
`/profile` therefore recomputes streaks from `daily_cards` on every read (see §6.4) and treats
`user_stats` as a cache to *verify and repair*, not to display. Any other consumer (e.g. if F5
shows a streak on `/today`) must apply the same rule.

---

## 6. Streak computation

### 6.0 Vocabulary

- **Local date** — the user's calendar date in `profiles.timezone`, as `YYYY-MM-DD`.
- **`today`** — `localDateOf(new Date(), timezone)`, computed **server-side**. The browser's
  timezone is ignored; the profile timezone is authoritative.
- **Day number** — days since 1970-01-01, derived from the date *string*, never from a
  `Date` parsed in local time.

### 6.1 The primitives (`lib/gamification/dates.ts`)

```ts
export type IsoDate = string & { readonly __iso: unique symbol }; // "YYYY-MM-DD"

/** The user's local calendar date at a given instant. */
export function localDateOf(instant: Date, timeZone: string): IsoDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}` as IsoDate;
}

/** The user's local wall-clock hour, 0..23, at a given instant. */
export function localHourOf(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant);
  return Number(parts.find((p) => p.type === 'hour')!.value);
}

/** Days since 1970-01-01. Derived from the string; no timezone involved. */
export function toDayNumber(d: IsoDate): number {
  const [y, m, day] = d.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, day) / 86_400_000);
}

export function fromDayNumber(n: number): IsoDate {
  return new Date(n * 86_400_000).toISOString().slice(0, 10) as IsoDate;
}

export function addDays(d: IsoDate, n: number): IsoDate {
  return fromDayNumber(toDayNumber(d) + n);
}

/** 0 = Sunday … 6 = Saturday. 1970-01-01 was a Thursday (=4). */
export function dayOfWeek(d: IsoDate): number {
  return (((toDayNumber(d) + 4) % 7) + 7) % 7;
}

/** "8 August 2026" — the since-line format. */
export function formatSinceDate(d: IsoDate): string {
  const [y, m, day] = d.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, day)));
}
```

**Why this shape.** Once a local date has been resolved to a string, all further arithmetic
is on integers. DST, leap seconds, and offset changes cannot corrupt it, because a calendar
date has no duration. `hourCycle: 'h23'` is required — the default can yield `"24"` or a
12-hour value depending on locale data.

Two footguns to avoid, both enforced by tests:
- `Date.UTC` maps years 0–99 to 1900–1999. Card dates are always ≥ 2026, so this cannot
  occur, but `toDayNumber` must not be reused for arbitrary input.
- Never call `new Date("2026-08-08T00:00:00")` (no `Z`) — it parses in *server* local time.

### 6.2 What breaks a streak

A streak is a run of **consecutive local calendar dates** on which the user has a
`daily_cards` row. `UNIQUE (user_id, card_date)` guarantees at most one card per date, so the
run length equals the card count in the run.

- A streak **breaks** when a local calendar date passes with no card *and* a later date has a
  card. The break is only knowable in retrospect — from the gap, not from the clock.
- **The current streak is the run ending at `today` or at `yesterday`.** If the most recent
  card date is neither, the current streak is 0.
- **Not having made today's card does not break anything.** The day is not over. A user who
  made a card yesterday and has not yet made one today has a current streak that includes
  yesterday, and the UI must present it as intact.
- Nothing outside `daily_cards` affects a streak. Adding words, mastering words, journaling,
  and chatting are all irrelevant.
- Deleting a card (not possible in v0.1.0) would shorten the run at the next recompute. There
  is no repair mechanism and none is wanted.

### 6.3 The algorithm (`lib/gamification/streaks.ts`)

```ts
export interface StreakResult {
  currentStreak: number;
  longestStreak: number;
  totalCards: number;
  firstCardOn: IsoDate | null;
}

/**
 * @param dates  every card_date for the user, any order. Duplicates tolerated.
 * @param today  the user's local date right now.
 */
export function computeStreaks(dates: IsoDate[], today: IsoDate): StreakResult {
  if (dates.length === 0) {
    return { currentStreak: 0, longestStreak: 0, totalCards: 0, firstCardOn: null };
  }
  const nums = [...new Set(dates.map(toDayNumber))].sort((a, b) => a - b);

  let longest = 1;
  let run = 1;                       // length of the run ending at nums[i]
  for (let i = 1; i < nums.length; i++) {
    run = nums[i] === nums[i - 1] + 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }
  // After the loop, `run` is the length of the final run — the one ending at the last date.

  const last = nums[nums.length - 1];
  const t = toDayNumber(today);
  const current = last >= t - 1 ? run : 0;

  return {
    currentStreak: current,
    longestStreak: longest,
    totalCards: nums.length,
    firstCardOn: fromDayNumber(nums[0]),
  };
}

/** Length of the consecutive run ending exactly at `target`. 0 if `target` has no card. */
export function runLengthEndingAt(dayNums: number[], target: number): number {
  const set = new Set(dayNums);
  if (!set.has(target)) return 0;
  let n = 0;
  for (let d = target; set.has(d); d--) n++;
  return n;
}
```

`last >= t - 1` rather than `last === t || last === t - 1` so that a card dated in the
*future* — possible after a westward timezone change, see §6.5 Example D — still anchors the
current streak instead of silently zeroing it.

Complexity is O(n log n) on a list that grows by at most 365 rows per year. No pagination,
no windowing, no materialised view.

### 6.4 The query

One statement, served by the existing unique index:

```sql
SELECT card_date FROM daily_cards WHERE user_id = $1 ORDER BY card_date ASC;
```

Drizzle returns `card_date` as a `YYYY-MM-DD` string for a `date` column. **Assert this in a
test** (`streaks.test.ts` or an integration check) — if the driver is configured to parse
dates into JS `Date` objects, every computation in this feature silently shifts by a
timezone offset. If it does return `Date`, convert with `d.toISOString().slice(0,10)` at the
query boundary and nowhere else.

### 6.5 Worked examples

Assume `profiles.timezone = 'Asia/Jakarta'` (UTC+7) unless stated.

**A — Not yet today (the case that must not look like failure).**

Now: `2026-08-08 09:12` local (`2026-08-08T02:12Z`). `today = 2026-08-08`.
Cards: `2026-08-04, 2026-08-05, 2026-08-06, 2026-08-07`.

- `nums = [20669, 20670, 20671, 20672]` (illustrative), all consecutive.
- Final `run = 4`; `longest = 4`.
- `last = 2026-08-07 = t - 1` → `last >= t - 1` holds → `currentStreak = 4`.

**Result: 4, not 0, not 3.** The UI shows `4 days`, and under it, in muted text,
`today's card is not made yet`. No colour change, no icon, no urgency. Compare: at
`2026-08-08 23:50` the answer is still 4 — the app never counts down.

**B — Broken streak.**

Now: `2026-08-08`. Cards: `2026-08-01, 2026-08-02, 2026-08-03`.

- Final `run = 3`; `longest = 3`.
- `last = 2026-08-03`, `t - 1 = 2026-08-07` → `last < t - 1` → `currentStreak = 0`.

Profile shows current streak `0`, longest streak `3`, streak **level `Pocket Fuzz`** —
because levels are keyed on *longest* streak (§7), a lapse never takes a title away. The
copy is `no streak right now`, followed by nothing else. No "you lost your 3-day streak",
no "start again!", no prompt.

**C — Timezone boundary at the moment of creation.**

`profiles.timezone = 'Pacific/Auckland'` (UTC+13 in January). The user presses the button at
`2026-01-01 00:20` NZDT, which is `2025-12-31T11:20Z`.

- Wrong (server/UTC date): `card_date = 2025-12-31` → `year_end` badge, and the card lands on
  the previous year's streak.
- Correct: `localDateOf(createdAt, 'Pacific/Auckland') = 2026-01-01` → `card_date = 2026-01-01`,
  badges `new_year` **and** `midnight_oil` (`localHourOf = 0 < 4`).

If they had also made a card on `2025-12-31` local, `nums` contains both `2025-12-31` and
`2026-01-01`, which are consecutive day numbers — the run crosses the year boundary
unbroken. Year rollover is not special-cased anywhere.

**D — Timezone change (travel).**

Cards on `2026-08-01 … 2026-08-05` while in `Asia/Jakarta`. The user updates
`profiles.timezone` to `America/Los_Angeles` (UTC−7). On what is `2026-08-06` in Los Angeles
they make a card → `card_date = 2026-08-06`. `nums` = Aug 1…6, consecutive, `currentStreak = 6`.
Unbroken, correct.

The reverse direction can produce an oddity: flying west-to-east can make the user's local
date jump forward by two, leaving a genuine gap; flying east-to-west can make "today"
repeat, and since `UNIQUE (user_id, card_date)` allows only one card per date, the second
card on a repeated date is rejected by F5.

**Policy: never rewrite history and never compensate.** Existing `card_date` values were
correct when written. A gap caused by crossing the date line is indistinguishable in the data
from a missed day, and any heuristic to guess at it would be a lie in the other direction.
Document it; do not code around it.

**E — DST.**

`America/New_York`, cards on `2026-03-07`, `2026-03-08` (spring forward, a 23-hour day), and
`2026-03-09`. Their day numbers are consecutive integers; the run is 3. Day length is
irrelevant because §6.1 does arithmetic on date strings, not on elapsed milliseconds.

A related detail for `midnight_oil`: a few zones start DST at midnight (e.g. `America/Santiago`),
so on that one night the local hours `00:00–00:59` do not exist. The badge window is
`00:00–04:00`, still at least three hours wide on such a night. No special handling.

**F — Empty and single-card.**

- `dates = []` → `{ 0, 0, 0, null }`.
- `dates = [today]` → `{ current: 1, longest: 1, total: 1, firstCardOn: today }`.
- `dates = [today - 1]` → `{ current: 1, longest: 1, ... }` — Example A with n=1.

---

## 7. Level resolution

### 7.1 The tables (verbatim from the roadmap — do not reword)

```ts
// lib/gamification/levels.ts

export const STREAK_LEVELS = [
  { min:   0, title: 'Blank Card' },
  { min:   3, title: 'Pocket Fuzz' },
  { min:   7, title: 'The Small Scribe' },
  { min:  14, title: 'Margin Scribbler' },
  { min:  30, title: 'Keeper of the Pocket' },
  { min:  60, title: "The Uncle's Apprentice" },
  { min: 100, title: 'Lexicon Smuggler' },
  { min: 200, title: 'Walking Errata' },
  { min: 365, title: 'Dickens Would Nod' },
] as const;

export const COLLECTOR_LEVELS = [
  { min:    1, title: 'Word Picker' },
  { min:   10, title: 'Jam Jar of Words' },
  { min:   25, title: 'Shelf of Odds' },
  { min:   50, title: 'Bag Man of Nouns' },
  { min:  100, title: 'Private Collector' },
  { min:  250, title: 'Hoarder of Rare Speech' },
  { min:  500, title: 'Curator of Forgotten Tongues' },
  { min: 1000, title: "Barnaby's Ghost" },
] as const;
```

The roadmap states bands as inclusive ranges (`0–2`, `3–6`, …); since they are contiguous,
storing only `min` is equivalent and removes the chance of an off-by-one in a duplicated
upper bound. The band's upper bound is `next.min - 1`.

### 7.2 Which number feeds which table

| Level | Input | Source |
|---|---|---|
| Streak level | **`longestStreak`** — "by longest streak ever achieved" (roadmap) | `computeStreaks(...).longestStreak` |
| Collector level | **`totalManualWords`** — "count of manually added words" | `count(vocab_entries WHERE source='manual')`, all statuses |

Using *longest* rather than *current* is deliberate and load-bearing for the goal of this
feature: a title, once earned, is never taken away. A user who kept a card for 200 days and
then stopped is still `Walking Errata`. The current streak is reported separately and
honestly, but it does not demote anyone.

### 7.3 Resolver and "progress to next"

```ts
export interface LevelProgress {
  index: number;            // band index
  title: string;
  bandMin: number;
  value: number;            // the input number
  nextTitle: string | null; // null at the top band
  nextAt: number | null;    // the next band's min
  remaining: number | null; // nextAt - value
  progress: number;         // 0..1 within the current band; 1 at the top band
}

function resolve(bands: readonly { min: number; title: string }[], value: number): LevelProgress | null {
  let i = -1;
  for (let k = 0; k < bands.length; k++) if (value >= bands[k].min) i = k;
  if (i === -1) return null;                        // below the first band
  const band = bands[i];
  const next = bands[i + 1];
  if (!next) {
    return { index: i, title: band.title, bandMin: band.min, value,
             nextTitle: null, nextAt: null, remaining: null, progress: 1 };
  }
  const span = next.min - band.min;
  return {
    index: i, title: band.title, bandMin: band.min, value,
    nextTitle: next.title, nextAt: next.min, remaining: next.min - value,
    progress: Math.min(1, Math.max(0, (value - band.min) / span)),
  };
}

export const resolveStreakLevel    = (longestStreak: number) => resolve(STREAK_LEVELS, longestStreak);
export const resolveCollectorLevel = (manualWords: number)   => resolve(COLLECTOR_LEVELS, manualWords);
```

`resolveStreakLevel` never returns `null` — the first band starts at 0.
`resolveCollectorLevel(0)` **does** return `null`; the roadmap's collector table starts at 1.
See §15.2 and §10.6 for how the UI renders that.

### 7.4 Worked level examples

| Input | Table | Title | Next | remaining | progress |
|---|---|---|---|---|---|
| `longest = 0` | streak | Blank Card | Pocket Fuzz | 3 | 0.00 |
| `longest = 2` | streak | Blank Card | Pocket Fuzz | 1 | 0.67 |
| `longest = 3` | streak | Pocket Fuzz | The Small Scribe | 4 | 0.00 |
| `longest = 10` | streak | The Small Scribe | Margin Scribbler | 4 | 0.43 |
| `longest = 364` | streak | Walking Errata | Dickens Would Nod | 1 | 0.99 |
| `longest = 365` | streak | Dickens Would Nod | — | — | 1.00 |
| `longest = 900` | streak | Dickens Would Nod | — | — | 1.00 |
| `words = 0` | collector | *(null)* | — | — | — |
| `words = 1` | collector | Word Picker | Jam Jar of Words | 9 | 0.00 |
| `words = 24` | collector | Jam Jar of Words | Shelf of Odds | 1 | 0.93 |
| `words = 1000` | collector | Barnaby's Ghost | — | — | 1.00 |

### 7.5 Copy for progress

- Streak: `` `${remaining} more day${remaining === 1 ? '' : 's'} → ${nextTitle}` ``
- Collector: `` `${remaining} more word${remaining === 1 ? '' : 's'} → ${nextTitle}` ``
- Top band, both: `nothing above this` (dry, and true).

Note "more days" here means *more consecutive days than the longest run so far*, which is
what crossing the threshold requires. The phrasing is deliberately not "days until" — there
is no deadline.

---

## 8. Badge evaluation

### 8.1 The catalog (keys and titles verbatim from the roadmap)

```ts
// lib/gamification/badges.ts — shelf order is display order
export const BADGE_CATALOG = [
  { key: 'first_card',             title: "The Uncle's Trick" },
  { key: 'full_week',              title: 'Full Week Ration' },
  { key: 'sunday',                 title: 'No Weekend Without Ration Card' },
  { key: 'midnight_oil',           title: 'Burning the Midnight Oil' },
  { key: 'new_year',               title: 'Resolution, Documented' },
  { key: 'womens_day',             title: 'Words for Her' },
  { key: 'world_book_day',         title: "The Bard's Regard" },
  { key: 'fathers_day',            title: 'For the Old Man' },
  { key: 'indonesia_independence', title: 'National Speaker' },
  { key: 'ibu',                    title: 'Ibu Would Be Proud' },
  { key: 'christmas',              title: 'Ghost of Christmas Vocab' },
  { key: 'year_end',               title: 'Last Word of the Year' },
  { key: 'leap_day',               title: 'Leap Year Lexicographer' },
] as const;

export type BadgeKey = (typeof BADGE_CATALOG)[number]['key'];
```

Thirteen badges, all thirteen from the roadmap, no additions.

### 8.2 The evaluator

```ts
export interface BadgeContext {
  cardDate: IsoDate;        // the card's user-local calendar date
  createdAt: Date;          // the instant the row was created (timestamptz)
  timezone: string;         // IANA, from profiles.timezone
  isEarliestCard: boolean;  // this card is the user's earliest by card_date
  runLength: number;        // consecutive-day run ending exactly at cardDate (>= 1)
}

export function evaluateBadges(ctx: BadgeContext): BadgeKey[];
```

**Pure. No database access, no `new Date()`, no ambient clock.** This is the single most
important property in this section: the live award path (§9.4) and the backfill (§11) call
*this same function*, so replaying history can never disagree with what was awarded live.

All awards use `awarded_for_date = ctx.cardDate`. Insertion is
`ON CONFLICT (user_id, badge_key, awarded_for_date) DO NOTHING`, which makes every path
idempotent — running the backfill ten times awards nothing new.

### 8.3 Per-badge trigger conditions

Let `[Y, M, D] = cardDate.split('-').map(Number)` and `dow = dayOfWeek(cardDate)` (0 = Sunday).

| Key | Title | Exact condition | Notes |
|---|---|---|---|
| `first_card` | The Uncle's Trick | `ctx.isEarliestCard === true` | Live: true iff `totalCards === 1` after the insert. Backfill: true for the chronologically first card only. F5 never creates backdated cards, so the two agree. |
| `full_week` | Full Week Ration | `ctx.runLength > 0 && ctx.runLength % 7 === 0` | **History-based.** Awarded on the 7th, 14th, 21st… consecutive day. A 30-day run yields ×4 — four completed weeks of rations. See §15.3: the roadmap wording is ambiguous and this is F9's chosen reading. Not awarded on every day past 7, which would produce a meaningless ×N. |
| `sunday` | No Weekend Without Ration Card | `dow === 0` | Repeats weekly; a year-round user reaches ×52. That is intended — the roadmap says "any Sunday". |
| `midnight_oil` | Burning the Midnight Oil | `localHourOf(ctx.createdAt, ctx.timezone) < 4` | **Time-based**, on `created_at`, not `card_date`. Window is `00:00:00`–`03:59:59.999` local; `04:00:00` exactly does **not** qualify. `card_date` on such a card is the same local date as the small hours, so `awarded_for_date` is consistent. |
| `new_year` | Resolution, Documented | `M === 1 && D === 1` | |
| `womens_day` | Words for Her | `M === 3 && D === 8` | |
| `world_book_day` | The Bard's Regard | `M === 4 && D === 23` | |
| `fathers_day` | For the Old Man | `M === 6 && dow === 0 && D >= 15 && D <= 21` | Third Sunday of June. Days 1–7 hold the 1st Sunday, 8–14 the 2nd, 15–21 the 3rd — for every June in every year. No table of dates needed. |
| `indonesia_independence` | National Speaker | `M === 8 && D === 17` | |
| `ibu` | Ibu Would Be Proud | `M === 12 && D === 22` | Hari Ibu. |
| `christmas` | Ghost of Christmas Vocab | `M === 12 && D === 25` | |
| `year_end` | Last Word of the Year | `M === 12 && D === 31` | |
| `leap_day` | Leap Year Lexicographer | `M === 2 && D === 29` | Occurs only in leap years by construction — a non-leap year has no such `card_date`. No leap-year test needed. |

Multiple badges can fire on one card and all are awarded. Real combinations to expect:
`2026-12-25` on a Friday at `01:30` → `christmas` + `midnight_oil` (+ `full_week` if the run
hits a multiple of 7). A first card made on a Sunday → `first_card` + `sunday`.
`2026-06-21` is the third Sunday of June → `fathers_day` + `sunday`.

### 8.4 Producing the context

Inside the hook, after the card row exists:

```ts
const dayNums   = allCardDates.map(toDayNumber);          // includes the new card
const cardNum   = toDayNumber(cardDate);
const ctx: BadgeContext = {
  cardDate,
  createdAt,                                              // the inserted row's created_at
  timezone,
  isEarliestCard: cardNum === Math.min(...dayNums),
  runLength: runLengthEndingAt(dayNums, cardNum),
};
```

---

## 9. API contract

### 9.1 zod schemas (`lib/gamification/schemas.ts`)

```ts
import { z } from 'zod';
import { BADGE_CATALOG } from './badges';

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const badgeKey = z.enum(
  BADGE_CATALOG.map((b) => b.key) as [string, ...string[]],
);

export const levelProgressSchema = z.object({
  index: z.number().int().nonnegative(),
  title: z.string(),
  bandMin: z.number().int().nonnegative(),
  value: z.number().int().nonnegative(),
  nextTitle: z.string().nullable(),
  nextAt: z.number().int().nullable(),
  remaining: z.number().int().nullable(),
  progress: z.number().min(0).max(1),
});

export const earnedBadgeSchema = z.object({
  key: badgeKey,
  title: z.string(),
  count: z.number().int().positive(),
  firstAwardedOn: isoDate,
  lastAwardedOn: isoDate,
});

export const profileStatsSchema = z.object({
  user: z.object({
    name: z.string().nullable(),
    image: z.string().url().nullable(),
  }),
  timezone: z.string(),
  todayLocal: isoDate,
  hasCardToday: z.boolean(),
  isEmpty: z.boolean(),                     // true iff totalCards === 0
  sinceDate: isoDate.nullable(),            // user_stats.first_card_on
  currentStreak: z.number().int().nonnegative(),
  longestStreak: z.number().int().nonnegative(),
  totalCards: z.number().int().nonnegative(),
  totalManualWords: z.number().int().nonnegative(),
  streakLevel: levelProgressSchema,          // never null
  collectorLevel: levelProgressSchema.nullable(), // null at 0 words
  badges: z.array(earnedBadgeSchema),        // earned only; catalog supplies the rest
});
export type ProfileStats = z.infer<typeof profileStatsSchema>;

export const awardedBadgeSchema = z.object({
  key: badgeKey,
  title: z.string(),
  awardedForDate: isoDate,
  isFirstEver: z.boolean(),                  // count for this key is now 1
});

export const levelUpSchema = z.object({
  kind: z.literal('streak'),
  previousTitle: z.string(),
  title: z.string(),
});

/** What the card-created hook returns; F5 merges it into its own response. */
export const cardCreatedRewardsSchema = z.object({
  currentStreak: z.number().int().nonnegative(),
  longestStreak: z.number().int().nonnegative(),
  totalCards: z.number().int().nonnegative(),
  awardedBadges: z.array(awardedBadgeSchema),
  levelUp: levelUpSchema.nullable(),
});
export type CardCreatedRewards = z.infer<typeof cardCreatedRewardsSchema>;
```

Both API routes validate their **response** with `.parse()` before returning, per the
roadmap's "zod, at every API boundary". Neither route takes a request body, so there is no
input schema to write; the auth check is the input validation.

### 9.2 `GET /api/profile/stats`

- **Auth:** `auth()` session required. 401 `{ error: 'unauthorized' }` otherwise.
- **Input:** none. The user is always the session user — there is no `userId` parameter and
  must never be one. (No social features; no reading another user's profile.)
- **Response 200:** `ProfileStats` (§9.1).
- **Caching:** `export const dynamic = 'force-dynamic'`. The payload depends on the current
  local date; caching it would show a stale "not yet today".
- **Errors:** 500 `{ error: 'stats_failed' }` on an unexpected throw, logged server-side.

This route is **not** how `/profile` renders. The page is a server component that calls
`getProfileStats(userId)` directly (roadmap: "Server-side data access goes through
`lib/db/queries/`"). The route exists so the reveal toast can refresh, and so verification
(§14) can inspect the payload with `curl`. Both paths call the same function.

### 9.3 `POST /api/profile/recompute`

- **Auth:** session required; operates on the session user only.
- **Input:** none.
- **Behaviour:** `recomputeUserGamification(userId, { prune: false })` (§11).
- **Response 200:** `ProfileStats`, freshly recomputed.
- **Guard:** if `user_stats.updated_at` is under 10 seconds old, return the current stats
  without recomputing. This is a hobby-scale spam guard, not a rate limiter.
- Not linked from the UI. It is a maintenance escape hatch, reachable by hand.

### 9.4 The F5 card-created hook — the contract F9 attaches to

F9 does **not** create a trigger of its own. It exports one function; F5 calls it inside the
transaction that inserts the `daily_cards` row and its `daily_card_items`.

```ts
// lib/gamification/onCardCreated.ts
export async function onCardCreated(args: {
  tx: DbTransaction;   // F5's open transaction — F9 never opens its own
  userId: string;
  cardId: string;
  cardDate: IsoDate;   // the local date F5 already resolved for the row
  createdAt: Date;     // the inserted row's created_at
}): Promise<CardCreatedRewards>;
```

Steps, all on `tx`:

1. Read `profiles.timezone` (§13.1 covers it being missing).
2. Read the previous `user_stats` row (may not exist) → `previousLongest`.
3. `SELECT card_date FROM daily_cards WHERE user_id = $1` — includes the new row, since we
   are inside the same transaction.
4. `computeStreaks(dates, localDateOf(new Date(), timezone))`.
5. Upsert `user_stats` (`current_streak`, `longest_streak`, `total_cards`, `first_card_on`,
   `updated_at = now()`).
6. Build `BadgeContext` (§8.4) → `evaluateBadges(ctx)`.
7. `INSERT INTO badges_awarded ... ON CONFLICT DO NOTHING RETURNING badge_key` — only the
   rows that were genuinely new come back. Those are the ones worth revealing.
8. `levelUp` = non-null iff
   `resolveStreakLevel(longestStreak).index > resolveStreakLevel(previousLongest ?? 0).index`.
9. Return `CardCreatedRewards`.

**F5's obligations:**
- Call `onCardCreated` inside the card-creation transaction, after the card and its items are
  inserted, and pass its own already-resolved `cardDate`. F9 must not independently re-derive
  the card's date — one resolution, one source.
- Merge the returned object into the `POST /api/cards` response under a `rewards` key.
- Mount `<RewardToast rewards={rewards} />` on `/today` (§10.4).

**Failure isolation.** Gamification must never prevent a card from being created. Wrap the
call:

```ts
let rewards: CardCreatedRewards | null = null;
try { rewards = await onCardCreated({ ... }); }
catch (e) { console.error('[F9] onCardCreated failed', e); }
```

A thrown hook costs the user a badge that the backfill (§11) will restore. A thrown hook that
rolled back the card would cost them the day. If F5 prefers strict transactional semantics,
the fallback is to run the hook *after* commit in a second transaction — also acceptable, and
still idempotent. Either is fine; §15.1 flags this for reconciliation with F5.

---

## 10. UI/UX spec

Target: **iPhone, 375 px wide, iOS Safari.** Bottom tab bar with safe-area inset is already
present from F1. All components below are built from F2 primitives; F9 introduces no new
tokens, colours, or fonts.

**Scrolling.** `/profile` may scroll — the no-scroll constraint in the roadmap applies to the
daily card on `/today`, not here. The reveal toast, which *does* render on `/today`, is
`position: fixed` and therefore contributes zero layout height (§10.4).

**Tone.** Dry and affectionate, matching the level names. Lowercase captions, sentence case
headings, no exclamation marks anywhere in this feature, no emoji in body copy.

### 10.1 Page order (top to bottom)

```
┌─────────────────────────────┐
│  (avatar)  Miftahul Mahfuzh │   ProfileHeader
│            keeping a card   │
│            since 8 August   │
│            2026             │
├─────────────────────────────┤
│         4                   │   StreakBlock
│      day streak             │
│  today's card is not made   │
│      yet                    │
│  longest 23 days            │
├─────────────────────────────┤
│   127 cards  ·  86 words    │   CountersRow
├─────────────────────────────┤
│  Streak                     │   LevelBlock (streak)
│  Margin Scribbler           │
│  ▓▓▓▓▓▓▓░░░░░░░░            │
│  7 more days → Keeper of    │
│  the Pocket                 │
├─────────────────────────────┤
│  Collection                 │   LevelBlock (collector)
│  Bag Man of Nouns           │
│  ▓▓▓▓▓▓▓▓▓▓▓░░░░            │
│  14 more words → Private    │
│  Collector                  │
├─────────────────────────────┤
│  Badges                     │   BadgeShelf
│  ┌────┐ ┌────┐ ┌────┐       │
│  │ ×18│ │ ×3 │ │ ×1 │       │
│  └────┘ └────┘ └────┘       │
│  … dimmed slots …           │
└─────────────────────────────┘
```

### 10.2 Component detail

**ProfileHeader.** `users.image` as a 64 px circle with `alt={name ?? 'You'}`; fall back to a
neutral F2 avatar placeholder if `image` is null (Google usually supplies one; do not assume).
`users.name` beside it at heading scale. Below, at caption scale and muted:
`keeping a card since {formatSinceDate(sinceDate)}` → `keeping a card since 8 August 2026`.
If `sinceDate` is null (zero cards), the line reads `no card yet` and nothing else.

**StreakBlock.** `currentStreak` as the largest number on the page, with the unit
`day streak` / `day streak` (`1 day streak` singular). Then, conditionally:

- `hasCardToday === false && currentStreak > 0` → muted caption `today's card is not made yet`.
  Body-text muted colour, same weight as the rest. **Not** amber, **not** red, no warning
  glyph, no countdown, no "before midnight". It is a statement of fact about a day that is
  still in progress.
- `hasCardToday === true` → caption `today's card is made`.
- `currentStreak === 0 && totalCards > 0` → the big number is `0`, caption `no streak right now`.
  Nothing after it. No encouragement, no call to action, no reference to what was lost.

Then `longest {longestStreak} days` in muted text. Omit this line entirely when
`longestStreak === currentStreak` — repeating the same number twice reads as padding.

**CountersRow.** Two figures separated by a middot: `{totalCards} cards · {totalManualWords} words`.
`words` here means words the user added themselves; if a tooltip is ever wanted, use the
caption `words you added` under the number rather than a tap target.

**LevelBlock** (`{ label, level }`). Section label (`Streak` / `Collection`) at caption scale,
the title at heading scale, a 4 px progress bar filled to `progress`, and the §7.5 copy under
it. At the top band the bar is full and the caption reads `nothing above this`. The bar must
have `role="progressbar"` with `aria-valuenow`/`min`/`max` and an `aria-label` naming the level.

The bar renders even at `progress = 0` (a visible empty track), so the band is legible as a
band. It is never animated on load — no filling-up animation, which would be an engagement
flourish rather than information.

### 10.3 The badge shelf

A 3-column grid at 375 px (`grid-cols-3`, F2 spacing scale), each cell an F2 **badge chip**.

- **Earned chips**, first, ordered by `lastAwardedOn` descending (most recent achievement at
  the top-left — the thing a returning user most wants to see). Full-emphasis: chip surface,
  title in two lines maximum with the F2 truncation rule, and `×N` in the corner **only when
  `count > 1`**. A lone `×1` is visual noise.
- **Unearned slots**, after them, in `BADGE_CATALOG` order. Same size and shape, low-emphasis
  surface, title still fully readable, no `×`. They are empty places on a shelf, not locked
  content — no padlock icon, no `???`, no blur. A user should be able to read
  `Leap Year Lexicographer` and understand that a leap day will do it.
- **No progress counter.** Do not render "5 / 13". That is a completion metric and turns a
  shelf into a checklist.
- No filter, no sort control, no tabs. The shelf is a shelf.

Accessibility: each chip is a `<li>` inside a `<ul aria-label="Badges">`; unearned chips get
`aria-disabled="true"` and an accessible name of `{title}, not yet earned`; earned chips read
`{title}, earned {count} times` (or `earned` for one).

Tapping a chip does nothing in v0.1.0. No detail sheet, no route.

### 10.4 The reveal moment (`components/gamification/RewardToast.tsx`)

**Where.** `/today`, after F5's card renders. F5 mounts `<RewardToast rewards={rewards} />`
with the `rewards` object from its own `POST /api/cards` response.

**How it avoids breaking the no-scroll constraint.** The toast is
`position: fixed; left: 0; right: 0; bottom: calc(<tab-bar-height> + env(safe-area-inset-bottom) + 8px)`,
outside the card's flow entirely. It adds **zero** height to the document, so the card's
layout math at 375 px is untouched. `z-index` sits above the card and below the tab bar so it
never covers navigation. `pointer-events: auto` on the toast itself; nothing else is blocked.

**What it says.** One line, one item at a time:

- Level-up: `Level: Margin Scribbler` — shown **first** when both a level-up and badges occur.
- Badge: `Badge: Burning the Midnight Oil`
- Two-line variant is allowed for long titles (`No Weekend Without Ration Card`), never three.

**Queue.** Level-up first, then badges in `BADGE_CATALOG` order. **Maximum three toasts.**
If more than three items exist, show two, then a third reading
`and {n} more — see profile`. Each toast is visible for **3.5 s**, with a 250 ms cross-fade
between them, then the last one fades out and the component unmounts.

**Interaction.** Tapping a toast navigates to `/profile` and cancels the queue. Swiping it
down dismisses the whole queue. Both are optional conveniences; doing nothing works fine.

**Restraint.** One 400 ms fade-and-rise of 8 px on entry. No confetti, no particles, no sound,
no haptics, no full-screen takeover, no modal the user must dismiss. Under
`prefers-reduced-motion: reduce`, the toast appears and disappears with opacity only.

**Missing it is fine.** The toast is a courtesy, not the record. Everything it announced is on
`/profile` permanently. Nothing is re-shown on the next visit to `/today`, and there is no
unseen-badge counter anywhere in the app — a badge dot on the Profile tab would be exactly the
nagging the roadmap forbids.

**Repeat awards.** A 52nd Sunday badge still toasts (`Badge: No Weekend Without Ration Card`).
It only appears when the `RETURNING` clause in §9.4 step 7 actually returned a row, so a
duplicate award is silent by construction.

### 10.5 Empty state — zero cards

`isEmpty === true` (`totalCards === 0`). The page keeps its skeleton so it does not feel like
a different, lesser screen:

- **ProfileHeader:** avatar and name as normal — a new user still has an identity here.
  Since-line reads `no card yet`.
- **StreakBlock → ProfileEmptyState.** Replace the big-number block with:
  ```
  The pocket is empty.
  It starts with one card.
  [ Make today's card ]      → /today
  ```
  One primary F2 button. Dry, affectionate, no exclamation mark, no promise of rewards.
- **CountersRow:** hidden. `0 cards · 0 words` is a scoreboard of nothing.
- **Streak LevelBlock:** shown. `resolveStreakLevel(0)` is `Blank Card`, which is both true and
  the best joke in the roadmap — a brand-new user's first title being *Blank Card* is exactly
  the tone. Progress bar at 0, caption `3 more days → Pocket Fuzz`.
- **Collector LevelBlock:** `resolveCollectorLevel(0)` is null. Render the section with the
  title slot reading `no words yet` at muted emphasis and **no progress bar**. Do not invent a
  zero-level title (§15.2).
- **BadgeShelf:** shown in full, all 13 slots dimmed, under the heading `Badges`. This is the
  inviting part — the shelf is visibly a shelf, with room on it, and every title is readable.
  It promises nothing and claims nothing.

**Partial-empty variants must also work** and are not special-cased: a user with cards but zero
manual words (all their vocab came from Discover) sees a normal page with `no words yet` in the
collection slot. A user with words but no cards sees the empty state above with a real
collector level.

### 10.6 Loading and errors

`app/profile/loading.tsx` renders a skeleton with the same block heights so nothing jumps.
If `getProfileStats` throws, the page shows the F2 error state with `could not load your
profile` and a retry link to `/profile` — never a partial page with zeroes, which would read
as "you have nothing" and would be a lie.

---

## 11. Recompute / backfill routine

Needed because: the hook can fail in isolation (§9.4), badge rules will be tightened after
launch, `user_stats.current_streak` goes stale by the passage of time, and rows can be edited
by hand in the Neon console on a hobby project.

### 11.1 `recomputeUserGamification(userId, opts)`

`opts: { prune?: boolean; dryRun?: boolean }`, both defaulting to `false`.

1. Load `profiles.timezone`. If absent, apply §13.1 and record it in the report.
2. `SELECT card_date, created_at FROM daily_cards WHERE user_id = $1 ORDER BY card_date ASC`.
3. `computeStreaks(dates, localDateOf(new Date(), timezone))` → upsert `user_stats`
   (`updated_at = now()`).
4. **Replay badges.** Walk the cards in `card_date` order, maintaining `dayNums` and, for each
   card, build the same `BadgeContext` as §8.4 — `isEarliestCard` true only for index 0,
   `runLength` from `runLengthEndingAt` over the dates **up to and including** that card
   (never the full set; a replay must not see the future). Call `evaluateBadges`, accumulate
   `(badge_key, awarded_for_date)` pairs.
5. Insert every accumulated pair with `ON CONFLICT DO NOTHING`. Idempotent by the roadmap's
   unique constraint — this is exactly what that constraint is for.
6. If `prune`: delete rows in `badges_awarded` for this user whose `(badge_key, awarded_for_date)`
   is **not** in the accumulated set. This is the only destructive operation in F9. It exists
   for the case where a badge rule is corrected after launch and old awards no longer qualify.
   **Off by default; must be combined with a `--dry-run` inspection first.**
7. Return a report: `{ userId, before, after, badgesInserted[], badgesPruned[], warnings[] }`.

Wrap steps 3–6 in one transaction per user, so a partially-applied recompute is impossible.

**Silence is mandatory.** Backfill never produces a toast, never marks anything as new, and
never surfaces "you earned 14 badges while we weren't looking". The user simply finds their
shelf correct next time they open `/profile`.

**Cost.** A user with 3 years of daily cards is ~1,095 rows and ~13 pure evaluations each. It
runs in well under a second and does no network I/O and no LLM calls.

### 11.2 The CLI (`scripts/recompute-stats.ts`)

```
npx tsx scripts/recompute-stats.ts --user=me@example.com
npx tsx scripts/recompute-stats.ts --user=<uuid> --dry-run
npx tsx scripts/recompute-stats.ts --all
npx tsx scripts/recompute-stats.ts --all --dry-run
npx tsx scripts/recompute-stats.ts --user=<uuid> --prune        # destructive
```

- `--user` accepts a uuid or an email (resolved via `users.email`).
- `--all` iterates every user in `users`, sequentially, printing one report line each. No
  concurrency — Neon's free tier has a small connection ceiling.
- `--dry-run` computes and prints the report but opens no write transaction.
- `--prune` refuses to run together with `--all` unless `--force` is also passed. Deleting
  badges across every user by accident is the one unrecoverable mistake available here.
- Exits non-zero if any user's recompute throws, after processing the rest.
- Loads `.env.local` via the same helper F1's other scripts use.

### 11.3 When to run it

- After changing anything in `lib/gamification/badges.ts` → `--all`.
- If a user reports a wrong number → `--user=<them> --dry-run`, read the diff, then run for real.
- After any manual `daily_cards` edit in the Neon console.
- Not on a schedule. There is no cron in v0.1.0.

---

## 12. Implementation steps

Each step is independently verifiable and leaves the repo in a working state.

1. **Dates module.** Create `lib/gamification/types.ts` and `lib/gamification/dates.ts` per
   §6.1. *Verify:* `dates.test.ts` passes — `localDateOf(new Date('2025-12-31T11:20:00Z'), 'Pacific/Auckland') === '2026-01-01'`; `localHourOf` of the same is `0`; `dayOfWeek('1970-01-04') === 0`; `dayOfWeek('2026-06-21') === 0`; `addDays('2026-02-28', 1) === '2026-02-29'` (2026 is not a leap year — expect `2026-03-01`; use 2028 for the leap case); `formatSinceDate('2026-08-08') === '8 August 2026'`.

2. **Streaks module.** Create `lib/gamification/streaks.ts` per §6.3. *Verify:* `streaks.test.ts`
   reproduces Examples A, B, D, E, F from §6.5 exactly, plus `runLengthEndingAt` returning 0
   for an absent target and 7 for a 7-day run.

3. **Levels module.** Create `lib/gamification/levels.ts` per §7. *Verify:* `levels.test.ts`
   asserts the title at every band `min` and every `min - 1` in both tables, that
   `resolveCollectorLevel(0) === null`, and that the full title strings match the roadmap
   character for character (copy them from the roadmap, do not retype).

4. **Badges module.** Create `lib/gamification/badges.ts` per §8. *Verify:* `badges.test.ts`
   has one positive and one negative case per key, and asserts `evaluateBadges` returns `[]`
   for an ordinary Tuesday card made at 14:00 with `runLength = 4`.

5. **Index migration.** Add `idx_vocab_entries_user_source` (§5.1) via drizzle-kit.
   *Verify:* `npx drizzle-kit generate` produces exactly one new statement; after
   `migrate`, `\d vocab_entries` in psql lists the index.

6. **Query layer.** Create `lib/db/queries/stats.ts` and `lib/db/queries/badges.ts`.
   *Verify:* a throwaway `tsx` script prints `getCardDates(userId)` as `YYYY-MM-DD` **strings**
   — this is the §6.4 driver assertion and must be checked with real data before proceeding.

7. **`getProfileStats`.** Compose the read path: card dates → `computeStreaks`; manual count →
   `resolveCollectorLevel`; badges → grouped counts; user + timezone. Include the opportunistic
   `user_stats` repair from §5.3. Validate the result with `profileStatsSchema.parse`.
   *Verify:* call it for a seeded user; the parse succeeds and the numbers match hand-computed
   values.

8. **`GET /api/profile/stats`.** *Verify:* signed in, `curl` returns 200 and a payload matching
   §9.1; signed out, 401.

9. **`/profile` page, populated state.** `page.tsx` plus `ProfileHeader`, `StreakBlock`,
   `CountersRow`, `LevelBlock`, `BadgeShelf`, and `loading.tsx`. *Verify:* at 375 px in
   Safari responsive mode, the page renders with no horizontal overflow and the numbers match
   step 7's output.

10. **Empty state.** `ProfileEmptyState` and the branching in `page.tsx` per §10.5. *Verify:*
    a fresh user with zero cards sees the shelf, `Blank Card`, `no words yet`, `no card yet`,
    and no counters row — and no zeroes presented as achievements.

11. **The hook.** `lib/gamification/onCardCreated.ts` per §9.4. *Verify:* call it directly
    from a `tsx` script against a test user after inserting a card; it returns the expected
    `CardCreatedRewards` and writes `user_stats` + `badges_awarded`. Call it twice for the
    same card — the second call inserts nothing and returns an empty `awardedBadges`.

12. **Wire into F5.** Add the call inside F5's card-creation transaction with the try/catch of
    §9.4, and add `rewards` to the `POST /api/cards` response. *Verify:* create a real card
    from `/today`; the response body carries `rewards`; `user_stats` updates.

13. **Reveal toast.** `components/gamification/RewardToast.tsx`, mounted by F5's `/today`.
    *Verify:* create the first-ever card for a test user → two toasts
    (`Badge: The Uncle's Trick`, and the level line if applicable); measure the card's height
    before and after with the toast visible — **identical**; the card still does not scroll at
    375 px.

14. **Recompute core.** `lib/gamification/recompute.ts` per §11.1. *Verify:* delete a user's
    `user_stats` row and half their `badges_awarded` rows, run it, and confirm both are
    restored exactly; run it again and confirm zero inserts.

15. **CLI + recompute route.** `scripts/recompute-stats.ts` and
    `app/api/profile/recompute/route.ts`. *Verify:* `--dry-run` writes nothing (check
    `updated_at` is unchanged); `--all` completes on the whole user table; the route returns
    fresh `ProfileStats`.

16. **Full pass.** Run §14 end to end on a seeded multi-year user.

---

## 13. Edge cases and failure modes

**13.1 `profiles.timezone` missing or invalid.** Possible if a user abandons F7 onboarding
mid-flow. Fall back to `'UTC'`, log a warning once per request, and continue. Never throw —
a missing timezone must not make `/profile` a 500. Guard the value:
`Intl.supportedValuesOf('timeZone').includes(tz)` is expensive; instead wrap the first
`Intl.DateTimeFormat` construction in a try/catch and fall back to `'UTC'` on `RangeError`.
Record it in the recompute report's `warnings`.

**13.2 Timezone changed after cards exist.** Historical `card_date` values stay as written.
Streaks are recomputed under the *new* timezone only for the definition of "today". This can
make a current streak appear to end a day early or late exactly once, at the change. Accepted
and documented; see §6.5 Example D.

**13.3 A card dated in the future.** Only reachable via a westward timezone change or manual
DB editing. `last >= t - 1` (§6.3) keeps the streak anchored rather than zeroing it. `card_date`
is never clamped.

**13.4 Clock skew between hook time and read time.** The hook computes `today` at write time;
the page recomputes at read time. Around local midnight these can differ by a day. Because the
page never displays the cached `current_streak` (§5.3), the user always sees the read-time
answer. Correct by construction.

**13.5 Two cards created concurrently (double-tap).** `UNIQUE (user_id, card_date)` rejects the
second insert, so the hook runs once. If F5 retries, the retry fails at the constraint before
reaching F9.

**13.6 The hook throws.** The card is still created (§9.4). Stats are stale until the next card
or a recompute. The badge is not lost — the backfill re-awards it, silently. This is the
correct trade: a missing badge is recoverable, a missing card is not.

**13.7 Badge inserted but the response is lost** (network drop after commit). The badge is in
the database; only the toast is lost. The user finds it on `/profile`. No compensation needed.

**13.8 `first_card` awarded twice.** Only possible if a card is created with a `card_date`
earlier than the existing earliest — which F5 cannot do in v0.1.0 (it only creates today's
card). If it ever becomes possible, `--prune` removes the stale award. Do not add defensive
logic for a path that does not exist.

**13.9 `full_week` and a repaired history.** If a card is added retroactively, filling a gap
and merging two runs, the live path never sees it but the backfill will award the correct
number of `full_week` occurrences on replay. This is precisely why the evaluator is pure.

**13.10 A user with no `user_stats` row.** Expected before the first card. `readUserStats`
returns `null`; `getProfileStats` treats it as all-zero and computes from `daily_cards`
regardless. No row is created for a user with zero cards.

**13.11 A user with cards but no vocab entries.** Impossible in practice (a card needs words)
but harmless: `collectorLevel` is `null` and §10.5's partial-empty rule handles it.

**13.12 Very long badge titles at 375 px.** `No Weekend Without Ration Card` is the longest.
The chip must wrap to two lines and truncate on the third with an ellipsis, with the full title
in the accessible name. Test this specific string at 375 px.

**13.13 `users.image` returns 403/404.** Google avatar URLs can rot. Use `onError` on the
`<img>` to swap in the F2 placeholder. Do not proxy the image — no extra dependency, and
Vercel's free tier image optimisation is not worth spending here.

**13.14 A `date` column parsed as a JS `Date` by the driver.** The single highest-risk failure
in this feature, and it fails *quietly* by shifting everything one day. Pinned as a mandatory
check in step 6 and in §14.

**13.15 Badge count of a key not in `BADGE_CATALOG`.** Possible after a rule is renamed. Skip
unknown keys when rendering (do not crash on the title lookup) and log them; `--prune` cleans
them up.

---

## 14. Verification checklist

**Unit tests** — `npx vitest run lib/gamification`

- [ ] `localDateOf(new Date('2025-12-31T11:20:00Z'), 'Pacific/Auckland')` → `'2026-01-01'`
- [ ] `localHourOf(new Date('2025-12-31T11:20:00Z'), 'Pacific/Auckland')` → `0`
- [ ] `localHourOf(new Date('2026-08-08T21:00:00Z'), 'Asia/Jakarta')` → `4` (i.e. `midnight_oil` **false** at exactly 04:00)
- [ ] `dayOfWeek('2026-06-21')` → `0`, and `fathers_day` fires for that date
- [ ] `dayOfWeek('2026-06-14')` → `0`, and `fathers_day` does **not** fire (second Sunday)
- [ ] Example A → `{ current: 4, longest: 4, total: 4 }`
- [ ] Example B → `{ current: 0, longest: 3, total: 3 }`
- [ ] Example E (DST) → run of 3
- [ ] `computeStreaks([], today)` → all zeros, `firstCardOn: null`
- [ ] All 17 streak-band boundaries (`min` and `min - 1`) return the roadmap's exact titles
- [ ] All 15 collector-band boundaries likewise; `resolveCollectorLevel(0) === null`
- [ ] `evaluateBadges` positive + negative for all 13 keys
- [ ] `full_week` fires at `runLength` 7, 14, 21; not at 8, 13, 20

**Database** — psql against the dev branch

- [ ] `\d vocab_entries` lists `idx_vocab_entries_user_source`
- [ ] `SELECT pg_typeof(card_date) FROM daily_cards LIMIT 1` → `date`
- [ ] A `tsx` script printing `getCardDates(u)` shows `'2026-08-08'` **strings**, not `Date` objects (§13.14)
- [ ] `SELECT * FROM badges_awarded WHERE user_id=$1` has no duplicate `(badge_key, awarded_for_date)`

**Seed and inspect** — seed a user with a known history: cards on 2026-01-01, 2026-03-08,
2026-06-21, 2026-08-01…2026-08-07, and 2026-08-14 at 02:00 local, timezone `Asia/Jakarta`.

- [ ] `GET /api/profile/stats` returns `longestStreak: 7`, `totalCards: 11`
- [ ] Badges include `first_card ×1`, `new_year ×1`, `womens_day ×1`, `fathers_day ×1`, `sunday ×N`, `full_week ×1`, `midnight_oil ×1`
- [ ] `streakLevel.title === 'The Small Scribe'`, `nextTitle === 'Margin Scribbler'`, `remaining === 7`
- [ ] With today = 2026-08-15: `currentStreak === 1` (14th is yesterday), `hasCardToday === false`
- [ ] With today = 2026-08-20: `currentStreak === 0`, `streakLevel.title` **still** `The Small Scribe`

**Live flow**

- [ ] Sign in as a brand-new user, open `/profile` → empty state; `Blank Card`; `no words yet`; `no card yet`; 13 dimmed slots; **no counters row**; nothing claims an achievement
- [ ] Create the first card → toast `Badge: The Uncle's Trick` appears, sits ~3.5 s, fades
- [ ] Measure `/today`'s card element height with and without the toast → identical; card does not scroll at 375 px
- [ ] Reload `/today` → no toast reappears
- [ ] `/profile` now shows `1 day streak`, `today's card is made`, since-line with today's date, one earned chip with **no** `×1` label
- [ ] Next day, before making a card: `1 day streak` and `today's card is not made yet` in muted text — **not** 0, no warning colour, no countdown
- [ ] Set the device clock forward a week without making cards → `0` and `no streak right now`; the streak level title is unchanged

**Recompute**

- [ ] `DELETE FROM user_stats WHERE user_id=$1` then `npx tsx scripts/recompute-stats.ts --user=$1` → row restored with identical values
- [ ] `DELETE FROM badges_awarded WHERE user_id=$1` then recompute → identical set of badges restored (compare with a saved `SELECT ... ORDER BY badge_key, awarded_for_date`)
- [ ] Run recompute a second time → report shows `badgesInserted: []`
- [ ] `--dry-run` leaves `user_stats.updated_at` unchanged
- [ ] `--all` completes with exit code 0
- [ ] `--prune --all` without `--force` refuses to run

**Layout and accessibility, 375 px**

- [ ] No horizontal overflow on `/profile` at 375 px
- [ ] `No Weekend Without Ration Card` wraps to two lines inside its chip without clipping
- [ ] Tab bar and the toast both respect `env(safe-area-inset-bottom)` on an iPhone with a home indicator
- [ ] VoiceOver reads earned chips as `{title}, earned {n} times` and unearned as `{title}, not yet earned`
- [ ] With `prefers-reduced-motion: reduce`, the toast fades only — no movement
- [ ] Search the whole feature diff for `!`, `🔥`, `⚠`, `don't lose`, `keep it up`, `at risk` → **zero hits**

---

## 15. Open questions / discrepancies with ROADMAP_v0.1.0.md

**15.1 F5's hook contract does not exist yet.** At the time of writing, `plans/` contains no
other plan; the brief instructed F9 to read F5's contract and attach to it. §9.4 is therefore
**F9's proposal**, not a contract F5 has agreed to. Before implementing step 12, reconcile
three points with `plans/F5-daily-card.md`: (a) the exact function name and argument shape;
(b) whether the hook runs inside F5's transaction or after commit — both work, F9 is
idempotent either way; (c) the response key (`rewards`) on `POST /api/cards`. If F5 has
already defined a differently-shaped hook, **F5 wins** — adapt `onCardCreated.ts` to it and
change nothing else in this plan.

**15.2 Collector level is undefined at 0 manual words.** The roadmap's collector table starts
at `1–9 Word Picker`. A user with zero manual words (brand new, or one who only used Discover)
has no title. F9 renders `no words yet` at muted emphasis rather than inventing a zero-band
title, since inventing one would violate "use those exact title strings". If a zeroth title is
wanted, it belongs in the roadmap first. **Not changed here — flagged.**

**15.3 `full_week` repeat semantics are ambiguous.** The roadmap defines it as "7 cards in 7
consecutive days" and says badges are repeatable with a count. Taken literally, every day from
the 7th onward satisfies the condition, so a 100-day streak would award `Full Week Ration ×94`,
which is noise. F9 awards it on every completed week — `runLength % 7 === 0` — so 100 days
yields ×14. This is an interpretation, not a change to the definition; if the intent was
different (once ever? once per calendar week?), correct it in the roadmap and re-run
`--prune`, which exists partly for this.

**15.4 `user_stats.current_streak` is inherently stale.** The roadmap describes `user_stats` as
"recomputed on card creation", but `current_streak` decays with time and no write occurs when a
user simply stops. §5.3 resolves this at the read path rather than by adding a scheduled job
(there is no cron, and a cron would be the first step toward the notifications the roadmap
forbids). Any future consumer of `user_stats.current_streak` must apply the same rule.

**15.5 Badge trigger wording vs. actual triggers.** The roadmap's badge table is prefaced
"awarded when a daily card is created on the matching local date", but three badges are not
date-matches: `first_card` (ordinal), `midnight_oil` (wall-clock time), `full_week` (history).
The individual Trigger column is correct for each; only the preamble over-generalises. No
behaviour change — noted so a future reader does not treat the preamble as the spec.

**15.6 `total_manual_words` has no home in `user_stats`.** The profile must display it and the
cache has no column for it. §5.2 chooses a live count over a new column, to avoid making F3 and
F4 call an F9 hook. If a later feature needs this number in a hot path, add the column *and*
the hooks together, not one without the other.

**15.7 Test runner unconfirmed.** This plan assumes vitest, which F1 may or may not have
installed. If it did not, either add vitest (dev dependency, free, no runtime cost) or convert
the four test files to plain `node:assert` scripts run with `npx tsx`. The assertions in §14
are runner-agnostic; do not skip them for lack of a runner.

**15.8 Avatar hosting.** `users.image` points at `lh3.googleusercontent.com`. If `next.config`
uses `next/image` with a remote-patterns allowlist, that host must be added; otherwise use a
plain `<img>`. F1 owns `next.config` — check before step 9 rather than editing it blindly.
