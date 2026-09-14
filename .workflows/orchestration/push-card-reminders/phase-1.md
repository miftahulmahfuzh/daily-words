# Phase 1: The ruling, the schema and the schedule

**Plan set:** `PUSH_CARD_REMINDERS_PLAN.md`
**Analysis:** `20260914-104032-K7P2_code_analyzer.md`
**Satisfies:** R2 (each reminder is different), R3 (07:00, then every two hours until 20:00)
**Depends on:** none
**Difficulty:** NORMAL
**Package:** `ROADMAP` · `src/lib/db` · `src/lib/push` · `scripts`

---

## Goal

After this phase the roadmap authorises the feature instead of forbidding it, the
database can hold a subscription and a delivery record, and the two pure modules
that decide **when** a reminder fires and **what it says** exist and are proved
offline by `npm run push:check`. No notification can be sent yet — nothing here
imports `web-push`, reads an environment variable, touches a route handler or
renders a pixel. The tree builds, every pre-existing check script still passes,
and `/today` is byte-identical.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** nothing.

**Renames:** nothing.

**Creates — database tables (`src/lib/db/schema.ts`):**

- `pushSubscriptions` → table `push_subscriptions`
  - columns: `id` uuid pk · `userId` `user_id` uuid NOT NULL FK `users.id` ON DELETE CASCADE · `endpoint` text NOT NULL · `p256dh` text NOT NULL · `auth` text NOT NULL · `userAgent` `user_agent` text NULL · `createdAt` `created_at` timestamptz NOT NULL default now() · `lastSeenAt` `last_seen_at` timestamptz NOT NULL default now()
  - indexes: `push_subscriptions_endpoint_uniq` UNIQUE (`endpoint`) · `push_subscriptions_user_idx` (`user_id`)
- `pushDeliveries` → table `push_deliveries`
  - columns: `id` uuid pk · `userId` `user_id` uuid NOT NULL FK `users.id` ON DELETE CASCADE · `localDate` `local_date` **date** NOT NULL · `slot` integer NOT NULL · `status` text NOT NULL `$type<'sent' | 'skipped' | 'failed'>()` · `reminderKey` `reminder_key` text NULL · `sentAt` `sent_at` timestamptz NOT NULL default now() · `reason` text NULL
  - indexes: `push_deliveries_user_date_slot_uniq` UNIQUE (`user_id`, `local_date`, `slot`) — **and this is also the read index; there is no second index on (user_id, local_date)**
  - constraints: `push_deliveries_status_check` · `push_deliveries_slot_check` (`slot between 0 and 23`) · `push_deliveries_reminder_key_check` (`status <> 'sent' or reminder_key is not null`)

**Creates — TypeScript types (`src/lib/db/types.ts`):**

```
PushSubscription       = typeof pushSubscriptions.$inferSelect
NewPushSubscription    = typeof pushSubscriptions.$inferInsert
PushDelivery           = typeof pushDeliveries.$inferSelect
NewPushDelivery        = typeof pushDeliveries.$inferInsert
PushDeliveryStatus     = PushDelivery['status']   // 'sent' | 'skipped' | 'failed'
```

**Creates — `src/lib/push/schedule.ts`** (imports nothing at all):

```ts
export const REMINDER_FIRST_HOUR: number                      // 7
export const REMINDER_EVERY_HOURS: number                     // 2
export const REMINDER_UNTIL_HOUR: number                      // 20 — exclusive bound
export const REMINDER_SLOTS: readonly number[]                // frozen [7,9,11,13,15,17,19]
export function deriveReminderSlots(firstHour: number, everyHours: number, untilHour: number): number[]
export function isReminderSlot(value: unknown): value is number
export type DueSlot = { readonly slot: number; readonly superseded: readonly number[] }
export function dueSlot(input: { localHour: number; delivered: Iterable<number> }): DueSlot | null
```

**Creates — `src/lib/push/reminders.ts`** (imports only `@/lib/time/local-date`):

```ts
export type Reminder = { readonly key: string; readonly title: string; readonly body: string }
export type ReminderBandName = 'morning' | 'afternoon' | 'evening'
export type ReminderBand = { readonly name: ReminderBandName; readonly slots: readonly number[]; readonly lines: readonly Reminder[] }
export const REMINDER_TITLE_MAX: number                       // 32
export const REMINDER_BODY_MAX: number                        // 90
export const REMINDER_EPOCH: LocalDate                        // '2026-01-01'
export const REMINDER_BANDS: readonly ReminderBand[]          // 3 bands, 16/16/11 lines
export const REMINDER_LINES: readonly Reminder[]              // 43, flattened
export function bandForSlot(slot: number): ReminderBand | null
export function reminderFor(date: LocalDate, slot: number): Reminder | null
export function reminderByKey(key: string): Reminder | null
```

**Creates — scripts and migration:**

- `scripts/check-push.ts` (new, offline, ~95 assertions — the count moved when reconciliation rewrote the secret grep as a property; what matters is zero `FAIL`, not the total)
- `package.json` script: `"push:check": "tsx scripts/check-push.ts"` — no `--conditions`, no `--env-file`
- `drizzle/0010_<generated>.sql` and `drizzle/meta/0010_snapshot.json`, `drizzle/meta/_journal.json` gaining `idx: 10`

**Creates — roadmap:** `[R24]`, plus an amendment paragraph under § "Explicitly out
of scope for v0.1.0" and one under `[R11]`.

**Signature changes:** none.

**Requires (from earlier phases):** none. This phase depends on nothing.

**Leaves alone (owned by others):**

- `src/lib/env.ts`, `.env.example` (Phase 2) — this phase adds **no** environment variable and reads none.
- `src/lib/db/queries/push.ts`, `src/lib/push/{send,schemas,client}.ts`, `src/app/api/push/**` (Phase 2).
- `public/sw.js`, `src/middleware.ts`, `next.config.ts`, `scripts/check-badge-art.ts`, `src/components/**`, `src/app/(app)/layout.tsx` (Phase 3).
- `src/lib/push/tick.ts`, `.github/**`, `scripts/push-send.ts`, `scripts/check-push-db.ts`, and the `push:db` / `push:send` entries in `package.json` (Phase 4).
- `CLAUDE.md`, `README.md`, `CHANGELOG.md`, `plans/F30-push-reminders.md`, the `shares.expires_at` comment at `schema.ts:550` (Phase 5). **Phase 1 does not touch that comment**, even though `[R24]` is what makes it out of date.
- `package.json` dependencies. `web-push` is Phase 2's; nothing here needs it.

## Files

| File | Action | What changes |
|---|---|---|
| `ROADMAP_v0.1.0.md` | modify | `[R24]` inserted after `[R23]` (before `:823`); amendment paragraph after the out-of-scope list (`:428`); amendment paragraph after `[R11]`'s ruling (`:569`) |
| `src/lib/db/schema.ts` | modify | append the `/* Push */` section after `shares` (`:601`, end of file) |
| `src/lib/db/types.ts` | modify | two names into the import list (`:13`), four type exports (`:35`), one derived union (`:46`) |
| `drizzle/0010_*.sql` | create | **generated**, never hand-written |
| `drizzle/meta/0010_snapshot.json`, `drizzle/meta/_journal.json` | create/modify | generated alongside it |
| `src/lib/push/schedule.ts` | create | the three constants, the derivation, `dueSlot` |
| `src/lib/push/reminders.ts` | create | the 43-line deck and `reminderFor` |
| `scripts/check-push.ts` | create | the offline assertions |
| `package.json` | modify | one script line after `"claim:db"` (`:44`) |

## Implementation Steps

Do them in this order. Step 1 is first on purpose: CLAUDE.md's authority order
makes `ROADMAP_v0.1.0.md` § Reconciliation Decisions win over every plan
including this one, so until `[R24]` exists, every later step is code written
against a document that forbids it.

### Step 1: `[R24]` — the ruling

**File:** `ROADMAP_v0.1.0.md:823`
**Change:** insert a new decision between the end of `[R23]` and the `---` that
precedes `### Still open — these need your call, not mine`. Line 821 is
`[R23]`'s `**Overrides:**` paragraph's last line; line 822 is blank; line 823 is
`---`. Insert the block below **immediately before line 823**, so the file reads
`[R23]` → `---` → `[R24]` → `---` → `### Still open`.

**Code:**

````markdown
---

### [R24] The daily card may be reminded for. The out-of-scope bullet is overruled.

Decided on a direct user request, in their own words:

> *"make sure the app send a different reminder as a push notification in my xs max
> to generate today's card. start from 7 am in the morning, then send a new one every
> 2 hours until 8 pm"*

This roadmap forbade the feature twice — once in § "Explicitly out of scope for
v0.1.0", and once inside [R11], which reached past its own subject to rule out
scheduled jobs in general on the grounds that one is "the first step toward the
notifications this roadmap forbids". Both prohibitions were written before there was
a user asking for it. There is now, and the argument for them was never that a
reminder is bad — it was that the ritual is the product and a reminder is the obvious
first thing to erode it. That argument is answered below rather than dismissed.

**Ruling:** Daily Words may send Web Push notifications, and may run a scheduled job
to send them, under four conditions, all of which are structural rather than
aspirational:

