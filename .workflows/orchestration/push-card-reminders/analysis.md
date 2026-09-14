# Code Analysis: Push reminders to make today's card

**Type:** Feature Implementation
**Date:** 2026-09-14 10:40:32 +07
**Session ID:** 20260914-104032-K7P2
**Plan:** `PUSH_CARD_REMINDERS_PLAN.md` (5 phases)
**Worktree:** `/home/miftah/.worktrees/daily-words/push-card-reminders` — branch `feature/push-card-reminders`, base `origin/main` @ `5e9ff55`

---

## User Input

### Original User Request

```
make sure the app send a different reminder as a push notification in my xs max to generate today's card.
start from 7 am in the morning, then send a new one every 2 hours until 8 pm
```

### User-Provided Context

None beyond the prose. No error logs, no files, no `@` attachments.

Implicit context recovered from the repo: the "xs max" is an iPhone XS Max
(A12, iOS 18-capable), and the app already ships a PWA manifest
(`public/manifest.webmanifest`, `display: standalone`) but **no service worker**
and **no push infrastructure of any kind**.

### User-Provided Files

None.

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | The app sends a push notification to the user's iPhone XS Max telling them to generate today's card |
| R2 | Each reminder is **different** — not the same sentence fired over and over |
| R3 | The first one at 07:00, then a new one every 2 hours, through to 20:00 |

---

## Detailed Requirements Understanding

**Problem/Requirement Statement**

Daily Words' central ritual is that the daily card is *nudged* into existence by
a deliberate press on `/today`. Nothing creates it otherwise. The failure mode
of that design is the obvious one: a user who never opens the app never makes a
card, and the app has no way to say anything to them. The user is asking for the
missing half — a reminder that arrives on the phone's lock screen, several times
across the day, until the card is made.

**Success criteria**

1. With Daily Words added to the iPhone XS Max Home Screen and reminders turned
   on, a notification arrives at ~07:00 local time on a day with no card.
2. Another arrives roughly every two hours after that, the last at 19:00.
3. Every one of them reads differently from the ones before it that day.
4. Tapping one opens `/today`.
5. Once today's card exists, the day goes quiet — no further notifications.
6. **No notification ever creates a card.** The press remains the ritual.

**Key considerations, edge cases, constraints**

- **iOS Web Push only works from a Home Screen install.** Safari on iOS 16.4+
  exposes `PushManager` exclusively to web apps launched from the Home Screen
  (`display-mode: standalone`). In a normal Safari tab `navigator.serviceWorker`
  exists but `registration.pushManager` does not, or `requestPermission` throws.
  The UI must say so honestly rather than showing a dead switch.
- **`Notification.requestPermission()` must be called from a user gesture** on
  iOS. An effect-driven prompt is silently refused.
- **iOS rotates and revokes push endpoints.** A subscription that worked last
  week answers 410 Gone; the sender must delete the row rather than retry.
- **`userVisibleOnly: true` is mandatory.** Every push must call
  `showNotification`, or the browser revokes the subscription.
- **The day boundary is the user's, not the server's.** "07:00" means 07:00 in
  `profiles.timezone`. Every existing day computation in this app goes through
  `lib/time/local-date.ts` and this one must too.
- **A scheduler has to exist, and the roadmap forbade one.** See "Impact points"
  and the plan's `## Decisions`.
- **"until 8 pm" is a window bound, not a slot.** Starting at 07:00 and stepping
  2 hours, the ticks inside a window closing at 20:00 are 07, 09, 11, 13, 15, 17
  and **19** — seven of them. 21:00 falls outside. This reading is stated as an
  assumption and encoded as three constants (`first`, `everyHours`, `untilHour`)
  rather than a hand-written array, so the sentence itself is what the code says.

**Assumptions**

| # | Assumption | Why |
|---|---|---|
| A1 | Seven slots: 07, 09, 11, 13, 15, 17, 19 | "every 2 hours until 8 pm" — 20:00 bounds the window, and no 2-hour step from 07:00 lands on it |
| A2 | The phone is added to the Home Screen | iOS grants Web Push nowhere else |
| A3 | The reminder never creates a card | `src/app/api/cards/route.ts:25` — "If you find yourself writing a scheduler, stop." The scheduler here sends a *message*; it does not press the button |
| A4 | Copy is a curated deterministic deck, not a model call | A cron fan-out through `lib/llm/` would put an unattended, failure-prone, billable call on a path whose whole job is to be quiet and reliable |
| A5 | One subscribed user, single-digit devices | The tick iterates every subscription in one request; the ceiling is named in the plan |

