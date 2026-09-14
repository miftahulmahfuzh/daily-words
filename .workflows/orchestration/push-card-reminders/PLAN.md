# Plan: Push reminders to make today's card

**Slug:** push-card-reminders
**Date:** 2026-09-14 10:40:32 +07
**Analysis:** `20260914-104032-K7P2_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/daily-words/push-card-reminders`
**Branch:** `feature/push-card-reminders` (base: `origin/main` @ `5e9ff55`)
**Phases:** 5
**Status:** phase 1/5 complete
**Coordinator:** —

---

## Why

The user's words, verbatim:

> make sure the app send a different reminder as a push notification in my xs max to generate today's card.
> start from 7 am in the morning, then send a new one every 2 hours until 8 pm

This is the specification. Two things in it are load-bearing beyond the obvious:
**"a different reminder"** — the same sentence seven times a day is the thing
being asked against — and **"generate today's card"** — the notification's job
is to bring the user to the button, never to press it.

---

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | The app sends a push notification to the user's iPhone XS Max telling them to generate today's card | 2, 3, 4 |
| R2 | Each reminder is **different** — not the same sentence fired over and over | 1, 4 |
| R3 | The first at 07:00, then a new one every 2 hours, through to 20:00 | 1, 4 |

Phase 5 serves no requirement id. It is the doc sweep, and it serves invariant 12
— see **Decisions** D12.

---

## Scope

**In scope**

- A service worker at `/sw.js` that shows a notification and opens `/today`.
- VAPID keys, a `push_subscriptions` table, subscribe/unsubscribe routes, and a
  browser-side client that survives iOS rotating the endpoint.
- An opt-in switch on `/profile/edit`, with honest copy for the iOS-only
  requirement that the app be installed to the Home Screen first.
- A slot schedule derived from the user's three numbers, resolved in the user's
  own timezone, with catch-up for a late or missed tick.
- A curated deck of reminder copy, deterministic per `(local date, slot)`, so no
  two notifications in a day read alike.
- An authenticated tick endpoint and the scheduler that calls it hourly.
- `npm run push:check` (offline), `npm run push:db`, `npm run push:send`.
- The roadmap ruling `[R24]` that authorises all of it, and the doc sweep that
  makes every other file stop claiming the opposite.

**Out of scope, and why**

- **Any change to card creation.** `POST /api/cards` stays the only path, and it
  stays finger-triggered. `src/app/api/cards/route.ts:25` is not being relaxed —
  the scheduler here sends a *message*, it does not press a button.
- **Any change to `/today`.** [R19]'s vertical budget and the eighteen
  no-scroll assertions are untouched because nothing is added to that screen.
  F18 D3 already measured what one extra control there costs.
- **Anything on `/profile`.** The pride screen holds no settings, no countdown
  and no "your streak is at risk". The switch belongs on `/profile/edit`.
- **Model-written copy.** See Decisions D4.
- **Notifications for anything other than the daily card** — no badge news, no
  chat nudges, no journal prompts. One notification type, one destination.
- **Android/desktop-specific affordances** (actions, images, `silent`). The
  target is an iPhone XS Max; the code stays standards-plain so nothing else
  breaks, but nothing is built for a platform that was not asked about.
- **Retry/backoff queues, `waitUntil`, job tables.** One user, single-digit
  devices. The ceiling is named in phase 4 and the plan says what to do past it.

---

## Invariants

Every phase must hold all of these. A phase that cannot is a phase that is wrong.

1. **The tree builds and `npm run typecheck`, `npm run lint` pass at the end of
   each phase.** Every existing check script still passes, unchanged.
2. **No path other than `POST /api/cards` creates a `daily_cards` row.** Not the
   tick, not the service worker, not a notification action. `npm run push:db`
   greps `src/lib/push/` and `src/app/api/push/` for `createCard`,
   `onCardCreated`, `dailyCards`, `dailyCardItems` and `db.transaction`.
3. **`/today` gains no DOM.** `npm run test:layout` is untouched and green.
4. **Every day boundary and every local hour goes through
   `src/lib/time/local-date.ts`.** No new `Intl.DateTimeFormat`, and **no new
   occurrence of the literal `toISOString` anywhere under `src/` — in code or in
   a comment.** `scripts/check-share.ts` asserts that literal appears in exactly
   eight named files and scans **raw text**, comments included, over the whole of
   `src/`; a ninth turns `npm run share:check` red with an error message that
   mentions shares and says nothing about push. Phase 4's `TickSummary` reports
   `ranAtMs: number` for exactly this reason.