1. **The opt-in is a row.** A user is reminded because a `push_subscriptions` row
   exists, created by a tap they made on `/profile/edit`. There is no default-on, no
   re-prompt, no `profiles.reminders_enabled` column, and therefore no second place
   that can claim the user agreed when the device says otherwise. Turning it off is
   deleting the row.
2. **The daily card is the only subject.** No badge news, no chat nudge, no journal
   prompt, no announcement, no re-engagement. One notification type, one destination
   — `/today`.
3. **Nothing scheduled may create a card.** This is the principle [R11] was reaching
   for, and it survives intact. `POST /api/cards` is still the only path that writes
   a `daily_cards` row and it is still finger-triggered. The scheduler sends a
   *message*; it does not press the button. A user who ignores all seven reminders
   has no card that day, and that is the correct outcome, not a bug to be fixed by
   generating one for them.
4. **Nothing may threaten a streak.** The copy carries no countdown, no "at risk", no
   "don't break it" — the same rule `/profile` already keeps, now applied in the one
   place where it would be easiest to break and hardest to take back, because a
   notification speaks to someone who did not open the app.

Four things this does **not** change:

- **[R11]'s actual ruling stands, unchanged.** `user_stats` is still a cache, still
  never displayed, and `/profile` still recomputes from `daily_cards` on read. No
  scheduled job writes to that row. What is superseded is the second half of one
  sentence — the generalisation from "this recomputation needs no cron" to "no cron,
  ever" — and nothing else in that decision.
- **The ritual, and the screen it lives on.** `/today` gains no pixel and no control;
  [R19]'s vertical budget and the eighteen no-scroll assertions are untouched.
  `NoCardYet` keeps its line — *"Nothing is generated until you press it"* — and that
  line stays literally true. A reminder is an argument for pressing the button, which
  is the only thing this roadmap ever insisted the button be.
- **"Offline mode / service-worker caching" stays out of scope.** A service worker now
  exists, because iOS grants Web Push nowhere else, and it handles exactly two events
  — `push` and `notificationclick`. It caches nothing and registers no `fetch`
  handler, so the caching that bullet refused is still refused.
- **"Any paid dependency" stays out of scope.** Web Push is a browser-vendor service
  with no account, no key exchange and no bill; `web-push` is MIT.

**Overrides:** the "Push notifications or reminders of any kind" bullet in
§ "Explicitly out of scope for v0.1.0", and the "No cron job" sentence in [R11]. Both
are amended in place below their originals rather than rewritten, because what they
said is the record of what had to be argued to move them. Every `plans/F*.md` line
asserting that this app has no scheduler is historical and is corrected by
`plans/F30-push-reminders.md` rather than by editing eleven files.
````

**Impact:** the roadmap now permits the four phases that follow. Nothing in the
code changes.

### Step 2: amend the out-of-scope list in place

**File:** `ROADMAP_v0.1.0.md:428`
**Change:** the eight bullets at `:421`–`:428` are **left exactly as they are**.
Insert the paragraph below after the last bullet (`- Any paid dependency`, line
428) and before the `---` at line 430 — i.e. a blank line, then this.

**Code:**

````markdown
**Amended by [R24].** Two of these bullets have moved, and both are kept above rather
than rewritten, because what they refused is the record of what had to be argued to
move them.

- **"Push notifications or reminders of any kind"** now admits exactly one reminder:
  an opt-in nudge to make today's card, on the schedule [R24] fixes. Everything else
  this bullet forbade, it still forbids — no badge news, no chat nudges, no journal
  prompts, no announcements, and nothing at all for a user who has not tapped the
  switch.
- **"Offline mode / service-worker caching beyond the bare PWA manifest"** still holds
  in full. There is now a service worker, because iOS grants Web Push nowhere else,
  and it handles two events: `push` and `notificationclick`. It caches nothing and
  registers no `fetch` handler.

The other six bullets are untouched by [R24].
````

**Impact:** documentation only.

### Step 3: amend `[R11]` in place

**File:** `ROADMAP_v0.1.0.md:569`
**Change:** the `**Ruling:**` paragraph at `:567`–`:569` is **left exactly as it
is**. Insert the paragraph below after it, before the `---` at line 571. This is
the house idiom already used at `:737` (`**Amended by [R23].**` under `[R21]`).

**Code:**

````markdown
**Amended by [R24].** Everything above about `user_stats` stands exactly as written:
it is still a cache, `/profile` still recomputes from `daily_cards` on read, and no
scheduled job writes to that row or to any other cache. What [R24] supersedes is the
generalisation — this app now runs an hourly job, and it does send notifications. The
clause that was load-bearing and survives is the one about *cards*: nothing scheduled
creates a `daily_cards` row, and `POST /api/cards` is still the only path that does.
````

**Impact:** documentation only.

### Step 4: the two tables

**File:** `src/lib/db/schema.ts:601` — the end of the file, immediately after the
closing `)` of the `shares` table.
**Change:** append the block below verbatim. It needs no new imports: `pgTable`,
`uuid`, `text`, `integer`, `index`, `uniqueIndex`, `check`, `sql`, `tsz` and
`localDate` are all already in scope at the top of the file.

**Code:**

```ts
/* ----------------------------------- Push ----------------------------------- */

/**
 * F30. One row per device that has agreed to be reminded.
 *
 * **The row is the opt-in.** There is no `profiles.reminders_enabled`, and the
 * argument is [S3]'s, from `shares`: a second column claiming to hold the same
 * fact is a second source of truth, and the two disagree the first time iOS
 * revokes an endpoint or a user clears their site data. Turning reminders on is
 * creating a row; turning them off is deleting it; a phone that has forgotten
 * its subscription *is* a phone that is not subscribed, and nothing has to be
 * reconciled for that to be true. It also means the tick's candidate list is a
 * join away rather than a filter over every profile in the table.
 *
 * `endpoint` is unique **globally, not per user**, and that is the browser's
 * rule rather than ours: a push endpoint is issued by Apple or Google to one
 * installed web app on one device, and it is the address the message is sent
 * to. Two users cannot hold the same one, so a per-user unique index would
 * permit a row that cannot exist — and in the one case where it looks like it
 * could (a shared phone, a second Google account), the right outcome is that the
 * new sign-in takes the endpoint over, which is exactly what an upsert on a
 * global unique key does. A per-user index would instead leave the old user's
 * row in place and deliver their reminders to somebody else's lock screen.
 *
 * `p256dh` and `auth` are the subscription's own encryption keys, base64url as
 * the browser produced them. They are not secrets of ours and carry nothing
 * about the user; `web-push` hands them back to the RFC 8291 encryption.
 *
 * `user_agent` answers "which device is this?" on a profile that has three. It
 * is nullable because the browser may not send one and because nothing depends
 * on it.
 *
 * `last_seen_at` is written by the reconciler on every app open, so a dead
 * subscription is visible as a stale date rather than only as a 410 on the next
 * send. Defaulted to now() rather than left null: a row that has never been
 * seen since it was created has been seen, at creation.
 */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: tsz('created_at').notNull().defaultNow(),
    lastSeenAt: tsz('last_seen_at').notNull().defaultNow(),
  },
  (t) => [
    /** What makes subscribe idempotent, and what the 410 sweep deletes by. */
    uniqueIndex('push_subscriptions_endpoint_uniq').on(t.endpoint),
    /**
     * `listSubscriptions(userId)`, and the cascade from `users.id` — Postgres
     * does not index the referencing side of a foreign key, so without this a
     * deleted user is a sequential scan. The same reasoning as
     * `shares_user_created_idx`.
     */
    index('push_subscriptions_user_idx').on(t.userId),
  ],
)

/**
 * F30. One row per slot the tick has decided about, per user, per local day.
 *
 * **This table is the idempotence, and the unique index is the enforcement.**
 * Not application code: the tick may run twice in the same minute — a retried
 * GitHub Actions job, a manual curl, two schedulers — and the guarantee that the
 * user's phone lights up once is a `23505` on insert, exactly as the chat's one
 * opener per round is a partial unique index rather than a `if (exists)`. A
 * check written in TypeScript is a check with a race in it.
 *
 * `local_date` is a `date` and never a timestamp, because the day this row
 * belongs to is the *user's* day. A `timestamptz` here would put a Jakarta
 * evening and the following UTC morning on two different days, and the
 * idempotence key would silently permit a second 19:00 notification. This is
 * `localDate()` for the same reason `daily_cards.card_date` is.
 *
 * `slot` is the local hour, 0–23, and the CHECK bounds it structurally rather
 * than to the seven hours `REMINDER_SLOTS` currently derives. Pinning the seven
 * would mean a migration every time the user changes their mind about the
 * schedule, and would make rows written under the old schedule unreadable
 * against the new constraint — the bound that is true forever is the clock.
 *
 * `status`: `'sent'` is one notification actually accepted by the push service;
 * `'failed'` is one it refused for a reason that is not "this endpoint is gone"
 * (a gone endpoint deletes its subscription row instead); `'skipped'` is a slot
 * the catch-up rule passed over, written so that a missed slot is *closed*
 * rather than left looking outstanding for the rest of the day. All three are
 * rows: an absent row means the tick never reached that slot, which is a fourth
 * state and a real one.
 *
 * `reminder_key` is which line of the deck went out — the audit trail behind
 * "each reminder is different", and what lets `reminderByKey` turn a row back
 * into the sentence the user read. Null on a `'skipped'` row, because nothing
 * was chosen, and the CHECK says so rather than leaving it to habit.
 *
 * There is no expiry and no pruning. At seven rows a day this is ~2,500 rows a
 * year per user, and the history is the only record of what was said and when.
 */
export const pushDeliveries = pgTable(
  'push_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    localDate: localDate('local_date').notNull(),
    slot: integer('slot').notNull(),
    status: text('status').$type<'sent' | 'skipped' | 'failed'>().notNull(),
    reminderKey: text('reminder_key'),
    /** When the tick decided. On a 'skipped' row nothing was sent at it. */
    sentAt: tsz('sent_at').notNull().defaultNow(),
    /**
     * Why this row is not a plain send: `'superseded'` or `'no_active_words'`
     * on a `'skipped'` row, and the transport detail on a `'failed'` one. Null
     * on a `'sent'` row. Never rendered — it is read by `npm run push:db` and
     * by a human with psql, and by nothing else.
     *
     * Named `reason` rather than `error` because two of its three writers are
     * not errors. Phase 4 writes every value it ever holds.
     */
    reason: text('reason'),
  },
  (t) => [
    /**
     * The idempotence key, and **also the index the tick reads by**: its one
     * question per user is "what has this user already had today?", which is a
     * prefix scan on (user_id, local_date). A second index on those two columns
     * would be a duplicate of this one's left-hand side and is deliberately not
     * created. It serves the cascade from `users.id` for the same reason.
     */
    uniqueIndex('push_deliveries_user_date_slot_uniq').on(t.userId, t.localDate, t.slot),
    /**
     * `$type<>()` is the compile-time claim; these are the runtime ones. A
     * fourth status arriving from a psql session would be a silent hole in the
     * tick's branching rather than an error.
     */
    check(
      'push_deliveries_status_check',
      sql`${t.status} in ('sent', 'skipped', 'failed')`,
    ),
    check('push_deliveries_slot_check', sql`${t.slot} between 0 and 23`),
    check(
      'push_deliveries_reminder_key_check',
      sql`${t.status} <> 'sent' or ${t.reminderKey} is not null`,
    ),
  ],
)
```

