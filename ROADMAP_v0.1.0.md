# Daily Words — Roadmap v0.1.0

> A digital rebuild of a pocket vocabulary card.
>
> The original: a 13×8 cm card, carried in a trouser pocket, holding a short list of
> unknown words and their meanings, glanced at through the day. This app replicates
> that ritual and improves on it — because it is digital, and we can change it as
> easily as flipping the back of our hand.

---

## How to use this file

Each feature below is a self-contained unit of work with its own detailed
implementation plan under `plans/`. To build one, start a fresh Claude session and say:

```
implement @ROADMAP_v0.1.0.md f1
```

That instructs the session to read this file for shared context, then execute
`plans/F1-foundation.md` in full.

**Every implementation session MUST read the "Locked Decisions" section below before
writing code.** Those decisions are shared contracts. A plan may add detail; it may
not contradict them. If a plan appears to contradict this file, this file wins —
stop and report the discrepancy rather than guessing.

---

## Product Principles

These are ranked. When two conflict, the higher one wins.

1. **Simplicity above all.** Every screen should be explainable in one sentence.
   If a feature needs a tutorial, it is wrong. This applies to the UI first and hardest.
2. **Phone-first, iOS Safari specifically.** Not "responsive". The target is one
   device held in one hand. Text is short. Descriptions are avoided. Copy is terse
   because LLM-generated text is the backbone of this app and LLM text sprawls by default.
3. **Free tier forever.** This is a hobby project on a tight budget. Every dependency
   must have a usable free tier. No paid services in v0.1.0.
4. **English throughout.** All app copy and all generated content is in English,
   in the register of a dictionary — plain, precise, unfussy.
5. **The ritual is the product.** The daily card must be *nudged* into existence by
   the user. It is never generated automatically. The deliberate act is the exercise.

---

## Locked Decisions

Do not relitigate these inside a feature plan.

### Stack

| Concern | Choice | Notes |
|---|---|---|
| Framework | Next.js 15, App Router, TypeScript | Vercel-native |
| Runtime | Node 20 | matches local `v20.11.1` |
| Styling | Tailwind CSS v4 | no component library; see F2 |
| Auth | Auth.js v5 (`next-auth@beta`), **Google provider only** | no email/password, ever |
| Session strategy | database sessions via Drizzle adapter | |
| Database | Neon Postgres (free tier) | |
| ORM / migrations | Drizzle ORM + drizzle-kit | |
| Hosting | Vercel (free tier) | |
| LLM | GLM via z.ai, Anthropic-compatible endpoint | see below |
| Validation | zod, at every API boundary | |
| Package manager | npm | |

### LLM access

```
LLM_BASE_URL=https://api.z.ai/api/anthropic
LLM_MODEL=glm-4.6
LLM_API_KEY=<in .env.local, never committed>
```

- Use the official `@anthropic-ai/sdk` with `baseURL` overridden to `LLM_BASE_URL`.
  The endpoint is Anthropic Messages-API compatible; verified working with a live call.
- **All LLM calls are server-side only.** Route handlers or server actions. The API key
  must never reach the client, and no LLM call may be issued from a browser bundle.
- **Structured output:** prompt for strict JSON, parse with a zod schema, retry **once**
  on parse failure, then fail gracefully with a user-visible short error. Do not build
  a multi-retry loop — it burns quota on a free-tier hobby project.
- **A single shared client wrapper lives in `lib/llm/`** (built in F1). No feature may
  instantiate its own SDK client. Every feature adds its *prompt* to `lib/llm/prompts/`,
  not its own transport.
- Every LLM response that is displayed must also be **persisted**. Detail pages, examples,
  and insights read from the database, never from a live call on page load. Cost and
  latency both demand this.

### Time and dates — read this twice

Streaks, the calendar, and date-triggered badges are the three places this app will
break if time is handled loosely.