5. **`lib/db/queries/push.ts` keeps `userId` in every function and in every
   WHERE clause — with exactly one named exception**, `listReminderCandidates()`,
   documented in the file the way `getShareBySlug` is. The 410 sweep is
   `deleteDeadSubscription(userId, endpoint)`, two arguments, so that the
   exception stays literally one.
6. **A missing VAPID key is "reminders are off", never a boot failure.** The app
   builds, boots and serves with none of the four new variables set, and
   `npm run push:check` runs offline with no environment at all.
7. **`VAPID_PRIVATE_KEY` and `CRON_SECRET` never appear in a client bundle.**
   Asserted as a property rather than as a list of sanctioned filenames:
   **every file under `src/` that names either literal begins with
   `import 'server-only'`**, which turns a client import into a build error. Two
   files legitimately name one — `lib/push/send.ts` signs with the VAPID key and
   `app/api/push/tick/route.ts` compares the cron secret — and the tick route
   carries the import redundantly so the property has no exemptions.
   `lib/push/client.ts` must carry no such import and must name neither literal;
   `push:check` asserts both halves.
8. **Delivery is idempotent per `(user, local date, slot)`**, enforced by a
   unique index rather than by application code — the `chat_messages` opener
   precedent. A `'skipped'` or `'failed'` row occupies that key exactly as a
   `'sent'` one does, so a failed send is never retried into a duplicate.
9. **A user who has today's card gets nothing**, and no row is written for them.
10. **A notification is always shown when a push arrives.** `userVisibleOnly`
    is a promise to the browser; breaking it revokes the subscription. The
    worker defaults every payload field individually for this reason, even
    though the sender always sends all four.
11. **No new colour, type size or radius**, per `src/components/README.md`.
12. **Docs do not contradict the code.** A file still saying "there is no cron"
    after phase 4 is the one drift no check script can see.

---

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 ✅ | The ruling, the schema and the schedule | R2, R3 | `ROADMAP`, `lib/db`, `lib/push`, `scripts` | 9 | — | NORMAL | `.workflows/plan/push-card-reminders/phase-1.md` | P1-DW-A001 | — |
| 2 | Subscriptions, keys and the sender | R1 | `lib/env`, `lib/db/queries`, `lib/push`, `app/api/push` | 10 | 1 | HARD | `.workflows/plan/push-card-reminders/phase-2.md` | P1-DW-A002 | — |
| 3 | The service worker and the switch | R1 | `public`, `src/middleware`, `components/push`, `app/(app)` | 8 | 1, 2 | HARD | `.workflows/plan/push-card-reminders/phase-3.md` | P1-DW-A003 | — |
| 4 | The tick, the scheduler and the copy in flight | R1, R2, R3 | `lib/push`, `app/api/push/tick`, `.github`, `scripts` | 6 | 1, 2 | HARD | `.workflows/plan/push-card-reminders/phase-4.md` | P1-DW-A004 | — |
| 5 | The doc sweep | — (invariant 12) | root docs, `plans`, `lib/db` | 6 | 1, 2, 3, 4 | NORMAL | `.workflows/plan/push-card-reminders/phase-5.md` | P1-DW-A005 | — |

Phase 3's `Depends on` gained an edge to phase 1: `reminder-toggle.tsx` imports
`REMINDER_FIRST_HOUR`, `REMINDER_EVERY_HOURS` and `REMINDER_UNTIL_HOUR` to write
one sentence of copy, so the screen cannot drift from the schedule. Phase 4's
edge to phase 1 was already there and is load-bearing for more than `dueSlot` —
see D6.

### Phase 1 — The ruling, the schema and the schedule
**Satisfies:** R2, R3
**Owns:**
- `ROADMAP_v0.1.0.md` — a new `[R24]`, written in the shape of `[R23]`, that
  amends the "Explicitly out of scope" bullet at `:422` and the final paragraph
  of `[R11]` at `:562`. It is first because CLAUDE.md's authority order makes
  the roadmap win over any plan, and building four phases against a document
  that forbids the feature is the contradiction this workflow exists to avoid.
  `[R23]` at `:784` is the last decision in the file today, so `[R24]` is the
  correct next number.
- `src/lib/db/schema.ts` — `push_subscriptions` and `push_deliveries`.
  `push_subscriptions_endpoint_uniq` is UNIQUE on **`endpoint` alone**;
  `push_deliveries` carries a NOT NULL `status`, a nullable `reminder_key`, a
  nullable `reason`, and three CHECK constraints including
  `push_deliveries_reminder_key_check`.
- `src/lib/db/types.ts` — the inferred types.
- `drizzle/0010_*.sql` + `drizzle/meta/` — generated by `npm run db:generate`.
- `src/lib/push/schedule.ts` **(new)** — `REMINDER_FIRST_HOUR`,
  `REMINDER_EVERY_HOURS`, `REMINDER_UNTIL_HOUR`, the **derived** `REMINDER_SLOTS`,
  and `dueSlot({ localHour, delivered })`.