---

## Analysis Scope

### Explicitly Mentioned Files

None — the request was prose.

### Discovered Related Files

| File | Why it is in scope |
|---|---|
| `public/manifest.webmanifest` | The PWA install the whole feature rests on. `display: standalone`, `start_url: /today`, three icons. Present and adequate; **no service worker anywhere in the repo.** |
| `src/app/layout.tsx` | `metadata.manifest`, `appleWebApp.capable`, `themeColor`. Where the app declares itself installable. |
| `src/app/(app)/layout.tsx` | The authed shell. Mounts `<TimezoneSync />` — the exact precedent for a render-nothing client component that reconciles device state with the server and costs zero requests in the steady state. |
| `src/middleware.ts` | The auth gate. Its matcher lookahead already excludes `manifest.webmanifest`, `icons`, `badges`, `levels`. `/sw.js` is **not** excluded and would 307 to `/signin` on a cookie-less update fetch. |
| `src/app/api/cards/route.ts` | `POST /api/cards`, the only card-creating path. Carries the "no cron, no scheduler" instruction this feature has to work *beside* without violating. |
| `src/app/(app)/today/page.tsx` | Where the notification lands. `NudgeButton` is what the reminder is asking the user to press. Must not gain a single pixel — see [R19]. |
| `src/lib/time/local-date.ts` | `localDateNow`, `localHour`, `isValidTimeZone`, `LocalDate`. The only file allowed to construct `Intl.DateTimeFormat` or do date arithmetic. The slot resolver must route through it. |
| `src/lib/db/schema.ts` | Where two new tables go. Establishes the `tsz()`/`localDate()` helpers, the partial-unique-index idiom, and the `check()` idiom. |
| `src/lib/db/queries/cards.ts` | `getCardContext` (timezone + profile createdAt), `getCardForDate`, `countActiveWords`. The three reads the tick needs per user. |
| `src/lib/db/queries/profiles.ts` | Documents the binding `lib/db/queries/` convention — one file per resource, `userId` first, every WHERE clause. The tick's cross-user scan is the exception that has to be named. |
| `src/lib/db/queries/shares.ts` | The *precedent* for that exception: `getShareBySlug` is called "the one function in the application that reads a row without a user id". |
| `src/lib/env.ts` | `import 'server-only'`, zod schema, `blankIsAbsent`. Where the VAPID keys and the cron secret are declared — and why the VAPID **public** key cannot simply be read from the browser. |
| `src/lib/api/guards.ts`, `respond.ts`, `client.ts` | `requireApiUser()` / `ok()` / `fail()` / `noStore()` and the browser-side `request()`. Every new route handler uses these. |
| `src/lib/share/policy.ts` | The "pure predicate with no imports" pattern, readable from Edge middleware, a client bundle and an offline tsx process alike. `lib/push/schedule.ts` is the same shape. |
| `src/lib/share/intent.ts` | HMAC over `AUTH_SECRET`, **secret passed as a parameter** so the offline check script runs without `lib/env.ts`. The same trick keeps `push:check` offline. |
| `src/components/ui/toggle-row.tsx` | The two-tap arm. Turning reminders **off** is one tap (not destructive); turning them on is one tap too — this is not a destructive control, so `confirmOn={false}`. |
| `src/components/profile/profile-edit-form.tsx` | The settings surface. `/profile` is the pride screen and explicitly holds no settings; `/profile/edit` is where the switch belongs. |
| `src/components/profile/timezone-sync.tsx` | The template for `<PushSync />`. |
| `scripts/check-share.ts` | The offline check-script shape: plain assertions, `process.exit(1)`, comment-stripped greps over `src/`. |
| `scripts/check-badge-art.ts:452` (§12) | Asserts no `src/app` directory starts with an excluded matcher prefix. Gains `sw` when `sw.js` joins the lookahead. |
| `next.config.ts` | Two `immutable` header blocks with loud warnings. `/sw.js` needs the **inverse** rule. |
| `vercel.json` | Two lines, `regions: ["sin1"]`. The candidate home for a Vercel cron — and the reason the plan does not put one there. |
| `ROADMAP_v0.1.0.md:422`, `:562` | The out-of-scope list and `[R11]`. Both forbid this feature outright. |
| `package.json` | 26 npm scripts, all of the `<feature>:check` / `<feature>:db` shape. No `web-push` dependency yet. |

