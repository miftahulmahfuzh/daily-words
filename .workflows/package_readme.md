# Package: daily-words

**Location**: `.` (repository root)
**Version**: 0.2.0
**Last Updated**: 2026-09-14

## Overview

Daily Words is a Next.js App Router application for keeping a personal vocabulary
collection and reading six of its words on a card each day. The root package is the
whole app: `src/app` holds the routes, `src/lib/<domain>` holds the domain modules,
`drizzle/` holds the migrations, and `scripts/` holds the offline check scripts that
stand in for a unit-test suite.

**Documentation Created: 2026-09-14**, during phase 1 of 5 of the push-card-reminders
plan set (F30). This file therefore documents the F30 surface in detail and the rest
of the app by pointer — `CLAUDE.md` and `ROADMAP_v0.1.0.md` remain the authority for
everything else, in the order given under **Authority** below.

**Key responsibilities:**

- The daily card: six words drawn from the user's own collection, created by one
  press and by nothing else.
- The collection: add, enrich, correct, discover, chat about and share a word.
- The journal, gamification (streaks, levels, badges) and public share links.
- **New in F30:** an opt-in Web Push reminder to make today's card.

## Authority

1. `ROADMAP_v0.1.0.md` § **Reconciliation Decisions** ([R1]–[R24]) — wins over
   everything, including the rest of that file.
2. `ROADMAP_v0.1.0.md` § Locked Decisions and § Database schema.
3. `design/from-claude-design/Daily Words.dc.html` — visual source of truth ([R18]).
4. `src/components/README.md` — the frozen UI-kit contract.
5. `plans/F*.md` — each plan's header lists which of its sections are superseded.

A plan that contradicts the roadmap loses.

---

## Recent Changes — F30 phase 1 (2026-09-14)

Task `P1-DW-A001`, "The ruling, the schema and the schedule". After this phase the
roadmap authorises push reminders instead of forbidding them, the database can hold a
subscription and a delivery record, and the two pure modules that decide **when** a
reminder fires and **what it says** exist and are proved offline.

Nothing here can send a notification. No route handler, no environment variable, no
component, no service worker, no `web-push` import. `/today` is byte-identical.

### [R24] — the prohibition was amended, not deleted

`ROADMAP_v0.1.0.md` forbade this feature twice: the "Push notifications or reminders
of any kind" bullet under § Explicitly out of scope, and a sentence inside [R11] that
reached past its own subject to rule out scheduled jobs in general. [R24] overrides
both, **in place and below their originals**, because what they refused is the record
of what had to be argued to move them.

The ruling permits Web Push and an hourly job under four structural conditions:

1. **The opt-in is a row** in `push_subscriptions` — no default-on, no
   `profiles.reminders_enabled`, no second place that can claim the user agreed.
2. **The daily card is the only subject** — one notification type, one destination.
3. **Nothing scheduled may create a card.** This is what [R11] was reaching for and it
   survives intact: `POST /api/cards` is still the only writer of a `daily_cards` row.
   The scheduler sends a message; it does not press the button.
4. **Nothing may threaten a streak** — no countdown, no "at risk", no "don't break it".

[R11]'s actual ruling is unchanged: `user_stats` is still a cache, still never
displayed, still recomputed from `daily_cards` on read.

### Database — migration `0010_open_hawkeye.sql`, purely additive

Two new tables in `src/lib/db/schema.ts`, two new `$inferSelect`/`$inferInsert` pairs
in `src/lib/db/types.ts`, and the `PushDeliveryStatus` union. No existing table, column
or index is touched.

#### `push_subscriptions` — one row per device that agreed to be reminded

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid NOT NULL | FK `users.id` ON DELETE **CASCADE** |
| `endpoint` | text NOT NULL | the push service address |
| `p256dh`, `auth` | text NOT NULL | the subscription's RFC 8291 keys, as the browser produced them |
| `user_agent` | text NULL | "which device is this?" on a profile with three |
| `created_at`, `last_seen_at` | timestamptz NOT NULL default now() | |