- `src/lib/push/reminders.ts` **(new)** — the copy deck, `reminderFor()` returning
  `Reminder | null` with a `key`, and `reminderByKey()`.
- `scripts/check-push.ts` **(new)** and its `package.json` script.

**Does not touch:** `src/lib/env.ts`, any route handler, any component, any
existing check script, `public/`, `next.config.ts`, `vercel.json`.

**Exit criteria:**
- `npm run db:generate` produces exactly one additive migration and
  `npm run db:migrate` applies it.
- `npm run push:check` passes with no environment and no network, and asserts at
  minimum: `REMINDER_SLOTS` derives to `[7,9,11,13,15,17,19]` from the three
  constants; the catch-up matrix over all 24 local hours × every subset of
  already-delivered slots; no two deck lines share a `body`; a whole day's seven
  reminders are pairwise distinct for 400 consecutive dates; the same
  `(date, slot)` always yields the same line; and invariant 7's server-only
  property in both directions.
- `npm run typecheck`, `npm run lint`, and every pre-existing check script pass.

### Phase 2 — Subscriptions, keys and the sender
**Satisfies:** R1
**Owns:**
- `src/lib/env.ts` — `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`,
  `CRON_SECRET`, all optional via `blankIsAbsent`.
- `.env.example` — the four variables and a short stub block appended after
  `APP_URL=` (`:62`). **The long prose paragraph is phase 5's**, and phase 5
  replaces this block wholesale.
- `package.json` + `package-lock.json` — the `web-push` dependency and
  `@types/web-push` devDependency. **`dependencies` and `devDependencies` only;
  no script entries** — `push:check` is phase 1's and `push:db` / `push:send`
  are phase 4's.
- `src/lib/db/queries/push.ts` **(new)** — `upsertSubscription(userId, input)`,
  `deleteSubscription(userId, endpoint)`, `listSubscriptions(userId)`,
  `deleteDeadSubscription(userId, endpoint)` (the 410 sweep),
  `listDeliveredSlots(userId, localDate)`, `claimDelivery(input)`,
  `markDeliveryFailed(userId, localDate, slot, reason)`, and the one cross-user
  exception `listReminderCandidates()` returning
  `{ userId, timezone, targets }`.
- `src/lib/push/send.ts` **(new)** — the `web-push` wrapper, `import 'server-only'`,
  `PushOutcome` discriminated on `reason`, service `topic` defaulting to
  `'daily-card'`.
- `src/lib/push/schemas.ts` **(new)** — zod for the subscribe body.
- `src/app/api/push/key/route.ts` **(new)** — `GET`, returns the public key.
- `src/app/api/push/subscription/route.ts` **(new)** — `POST` / `DELETE`.
- `src/lib/push/client.ts` **(new)** — the browser half, including the
  `dw_push_endpoint` localStorage mirror, which lives here and in no second
  module. Types only from schemas. **`enablePush()` never asks for permission.**

**Does not touch:** `public/sw.js`, `src/middleware.ts`, any component, the app
layout, `next.config.ts`, the tick, `scripts/`.

**Exit criteria:** the app boots with none of the four variables set; `GET
/api/push/key` answers `{ publicKey: null }` when unconfigured and a real key
when configured; `POST /api/push/subscription` is idempotent on `endpoint`;
`grep -rn "VAPID_PRIVATE_KEY\|CRON_SECRET" src/` returns only files beginning
`import 'server-only'`; `npm run typecheck`, `lint`, `build` and every check
script pass.

### Phase 3 — The service worker and the switch
**Satisfies:** R1
**Owns:**
- `public/sw.js` **(new)** — `push` and `notificationclick`, `FALLBACK.tag =
  "daily-card-reminder"`, `renotify: true`, and **no `fetch` handler**.
- `src/middleware.ts` — `sw\.js` into the matcher lookahead.
- `scripts/check-badge-art.ts` §12 — the excluded-prefix regex gains `sw`.
- `next.config.ts` — a `/sw.js` → `cache-control: no-cache` source.
- `src/components/push/push-sync.tsx` **(new)** — the `<TimezoneSync/>`-shaped
  reconciler. Calls `pushCapability()`, never `pushSupport()`.
- `src/app/(app)/layout.tsx` — mount it.
- `src/components/push/reminder-toggle.tsx` **(new)** — the switch and its four
  honest states. **It owns the permission ask**, called with nothing awaited
  above it.
- `src/components/profile/profile-edit-form.tsx` — one section for it.

