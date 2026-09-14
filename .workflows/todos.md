# Todos: daily-words

**Package Path**: `.`
**Package Code**: DW
**Last Updated**: 2026-09-14 11:42
**Total Active Tasks**: 4

## Quick Stats
- P0 Critical: 0
- P1 High: 4
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 1

---

## Active Tasks

### [P1] High

- [ ] **P1-DW-A002** Phase 2: Subscriptions, keys and the sender
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns `src/lib/env`, `src/lib/db/queries`, `src/lib/push`, `src/app/api/push` (10 files). Adds the four optional VAPID/CRON_SECRET env vars, `lib/db/queries/push.ts`'s subscription and delivery CRUD (`upsertSubscription`, `deleteSubscription`, `listSubscriptions`, `deleteDeadSubscription`, `listReminderCandidates`, `claimDelivery`), the `GET /api/push/key` and subscribe/unsubscribe routes, and `lib/push/send.ts`, which encrypts and VAPID-signs one notification and classifies the response instead of throwing. Exit: app boots/builds/serves with all four vars unset; `GET /api/push/key` answers `{"publicKey":null}` unconfigured (and the real key configured) with `no-store` and 401 with no cookie; `POST /api/push/subscription` is idempotent on `endpoint`; typecheck/lint/build and all eleven existing check scripts pass; nothing under `src/` names `NEXT_PUBLIC_`, and both secret-bearing files carry `import 'server-only'`.
  - **Status**: open
  - **Plan Set**: `PUSH_CARD_REMINDERS_PLAN.md` (phase 2 of 5)
  - **Satisfies**: R1
  - **Depends on**: P1-DW-A001
  - **Plan**: `.workflows/plan/P1-DW-A002.md`

- [ ] **P1-DW-A003** Phase 3: The service worker and the switch
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns `public`, `src/middleware`, `components/push`, `app/(app)` (8 files). Adds `public/sw.js` (shows a notification for every push including a malformed one, opens `/today` on tap), the render-nothing `PushSync` reconciler that re-registers a rotated iOS endpoint, and the `ReminderToggle` switch on `/profile/edit` that tells the truth in all four cases it can't subscribe (no support, not installed to Home Screen, no server key, permission denied) — built on Phase 2's `lib/push/client.ts`. Exit: `curl -I /sw.js` with no cookie jar answers 200, JS content-type, no `immutable`/non-zero `max-age`; `badges:check` passes with the widened `/^(badges|levels|sw)/`; `test:layout`, typecheck, lint, build all pass with the eighteen layout assertions unmodified; on an installed XS Max the switch turns on and a `push:send` lands and opens `/today`; in Safari-in-a-tab the same screen prompts to install rather than showing a dead switch.
  - **Status**: blocked
  - **Plan Set**: `PUSH_CARD_REMINDERS_PLAN.md` (phase 3 of 5)
  - **Satisfies**: R1
  - **Depends on**: P1-DW-A001, P1-DW-A002
  - **Plan**: `.workflows/plan/P1-DW-A003.md`

- [ ] **P1-DW-A004** Phase 4: The tick, the scheduler and the copy in flight
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns `src/lib/push`, `src/app/api/push/tick`, `.github`, `scripts` (6 files). Adds the hourly clock: a GitHub Actions job POSTs `/api/push/tick` with a shared secret; the tick resolves each subscribed user's own local date/hour, stays silent if today's card already exists, otherwise claims one slot in `push_deliveries` and sends that slot's line of copy to every registered device. Exit: the Actions run answers 200 and is green; `npm run push:db` passes and leaves no fixture rows; a missing/wrong secret answers 401 and writes nothing, no secret configured answers 503; two ticks in the same slot produce one notification and one `'sent'` row; a user with today's card already made gets nothing and no row of any kind; `npm run push:send` puts one real, readable notification on the iPhone XS Max; typecheck/lint/build and every pre-existing check pass.
  - **Status**: blocked
  - **Plan Set**: `PUSH_CARD_REMINDERS_PLAN.md` (phase 4 of 5)
  - **Satisfies**: R1, R2, R3
  - **Depends on**: P1-DW-A001, P1-DW-A002
  - **Plan**: `.workflows/plan/P1-DW-A004.md`