---

## Current Dataflow

### What exists today: the ritual, end to end

```
user opens /today  ──► app/(app)/layout.tsx  requireOnboardedUser()
                            │                 needsBirthdayPrompt() ─► /birthday
                            ├──► <TimezoneSync stored source />   (client, renders null)
                            └──► app/(app)/today/page.tsx  (force-dynamic)
                                     getCardContext(userId)        ─► profiles.timezone
                                     localDateNow(tz)              ─► LocalDate
                                     getCardForDate(userId, today) ─► CardWithItems | null
                                          │
                      card ──────────────►│◄───────────── no card
                      <DailyCard/>        │               <NoCardYet action={<NudgeButton/>}/>
                                                                     │  tap
                                                                     ▼
                                          POST /api/cards  (nodejs, force-dynamic)
                                              requireApiUser()
                                              getCardContext → timezone.ok ? : 409
                                              countActiveWords → 0 ? 409
                                              createCard(userId, today, tz)   [transaction]
                                              onCardCreated(event)            [F9 rewards]
                                              200 { created, card, rewards, … }
```

**Entry point: `POST /api/cards`**
- **Location:** `src/app/api/cards/route.ts:76`
- **Trigger:** a finger on `NudgeButton`. Nothing else, ever.
- **Input schema:** `{}` or `{ clientTimezone?: string }`. An empty body is legal — the endpoint is deliberately curl-testable.
- **Validation:** `requireApiUser()`; `getCardContext` must return `timezone.ok`; `countActiveWords > 0`.
- **State changes:** one `daily_cards` row, up to six `daily_card_items`, `last_shown_on` on the chosen entries — all in one transaction; then `user_stats` and `badges_awarded` through `onCardCreated`.
- **Exit:** `200` with `noStore()`.

**Entry point: `GET /today`**
- **Location:** `src/app/(app)/today/page.tsx:48`
- Four parallel reads plus two conditional counts. **No writes.** The file's own comment: *"Everything here is a database read. Nothing on this page creates a card."*

### The day boundary, as it is computed today

```
profiles.timezone (NOT NULL, default 'Asia/Jakarta')
      │
      ├─ resolveTimezone(profile)  ──► { ok: true, timezone } | { ok: false, timezone: DEFAULT, reason }
      │        reads may fall back on !ok; writes may not
      │
      └─ localDateNow(tz)  ──► toLocalDate(new Date(), tz)  ──► zonedParts()  ──► 'YYYY-MM-DD'
         localHour(instant, tz) ──► zonedParts().hour       ──► 0..23
```

`zonedParts` is the **only** `Intl.DateTimeFormat` construction in the app's day
logic, and `local-date.ts` is the only file permitted date arithmetic.
`localHour` already exists — it drives the `midnight_oil` badge — and is exactly
the function a slot resolver needs.

### The auth gate, in two layers

```
request ──► src/middleware.ts   (Edge)
               matcher: /((?!api|_next/static|_next/image|favicon.ico
                            |badges|levels|icons|manifest.webmanifest
                            |apple-icon|icon).*)
               ├─ NODE_ENV!=production && /kitchen-sink  ─► next()
               ├─ isPublicSharePath(pathname)            ─► next()
               ├─ isClaimPath(pathname)                  ─► next()
               └─ !hasCookie && path!=/signin            ─► 307 /signin
                            │
                            ▼
            app/(app)/layout.tsx  requireOnboardedUser()      (real check, DB session)
            route handlers        requireApiUser()            (real check, DB session)
```

Two properties matter here for this feature:

1. **All of `/api` is outside the matcher.** A new `/api/push/*` route is
   unaffected by middleware and must do its own auth — `requireApiUser()` for
   the user-facing ones, a shared-secret comparison for the tick.