**Does not touch:** anything under `lib/push/` or `lib/db/` except importing
from it — in particular it creates **no** second endpoint mirror — the tick,
`/today`, `/profile`, `package.json`.

**Exit criteria:** `curl -I http://localhost:3200/sw.js` with **no cookie jar**
answers `200` with a JavaScript content-type and a non-`immutable` cache header;
`npm run badges:check` passes with the widened §12;
`npm run test:layout` passes unchanged; `npm run typecheck` and `lint` pass; on
the XS Max installed to the Home Screen the switch turns on and a `push:send`
lands on the lock screen; in Safari **in a tab** the same screen says to install
rather than showing a dead switch.

### Phase 4 — The tick, the scheduler and the copy in flight
**Satisfies:** R1, R2, R3
**Owns:**
- `src/lib/push/tick.ts` **(new)** — the per-user decision and the fan-out,
  `REMINDER_TAG = "daily-card-reminder"`, `pushPayloadFor(reminder)`.
- `src/app/api/push/tick/route.ts` **(new)** — `POST`, `runtime = "nodejs"`,
  `import "server-only"`, `timingSafeEqual` against `CRON_SECRET` from an
  `Authorization: Bearer` header.
- `.github/workflows/push-reminders.yml` **(new)** — hourly, `curl`, one secret.
- `scripts/push-send.ts` **(new)** + `package.json` `push:send`.
- `scripts/check-push-db.ts` **(new)** + `package.json` `push:db`.

**Does not touch:** `public/sw.js`, `src/middleware.ts`, any component,
`src/lib/push/schedule.ts` or `reminders.ts` or `src/lib/db/queries/push.ts`
(phases 1 and 2 own their contents — and it creates no
`queries/push-deliveries.ts` sibling), `src/app/api/cards/route.ts`,
`vercel.json`.

**Exit criteria:** `npm run push:db` passes against fixture users and deletes
everything it wrote; a tick with a wrong secret answers `401` and writes nothing;
with no secret configured it answers `503`; a tick run twice in the same slot
sends once; a user with today's card gets nothing and no row; every `'sent'` row
carries the `reminder_key` of the line it sent; `npm run push:send` puts one real
notification on the phone.

### Phase 5 — The doc sweep
**Satisfies:** nothing. It serves invariant 12.
**Owns:**
- `CLAUDE.md` — a new section in the house voice, three command lines, and the
  amendments to every existing sentence there that says the app has no
  scheduler, plus the authority-order range `[R1]–[R24]`.
- `README.md` — `:13-15`, `:101`, `:339-345`.
- `CHANGELOG.md` — the F30 entry at the top of `## [Unreleased]`.
- `plans/F30-push-reminders.md` **(new)** — the feature plan with its own
  decision list, matching the F1–F29 house style.
- `.env.example` — the full paragraph replacing phase 2's stub.
- `src/lib/db/schema.ts` `:550` — the `shares.expires_at` comment, amended
  rather than deleted.

**Does not touch:** any behaviour. This phase changes no code path; the one
source edit is a comment. It does **not** touch `ROADMAP_v0.1.0.md` (phase 1's,
entirely), `CHANGELOG.md:245` or `:396` (history, see D11), or `plans/F1`–`F29`.

**Exit criteria:** `grep -rn -i "no cron" README.md CLAUDE.md` returns nothing;
every surviving hit in `CHANGELOG.md` and `src/` is either history named in the
new entry or an amended sentence; `git diff --stat -- ROADMAP_v0.1.0.md` is
empty for this phase; `git diff --stat -- src/` shows exactly
`src/lib/db/schema.ts` and the diff is comment-only; every check script passes.

---

## Reconciliation Log