- Each user has a `timezone` (IANA string) captured at onboarding, stored on their profile.
- **Every "day" boundary is computed in the user's timezone, not UTC, not server-local.**
- `daily_cards.card_date` is a `DATE` column holding the user's local calendar date.
- A user may have at most one card per local date.

### Naming and conventions

- Database columns: `snake_case`. TypeScript: `camelCase`.
- Primary keys: `uuid` with Postgres `gen_random_uuid()`.
- API routes live under `app/api/`, one directory per resource.
- Server-side data access goes through `lib/db/queries/` — components do not build
  Drizzle queries inline.

### Route map

| Route | Purpose |
|---|---|
| `/` | redirect → `/today` (authed) or `/signin` |
| `/signin` | single "Continue with Google" button |
| `/onboarding` | first-run profile questions (F7) |
| `/today` | the daily card + calendar strip (F5) |
| `/calendar` | month view of card history (F5) |
| `/vocab` | collection; tabs: **Mine** / **Discover** (F4, F8) |
| `/vocab/new` | add a word (F3) |
| `/vocab/[id]` | word detail — **a real route, not a modal** (F4) |
| `/vocab/[id]/chat` | proactive practice chat (F6) |
| `/journal` | journal list + composer (F10) |
| `/journal/[id]` | entry + LLM insight (F10) |
| `/profile` | stats, levels, badges (F9) |

**Navigation:** a bottom tab bar with exactly four items — Today, Vocab, Journal,
Profile — respecting iOS safe-area insets. No hamburger menu. No nested navigation drawers.

### Vocab detail is a page, not a modal

Decided deliberately. A full-page modal on iOS Safari loses the edge-swipe back
gesture, requires hand-rolled scroll locking, and breaks fixed-height layout math when
the URL bar collapses. A route gets back-button semantics, reload survival, and a sane
place to hang the nested chat view. Every feature plan must assume routes.

### Database schema (authoritative)

Feature plans may add columns and indexes with justification. They may not rename or
restructure what is here.