2. **`/sw.js` is inside the matcher.** A cookie-less fetch for it — which is
   what a service-worker update check after session expiry is — gets a 307 to an
   HTML sign-in page. The registration then fails or, worse, the browser caches
   an HTML body as the worker script. This is the same class of invisible bug
   `isPublicSharePath` exists for, and it fails only for a signed-out reader,
   which the author testing it never is.

### Client-side state reconciliation, as the app already does it

`src/components/profile/timezone-sync.tsx` is the whole pattern in 60 lines:
mounted in the authed layout with the server-rendered value as a prop, compares
before it posts, returns `null`, guards against re-firing with a `useRef`, and
`router.refresh()`es only when the server says the row actually moved. **In the
steady state it issues zero network requests.** `<PushSync />` is the same
component for a different piece of device state.

### Data persistence today

| Table | Written by | Notes |
|---|---|---|
| `profiles` | F7 routes, Auth.js `createUser` | `timezone`, `timezone_source`, five answers, birthday |
| `daily_cards` / `daily_card_items` | `createCard` only | `UNIQUE (user_id, card_date)`; items RESTRICT to `vocab_entries` |
| `user_stats`, `badges_awarded` | `onCardCreated`, `recompute` | cache + awards |
| `shares` | `POST /api/shares` | the slug-addressed snapshot; **no `expires_at`, explicitly because there is no cron** |
| `journal_entry_embeddings` | F15 | sibling table, never a column |

There is **no** table today that is read across users, and no scheduled write of
any kind.

---

## Key Data Structures

### Type: `LocalDate`
**Location:** `src/lib/time/local-date.ts:11`
**Definition:** `type LocalDate = string` — `'YYYY-MM-DD'`, the app's only representation of a day.
**Used in:** every `date` column, `localDateNow`, `getCardForDate`, `createCard`, all of `lib/gamification/`.

### Type: `ResolvedTimezone`
**Location:** `src/lib/db/queries/cards.ts:23`
**Definition:** `{ ok: true; timezone } | { ok: false; timezone; reason: 'no_profile' | 'invalid' }`
**Used in:** `getCardContext`, `/today`, `POST /api/cards`. Encodes the *reads may fall back, writes may not* rule. A reminder is a read-like act — but one that produces a permanent-ish artefact on someone's lock screen, so the plan treats an `!ok` zone as "do not send".

### Type: `Profile`
**Location:** `src/lib/db/schema.ts:96` (`profiles`)
**Fields of interest:** `timezone` (NOT NULL), `timezoneSource`, `onboardedAt`.

### Type: `CardWithItems`
**Location:** `src/lib/db/queries/cards.ts:84`
**Used in:** the tick's "has today's card already been made?" question, via `getCardForDate`.

### Constant: `SESSION_COOKIES`, matcher `config`
**Location:** `src/middleware.ts:15`, `:96`
The lookahead alternation is **prefix-matched** — the single most-warned-about fact in this codebase.

---

## Dependencies

### Configuration

| Name | Where | Status |
|---|---|---|
| `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_*`, `LLM_*` | `src/lib/env.ts` | required |
| `CHAT_MAX_NEW_ROUNDS_PER_DAY`, `APP_URL`, `EMBEDDING_*` | `src/lib/env.ts` | optional, `blankIsAbsent`-wrapped |
| `OPENAI_API_KEY`, `OPENROUTER_API_KEY` | `.env.local` only, read by `tools/gen_badge_art.py` | **must not appear under `src/`** — asserted by `badges:check` and `journal:check` |

`src/lib/env.ts` carries `import 'server-only'`. **No `NEXT_PUBLIC_*` variable
exists anywhere in this repository** (verified by grep over `src/`, `scripts/`
and the root configs). That is a real constraint on the VAPID public key, which
by definition has to reach the browser.

### Environment / runtime

- Next 15.5.23, React 19.1, App Router, `--turbopack`.
- Node `>=20.11`. Route handlers declare `runtime = "nodejs"` where they touch the DB.
- Vercel, `regions: ["sin1"]` pinned in `vercel.json` to sit beside Neon in `ap-southeast-1`.
- Drizzle 0.45.2 + `postgres` 3.4.9 (postgres-js, `prepare: false`, `max: 1`).
- Deployed from GitHub (`git@github.com:miftahulmahfuzh/daily-words`). **No `.github/` directory exists** — there is no CI and no workflow of any kind today.