Indexes: `push_subscriptions_endpoint_uniq` UNIQUE (`endpoint`) ·
`push_subscriptions_user_idx` (`user_id`).

**`endpoint` is unique globally, not per user**, and that is the browser's rule rather
than ours: a push endpoint is issued to one installed web app on one device. A per-user
index would permit a row that cannot exist, and in the one case where it looks like it
could — a shared phone, a second Google account — it would leave the old user's row in
place and deliver their reminders to somebody else's lock screen.

The `user_idx` exists because Postgres does not index the referencing side of a foreign
key, so without it a deleted user is a sequential scan.

#### `push_deliveries` — one row per slot the tick has decided about

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid NOT NULL | FK `users.id` ON DELETE CASCADE |
| `local_date` | **date** NOT NULL | the *user's* day, never a timestamp |
| `slot` | integer NOT NULL | the local hour |
| `status` | text NOT NULL | `'sent' \| 'skipped' \| 'failed'` |
| `reminder_key` | text NULL | which line of the deck went out |
| `sent_at` | timestamptz NOT NULL default now() | when the tick decided |
| `reason` | text NULL | `'superseded'`, `'no_active_words'`, or transport detail |

Index: `push_deliveries_user_date_slot_uniq` UNIQUE (`user_id`, `local_date`, `slot`).

**This table is the idempotence and the unique index is the enforcement** — not
application code. The tick may run twice in the same minute (a retried job, a manual
curl, two schedulers) and the guarantee that the phone lights up once is a `23505` on
insert, exactly as the chat's one-opener-per-round is a partial unique index. A check
written in TypeScript is a check with a race in it.

That index is **also the read index**: the tick's one question per user is "what has
this user already had today?", a prefix scan on `(user_id, local_date)`. A second index
on those two columns would duplicate this one's left-hand side and is deliberately not
created.

Three CHECK constraints back the `$type<>()` claim at runtime: the status enumeration,
`slot between 0 and 23`, and `status <> 'sent' or reminder_key is not null`.

`local_date` is a `date` for the same reason `daily_cards.card_date` is: a `timestamptz`
would put a Jakarta evening and the following UTC morning on different days, and the
idempotence key would silently permit a second 19:00 notification.

An **absent** row is a fourth state and a real one — it means the tick never reached
that slot at all. There is no expiry and no pruning; ~2,500 rows a year per user is the
only record of what was said and when.

---

## Exported API — `src/lib/push/`

### `schedule.ts` — when a reminder is due

**Pure, and it imports nothing at all.** That is `lib/share/policy.ts`'s property for
the same reason: three very different processes read this module — a Node route
handler, the scheduler, and a bare `tsx` process with no environment and no network —
and one import of `server-only`, zod or `node:crypto` would break at least one of them.
What is asserted offline is then literally the code that runs on the request.

**There is no clock here.** `localHour` arrives as an argument, computed by
`lib/time/local-date.ts` in the user's zone.

#### Constants

```ts
export const REMINDER_FIRST_HOUR = 7
export const REMINDER_EVERY_HOURS = 2
export const REMINDER_UNTIL_HOUR = 20   // a bound on the window, not a slot
export const REMINDER_SLOTS: readonly number[]  // [7, 9, 11, 13, 15, 17, 19], frozen
```

The user's sentence — *"start from 7 am, then send a new one every 2 hours until 8
pm"* — written as three numbers rather than a hand-typed array, so that changing one
number changes the schedule.

#### `deriveReminderSlots(firstHour, everyHours, untilHour): number[]`

Exported so the derivation can be asserted independently of the three numbers above. A
derivation only ever tested on the one input it was written for is not tested — and
with these three numbers `<` and `<=` produce the same seven slots, so the exclusivity
of the bound is only observable against other triples.

Defensive rather than clever: a non-positive or fractional step, or an hour outside
0–23, answers `[]` — "send nothing", the only safe failure for a feature whose output
lands on a lock screen. The loop also never runs past 23:00.