```
-- Auth.js standard tables
users(id, name, email, email_verified, image)
accounts(...)            -- Auth.js
sessions(...)            -- Auth.js
verification_tokens(...) -- Auth.js

profiles
  user_id PK FK -> users.id
  timezone            text not null default 'UTC'   -- IANA, e.g. "Asia/Jakarta"
  timezone_source     text not null default 'detected'  -- [R10] 'detected'|'manual'
  occupation          text
  interests           text[]
  currently_consuming text                     -- book / show they are on now
  english_contexts    text[]                   -- where they use English
  chat_tone           text                     -- patient | blunt | playful
  onboarded_at        timestamptz
  created_at          timestamptz not null default now()
  updated_at          timestamptz not null default now()   -- [R10]

vocab_entries
  id                   uuid PK
  user_id              uuid FK -> users.id
  term                 text not null
  source               text not null              -- 'manual' | 'suggested'
  status               text not null default 'active'   -- 'active' | 'mastered'
  part_of_speech       text
  pronunciation        text
  definition           text                       -- short; one line
  examples             jsonb                      -- string[]
  enrichment_status    text not null default 'pending'  -- 'pending'|'ready'|'failed'
  suggested_correction text                       -- [R9] "genteell" -> "genteel"
  enrichment_error     text                       -- [R9] last failure, for retry UI
  enrichment_attempts  int not null default 0     -- [R9]
  last_shown_on        date                       -- drives daily-card selection
  created_at           timestamptz not null default now()
  mastered_at          timestamptz
  UNIQUE (user_id, lower(term))
  -- NO deleted_at. There is no soft delete in v0.1.0 — see [R1].

daily_cards
  id         uuid PK
  user_id    uuid FK -> users.id
  card_date  date not null            -- user-local calendar date
  created_at timestamptz not null default now()
  UNIQUE (user_id, card_date)

daily_card_items
  id              uuid PK
  card_id         uuid FK -> daily_cards.id ON DELETE CASCADE
  vocab_entry_id  uuid FK -> vocab_entries.id ON DELETE RESTRICT  -- [R1] never CASCADE
  position        int not null
  UNIQUE (card_id, position)
  -- RESTRICT is deliberate. A past card is a record of a day that happened;
  -- deleting a word must never punch a hole in it. See [R1].

chat_sessions
  id              uuid PK
  user_id         uuid FK -> users.id
  vocab_entry_id  uuid FK -> vocab_entries.id ON DELETE CASCADE   -- [R5]
  round           int not null default 1                          -- [R6] practice rounds
  turn_count      int not null default 0
  closed_at       timestamptz
  last_message_at timestamptz
  created_at      timestamptz not null default now()
  UNIQUE (user_id, vocab_entry_id)     -- one durable session per word

chat_messages
  id         uuid PK
  session_id uuid FK -> chat_sessions.id ON DELETE CASCADE
  round      int not null default 1                        -- [R6]
  kind       text not null default 'reply'                 -- [R6] 'opener'|'reply'|'verdict'
  role       text not null            -- 'user' | 'assistant'
  content    text not null
  created_at timestamptz not null default now()
  -- partial unique: (session_id, round) WHERE kind = 'opener'

journal_entries
  id                   uuid PK
  user_id              uuid FK -> users.id
  text                 text not null
  source_note          text           -- optional "where I found it"
  insight              jsonb          -- [R7] {meaning, whenItApplies[]}, NOT text
  insight_status       text not null default 'none'  -- 'none'|'pending'|'ready'|'failed'
  insight_requested_at timestamptz    -- [R8] recovers entries stuck at 'pending'
  created_at           timestamptz not null default now()
  updated_at           timestamptz not null default now()

user_stats                     -- CACHE ONLY. Never trusted for display. See [R11].
  user_id        uuid PK FK -> users.id
  current_streak int not null default 0
  longest_streak int not null default 0
  total_cards    int not null default 0
  first_card_on  date
  last_card_on   date           -- [R11] without this, a stale streak can't be detected
  updated_at     timestamptz not null default now()

badges_awarded
  id              uuid PK
  user_id         uuid FK -> users.id
  badge_key       text not null
  awarded_for_date date not null
  created_at      timestamptz not null default now()
  UNIQUE (user_id, badge_key, awarded_for_date)
```

### Daily card rules

- **6 words per card.** Not configurable in v0.1.0. This is the number that fits an
  iPhone viewport between the header and the tab bar with no scrolling.
- Each word occupies at most **two lines**: the term, and a one-line definition.
- **The card must never scroll.** This is a hard layout constraint, tested at 375 px width.
- Selection: weighted random from the user's `status='active'` entries, preferring the
  least-recently-shown (`last_shown_on` ascending, nulls first).
- **Repeats across days are intentional and correct.** Seeing "genteel" every day for a
  week is the system working, not a bug. Only `status='mastered'` removes a word.
- If the user has fewer than 6 active words, show what exists and prompt them toward
  `/vocab/new` or Discover. Never pad with filler.
- A card is created only when the user presses the button. Never on a schedule,
  never on page load.

### Gamification content (authoritative — F9 uses these exact strings)

**Streak levels** — by longest streak ever achieved:

| Days | Title |
|---|---|
| 0–2 | Blank Card |
| 3–6 | Pocket Fuzz |
| 7–13 | The Small Scribe |
| 14–29 | Margin Scribbler |
| 30–59 | Keeper of the Pocket |
| 60–99 | The Uncle's Apprentice |
| 100–199 | Lexicon Smuggler |
| 200–364 | Walking Errata |
| 365+ | Dickens Would Nod |

**Collector levels** — by count of manually added words. At **0 words there is no
title**; the profile shows "no words yet" rather than inventing one. [R13]