### External services

- Google OAuth (Auth.js v5, database sessions).
- Neon Postgres, `ap-southeast-1`.
- z.ai (GLM) for text, OpenAI for embeddings.
- **New:** the browser vendors' push services — `web.push.apple.com` for iOS,
  reached through VAPID-signed requests. No account, no key exchange, no bill.

### Package

`web-push` (MIT, free) is the new dependency. It owns three things that are
genuinely unpleasant to hand-roll: VAPID JWT signing (ES256 over the P-256
private key), the RFC 8291 `aes128gcm` payload encryption, and the per-service
request shape. The roadmap's "no paid dependency" line is untouched.

---

## Reference List

Everything that has to move, or that constrains what moves.

| Symbol / key | File:line | Kind | Package |
|---|---|---|---|
| `manifest.webmanifest` | `public/manifest.webmanifest` | config | public |
| *(no service worker)* | — | **gap** | public |
| `metadata.manifest`, `appleWebApp` | `src/app/layout.tsx:29` | def | app |
| `AppLayout`, `<TimezoneSync/>` | `src/app/(app)/layout.tsx:41` | def | app |
| `middleware`, `config.matcher` | `src/middleware.ts:32`, `:96` | def | src |
| `isPublicSharePath` early return | `src/middleware.ts:70` | call | src |
| §12 excluded-prefix assertion | `scripts/check-badge-art.ts:452` | test | scripts |
| `headers()` — two `immutable` blocks | `next.config.ts:4` | config | root |
| `regions` | `vercel.json` | config | root |
| `env` schema | `src/lib/env.ts:29` | def | lib |
| `.env.example` | `.env.example` | doc | root |
| `requireApiUser` | `src/lib/api/guards.ts:10` | def | lib/api |
| `ok`, `fail`, `noStore`, `readJson` | `src/lib/api/respond.ts` | def | lib/api |
| `request` | `src/lib/api/client.ts:53` | def | lib/api |
| `localDateNow`, `localHour`, `isValidTimeZone`, `LocalDate` | `src/lib/time/local-date.ts:76`, `:81`, `:340` | def | lib/time |
| `getCardContext`, `resolveTimezone` | `src/lib/db/queries/cards.ts:60`, `:42` | call | lib/db |
| `getCardForDate` | `src/lib/db/queries/cards.ts:138` | call | lib/db |
| `countActiveWords` | `src/lib/db/queries/cards.ts:249` | call | lib/db |
| `getShareBySlug` — the no-userId precedent | `src/lib/db/queries/shares.ts` | ref | lib/db |
| `queries/` convention (rules 1–6) | `src/lib/db/queries/profiles.ts:11` | doc | lib/db |
| `profiles`, `dailyCards`, `users` tables | `src/lib/db/schema.ts:96`, `:245`, `:38` | def | lib/db |
| `tsz()`, `localDate()` helpers | `src/lib/db/schema.ts:26`, `:33` | def | lib/db |
| `src/lib/db/types.ts` exports | `src/lib/db/types.ts` | def | lib/db |
| `drizzle/_journal.json` — last idx 9 | `drizzle/meta/_journal.json` | config | drizzle |
| `ProfileEditForm` | `src/components/profile/profile-edit-form.tsx:55` | def | components |
| `ProfileEditPage` | `src/app/(app)/profile/edit/page.tsx:22` | def | app |
| `ToggleRow` | `src/components/ui/toggle-row.tsx:24` | def | components |
| `TimezoneSync` — the `<PushSync/>` template | `src/components/profile/timezone-sync.tsx:31` | ref | components |
| `encodeClaimIntent` — secret-as-parameter | `src/lib/share/intent.ts` | ref | lib/share |
| `isPublicSharePath` — pure, import-free predicate | `src/lib/share/policy.ts` | ref | lib/share |
| `check-share.ts` — offline assertion shape | `scripts/check-share.ts` | ref | scripts |
| `POST /api/cards` — "if you find yourself writing a scheduler, stop" | `src/app/api/cards/route.ts:25` | doc | app/api |
| `/today` header single-row assertion | `tests/e2e/no-scroll.spec.ts` | test | tests |
| Out-of-scope: "Push notifications or reminders of any kind" | `ROADMAP_v0.1.0.md:422` | doc | root |
| `[R11]` "No cron job — a scheduled job is the first step toward the notifications this roadmap forbids" | `ROADMAP_v0.1.0.md:562` | doc | root |
| `[R23]` — the amendment pattern to copy | `ROADMAP_v0.1.0.md:784` | ref | root |
| "There is no cron in this app ([R11])" | `src/lib/db/schema.ts:550` | doc | lib/db |
| Plan-level prohibitions | `plans/F1:93`, `F3:76`, `F5:87`, `F6:76`, `F7:76`, `F8:105`, `F9:69`, `F10:77`, `F13:213`, `F16:219`, `F17:277` | doc | plans |
| "no cron, no creation on page load" | `README.md:14`, `:101`, `:341` | doc | root |
| CHANGELOG "There is no cron" | `CHANGELOG.md:396`, `:245` | doc | root |
| 26 `<feature>:check` / `:db` scripts | `package.json` | config | root |

