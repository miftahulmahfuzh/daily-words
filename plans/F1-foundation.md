> ## ⚠ SUPERSEDED IN PART — read `ROADMAP_v0.1.0.md` § Reconciliation Decisions first.
>
> - **[R1]** Your `onDelete: restrict` on `daily_card_items` is upheld and is now roadmap policy. But a limited delete path **does** exist: words never carded may be hard deleted.
> - **[R5]** Add `ON DELETE CASCADE` to `chat_sessions.vocab_entry_id`.
> - **[R6]–[R11]** The roadmap schema has grown: chat `round`/`kind`, journal `insight jsonb`/`insight_requested_at`/`updated_at`, vocab `suggested_correction`/`enrichment_error`/`enrichment_attempts`, `profiles.timezone_source`. Sync §5.2 against the roadmap before generating migrations.
> - **[R2]** Your zod 4 pin is binding on all plans.
>
> These plans were written in parallel by agents that could not see each other.
> The Reconciliation section wins over anything below.

# F1 — Foundation, Auth & Data Layer

> Implementation plan for `ROADMAP_v0.1.0.md` → F1.
> Read the roadmap's **Locked Decisions** section before starting. Where this file
> appears to contradict the roadmap, the roadmap wins — stop and report.

---

## 1. Goal

Stand up the Next.js 15 / Tailwind v4 / Neon / Drizzle / Auth.js skeleton, the complete
database schema for all ten features, and the shared LLM client every other feature must
call through. Ship the four-tab app shell with iOS safe-area handling, PWA manifest, route
protection, and the timezone helper that F5, F9 and the badge logic depend on. Deploy it to
Vercel so every later feature starts from a running app.

---

## 2. Depends on / blocks

**Depends on:** nothing. F1 is the first unit of work.

**External prerequisites the implementer must have on hand before starting:**

| Thing | Where it comes from |
|---|---|
| Neon project + pooled connection string | neon.tech free tier |
| Google OAuth client ID + secret | Google Cloud Console → APIs & Services → Credentials → OAuth client (Web application) |
| `LLM_API_KEY` for z.ai | z.ai account |
| Vercel account linked to the git remote | vercel.com free tier |

**Blocks:** every other feature. Specifically:

| Feature | What it takes from F1 |
|---|---|
| F2 | App shell, `globals.css`, Tailwind v4 pipeline, tab bar to restyle |
| F3 | `vocab_entries` schema, `runPrompt()`, `lib/db/queries/` convention, API conventions |
| F4 | `vocab_entries` schema, route protection, tab shell |
| F5 | `daily_cards` / `daily_card_items` schema, **`localDateNow()` / `toLocalDate()`**, `--card-viewport-height` CSS var |
| F6 | `chat_sessions` / `chat_messages` schema, `generateText()` |
| F7 | `profiles` schema, `upsertProfile()`, `isValidTimeZone()` |
| F8 | `vocab_entries` schema, `runPrompt()` |
| F9 | `user_stats` / `badges_awarded` schema, **`localDateNow()`, `localHour()`, `localDayOfWeek()`, `diffLocalDays()`, `formatLocalDateLong()`** |
| F10 | `journal_entries` schema, `runPrompt()` |

---

## 3. In scope / explicitly out of scope

### In scope

1. Next.js 15 App Router + TypeScript scaffold at repo root (no `src/`).
2. Tailwind CSS v4 pipeline (`@tailwindcss/postcss`, CSS-first config).
3. Neon Postgres connection via Drizzle + `postgres.js`.
4. **The complete Drizzle schema for every table in the roadmap** — Auth.js tables plus
   `profiles`, `vocab_entries`, `daily_cards`, `daily_card_items`, `chat_sessions`,
   `chat_messages`, `journal_entries`, `user_stats`, `badges_awarded`.
5. drizzle-kit migration setup, first generated migration, committed SQL.
6. Auth.js v5 (`next-auth@beta`) with **Google provider only** and **database sessions**
   via `@auth/drizzle-adapter`.
7. Auto-creation of a `profiles` row on first sign-in (so timezone lookups never return null).
8. Shared LLM client in `lib/llm/` — `@anthropic-ai/sdk` with `baseURL` override,
   zod-validated JSON with **exactly one** retry, `lib/llm/prompts/` module convention.
9. `lib/db/queries/` access-layer convention + inferred row types.
10. `lib/api/` request/response conventions for `app/api/` route handlers.
11. Shared timezone helper `lib/time/local-date.ts`.
12. App shell: root layout, authed layout, bottom tab bar with four items, safe-area insets.
13. PWA manifest, icons, `apple-touch-icon`, `viewport-fit=cover`.
14. Route protection: `middleware.ts` + server-side `requireUser()`.
15. Env var handling with fail-fast zod validation (`lib/env.ts`).
16. First Vercel deployment with env vars set and Google callback URL registered.

### Explicitly out of scope

- Any real feature UI. `/today`, `/vocab`, `/journal`, `/profile` ship as **placeholder pages**
  whose only job is to prove the shell and the guard work. F4/F5/F9/F10 replace them.
- Design tokens, colour system, typography scale, component kit — **F2 owns all of it.**
  F1 uses raw Tailwind utilities and the smallest possible set of CSS variables.
- Any prompt other than the shared scaffolding in `lib/llm/prompts/shared.ts`.
  Every feature adds its own prompt module.
- `/onboarding` (F7), `/calendar` (F5), `/vocab/new` (F3), `/vocab/[id]` (F4),
  `/vocab/[id]/chat` (F6), `/journal/[id]` (F10) — F1 creates none of these routes.
- Service worker, offline caching, push notifications (out of scope for v0.1.0 entirely).
- Any sign-in method other than Google.
- Tests. This is a hobby project; verification is the checklist in §9.

---

## 4. Files to create

### Root configuration

| Path | Purpose |
|---|---|
| `package.json` | Deps, scripts (`dev`, `build`, `db:generate`, `db:migrate`, `db:studio`, `llm:check`), `engines.node` |
| `tsconfig.json` | Strict TS, `@/*` path alias to repo root |
| `next.config.ts` | Minimal Next config; no custom webpack |
| `postcss.config.mjs` | Registers `@tailwindcss/postcss` |
| `eslint.config.mjs` | From `create-next-app`, unmodified |
| `drizzle.config.ts` | drizzle-kit config: dialect `postgresql`, schema path, `out: './drizzle'` |
| `.gitignore` | Node/Next defaults plus `.env*.local`, `.vercel` |
| `.env.example` | Every required env var with a placeholder value — committed |
| `.env.local` | Real secrets — **never committed**, created by the implementer locally |
| `middleware.ts` | Optimistic cookie-presence route gate (see §6 step 11) |
| `auth.ts` | The single Auth.js v5 configuration; exports `handlers`, `auth`, `signIn`, `signOut` |

### Environment & shared libs

| Path | Purpose |
|---|---|
| `lib/env.ts` | Server-only, zod-validated env access. Throws at import time on missing vars |
| `lib/time/local-date.ts` | **The timezone contract.** UTC instant → user-local calendar date and friends |
| `lib/api/respond.ts` | `ok()` / `fail()` / `readJson()` — the shape every `app/api/` route returns |
| `lib/api/guards.ts` | `requireApiUser()` — 401 JSON for unauthenticated API calls |

### Database

| Path | Purpose |
|---|---|
| `lib/db/schema.ts` | **The complete Drizzle schema for all ten features.** Single source of truth |
| `lib/db/index.ts` | The `db` client singleton (postgres.js + `drizzle-orm/postgres-js`) |
| `lib/db/types.ts` | Inferred row/insert types + the string-union types (`VocabStatus`, `ChatTone`, …) |
| `lib/db/queries/profiles.ts` | `getProfile`, `getUserTimezone`, `ensureProfile`, `upsertProfile` |
| `drizzle/0000_*.sql` | First generated migration — **committed** |
| `drizzle/meta/*` | drizzle-kit journal + snapshots — **committed** |

### Auth

| Path | Purpose |
|---|---|
| `app/api/auth/[...nextauth]/route.ts` | Re-exports `handlers.GET` / `handlers.POST` from `auth.ts` |
| `lib/auth/session.ts` | `getSessionUser()`, `requireUser()`, `SessionUser` type |
| `types/next-auth.d.ts` | Module augmentation so `session.user.id` is typed |

### LLM

| Path | Purpose |
|---|---|
| `lib/llm/client.ts` | The one `Anthropic` SDK instance, with `baseURL` override + model constant |
| `lib/llm/errors.ts` | `LlmError` kinds and the short user-visible strings |
| `lib/llm/json.ts` | `extractJson()`, `generateJson()`, `runPrompt()` — one retry, zod-validated |
| `lib/llm/text.ts` | `generateText()` for multi-turn plain-text calls (F6 chat) |
| `lib/llm/prompts/types.ts` | The `PromptModule<TIn, TOut>` contract every feature implements |
| `lib/llm/prompts/shared.ts` | `BASE_STYLE`, `jsonOnly()` — shared system-prompt fragments |
| `lib/llm/index.ts` | Barrel: the only import path other features should use |

### App shell

| Path | Purpose |
|---|---|
| `app/layout.tsx` | Root layout: `<html lang="en">`, `metadata`, `viewport` with `viewportFit: 'cover'` |
| `app/globals.css` | `@import "tailwindcss"` + the safe-area/layout CSS variables |
| `app/page.tsx` | `/` → redirect to `/today` (authed) or `/signin` |
| `app/signin/page.tsx` | Server component: the single "Continue with Google" screen |
| `app/signin/sign-in-button.tsx` | Client component wrapping the `signIn('google')` server action |
| `app/(app)/layout.tsx` | Authed shell: calls `requireUser()`, renders header + children + tab bar |
| `app/(app)/today/page.tsx` | Placeholder — F5 replaces |
| `app/(app)/vocab/page.tsx` | Placeholder — F4/F8 replace |
| `app/(app)/journal/page.tsx` | Placeholder — F10 replaces |
| `app/(app)/profile/page.tsx` | Placeholder — F9 replaces. Also renders a sign-out button |
| `components/nav/tab-bar.tsx` | The four-item bottom bar, safe-area padded |
| `components/nav/tab-bar-link.tsx` | Client component; active state from `usePathname()` |
| `components/app-header.tsx` | Minimal fixed header with the current section title |

