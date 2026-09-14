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
plan set (F30), and extended in place by each phase since — most recently phase 4. This
file therefore documents the F30 surface in detail and the rest of the app by pointer — `CLAUDE.md` and `ROADMAP_v0.1.0.md` remain the authority for
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

## Recent Changes — F30 phase 4 (2026-09-14)

Task `P1-DW-A004`, "The tick, the scheduler and the copy in flight". After this phase
the feature **runs**: an hourly clock exists, every module phases 1–3 built has a
runtime caller, and a subscribed user with no card for today gets one notification per
two-hour slot. `push_deliveries` is written for the first time.

**This phase creates no `daily_cards` row by any path.** [R24] §3 is the condition the
whole design is arranged around: `POST /api/cards` is still the only writer, the tick
imports no card writer, no gamification hook and no transaction, and `npm run push:db`
greps `src/lib/push/` and `src/app/api/push/` to keep it that way rather than trusting
the reading.

### `.github/workflows/push-reminders.yml` — the clock

Hourly on the hour (UTC) plus `workflow_dispatch`; one `curl -X POST` at
`vars.PUSH_TICK_URL || https://dword.site/api/push/tick`, carrying
`authorization: Bearer ${{ secrets.CRON_SECRET }}`. `permissions: {}` — nothing here
reads or writes the repository.

**Not a `crons` entry in `vercel.json`.** Vercel refuses a cron more frequent than
daily on the Hobby plan, and an hourly `"crons"` block makes the *deployment itself*
fail — a change that breaks deploys is worse than a scheduler living one file away.
`vercel.json` stays the two lines about `sin1`. Moving to Vercel Cron later is those
two lines plus a `GET` shim beside the route's `POST`, and it is invisible to users
because of `schedule.ts`'s catch-up rule.

**The step checks the status code itself**, and that check is the whole point of the
step: `curl` exits 0 on a 401, so without it an unset secret, an unconfigured deploy
and a 500 are all a green tick in the Actions tab beside a feature that silently does
nothing — the one failure mode this feature cannot have, because nobody notices a
notification that never arrived. An empty `CRON_SECRET` fails the step before the
request for the same reason.

`concurrency: { group: push-reminders, cancel-in-progress: false }` — queue, never
cancel. Cancelling mid-flight abandons a fan-out with some slots already claimed.

Two ways reminders stop, one loud and one silent: disabling or deleting the workflow
turns the feature off entirely (nothing else in the app has a clock), and **GitHub
disables a scheduled workflow by itself after 60 days with no repository activity**.
GitHub's scheduler is also best-effort and runs late or skips under load — acceptable
only because a late tick delivers the *current* slot rather than a burst.

### `POST /api/push/tick` — the only scheduled entry point

`runtime = "nodejs"`, `dynamic = "force-dynamic"`, `maxDuration = 60`,
`import "server-only"`, and every response through `noStore()`.

| Condition | Answer |
|---|---|
| no `CRON_SECRET` configured | **503** `not_configured`, nothing read, nothing written |
| absent or wrong bearer token | **401** `unauthenticated` |
| `runTick()` threw | **500** `internal` |
| otherwise | **200** `{ ok: true, ...TickSummary }` |
| `GET` | **405**, by having no `GET` export |

**`POST`, not `GET`**, though there is no session and no CSRF surface here: F17 D5
already ruled that a mutating `GET` is prefetchable, replayable and invisible to Next's
action CSRF machinery, and the rule is worth more than the exception. A future Vercel
Cron `GET` shim delegates to this and says in a comment that it exists for a caller
that cannot choose its verb.

**An unconfigured deploy answers 503, never 200.** A tick that accepts anonymous
callers because nobody set the variable is indistinguishable from working, right up
until a stranger is spending the app's push quota. `secretMatches` compares in constant
time and **checks length first**, because `timingSafeEqual` *throws* on a length
mismatch — the same guard `lib/share/intent.ts` carries for the claim cookie.

**No user ids in the response body.** It is printed verbatim into a GitHub Actions log,
which is a more public place than it looks. Counts are what the scheduler needs in
order to fail loudly; per-user detail goes to the server log.

### `src/lib/push/tick.ts` — the decision and the fan-out

Documented as an exported API under **`src/lib/push/`** below.

---

## Recent Changes — F30 phase 3 (2026-09-14)

Task `P1-DW-A003`, "The service worker and the switch". After this phase a user can
**turn reminders on**, a phone has somewhere for a push to land, and a rotated endpoint
re-registers itself. Everything phase 2 built is now reachable from a browser.

Still nothing decides **when**: there is no tick and no scheduler, so a subscription
created here receives nothing until phase 4. `schedule.ts` gains its first runtime
reader all the same — the switch's schedule hint — and `reminders.ts` still has none.

### `public/sw.js` — the service worker