| # | Conflict | Phases | Resolution |
|---|---|---|---|
| 1 | **`lib/push/client.ts` — two different modules of the same name.** Phase 2 (owner) shipped `pushSupport()`/`isSubscribed()`/`enableReminders()`/`disableReminders()`/`syncSubscription(): Promise<void>` with four `PushSupport` kinds; phase 3 (sole consumer) required nine functions, three kinds and three result types. | 2, 3 | One surface, written into both files. Phase 3's verbs and result-type names win (`enablePush`, `disablePush`, `PushEnableResult`/`PushDisableResult`/`PushSyncResult`); phase 2's four `PushSupport` kinds and their spellings win. Phase 3's `Status` union and `SENTENCE` keys rewritten from `needs-install` to `needs_home_screen`. See D1, D2, D3. |
| 2 | **Who asks for notification permission.** Phase 2's `enableReminders()` called `Notification.requestPermission()` internally; phase 3's toggle owns the gesture and required that it not. | 2, 3 | Phase 3 wins. `enablePush()` no longer asks; phase 2's file says so in its header comment and phase 3's handler is the only caller of `requestNotificationPermission()`. D1. |
| 3 | **Zero-request reconciler vs. an async `pushSupport()`.** Phase 3's `<PushSync/>` calls `pushSupport()` synchronously on every authed page; phase 2's version issues `GET /api/push/key`. | 2, 3 | Split into `pushCapability()` (synchronous, no network — `<PushSync/>`'s) and `pushSupport()` (capability + key fetch — the toggle's). D3. |
| 4 | **Two endpoint mirrors.** Phase 2 kept a `dw_push_endpoint` localStorage mirror inside `client.ts`; phase 3 added `src/components/push/endpoint-mirror.ts` under the key `push:endpoint` — a ninth file. | 2, 3 | Phase 2's wins (one owner per file region). Phase 3's file, its step, its imports and its rollback line deleted; phase 3 returns to the index's 8 files. D4. |
| 5 | **`claimDelivery` inserts a row that violates NOT NULL.** Phase 2's assumption A1 quoted a `push_deliveries` with no `status`, `reminder_key` or `reason`; phase 1 ships `status` NOT NULL. Phase 2's three-argument insert is a runtime `23502`. | 1, 2 | Phase 1's schema wins. Phase 2's A1 replaced with the real table; `claimDelivery` takes an input object with `status`, `reminderKey` and `reason`. |
| 6 | **`reminderFor`'s `key` never reached the row.** Phase 4's `pushPayloadFor` destructured `{ title, body }` and its `claimDelivery` passed no `reminder_key` — refused by `push_deliveries_reminder_key_check` at runtime. Phase 4 also treated the return as non-nullable. | 1, 4 | Real break, fixed in phase 4: `pushPayloadFor(reminder: Reminder)`, `reminder` resolved before the claim and narrowed for `null`, `reminderKey: reminder.key` threaded into `claimDelivery`. `push:db` gains a CHECK assertion and an end-to-end key↔body assertion. D6. |
| 7 | **`releaseDelivery` (delete) vs `markDeliveryFailed` (downgrade)** — opposite behaviours on the same failure. | 2, 4 | `markDeliveryFailed` wins; `releaseDelivery` deleted from phase 2. D5. |
| 8 | **Row-type and outcome names.** `PushTarget` vs `PushSubscriptionRow`; `PushOutcome`/`reason` vs `SendOutcome`/`kind`; `deleteDeadSubscription(userId, endpoint)` vs `deleteSubscriptionByEndpoint(endpoint)`. | 2, 4 | Phase 2 (owner) wins all three. Phase 4's Requires table, `tick.ts`, `push-send.ts` and `check-push-db.ts` rewritten, including every `outcome.kind` branch and the fake sender's outcome literals. Invariant 5 restated. |
| 9 | **`ReminderCandidate` with `targets` vs a per-user `listSubscriptions` call.** | 2, 4 | Phase 2's `targets` wins — one fewer Neon round trip per candidate in an hourly job. `listSubscriptions` survives for `push:send`. Phase 4's tick and `push:db` rewritten to build candidates via `listReminderCandidates()`. D7. |
| 10 | **Phase 4's "HARD ASK" for three functions in phase 2's file, with a sibling-file fallback.** | 2, 4 | Already satisfied: phase 2 planned them. Framing replaced with the settled signatures; the `queries/push-deliveries.ts` fallback withdrawn in both plans so no executor creates a second module. |
| 11 | **`push_subscriptions` unique index — phase 2 flagged it BLOCKING.** | 1, 2 | Already satisfied: phase 1's schema block *and* its generated migration SQL both ship `UNIQUE (endpoint)`. Alarm removed; the *reason* kept, since it is not recoverable from the DDL. |
| 12 | **Invariant 7 was wrong and would fail the build.** "greps `src/` for both literals outside `lib/env.ts`" — but `send.ts` and the tick route name one each, legitimately. Phase 1 had written the same thing as "at most one file". | index, 1, 2, 4 | Rewritten in the index and in `scripts/check-push.ts` as the server-only property, plus the mirror assertion that `client.ts` is not server-only and names neither. Phase 4's tick route's `import "server-only"` verified as redundant-but-honest, not wrong. D8. |
| 13 | **Notification `tag`** — phase 3's constant `'daily-card-reminder'` vs phase 4's per-day `dw-card-<localDate>`. | 3, 4 | Constant wins. `reminderTag(localDate)` replaced by `REMINDER_TAG` in phase 4; `push:db`'s assertion updated. D9. |
| 14 | **Payload optionality read as a contradiction** — phase 4 emits all four fields, phase 3's worker defaults every one. | 3, 4 | Both correct. Stated explicitly in both files: the worker must be tolerant because `userVisibleOnly` makes showing something mandatory; the sender is complete because it can be. Neither may be trimmed to match the other. |
| 15 | **Delivery-row column name.** Phase 1 shipped `error`; phase 4's tick and `push:db` were written throughout against `reason`, and two of its three writers are not errors. | 1, 4 | Column renamed to `reason` in phase 1's schema block, doc comment, Interface Contract and migration SQL. Phase 4's `select count(*) … created_at` corrected to `sent_at`. |
| 16 | **`scripts/check-push.ts` imports were unresolvable** — `./schedule`, `./reminders`, `./local-date` from `scripts/`. | 1 | Corrected to `../src/lib/push/…` and `../src/lib/time/local-date`, matching every other script in the repo. |
| 17 | **`dueSlot`'s `readonly superseded` assigned to a mutable `number[]`.** | 1, 4 | Phase 4 spreads (`[...superseded]`) at all three sites; its Requires table now quotes phase 1's actual signature. |
| 18 | **`upsertSubscription` requires `userAgent`; phase 4's `seedDevice` omitted it.** | 2, 4 | Phase 4 passes `userAgent: null`, which is what the route stores when the browser sends no header. |
| 19 | **`toISOString` under `src/`** — `check-share.ts` asserts eight named files over **raw text including comments**. Phase 4 complied; the other four were unchecked. | 1, 2, 3, 5 | Swept: the only occurrence in the whole plan set is inside `scripts/check-push.ts`, outside `src/`, asserting the absence. Nothing to fix. Promoted to invariant 4. |
| 20 | **`package.json` edited by three phases.** | 1, 2, 4 | Verified they compose in phase order: phase 1 adds `"push:check"` after `"claim:db"` (confirmed adjacent in the tree today); phase 2 touches `dependencies`/`devDependencies` only; phase 4 anchors its two lines on phase 1's entry. The index's phase-2 Owns prose, which wrongly claimed phase 2 owned the `push:db`/`push:send` entries, is corrected. |
| 21 | **`.env.example` stubbed by phase 2, replaced by phase 5, whose planner could not see the stub.** | 2, 5 | Anchor verified and quoted verbatim in phase 5: the file is 62 lines ending at `APP_URL=`; phase 2's stub begins `# F30 push reminders. ALL FOUR ARE OPTIONAL…` and ends `CRON_SECRET=`. Phase 5's hedged "Assumption (phase 2)" note removed. |
| 22 | **Phase 5's four assumptions about phases 3 and 4.** | 3, 4, 5 | All four verified and the hedges turned into confirmations: the tick uses `Authorization: Bearer`; `src/app/api/cards/route.ts` is in nobody's Files table and its `:25` comment is intact; `public/sw.js` registers `install`/`activate`/`push`/`notificationclick` and no `fetch`; `[R23]` at `:784` is the last decision in the roadmap, so `[R24]` and the `[R1]–[R24]` range correction are right. |
| 23 | **Phase 5 claimed `Satisfies: R1, R2, R3`** while its own handoff says it implements no requirement. | index, 5 | Requirement creep, removed rather than legalised. Phase 5's `Satisfies` line and the index's Requirements table now say it serves invariant 12. D12. |
| 24 | **File-count drift.** Index said 8/8/8/6/6; the plans do 9/10/9(→8)/6/6. | index, 2, 3 | Index corrected to 9/10/8/6/6; phase 3's ninth file removed by conflict 4, so its count returns to 8 rather than the table growing to match a file that should not exist. |
| 25 | **Phase 3's `Depends on` listed only phase 2** while `reminder-toggle.tsx` imports three phase-1 constants. | index, 3 | Edge added in both. |
| 26 | **Impact-point ownership.** All 34 rows of the analysis's table checked. | all | Every row has exactly one owner. Three rows are touched by two phases in sequence and are not collisions: `.env.example` (2 stubs, 5 replaces — anchor verified), `package.json` (1 scripts, 2 deps, 4 scripts — different blocks), `src/lib/db/schema.ts` (1 appends the tables at the end of file, 5 amends the `shares` comment at `:550`). No gaps. |