**Impact:** `npm run typecheck` stays green (nothing references these yet).
`npm run db:generate` now has two tables to emit.

### Step 5: the inferred types

**File:** `src/lib/db/types.ts:13`, `:35`, `:46`
**Change:** three edits, each in the file's existing order.

**5a — the import list.** After `shares,` (line 13), before the closing `}`:

```ts
  pushSubscriptions,
  pushDeliveries,
```

so the import block reads:

```ts
import type {
  users,
  profiles,
  vocabEntries,
  dailyCards,
  dailyCardItems,
  chatSessions,
  chatMessages,
  journalEntries,
  journalEntryEmbeddings,
  userStats,
  badgesAwarded,
  shares,
  pushSubscriptions,
  pushDeliveries,
} from '@/lib/db/schema'
```

**5b — the row types.** After `export type NewShare = typeof shares.$inferInsert`
(line 34), append:

```ts
export type PushSubscription = typeof pushSubscriptions.$inferSelect
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert
export type PushDelivery = typeof pushDeliveries.$inferSelect
export type NewPushDelivery = typeof pushDeliveries.$inferInsert
```

**5c — the derived union.** After `export type ShareEntityType = …` (line 46),
append:

```ts
// 'skipped' is the catch-up rule's: a slot the tick passed over because a later
// one was already due. It is a decision that was made, so it is a row — an
// absent row means the tick never reached that slot at all, which is a fourth
// state and a real one. See `dueSlot` in lib/push/schedule.ts.
export type PushDeliveryStatus = PushDelivery['status'] // 'sent'|'skipped'|'failed'
```

**Impact:** Phase 2's `lib/db/queries/push.ts` and Phase 4's `lib/push/tick.ts`
have their row types. Nothing else changes.

### Step 6: generate the migration — do not write it

**File:** `drizzle/0010_*.sql`, `drizzle/meta/0010_snapshot.json`, `drizzle/meta/_journal.json`
**Change:** run

```bash
npm run db:generate
```

This is plain additive DDL — two `CREATE TABLE`s, two foreign keys, three
indexes, three CHECK constraints — so the generator is correct here and
`--custom` is wrong. `0004` was `--custom` because `CREATE EXTENSION` is
invisible to drizzle's differ, and `0009` because a badge-key rename emits no DDL
at all. Neither applies: everything in this step is a difference the differ can
see.

**Generate all three files. Do not hand-write or hand-edit any of them — the
`.sql`, `drizzle/meta/0010_snapshot.json` and `drizzle/meta/_journal.json`
alike.** The SQL below is reproduced so you can *diff*, never so you can paste;
and the snapshot in particular is a trap, because it is the only record
drizzle-kit compares the next schema against. A snapshot whose column says
`error` while `schema.ts` says `reason` — the shape this plan had before
reconciliation renamed the column — makes the next `npm run db:generate` emit a
spurious `0011` renaming a column that was never called that in any database.
The only safe procedure is: paste Step 4's schema block, run `db:generate`, diff
the output against the SQL below, and if they differ fix **the schema block**,
never the generated files.

**The filename is random** (`0010_glamorous_retro_girl.sql`,
`0010_cute_archangel.sql` — both were produced while verifying this plan). Take
whatever it gives you. What must be true is the SQL, which was generated from
exactly the schema block in Step 4 and is reproduced here so the executor can
diff rather than trust:

```sql
CREATE TABLE "push_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"slot" integer NOT NULL,
	"status" text NOT NULL,
	"reminder_key" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text,
	CONSTRAINT "push_deliveries_status_check" CHECK ("push_deliveries"."status" in ('sent', 'skipped', 'failed')),
	CONSTRAINT "push_deliveries_slot_check" CHECK ("push_deliveries"."slot" between 0 and 23),
	CONSTRAINT "push_deliveries_reminder_key_check" CHECK ("push_deliveries"."status" <> 'sent' or "push_deliveries"."reminder_key" is not null)
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "push_deliveries_user_date_slot_uniq" ON "push_deliveries" USING btree ("user_id","local_date","slot");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_uniq" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");
```

`drizzle/meta/_journal.json` gains one entry, `"idx": 10`, `"version": "7"`,
`"breakpoints": true`, with whatever `when` and `tag` the run produces. The
last existing entry is `idx: 9`, `0009_rename_dumbledore_badge_key`.

Then apply it:

```bash
npm run db:migrate
```

**Impact:** two new tables in Neon. Nothing reads or writes them until Phase 2.

**If the generated SQL differs from the block above**, the schema block was not
pasted verbatim — diff it before proceeding. Two specific differences to look
for: a second `CREATE INDEX` on `push_deliveries` means someone added the
redundant `(user_id, local_date)` index the comment in Step 4 argues against; and
an `"error" text` column instead of `"reason" text` means Step 4's block was
taken from a pre-reconciliation draft. Fix the schema block and regenerate.

### Step 7: `src/lib/push/schedule.ts`

**File:** `src/lib/push/schedule.ts` (new file; `src/lib/push/` is a new directory)
**Change:** create it with exactly this content. It imports nothing — not
`server-only`, not zod, not `node:crypto`, not even `lib/time/local-date` — and
`push:check` asserts that.

**Code:**