Plain JavaScript, served from `public/` byte-for-byte. It is **not** compiled by `tsc`
(tsconfig's `include` names no `.js` glob) and has no bundler entry, but it **is**
linted: `npm run lint` is a bare `eslint` and nothing ignores `public/`.

It caches nothing and intercepts nothing. **There is no `fetch` handler and there must
not be one** — everything this app draws is a database read behind a session, so an
offline shell would be a stranger's-eye view of a private screen. The worker exists so
the push service has somewhere to deliver to, and for exactly two events.

| Event | Behaviour |
|---|---|
| `install` | `skipWaiting()` |
| `activate` | `clients.claim()` |
| `push` | `showNotification`, **always** |
| `notificationclick` | close, then focus-or-open `/today` |

**Every push shows a notification, on every code path.** `userVisibleOnly: true` is a
promise to the browser, and a browser that catches the app breaking it revokes the
subscription — silently, permanently, and only on that user's phone. So a push with no
data, a push whose body is not JSON, and a push whose JSON is an array all land on the
same four `FALLBACK` strings. `readNotification` defaults **field by field** rather than
all-or-nothing: a sender that gets `url` wrong should still deliver its own words.

`url` is the one field with a rule beyond "non-empty string": it must start with `/`
**and not with `//`**, because a protocol-relative `//evil.example/x` passes the first
test and resolves off-origin. That is the only place in the worker where a value from
the network reaches something navigable.

`tag` + `renotify: true` are a pair and neither works alone. The stable tag makes 19:00
replace 17:00, so a user who was out all day returns to one notification rather than
seven; but a tagged replacement is **silent** by default, which would mean the phone
buzzes at 07:00 and never again — inverting what was asked for.

`skipWaiting` is normally dangerous, because a new worker starts serving a new manifest
to a page built against the old one. This worker caches nothing, so there is no such
pairing to break, and the alternative is a standalone PWA — essentially never closed —
running last month's `push` handler.

`notificationclick` closes first and unconditionally (iOS otherwise leaves a tapped
notification on the lock screen), then **focuses rather than opens**: a standalone PWA
is one long-lived window, and `clients.openWindow` against it is a second window on
desktop and a no-op-shaped race on iOS. `WindowClient.navigate` shipped late in WebKit
and rejects for a target outside scope, so it is both feature-detected and caught — a
focused window on the wrong screen of the right app beats no window at all.

`SW_VERSION` is read by no code. It is there so a phone can be asked which worker it is
running, from Safari's Web Inspector or by fetching `/sw.js`: a worker is the one piece
of this app that can be a month stale on a device while the server is current.

### Serving `/sw.js` — two widenings, and both fail invisibly if missed

- **`src/middleware.ts`** — `sw\.js` joins `badges`, `levels`, `icons`,
  `manifest.webmanifest` and friends in the matcher's negative lookahead. A browser
  fetches a worker with **no session**, so without this an update check on an expired
  cookie answers `307` to an HTML sign-in page and the registration silently stops
  updating — while the signed-in author sees everything work. `curl -I
  http://localhost:3200/sw.js` with **no cookie jar** is the only proof.
  The escaped dot is deliberate: `sw\.js` cannot exempt a future `/sweep`.
- **`next.config.ts`** — a third headers block, `source: "/sw.js"`, value
  **`cache-control: no-cache`**. This is the exact inverse of the `/badges/` and
  `/levels/` blocks above it, and for a stated reason: those may say `immutable` for a
  year only because their filenames carry a content hash. `/sw.js` carries none and
  cannot — the path is what the browser *registers*, and a hashed worker filename would
  mean a new registration on every deploy. A cached worker is a worker that has stopped
  updating, with no symptom at all. `no-cache`, not `no-store`: the bytes may be kept,
  they just may not be used without asking, which makes the update check a 304.
  Its own block rather than a widened pattern, per F22 D6.
- **`scripts/check-badge-art.ts` §12** — the app-directory scan widens from
  `/^(badges|levels)/` to **`/^(badges|levels|sw)/`**, so no directory under `src/app`
  may begin with `sw`. Note it lists `sw`, not `sw\.js`, which makes the assertion
  **stricter than the matcher** — `/sweep` is not in fact exempt, but forbidding it is
  what survives somebody "tidying" the escape out of the matcher later.

### `<PushSync />` — `src/components/push/push-sync.tsx`

Renders nothing; mounted in `src/app/(app)/layout.tsx` beside `<TimezoneSync />` and
deliberately the same shape. **Zero network requests in the steady state**, which is
what lets it sit in the authed shell for free.

It exists because **iOS rotates push endpoints**. A subscription created in March
answers with a different URL in May, the row the sender holds becomes a 410 nobody
notices, and a notification that does not arrive looks exactly like a day with no
reminder due. This is the only thing in the app that notices.

Four gates, cheapest first: a `useRef` (StrictMode runs the effect twice on purpose, and
the ref is what stops a development build double-posting) → `pushCapability()`, which is
three synchronous property tests and **not** `pushSupport()`, whose authenticated GET is
the request this component must never make → `notificationPermission() === 'granted'`,
the only state with anything to reconcile → `registerServiceWorker()` →
`syncSubscription()`, which compares the live endpoint against `lib/push/client.ts`'s
`dw_push_endpoint` mirror and posts only on a disagreement.

**It never asks for permission.** A sheet thrown up on page load is refused by iOS
outside a gesture and is the interruption product principle 1 forbids. Until the
`/profile/edit` tap has asked, this component registers no worker and touches nothing.

`app/(app)/layout.tsx` gains the mount and **no branch, no query and no push read** — a
`push_subscriptions` lookup there would be a query on every authed page for a component
that usually does nothing.

### `<ReminderToggle />` — `src/components/push/reminder-toggle.tsx`

On **`/profile/edit`**, drawn last, beneath every field Save commits. Not on `/profile`,
which is the pride screen and holds no settings, no countdown and no red states — a
"reminders are off" row there would be the first of all three.

**It writes on the tap and is not saved by the Save button below it**, which is the
argument the timezone field in the same form already makes: a different resource with a
different rule. Drawn last so nothing above it is left looking unsaved.

Six states, and **five of them draw a sentence rather than a switch**:

| `Status.kind` | Drawn |
|---|---|
| `loading` | "Checking…" |
| `unsupported` | this browser cannot show notifications |
| `needs_home_screen` | add to Home Screen and open it from there |
| `unconfigured` | reminders are not set up on this server |
| `denied` | turn them back on in iOS Settings, under Notifications |
| `ready` | `ToggleRow`, `confirmOn={false}` |

The four impossible-to-subscribe states are the point of the component, not a courtesy.
`needs_home_screen` is the **first** state a user meets on the device this was built
for: iOS grants Web Push to a Home Screen app and to nothing else, so Safari in a tab
has the APIs and no permission to give, and a dead switch there looks broken while the
fix is something no amount of tapping discovers. `denied` is the other one that may
never be a silent no-op — once told no the browser will not ask again, so a switch that
flips back with no explanation reads as a broken feature.

The four non-`ready` kinds are spelled with phase 2's `PushSupport` tokens **exactly**,
so `setStatus({ kind: support.kind })` assigns straight across with no mapping table to
keep in step. `denied` is the component's own, because permission is not a capability.

`SCHEDULE_HINT` is built from `REMINDER_FIRST_HOUR`, `REMINDER_UNTIL_HOUR` and
`REMINDER_EVERY_HOURS` rather than typed out — a hint reading "7am" beside a first hour
of 8 is exactly the drift this codebase keeps out of prose. That import is the
component's only coupling to the schedule; `hourLabel` is integer-to-string formatting,
not date arithmetic, so `lib/time/local-date.ts`'s monopoly is untouched.

**`requestNotificationPermission()` is called with nothing awaited above it**, and the
comment saying so is load-bearing. iOS refuses the request unless it is reached from a
user gesture, and an `await` between the tap and the call loses the gesture on WebKit —
with no throw, no dialog and no console line. `setBusy`/`setProblem` are synchronous and
safe; a `registerServiceWorker()` there would be a permission sheet that never appears.
`enablePush()` is then handed a permission that is already `granted`.

A dismissed sheet (`default`) is **not** an error and draws no sentence: the user closed
something they opened. `busy` guards a second tap during the round trip, because
`ToggleRow` has no disabled state — the same place `MasteredToggle` puts it.
`confirmOn={false}`: turning reminders on is undone by turning them off, so it is not
destructive in either direction and gets no two-tap arm ([R22]'s neighbours, F13 D5).

The non-`ready` branch redraws `ToggleRow`'s own frame — same rule, padding and two-line
stack — so the page does not change shape depending on what the device can do.

### A lint trap worth knowing

The phase plan's quoted doc comment for `public/sw.js` contained the literal glob
`**/*.js` inside a `/* */` block comment. The glob's `*/` **closes the comment early**,
and `npm run lint` failed with a parse error pointing at the wrong line. It is now
phrased as "no glob for `.js` files". Nothing about this is specific to a service
worker — any prose in a block comment that quotes a glob ending in `*/` does it.

---

## Recent Changes — F30 phase 2 (2026-09-14)

Task `P1-DW-A002`, "Subscriptions, keys and the sender". After this phase a device
can register itself for reminders, and one notification can be encrypted, VAPID-signed
and put on the wire. Nothing yet decides **when**: there is no tick, no scheduler, no
service worker and no component. Phase 1's `schedule.ts` and `reminders.ts` still have
no runtime caller, and `sendPush` has none either — it is called by Phase 4.

### Environment — four optional variables, and the optionality is the design

`src/lib/env.ts` gains `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` and
`CRON_SECRET`, all through `blankIsAbsent`. **With none of them set the app boots,
builds and serves**; `GET /api/push/key` answers `{ publicKey: null }` and the switch
Phase 3 adds says reminders are unavailable rather than throwing behind itself. CI and
`npm run build` have no keys at all.

That is the `EMBEDDING_API_KEY` precedent one entry above, for the measured reason
`blankIsAbsent` exists: `.env.example` ships these blank, `FOO=` is an empty string
rather than an absent variable, and a bare `z.string().min(1)` would refuse `""` and
take the whole app down for anyone who copied the example and filled in nothing.

`VAPID_SUBJECT` is the one entry in that optional block where a **present** value can
fail the boot: it has a default (`https://dword.site`), so a blank deploy never reaches
the refinement, and a value that is present and is neither `mailto:` nor `https://` is
a typo somebody made on purpose. RFC 8292 requires one of those two for the JWT's `sub`
claim and Apple rejects anything else with a 400 nobody reads — which presents as
"notifications just don't arrive". The default is an `https:` URL rather than a
`mailto:` so no personal address is committed to the repository.

`CRON_SECRET` is **declared here and consumed nowhere in this phase**; Phase 4's
`app/api/push/tick/route.ts` is its only reader. It lives in `env.ts` rather than beside
that consumer because this file is one file, and because a variable that appears in
`.env.example` but not in the validator is exactly the drift this module prevents. Unset
means the tick **refuses every request** — the comparison is written to fail closed, so
an unset secret is never an open door.

Rotating `VAPID_PUBLIC_KEY` invalidates every subscription already registered on every
device, and the only symptom is silence. Generate the pair once, by hand:

```bash
npx web-push generate-vapid-keys
```

### The `web-push` dependency

`web-push@3.6.7` and `@types/web-push@3.6.4`. It does RFC 8291 payload encryption and
RFC 8292 VAPID signing, and it is imported by exactly one file, `lib/push/send.ts`.

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

### `schemas.ts` — the two request shapes (phase 2)

zod 4 spellings ([R2]), `.strict()` on every object, and `z.url()` rather than
`z.string()` for an endpoint — one that is not a URL cannot be one, and `web-push` would
reject it later with a worse message.

```ts
export const PUSH_ENDPOINT_MAX = 1024   // a DoS backstop, not a claim about any vendor
export const PUSH_KEY_MAX = 255
export const createPushSubscriptionSchema   // { endpoint, keys: { p256dh, auth } }
export const deletePushSubscriptionSchema   // { endpoint }
export type PushKeyResponse = { publicKey: string | null }
export type PushSubscriptionResponse = { subscribed: boolean }
```

**The create shape mirrors `PushSubscription.toJSON()` exactly** — `endpoint` beside a
nested `keys` object — rather than being flattened to match the table. The client then
hands over what the Push API gave it without reshaping anything, which is one fewer
place for the two keys to be swapped, and the route does the flattening where the
column names are visible.

The delete shape carries the endpoint **in the body, not as `?endpoint=…`**: a push
endpoint is a bearer capability for queueing messages to that device, and a query string
is the one part of a request that lands in every access log between here and the
function. The keys are not sent back at all — they are not an identifier, and returning
them would be sending a secret to prove a fact the endpoint already proves.

**`lib/push/client.ts` imports types from here and no values.** A value import of any
schema above from a client component drags the whole of zod into that route's bundle —
73 kB in `/vocab/new` before F3 caught it — to re-check a payload the route handler
already produced through the same typed shape.

### `send.ts` — the transport (phase 2)

`import 'server-only'`, and one of exactly two files under `src/` that names
`VAPID_PRIVATE_KEY`. It imports `web-push`, `lib/env` and `PushTarget`, and **it knows
nothing about reminders** — no slot, no copy, no schedule; `schedule.ts` and
`reminders.ts` are not imported and the title and body arrive as arguments. This is the
layer that talks to Apple.

```ts
type PushPayload = { title: string; body: string; url: string; tag?: string }
type PushSendOptions = { ttlSeconds?: number; topic?: string; urgency?: … }
type PushOutcome =
  | { ok: true }
  | { ok: false; reason: 'gone' }           // 404/410 — delete the row
  | { ok: false; reason: 'unconfigured' }   // no key pair; not an error
  | { ok: false; reason: 'rejected'; status: number }
  | { ok: false; reason: 'transport' }

export function isPushConfigured(): boolean
export async function sendPush(target, payload, options?): Promise<PushOutcome>
```

**Nothing here throws. Every failure is a value**, which is `lib/llm/embed.ts`'s
reasoning: the caller is an unattended hourly job iterating devices, and its correct
response to any single failure is to carry on with the next one. A rejected promise three
frames up cannot tell a dead subscription from a dead provider, and those two need
opposite handling. `gone` is the one arm with a mandatory consequence — iOS rotates and
revokes endpoints, a revoked one answers 404 or 410 forever, and retrying it is how one
dead device becomes a permanent hourly error.

`PushPayload` is **the seam with `public/sw.js`** (Phase 3), which parses exactly these
fields in its `push` handler; neither side may change it alone. `url` is a same-origin
**path**, never an absolute URL, so there is no value here that can send a tap elsewhere.

Two collapse mechanisms, deliberately differently named so a log line says which layer
fired: the notification **`tag`** (`'daily-card-reminder'`, owned by the worker)
collapses notifications already on the device, and the push service **`topic`**
(`'daily-card'`, the default here) collapses messages still queued at the service. The
default TTL is one hour for the same reason — a reminder the phone could not receive for
an hour should not arrive at all, because the next slot is at most two hours away and
carries fresher copy. The failure all of this prevents is a phone coming back online and
playing six stale reminders.

**`webpush.setVapidDetails()` is never called.** It is the library's global-configuration
path and it *throws* on a malformed key, so calling it while the module graph is being
evaluated turns a bad environment variable into a build failure in an unrelated route.
`vapidDetails` is read per call and passed per request, which keeps every failure inside
the call that caused it.

The `WebPushError` status is **duck-typed** (`statusOf`), not `instanceof`, which is
`lib/db/errors.ts`'s reasoning for `isUniqueViolation`: a thrown value that crossed a
library boundary is not reliably an instance of the class you imported. And an endpoint
never reaches a log line — `endpointHost` logs the service's host instead, which is the
only diagnostically interesting part ("Apple is refusing everything" vs "one device is
dead").

### `client.ts` — the browser half (phase 2)

Consumed by Phase 3. **It is deliberately not `server-only` and must never become so**:
this file ships to the phone, `send.ts` is its server-side counterpart and must not be
imported from it directly or transitively, and it names neither secret. `push:check`
asserts all three, reading raw source text including comments.

```ts
type PushCapability = 'unsupported' | 'needs_home_screen' | 'ready'
type PushSupport = { kind: 'supported'; publicKey } | { kind: 'needs_home_screen' }
                 | { kind: 'unsupported' } | { kind: 'unconfigured' }

export function pushCapability(): PushCapability           // sync, no network
export async function pushSupport(): Promise<PushSupport>  // one authed GET
export function notificationPermission(): NotificationPermission | null
export async function requestNotificationPermission(): Promise<NotificationPermission>
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null>
export async function getSubscription(): Promise<PushSubscription | null>
export async function isSubscribed(): Promise<boolean>
export async function enablePush(): Promise<PushEnableResult>
export async function disablePush(): Promise<PushDisableResult>
export async function syncSubscription(): Promise<PushSyncResult>
```

Nothing here throws either; every function returns a result object carrying the exact
sentence to show, because a `catch` three components up cannot know which one.

**Nothing in this module asks for notification permission, and that is not an omission.**
On iOS `Notification.requestPermission()` is refused unless it is reached from a user
gesture, and an `await` between the tap and the call loses the gesture on WebKit — while
`enablePush()` must register a service worker before it can subscribe. So the ask belongs
to the tap handler in Phase 3's `components/push/reminder-toggle.tsx`, called with
nothing awaited above it, and this module is handed a permission that is already
`granted`. `requestNotificationPermission` is a one-line wrapper so that grep finds one
function rather than a scattering.

**`needs_home_screen` is a real arm, not a nicety.** In Safari on iOS 16.4+
`navigator.serviceWorker` is present and `window.PushManager` is **absent** until the app
is launched from the Home Screen. Reporting that as "unsupported" would be true of the tab
and false of the phone, and is the difference between a working feature and an abandoned
one. `isStandalone()` tests both `display-mode: standalone` and Apple's
`navigator.standalone`, because the two engines answer differently.

`urlBase64ToUint8Array` is eleven hand-written lines rather than a package: the Push API
refuses the base64url string every VAPID tool prints and wants the raw 65 bytes, and
passing the string produces a `DOMException` whose message mentions neither base64 nor
the key. `applicationServerKey` is cast to `BufferSource` for TS 5.7+'s generic
`Uint8Array<ArrayBufferLike>` — a typing change, not a behavioural one.

#### `dw_push_endpoint` — the localStorage mirror

The endpoint this browser last *deliberately* enabled. **Load-bearing, not an
optimisation.** Without it `syncSubscription()` cannot tell "iOS rotated my endpoint,
re-register it" from "I turned reminders off and the browser's own unsubscribe failed" —
and the second would be silently re-enabled on the next navigation, which is the worst
bug this feature could have. Absent means "this browser has not turned reminders on", and
a sync then does nothing at all.

It is `localStorage`, not the `sessionStorage` the journal draft and the pane scroll
memory use: theirs hold the state of one visit, this holds the opposite. A mirror that
emptied on every cold start would make Phase 3's `<PushSync />` post on every app open,
which is the request it exists to avoid. Every access is wrapped in try/catch — a private
window or blocked site data throws rather than returning null — and being wrong costs one
redundant POST, after which it is right.

**It lives in this module and in no second one**, and the writes happen only inside
`enablePush` / `disablePush` / `syncSubscription`. No component touches the key.

`syncSubscription` issues **no request at all in the steady state**, which is
`<TimezoneSync />`'s property and what lets `<PushSync />` be mounted in the authed shell
for free. Its three-way decision: no remembered endpoint → do nothing (this is the guard
that makes the disable path safe); no current subscription → the user revoked permission
at the OS level, so clear the mirror and let the server row die on its next send, because
a DELETE here would be a request made on the one path whose design goal is silence;
endpoints differ → it rotated, so re-register and remember the new one, leaving the old
row for the sender's 410 sweep.

Ordering is the other half. `enablePush` **unsubscribes again** on any failure after
`subscribe()`, because a subscription the server refused reads as "on" and never delivers.
`disablePush` clears the mirror **first, before anything can fail**, so a partially-failed
disable can never be undone by the next sync re-registering the endpoint the user just
rejected.

---

## Exported API — `src/lib/db/queries/push.ts` (phase 2)

Eight functions. The `lib/db/queries/` convention holds: `userId` is the first parameter
and appears in every WHERE clause, plain values come out, nothing throws for control
flow, and every timestamp is SQL `now()` rather than `new Date()`.

| Function | Notes |
|---|---|
| `upsertSubscription(userId, input)` | `onConflictDoUpdate` on `endpoint`, **reassigning `user_id`** |
| `deleteSubscription(userId, endpoint)` | returns rows removed, 1 or 0 |
| `listSubscriptions(userId)` | this user's devices, oldest first |
| `deleteDeadSubscription(userId, endpoint)` | the 404/410 sweep |
| `claimDelivery(input)` | INSERT … `onConflictDoNothing`, **before** sending |
| `markDeliveryFailed(userId, localDate, slot, reason)` | downgrades a claimed row |
| `listDeliveredSlots(userId, localDate)` | sorted hours, the input to `dueSlot` |
| `listReminderCandidates()` | **the one cross-user read** |

Every function returns a **hand-named shape**, never a row type from `db/types.ts`. That
is `getShareBySlug`'s rule applied to a different table, and it is what makes the
cross-user read safe against a column somebody adds to `profiles` next year: it is not
possible for these functions to return one, which is stronger than remembering not to
select it.

**`upsertSubscription` conflicts on `endpoint` alone, not on `(user_id, endpoint)`, and
the update reassigns `user_id`.** A push endpoint names one browser install, so if a
second account signs into the same installed PWA the row must *move* to whoever is signed
in now — leaving the old one would send the previous user's reminders to a phone that is
somebody else's session, and neither of them could see why. The unique index makes that
mechanical rather than something this function remembers to do. Idempotence is what lets
`<PushSync />` post the same endpoint on any navigation without reading first, and what
makes a double-tapped switch harmless.

**`claimDelivery` takes the slot before sending anything.** This is the chat's turn-cap
discipline: the conditional write is taken *before* the expensive call, never after.
There it is `UPDATE … WHERE turn_count < 8`; here it is an INSERT against
`push_deliveries_user_date_slot_uniq`. Two ticks racing produce one notification between
them, and neither had to read first.

**`markDeliveryFailed` downgrades the row rather than deleting it, and that is the
decision.** An earlier draft deleted it so the next tick would find the slot outstanding
and retry through the catch-up path; that loses to the schema and to Phase 4's D5. The
slot is *spent*, and the cost is stated plainly rather than hidden: a transient failure
is **one missed reminder**, never a duplicate buzz two hours later. With seven slots a
day, missing one is the cheap mistake; a duplicate is the one that teaches somebody to
turn reminders off.

### `listReminderCandidates()` — the second no-user-id read in the app

`queries/shares.ts` holds the other one and its header is the model for this one. There,
what replaces `userId` is the slug: 80 bits of capability that exists only because the
owner tapped Share. **There is no slug here.** What replaces `userId` is that the caller
is not a request-bound user at all — it is Phase 4's `POST /api/push/tick`, an endpoint
with no session reached by an hourly machine holding `CRON_SECRET`, whose whole job is to
ask a question about every subscribed person at once. A per-user API cannot express that
question, and looping over a list of user ids obtained some other way just moves the same
read somewhere with less documentation.

The second half of the safety property is the return shape: **three fields, hand-named,
and it can never return a fourth** — `{ userId, timezone, targets }`, no name, no email,
no answers, no birthday, no timestamp. No `select()`, no join reaching past
`profiles.timezone`, no imported row type that would grow a column. Making it a general
user dump takes an edit to this function, in this file, under that comment.

`timezone` comes out **raw, unresolved and unvalidated**: this function must not call
`resolveTimezone`, because "reads may fall back, writes may not" is a decision about what
the *caller* is doing, and this caller is about to put something on a lock screen. The
tick validates, and a zone it cannot resolve is a user it does not send to.

`INNER JOIN profiles` on `onboarded_at IS NOT NULL` is belt-and-braces — a subscription
can only be created from `/profile/edit`, already past `requireOnboardedUser()` — and it
costs one indexed predicate for the guarantee that a half-finished account can never be
notified, whatever a future route does. The fold to one row per user is in JS rather than
`json_agg` because the result set is single digits per user at this scale; when that
ceiling is reached the fix is paging the query, not hiding it in Postgres.

---

## Routes — `/api/push/*` (phase 2)

Both files are `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`, and every response goes
through `noStore()`. All of `/api` is outside the middleware matcher, so a signed-out
request gets `requireApiUser()`'s **401 JSON envelope, never a 307** to an HTML page.

| Route | Answers |
|---|---|
| `GET /api/push/key` | `{ publicKey: string \| null }` — `null` when unconfigured |
| `POST /api/push/subscription` | `{ subscribed: true }`; idempotent on `endpoint` |
| `DELETE /api/push/subscription` | `{ subscribed: false }`, row or no row |

**Why `GET /api/push/key` is a route and not a `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.** The key
is public by definition — it is handed to Apple with every subscription — so the variable
would be harmless in itself. What would not be harmless is what it establishes: **this
repository contains no `NEXT_PUBLIC_*` variable anywhere**, and `src/lib/env.ts` carries
`import 'server-only'` so that a client import of the environment is a build error rather
than a leak. That is a single checkable story about how configuration reaches code, and
the first `NEXT_PUBLIC_` is the one that turns it into a convention. Four lines of route
keep the property; a build-time inlined string spends it to save a request that happens
once, inside a button press the user is already waiting on.

It is authenticated because everything under `/api` except the share paths is, and because
an anonymous probe of whether reminders are configured is a free fingerprint of the
deployment. `force-dynamic` and `noStore()` are not decoration: a GET handler that reads
no request object is exactly the shape Next will evaluate once and serve forever, and the
value it would freeze is whichever answer the *build machine's* environment produced —
`{ publicKey: null }`, served to a production deployment that has a key.

`POST` has two callers and the second is why idempotence is a requirement rather than a
nicety: the switch posts once, and `<PushSync />` posts again whenever iOS has rotated the
endpoint under a subscription turned on weeks ago. Neither reads first, and neither should
have to. The `user-agent` is stored as a diagnostic and nothing reads it yet — "which of
my devices is this row?" is otherwise unanswerable from an opaque endpoint URL, and it is
the first question asked the first time a notification arrives twice. A malformed endpoint
is `readJson`'s `400 invalid_body`.

**`DELETE` answers 200 whether or not a row was removed**, which is the opposite call to
`DELETE /api/shares/[slug]`'s 404 and is deliberate. There the distinction carries
information the user needs — the link either is or is not revoked. Here the intent is
"stop notifying this browser", and that is equally true of an endpoint that was already
gone, one that rotated, and one belonging to a row this session does not own. The client
also calls `subscription.unsubscribe()` locally either way, which is the half that actually
silences the device; an honest-looking 404 would turn a no-op into an error message under a
switch that had already worked. It is still scoped by `userId` in the WHERE clause, so it
cannot unsubscribe somebody else's device by guessing an endpoint.

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

**Phase 2 did not change one line of `scripts/check-push.ts`, and that was the point.**
The secret grep was written in phase 1 as a *property* over every file under `src/` —
"every file naming this literal begins with `import 'server-only'`" — rather than as a
list of sanctioned filenames, precisely so the phase that added the first real reader
would not have to edit it. It was vacuously true before `lib/push/send.ts` existed and is
non-vacuously true now. The client half is the mirror assertion and it is guarded by
`existsSync`, so it slept through phase 1 and now fires: `lib/push/client.ts` is **not**
`server-only` and names neither secret, read from raw source text including comments.

The rest of phase 2 is checked by the compiler and the build rather than by this script:

```bash
npm run typecheck
npm run build            # with none of the four variables set — this is the CI case
```

**Phase 3 changed no line of `scripts/check-push.ts` either.** Its surface is a service
worker, two client components and three widened configuration lines, and it is checked by
three other commands:

```bash
npm run lint             # a bare eslint; nothing ignores public/, so sw.js is linted
npm run badges:check     # §12, now /^(badges|levels|sw)/ over src/app's directories
curl -I http://localhost:3200/sw.js    # 200 with NO cookie jar, and cache-control: no-cache
```

That last one is the only proof of the middleware exemption, for the reason the share
routes already document: the author testing it is signed in, and a broken matcher serves
them a perfect worker.

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
- **Do not add `NEXT_PUBLIC_VAPID_PUBLIC_KEY`**, or any other `NEXT_PUBLIC_*`. The
  repository has none, `lib/env.ts` is `server-only`, and `GET /api/push/key` exists to
  keep it that way.
- **Do not add `import 'server-only'` to `lib/push/client.ts`**, and do not let it import
  `lib/push/send.ts` directly or transitively. It ships to the phone. `push:check`
  asserts both directions.
- **Do not value-import a schema from `lib/push/schemas.ts` in a client component** —
  types only, or the whole of zod lands in that bundle.
- **Do not call `webpush.setVapidDetails()`**, and do not read the key pair at module
  scope. It throws on a malformed key, which would turn a bad environment variable into a
  build failure in an unrelated route.
- **Do not make `sendPush` throw.** Every failure is a value because the caller is an
  unattended job iterating devices, and `gone` must stay distinguishable from `transport`.
- **Do not "fix" `DELETE /api/push/subscription` to 404** on a missing row. The intent is
  "stop notifying this browser", and that is already true.
- **Do not ask for notification permission inside `enablePush()`.** iOS refuses a request
  not reached from a user gesture, and the `await` on `registerServiceWorker()` loses it —
  with no throw, no dialog and no console line. The ask belongs in the tap handler.
- **Do not rotate `VAPID_PUBLIC_KEY` casually.** It invalidates every subscription on
  every device, and the only symptom is silence.
- **Do not conflict `push_subscriptions` on `(user_id, endpoint)`.** The endpoint alone is
  the conflict target, and the update reassigns `user_id`, or a shared install delivers one
  user's reminders to another's phone.
- **Do not add a `fetch` handler to `public/sw.js`.** Everything this app draws is a
  database read behind a session; an offline shell would cache private screens.
- **Do not add a code path through `push` that skips `showNotification`.** A browser that
  catches a silent push revokes the subscription — permanently, and only on that phone.
- **Do not give `/sw.js` a content hash or an `immutable` header.** The path is what the
  browser registers; a cached worker stops updating with no symptom anywhere.
- **Do not remove `sw\.js` from the middleware matcher**, and do not unescape the dot. A
  worker is fetched with no session, and a 307 to `/signin` renders perfectly for the
  signed-in author. `curl -I /sw.js` with no cookie jar is the only proof.
- **Do not drop `renotify: true` while keeping the tag.** Tagged replacements are silent,
  so the phone would buzz at 07:00 and never again.
- **Do not accept a `url` that merely starts with `/`.** `//evil.example/x` passes that
  test and resolves off-origin; both checks are needed.
- **Do not `await` anything before `requestNotificationPermission()`** in the toggle's tap
  handler. iOS loses the gesture with no throw, no dialog and no console line.
- **Do not call `pushSupport()` from `<PushSync />`.** It is an authenticated GET, and the
  component's whole value is costing nothing on a normal page load. `pushCapability()` is
  the synchronous one.
- **Do not add a `push_subscriptions` read to `app/(app)/layout.tsx`.** It is a query on
  every authed page for a component that usually does nothing.
- **Do not quote a glob ending in `*/` inside a block comment.** It closes the comment and
  `eslint` fails at a line that looks unrelated.

## Notes

**Phase 3 of 5.** The remaining phases of the `PUSH_CARD_REMINDERS_PLAN.md` set:

| Phase | Task | Adds |
|---|---|---|
| ~~1~~ | ~~`P1-DW-A001`~~ | ~~[R24], the schema, the schedule and the deck~~ — landed |
| ~~2~~ | ~~`P1-DW-A002`~~ | ~~Subscriptions, VAPID keys and the sender~~ — landed |
| ~~3~~ | ~~`P1-DW-A003`~~ | ~~The service worker, `<PushSync />` and the switch~~ — landed |
| 4 | `P1-DW-A004` | The tick, the scheduler and the copy in flight |
| 5 | `P1-DW-A005` | The doc sweep |

What is reachable after phase 3: a device can subscribe and unsubscribe from
`/profile/edit`, a rotated endpoint re-registers itself, and a push that arrives is
shown and opens `/today`. **Nothing sends one.** `reminders.ts` still has no runtime
caller — `npm run push:check` remains its only consumer — and `sendPush`,
`claimDelivery`, `markDeliveryFailed`, `listDeliveredSlots`, `deleteDeadSubscription`,
`listSubscriptions` and `listReminderCandidates` have none either. `push_deliveries` is
still written by nothing, and phase 4 is what writes every value its `reason` ever holds.
Of `schedule.ts`, only the three constants have a runtime reader, in the switch's
schedule hint; `dueSlot` and `isReminderSlot` do not.

The seam between the halves is `PushPayload` — `{ title, body, url, tag }`, named in
`lib/push/send.ts` and parsed by `readNotification` in `public/sw.js`. **Neither side may
change it alone**, and phase 4 is the first code that will actually put one on the wire.

Every `plans/F*.md` line asserting that this app has no scheduler is now historical.
Per [R24] those are corrected by `plans/F30-push-reminders.md` rather than by editing
eleven files.