| Words | Title |
|---|---|
| 1–9 | Word Picker |
| 10–24 | Jam Jar of Words |
| 25–49 | Shelf of Odds |
| 50–99 | Bag Man of Nouns |
| 100–249 | Private Collector |
| 250–499 | Hoarder of Rare Speech |
| 500–999 | Curator of Forgotten Tongues |
| 1000+ | Barnaby's Ghost |

**Badges** — all evaluated at the moment a daily card is created, against the user's
local date and time. Most match a calendar date, but three do not: `first_card` is
history-based, `midnight_oil` is time-of-day-based, and `full_week` is streak-based.
See [R12] for the exact trigger of each.

| Key | Trigger | Title |
|---|---|---|
| `first_card` | the very first card ever | The Uncle's Trick |
| `sunday` | any Sunday | No Weekend Without Ration Card |
| `indonesia_independence` | 17 August | National Speaker |
| `ibu` | 22 December (Indonesian Mother's Day) | Ibu Would Be Proud |
| `womens_day` | 8 March | Words for Her |
| `fathers_day` | third Sunday of June | For the Old Man |
| `world_book_day` | 23 April | The Bard's Regard |
| `new_year` | 1 January | Resolution, Documented |
| `christmas` | 25 December | Ghost of Christmas Vocab |
| `year_end` | 31 December | Last Word of the Year |
| `leap_day` | 29 February | Leap Year Lexicographer |
| `midnight_oil` | card created 00:00–04:00 local | Burning the Midnight Oil |
| `full_week` | 7 cards in 7 consecutive days | Full Week Ration |

Badges are repeatable across years; `badges_awarded` records each occurrence and the
profile shows a count ("×2").

---

## Features

Build order follows dependencies. Features on the same line are independent of each other.

```
F1  →  F2  →  F3, F7  →  F4, F5  →  F6, F8, F9
                                  F10 (independent after F1)
```

### F1 — Foundation, Auth & Data Layer
`plans/F1-foundation.md`

Next.js scaffold, Tailwind, Neon connection, the **complete** Drizzle schema above and
its migrations, Google-only sign-in, the shared LLM client wrapper, the bottom tab bar
and app shell, PWA manifest with iOS safe-area handling, and Vercel deployment.

Nothing else can start until this lands. It owns the schema for every other feature.

### F2 — Design System & Mobile UI Kit
`plans/F2-design-system.md`

Design tokens, typography, spacing, colour, and the shared component set (card, list
row, tab bar, sheet, button, input, empty state, chat bubble, badge chip). Also owns
the `/design-sync` bridge: publishing preview HTML to the claude.ai/design project
`8c1c015d-78c9-4945-8382-23bf124f2333` so the kit is reviewable in the browser.

### F3 — Vocab Capture, Validation & Enrichment
`plans/F3-vocab-capture.md`

The `/vocab/new` flow. One LLM call validates the term, corrects likely typos
("genteell → did you mean *genteel*?"), and returns part of speech, pronunciation, a
one-line definition, and usage examples — all persisted on write.

### F4 — Vocab Detail & Collection Management
`plans/F4-vocab-detail.md`

`/vocab` collection list and the `/vocab/[id]` detail **page**. Examples, and the
"I have mastered this" toggle that retires a word from daily cards.

### F5 — Daily Card & Calendar
`plans/F5-daily-card.md`

The centrepiece. The nudge-to-generate button, the six-word non-scrolling card,
the selection algorithm, and the calendar of ticks and crosses showing which days
have a card and which do not.

### F6 — Proactive Vocab Chat
`plans/F6-vocab-chat.md`

The competitive edge. One durable chat session per user per word. On open, **the model
speaks first**, in role, with a scenario drawn from the user's profile, steering them
into using the word. It does not define the word unless asked. Capped at 8 turns,
closing with a short verdict.

### F7 — Onboarding & Personalization Profile
`plans/F7-onboarding.md`

First-run questions that build the profile the chat and Discover features depend on.
Five questions maximum, one per screen, every one skippable. Captures timezone.

### F8 — Discovery: LLM Vocab Suggestions
`plans/F8-discovery.md`

The Discover tab. A "pick a new word for me" button that proposes a word the user does
not already have, tuned to their profile, dedup'd against their whole collection
including mastered words.

### F9 — Gamification: Streaks, Levels, Badges & Profile
`plans/F9-gamification.md`

`/profile`. Streak and collector levels, badge awards, "keeping a card since
8 August 2026". The goal is that a long-time consistent user feels genuine pride
looking at this page.

### F10 — Journal & Insights
`plans/F10-journal.md`

Paste a line worth keeping — *"a fall in a pit, a gain in one's wit"* — and get an
LLM insight on its meaning and the situations it fits. Independent of the vocab side.

---

## Explicitly out of scope for v0.1.0

Named here so no plan quietly includes them:

- Any sign-in method other than Google
- Push notifications or reminders of any kind
- Sharing, social features, following, leaderboards
- Audio pronunciation playback
- Import from Kindle, Goodreads, or any external source
- Spaced-repetition scheduling (the card is deliberately dumber than SRS)
- Offline mode / service-worker caching beyond the bare PWA manifest
- Any paid dependency

---

# Reconciliation Decisions

The ten feature plans under `plans/` were written **in parallel, by agents that could
not see each other's work**. Where two plans disagree, the ruling below wins — over
both plans, and over anything earlier in this file.

**If you are implementing a feature, read this section after reading your plan.** Your
plan may contain reasoning that was correct when written and is now superseded.

---

### [R1] There is no soft delete. Deletion is refused once a word has been carded.

**Conflict:** F4 designed a delete feature with a `deleted_at` tombstone column and a
"resurrection" path through F3's insert. F1 independently declared the FK
`onDelete: 'restrict'` and stated words are retired via `mastered`, never deleted. F5
warned that hard deletion would hit that FK. F8 assumed no delete path exists at all.
Three plans against one — and the fault is the roadmap's: deletion was scoped into F4
and mentioned nowhere else.

**Ruling:**

- A word with **zero** `daily_card_items` rows may be **hard deleted**. This is the
  typo-recovery path, and it is needed: F3 permits saving a term whose enrichment failed.
- A word that has **ever appeared on a daily card cannot be deleted.** The UI offers
  "mastered" instead, and says why in one line: *"This word is on past cards. Mark it
  mastered to retire it."*
- **`deleted_at` is not added.** No tombstones. This is what removes the three
  follow-on costs: F3's create path needs no resurrection logic, the
  `UNIQUE (user_id, lower(term))` index never contains invisible rows, and F8's dedup
  never has to reason about words it cannot see.
- `chat_sessions.vocab_entry_id` is `ON DELETE CASCADE`, so deleting an un-carded word
  takes its practice session with it. Days are permanent; practice is not.

**Overrides:** F4 §5 and §9.4 in full — ignore `deleted_at`, the soft-delete branch, and
the amendment to F3's create path. F8 §9 Decision 1's *justification* (see [R4]).

---

### [R2] zod 4 is binding. Normalise the v3 idioms.

F1 pins `zod@4.4.3`. F3, F4 and F6 wrote schemas using `z.string().uuid()`, which is
the v3 spelling — it still functions in v4 but is deprecated in favour of top-level
`z.uuid()`. This is a consistency cleanup, not a breakage; nothing will fail at runtime.

**Ruling:** use top-level `z.uuid()`, `z.email()`, `z.url()` throughout. When
implementing any feature, normalise its plan's schemas as you go.

---

### [R3] The "+" button appears on three tabs, not four.

**Conflict:** F3 specified a floating "+" button on all four tab routes. F10
independently specified that the journal composer is a permanent textarea at the top
of `/journal`, explicitly "not behind a button, sheet, or FAB". Both on one screen
gives two competing "add" affordances.

**Ruling:** the "+" button renders on **Today, Vocab and Profile**. It does **not**
render on `/journal`, which has its own always-present composer. The app shell takes a
`showAddButton` prop; `/journal` passes `false`.

**Overrides:** F3 §8's "all four tab routes". F10 is unchanged.

---

### [R4] F8's accept-before-add decision stands; its stated reason does not.

F8 justified proposing-before-adding on the premise that *"v0.1.0 has no delete path,
so immediate-add is an irreversible write."* [R1] makes that premise false.

**Ruling:** the decision is **kept**. Rewrite the justification to the grounds that
actually hold: a suggested word that has never been carded is deletable, but ten idle
taps still put ten unwanted words into the 6-word daily-card pool, and the card is the
centrepiece of the product. Reversibility is not the argument — pollution of the
ritual is.

**Also for F8:** its dedup query must include `status='mastered'` rows (already
specified) and no longer needs any tombstone handling, since [R1] removes tombstones.

---

### [R5] `chat_sessions.vocab_entry_id` cascades. *(applied to the schema above)*

F6 caught that this FK had no delete rule, which would have broken deletion
independently of the `daily_card_items` FK. Now `ON DELETE CASCADE`.

---

### [R6] "8 turns" means one opener plus seven replies. Rounds are approved.

The phrase "hard cap of 8 assistant turns" was ambiguous about whether the proactive
opener counts. **It counts.** One opener + 7 replies = 8 assistant messages, then the
verdict closes the round.

F6's `round` columns on `chat_sessions` and `chat_messages`, its `kind` column, and its
partial unique index on `(session_id, round) WHERE kind='opener'` are **approved** and
are now in the schema above. They let a closed session be practised again without
destroying the transcript of the user's own sentences.

---

### [R7] Journal insight is `jsonb`, not `text`. *(applied to the schema above)*

The roadmap declared `insight text` while the insight is a two-part structure
(`meaning`, `whenItApplies[]`). F10 correctly flagged that this forces JSON-in-a-text-column.
Now `jsonb`. **Overrides** F10 §12's note about the text-column workaround.

---

### [R8]–[R10] Approved schema additions. *(all applied above)*

Every column proposed across the ten plans, ruled on as one set rather than piecemeal:

| Column | From | Ruling |
|---|---|---|
| `journal_entries.insight_requested_at` | F10 | **Approved.** Without it, an entry stuck at `pending` from a killed function is permanently unretryable. |
| `journal_entries.updated_at` | F10 | Approved. |
| `vocab_entries.suggested_correction` | F3 | Approved — carries "did you mean genteel?". |
| `vocab_entries.enrichment_error` | F1, F3 | Approved (both proposed it independently). |
| `vocab_entries.enrichment_attempts` | F3 | Approved. |
| `profiles.timezone_source` | F7 | **Approved.** It is what makes silent timezone re-detection safe without discarding a manual correction. |
| `profiles.updated_at`, `profiles.timezone` default | F1, F7 | Approved. The default makes `getUserTimezone()` total, so F5 and F9 carry no null branch. |
| `user_stats.last_card_on` | F1, F9 | **Approved.** A streak decays with time and nothing writes on absence; without this column a stale value cannot be detected. |
| `vocab_entries.deleted_at` | F4 | **Rejected** — see [R1]. |
| A `rejected_suggestions` table | F8 | **Rejected**, as F8 itself recommended. Session-only rejection needs no schema. |

All proposed indexes across all plans are approved.

---

### [R11] `user_stats` is a cache and is never trusted for display.

F9 identified that `current_streak` silently rots: it decays with the passage of time,
but nothing writes to the row when a user simply stops appearing.

**Ruling:** `/profile` **recomputes on read** and treats `user_stats` as a value to
verify and repair. No cron job — a scheduled job is the first step toward the
notifications this roadmap forbids, and recomputation is trivially cheap at one user.

---

### [R12] Badge triggers, stated exactly.

Ten of the thirteen match a local calendar date. The three that do not:

- `first_card` — the user's first card ever. History-based.
- `midnight_oil` — local hour `< 4`, i.e. 04:00:00 exactly does **not** qualify.
- `full_week` — awarded once per **completed** week of an unbroken run
  (`runLength % 7 === 0`). Read literally the original wording fired every day past day
  seven, which would be 94 awards on a 100-day streak. F9 caught this.

`fathers_day` is the third Sunday of June, computed as `dayOfWeek === 0 && day 15–21`.
No date lookup table.

---

### [R13] Collector level is undefined at zero words. *(applied above)*

---

### [R14] F2 owns the layout budget. Its numbers win.

**Conflict:** F5 provisionally budgeted ~61 px per card row and a ~366 px card, and
marked the figures as pending F2. F2 derived 52 px per row and a 347 px card, and
proved it with a seven-device ledger — the binding case being iPhone SE in Safari with
the URL bar expanded, at +76 px of slack.

**Ruling:** **52 px rows, 347 px card.** F5 updates. Both text lines are hard-clamped
to exactly one line each, so no term, definition, font or locale can change a row's
height. Constants live in `LAYOUT` at `@/lib/ui/layout`, and F5 imports them rather
than restating any number.

**Overrides:** F5 §9's provisional budget table.

---

### [R15] The card-created hook is F5's, not F9's.

Both plans defined one; F9 wrote its version blind and correctly declared that F5 wins.

**Ruling:** `lib/cards/hooks.ts` with F5's frozen `CardCreatedEvent`, carrying
`cardDate`, `timezone`, `localCreatedAtHour`, `localWeekday` and `isFirstCardEver`.
That covers every badge except `full_week`, which queries history itself. F9 replaces
F5's no-op `onCardCreated`. Neither feature gains a compile-time dependency on the other.

---

### [R16] Dark mode and `viewport-fit=cover` are in scope.

Neither appeared in the original roadmap. Both are required.

- **Dark mode** is system-only, with no toggle, implemented as raw `--dw-*` token
  overrides inside a `prefers-color-scheme` block. iPhone users live in both schemes.
  Every downstream feature must respect the two-scheme colour ledger in F2 §5.
- **`viewport-fit=cover`** must be on the viewport meta tag. Without it `safe-area-inset-*`
  silently returns `0` and every safe-area calculation in F2 and F5 quietly breaks.
  The tag lives in an F1-owned file; F2 edits it. This is expected, not a conflict.

---

### [R17] F4 owns the Vocab tab shell; F8 slots into it.

F4 froze a contract F8 never saw. F4's version wins: tabs are `?tab=` query params
rather than a `/vocab/discover` segment (a static segment beside `/vocab/[id]` makes
"is this an id?" a permanent question). F8's Discover component takes `DiscoverTabProps
{ userId }`, must not sticky at `top: 0` (the tab strip owns that), and must not use
the param names `tab`, `q`, `status` or `sort`.

F8 isolated all three of its cross-feature couplings into single adapter functions
precisely so a mismatch would be a small fix. Use them.

---

### [R18] The Claude Design output is the visual source of truth.

Pulled 2026-08-08 from claude.ai/design project `cf545c6e-6728-461d-ba29-426e7a4ae0f6`
and archived verbatim at `design/from-claude-design/Daily Words.dc.html`. It contains
all ten screens plus a system sheet. **Where it and F2 disagree, it wins** — F2 was
written blind, before the design existed.

Note the project is `PROJECT_TYPE_PROJECT`, not a design system. Pushing a component
kit back (F2 §8) still targets the separate **Design System** project
`8c1c015d-78c9-4945-8382-23bf124f2333`. The type is fixed at creation and cannot be
converted.

**Tokens — these exact values replace F2 §5 in full.**

```
light  --paper #F0EDE4  --paper-2 #E8E4D9  --card #FBFAF5  --ink #20211D
       --ink-2 #5D5C52  --ink-3 #8F8D81    --rule #D8D3C4  --rule-2 #EAE6DA
       --accent #2F5D50 --accent-soft #E0E8E2 --miss #BFB9A9 --red #8A3324
dark   --paper #131311  --paper-2 #1A1A17  --card #1E1E1A  --ink #EEEBE1
       --ink-2 #A5A398  --ink-3 #6E6D64    --rule #2E2E28  --rule-2 #242420
       --accent #86BBA6 --accent-soft #1E2A25 --miss #4A4A42 --red #C97A62
```

**The accent is green, not red.** F2 proposed a stamp-red `#9E3B2E`; the design uses a
deep green `#2F5D50`, inverted to `#86BBA6` on dark. Discard F2's accent and its
`--dw-accent-ink` derivation.

**Two webfonts, not one.** F2 ruled that only content would be typeset, with system
sans for chrome. The design instead pairs **Source Serif 4** (words, meanings, prose)
with **IBM Plex Mono** (labels, counts, dates, tab bar — anything the machine counts).
F2 independently picked Source Serif 4, which is a good sign; the mono is the change.
It costs a second font load, and it is worth it: the serif/mono split is what carries
the "paper card" feel, and it is load-bearing rather than decorative.

**Spacing** is a 4pt base. **Radii** are exactly four: `2` chip, `6` field, `10` card,
`999` pill.

**No icons anywhere.** The tab bar is four words and a dot — no glyphs. Any icon set in
a feature plan is void.

### [R19] The card's no-scroll rule: structure from the design, floor from F2.

Three plans proposed three row heights — F5 said 61px, F2 proved 52px, the design uses
`flex: 1` rows with `min-height: 60`. They are not really in conflict, because the
design solves it structurally rather than numerically: the card takes the space left
after header, day strip and tab bar, and **six rows divide it**. Rows compress; the
card never grows.

**Ruling:** adopt the design's structure — rows are `flex: 1 1 0` inside a `flex: 1`
card, with `min-height: 0` so they can compress. Keep F2's two disciplines, which the
design also relies on: both text lines are **clamped to exactly one line** (term
ellipsised, definition ellipsised), and F2's iPhone-SE ledger stays the acceptance
test. Treat **52px as the floor** at the smallest supported viewport and ~60px as the
resting height at 390×844. Rows are separated by a `--rule-2` hairline, none after the
last.

### [R20] The design's sample content drifts from the spec. Do not copy it.

The design's *layout* is authoritative; its *filler content* is not, and in four
places it would mislead an implementer:

1. **"Pocket Fuzz" appears in the badge list** (`Daily Words.dc.html:1036`). It is a
   *streak level*, not a badge. Badges and levels are different systems.
2. **Two invented badges** — "Six Before Noon" and "Nothing Skipped in a Fortnight" —
   are not in the roadmap's thirteen.
3. **"Next: The Uncle's Apprentice, at 50 cards"** — that level is a *streak* tier at
   60 days, and 50 cards is not a threshold in either table.
4. **The onboarding questions are placeholders and one contradicts a locked
   decision.** The prototype asks "How many words on a card?" (locked at six, not a
   user setting) and "When should the card be ready?" (nothing is scheduled — the card
   is nudged). Use F7's five profile questions instead.

The level and badge tables in this roadmap remain authoritative. F9 already verified
its strings against them; `src/lib/sample-data.ts` follows the roadmap, not the
prototype, and says so at the top of the file.

### Still open — these need your call, not mine

1. **`ConfirmSheet`.** F2 resolved the roadmap's "sheet" component against its ban on
   modals by allowing a heavily constrained native `<dialog>` for two uses only
   (confirm delete, confirm mastered). Defensible, but it is the thin end of a wedge.
2. **The "+" button itself.** F3 asked for confirmation that a floating button is
   acceptable against the "no nested navigation" principle. [R3] assumes yes.
3. **`x-vercel-ip-timezone`** availability on Vercel's free tier is unverified — it is
   F7's second-choice timezone fallback. Check on a preview deploy before relying on it.