```ts
/**
 * When a reminder is due, and the one rule that turns a tick into at most one
 * notification.
 *
 * **Pure, and it imports nothing at all.** That is the same property
 * `lib/share/policy.ts` keeps, for the same reason: three very different
 * processes read this module — the tick (a Node route handler), the scheduler's
 * own reasoning, and `npm run push:check` (a bare tsx process with no
 * environment and no network) — and a single import of `server-only`, zod or
 * `node:crypto` would break at least one of them. What is asserted offline is
 * then literally the code that runs on the request.
 *
 * **There is no clock here.** `localHour` arrives as an argument, computed by
 * `lib/time/local-date.ts` in the *user's* zone, because that module is the only
 * place in this app allowed to construct an `Intl.DateTimeFormat`. A
 * `new Date()` in this file would compute 07:00 in Vercel's UTC, which is 14:00
 * in Jakarta — the exact failure the day-boundary contract exists to prevent,
 * and one that nothing would throw on.
 */

/**
 * The user's sentence, in three numbers:
 *
 *   > "start from 7 am in the morning, then send a new one every 2 hours until 8 pm"
 *
 * Written as constants rather than as a hand-typed `[7, 9, 11, …]` so that the
 * sentence is what the code says, and so that changing one number changes the
 * schedule rather than requiring someone to re-derive an array by hand.
 */
export const REMINDER_FIRST_HOUR = 7;
export const REMINDER_EVERY_HOURS = 2;

/**
 * **A bound on the window, not a slot.** "Until 8 pm" closes the day at 20:00;
 * the last two-hour step that lands inside it is 19:00.
 *
 * The bound is exclusive by choice — and with these three numbers the choice is
 * not observable, because no step from 07:00 lands on 20:00 at all. `<` and
 * `<=` would produce the same seven slots here, which is precisely why
 * `push:check` asserts `deriveReminderSlots` against *other* triples as well.
 * A derivation that is only ever tested on the one input it was written for is
 * not tested.
 */
export const REMINDER_UNTIL_HOUR = 20;

/**
 * The slots for an arbitrary triple, exported so the derivation can be asserted
 * independently of the three numbers above.
 *
 * Defensive rather than clever: a non-positive step would loop forever, and an
 * hour outside 0–23 is not an hour. Both answer with an empty schedule, which
 * is "send nothing" — the only safe failure for a feature whose output lands on
 * a stranger's lock screen.
 */
export function deriveReminderSlots(
  firstHour: number,
  everyHours: number,
  untilHour: number,
): number[] {
  if (!Number.isInteger(firstHour) || firstHour < 0 || firstHour > 23) return [];
  if (!Number.isInteger(everyHours) || everyHours < 1) return [];
  if (!Number.isInteger(untilHour)) return [];
  const slots: number[] = [];
  for (let h = firstHour; h < untilHour && h <= 23; h += everyHours) slots.push(h);
  return slots;
}

/** `[7, 9, 11, 13, 15, 17, 19]` — seven of them, derived, never typed out. */
export const REMINDER_SLOTS: readonly number[] = Object.freeze(
  deriveReminderSlots(REMINDER_FIRST_HOUR, REMINDER_EVERY_HOURS, REMINDER_UNTIL_HOUR),
);

/** Exactly a member of `REMINDER_SLOTS`, and nothing else shaped like one. */
export function isReminderSlot(value: unknown): value is number {
  return typeof value === "number" && REMINDER_SLOTS.includes(value);
}

/**
 * One slot to send, and the slots that sending it passes over.
 *
 * `superseded` is never empty by accident: it is what `push_deliveries` records
 * as `'skipped'`, so that a slot that was missed is *closed* rather than left
 * looking outstanding for the rest of the day.
 */
export type DueSlot = {
  readonly slot: number;
  readonly superseded: readonly number[];
};

/**
 * The catch-up rule: **the greatest slot the user's local clock has reached that
 * has not been delivered**, plus every earlier undelivered slot, which is
 * thereby passed over.
 *
 * This is the decision that makes the choice of scheduler not load-bearing. A
 * tick that runs late, or a tick that never ran at all between 09:00 and 15:00,
 * delivers the 15:00 line once — not a burst of four notifications at 15:01,
 * which is how a naive "send every slot you owe" resolver behaves after any
 * outage and is the single most likely way this feature becomes something the
 * user turns off. A scheduler that fires twice in the same hour is likewise
 * harmless, because the second call finds the slot already delivered and
 * answers null.
 *
 * Returns `null` when nothing is due: before the first slot of the day, and
 * after every reached slot has a delivery row. `delivered` may contain
 * duplicates, values that are not slots at all, and slots from a different day —
 * all of them are simply not in the reached set, or already handled by the Set.
 *
 * A `localHour` that is NaN, negative, fractional or out of range answers null,
 * because no slot compares less than or equal to it. That is deliberate: the
 * failure mode of a bad hour is silence, never a 03:00 notification.
 */
export function dueSlot({
  localHour,
  delivered,
}: {
  localHour: number;
  delivered: Iterable<number>;
}): DueSlot | null {
  const done = new Set(delivered);
  const outstanding = REMINDER_SLOTS.filter((s) => s <= localHour && !done.has(s));
  if (outstanding.length === 0) return null;
  return {
    slot: outstanding[outstanding.length - 1],
    superseded: outstanding.slice(0, -1),
  };
}
```

**Impact:** Phase 4's tick has its resolver. Nothing imports this yet.

### Step 8: `src/lib/push/reminders.ts`

**File:** `src/lib/push/reminders.ts` (new file)
**Change:** create it with exactly this content. Every line of copy is written
out; the apostrophes are **typographic** (`’`, U+2019), which is what the rest of
the app draws and what `push:check` asserts.

**Code:**