---

## Decisions

Every behavioural fork settled during reconciliation, with the rung of the
ladder that settled it. An executor reads this instead of asking.

| # | The fork | The choice | The rung |
|---|---|---|---|
| D1 | Does `enablePush()` ask for notification permission, or does the toggle? | **The toggle, and only the toggle.** `enablePush()` must register a service worker before it can subscribe, and on iOS an `await` between the tap and `Notification.requestPermission()` loses the gesture — a register-then-ask ordering is a prompt that never appears, on the one platform this feature exists for. | **Stated invariant** — the iOS gesture rule in the index's phase-3 scope and in the analysis's constraints, which no ownership claim can override. |
| D2 | Three `PushSupport` kinds or four? | **Four.** `unconfigured` (the server has no VAPID key) is one of the four states the switch is required to draw; collapsing it into `unsupported` tells an iPhone user their phone is broken when the server is. Phase 2's spellings (`needs_home_screen`) are kept so `support.kind` assigns straight into the toggle's `Status`. | **Phase exit criteria** — phase 3's "four honest states", plus one-owner-per-region for the spelling. |
| D3 | `<PushSync/>` needs a capability check that costs nothing; `pushSupport()` costs a request. | **Two functions.** `pushCapability()` is synchronous and network-free for the reconciler; `pushSupport()` is capability + `GET /api/push/key` for the settings screen. | **Stated invariant** — `<TimezoneSync/>`'s "zero requests in the steady state", which the analysis names as the precedent the component is built on. |
| D4 | Where does the "what endpoint did we last tell the server" mirror live? | **Inside `lib/push/client.ts`**, one key, written only by `enablePush`/`disablePush`/`syncSubscription`. Phase 3's `components/push/endpoint-mirror.ts` is deleted. Two mirrors of one fact is two try/catch disciplines and one silent disagreement. | **One owner per file region** — phase 2 owns device-subscription state, and phase 3's own contract says `lib/push/**` is imported, never extended. |
| D5 | A slot was claimed and every send failed: **release** the row so the next tick retries, or **downgrade** it to `'failed'` so the slot is spent? | **Downgrade.** The row keeps the slot; the cost is one missed reminder out of seven rather than a duplicate buzz two hours later, which is the failure that teaches somebody to turn reminders off. `releaseDelivery` is deleted. | **Stated invariant** — phase 1's schema makes `'failed'` a first-class status with a CHECK contemplating it, and its handoff says the tick "insert[s] one `'sent'` or `'failed'` row". Corroborated by phase 4's D5 and phase 5's CLAUDE.md prose, both already written this way. |
| D6 | Does the deck line's `key` travel with the notification? | **Yes, and it is not optional.** `push_deliveries_reminder_key_check` refuses a `'sent'` row whose `reminder_key` is null, so `reminderFor` is resolved *before* the claim and `pushPayloadFor` takes the whole `Reminder`. A payload builder that takes `(date, slot)` lets a caller forget the key, and that is a `23514` at 07:00 rather than a type error. | **Stated invariant** — the CHECK constraint in phase 1's shipped schema. |
| D7 | Do the devices ride on `ReminderCandidate`, or does the tick call `listSubscriptions(userId)` per user? | **They ride on the candidate.** It costs nothing in narrowness — the exception is still one function returning three hand-named fields that cannot grow a `profiles` column — and it removes one Neon round trip per candidate from an hourly job. | **Surrounding convention** — CLAUDE.md's `sin1` section makes sequential round-trip count the app's one invisible performance property; with one user either shape works, so the cheaper one wins. |
| D8 | Is invariant 7 a filename allowlist or a property? | **A property**: every file under `src/` naming either secret begins with `import 'server-only'`. The allowlist version is factually wrong — `send.ts` and the tick route each name one legitimately — and a list needs editing by every phase that adds a reader, which is how a check stops being believed. The tick route carries the import redundantly so the property has zero exemptions. | **Stated invariant** — invariant 7's own stated *mechanism* ("everything that reads them carries `import 'server-only'`"), against its mis-stated test. |
| D9 | Notification `tag`: constant `'daily-card-reminder'` or per-day `dw-card-<localDate>`? | **Constant.** Both collapse a day's reminders; only the constant collapses across midnight. A per-day tag lets yesterday's undismissed reminder sit beside today's — and yesterday's card can no longer be made, so it is a notification asking for something impossible. At most one Daily Words reminder is ever on the lock screen. | **The plans' code blocks** — phase 3's worker already hard-codes the constant as `FALLBACK.tag` and pairs it with `renotify: true`; the sender is the cheaper side to move. |
| D10 | Is the payload's field-by-field defaulting in `sw.js` a contradiction of the sender always sending all four? | **No, and both files now say so.** The worker must be tolerant because `userVisibleOnly: true` makes showing *something* mandatory and a revoked subscription is the price; the sender is complete because it always knows all four. Neither side may be trimmed to match the other. | **Stated invariant** — invariant 10. |
| D11 | `CHANGELOG.md:245` and `:396` still say there is no cron. Amend in place, or leave as history with a pointer from the new entry? | **Leave as written.** The new `[Unreleased]` entry *is* the amendment, and it names both lines by `file:line`. `README.md` and `CLAUDE.md` are amended in place instead, because they describe the app as it is now and a false sentence there is a lie rather than a record. | **Surrounding convention**, decided by the file itself: `CHANGELOG.md:40` already rules on this exact case — *"The v0.2.0 entry below still names the old key: it is history and was left as written."* |
| D12 | Does phase 5 satisfy R1, R2 and R3? | **No.** It serves invariant 12. Its own handoff says "no step in this phase implements any part of any requirement", and `create-task` reads the Requirements table to shape the board — a doc sweep filed as delivery work against R1 is a card nobody can close. | **Phase exit criteria** — phase 5's own, against the draft index's table. |
| D13 | `push_deliveries`' fourth text column: `error` (phase 1) or `reason` (phase 4)? | **`reason`.** Two of its three writers are not errors — `'superseded'` and `'no_active_words'` are decisions — and the name has exactly one consumer's worth of prose behind it against a whole script written the other way. | **The plans' code blocks** — phase 4's `check-push-db.ts` reads and asserts `reason` throughout; phase 1's `error` appears in one doc line with no reader. |

