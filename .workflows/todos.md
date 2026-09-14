# Todos: daily-words

**Package Path**: `.`
**Package Code**: DW
**Last Updated**: 2026-09-14 12:27
**Total Active Tasks**: 0

## Quick Stats
- P0 Critical: 0
- P1 High: 0
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 5

---

## Active Tasks

_None._

---

## Completed Tasks

- [x] **P1-DW-A005** Phase 5: The doc sweep
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns root docs (`CLAUDE.md`, `README.md`, `CHANGELOG.md`, `.env.example`), `plans/`, and one comment in `src/lib/db/schema.ts` (6 files). Implements no requirement itself — R1–R3 are served entirely by phases 1–4 — but serves invariant 12 (docs must not contradict the code): writes `plans/F30-push-reminders.md` in the house format naming `[R24]`, adds a `CLAUDE.md` section on the feature's seven silent-failure traps and three Commands-block lines, and updates `.env.example`'s VAPID/CRON_SECRET prose, amending every superseded "no cron"/"no push" sentence rather than deleting it. No behaviour changes; the one edit under `src/` is a comment. Exit: no surviving unexplained "no cron" hits in README/CLAUDE, every hit in CHANGELOG/src is either named history or an amended sentence; `plans/F30-push-reminders.md` exists, names `[R24]`, and its §8 table accounts for all thirteen prohibitions from the analysis's Reference List; `.env.example` explains the VAPID pair as a locally generated identity and `CRON_SECRET` as a two-place shared secret; `git diff --stat` names no file outside this phase's six; typecheck/lint and every check script pass unchanged.
  - **Status**: completed
  - **Plan Set**: `PUSH_CARD_REMINDERS_PLAN.md` (phase 5 of 5)
  - **Satisfies**: — (invariant 12)
  - **Depends on**: P1-DW-A001, P1-DW-A002, P1-DW-A003, P1-DW-A004
  - **Plan**: `.workflows/plan/P1-DW-A005.md`
  - **Unblocked**: 2026-09-14 12:12 — all four declared dependencies have now landed. Phase 3 (P1-DW-A003) completed at 12:10 concurrently in this same worktree, and phase 4 (P1-DW-A004) completed at 12:12. Phase 5 touches only docs plus one comment in `src/lib/db/schema.ts`, so it can start as soon as phase 3's own commit has landed on the branch.
  - **Completed**: 2026-09-14 12:27
  - **Method**: /do
  - **Files**: CLAUDE.md, README.md, CHANGELOG.md, .env.example, src/lib/db/schema.ts, plans/F30-push-reminders.md
  - **Drift**: Minor anchor drift, not code drift: phase 2's actual `.env.example` stub prose (the block after `APP_URL=`) differs word-for-word from what phase 5's plan quoted as the anchor, though the first line (`# F30 push reminders. ALL FOUR ARE OPTIONAL: with none of them set the app`) and the last line (`CRON_SECRET=`) match exactly, and the four variable names/order match. Followed the plan's intent: deleted the entire stub block and appended phase 5's full replacement verbatim, since Step 8 says to replace it wholesale regardless of the stub's middle wording.
  - **Drift**: Found and fixed a genuine self-contradiction inside phase 5's own plan: Step 3's and Step 4's "Code — after" blocks (which were applied verbatim from the adopted plan) each contained the literal phrase "there is no cron" inside `CLAUDE.md` prose, while the same phase's Verification section states as a hard, explicit exit criterion that `grep -rn -i "no cron" README.md CLAUDE.md` returns nothing — "a hit in either file is a missed edit." Per the /implement precedence ladder, the phase's own exit criteria (rung 2) outranks the code block's exact prose (rung 3), so the two spots in `CLAUDE.md` were reworded to preserve their meaning (the invariant that replaces the old rule; the [R11] generalisation being superseded) without using the literal trigger phrase, rather than leaving the grep failing. Verified afterward that `grep -rn -i "no cron\|there is no cron" README.md CLAUDE.md` returns zero hits, while `CHANGELOG.md` and `src/` still carry exactly the expected historical/amended hits (CHANGELOG.md's two pre-existing v0.1.0/v0.2.0 entries named by `file:line` in the new `[Unreleased]` entry, `src/app/api/cards/route.ts:25` and `src/lib/push/tick.ts:25` untouched from earlier phases, and `src/lib/db/schema.ts:550` the amended comment this phase wrote).
  - **Decided**: `CLAUDE.md` wording at Step 3's Conventions bullet and Step 4's new section → reworded away from the literal phrase "there is no cron" while keeping the same meaning (rung 2: phase exit criteria, specifically Grep 1's explicit zero-hits requirement, over rung 3: the plan's own code-block prose).
  - **Verification**: `typecheck`, `lint`, `build`, `push:check`, `push:db`, `vocab:check`, `nav:check`, `profile:check`, `chat:check`, `discover:check`, `journal:check`, `share:check`, `claim:check`, `badges:check`, `stats:check` all pass; `test:layout` 96 passed / 10 skipped (the skipped need `DW_TEST_SESSION`), same as prior phases. All five verification greps from the phase plan pass after the wording fix above. `git diff --stat` shows exactly the six files this phase owns (five modified + one new), nothing else.
  - **Drift**: `npm run dates:check` still shows its one pre-existing, unrelated failure — the '/today header' ICU comma difference, "Sunday, 9 August" vs "Sunday 9 August" — already documented as environment drift in phases 1 and 2's completion records. Confirmed via `git diff --stat -- src/` that this phase touches only `src/lib/db/schema.ts`, comment-only.

- [x] **P1-DW-A004** Phase 4: The tick, the scheduler and the copy in flight
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns `src/lib/push`, `src/app/api/push/tick`, `.github`, `scripts` (6 files). Adds the hourly clock: a GitHub Actions job POSTs `/api/push/tick` with a shared secret; the tick resolves each subscribed user's own local date/hour, stays silent if today's card already exists, otherwise claims one slot in `push_deliveries` and sends that slot's line of copy to every registered device. Exit: the Actions run answers 200 and is green; `npm run push:db` passes and leaves no fixture rows; a missing/wrong secret answers 401 and writes nothing, no secret configured answers 503; two ticks in the same slot produce one notification and one `'sent'` row; a user with today's card already made gets nothing and no row of any kind; `npm run push:send` puts one real, readable notification on the iPhone XS Max; typecheck/lint/build and every pre-existing check pass.
  - **Status**: completed
  - **Plan Set**: `PUSH_CARD_REMINDERS_PLAN.md` (phase 4 of 5)
  - **Satisfies**: R1, R2, R3
  - **Depends on**: P1-DW-A001, P1-DW-A002
  - **Plan**: `.workflows/plan/P1-DW-A004.md`
  - **Completed**: 2026-09-14 12:12
  - **Method**: /do
  - **Files**: src/lib/push/tick.ts, src/app/api/push/tick/route.ts, .github/workflows/push-reminders.yml, scripts/push-send.ts, scripts/check-push-db.ts, package.json
  - **Drift**: None in the code. Every symbol this phase imports from phase 1 (`src/lib/push/schedule.ts`, `src/lib/push/reminders.ts`, `src/lib/db/schema.ts`) and phase 2 (`src/lib/db/queries/push.ts`, `src/lib/push/send.ts`, `src/lib/db/queries/cards.ts`, `src/lib/db/queries/profiles.ts`, `src/lib/time/local-date.ts`, `src/lib/api/respond.ts`, `src/lib/env.ts`) matched the plan's Requires table exactly — no code was adapted.
  - **Drift**: Phase 3 (P1-DW-A003) was landing concurrently in this same worktree during this run. `public/sw.js`, `src/middleware.ts`, `src/components/push/`, `next.config.ts`, `scripts/check-badge-art.ts`, `src/app/(app)/layout.tsx` and `src/components/profile/profile-edit-form.tsx` all appeared or changed mid-session, and this file picked up an external edit marking P1-DW-A003 complete and correcting P1-DW-A004's stale `blocked` status to `open`. None of those files were touched by this phase; the commit stages exactly the six files above by explicit path so phase 3's work stays with phase 3's own commit.
  - **Drift**: `npm run push:send` was exercised end-to-end against a real user (mahfuzh74@gmail.com) and printed a correct, non-repeating deck line, but exited 1 with "No subscriptions" because no device has subscribed yet — phase 3, which registers subscriptions, was still landing.
  - **Verification**: typecheck, lint, build, `push:check`, `share:check`, `claim:check`, `nav:check`, `journal:check`, `stats:check`, `badges:check` all pass; `test:layout` 96 passed / 10 skipped (the skipped need `DW_TEST_SESSION`); `push:db` passes every section with fixture rows confirmed cleaned up via psql; `POST /api/push/tick`'s four states verified by curl against a temporary local dev server on 3200 (401 with a wrong or absent secret when configured, 503 with `CRON_SECRET` unset, 200 with the right secret, 405 on GET), server stopped afterwards.
  - **Not verified**: the exit criterion "`npm run push:send` puts one real, readable notification on the iPhone XS Max" needs phase 3 live and a device subscribed via `/profile/edit` — a manual on-phone pass outside this session's reach, not a code defect. The GitHub Actions manual-run criteria likewise need the branch pushed and the `CRON_SECRET` repository secret configured, neither of which can be done from here.

- [x] **P1-DW-A003** Phase 3: The service worker and the switch
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns `public`, `src/middleware`, `components/push`, `app/(app)` (8 files). Adds `public/sw.js` (shows a notification for every push including a malformed one, opens `/today` on tap), the render-nothing `PushSync` reconciler that re-registers a rotated iOS endpoint, and the `ReminderToggle` switch on `/profile/edit` that tells the truth in all four cases it can't subscribe (no support, not installed to Home Screen, no server key, permission denied) — built on Phase 2's `lib/push/client.ts`. Exit: `curl -I /sw.js` with no cookie jar answers 200, JS content-type, no `immutable`/non-zero `max-age`; `badges:check` passes with the widened `/^(badges|levels|sw)/`; `test:layout`, typecheck, lint, build all pass with the eighteen layout assertions unmodified; on an installed XS Max the switch turns on and a `push:send` lands and opens `/today`; in Safari-in-a-tab the same screen prompts to install rather than showing a dead switch.
  - **Status**: completed
  - **Plan Set**: `PUSH_CARD_REMINDERS_PLAN.md` (phase 3 of 5)
  - **Satisfies**: R1
  - **Depends on**: P1-DW-A001, P1-DW-A002
  - **Plan**: `.workflows/plan/P1-DW-A003.md`
  - **Completed**: 2026-09-14 12:10
  - **Method**: /do
  - **Files**: public/sw.js, src/middleware.ts, scripts/check-badge-art.ts, next.config.ts, src/components/push/push-sync.tsx, src/app/(app)/layout.tsx, src/components/push/reminder-toggle.tsx, src/components/profile/profile-edit-form.tsx
  - **Drift**: `public/sw.js`'s doc comment as quoted in the phase plan contained the literal glob `**/*.js` inside a `/* */` block comment. That glob's `*/` prematurely closed the comment and broke `npm run lint` with a parse error. Fixed by rephrasing to "no glob for `.js` files" — no semantic change, same meaning preserved.
  - **Verification**: typecheck, lint, build, `badges:check` (§12 now rejects any `src/app` directory starting with `sw`), `push:check`, `share:check`, `claim:check`, `nav:check` all pass; `test:layout` 96 passed / 10 skipped (the skipped need `DW_TEST_SESSION`), the eighteen no-scroll assertions green and unmodified; `curl -I /sw.js` with no cookie jar answers 200, `application/javascript`, `cache-control: no-cache`, and `/profile/edit` and `/today` still 307 to sign-in. Lint emits one warning (`SW_VERSION` unused in `public/sw.js`) — the constant is deliberately kept per the plan's own doc comment about on-device inspection, and eslint exits 0 on warnings.
  - **Not verified**: the manual iOS device pass (steps 1–10 of the phase plan's Verification section) needs a physical iPhone XS Max, which this environment has none of. The phase plan names that pass as the only real proof beyond what a laptop or CI can check; it remains outstanding for a human on the device.

- [x] **P1-DW-A002** Phase 2: Subscriptions, keys and the sender
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns `src/lib/env`, `src/lib/db/queries`, `src/lib/push`, `src/app/api/push` (10 files). Adds the four optional VAPID/CRON_SECRET env vars, `lib/db/queries/push.ts`'s subscription and delivery CRUD (`upsertSubscription`, `deleteSubscription`, `listSubscriptions`, `deleteDeadSubscription`, `listReminderCandidates`, `claimDelivery`), the `GET /api/push/key` and subscribe/unsubscribe routes, and `lib/push/send.ts`, which encrypts and VAPID-signs one notification and classifies the response instead of throwing. Exit: app boots/builds/serves with all four vars unset; `GET /api/push/key` answers `{"publicKey":null}` unconfigured (and the real key configured) with `no-store` and 401 with no cookie; `POST /api/push/subscription` is idempotent on `endpoint`; typecheck/lint/build and all eleven existing check scripts pass; nothing under `src/` names `NEXT_PUBLIC_`, and both secret-bearing files carry `import 'server-only'`.
  - **Status**: completed
  - **Plan Set**: `PUSH_CARD_REMINDERS_PLAN.md` (phase 2 of 5)
  - **Satisfies**: R1
  - **Depends on**: P1-DW-A001
  - **Plan**: `.workflows/plan/P1-DW-A002.md`
  - **Completed**: 2026-09-14 11:57
  - **Method**: /do
  - **Files**: package.json, package-lock.json, src/lib/env.ts, .env.example, src/lib/push/schemas.ts, src/lib/db/queries/push.ts, src/lib/push/send.ts, src/lib/push/client.ts, src/app/api/push/key/route.ts, src/app/api/push/subscription/route.ts
  - **Drift**: TS 5.7+ narrowed `Uint8Array` to `Uint8Array<ArrayBufferLike>`, which no longer structurally satisfies the DOM lib's `BufferSource`. Added an explicit `as BufferSource` cast (with an explanatory comment) at the `applicationServerKey` call site in `src/lib/push/client.ts`. A TS/lib.dom version issue in this environment, not a behavioural change to the plan's code.
  - **Drift**: The plan's own code block for `src/lib/push/client.ts` carried a doc comment that literally named `VAPID_PRIVATE_KEY` and `CRON_SECRET` while explaining that `client.ts` names neither — and `scripts/check-push.ts`'s invariant-7 assertion scans raw source text including comments, so the plan's comment tripped its own check (3 failing assertions). Rewrote the comment to state the property without spelling out the literal variable names; `npm run push:check` now passes.
  - **Drift**: `npm run dates:check` still has its single pre-existing failure — the '/today header' assertion expects "Sunday, 9 August" while this environment's Intl/ICU produces "Sunday 9 August". Identical to the note on P1-DW-A001; `git diff --stat` confirms this phase touches none of those files.

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