```ts
import { diffLocalDays, type LocalDate } from "@/lib/time/local-date";

/**
 * The reminder copy: forty-three written lines, and the arithmetic that picks
 * one.
 *
 * **A deck, not a model call.** The obvious alternative — ask GLM for a fresh
 * sentence each time — was rejected on three counts, and the third is the one
 * that settles it. It would put an unattended, billable, failure-prone network
 * call on the one path in this app whose entire job is to be quiet and
 * reliable, at seven calls a day forever. It would mean a model reading a
 * user's profile to write a lock-screen string, which is a wider disclosure
 * surface than anything else in the app for the smallest possible payoff. And a
 * deck is *assertable offline* — `npm run push:check` reads every line and
 * proves the properties below — where a model's output can only be sampled.
 *
 * **Partitioned by time of day**, because a line that reads well at 07:00 reads
 * wrong at 19:00: "while the kettle boils" is a joke after dinner, and "the day
 * is closing" is a lie at breakfast. Three bands, one sub-deck each, and the
 * pick never crosses a band.
 *
 * The register is `/profile`'s and `NoCardYet`'s, and the rules are binding:
 * British English, sentence case, no exclamation marks, no emoji, no flattery,
 * and **no streak-threat language of any kind**. `/profile` already refuses to
 * say "your streak is at risk"; a notification is a far worse place to say it.
 * Every line must also be true on a user's very first day and on their four
 * hundredth, so none of them counts anything, congratulates anything, or
 * implies a history — the machine does not know how the day has gone.
 */

/** One written reminder. `key` is what `push_deliveries.reminder_key` records. */
export type Reminder = {
  /** Stable, `[a-z0-9_]`, and the audit trail: which line went out, that slot. */
  readonly key: string;
  readonly title: string;
  readonly body: string;
};

export type ReminderBandName = "morning" | "afternoon" | "evening";

export type ReminderBand = {
  readonly name: ReminderBandName;
  /** A contiguous part of `REMINDER_SLOTS`. The three bands partition it. */
  readonly slots: readonly number[];
  readonly lines: readonly Reminder[];
};

/**
 * iOS truncates a notification title at roughly this width on an XS Max, and a
 * body at roughly the second. These are not validation — nothing accepts input
 * here — they are the ceiling `push:check` holds every written line under, so a
 * line added in a hurry cannot arrive on the phone with its point cut off.
 */
export const REMINDER_TITLE_MAX = 32;
export const REMINDER_BODY_MAX = 90;

/**
 * The day counter's origin. Arbitrary, fixed, and load-bearing only in that it
 * must never move: shifting it rotates every future day's picks, which is
 * invisible and harmless but would make a delivery row's `reminder_key`
 * disagree with what this module would pick for the same date today.
 */
export const REMINDER_EPOCH: LocalDate = "2026-01-01";

const MORNING: readonly Reminder[] = [
  { key: "morning_unmade", title: "Today’s card is unmade", body: "Six words are waiting to be written out." },
  { key: "morning_kettle", title: "While the kettle boils", body: "Six words, one press, and today has a card." },
  { key: "morning_first_light", title: "First light", body: "Nothing was generated overnight. It never is." },
  { key: "morning_asked_for", title: "Cards are asked for", body: "Today’s has not been asked for yet." },
  { key: "morning_short_read", title: "A short read", body: "Six words from your own collection, whenever you want them." },
  { key: "morning_quiet", title: "The quiet part of the day", body: "Today’s card is still sitting there unmade." },
  { key: "morning_collection", title: "Your collection is awake", body: "Six of its words are set aside for today." },
  { key: "morning_no_schedule", title: "Nothing runs on its own", body: "Today’s card exists only once you press for it." },
  { key: "morning_toast", title: "Somewhere near the toast", body: "A card for today is one press away." },
  { key: "morning_unopened", title: "Today is unopened", body: "The card for it has not been made." },
  { key: "morning_two_minutes", title: "Two minutes", body: "That is roughly what six words cost you." },
  { key: "morning_kept_words", title: "Words you chose to keep", body: "Six of them are on the list for today." },
  { key: "morning_before_the_noise", title: "Before the noise starts", body: "Today’s card takes one press and a short read." },
  { key: "morning_still_waiting", title: "Still waiting", body: "Today’s six words have not been drawn yet." },
  { key: "morning_on_the_shelf", title: "On the shelf", body: "Your words are where you left them. Today’s card is not made." },
  { key: "morning_early_enough", title: "Early enough", body: "Today’s card is unmade, and there is plenty of day left." },
];

const AFTERNOON: readonly Reminder[] = [
  { key: "afternoon_half_gone", title: "Half the day is gone", body: "Today’s card has not been made yet." },
  { key: "afternoon_after_lunch", title: "After lunch", body: "Six words are still waiting on today’s card." },
  { key: "afternoon_one_press", title: "One press, six words", body: "Today’s card is waiting for exactly that." },
  { key: "afternoon_between_things", title: "Between two things", body: "Six words fit in the gap. Today’s card is not made." },
  { key: "afternoon_desk", title: "A pause at the desk", body: "Today’s card is a short read, and it is not made yet." },
  { key: "afternoon_queue", title: "In a queue somewhere", body: "Today’s six words are still undrawn." },
  { key: "afternoon_light", title: "Afternoon light", body: "Your collection has six words set aside for today." },
  { key: "afternoon_no_hurry", title: "No hurry", body: "Today’s card will wait, because nothing makes it but you." },
  { key: "afternoon_on_the_way", title: "On the way somewhere", body: "Six words, one press, and today has its card." },
  { key: "afternoon_unread", title: "Unread so far", body: "Today’s card was not generated. It never is, on its own." },
  { key: "afternoon_second_kettle", title: "The second kettle", body: "Six words are waiting on the other side of one press." },
  { key: "afternoon_unclaimed", title: "Six words, unclaimed", body: "Today’s card has not been drawn from your collection." },
  { key: "afternoon_blank_space", title: "Somewhere in the middle", body: "The card for today is still a blank space." },
  { key: "afternoon_five_minutes", title: "Five minutes would do it", body: "Today’s card is six words and a short read." },
  { key: "afternoon_shelf_unchanged", title: "Your shelf is unchanged", body: "Nothing has been added to today. The card is unmade." },
  { key: "afternoon_later_is_fine", title: "Later is fine too", body: "Today’s card keeps. It simply has not been made." },
];

const EVENING: readonly Reminder[] = [
  { key: "evening_day_closing", title: "The day is closing", body: "Today’s card has not been made." },
  { key: "evening_last_light", title: "Last light", body: "The day’s six words are still in the collection." },
  { key: "evening_after_dinner", title: "After dinner", body: "A short read: six words from your own collection." },
  { key: "evening_quiet_again", title: "Quiet again", body: "Today’s card is unmade, and it takes one press." },
  { key: "evening_put_away", title: "Before the day is put away", body: "Six words have not been drawn for today." },
  { key: "evening_nothing_generated", title: "Nothing was generated today", body: "It never is. Today’s card waits for a press." },
  { key: "evening_lamp", title: "Under the lamp", body: "Six words would fit the evening. Today’s card is not made." },
  { key: "evening_no_pressure", title: "No pressure in it", body: "Today’s card is unmade. That is all this is saying." },
  { key: "evening_long_enough", title: "The evening is long enough", body: "Six words from your collection are waiting to be drawn." },
  { key: "evening_end_of_day", title: "End of the day", body: "Today’s card has not been asked for." },
  { key: "evening_one_more", title: "One more quiet thing", body: "Today’s card is unmade. Six words, a short read." },
];

/**
 * **The sub-deck sizes are coprime with their band's slot count, and that is the
 * whole design.**
 *
 * The index is `dayIndex * slots.length + slotIndexWithinBand`, taken modulo
 * `lines.length`. Read across a single day that is three consecutive residues,
 * so the band's three lines are always distinct. Read across days it advances
 * by three, and `gcd(3, 16) = 1` is exactly the condition for a step of three
 * to walk every residue modulo sixteen — so all sixteen morning lines are used,
 * and the morning triple does not repeat for sixteen days. Pick a sub-deck of
 * twelve instead and `gcd(3, 12) = 3`: twelve of the lines become four, the
 * other twelve are never sent, and nothing anywhere fails.
 *
 * **This file deliberately does not import `schedule.ts`.** The three slot
 * arrays below are written out, and `push:check` asserts that concatenating
 * them gives `REMINDER_SLOTS` exactly, in order. That is a stronger link than
 * an import would be: change `REMINDER_EVERY_HOURS` to 3 and the slots become
 * `[7, 10, 13, 16, 19]`, which an import would silently accept and the
 * assertion catches on the spot.
 *
 * The evening band has one slot, so any size cycles; eleven is chosen because
 * `lcm(16, 16, 11) = 176`, which makes a *whole day's* seven lines repeat only
 * twice a year. `push:check` asserts the coprimality as a property of each
 * band, not the three numbers, so a new line added to a sub-deck fails loudly
 * if it lands on a size that collapses the cycle.
 */
export const REMINDER_BANDS: readonly ReminderBand[] = Object.freeze([
  { name: "morning", slots: Object.freeze([7, 9, 11]), lines: MORNING },
  { name: "afternoon", slots: Object.freeze([13, 15, 17]), lines: AFTERNOON },
  { name: "evening", slots: Object.freeze([19]), lines: EVENING },
]);

/** Every line, flattened. The audit list `push:check` and `push:db` read. */
export const REMINDER_LINES: readonly Reminder[] = Object.freeze(
  REMINDER_BANDS.flatMap((band) => [...band.lines]),
);

/** Null for an hour that is not a slot. The three bands partition `REMINDER_SLOTS`. */
export function bandForSlot(slot: number): ReminderBand | null {
  return REMINDER_BANDS.find((band) => band.slots.includes(slot)) ?? null;
}

/**
 * The line for one `(local date, slot)`. **A pure function of its two
 * arguments** — no clock, no user, no randomness, no state — which is what
 * makes a delivery row replayable and what lets `push:check` prove that no two
 * of a day's seven reminders read alike, for four hundred consecutive days,
 * offline.
 *
 * `dayIndex` may be negative for a date before the epoch, so the modulo is the
 * two-step form. A plain `%` returns a negative remainder in JavaScript and
 * would index off the front of the array — `undefined`, a `TypeError` in the
 * tick, and a silence nobody would connect to a date.
 *
 * Returns null for a slot no band owns. That branch cannot fire in the tick,
 * because the slot it passes comes from `dueSlot` and therefore from
 * `REMINDER_SLOTS`, and `push:check` asserts totality over exactly that set —
 * but a null is a better answer than a throw on a path whose only job is to
 * stay quiet.
 */
export function reminderFor(date: LocalDate, slot: number): Reminder | null {
  const band = bandForSlot(slot);
  if (!band) return null;
  const dayIndex = diffLocalDays(REMINDER_EPOCH, date);
  const raw = dayIndex * band.slots.length + band.slots.indexOf(slot);
  const n = band.lines.length;
  return band.lines[((raw % n) + n) % n];
}

/** A delivery row's `reminder_key`, read back as the line it named. */
export function reminderByKey(key: string): Reminder | null {
  return REMINDER_LINES.find((line) => line.key === key) ?? null;
}
```

**Impact:** Phase 4 has the deck. Nothing imports this yet.

### Step 9: `scripts/check-push.ts`

**File:** `scripts/check-push.ts` (new file)
**Change:** create it with exactly this content. Every assertion is offline: no
database, no network, no environment. Verified passing and lint-clean against the
two modules above.

**Code:**