### PWA & assets

| Path | Purpose |
|---|---|
| `public/manifest.webmanifest` | Name, `start_url: /today`, `display: standalone`, icons |
| `public/icons/icon-192.png` | Manifest icon, `any` purpose |
| `public/icons/icon-512.png` | Manifest icon, `any` purpose |
| `public/icons/icon-512-maskable.png` | Manifest icon, `maskable` purpose |
| `app/icon.png` | Next.js file convention → favicon (512×512) |
| `app/apple-icon.png` | Next.js file convention → `apple-touch-icon` (180×180) |

### Scripts

| Path | Purpose |
|---|---|
| `scripts/check-llm.ts` | One-shot smoke test that hits z.ai through the shared client and prints the result |

---

## 5. Data model

### 5.1 Approach

- **One file**, `lib/db/schema.ts`, exports every table. Ten features all read it; splitting it
  buys nothing and costs import churn.
- **Column names snake_case, TypeScript properties camelCase** (roadmap convention),
  expressed as `camelCaseProp: text('snake_case_column')`.
  **Exception:** the Auth.js `accounts` table. The Drizzle adapter reads the OAuth fields by
  their snake_case *property* names (`refresh_token`, `access_token`, `expires_at`,
  `token_type`, `scope`, `id_token`, `session_state`). Those five-to-seven properties must stay
  snake_case in TypeScript or the adapter silently writes nulls. See §10.
- **Primary keys** `uuid('id').primaryKey().defaultRandom()` → emits `gen_random_uuid()`.
  Neon runs PG 16, so `gen_random_uuid()` is built in; no `pgcrypto` extension needed.
- **`date` columns use `{ mode: 'string' }`** so they round-trip as `'YYYY-MM-DD'` and line up
  exactly with the `LocalDate` type from `lib/time/local-date.ts`. Never use `mode: 'date'`
  for `card_date` / `last_shown_on` / `awarded_for_date` / `first_card_on` / `last_card_on` —
  a JS `Date` reintroduces the UTC-drift bug the whole timezone contract exists to prevent.
- **All `timestamptz` columns use `{ withTimezone: true, mode: 'date' }`.**
- **String enums are `text` with `$type<...>()`**, not PG enums. PG enums are painful to alter
  and every one of these values is already validated by zod at the API boundary.
- Table-level indexes/constraints use the **array** callback form
  (`(t) => [ ... ]`), which is what drizzle-orm 0.45 expects; the object form is deprecated.

### 5.2 Schema

```ts
// lib/db/schema.ts
import { sql } from 'drizzle-orm'
import {
  date, index, integer, jsonb, pgTable, primaryKey,
  text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core'
import type { AdapterAccountType } from 'next-auth/adapters'

const tsz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })
const localDate = (name: string) => date(name, { mode: 'string' })

/* ---------------------------------- Auth.js --------------------------------- */

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: tsz('email_verified'),
  image: text('image'),
})

export const accounts = pgTable(
  'accounts',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<AdapterAccountType>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    // snake_case TS props on purpose — the Auth.js adapter reads these names.
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.providerAccountId] }),
    index('accounts_user_id_idx').on(t.userId),
  ],
)

export const sessions = pgTable(
  'sessions',
  {
    sessionToken: text('session_token').primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    expires: tsz('expires').notNull(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
)

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: tsz('expires').notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
)

/* ---------------------------------- Profile --------------------------------- */

export const profiles = pgTable('profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  timezone: text('timezone').notNull().default('Asia/Jakarta'),
  occupation: text('occupation'),
  interests: text('interests').array(),
  currentlyConsuming: text('currently_consuming'),
  englishContexts: text('english_contexts').array(),
  chatTone: text('chat_tone').$type<'patient' | 'blunt' | 'playful'>(),
  onboardedAt: tsz('onboarded_at'),
  createdAt: tsz('created_at').notNull().defaultNow(),
  updatedAt: tsz('updated_at').notNull().defaultNow(), // ADDED — see 5.4
})

/* ----------------------------------- Vocab ---------------------------------- */

export const vocabEntries = pgTable(
  'vocab_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    term: text('term').notNull(),
    source: text('source').$type<'manual' | 'suggested'>().notNull(),
    status: text('status').$type<'active' | 'mastered'>().notNull().default('active'),
    partOfSpeech: text('part_of_speech'),
    pronunciation: text('pronunciation'),
    definition: text('definition'),
    examples: jsonb('examples').$type<string[]>(),
    enrichmentStatus: text('enrichment_status')
      .$type<'pending' | 'ready' | 'failed'>().notNull().default('pending'),
    enrichmentError: text('enrichment_error'),          // ADDED — see 5.4
    lastShownOn: localDate('last_shown_on'),
    createdAt: tsz('created_at').notNull().defaultNow(),
    masteredAt: tsz('mastered_at'),
  },
  (t) => [
    uniqueIndex('vocab_entries_user_term_uniq').on(t.userId, sql`lower(${t.term})`),
    index('vocab_entries_selection_idx')
      .on(t.userId, t.status, t.lastShownOn.asc().nullsFirst()),
    index('vocab_entries_user_created_idx').on(t.userId, t.createdAt.desc()),
  ],
)

/* --------------------------------- Daily card -------------------------------- */

export const dailyCards = pgTable(
  'daily_cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    cardDate: localDate('card_date').notNull(),
    createdAt: tsz('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('daily_cards_user_date_uniq').on(t.userId, t.cardDate)],
)

export const dailyCardItems = pgTable(
  'daily_card_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cardId: uuid('card_id').notNull().references(() => dailyCards.id, { onDelete: 'cascade' }),
    vocabEntryId: uuid('vocab_entry_id').notNull()
      .references(() => vocabEntries.id, { onDelete: 'restrict' }),
    position: integer('position').notNull(),
  },
  (t) => [
    uniqueIndex('daily_card_items_card_position_uniq').on(t.cardId, t.position),
    index('daily_card_items_vocab_idx').on(t.vocabEntryId),
  ],
)

/* ----------------------------------- Chat ----------------------------------- */

export const chatSessions = pgTable(
  'chat_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    vocabEntryId: uuid('vocab_entry_id').notNull()
      .references(() => vocabEntries.id, { onDelete: 'cascade' }),
    turnCount: integer('turn_count').notNull().default(0),
    closedAt: tsz('closed_at'),
    lastMessageAt: tsz('last_message_at'),
    createdAt: tsz('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('chat_sessions_user_entry_uniq').on(t.userId, t.vocabEntryId)],
)

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id').notNull()
      .references(() => chatSessions.id, { onDelete: 'cascade' }),
    role: text('role').$type<'user' | 'assistant'>().notNull(),
    content: text('content').notNull(),
    createdAt: tsz('created_at').notNull().defaultNow(),
  },
  (t) => [index('chat_messages_session_created_idx').on(t.sessionId, t.createdAt)],
)

/* ---------------------------------- Journal --------------------------------- */

export const journalEntries = pgTable(
  'journal_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    sourceNote: text('source_note'),
    insight: text('insight'),
    insightStatus: text('insight_status')
      .$type<'none' | 'pending' | 'ready' | 'failed'>().notNull().default('none'),
    createdAt: tsz('created_at').notNull().defaultNow(),
  },
  (t) => [index('journal_entries_user_created_idx').on(t.userId, t.createdAt.desc())],
)

/* ------------------------------- Gamification -------------------------------- */

export const userStats = pgTable('user_stats', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  currentStreak: integer('current_streak').notNull().default(0),
  longestStreak: integer('longest_streak').notNull().default(0),
  totalCards: integer('total_cards').notNull().default(0),
  firstCardOn: localDate('first_card_on'),
  lastCardOn: localDate('last_card_on'),            // ADDED — see 5.4
  updatedAt: tsz('updated_at').notNull().defaultNow(),
})

export const badgesAwarded = pgTable(
  'badges_awarded',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    badgeKey: text('badge_key').notNull(),
    awardedForDate: localDate('awarded_for_date').notNull(),
    createdAt: tsz('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('badges_awarded_uniq').on(t.userId, t.badgeKey, t.awardedForDate),
    index('badges_awarded_user_created_idx').on(t.userId, t.createdAt.desc()),
  ],
)
```

### 5.3 Migration commands

```jsonc
// package.json scripts
"db:generate": "drizzle-kit generate",
"db:migrate":  "drizzle-kit migrate",
"db:studio":   "drizzle-kit studio",
"db:push":     "drizzle-kit push"       // local scratch only, never against prod
```

```ts
// drizzle.config.ts
import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
  verbose: true,
})
```

Workflow: edit `lib/db/schema.ts` → `npm run db:generate` → **read the generated SQL** →
`npm run db:migrate` → commit both the schema change and `drizzle/`.

There is one migration in v0.1.0 as far as F1 is concerned: `drizzle/0000_*.sql`.
Later features that add a column generate `0001_*`, `0002_*` and so on.

**Known drizzle-kit caveat:** the functional unique index
`uniqueIndex(...).on(t.userId, sql`lower(${t.term})`)` is occasionally emitted without the
expression. After `db:generate`, grep the generated SQL for `lower(` and confirm it reads:

```sql
CREATE UNIQUE INDEX "vocab_entries_user_term_uniq"
  ON "vocab_entries" ("user_id", lower("term"));
```

If it does not, hand-edit the migration file to the statement above before running
`db:migrate`. This constraint is load-bearing for F3 (typo dedup) and F8 (Discover dedup).

### 5.4 Columns and indexes ADDED to the roadmap schema

The roadmap permits additions with justification. F1 adds three columns and a set of indexes.
Nothing is renamed or restructured.