- [ ] **P1-DW-A005** Phase 5: The doc sweep
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns root docs (`CLAUDE.md`, `README.md`, `CHANGELOG.md`, `.env.example`), `plans/`, and one comment in `src/lib/db/schema.ts` (6 files). Implements no requirement itself — R1–R3 are served entirely by phases 1–4 — but serves invariant 12 (docs must not contradict the code): writes `plans/F30-push-reminders.md` in the house format naming `[R24]`, adds a `CLAUDE.md` section on the feature's seven silent-failure traps and three Commands-block lines, and updates `.env.example`'s VAPID/CRON_SECRET prose, amending every superseded "no cron"/"no push" sentence rather than deleting it. No behaviour changes; the one edit under `src/` is a comment. Exit: no surviving unexplained "no cron" hits in README/CLAUDE, every hit in CHANGELOG/src is either named history or an amended sentence; `plans/F30-push-reminders.md` exists, names `[R24]`, and its §8 table accounts for all thirteen prohibitions from the analysis's Reference List; `.env.example` explains the VAPID pair as a locally generated identity and `CRON_SECRET` as a two-place shared secret; `git diff --stat` names no file outside this phase's six; typecheck/lint and every check script pass unchanged.
  - **Status**: blocked
  - **Plan Set**: `PUSH_CARD_REMINDERS_PLAN.md` (phase 5 of 5)
  - **Satisfies**: — (invariant 12)
  - **Depends on**: P1-DW-A001, P1-DW-A002, P1-DW-A003, P1-DW-A004
  - **Plan**: `.workflows/plan/P1-DW-A005.md`

---

## Completed Tasks

- [x] **P1-DW-A001** Phase 1: The ruling, the schema and the schedule
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns `ROADMAP_v0.1.0.md`, `src/lib/db`, `src/lib/push`, `scripts` (9 files). Adds `[R24]` authorising push reminders in place of the old prohibition, the `push_subscriptions` and `push_deliveries` tables, and the two pure modules that decide when a reminder fires and what it says — no network import, no env var read, no route handler, no pixel rendered yet. Exit: `[R24]` amends the roadmap bullet in place; `db:generate` emits exactly one additive migration and `db:migrate` applies it; `npm run push:check` passes fully offline (even with `DATABASE_URL` unset); typecheck/lint/build and every pre-existing check pass; `git diff --stat` touches exactly the nine listed paths and nothing else (env.ts, middleware.ts, next.config.ts, public/, vercel.json, .env.example and every component untouched).
  - **Status**: completed
  - **Plan Set**: `PUSH_CARD_REMINDERS_PLAN.md` (phase 1 of 5)
  - **Satisfies**: R2, R3
  - **Depends on**: —
  - **Plan**: `.workflows/plan/P1-DW-A001.md`
  - **Completed**: 2026-09-14 11:42
  - **Method**: /do
  - **Files**: ROADMAP_v0.1.0.md, src/lib/db/schema.ts, src/lib/db/types.ts, drizzle/0010_open_hawkeye.sql, drizzle/meta/0010_snapshot.json, drizzle/meta/_journal.json, src/lib/push/schedule.ts, src/lib/push/reminders.ts, scripts/check-push.ts, package.json
  - **Drift**: Pre-existing, unrelated failure in `npm run dates:check`: the '/today header' assertion expects the formatted string "Sunday, 9 August" but this environment's Intl/ICU produces "Sunday 9 August" (no comma). This is in `src/lib/time/local-date.ts` / `scripts/check-dates.ts`, neither of which phase 1 touches (confirmed via `git diff --stat` — only the 10 files above changed). Environment/ICU-version drift, not introduced by this phase. Every other pre-existing check script (vocab:check, nav:check, profile:check, chat:check, discover:check, journal:check, share:check, claim:check, badges:check, stats:check) and `npm run test:layout` (96 passed, 10 skipped without DW_TEST_SESSION) pass cleanly.

---

## Archive

_None yet._