```ts
/**
 * Executable assertions for every pure decision phase 1 of F30 makes.
 *
 * Run with:  npm run push:check
 *
 * There is no test runner in this project, so these are plain assertions in a
 * file that exits non-zero — the same shape as `check-share.ts` and
 * `check-journal.ts`. Nothing here touches the database, the network or the
 * environment, and that is not a convenience: the two modules it reads are the
 * ones that decide *when* a stranger's phone lights up and *what* it says, and
 * both were written import-free precisely so this could be proved rather than
 * sampled.
 *
 * Four of the sections below are worth more than the rest:
 *
 *   1. **The derivation.** `[7, 9, 11, 13, 15, 17, 19]` is asserted, but so is
 *      `deriveReminderSlots` against triples that are *not* the shipped three —
 *      because with the shipped three an exclusive and an inclusive bound agree,
 *      and a derivation tested only on the input it was written for is untested.
 *   2. **The catch-up matrix.** All 24 local hours against all 128 subsets of
 *      the seven slots, asserted as properties rather than as a table of
 *      expected answers: at most one send per tick, never a slot the clock has
 *      not reached, never one already delivered, and `{slot} ∪ superseded`
 *      exactly equal to what is outstanding. This is what stops an outage from
 *      becoming a burst of four notifications at 15:01.
 *   3. **The deck's cycle.** Coprimality per band, seven distinct lines on each
 *      of four hundred consecutive days, every line used, and a whole-day repeat
 *      period of 176 days.
 *   4. **The secret grep, written as a property.** Every file under `src/` that
 *      names `VAPID_PRIVATE_KEY` or `CRON_SECRET` begins with
 *      `import 'server-only'` — so neither literal can reach a client bundle.
 *      Not a list of sanctioned filenames: `lib/push/send.ts` and the tick route
 *      both name one legitimately, and a list would need editing by every phase
 *      that adds a reader.
 *
 * The database half — the unique index, the cascade, the 410 sweep — is
 * `npm run push:db`. Whether the copy is worth reading is a human's judgement
 * against the register in `reminders.ts`'s own doc comment.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import {
  deriveReminderSlots,
  dueSlot,
  isReminderSlot,
  REMINDER_EVERY_HOURS,
  REMINDER_FIRST_HOUR,
  REMINDER_SLOTS,
  REMINDER_UNTIL_HOUR,
} from '../src/lib/push/schedule'
import {
  bandForSlot,
  reminderByKey,
  reminderFor,
  REMINDER_BANDS,
  REMINDER_BODY_MAX,
  REMINDER_EPOCH,
  REMINDER_LINES,
  REMINDER_TITLE_MAX,
} from '../src/lib/push/reminders'
import { addLocalDays, isLocalDate } from '../src/lib/time/local-date'

let failures = 0

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    console.log(`  ok   ${label}`)
  } else {
    failures++
    console.error(`  FAIL ${label}\n         expected ${e}\n         actual   ${a}`)
  }
}

function section(title: string) {
  console.log(`\n${title}`)
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

/* ------------------------- The user's three numbers ------------------------- */

section('the schedule is derived from the sentence, not typed out')

check('first hour', REMINDER_FIRST_HOUR, 7)
check('step', REMINDER_EVERY_HOURS, 2)
check('window bound', REMINDER_UNTIL_HOUR, 20)
check('seven slots', [...REMINDER_SLOTS], [7, 9, 11, 13, 15, 17, 19])
check('and 20:00 is a bound, not a slot', REMINDER_SLOTS.includes(20), false)
check('nor is 21:00', REMINDER_SLOTS.includes(21), false)
check('the array is frozen', Object.isFrozen(REMINDER_SLOTS), true)

/**
 * With the shipped triple an exclusive bound and an inclusive one agree — no
 * two-hour step from 07:00 lands on 20:00 at all — so asserting only
 * `deriveReminderSlots(7, 2, 20)` proves nothing about the `<`. These triples
 * separate them, and cover the two degenerate inputs that would otherwise loop
 * forever or run off the clock.
 */
check('an exclusive bound really is exclusive', deriveReminderSlots(8, 2, 20), [8, 10, 12, 14, 16, 18])
check('a step that lands on the bound stops short', deriveReminderSlots(0, 4, 20), [0, 4, 8, 12, 16])
check('hourly', deriveReminderSlots(7, 1, 11), [7, 8, 9, 10])
check('a single slot', deriveReminderSlots(7, 2, 8), [7])
check('an empty window', deriveReminderSlots(20, 2, 20), [])
check('a zero step does not hang', deriveReminderSlots(7, 0, 20), [])
check('a negative step does not hang', deriveReminderSlots(7, -2, 20), [])
check('a fractional step is refused', deriveReminderSlots(7, 1.5, 20), [])
check('an hour past the clock is refused', deriveReminderSlots(24, 2, 30), [])
check('and the derivation never runs past 23:00', deriveReminderSlots(20, 2, 99), [20, 22])

section('isReminderSlot narrows to a member and nothing shaped like one')

check('7 is a slot', isReminderSlot(7), true)
check('19 is a slot', isReminderSlot(19), true)
check('8 is not', isReminderSlot(8), false)
check('20 is not', isReminderSlot(20), false)
check('"7" is not', isReminderSlot('7'), false)
check('7.0 is, because it is 7', isReminderSlot(7.0), true)
check('7.5 is not', isReminderSlot(7.5), false)
check('NaN is not', isReminderSlot(NaN), false)
check('null is not', isReminderSlot(null), false)

/* ------------------------------ The catch-up rule ---------------------------- */

section('dueSlot — the greatest reached slot that has not been delivered')

check('before the first slot, nothing', dueSlot({ localHour: 6, delivered: [] }), null)
check('at 07:00 on a clean day', dueSlot({ localHour: 7, delivered: [] }), { slot: 7, superseded: [] })
check('at 08:00, still the 07:00 line', dueSlot({ localHour: 8, delivered: [] }), { slot: 7, superseded: [] })
check('once it has gone out, nothing', dueSlot({ localHour: 8, delivered: [7] }), null)
check('at 09:00 the next one is due', dueSlot({ localHour: 9, delivered: [7] }), { slot: 9, superseded: [] })

/**
 * The outage. Six hours of missed ticks must produce **one** notification and
 * three closed slots, not four notifications in the same minute.
 */
check(
  'a six-hour gap sends once and passes over the rest',
  dueSlot({ localHour: 15, delivered: [7] }),
  { slot: 15, superseded: [9, 11, 13] },
)
check(
  'a whole morning missed',
  dueSlot({ localHour: 19, delivered: [] }),
  { slot: 19, superseded: [7, 9, 11, 13, 15, 17] },
)
check('after the last slot, nothing new', dueSlot({ localHour: 23, delivered: [...REMINDER_SLOTS] }), null)
check('and a tick at 22:00 with 19:00 undelivered still catches up', dueSlot({ localHour: 22, delivered: [7, 9, 11, 13, 15, 17] }), { slot: 19, superseded: [] })

section('and the same rule, as properties, over every hour and every subset')

const subsets: number[][] = []
for (let mask = 0; mask < 1 << REMINDER_SLOTS.length; mask++) {
  subsets.push(REMINDER_SLOTS.filter((_, i) => (mask >> i) & 1))
}
check('128 subsets of seven slots', subsets.length, 128)

let cases = 0
const violations: string[] = []
for (let hour = 0; hour <= 23; hour++) {
  for (const delivered of subsets) {
    cases++
    const done = new Set(delivered)
    const outstanding = REMINDER_SLOTS.filter((s) => s <= hour && !done.has(s))
    const got = dueSlot({ localHour: hour, delivered })
    const label = `h=${hour} d=[${delivered}]`
    if (outstanding.length === 0) {
      if (got !== null) violations.push(`${label}: expected null`)
      continue
    }
    if (got === null) {
      violations.push(`${label}: expected a slot`)
      continue
    }
    if (got.slot !== outstanding[outstanding.length - 1]) violations.push(`${label}: not the greatest`)
    if (got.slot > hour) violations.push(`${label}: slot past the clock`)
    if (done.has(got.slot)) violations.push(`${label}: already delivered`)
    if (!REMINDER_SLOTS.includes(got.slot)) violations.push(`${label}: not a slot`)
    if (got.superseded.some((s) => s >= got.slot)) violations.push(`${label}: superseded not earlier`)
    if (got.superseded.some((s) => done.has(s))) violations.push(`${label}: superseded already delivered`)
    if (JSON.stringify([...got.superseded, got.slot]) !== JSON.stringify(outstanding)) {
      violations.push(`${label}: the union is not what is outstanding`)
    }
  }
}
check('24 hours x 128 subsets', cases, 24 * 128)
check('no violation anywhere in the matrix', violations.slice(0, 5), [])

/**
 * A tick never sends twice. Stated as its own assertion because it is the
 * sentence a reader wants to find, and because "returns one slot" is the shape
 * of the type rather than a property of the rule.
 */
check(
  'every answer is at most one notification',
  subsets.every((d) => {
    const got = dueSlot({ localHour: 23, delivered: d })
    return got === null || typeof got.slot === 'number'
  }),
  true,
)

section('and garbage in the arguments buys silence, never a 03:00 notification')

check('NaN', dueSlot({ localHour: NaN, delivered: [] }), null)
check('negative', dueSlot({ localHour: -1, delivered: [] }), null)
check('Infinity is just "after every slot"', dueSlot({ localHour: Infinity, delivered: [] }), { slot: 19, superseded: [7, 9, 11, 13, 15, 17] })
check('a fractional hour floors naturally', dueSlot({ localHour: 7.9, delivered: [] }), { slot: 7, superseded: [] })
check('duplicates in delivered', dueSlot({ localHour: 9, delivered: [7, 7, 7] }), { slot: 9, superseded: [] })
check('values that are not slots at all', dueSlot({ localHour: 9, delivered: [8, 20, -3, NaN] }), { slot: 9, superseded: [7] })
check('an empty iterable', dueSlot({ localHour: 7, delivered: new Set<number>() }), { slot: 7, superseded: [] })

/* --------------------------------- The deck --------------------------------- */

section('the bands partition the schedule, and each one cycles')

check('three bands', REMINDER_BANDS.map((b) => b.name), ['morning', 'afternoon', 'evening'])
check(
  'their slots concatenate to exactly REMINDER_SLOTS, in order',
  REMINDER_BANDS.flatMap((b) => [...b.slots]),
  [...REMINDER_SLOTS],
)
check(
  'so no slot belongs to two bands',
  new Set(REMINDER_BANDS.flatMap((b) => [...b.slots])).size,
  REMINDER_SLOTS.length,
)
check('bandForSlot is total over the schedule', REMINDER_SLOTS.filter((s) => bandForSlot(s) === null), [])
check('and null outside it', [8, 20, 0, -1].filter((s) => bandForSlot(s) !== null), [])

/**
 * The coprimality, asserted per band rather than as three literal numbers, so
 * adding a line to a sub-deck fails here rather than silently halving the deck.
 */
for (const band of REMINDER_BANDS) {
  check(
    `${band.name}: gcd(${band.slots.length} slots, ${band.lines.length} lines) is 1`,
    gcd(band.slots.length, band.lines.length),
    1,
  )
  check(`${band.name}: more lines than slots`, band.lines.length > band.slots.length, true)
}

section('every written line obeys the copy rules')

check('forty-three lines', REMINDER_LINES.length, 43)
check('and the flattened list is the bands', REMINDER_LINES.length, REMINDER_BANDS.reduce((n, b) => n + b.lines.length, 0))

const keys = REMINDER_LINES.map((l) => l.key)
const titles = REMINDER_LINES.map((l) => l.title)
const bodies = REMINDER_LINES.map((l) => l.body)

check('keys are distinct', new Set(keys).size, keys.length)
check('keys are [a-z0-9_]', keys.filter((k) => !/^[a-z0-9_]+$/.test(k)), [])
check('keys name their band', keys.filter((k) => !/^(morning|afternoon|evening)_/.test(k)), [])
check('titles are distinct', new Set(titles).size, titles.length)
check('bodies are distinct', new Set(bodies).size, bodies.length)
check('reminderByKey round-trips every one', keys.filter((k) => reminderByKey(k)?.key !== k), [])
check('and answers null for a key that is not in the deck', reminderByKey('morning_nope'), null)

check(`no title over ${REMINDER_TITLE_MAX} characters`, titles.filter((t) => t.length > REMINDER_TITLE_MAX), [])
check(`no body over ${REMINDER_BODY_MAX} characters`, bodies.filter((b) => b.length > REMINDER_BODY_MAX), [])
check('nothing is empty or untrimmed', REMINDER_LINES.filter((l) => l.title !== l.title.trim() || l.body !== l.body.trim() || !l.title || !l.body), [])

/**
 * Title and body are tested **separately**, never concatenated. Joining them
 * invents phrases neither one contains — "Quiet again" followed by "Today’s
 * card…" reads as "again today" to a regex, and a false positive in a rule
 * about tone is how a check script stops being believed.
 */
const fields = REMINDER_LINES.flatMap((l) => [l.title, l.body])
check('eighty-six strings in the deck', fields.length, REMINDER_LINES.length * 2)
check('no exclamation marks', fields.filter((c) => c.includes('!')), [])
check("no straight apostrophes — the app draws ’ everywhere", fields.filter((c) => c.includes("'")), [])
check('no emoji or other non-Latin-1 punctuation', fields.filter((c) => !/^[\x20-\x7E’—]*$/.test(c)), [])

/**
 * [R11]'s rule, applied where it matters most. `/profile` refuses to say "your
 * streak is at risk" to a user who opened the app on purpose; a notification
 * says it to someone who did not.
 */
const THREAT = [/streak/i, /\brisk\b/i, /last chance/i, /miss(ing|ed)?\s+out/i, /don’t lose/i, /keep it going/i, /before it’s gone/i, /running out/i]
check('nothing threatens a streak', fields.filter((c) => THREAT.some((re) => re.test(c))), [])

/** Nothing counts, congratulates or implies a history — day one and day four hundred read alike. */
const HISTORY = [/\byour \d/i, /\bwell done\b/i, /\bgreat\b/i, /\bproud\b/i, /so far this (week|month|year)/i, /\bagain today\b/i]
check('nothing credits the reader with anything', fields.filter((c) => HISTORY.some((re) => re.test(c))), [])

/* --------------------------- reminderFor, as a function ---------------------- */

section('reminderFor is a pure function of (date, slot)')

check('the epoch is a real date', isLocalDate(REMINDER_EPOCH), true)
check('total over the schedule', REMINDER_SLOTS.filter((s) => reminderFor('2026-09-14', s) === null), [])
check('null outside it', [8, 20, 0].filter((s) => reminderFor('2026-09-14', s) !== null), [])

check(
  'the same arguments give the same line, twice',
  JSON.stringify(reminderFor('2026-09-14', 13)),
  JSON.stringify(reminderFor('2026-09-14', 13)),
)
check(
  'and the identical object, because the deck is frozen data',
  reminderFor('2026-09-14', 13) === reminderFor('2026-09-14', 13),
  true,
)
check('a date before the epoch does not index off the front', reminderFor('2019-03-04', 7) !== null, true)
check('nor a long way before it', reminderFor('1970-01-01', 19) !== null, true)

section('and no two of a day’s seven reminders read alike, for 400 days')

const DAYS = 400
let date = REMINDER_EPOCH
const used = new Set<string>()
const dayShapes: string[] = []
let clashes = 0
for (let i = 0; i < DAYS; i++) {
  const day = REMINDER_SLOTS.map((s) => reminderFor(date, s)!)
  if (new Set(day.map((l) => l.key)).size !== REMINDER_SLOTS.length) clashes++
  day.forEach((l) => used.add(l.key))
  dayShapes.push(day.map((l) => l.key).join('|'))
  date = addLocalDays(date, 1)
}
check(`${DAYS} days with a repeated line`, clashes, 0)
check('every line in the deck is used', used.size, REMINDER_LINES.length)

/**
 * lcm(16, 16, 11) = 176. The whole day's seven-line shape repeats twice a year
 * and no sooner — which is the number the sub-deck sizes were chosen to produce.
 */
const period = dayShapes.findIndex((s, i) => i > 0 && s === dayShapes[0])
check('the whole-day shape repeats after 176 days', period, 176)
check('and there are exactly 176 distinct day shapes in 400', new Set(dayShapes).size, 176)

/* ------------------------------- The greps ---------------------------------- */

section('the secrets stay out of the client, and the modules stay importable')

const SRC = join(import.meta.dirname, '..', 'src')

/** Every `.ts`/`.tsx` under `src/`, so a grep is an assertion and not a habit. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name)
    if (e.isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(e.name) ? [full] : []
  })
}

const files = sourceFiles(SRC)
const rel = (f: string) => relative(SRC, f).split(sep).join('/')

/**
 * **The property, not a filename list.** The first draft of this asserted "at
 * most one file, and if there is one it is `lib/env.ts`", which is wrong and
 * would fail the build: `lib/push/send.ts` names `VAPID_PRIVATE_KEY` because it
 * is the file that signs with it, and `app/api/push/tick/route.ts` names
 * `CRON_SECRET` because it is the file that compares it. A list of sanctioned
 * filenames would have to be edited by every phase that adds a legitimate
 * reader, which is how a check stops being believed.
 *
 * What is actually worth guaranteeing is that neither literal can reach a
 * client bundle, and the mechanism for that in this codebase is one line:
 * **every file under `src/` that names either secret begins with
 * `import 'server-only'`**, which turns a client import into a build error
 * rather than a leak. That is a real safety claim, it is true at every point in
 * the phase sequence (it is vacuously true now, before Phase 2 exists), and it
 * is false the moment a component reads a secret.
 *
 * The tick route carries the import even though a route handler is already
 * server-side — redundant, deliberate and honest, so this assertion can be a
 * property rather than a one-file exemption. See Phase 4's Step 2.
 */
const SERVER_ONLY = /^import\s+["']server-only["']/m
for (const name of ['VAPID_PRIVATE_KEY', 'CRON_SECRET']) {
  const naming = files
    .map((f) => [rel(f), readFileSync(f, 'utf8')] as const)
    .filter(([, text]) => text.includes(name))
  check(
    `every file under src/ naming ${name} is server-only`,
    naming.filter(([, text]) => !SERVER_ONLY.test(text)).map(([r]) => r),
    [],
  )
}

/**
 * The other half, and the one that would otherwise be assumed: the browser half
 * of this feature must never become server-only, because it ships to the phone.
 * Asserted here rather than in Phase 2 because this file is the one that runs
 * offline with no environment, and because a check that only exists in the
 * phase that created the hazard is a check nobody re-reads.
 */
const clientPath = join(SRC, 'lib', 'push', 'client.ts')
if (existsSync(clientPath)) {
  const clientSrc = readFileSync(clientPath, 'utf8')
  check('lib/push/client.ts is not server-only', SERVER_ONLY.test(clientSrc), false)
  check(
    'and names neither secret',
    ['VAPID_PRIVATE_KEY', 'CRON_SECRET'].filter((n) => clientSrc.includes(n)),
    [],
  )
}

/**
 * `schedule.ts` imports nothing at all, and `reminders.ts` imports only
 * `lib/time/local-date` — not even its sibling, so the deck's slot arrays are
 * held to the schedule by the assertion above rather than by a reference. That
 * is what lets the tick, a client bundle and this offline process read the same
 * two files, and it is the property that quietly dies the first time somebody
 * reaches for zod here.
 */
const scheduleSrc = readFileSync(join(SRC, 'lib', 'push', 'schedule.ts'), 'utf8')
const remindersSrc = readFileSync(join(SRC, 'lib', 'push', 'reminders.ts'), 'utf8')
const importsIn = (src: string) => [...src.matchAll(/^\s*import\s[^\n]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]).sort()

check('schedule.ts imports nothing', importsIn(scheduleSrc), [])
check('reminders.ts imports only the date module', importsIn(remindersSrc), ['@/lib/time/local-date'])
check('neither is server-only', [scheduleSrc, remindersSrc].filter((s) => s.includes("'server-only'") || s.includes('"server-only"')).length, 0)

/**
 * The day-boundary contract, enforced on the one directory most likely to break
 * it. `lib/time/local-date.ts` is the only file allowed an `Intl.DateTimeFormat`
 * or any date arithmetic; a `new Date()` in `lib/push/` would compute 07:00 in
 * Vercel's UTC and send the morning line at lunchtime in Jakarta, silently.
 */
const pushCode = files
  .filter((f) => rel(f).startsWith('lib/push/'))
  .map((f) => [rel(f), stripComments(readFileSync(f, 'utf8'))] as const)
// Comments are stripped first, and they have to be: both modules *name* the
// trap in prose so the next reader knows why it is not there.
check('lib/push/ constructs no Intl.DateTimeFormat', pushCode.filter(([, c]) => c.includes('Intl.DateTimeFormat')).map(([r]) => r), [])
check('lib/push/ serialises no instant as a day', pushCode.filter(([, c]) => c.includes('toISOString')).map(([r]) => r), [])
check('and the two pure modules hold no clock', [scheduleSrc, remindersSrc].filter((s) => stripComments(s).includes('new Date')).length, 0)

/** Strips block and line comments, so a grep reads code rather than prose. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/* ---------------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`)
  process.exit(1)
}
console.log('\nAll push assertions passed.')
```

**Impact:** the phase becomes checkable. `npm run push:check` is the exit gate.

### Step 10: the script entry

**File:** `package.json:44`
**Change:** insert one line after `"claim:db": …` and before `"badges:check": …`,
so the push scripts start their own block where Phase 4 will add `push:db` and
`push:send` beside it.

**Code:**

```json
    "claim:db": "tsx --conditions=react-server --env-file=.env.local scripts/check-claim-db.ts",
    "push:check": "tsx scripts/check-push.ts",
    "badges:check": "tsx scripts/check-badge-art.ts",