#### `isReminderSlot(value: unknown): value is number`

Exactly a member of `REMINDER_SLOTS`, and nothing else shaped like one.

#### `dueSlot({ localHour, delivered }): DueSlot | null`

```ts
type DueSlot = { readonly slot: number; readonly superseded: readonly number[] }
```

**The catch-up rule: the greatest slot the local clock has reached that has not been
delivered, plus every earlier undelivered slot, which is thereby passed over.**

This is the decision that makes the choice of scheduler not load-bearing. A tick that
runs late, or never ran between 09:00 and 15:00, delivers the 15:00 line **once** — not
a burst of four notifications at 15:01, which is how a naive "send every slot you owe"
resolver behaves after any outage and is the most likely way this feature becomes
something the user turns off. A scheduler that fires twice in an hour is likewise
harmless: the second call finds the slot delivered and answers `null`.

`superseded` is what gets written as `'skipped'` rows, so a missed slot is *closed*
rather than left looking outstanding for the rest of the day.

Returns `null` before the first slot and once every reached slot has a row. `delivered`
may contain duplicates, non-slots and slots from another day — all are simply not in
the reached set. A `localHour` that is NaN, negative or out of range answers `null`:
the failure mode of a bad hour is silence, never a 03:00 notification.

### `reminders.ts` — the reminder copy deck

Imports `diffLocalDays` and `LocalDate` from `lib/time/local-date` and nothing else.

**A deck, not a model call.** Asking GLM for a fresh sentence each time was rejected on
three counts, and the third settles it: it would put an unattended, billable,
failure-prone network call on the one path whose whole job is to be quiet and reliable,
at seven calls a day forever; it would have a model read a user's profile to write a
lock-screen string; and a deck is *assertable offline* where a model's output can only
be sampled.

#### Types and constants

```ts
type Reminder = { readonly key: string; readonly title: string; readonly body: string }
type ReminderBandName = 'morning' | 'afternoon' | 'evening'
type ReminderBand = { name; slots: readonly number[]; lines: readonly Reminder[] }

export const REMINDER_TITLE_MAX = 32   // iOS truncation ceiling, XS Max
export const REMINDER_BODY_MAX = 90
export const REMINDER_EPOCH: LocalDate = '2026-01-01'
export const REMINDER_BANDS: readonly ReminderBand[]   // 16 / 16 / 11 lines
export const REMINDER_LINES: readonly Reminder[]       // 43, flattened
```

**Partitioned by time of day**, because a line that reads well at 07:00 reads wrong at
19:00 — "while the kettle boils" is a joke after dinner. The pick never crosses a band.

**The sub-deck sizes are coprime with their band's slot count, and that is the whole
design.** The index is `dayIndex * slots.length + slotIndexWithinBand`, modulo
`lines.length`. Within a day that is three consecutive residues, so the band's three
lines are distinct. Across days it advances by three, and `gcd(3, 16) = 1` is exactly
the condition for a step of three to walk every residue modulo sixteen. Pick twelve
instead and `gcd(3, 12) = 3`: twelve lines become four, the other twelve are never
sent, and nothing anywhere fails. The evening band has one slot, so any size cycles;
eleven is chosen because `lcm(16, 16, 11) = 176` makes a whole day's seven lines repeat
only twice a year.

`REMINDER_EPOCH` is arbitrary and fixed, and load-bearing only in that it must never
move: shifting it rotates every future day's picks, which would make a delivery row's
`reminder_key` disagree with what this module would pick for the same date today.

**`reminders.ts` deliberately does not import `schedule.ts`.** The three slot arrays
are written out, and `push:check` asserts that concatenating them gives
`REMINDER_SLOTS` exactly, in order. That is a stronger link than an import: change
`REMINDER_EVERY_HOURS` to 3 and the slots become `[7, 10, 13, 16, 19]`, which an import
would silently accept and the assertion catches on the spot.

#### Functions