| Addition | Justification |
|---|---|
| `profiles.updated_at timestamptz not null default now()` | F7 lets the user re-answer onboarding questions from `/profile`. Without `updated_at` there is no way to tell a stale profile from a fresh one, and the row has no other mutable timestamp. |
| `profiles.timezone` **default `'Asia/Jakarta'`** | Not a new column — a default on an existing one. F1 creates a `profiles` row on first sign-in (before onboarding runs) so that `getUserTimezone()` is total: it never returns null and F5/F9 never need a null branch. The default is a bootstrap value; F7 overwrites it with the browser's resolved timezone. |
| `vocab_entries.enrichment_error text` | The roadmap has `enrichment_status='failed'` but nowhere to record *why*. F3 must distinguish "not an English word" (show the user, offer a correction) from "LLM timed out" (offer retry). One nullable text column, written only on failure. |
| `user_stats.last_card_on date` | `user_stats` is a derived cache "recomputed on card creation". A streak *decays* without any write — if the user's last card was three days ago, `current_streak` must render as 0 today. Without `last_card_on`, `/profile` has to query `daily_cards` on every render, which defeats the point of the cache. F9 reads `last_card_on` + today's local date and decides. |

**Indexes added** (all justified by a query some feature must run):

| Index | Serves |
|---|---|
| `vocab_entries_user_term_uniq` UNIQUE `(user_id, lower(term))` | The roadmap's own `UNIQUE (user_id, lower(term))`, expressed as a functional unique index. Also the lookup path for F3 dedup and F8 Discover dedup. |
| `vocab_entries_selection_idx (user_id, status, last_shown_on ASC NULLS FIRST)` | F5's daily-card selection: `status='active'` ordered by `last_shown_on` ascending, nulls first. Exactly the roadmap's stated ordering. |
| `vocab_entries_user_created_idx (user_id, created_at DESC)` | F4's `/vocab` Mine list, newest first. |
| `daily_cards_user_date_uniq` UNIQUE `(user_id, card_date)` | The roadmap's own uniqueness rule; also the range scan for F5's month calendar. |
| `daily_card_items_card_position_uniq` UNIQUE `(card_id, position)` | The roadmap's own uniqueness rule. |
| `daily_card_items_vocab_idx (vocab_entry_id)` | Cheap; makes the `onDelete: 'restrict'` FK check on `vocab_entries` an index lookup instead of a seq scan. |
| `chat_sessions_user_entry_uniq` UNIQUE `(user_id, vocab_entry_id)` | The roadmap's "one durable session per word". |
| `chat_messages_session_created_idx (session_id, created_at)` | F6 loads a transcript in order on every chat open. |
| `journal_entries_user_created_idx (user_id, created_at DESC)` | F10's journal list. |
| `badges_awarded_uniq` UNIQUE `(user_id, badge_key, awarded_for_date)` | The roadmap's own uniqueness rule — it is what makes badge awarding idempotent. |
| `badges_awarded_user_created_idx (user_id, created_at DESC)` | F9's `/profile` badge wall. |
| `accounts_user_id_idx`, `sessions_user_id_idx` | Auth.js looks accounts and sessions up by `user_id` on every sign-in and every session read. The Auth.js reference schema omits them; on a database-session strategy the `sessions` one is hit on literally every request. |

**FK delete behaviour chosen (not in the roadmap):**

- Everything hanging off `users.id` cascades — deleting a user removes their data.
- `daily_card_items.card_id` → `cascade` (roadmap says so).
- `chat_messages.session_id` → `cascade` (roadmap says so).
- `chat_sessions.vocab_entry_id` → `cascade` — a chat about a deleted word is meaningless.
- **`daily_card_items.vocab_entry_id` → `restrict`.** v0.1.0 retires words with
  `status='mastered'`, never `DELETE`. `restrict` makes that rule enforced by the database
  instead of by convention, and stops a future delete feature from silently punching holes in
  card history. If F4 ever adds a hard delete, it must first decide what happens to history.

---

## 6. Implementation steps

Each step is independently verifiable. Do not batch them.

### Step 1 — Scaffold Next.js 15 into the existing repo

The repo already contains `ROADMAP_v0.1.0.md`, so `create-next-app .` will refuse. Scaffold
into a temp directory and copy in:

```bash
cd /tmp
npx create-next-app@15.5.23 dw-scaffold \
  --typescript --tailwind --eslint --app --use-npm \
  --import-alias "@/*" --disable-git
# Answer "No" if it prompts for `src/` or Turbopack.
cd /tmp/dw-scaffold
rm -rf node_modules .git
cp -R . /home/miftah/daily-words/
cd /home/miftah/daily-words
rm -rf /tmp/dw-scaffold
```

Then:
- Confirm there is **no** `src/` directory. If there is, `mv src/app app` and delete `src/`.
- Delete the scaffold's demo content in `app/page.tsx` and the sample SVGs in `public/`.
- Pin versions in `package.json` (see step 2) and add `"engines": { "node": ">=20.11.0" }`.

**Verify:** `npm install && npm run dev` serves a blank page at `http://localhost:3000`.

### Step 2 — Install and pin dependencies

```bash
npm install \
  next@15.5.23 react@19.2.8 react-dom@19.2.8 \
  drizzle-orm@0.45.2 postgres@3.4.9 \
  next-auth@5.0.0-beta.32 @auth/drizzle-adapter@1.11.3 \
  @anthropic-ai/sdk@0.116.0 zod@4.4.3 server-only@0.0.1

npm install -D \
  drizzle-kit@0.31.10 tailwindcss@4.3.3 @tailwindcss/postcss@4.3.3 \
  typescript@5 @types/node@20 @types/react@19 @types/react-dom@19 \
  dotenv@17 tsx@4
```

Version notes that matter:

- **Next 15.5.23, not 16.** The roadmap locks Next.js 15. `next@latest` is 16.x — do not use it.
- **`next-auth@5.0.0-beta.32`** is Auth.js v5. Pin the exact beta; betas break between patches.
- **zod 4.** Note the v4 API: `z.email()` / `z.uuid()` are top-level, not
  `z.string().email()`. Every feature validates with zod 4 — do not mix v3 idioms.
- **`postgres` (postgres.js), not `@neondatabase/serverless`.** See §10 for the reasoning:
  the HTTP driver cannot do interactive transactions, and F5 (card + items + stats + badges)
  and F9 need them.
- **`@anthropic-ai/sdk@0.116.0`** — used only as an HTTP client for an Anthropic-compatible
  endpoint. Do not reach for Anthropic-model-specific request fields (see step 8).

**Verify:** `npm ls next next-auth drizzle-orm @anthropic-ai/sdk zod` prints the pinned versions.

### Step 3 — Tailwind v4 pipeline and layout CSS variables

`postcss.config.mjs`:

```js
export default { plugins: { '@tailwindcss/postcss': {} } }
```

`app/globals.css` — Tailwind v4 is CSS-first; there is **no `tailwind.config.js`**.
F1 defines only the layout variables the shell and F5 depend on. F2 owns everything else
(colour, type scale, spacing tokens) and will add `@theme` here.

```css
@import "tailwindcss";

:root {
  /* Owned by F1. F2 may restyle but must not remove these names. */
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --header-height: 48px;
  --tab-bar-height: 56px;

  /* The height a full-bleed screen body may occupy between header and tab bar.
     F5's six-word card MUST fit inside this without scrolling at 375px wide. */
  --card-viewport-height: calc(
    100dvh - var(--safe-top) - var(--header-height)
           - var(--tab-bar-height) - var(--safe-bottom)
  );
}

html, body { height: 100%; }
body {
  overscroll-behavior-y: none;          /* kill iOS rubber-banding on the shell */
  -webkit-tap-highlight-color: transparent;
}
```

`100dvh` (dynamic viewport height) is deliberate: it tracks the iOS Safari URL bar
collapsing, which `100vh` does not. This is the whole reason the roadmap rules out modals.

**Verify:** add `class="text-red-500"` to something, see red; then remove it.

### Step 4 — Env var handling

`.env.example` (committed):

```bash
DATABASE_URL=postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
LLM_BASE_URL=https://api.z.ai/api/anthropic
LLM_MODEL=glm-4.6
LLM_API_KEY=
```

`lib/env.ts`:

```ts
import 'server-only'
import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(1),
  AUTH_GOOGLE_ID: z.string().min(1),
  AUTH_GOOGLE_SECRET: z.string().min(1),
  LLM_BASE_URL: z.url(),                  // zod 4 top-level
  LLM_MODEL: z.string().min(1),
  LLM_API_KEY: z.string().min(1),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  throw new Error(
    'Invalid environment variables:\n' +
      JSON.stringify(z.treeifyError(parsed.error), null, 2),
  )
}
export const env = parsed.data
```

Notes:
- `import 'server-only'` makes any accidental client import a **build error**. This is the
  mechanism that satisfies the roadmap's "the API key must never reach the client".
- `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` use exactly the names Auth.js v5 reads
  automatically, so `auth.ts` does not have to pass them explicitly. `lib/env.ts` validates
  them anyway so a missing one fails at boot rather than at first sign-in.
- `.env.local` holds the real values and is gitignored. `AUTH_SECRET` comes from
  `npx auth secret` (or `openssl rand -base64 32`).
- **Do not add `NEXT_PUBLIC_` to anything.** No F1 value belongs in the browser bundle.

**Verify:** temporarily blank `LLM_API_KEY` in `.env.local`, run `npm run dev`, hit any page,
see the thrown error naming the variable. Restore it.

### Step 5 — Database client

`lib/db/index.ts`:

```ts
import 'server-only'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '@/lib/env'
import * as schema from '@/lib/db/schema'

// Reuse the client across hot reloads in dev; serverless invocations reuse it per instance.
const globalForDb = globalThis as unknown as { __sql?: ReturnType<typeof postgres> }

const client =
  globalForDb.__sql ??
  postgres(env.DATABASE_URL, {
    max: 1,            // one socket per serverless instance; Neon's pooler fans out
    prepare: false,    // required when talking to a PgBouncer-style pooler
    idle_timeout: 20,
  })

if (process.env.NODE_ENV !== 'production') globalForDb.__sql = client

export const db = drizzle(client, { schema })
export type Db = typeof db
```