```

No `--conditions=react-server` and no `--env-file`, unlike most of its
neighbours: this script imports no `server-only` module and reads no environment,
and the flags would hide it the day one of those stops being true.

**Impact:** `npm run push:check` runs.

## Verification

**Build:**

```bash
npm run typecheck        # tsc --noEmit — clean
npm run lint             # eslint — clean
npm run build            # next build --turbopack
```

`typecheck` was run against the whole `src/` tree with both new modules in place
while this plan was written, and is clean. `eslint src/lib/push scripts/check-push.ts`
produced no output.

**Tests:**

```bash
npm run push:check
```

Expected tail, exactly:

```
  ok   every file under src/ naming VAPID_PRIVATE_KEY is server-only
  ok   every file under src/ naming CRON_SECRET is server-only
  ok   schedule.ts imports nothing
  ok   reminders.ts imports only the date module
  ok   neither is server-only
  ok   lib/push/ constructs no Intl.DateTimeFormat
  ok   lib/push/ serialises no instant as a day
  ok   and the two pure modules hold no clock

All push assertions passed.
```

Zero `FAIL`, exit 0. The four sections worth watching:

- `seven slots` → `[7,9,11,13,15,17,19]`, and `deriveReminderSlots` correct on
  nine other triples including the two that would hang a naive loop.
- `24 hours x 128 subsets` → `3072`, `no violation anywhere in the matrix` → `[]`.
- `400 days with a repeated line` → `0`; `every line in the deck is used` → `43`;
  `the whole-day shape repeats after 176 days` → `176`.
- Both secret assertions pass **now**, before Phase 2 exists (vacuously — no
  file names either literal yet), and still pass after Phases 2 and 4 land,
  because they assert `import 'server-only'` rather than a list of filenames.

Then the whole existing suite, none of which this phase touches:

```bash
npm run vocab:check && npm run dates:check && npm run nav:check && \
npm run profile:check && npm run chat:check && npm run discover:check && \
npm run journal:check && npm run share:check && npm run claim:check && \
npm run badges:check && npm run stats:check
npm run test:layout
```

**Migration:**

```bash
npm run db:generate      # exactly one new file, drizzle/0010_*.sql
git status --short drizzle/   # 0010_*.sql, meta/0010_snapshot.json, meta/_journal.json
npm run db:migrate
```

Then, against the database:

```sql
\d push_subscriptions
\d push_deliveries
```

`push_deliveries` must show **one** index (`push_deliveries_user_date_slot_uniq`,
UNIQUE, three columns) plus the primary key, and three CHECK constraints.
`push_subscriptions` must show two indexes plus the primary key.

A second `npm run db:generate` immediately after must print `No schema changes,
nothing to migrate` — if it emits an `0011`, the schema block and the migration
disagree and the snapshot is wrong.

**Manual check:**

- `ROADMAP_v0.1.0.md` — read `[R24]` against `[R23]` above it. Same shape: the
  quoted request, the ruling, the numbered conditions, the "does **not** change"
  list, the `**Overrides:**` line. The out-of-scope bullets and `[R11]`'s ruling
  paragraph must still be present, *unedited*, with the amendment beneath them.
- Read the 43 lines of copy out loud once. They are the feature, and the exit
  code only reports their mechanics. Nothing should read as flattery, as a
  threat, as a count of anything, or as odd at the hour it belongs to.

**Exit criteria:**

1. `[R24]` exists, and `grep -n "Push notifications or reminders of any kind" ROADMAP_v0.1.0.md` still finds the original bullet with an amendment beneath it.
2. `npm run db:generate` produces exactly one additive migration matching the SQL in Step 6, and `npm run db:migrate` applies it.
3. `npm run push:check` passes offline — `unset DATABASE_URL; npm run push:check` must also pass — with no network.
4. `npm run typecheck`, `npm run lint`, `npm run build` and every pre-existing check script pass.
5. `git diff --stat` touches exactly the nine paths in the Files table and nothing else. In particular `src/lib/env.ts`, `src/middleware.ts`, `next.config.ts`, `public/`, `vercel.json`, `.env.example` and every component are untouched.

## Handoffs

Work found while planning this phase, deliberately left where it belongs.

**To Phase 2 (`R1`):**
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` and `CRON_SECRET` go in
  `src/lib/env.ts`, all optional through `blankIsAbsent`. `scripts/check-push.ts`
  §"the secrets stay out of the client" is written to pass **both** before and
  after that lands: it asserts *every file under `src/` that names either literal
  begins with `import 'server-only'`*, which is a safety property rather than a
  list of sanctioned filenames. `send.ts` names `VAPID_PRIVATE_KEY` legitimately
  and passes; so does Phase 4's tick route.