- `bandForSlot(slot): ReminderBand | null` — the three bands partition `REMINDER_SLOTS`.
- `reminderFor(date: LocalDate, slot: number): Reminder | null` — **a pure function of
  its two arguments**: no clock, no user, no randomness, no state. That is what makes a
  delivery row replayable. `dayIndex` may be negative for a date before the epoch, so
  the modulo is the two-step `((raw % n) + n) % n` form — a plain `%` returns a negative
  remainder in JavaScript and would index off the front of the array.
- `reminderByKey(key): Reminder | null` — a delivery row read back as the sentence the
  user saw.

#### The copy rules, which `push:check` enforces over all 86 strings

British English, sentence case, no exclamation marks, no emoji, no straight
apostrophes, and **no streak-threat language of any kind**. Every line must be true on
a user's first day and on their four hundredth, so none of them counts anything,
congratulates anything, or implies a history — the machine does not know how the day
has gone.

---

## Verification

```bash
npm run push:check      # fully offline: no database, no network, no environment
```

`scripts/check-push.ts`, ten sections, all passing. It proves, among others:

- the seven slots are **derived**, and `deriveReminderSlots` is driven through ten other
  triples including a zero step, a negative step and a fractional one;
- `dueSlot` as a **property over the whole matrix** — 24 hours × 128 subsets of the
  seven slots, with no violation anywhere — rather than as a list of examples;
- the three bands concatenate to `REMINDER_SLOTS` exactly, and each band's line count is
  coprime with its slot count (asserted as a property of each band, so a line added to a
  sub-deck fails loudly if it lands on a size that collapses the cycle);
- all 43 keys, titles and bodies are distinct, within the iOS ceilings, and free of
  exclamation marks, emoji and streak threats;
- no two of a day's seven reminders read alike **for 400 consecutive days**, every line
  in the deck is used, and the whole-day shape repeats after exactly 176 days;
- every file under `src/` naming `VAPID_PRIVATE_KEY` or `CRON_SECRET` is `server-only`;
- `schedule.ts` imports nothing, `reminders.ts` imports only the date module, neither is
  `server-only`, and `lib/push/` constructs no `Intl.DateTimeFormat` and holds no clock.

The full command list for the rest of the app is in `CLAUDE.md` § Commands.

---

## Gotchas

- **No `new Date()` in `lib/push/`.** It would compute 07:00 in Vercel's UTC, which is
  14:00 in Jakarta — the exact failure the day-boundary contract exists to prevent, and
  one that nothing would throw on. `localHour` and `date` are always arguments.
- **Do not make `reminders.ts` import `schedule.ts`.** The duplication is the assertion.
- **Do not add a second index on `(user_id, local_date)`** — the unique index already
  serves that prefix scan and the cascade.
- **Do not move `REMINDER_EPOCH`.** It silently rotates every future day's pick.
- **Do not pin the `slot` CHECK to the seven current hours.** The bound that is true
  forever is the clock; pinning would need a migration every schedule change and would
  make old rows unreadable against the new constraint.
- **`npm run db:push` is banned on this schema** (pre-existing rule): it skips the
  journal's `CREATE EXTENSION` migration. Use `db:generate` + `db:migrate`.

## Notes

**Phase 1 of 5.** The remaining phases of the `PUSH_CARD_REMINDERS_PLAN.md` set, none
of which have landed here:

| Phase | Task | Adds |
|---|---|---|
| 2 | `P1-DW-A002` | Subscriptions, VAPID keys and the sender |
| 3 | `P1-DW-A003` | The service worker and the `/profile/edit` switch |
| 4 | `P1-DW-A004` | The tick, the scheduler and the copy in flight |
| 5 | `P1-DW-A005` | The doc sweep |

Phase 4 is what writes every value `push_deliveries.reason` ever holds. Until then the
two tables are unread by any code path and the two modules have no runtime caller —
`npm run push:check` is their only consumer.

Every `plans/F*.md` line asserting that this app has no scheduler is now historical.
Per [R24] those are corrected by `plans/F30-push-reminders.md` rather than by editing
eleven files.