---

## Open Questions

None. Every fork above was decidable on the ladder, and the two that looked like
alarms — the `push_subscriptions` unique index and phase 4's "HARD ASK" for three
query functions — were already satisfied by the plans as written.

The reversible-additive test was applied once, to migration `0010`: it creates two
tables and drops nothing, so a rollback is `drop table` plus a journal edit and it
is not an irreversible fork.

---

## Rollback

**Per phase**, newest first — each phase is additive and reverts on its own.

- **Phase 5.** `git checkout HEAD~1 -- CLAUDE.md README.md CHANGELOG.md .env.example src/lib/db/schema.ts` and `rm plans/F30-push-reminders.md`. No script changes its answer. The six edits are independent of one another. **The cost of this rollback is exactly the cost of not doing the phase**: the repo ships a scheduler while five files say it has none, which is invariant 12's drift.
- **Phase 4.** **Stop the clock first** — Actions → "push reminders" → Disable workflow, or delete `.github/workflows/push-reminders.yml`. With the route gone but the workflow live, every hour turns the Actions tab red on a 404. Then `rm -r src/app/api/push/tick`, `rm src/lib/push/tick.ts scripts/push-send.ts scripts/check-push-db.ts`, and remove the two `package.json` lines. Existing `push_deliveries` rows become inert, like an award row under a dead badge key. **No migration is reverted** — the tables are phase 1's.
- **Phase 3.** Delete `public/sw.js` and both components, revert `src/app/(app)/layout.tsx`, `src/components/profile/profile-edit-form.tsx`, `src/middleware.ts`, `scripts/check-badge-art.ts` and `next.config.ts`. **One thing this does not undo:** a worker already registered on a phone stays registered until its next update check 404s, which a standalone PWA may not make for a day. On a test device, unregister by hand — Settings → Safari → Advanced → Website Data, or delete and re-add the Home Screen icon.
- **Phase 2.** `rm` the four new `lib/push/*` and `lib/db/queries/push.ts` and `src/app/api/push`, `git checkout` `src/lib/env.ts`, `.env.example`, `package.json`, `package-lock.json`, then `npm ci`. If phase 1 stays, the two tables are simply unused.
- **Phase 1.** `git revert` the commit, then `drop table if exists push_deliveries; drop table if exists push_subscriptions;`, delete the newest `drizzle.__drizzle_migrations` row, delete `drizzle/0010_*.sql` and `drizzle/meta/0010_snapshot.json`, and remove the `idx: 10` entry from `drizzle/meta/_journal.json`. `npm run db:generate` must then report no changes.

**As a whole**, roll back in reverse phase order: 5, 4 (workflow first), 3, 2, 1.

**The shape to avoid, named by phase 1 and worth repeating here: a partial
rollback that drops the tables but keeps `[R24]`.** That leaves the repository
authorising a feature it no longer has, which is the mirror image of the state
this plan set existed to fix — and it is worse, because nothing fails. Either
`[R24]` and the tables both stand, or neither does. If only the *scheduler* is
wrong (Actions minutes, a repo going private, reminders arriving too late),
phase 4's step 1 alone is the whole rollback and everything else stays.

---

## Next

Execute the phases one at a time, starting at phase 1 — it holds `[R24]`, the
schema and the schedule, and every other phase depends on it:

    /implement -f PUSH_CARD_REMINDERS_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever
`Depends on` allows (phases 3 and 4 share no edge), resumable on any machine:

    /analyze-orchestrator -f PUSH_CARD_REMINDERS_PLAN.md

Or put them on the board first:

    /create-task --from-plan PUSH_CARD_REMINDERS_PLAN.md