---

## Impact Points (files that WILL need changes)

| # | File | Why | Phase |
|---|---|---|---|
| 1 | `ROADMAP_v0.1.0.md` | `[R24]` must be written **before** any code: the out-of-scope list at `:422` and `[R11]` at `:562` forbid this feature outright, and CLAUDE.md's authority order makes the roadmap the winner over any plan. The owner has overruled it; that ruling has to live where the prohibition lives. | 1 |
| 2 | `src/lib/db/schema.ts` | Two new tables: `push_subscriptions` (the opt-in, one row per device) and `push_deliveries` (the per-slot idempotence record). | 1 |
| 3 | `src/lib/db/types.ts` | Inferred types for both. | 1 |
| 4 | `drizzle/0010_*.sql` + `drizzle/meta/` | The migration. Generated, not hand-written — this is plain additive DDL, unlike 0004 and 0009. | 1 |
| 5 | `src/lib/push/schedule.ts` **(new)** | `REMINDER_FIRST_HOUR = 7`, `REMINDER_EVERY_HOURS = 2`, `REMINDER_UNTIL_HOUR = 20`, the derived `REMINDER_SLOTS`, and `dueSlot()` — the catch-up resolver. Pure, import-free except `local-date`. | 1 |
| 6 | `src/lib/push/reminders.ts` **(new)** | The copy deck and `reminderFor(date, slot)`. Pure and deterministic — this is R2. | 1 |
| 7 | `scripts/check-push.ts` **(new)** + `package.json` | `npm run push:check`, offline. Slot derivation, catch-up matrix, deck uniqueness, full-cycle coverage, the VAPID-private-key grep. | 1 |
| 8 | `src/lib/env.ts` | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`. All optional with `blankIsAbsent` so a missing key degrades to "reminders off", never to a boot failure — the `EMBEDDING_API_KEY` precedent. | 2 |
| 9 | `.env.example` | The four new variables, and the paragraph saying they are a *fifth* key family, unrelated to `LLM_API_KEY`, `EMBEDDING_API_KEY`, `OPENAI_API_KEY` and `OPENROUTER_API_KEY`. | 2 (stub) / 5 (prose) |
| 10 | `package.json` | `web-push` + `@types/web-push` dependencies; `push:check`, `push:db`, `push:send` scripts. | 1 (scripts) / 2 (dep) |
| 11 | `src/lib/db/queries/push.ts` **(new)** | Subscription CRUD (`userId` first, per the convention) **plus one deliberate exception**: `listReminderCandidates()`, a cross-user scan with no `userId` parameter. Second such function in the app after `getShareBySlug`, and it has to be named as loudly. | 2 |
| 12 | `src/lib/push/send.ts` **(new)** | The `web-push` wrapper. `import 'server-only'`. Classifies 404/410 as "delete the row" and everything else as "log and move on". | 2 |
| 13 | `src/lib/push/schemas.ts` **(new)** | zod for the subscribe body. Client imports the inferred *type* only — the 73 kB lesson. | 2 |
| 14 | `src/app/api/push/key/route.ts` **(new)** | `GET` → `{ publicKey }`. Exists because there is no `NEXT_PUBLIC_*` in this repo and `lib/env.ts` is `server-only`. | 2 |
| 15 | `src/app/api/push/subscription/route.ts` **(new)** | `POST` upsert, `DELETE` remove. `requireApiUser()`. | 2 |
| 16 | `src/lib/push/client.ts` **(new)** | Browser half: capability detection, `subscribe()`, `unsubscribe()`, `syncSubscription()`. No `server-only`, no zod value import. | 2 |
| 17 | `public/sw.js` **(new)** | `push` → `showNotification`; `notificationclick` → focus an open client or `clients.openWindow('/today')`. Plain JS, no build step. | 3 |
| 18 | `src/middleware.ts` | `sw\.js` into the matcher lookahead, beside `manifest.webmanifest`. | 3 |
| 19 | `scripts/check-badge-art.ts` §12 | Extend the prefix regex to `(badges\|levels\|sw)` so no `src/app/sw*` route can ever be created under the new exemption. | 3 |
| 20 | `next.config.ts` | A third `headers()` source: `/sw.js` → `cache-control: no-cache`. The **inverse** of the two `immutable` blocks, with a comment saying so. | 3 |
| 21 | `src/components/push/push-sync.tsx` **(new)** | The `<TimezoneSync/>`-shaped reconciler: registers the worker and re-syncs a rotated endpoint. Zero requests in the steady state. | 3 |
| 22 | `src/app/(app)/layout.tsx` | Mount `<PushSync/>` beside `<TimezoneSync/>`. | 3 |
| 23 | `src/components/push/reminder-toggle.tsx` **(new)** | The switch, its permission handling, and the honest "Add to Home Screen first" state. | 3 |
| 24 | `src/components/profile/profile-edit-form.tsx` | One section for the toggle. It is **not** one of the five answers and is not saved by the Save button — it writes on tap, like the timezone is its own request. | 3 |
| 25 | `src/lib/push/tick.ts` **(new)** | The per-user decision: resolve zone → local date + hour → card exists? → active words? → `dueSlot()` → pick copy → send → record. Pure except for the reads it is handed. | 4 |
| 26 | `src/app/api/push/tick/route.ts` **(new)** | `POST`, `runtime = "nodejs"`, shared-secret auth via `timingSafeEqual`. | 4 |
| 27 | `.github/workflows/push-reminders.yml` **(new)** | Hourly `curl` at the tick. The shipped scheduler. | 4 |
| 28 | `scripts/push-send.ts` **(new)** | `npm run push:send` — fire one real notification at your own subscriptions, no schedule, no rows. The equivalent of `chat:dry-run`. | 4 |
| 29 | `scripts/check-push-db.ts` **(new)** | `npm run push:db` — the unique index, the 410 cascade, delivery idempotence, the card-exists suppression. Seeds and deletes a fixture user. | 4 |
| 30 | `CLAUDE.md` | A new section. The operating manual currently tells its reader there is no cron; leaving that is the "scene line describing superseded art" failure it warns about. | 5 |
| 31 | `README.md:14`, `:101`, `:341` | Three sentences that say no cron / no notifications. | 5 |
| 32 | `CHANGELOG.md` | The F30 entry. | 5 |
| 33 | `plans/F30-push-reminders.md` **(new)** | The feature plan, in the house style, with its own decision list. | 5 |
| 34 | `src/lib/db/schema.ts` (comment at `:550`) | "No expires_at. There is no cron in this app ([R11])" — still the right call for shares, now for a different reason. Amend rather than delete. | 5 |

### Not touched, deliberately

- **`src/app/(app)/today/page.tsx` and `POST /api/cards`.** The reminder points
  at the button; it does not become one. `[R19]`'s budget and the eighteen
  no-scroll assertions are untouched because nothing is added to that screen.
- **`src/app/(app)/profile/page.tsx`.** The pride screen holds no settings and
  no "your streak is at risk". The switch goes on `/profile/edit`.
- **`vercel.json`.** See the plan's `## Decisions` — a sub-daily `crons` entry is
  rejected outright on a Vercel Hobby plan, and a deployment that fails to
  *deploy* is a worse failure than a scheduler that lives one file away.
- **`src/lib/llm/`.** The copy is a deck, not a model call.
- **`src/lib/vocab/`, `src/lib/journal/`, `src/lib/gamification/`.** Untouched.

**This document describes. The plan files prescribe.**