`DATABASE_URL` **must be Neon's pooled connection string** — the host contains `-pooler`.
`prepare: false` is mandatory against the pooler; without it you get random
`prepared statement "sN" already exists` errors under concurrency.

**Verify:** after step 6's migration, `npm run db:studio` opens and lists all ten+ tables.

### Step 6 — Schema and first migration

1. Write `lib/db/schema.ts` exactly as §5.2.
2. Write `lib/db/types.ts`:

```ts
import type {
  users, profiles, vocabEntries, dailyCards, dailyCardItems,
  chatSessions, chatMessages, journalEntries, userStats, badgesAwarded,
} from '@/lib/db/schema'

export type User = typeof users.$inferSelect
export type Profile = typeof profiles.$inferSelect
export type NewProfile = typeof profiles.$inferInsert
export type VocabEntry = typeof vocabEntries.$inferSelect
export type NewVocabEntry = typeof vocabEntries.$inferInsert
export type DailyCard = typeof dailyCards.$inferSelect
export type DailyCardItem = typeof dailyCardItems.$inferSelect
export type ChatSession = typeof chatSessions.$inferSelect
export type ChatMessage = typeof chatMessages.$inferSelect
export type JournalEntry = typeof journalEntries.$inferSelect
export type NewJournalEntry = typeof journalEntries.$inferInsert
export type UserStats = typeof userStats.$inferSelect
export type BadgeAward = typeof badgesAwarded.$inferSelect

export type VocabSource = VocabEntry['source']            // 'manual' | 'suggested'
export type VocabStatus = VocabEntry['status']            // 'active' | 'mastered'
export type EnrichmentStatus = VocabEntry['enrichmentStatus']
export type InsightStatus = JournalEntry['insightStatus']
export type ChatTone = NonNullable<Profile['chatTone']>   // 'patient'|'blunt'|'playful'
export type ChatRole = ChatMessage['role']                // 'user' | 'assistant'
```

3. `npm run db:generate`, inspect `drizzle/0000_*.sql` (especially the `lower(term)` index —
   see §5.3), then `npm run db:migrate`.

**Verify:** `npm run db:studio` shows `users`, `accounts`, `sessions`, `verification_tokens`,
`profiles`, `vocab_entries`, `daily_cards`, `daily_card_items`, `chat_sessions`,
`chat_messages`, `journal_entries`, `user_stats`, `badges_awarded` — 13 tables.

### Step 7 — The timezone helper

This is the single most-depended-on module in F1. Write it before auth; F5, F9 and every
badge rule are written against these exact signatures.

`lib/time/local-date.ts`:

```ts
/**
 * The user-local calendar date, as 'YYYY-MM-DD'.
 * This is the ONLY representation of a "day" in this app. Postgres `date` columns
 * (card_date, last_shown_on, awarded_for_date, first_card_on, last_card_on) map to it
 * 1:1 because they are declared with { mode: 'string' }.
 *
 * Never derive a day boundary from a JS Date's local getters, and never from UTC.
 */
export type LocalDate = string

export const DEFAULT_TIMEZONE = 'Asia/Jakarta'

/** Zone-aware calendar/clock parts for an instant. */
type ZonedParts = {
  year: number; month: number; day: number
  hour: number; minute: number; second: number
}

function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',                 // NOT hour12:false — that yields "24" at midnight
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p = Object.fromEntries(
    fmt.formatToParts(instant).map((x) => [x.type, x.value]),
  ) as Record<string, string>
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day),
    hour: Number(p.hour), minute: Number(p.minute), second: Number(p.second),
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

/** Local hour of day, 0–23. Drives the `midnight_oil` badge (00:00–04:00 local). */
export function localHour(instant: Date, timeZone: string): number {
  return zonedParts(instant, timeZone).hour
}

/** Day of week for a LocalDate: 0 = Sunday … 6 = Saturday. Locale-independent. */
export function localDayOfWeek(date: LocalDate): number {
  const { year, month, day } = parseLocalDate(date)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

export function parseLocalDate(date: LocalDate): {
  year: number; month: number; day: number
} {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) throw new Error(`Not a LocalDate: ${date}`)
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
}

/**
 * Calendar arithmetic on LocalDate. Anchored in UTC on purpose: a LocalDate has no
 * time and no offset, so DST can never apply to it. Adding 1 day to '2026-03-08'
 * is always '2026-03-09', in every zone.
 */
export function addLocalDays(date: LocalDate, days: number): LocalDate {
  const { year, month, day } = parseLocalDate(date)
  const d = new Date(Date.UTC(year, month - 1, day))
  d.setUTCDate(d.getUTCDate() + days)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** Whole days from `from` to `to`. Positive when `to` is later. Streak arithmetic. */
export function diffLocalDays(from: LocalDate, to: LocalDate): number {
  const a = parseLocalDate(from), b = parseLocalDate(to)
  const ms =
    Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)
  return Math.round(ms / 86_400_000)
}

export function compareLocalDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0   // lexicographic ordering is correct for YYYY-MM-DD
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
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

/** Validate an IANA identifier. F7 uses this on the value it captures from the browser. */
export function isValidTimeZone(tz: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true }
  catch { return false }
}
```

Rules other features must follow (state these in their plans):

- **Never** call `new Date().toISOString().slice(0, 10)`. That is UTC, not the user's day.
- **Never** call `date.getDate()` / `getDay()` on a server-side `Date` to decide a day
  boundary — Vercel runs UTC, the user does not.
- Get the timezone from `getUserTimezone(userId)` (§6 step 10), pass it in explicitly.
  No module-level "current user timezone" global.