- `push_subscriptions.lastSeenAt` is defaulted to `now()` and expects the
  reconciler to touch it on app open; nothing in this phase writes it.
- The 410/404 sweep deletes by `endpoint`, which is why that index is globally
  unique. It is still spelled **`deleteDeadSubscription(userId, endpoint)`** —
  the caller holds the user id already, and `listReminderCandidates()` stays the
  file's **one and only** function without a `userId`.

**To Phase 4 (`R1`, `R2`, `R3`) — it consumes this phase and must not edit it:**
- The tick's loop is: resolve the zone → `localDateNow(tz, now)` and `localHour(now, tz)`
  → today's card exists? → read the day's delivered slots →
  `dueSlot({ localHour, delivered })` → active words > 0? → `reminderFor(localDate, slot)`
  → claim → send → the row is `'sent'` or downgraded to `'failed'`, **and one
  `'skipped'` row per member of `superseded`**, all under the unique index.
- **`reminderFor` returns `Reminder | null`, and the `key` is not decoration.**
  `push_deliveries_reminder_key_check` refuses any `status = 'sent'` row whose
  `reminder_key` is null, so the key must be threaded from `reminderFor` into
  `claimDelivery` — destructuring only `{ title, body }` produces a runtime
  `23514` on the insert, not a type error. The `null` arm cannot fire for a slot
  that came out of `dueSlot`, but it is a `null` rather than a throw and the tick
  must narrow it before use.
- `push_deliveries.reason` is a plain nullable text column and Phase 4 writes
  every value it ever holds: `'superseded'`, `'no_active_words'`, or the
  transport detail on a `'failed'` row. Null on `'sent'`.
- **The notification payload shape is Phase 4's, not this phase's.** `reminders.ts`
  holds copy and nothing else — no `url`, no `tag`, no icon path — because `sw.js`
  (Phase 3) and the sender (Phase 4) are the two things that have to agree on it and
  neither is here. Reconciliation settled both: the destination is `/today`, and the
  tag is the **constant** `'daily-card-reminder'` (Phase 3's `public/sw.js` owns the
  literal and defaults it; Phase 4 always sends it). A per-day tag was rejected —
  it lets yesterday's undismissed reminder sit beside today's, and yesterday's card
  can no longer be made.
- `resolveTimezone` returning `{ ok: false }` must mean **do not send and write no
  row**, not "send in the default zone". A reads-may-fall-back call here puts a
  07:00 line on the phone at some other hour, and the user cannot tell it was a
  guess.
- `push_deliveries` has no expiry and no pruning, by design. If that ever needs to
  change it is a new decision, not a tidy-up.

**To Phase 5 (the doc sweep):**
- `src/lib/db/schema.ts:550` — *"No expires_at. There is no cron in this app ([R11])"*
  on `shares`. **Still the right call, now for a different reason**: the app has a
  scheduler and shares still must not expire, because a share is revoked by a
  deliberate act. Amend the sentence, do not delete the comment. This phase leaves
  it alone on purpose even though this phase is what makes it false.
- `CLAUDE.md`'s "Commands" list needs `push:check` (and Phase 4's `push:db` /
  `push:send`), and its `[R11]` references need the same amendment treatment.

**Not done, and not anyone's:**
- No `profiles.reminders_enabled` column, ever. `[R24]` condition 1 and the
  `push_subscriptions` table comment both say why; re-proposing it is re-opening a
  decision, not filing a bug.

## Rollback

This phase is additive in every file it touches, so undoing it is a revert plus one
SQL statement. Nothing later depends on it having happened *and* being partially
undone — take all of it or none.

```bash
git revert <this phase's commit>        # or: git checkout HEAD~1 -- <the nine paths>
```

Then, against the database:

```sql
drop table if exists push_deliveries;
drop table if exists push_subscriptions;
delete from drizzle.__drizzle_migrations
 where hash = (select hash from drizzle.__drizzle_migrations order by created_at desc limit 1);
```

Delete `drizzle/0010_*.sql` and `drizzle/meta/0010_snapshot.json`, and remove the
`idx: 10` entry from `drizzle/meta/_journal.json`. Verify with
`npm run db:generate`, which must then report no changes.

The roadmap edits revert with the file. Note that reverting `[R24]` puts the
repository back into the state where the roadmap forbids everything phases 2–5
build, so a partial rollback — dropping the tables but keeping `[R24]` — is the
one shape to avoid.