- `localHour()` takes an **instant** (the moment the card was created). `localDayOfWeek()`
  takes a **LocalDate** (the card's date). They are deliberately different shapes.

**Verify:** run `npx tsx -e` with the snippet in §9.4 and compare against the expected output.

### Step 8 — The shared LLM client

**The endpoint is verified working:** `POST https://api.z.ai/api/anthropic/v1/messages`,
headers `x-api-key` and `anthropic-version: 2023-06-01`, model `glm-4.6`.

The Anthropic TS SDK appends `/v1/messages` to `baseURL`, sends `x-api-key` from `apiKey`,
and sends `anthropic-version: 2023-06-01` automatically. So with
`LLM_BASE_URL=https://api.z.ai/api/anthropic` the SDK reproduces the verified curl exactly.
**Do not include `/v1` in `LLM_BASE_URL`** — that is the number-one way to get a 404 here.

`lib/llm/client.ts`:

```ts
import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { env } from '@/lib/env'

/** The ONE SDK instance. No feature may construct its own. */
export const llm = new Anthropic({
  apiKey: env.LLM_API_KEY,
  baseURL: env.LLM_BASE_URL,   // https://api.z.ai/api/anthropic  → SDK appends /v1/messages
  maxRetries: 1,               // transport-level only (429/5xx/network). NOT the parse retry.
  timeout: 55_000,             // under Vercel's 60s function ceiling
})

export const LLM_MODEL = env.LLM_MODEL   // glm-4.6
```

Constraints on every call, everywhere:

- Send only the portable Messages-API fields: `model`, `max_tokens`, `system`, `messages`,
  `temperature`, `stop_sequences`. **Do not send** `thinking`, `output_config`, `effort`,
  `cache_control`, `betas`, `speed`, `fallbacks`, or `container` — those are
  Anthropic-model features and z.ai's compatible endpoint does not implement them.
- `system` is a plain string.
- Server-side only. Every call site is a route handler or a server action.

`lib/llm/errors.ts`:

```ts
export type LlmErrorKind = 'transport' | 'parse' | 'empty' | 'config'

export type LlmError = {
  kind: LlmErrorKind
  /** For the server log. May contain raw model output. Never render this. */
  detail: string
  /** Short, terse, dictionary-register. Safe to render. */
  message: string
}

export const USER_MESSAGES: Record<LlmErrorKind, string> = {
  transport: 'The word service is unreachable. Try again.',
  parse: 'The reply came back malformed. Try again.',
  empty: 'No reply came back. Try again.',
  config: 'The word service is misconfigured.',
}

export function llmError(kind: LlmErrorKind, detail: string): LlmError {
  return { kind, detail, message: USER_MESSAGES[kind] }
}
```

`lib/llm/json.ts` — the core. **Exactly one retry on parse/validation failure, then fail.**

```ts
import 'server-only'
import { z } from 'zod'   // value import — z.treeifyError() is used below
import { llm, LLM_MODEL } from '@/lib/llm/client'
import { llmError, type LlmError } from '@/lib/llm/errors'
import type { PromptModule } from '@/lib/llm/prompts/types'

export type LlmResult<T> =
  | { ok: true; data: T; raw: string }
  | { ok: false; error: LlmError }

/** Pull a JSON object/array out of a reply that may be fenced or padded with prose. */
export function extractJson(raw: string): string | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw)
  const body = (fenced ? fenced[1] : raw).trim()
  const start = body.search(/[{[]/)
  if (start === -1) return null
  const open = body[start], close = open === '{' ? '}' : ']'
  const end = body.lastIndexOf(close)
  if (end <= start) return null
  return body.slice(start, end + 1)
}

export type GenerateJsonOptions<T> = {
  /** Short stable id for logs, e.g. 'vocab.enrich'. */
  label: string
  schema: z.ZodType<T>
  system: string
  /** The user turn. Everything variable goes here, not in `system`. */
  prompt: string
  maxTokens?: number      // default 1024
  temperature?: number    // default 0.3
}

export async function generateJson<T>(o: GenerateJsonOptions<T>): Promise<LlmResult<T>> {
  const messages: { role: 'user' | 'assistant'; content: string }[] = [
    { role: 'user', content: o.prompt },
  ]

  // attempt 0 = first try, attempt 1 = the ONE retry. No third attempt, ever.
  for (let attempt = 0; attempt <= 1; attempt++) {
    let raw: string
    try {
      const res = await llm.messages.create({
        model: LLM_MODEL,
        max_tokens: o.maxTokens ?? 1024,
        temperature: o.temperature ?? 0.3,
        system: o.system,
        messages,
      })
      raw = res.content
        .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim()
    } catch (err) {
      // Transport failures are NOT retried here — the SDK already retried once.
      console.error(`[llm:${o.label}] transport`, err)
      return { ok: false, error: llmError('transport', String(err)) }
    }

    if (!raw) return { ok: false, error: llmError('empty', 'no text blocks in reply') }

    const slice = extractJson(raw)
    let problem: string
    if (!slice) {
      problem = 'no JSON object found in the reply'
    } else {
      try {
        const parsed = o.schema.safeParse(JSON.parse(slice))
        if (parsed.success) return { ok: true, data: parsed.data, raw }
        problem = JSON.stringify(z.treeifyError(parsed.error))
      } catch (e) {
        problem = `JSON.parse failed: ${String(e)}`
      }
    }

    console.warn(`[llm:${o.label}] attempt ${attempt} bad output: ${problem}`)
    if (attempt === 1) return { ok: false, error: llmError('parse', problem) }

    // The single retry: show the model its own output and the exact complaint.
    messages.push({ role: 'assistant', content: raw })
    messages.push({
      role: 'user',
      content:
        `That reply was rejected: ${problem}\n` +
        `Reply again with the JSON only. No prose, no code fences, no explanation.`,
    })
  }

  return { ok: false, error: llmError('parse', 'unreachable') }
}

/** Run a prompt module. This is what feature code should call. */
export function runPrompt<TIn, TOut>(
  mod: PromptModule<TIn, TOut>,
  input: TIn,
): Promise<LlmResult<TOut>> {
  return generateJson({
    label: mod.label,
    schema: mod.schema,
    system: typeof mod.system === 'function' ? mod.system(input) : mod.system,
    prompt: mod.user(input),
    maxTokens: mod.maxTokens,
    temperature: mod.temperature,
  })
}
```

`lib/llm/text.ts` — plain text, multi-turn. F6's chat needs this; there is no JSON to parse
and therefore no retry.

```ts
import 'server-only'
import { llm, LLM_MODEL } from '@/lib/llm/client'
import { llmError, type LlmError } from '@/lib/llm/errors'

export type LlmMessage = { role: 'user' | 'assistant'; content: string }

export type GenerateTextOptions = {
  label: string
  system: string
  messages: LlmMessage[]     // must start with 'user' and alternate
  maxTokens?: number         // default 512 — chat turns are short by design
  temperature?: number       // default 0.7
}

export async function generateText(
  o: GenerateTextOptions,
): Promise<{ ok: true; text: string } | { ok: false; error: LlmError }> {
  try {
    const res = await llm.messages.create({
      model: LLM_MODEL,
      max_tokens: o.maxTokens ?? 512,
      temperature: o.temperature ?? 0.7,
      system: o.system,
      messages: o.messages,
    })
    const text = res.content
      .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text).join('').trim()
    if (!text) return { ok: false, error: llmError('empty', 'no text blocks') }
    return { ok: true, text }
  } catch (err) {
    console.error(`[llm:${o.label}] transport`, err)
    return { ok: false, error: llmError('transport', String(err)) }
  }
}
```

`lib/llm/prompts/types.ts`:

```ts
import type { z } from 'zod'

/**
 * Every feature adds ONE file under lib/llm/prompts/ exporting one of these.
 * Nothing else about LLM access is a feature's business.
 */
export type PromptModule<TInput, TOutput> = {
  /** Stable log id: '<feature>.<action>', e.g. 'vocab.enrich', 'journal.insight'. */
  label: string
  /** Zod schema the reply must satisfy. Keep it flat and small. */
  schema: z.ZodType<TOutput>
  /** Constant instructions. Must not interpolate per-request data. */
  system: string | ((input: TInput) => string)
  /** The user turn. All per-request data goes here. */
  user: (input: TInput) => string
  maxTokens: number
  temperature?: number
}
```

`lib/llm/prompts/shared.ts`:

```ts
/** Register shared by every prompt in the app. Terse on purpose — LLM text sprawls. */
export const BASE_STYLE = [
  'You write in English, in the register of a dictionary: plain, precise, unfussy.',
  'No preamble. No apologies. No meta-commentary about being an AI.',
  'Short is correct. One line means one line.',
].join(' ')

/** Append to any system prompt whose reply must be machine-read. */
export function jsonOnly(shape: string): string {
  return [
    'Reply with a single JSON object and nothing else.',
    'No code fences. No prose before or after.',
    `Shape: ${shape}`,
  ].join(' ')
}
```

`lib/llm/index.ts` — the barrel other features import from:

```ts
export { llm, LLM_MODEL } from '@/lib/llm/client'
export { generateJson, runPrompt, extractJson, type LlmResult } from '@/lib/llm/json'
export { generateText, type LlmMessage } from '@/lib/llm/text'
export { type LlmError, type LlmErrorKind, USER_MESSAGES } from '@/lib/llm/errors'
export { type PromptModule } from '@/lib/llm/prompts/types'
export { BASE_STYLE, jsonOnly } from '@/lib/llm/prompts/shared'
```

`scripts/check-llm.ts`:

```ts
import 'dotenv/config'
import { z } from 'zod'
import { generateJson } from '../lib/llm/json'

const schema = z.object({ word: z.string(), definition: z.string() })

const r = await generateJson({
  label: 'smoke',
  schema,
  system: 'You are a dictionary.',
  prompt: 'Return JSON: {"word":"genteel","definition":"one short line"}. JSON only.',
  maxTokens: 200,
})
console.log(r.ok ? r.data : r.error)
process.exit(r.ok ? 0 : 1)
```

**Verify:** `npx tsx scripts/check-llm.ts` prints `{ word: 'genteel', definition: '…' }`.

### Step 9 — Auth.js v5, Google only, database sessions

`auth.ts` (repo root):

```ts
import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { db } from '@/lib/db'
import { accounts, sessions, users, verificationTokens } from '@/lib/db/schema'
import { ensureProfile } from '@/lib/db/queries/profiles'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: 'database', maxAge: 60 * 60 * 24 * 90 },  // 90 days
  providers: [Google],           // reads AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET
  trustHost: true,
  pages: { signIn: '/signin' },
  callbacks: {
    // Database strategy: the callback gets the DB user row. Surface its id.
    session({ session, user }) {
      session.user.id = user.id
      return session
    },
  },
  events: {
    // Guarantee every user has a profile row from the first moment, so
    // getUserTimezone() is total and F5/F9 never carry a null branch.
    async createUser({ user }) {
      if (user.id) await ensureProfile(user.id)
    },
  },
})
```

`app/api/auth/[...nextauth]/route.ts`:

```ts
export { GET, POST } from '@/auth'   // re-export handlers
```
(or `import { handlers } from '@/auth'; export const { GET, POST } = handlers`)

`types/next-auth.d.ts`:

```ts
import type { DefaultSession } from 'next-auth'
declare module 'next-auth' {
  interface Session {
    user: { id: string } & DefaultSession['user']
  }
}
export {}
```

`lib/auth/session.ts`:

```ts
import 'server-only'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'

export type SessionUser = {
  id: string
  name: string | null
  email: string
  image: string | null
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth()
  if (!session?.user?.id || !session.user.email) return null
  return {
    id: session.user.id,
    name: session.user.name ?? null,
    email: session.user.email,
    image: session.user.image ?? null,
  }
}

/** For server components and server actions. Redirects when unauthenticated. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) redirect('/signin')
  return user
}
```

Google Cloud Console setup — the authorised redirect URIs must include **both**:

```
http://localhost:3000/api/auth/callback/google
https://<your-vercel-domain>/api/auth/callback/google
```

**Verify:** `npm run dev`, visit `/`, get bounced to `/signin`, sign in with Google, land on
`/today`. `npm run db:studio` shows one row each in `users`, `accounts`, `sessions`,
`profiles`.

### Step 10 — Profile queries and the `lib/db/queries/` convention

`lib/db/queries/profiles.ts`:

```ts
import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { profiles } from '@/lib/db/schema'
import { DEFAULT_TIMEZONE } from '@/lib/time/local-date'
import type { Profile } from '@/lib/db/types'

export async function getProfile(userId: string): Promise<Profile | null> {
  const [row] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1)
  return row ?? null
}

/** Total by construction: every user gets a row at createUser. */
export async function getUserTimezone(userId: string): Promise<string> {
  const p = await getProfile(userId)
  return p?.timezone ?? DEFAULT_TIMEZONE
}

/** Idempotent. Called from the Auth.js createUser event. */
export async function ensureProfile(userId: string): Promise<void> {
  await db.insert(profiles).values({ userId }).onConflictDoNothing()
}

export async function upsertProfile(
  userId: string,
  patch: Partial<Omit<Profile, 'userId' | 'createdAt'>>,
): Promise<Profile> {
  const [row] = await db
    .insert(profiles)
    .values({ userId, ...patch })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: { ...patch, updatedAt: new Date() },
    })
    .returning()
  return row
}
```

**The `lib/db/queries/` convention** (nine other plans must follow it):

1. One file per resource: `profiles.ts`, `vocab.ts`, `cards.ts`, `chat.ts`, `journal.ts`,
   `stats.ts`, `badges.ts`.
2. Every file starts with `import 'server-only'`.
3. Every function that touches user data takes `userId: string` as its **first parameter**,
   and every `WHERE` clause includes it. There is no ambient current user in this layer.
4. Functions return plain rows / arrays / `null`. No `Response`, no `redirect`, no throwing
   for control flow. Callers decide the HTTP shape.
5. **Components and route handlers do not build Drizzle queries inline.** If a page needs a
   query that doesn't exist, add it to the resource file.
6. Anything writing more than one table wraps in `db.transaction(async (tx) => …)` —
   this is why we use postgres.js and not the Neon HTTP driver.

### Step 11 — Route protection

Two layers, deliberately:

**Layer 1 — `middleware.ts` (optimistic, cookie presence only).**

Database sessions cannot be validated in Edge middleware: validating means a DB round-trip
through the adapter, which does not run on Edge with postgres.js. So middleware performs a
cheap redirect based on cookie presence and nothing more. It is a UX shortcut, **not** a
security boundary.

```ts
import { NextResponse, type NextRequest } from 'next/server'

const SESSION_COOKIES = ['authjs.session-token', '__Secure-authjs.session-token']

export function middleware(req: NextRequest) {
  const hasCookie = SESSION_COOKIES.some((n) => req.cookies.has(n))
  const { pathname } = req.nextUrl

  if (!hasCookie && pathname !== '/signin') {
    return NextResponse.redirect(new URL('/signin', req.url))
  }
  if (hasCookie && pathname === '/signin') {
    return NextResponse.redirect(new URL('/today', req.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: [
    // everything except Next internals, the auth endpoints, and static assets
    '/((?!api/auth|_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|apple-icon|icon).*)',
  ],
}
```

**Layer 2 — the real check, server side.**

- Every page under `app/(app)/` inherits `app/(app)/layout.tsx`, which calls `requireUser()`.
- Every route handler under `app/api/` calls `requireApiUser()`.

A stale or forged cookie sails through middleware and is rejected here.

`lib/api/guards.ts`:

```ts
import 'server-only'
import { getSessionUser, type SessionUser } from '@/lib/auth/session'
import { fail } from '@/lib/api/respond'

export async function requireApiUser(): Promise<
  { ok: true; user: SessionUser } | { ok: false; response: Response }
> {
  const user = await getSessionUser()
  if (!user) return { ok: false, response: fail(401, 'Not signed in', 'unauthenticated') }
  return { ok: true, user }
}
```

### Step 12 — API conventions

`lib/api/respond.ts`:

```ts
import 'server-only'
import type { z } from 'zod'

export type ApiError = { error: { code: string; message: string } }

export function ok<T>(data: T, status = 200): Response {
  return Response.json(data as object, { status })
}

export function fail(status: number, message: string, code = 'bad_request'): Response {
  return Response.json({ error: { code, message } } satisfies ApiError, { status })
}

/** Parse + validate a JSON body. Returns a ready-made 400 on failure. */
export async function readJson<T>(
  req: Request,
  schema: z.ZodType<T>,
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  let body: unknown
  try { body = await req.json() }
  catch { return { ok: false, response: fail(400, 'Body must be JSON', 'invalid_json') } }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return {
      ok: false,
      response: fail(400, parsed.error.issues[0]?.message ?? 'Invalid request', 'invalid_body'),
    }
  }
  return { ok: true, data: parsed.data }
}
```

Every route handler in `app/api/` follows this template:

```ts
// app/api/<resource>/route.ts
import { requireApiUser } from '@/lib/api/guards'
import { ok, fail, readJson } from '@/lib/api/respond'

export const runtime = 'nodejs'
export const maxDuration = 60      // REQUIRED on any route that calls the LLM

export async function POST(req: Request) {
  const authed = await requireApiUser()
  if (!authed.ok) return authed.response
  const body = await readJson(req, Schema)
  if (!body.ok) return body.response
  // … lib/db/queries/* and lib/llm/* only
  return ok({ /* … */ })
}
```

`export const maxDuration = 60` matters: Vercel's Hobby plan defaults Node functions to a
10-second ceiling, and a GLM call routinely exceeds that. Every LLM-calling route must
declare it. `runtime = 'nodejs'` is required because postgres.js does not run on Edge.

### Step 13 — App shell, tab bar, safe areas

`app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Daily Words',
  description: 'A pocket vocabulary card.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Daily Words', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,          // stop iOS zooming on input focus
  viewportFit: 'cover',     // <-- required for env(safe-area-inset-*) to be non-zero
  themeColor: '#ffffff',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-white text-neutral-900 antialiased">{children}</body>
    </html>
  )
}
```

`viewportFit: 'cover'` is the one line without which `env(safe-area-inset-bottom)` is
always `0px` and the tab bar sits under the iPhone home indicator.

`app/(app)/layout.tsx`:

```tsx
import { requireUser } from '@/lib/auth/session'
import { AppHeader } from '@/components/app-header'
import { TabBar } from '@/components/nav/tab-bar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser()   // authoritative guard
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main
        className="flex-1 overflow-y-auto"
        style={{
          paddingTop: 'var(--header-height)',
          paddingBottom: 'calc(var(--tab-bar-height) + var(--safe-bottom))',
        }}
      >
        {children}
      </main>
      <TabBar />
    </div>
  )
}
```

`components/nav/tab-bar.tsx` — exactly four items, in this order. No hamburger, no drawer.

```tsx
import { TabBarLink } from './tab-bar-link'

const TABS = [
  { href: '/today',   label: 'Today' },
  { href: '/vocab',   label: 'Vocab' },
  { href: '/journal', label: 'Journal' },
  { href: '/profile', label: 'Profile' },
] as const

export function TabBar() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-neutral-200 bg-white/95 backdrop-blur"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <ul className="grid grid-cols-4" style={{ height: 'var(--tab-bar-height)' }}>
        {TABS.map((t) => (
          <li key={t.href} className="contents">
            <TabBarLink href={t.href} label={t.label} />
          </li>
        ))}
      </ul>
    </nav>
  )
}
```

`components/nav/tab-bar-link.tsx` is a client component using `usePathname()` for the active
state (`pathname === href || pathname.startsWith(href + '/')`), so `/vocab/[id]` keeps Vocab lit.

**Handoff to F2:** F2 owns the visual treatment of `TabBar`, `TabBarLink`, and `AppHeader`
(icons, type, colour, active indicator). F2 must preserve: the four hrefs and their order,
the `--tab-bar-height` / `--safe-bottom` padding contract, and the `fixed inset-x-0 bottom-0`
positioning that `--card-viewport-height` is computed against.

### Step 14 — Sign-in and placeholder pages

- `app/page.tsx`: server component, `const user = await getSessionUser()`, then
  `redirect(user ? '/today' : '/signin')`.
- `app/signin/page.tsx`: one heading, one sentence, one button. No tab bar (it lives outside
  the `(app)` group).
- `app/signin/sign-in-button.tsx`: client component whose `<form action={…}>` calls a server
  action that runs `await signIn('google', { redirectTo: '/today' })`.
- Four placeholder pages, each rendering its own name and a note that feature Fn owns it.
  `/profile` additionally renders a sign-out form calling `signOut({ redirectTo: '/signin' })`
  — needed to test the auth loop end to end.

### Step 15 — PWA manifest and icons

`public/manifest.webmanifest`:

```json
{
  "name": "Daily Words",
  "short_name": "Daily Words",
  "description": "A pocket vocabulary card.",
  "start_url": "/today",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#ffffff",
  "theme_color": "#ffffff",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

Icons: a plain square, off-white ground, a single dark glyph (a "W" or a card outline).
F2 may replace the artwork; the filenames and sizes are fixed by this manifest.

`app/apple-icon.png` (180×180) and `app/icon.png` (512×512) are Next.js file conventions —
Next emits `<link rel="apple-touch-icon">` and the favicon automatically. Do **not** hand-write
those `<link>` tags in `app/layout.tsx`; you will end up with duplicates.

`display: standalone` + `start_url: /today` means adding to the Home Screen opens straight
onto the card, chrome-free — which is the whole point of the ritual.

Explicitly **no service worker**. The roadmap rules out offline caching "beyond the bare PWA
manifest". A `sw.js` here would be scope creep and a caching-bug generator.

### Step 16 — Deploy to Vercel

1. `git add -A && git commit` and push to the remote.
2. Import the repo in Vercel. Framework preset: Next.js. Build command default.
3. Set Node version to 20.x in Project Settings → General (see §10).
4. Add environment variables for **Production, Preview and Development**:
   `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`,
   `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`.
5. Add `https://<domain>/api/auth/callback/google` to the Google OAuth client's authorised
   redirect URIs, and `https://<domain>` to authorised JavaScript origins.
6. Deploy.
7. Migrations are **not** run by the Vercel build. Run `npm run db:migrate` from the local
   machine against the same `DATABASE_URL`. There is one database; local and production share
   it in v0.1.0. (Do not add `db:migrate` to the build command — a failed migration would then
   take the site down.)

**Verify:** open the production URL on an actual iPhone, sign in, add to Home Screen, confirm
the tab bar clears the home indicator.

---

## 7. Shared contracts this feature exports

Nine plans are written against this section. Paths and signatures are binding.

### 7.1 Time — `@/lib/time/local-date`

```ts
type LocalDate = string                                   // 'YYYY-MM-DD'
const DEFAULT_TIMEZONE = 'Asia/Jakarta'

function toLocalDate(instant: Date, timeZone: string): LocalDate
function localDateNow(timeZone: string, now?: Date): LocalDate
function localHour(instant: Date, timeZone: string): number            // 0–23
function localDayOfWeek(date: LocalDate): number                       // 0=Sun … 6=Sat
function parseLocalDate(date: LocalDate): { year: number; month: number; day: number }
function addLocalDays(date: LocalDate, days: number): LocalDate
function diffLocalDays(from: LocalDate, to: LocalDate): number
function compareLocalDates(a: LocalDate, b: LocalDate): number
function localDateRange(from: LocalDate, to: LocalDate): LocalDate[]
function localMonthBounds(date: LocalDate): { start: LocalDate; end: LocalDate }
function formatLocalDateLong(date: LocalDate): string                  // "8 August 2026"
function isValidTimeZone(tz: string): boolean
```

Usage rules:

- The canonical "what day is it for this user" call is
  `localDateNow(await getUserTimezone(userId))`. F5 uses it for `daily_cards.card_date`;
  F9 uses it for `awarded_for_date` and for streak decay.
- `localHour(new Date(), tz)` is the `midnight_oil` badge test (`< 4`).
- `localDayOfWeek(cardDate)` is the `sunday` (`=== 0`) and `fathers_day` test.
- `LocalDate` is string-comparable; `a < b` is correct chronological ordering.
- Postgres `date` columns already return `LocalDate` strings. No conversion at the boundary.

### 7.2 Database — `@/lib/db`, `@/lib/db/schema`, `@/lib/db/types`

```ts
import { db } from '@/lib/db'                 // Drizzle instance; db.transaction() works
import * as schema from '@/lib/db/schema'     // every table (see §5.2)
import type { VocabEntry, Profile, /* … */ } from '@/lib/db/types'
```

Table exports: `users`, `accounts`, `sessions`, `verificationTokens`, `profiles`,
`vocabEntries`, `dailyCards`, `dailyCardItems`, `chatSessions`, `chatMessages`,
`journalEntries`, `userStats`, `badgesAwarded`.

Type exports: `User`, `Profile`, `NewProfile`, `VocabEntry`, `NewVocabEntry`, `DailyCard`,
`DailyCardItem`, `ChatSession`, `ChatMessage`, `JournalEntry`, `NewJournalEntry`,
`UserStats`, `BadgeAward`, `VocabSource`, `VocabStatus`, `EnrichmentStatus`,
`InsightStatus`, `ChatTone`, `ChatRole`.

### 7.3 Profile queries — `@/lib/db/queries/profiles`

```ts
function getProfile(userId: string): Promise<Profile | null>
function getUserTimezone(userId: string): Promise<string>   // never null; defaults
function ensureProfile(userId: string): Promise<void>       // idempotent
function upsertProfile(
  userId: string,
  patch: Partial<Omit<Profile, 'userId' | 'createdAt'>>,
): Promise<Profile>
```

F7 extends this file rather than creating a parallel one.

### 7.4 Auth — `@/auth`, `@/lib/auth/session`, `@/lib/api/guards`

```ts
// @/auth
export const handlers: { GET: …; POST: … }
export const auth: () => Promise<Session | null>
export const signIn: …
export const signOut: …

// @/lib/auth/session
type SessionUser = { id: string; name: string | null; email: string; image: string | null }
function getSessionUser(): Promise<SessionUser | null>
function requireUser(): Promise<SessionUser>        // redirects to /signin

// @/lib/api/guards
function requireApiUser(): Promise<
  { ok: true; user: SessionUser } | { ok: false; response: Response }
>
```

`SessionUser.id` is `users.id` and is the `userId` every query function expects.

### 7.5 API helpers — `@/lib/api/respond`

```ts
type ApiError = { error: { code: string; message: string } }
function ok<T>(data: T, status?: number): Response
function fail(status: number, message: string, code?: string): Response
function readJson<T>(req: Request, schema: z.ZodType<T>):
  Promise<{ ok: true; data: T } | { ok: false; response: Response }>
```

Route-handler requirements (binding on all features):
`export const runtime = 'nodejs'`, and `export const maxDuration = 60` on any route
that calls the LLM.

### 7.6 LLM — `@/lib/llm`

```ts
type LlmResult<T> = { ok: true; data: T; raw: string } | { ok: false; error: LlmError }
type LlmError = { kind: 'transport' | 'parse' | 'empty' | 'config'; detail: string; message: string }
type LlmMessage = { role: 'user' | 'assistant'; content: string }

type PromptModule<TInput, TOutput> = {
  label: string
  schema: z.ZodType<TOutput>
  system: string | ((input: TInput) => string)
  user: (input: TInput) => string
  maxTokens: number
  temperature?: number
}

function runPrompt<TIn, TOut>(mod: PromptModule<TIn, TOut>, input: TIn): Promise<LlmResult<TOut>>
function generateJson<T>(o: {
  label: string; schema: z.ZodType<T>; system: string; prompt: string
  maxTokens?: number; temperature?: number
}): Promise<LlmResult<T>>
function generateText(o: {
  label: string; system: string; messages: LlmMessage[]
  maxTokens?: number; temperature?: number
}): Promise<{ ok: true; text: string } | { ok: false; error: LlmError }>
function extractJson(raw: string): string | null

const BASE_STYLE: string
function jsonOnly(shape: string): string
const llm: Anthropic       // escape hatch; do not use without a reason
const LLM_MODEL: string
```

Rules for every feature:

1. Add exactly one file at `lib/llm/prompts/<feature>.ts` exporting a `PromptModule`.
   Call it through `runPrompt`. Never construct an `Anthropic` client.
2. Never call `runPrompt` / `generateText` from a client component or a page render.
   Route handlers and server actions only.
3. On `{ ok: false }`, render `error.message` — it is already short and safe.
   Log `error.detail`; never render it.
4. Persist every displayed LLM output to the database on the write path.
   Detail pages, examples and insights read from Postgres, never from a live call.
5. There is one retry, inside `generateJson`. Do not add another loop on top.

### 7.7 Layout / CSS contract

CSS custom properties defined in `app/globals.css`, available everywhere:

| Variable | Meaning |
|---|---|
| `--safe-top` / `--safe-bottom` | `env(safe-area-inset-*)` with `0px` fallback |
| `--header-height` | Fixed app header height (48px in F1) |
| `--tab-bar-height` | Tab bar height excluding the safe-area pad (56px in F1) |
| `--card-viewport-height` | Usable height between header and tab bar, from `100dvh` |

**F5's contract:** the six-word card must fit inside `--card-viewport-height` with no
scrolling at 375px width. F2 may change the numeric values of `--header-height` and
`--tab-bar-height` but must not remove the variables or change their meaning.

Routes owned by F1: `/`, `/signin`. Routes stubbed by F1 and owned by others:
`/today` (F5), `/vocab` (F4/F8), `/journal` (F10), `/profile` (F9).

---

## 8. Edge cases and failure modes

| # | Situation | Handling |
|---|---|---|
| 1 | `env(safe-area-inset-bottom)` is `0px` and the tab bar hides under the home indicator | Cause is almost always a missing `viewportFit: 'cover'` in the `viewport` export. Verify on a real notched device — the simulator and desktop Safari both report 0. |
| 2 | Tab bar jumps when the iOS Safari URL bar collapses | Use `100dvh`, never `100vh`. Already baked into `--card-viewport-height`. |
| 3 | `prepared statement "s1" already exists` from Postgres | postgres.js talking to Neon's pooler without `prepare: false`. Fixed in `lib/db/index.ts`; do not remove that option. |
| 4 | Connection exhaustion under concurrent serverless invocations | `max: 1` per instance plus Neon's `-pooler` endpoint. If `DATABASE_URL` points at the direct (non-pooler) host, this breaks under load — check the hostname. |
| 5 | Auth.js writes an account row with all-null OAuth tokens | The `accounts` table's TS property names were "tidied" to camelCase. They must stay `refresh_token`, `access_token`, `expires_at`, `token_type`, `scope`, `id_token`, `session_state`. |
| 6 | `session.user.id` is `undefined` | The `session` callback was dropped, or `types/next-auth.d.ts` is missing so TS silently allowed it. Both are in step 9. |
| 7 | Middleware redirect loop between `/signin` and `/today` | The matcher is excluding too little (catching `/api/auth/*`) or the cookie name differs. In production the cookie is `__Secure-authjs.session-token`; locally it is `authjs.session-token`. Both are in the list. |
| 8 | A user with a stale/forged session cookie reaches a page | By design middleware does not validate. `requireUser()` in `app/(app)/layout.tsx` and `requireApiUser()` in every API route are the real check. Never rely on middleware alone. |
| 9 | LLM returns JSON wrapped in ``` fences or with a leading sentence | `extractJson()` strips fences and slices from the first `{`/`[` to the last `}`/`]`. |
| 10 | LLM returns valid JSON that fails the zod schema | One retry that shows the model its own output plus the zod complaint, then `{ ok: false, kind: 'parse' }`. No third attempt — the roadmap forbids burning quota. |
| 11 | z.ai returns 404 for every request | `LLM_BASE_URL` includes `/v1`. The SDK appends `/v1/messages` itself. The value must be exactly `https://api.z.ai/api/anthropic`. |
| 12 | LLM route times out at ~10s on Vercel | Missing `export const maxDuration = 60`. Hobby plan defaults to 10s. |
| 13 | A route handler crashes with an Edge-runtime error about `net`/`crypto` | postgres.js needs Node. Add `export const runtime = 'nodejs'`. |
| 14 | Two devices create a card for the same local date simultaneously | `daily_cards_user_date_uniq` rejects the second insert. F5 must catch the unique violation and re-read the existing card rather than surfacing an error. |
| 15 | Two requests award the same badge for the same date | `badges_awarded_uniq` + `onConflictDoNothing()` makes awarding idempotent. F9 must use `onConflictDoNothing`. |
| 16 | Two words differing only in case (`Genteel` / `genteel`) | The functional unique index rejects the duplicate. F3 must catch it and show "you already have that word". Confirm the index actually contains `lower(` — see §5.3. |
| 17 | A user changes timezone after having cards | Historical `card_date` values stay as recorded. This is correct — the card was made on that local day. Streaks computed from stored dates therefore remain stable. Do not backfill. |
| 18 | User signs in exactly at a DST transition | `LocalDate` arithmetic is UTC-anchored and time-free, so DST cannot shift it. `toLocalDate` uses `Intl` with the real zone, which handles the transition correctly. |
| 19 | `profiles` row missing for a user created before the `createUser` event existed | `getUserTimezone()` falls back to `DEFAULT_TIMEZONE`; `upsertProfile` inserts on conflict. `ensureProfile` can be called defensively from `requireUser()` if this ever bites. |
| 20 | Env var missing in production only | `lib/env.ts` throws at import, so the first request 500s with a clear message rather than failing mysteriously at the OAuth callback. Check all three Vercel environments. |
| 21 | `drizzle-kit generate` produces a destructive migration | Read every generated SQL file before running `db:migrate`. There is one shared database in v0.1.0 — a dropped column is a data loss event. |
| 22 | `AUTH_SECRET` differs between local and production | All existing sessions are invalidated on change. Generate once, store in both places, never rotate casually. |
| 23 | Sign-in works locally, `redirect_uri_mismatch` in production | Both callback URLs must be registered in Google Cloud Console, and preview deployments get their own domain — either register the stable production domain and test there, or add the preview URL. |
| 24 | Client component accidentally imports `lib/env.ts` or `lib/llm/*` | `import 'server-only'` turns it into a build failure. Keep that import at the top of every server-only module. |

---

## 9. Verification checklist

### 9.1 Build and types

```bash
npm run build          # must succeed with zero type errors
npx tsc --noEmit       # must be clean
npx next lint          # or `npm run lint`
```

Expected: build output lists `/`, `/signin`, `/today`, `/vocab`, `/journal`, `/profile`
and `/api/auth/[...nextauth]`.

### 9.2 Database

```bash
npm run db:generate    # should say "No schema changes" on a second run
npm run db:migrate
npm run db:studio      # opens https://local.drizzle.studio
```

- Confirm 13 tables exist.
- Confirm `vocab_entries` has a unique index whose definition contains `lower(`:

```sql
SELECT indexdef FROM pg_indexes WHERE tablename = 'vocab_entries';
```

Expect a row containing `CREATE UNIQUE INDEX "vocab_entries_user_term_uniq" ON public.vocab_entries USING btree (user_id, lower(term))`.

- Confirm the date columns are `date`, not `timestamp`:

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE column_name IN ('card_date','last_shown_on','awarded_for_date','first_card_on','last_card_on');
```

All five must report `date`.

### 9.3 Auth

1. `npm run dev`, open `http://localhost:3000/` → redirected to `/signin`.
2. Click "Continue with Google", complete consent → land on `/today`.
3. In Drizzle Studio: one row in `users`, one in `accounts` (with a non-null `access_token`
   and `provider = 'google'`), one in `sessions`, one in `profiles` with
   `timezone = 'Asia/Jakarta'`.
4. Open `/signin` while signed in → redirected to `/today`.
5. Sign out from `/profile` → redirected to `/signin`; the `sessions` row is gone.
6. Delete the session cookie in devtools, reload `/today` → back at `/signin`.

### 9.4 Timezone helper

```bash
npx tsx -e "
import * as t from './lib/time/local-date'
const i = new Date('2026-08-08T17:30:00Z')
console.log(t.toLocalDate(i,'Asia/Jakarta'))       // 2026-08-09  (UTC+7 → next day)
console.log(t.toLocalDate(i,'UTC'))                // 2026-08-08
console.log(t.toLocalDate(i,'America/New_York'))   // 2026-08-08
console.log(t.localHour(new Date('2026-08-08T18:10:00Z'),'Asia/Jakarta'))  // 1
console.log(t.localDayOfWeek('2026-08-09'))        // 0  (Sunday)
console.log(t.addLocalDays('2026-02-28',1))        // 2026-02-29 (leap year)
console.log(t.diffLocalDays('2026-08-01','2026-08-08'))  // 7
console.log(t.formatLocalDateLong('2026-08-08'))   // 8 August 2026
console.log(t.localMonthBounds('2026-08-08'))      // { start: '2026-08-01', end: '2026-08-31' }
console.log(t.isValidTimeZone('Asia/Jakarta'), t.isValidTimeZone('Mars/Olympus')) // true false
"
```

Every commented value must match exactly. The first three lines are the whole point: the same
instant is two different calendar days depending on the user's zone.

### 9.5 LLM client

```bash
npx tsx scripts/check-llm.ts
```

Expected: `{ word: 'genteel', definition: '<one short line>' }`, exit code 0.

Then verify the failure paths:

- Temporarily set `LLM_BASE_URL=https://api.z.ai/api/anthropic/v1` → expect a `transport`
  error, not a hang. Restore.
- Temporarily change the smoke prompt to ask for prose instead of JSON → expect exactly two
  requests in the log (`attempt 0`, `attempt 1`) then a `parse` error. Confirm there is no
  third attempt.

### 9.6 App shell on a phone

Open the deployed URL in **iOS Safari on a real device** (the simulator does not report
safe-area insets reliably):

- Tab bar sits fully above the home indicator; nothing is clipped.
- Tapping each of the four tabs navigates and lights the correct item.
- `/vocab` keeps "Vocab" active (verify by hand-navigating to `/vocab/anything`; a 404 is
  expected, the active state is what's being checked — or defer this until F4).
- Scroll the page: the tab bar stays fixed, the shell does not rubber-band.
- Rotate to landscape and back: no layout break.
- Share → Add to Home Screen: the icon is the app icon, the name is "Daily Words".
- Launch from the Home Screen: opens directly at `/today`, no Safari chrome.
- In devtools (or via a desktop resize to 375px), confirm
  `getComputedStyle(document.documentElement).getPropertyValue('--card-viewport-height')`
  returns a positive pixel value.

### 9.7 Deployment

```bash
curl -I https://<domain>/                        # 307 to /signin
curl -s https://<domain>/manifest.webmanifest    # valid JSON, start_url /today
curl -I https://<domain>/apple-icon.png          # 200, image/png
```

- Vercel → Deployments → the build log shows no warnings about missing env vars.
- Vercel → Settings → General shows Node.js 20.x.
- Sign in on production with a *second* Google account; a second `users` + `profiles` row
  appears and neither account can see the other's data (nothing to see yet, but the guard
  path is exercised).

---

## 10. Open questions / discrepancies with `ROADMAP_v0.1.0.md`

None of these are contradictions of a locked decision; they are places where the roadmap is
silent and F1 has had to choose, or where a locked decision has an implication worth naming.
Flagging, not relitigating.

1. **Database driver is unspecified.** The roadmap locks "Neon Postgres" and "Drizzle ORM"
   but not the driver. F1 chooses **postgres.js** (`drizzle-orm/postgres-js`) over
   `@neondatabase/serverless` + `drizzle-orm/neon-http`, because the HTTP driver cannot do
   interactive transactions, and F5 (create card + items + bump `last_shown_on` + recompute
   `user_stats` + award badges) and F9 both need one. Cost: we manage a socket pool
   (`max: 1`, `prepare: false`, Neon's `-pooler` host). If a later feature wants the HTTP
   driver's zero-config edge story, that trade has to be re-opened deliberately.

2. **Database sessions cannot be validated in Edge middleware.** The roadmap locks
   "database sessions via Drizzle adapter". The consequence is that `middleware.ts` can only
   check for cookie *presence*; the authoritative check lives in `app/(app)/layout.tsx` and
   `requireApiUser()`. This is safe but worth stating loudly, because it is easy for a later
   feature to assume middleware already authenticated the request. It has not.

3. **Node 20 vs. Vercel's default.** The roadmap locks Node 20 (matching local `v20.11.1`).
   Vercel's current default for new projects is Node 22. F1 pins 20.x in project settings and
   `engines`. If Vercel drops Node 20 from the free tier, this becomes a forced change — Next
   15.5 runs fine on 22 and nothing in F1 is version-sensitive, so the migration would be a
   settings flip. Confirm whether Node 20 is still offered when deploying.

4. **zod major version is unspecified.** The roadmap says "zod, at every API boundary".
   F1 pins **zod 4**. The v3 → v4 API differences are real (`z.email()` vs
   `z.string().email()`, `z.treeifyError()` vs `error.format()`), so every feature plan must
   write v4 idioms. Flagged in case a later dependency drags in a v3 peer requirement.

5. **`profiles` and `user_stats` have no `uuid` primary key**, contradicting the surface
   reading of "Primary keys: `uuid` with `gen_random_uuid()`". Both are keyed on
   `user_id` per the roadmap's own schema block. F1 follows the schema block: these are
   one-row-per-user extension tables and a synthetic id would be noise. No action needed;
   noted so nobody "fixes" it later.

6. **Auth.js dictates some TypeScript property names.** The convention "Database columns:
   `snake_case`. TypeScript: `camelCase`" cannot hold for `accounts.refresh_token`,
   `access_token`, `expires_at`, `token_type`, `scope`, `id_token`, `session_state` — the
   Drizzle adapter reads those exact property names off the object it builds. Columns stay
   snake_case as required; seven TypeScript properties in one table are the exception.

7. **`/calendar` is a route but not a tab.** The route map lists `/calendar` while navigation
   is "exactly four items". No contradiction — `/calendar` is reached from `/today` — but F5
   owns both the route and the entry point, and F1 does not stub it.

8. **Next.js 15, not 16.** `next@latest` is 16.x as of this writing. The roadmap locks
   Next.js 15, so F1 pins `15.5.23`. Worth revisiting only in a v0.2.0.

9. **Migrations are run manually, not in the build.** The roadmap does not say. F1 keeps
   `db:migrate` out of the Vercel build command so a bad migration cannot take the site down,
   and because there is one shared database (no separate preview DB on the free tier).
   Consequence: schema changes require the implementer to run the migration by hand before
   the deploy that depends on it.

10. **Timezone changes are not retroactive.** If a user moves from Jakarta to London, past
    `card_date` values stay as recorded. This is the intended reading of "every day boundary is
    computed in the user's timezone" — the boundary applied at the moment the card was made.
    Confirm this is the intent before F9 builds streak logic on top of it.

11. **`profiles.timezone` has a default.** The roadmap says `timezone text not null` with no
    default. F1 adds `default 'Asia/Jakarta'` so the profile row created at first sign-in is
    valid before F7 has run. If the intent was that a profile row should not exist until
    onboarding completes, say so and F1 will drop `ensureProfile` — but then
    `getUserTimezone()` becomes partial and F5/F9 both need a null branch.
