# Changelog

All notable changes to Daily Words are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries name the feature plan (`F<n>`) that shipped the work, because the plans in
`plans/` and the decisions in `ROADMAP_v0.1.0.md` are where the reasoning lives.
Where a decision has a reconciliation number — `[R1]`, `[S3]` — it is cited rather
than restated.

## [v0.2.0] - 2026-08-12

Thirty-four commits on top of the first release. Two user-facing features — a
word met in another language, and today's card opening instantly — plus seven new
badges, one removed, and a second image provider for the art pipeline. Two
additive migrations (0007, 0008). No breaking change to any route, column or
environment variable.

### Added

**Non-English lookup on the add path** (`docs/plans/2026-08-12-non-english-lookup-design.md`)

- A toggle on `/vocab/new` and an optional "as in" context sentence: `melumuri`
  plus a sentence goes to `lib/llm/prompts/vocab-translate.ts` and comes back as
  `smear` with a full English entry, in one model call.
- **The row holds the English word.** `origin_term`, `origin_language` and
  `origin_context` (migration 0008, three nullable columns and a CHECK that a
  context cannot exist without a term) keep the trail. Rejected on the downstream
  contracts rather than on taste: `pronunciation` is British RP and all three
  `examples` must contain the term, and neither has a meaning for an Indonesian
  headword.
- `vocab-enrich.ts` is untouched, byte for byte — the context sentence is exactly
  the per-user data that file's "takes only the term" property forbids, and F17's
  claim-discloses-nothing argument rests on it. The lookup is a second prompt
  module, not a mode.
- The model call precedes the insert, so the result travels through the browser
  under an HMAC (`lib/vocab/lookup-token.ts`, secret as a parameter so
  `vocab:check` stays offline) and `POST /api/vocab` inserts `ready` in one
  statement. Signed is model output; validated is user input.
- `POST /api/vocab/lookup` writes no row, so the 50-a-day cap cannot protect it:
  `lib/vocab/lookup-rate-limit.ts` is a second in-memory limiter, checked before
  the model call.
- `LookupResultCard`, a new component rather than a mode on `EnrichmentCard`, and
  `POST /api/vocab/[id]/origin` to attach an origin to an existing row.
- `npm run vocab:dry-run` joins `chat:dry-run` and `discover:dry-run`. It earned
  itself immediately: its first calibration set drew from the prompt's own
  few-shot examples and came back word-perfect because the model was reciting.

**The birthday, asked exactly once** (migration 0007)

- `profiles.birthday` and `profiles.birthday_asked_at`, and a one-question
  `/birthday` screen — a sibling of the `(app)` group for the reason
  `/onboarding` is one. `birthday_asked_at` is the load-bearing half: on the date
  column alone, a user who skipped would be asked on every app open for life.
  Answering and skipping both stamp it; `/profile/edit` is where it changes
  afterwards.
- **Not a sixth onboarding question** — the roadmap caps that flow at five, so one
  screen serves a brand-new user and a user who has been here since F1, and
  `app/(app)/layout.tsx` gains a gate rather than a branch.
- The timezone is detected, never asked; the birthday is asked, never guessed.
  `scripts/profile-peek.ts birthday <date|skip|ask>` is the switch a
  `DW_TEST_SESSION` run needs.

**Instant word detail from today's card** (`docs/plans/2026-08-11-today-card-prefetch-design.md`)

- A client-side nav to a word went from **855ms to 73ms**, measured on a
  production build against the live database. The render was never the problem:
  `/vocab/[id]` was six serial Neon round trips.
- `getSessionUser` and `getProfile` are wrapped in React's `cache()` — the plain
  reads, not the guards that `redirect()`. Per-request, so `userId` stays the
  cache key and rule 3 of the queries convention is untouched. That is one round
  trip off **every** page in the `(app)` group.
- `getVocabEntryDetail` is one statement again, via `exists()` with a query
  builder rather than a raw `sql` fragment. Both readings were run side by side
  over all 37 live rows, 18 carded and 19 not, with zero disagreements — rendered
  SQL was not accepted as proof, because the bug this replaces rendered clean SQL
  too.
- `prefetch` is threaded `/today` → `DailyCard` → `DailyCardRow` → `<Link>`,
  defaulted to Next's `auto` so it is additive: the same row also draws F18's
  public shared card, and prefetching six snapshot pages for a stranger is a
  decision nobody asked for. A row still enriching is excluded — a FULL prefetch
  would pin "finding it…" in the router cache for 300s.

**Seven more badges, and the two counters they needed**

- Badges #14–#21: `three_in_a_week` (Three Times the Charm), `thirty_day_streak`
  (This Is the Way), `dumbledore` (Avada Kedavra), `dobby` (Dobby The Free Elf),
  `five_shares` (The Good Samaritan), `ten_journal_lines` (Maester of the Seven
  Kingdoms), `birthday` (A Man Needs a Card) and `friday_blessing` (Friday
  Blessing). The deck is 21 badges, 17 levels, style v1.
- `lib/gamification/tallies.ts`: `five_shares` and `ten_journal_lines` are the
  first badges in the deck that read a fact about a table other than
  `daily_cards`.
- `birthday` is the first whose trigger is a fact about the *user* — the whole
  date rides in `BadgeContext` rather than a precomputed boolean, because the
  comparison *is* the badge. Changing a birthday is additive and never
  retroactive; `stats:db` walks the whole sequence against a real Postgres rather
  than reasoning about it.
- `friday_blessing` is `dow === 5` where `sunday` is `dow === 0`, off the same
  value — so a rule written against the wrong constant passes every single-date
  test you would think to write. Pinned in both directions on one week, verified
  by flipping the constant.
- Several masters were supplied by hand and conformed to the v1 contract rather
  than generated; their sidecars are the record of what that costs, including two
  rules learned the hard way — centre a non-circular seal by what check 8a
  measures, not by what a ruler measures, and a scene line written after the fact
  does not reproduce the master.

**Badge art through OpenRouter as well as OpenAI**

- `--provider` selects a whole tuple — base URL, key variable, default model and
  how the anchor is carried — the way `--kind` selects a deck. Default is
  `openrouter` with `qwen/qwen-image-3-pro`; `--provider openai` is the original
  `gpt-image-2` path, kept because the twenty masters that predate it were made
  that way. New `--seed`, which Qwen honours and OpenAI ignores.
- **OpenRouter has no `/images/edits`** — a bare 404 — so the anchor rides in
  `input_references` on the ordinary generations call. A port that only swapped
  the base URL would generate fine and die on every anchored call.
- `KEY_VARS` in `scripts/check-badge-art.ts` is now a list rather than one literal
  string: the key scan walks the whole of `src/`, so it generalises over files but
  not over variable names, and `OPENROUTER_API_KEY` could have gone into
  `src/lib/env.ts` with everything green.
- `.env.example` now documents four keys across three providers, and that only
  `LLM_API_KEY` is used by the running app for text.

**Tooling and docs**

- `/generate-new-badge` (`.claude/skills/generate-new-badge/`) drives the whole
  badge checklist from a name and a rule in prose, including the two steps the
  checklist leaves out, and stops at one gate before spending anything on art.
- A repo `README.md`.

### Changed

- Four badges retitled, keys untouched — a key is identity (it is the value in
  `badges_awarded`, the art filename and the scene-list entry) and is frozen once
  art exists. `ten_journal_lines`' old title was a defect rather than a
  preference: as an English idiom it meant close to the opposite of a maester's
  chain, which the gloss and the art already had right.
- `npm run vocab:check` runs under `--conditions=react-server`, like
  `share:check` and `claim:check`, because `lookup-token.ts` is server-only. It
  still needs no environment.
- `CLAUDE.md`, `ROADMAP_v0.1.0.md` and `src/components/README.md` updated for all
  of the above.

### Removed

- **The `christmas` badge, removed rather than retired** — key, title, rule,
  metadata, scene line, collision-audit entry, master, sidecar, both public
  webps, the roadmap's table row and every assertion that named it. Deleting a key
  from the *middle* of `BADGE_CATALOG` is the one edit the append-only rule does
  not cover: `year_end` inherited index 10 and `tolkien` moved 13 → 12. Nothing
  persisted carries an index, so the blast radius is two positional assertions in
  `check-gamification.ts`. An award row left under the dead key is inert — no
  title, dropped from the shelf with a warning, deleted by `--prune`. The
  production dry run found none.

### Known gaps

- `npm run dates:check` fails on Node 22's ICU, which formats "Sunday 9 August"
  where the assertion expects the comma an older ICU emitted. It fails
  identically on v0.1.0; no date file changed in this release.
- The prefetch half of the `/today` change has **no** check-script coverage on
  purpose: Playwright boots `npm run dev`, and Next returns early on viewport
  prefetch outside production. The verification is a production build and the
  Network panel, and the procedure is in the design doc.
- Left-joining `shares` into `getVocabEntryDetail` would save a third round trip
  for free, but `getShareForEntity` is a documented F16 decision; left as a
  one-line follow-up rather than folded in silently.

## [v0.1.0] - 2026-08-09

First tagged release. Twenty-two feature plans, F1 through F22, from an empty
repository to a deployed PWA at `dword.site`.

### Added

**Foundation and shell (F1, F2)**

- Next.js 15 / React 19 app on Neon Postgres via Drizzle, Google-only sign-in
  through NextAuth, and the complete schema for every later feature in one
  migration set.
- The shared LLM client (`lib/llm/`), one prompt module per feature, GLM through
  z.ai. Exactly one repair retry per call, never a loop.
- The mobile UI kit and design tokens — the frozen contract is
  `src/components/README.md`. `/kitchen-sink` renders every component and every
  screen state for layout tests.
- `import 'server-only'` at the top of `lib/db/`, `lib/llm/` and `lib/env.ts`, so
  an API-key leak is a build error rather than a shipped bundle.

**Vocabulary (F3, F4, F8, F14, F19)**

- `/vocab/new`: one model call validates a term, corrects likely typos
  (*genteell → genteel*), and returns part of speech, pronunciation, definition
  and usage examples, all persisted on write.
- `/vocab` collection and `/vocab/[id]` detail as a page, not a modal, with the
  "I have mastered this" toggle that retires a word from daily cards.
- Discover: profile-tuned suggestions, deduplicated against the whole collection
  **including mastered words**, with a per-day limiter.
- Duplicate handling on the add path — exact, normalised and near-duplicate —
  answering with the word it collided with and overrulable in one tap. The accept
  path stays exact-only on purpose (F14 D7).
- `suggested_correction` is drawn wherever the entry is: `/vocab/new`'s
  enrichment card *and* `/vocab/[id]`'s correction banner, so a late reply is
  never stranded on a row tomorrow's card would happily use.
- Collection search that runs in the browser at or below 1,500 rows, writing the
  query to the URL rather than reading from it. The rule itself is
  `lib/vocab/search.ts`, a transcription of the SQL that `vocab:check` drives
  both readings of.

**The daily card (F5)**

- `POST /api/cards` and nothing else creates a card: no cron, no `revalidate`, no
  creation on page load.
- The six-word non-scrolling card, the selection algorithm, `/card/[date]`, and
  the calendar of ticks and crosses.
- Every day boundary is computed in the user's timezone through
  `lib/time/local-date.ts`, the only file that constructs `Intl.DateTimeFormat`
  or does date arithmetic. Reads may fall back to a default zone; writes refuse
  with a 409 rather than date a card by guesswork.

**Chat (F6)**

- One durable session per user per word. The model speaks first, in role, with a
  scenario drawn from the profile, and does not define the word unless asked.
- The 8-turn cap is a conditional `UPDATE … WHERE turn_count < 8` taken *before*
  every model call. A second opener in a round is refused by a partial unique
  index, not by application code.

**Onboarding and profile (F7, F9)**

- Five skippable questions, one per screen, building the profile chat and
  Discover read. Timezone is detected, never asked; `timezone_source = 'manual'`
  means a human corrected it and re-detection leaves it alone.
- `/profile` with streak and collector levels, fourteen badges, and "keeping a
  card since 8 August 2026".
- `user_stats` is a cache and is never displayed ([R11]). Every consumer
  recomputes from `daily_cards` on read and repairs the row.
  `npm run stats:recompute` replays badges through the same pure `evaluateBadges`
  the live path uses.

**Journal (F10, F15)**

- Paste a line worth keeping, get an insight on its meaning and the situations it
  fits — generated once, by an explicit tap, never on page load or on save. The
  slot is claimed by a conditional `UPDATE` before the model call, and both the
  completion and failure writes match on the text as it was at claim time.
- Near-duplicate warning in two layers: a normalised-text hash (free, no
  provider) and pgvector cosine distance over OpenAI embeddings. It warns, never
  blocks, and never loses a save — any failure of either layer falls through to
  the INSERT and reports `unchecked`.
- `journal_entry_embeddings` is a sibling table, never a column, so journal reads
  do not drag float32 vectors out of Neon to render text. No verdict is stored;
  `text_sha` is, and staleness is decided inside the search query.

**Sharing (F16, F17, F18, F20)**

- A share is a snapshot addressed by a slug, and the slug is the capability
  ([S3]). `getShareBySlug` is the one function in the application that reads a
  row without a user id; what replaces `userId` is 80 bits of CSPRNG output that
  exists only because the owner tapped Share.
- Public pages for a word, a daily card and a journal entry.
  `/s/<slug>/<1..6>` addresses a card's words by **position**, never by uuid —
  there is no function on the public path that can express one.
- The claim: a stranger follows a shared word, signs in with Google, and the word
  lands in their collection as `source = 'shared'` with the sharer's enrichment
  copied off the snapshot. Zero model calls, and it never re-onboards an
  established user.
- Revoked slugs and slugs that never existed are the same page, the same 404 and
  the same sentence.

**Badge and level art (F12, F13, F21, F22)**

- The `/generate-badge-art` skill: a locked style contract, an offline generator
  that parses it, a grader that takes nine measurements, and a promoter that
  writes both manifests.
- Fourteen badge medals and, from the same pipeline, seventeen level
  illustrations — one per band in `STREAK_LEVELS` and `COLLECTOR_LEVELS`.
- Exactly one modal in the app: a native `<dialog>` on `/profile`, opened by
  tapping a badge row or a level row, with a full-bleed art hero on the art's own
  sampled plate colour. Every destructive action still uses the two-tap arm.
- Filenames carry the first 8 hex of the master's SHA-256, which is the only
  reason `next.config.ts` may serve them `immutable` for a year.

**Navigation (F11)**

- The word-detail back link names where the user came from, carried as
  `?from=<token>` and resolved server-side against a closed whitelist. No code
  path builds an href *out of* the query value, so an open redirect is
  structurally impossible rather than mitigated.

**Verification**

- Twenty-odd offline check scripts (`vocab:check`, `dates:check`, `nav:check`,
  `chat:check`, `discover:check`, `journal:check`, `share:check`, `claim:check`,
  `badges:check`, `stats:check`) plus their `:db` counterparts that seed and roll
  back fixtures, and `:dry-run` tools that put the real prompts against the live
  model with no writes.
- A Playwright layout suite driven from `/kitchen-sink`, including the no-scroll
  spec that owns the card's height budget.

### Fixed

These are bugs found and fixed inside this release, kept because each was
invisible to everything that was passing at the time.

- **Unlayered CSS in `globals.css` beat every utility class.** A bare
  `button { font: inherit }` rendered every `Button` in the app in inherited
  serif with `text-paper` dropped. Element rules now live in `@layer base`.
- **A zod value import from a client component** shipped the whole of zod to
  `/vocab/new` — 73 kB to 4.6 kB once it was type-only.
- **The collection search field ate keystrokes.** One state slot meant both "what
  we asked the URL to become" and "what the server says it is", and a
  render-phase sync read the round-trip-long disagreement as "the URL moved
  underneath us", reverting the field one keystroke at a time.
- **"Keep it anyway" wiped a line the user had started typing** while the
  duplicate warning was up. No single function was wrong, which is why
  `journal-duplicate.spec.ts` exists.
- **`navigator.share` was handed a `text` field**, and iOS concatenates it onto
  the URL for every plain-text target including *Copy* — so the clipboard got
  `"genteel https://…"` and Safari searched for it instead of navigating. Only
  `text` was dropped; the sheet keeps its heading.
- **`/card/[date]` used a shape test instead of a date test**, so `2026-13-99`
  walked into a `date` comparison and a 500 where the honest answer is 404. The
  guard is now `isLocalDate`.
- **React `autoFocus` inside a `<dialog>`** made the dialog record a child of its
  own as the focus-restoration target, dropping focus to `<body>` on close. And
  `showModal()` picks the first *focusable area* — Chromium counts a scroll
  container — so the panel opened announcing a scrollable region instead of its
  content. Both are fixed by focusing a named element after `showModal()`.
- **Two `<dialog>` elements on `/profile`**, one permanently empty, when the
  level blocks and the badge shelf each mounted their own. The single instance
  now lives in a provider between them.
- **The hero `<img>` in flow** had no definite height to resolve `height: 100%`
  against, so the band drew at 330px instead of 185 while its computed style
  still read `16 / 9`. The layout spec asserts the measured height, not the
  ratio.
- **`/today`'s header went to 117px with a three-digit streak** when a second
  trailing control was added on an estimate. All eighteen no-scroll assertions
  would have stayed green. The date eyebrow links to `/card/[date]` instead.

### Changed from the roadmap

The roadmap is authoritative and amendable. Two of its statements were overruled
during this release and both are recorded in place rather than quietly dropped:

- **Sharing shipped.** `ROADMAP_v0.1.0.md` § "Explicitly out of scope for v0.1.0"
  names *"Sharing, social features, following, leaderboards"*. F16–F18 were
  scoped in `plans/F11-F18-BRIEF.md` on a direct user request; the social half —
  following, leaderboards — remains out.
- **The badge table has fourteen rows, not thirteen** ([R22]). `tolkien` was
  added on a direct request and is the worked example for adding a badge.
- F17's own plan (D2) wanted the claim cookie set by a server action immediately
  before `signIn()` and named that its riskiest assumption. It was replaced by
  the route handler its own fallback described, and measured on 2026-08-09:
  `Set-Cookie` rides the 307 out and the action's delete rides the 303 back.
- `text-embedding-3-large` was measured and **rejected** at 1536 and at 3072
  dimensions. It weights lexical overlap more heavily and every dangerous false
  positive in the corpus is lexically similar with an opposite claim. A bigger
  embedder is not a better one here.

### Known gaps

- **There is no cron.** Nothing runs on a schedule: not card creation, not
  `stats:recompute`, not embedding backfill. Every one is an explicit command.
- `x-vercel-ip-timezone` availability on Vercel's free tier is still unverified;
  it is F7's second-choice timezone fallback.
- The collection's back navigation restores the filtered list but has never
  restored the **scroll offset** — `.dw-pane-scroll` is an inner pane and scroll
  restoration restores `window.scrollY`.
- `npm run db:push` must never be run on this schema: extensions are invisible to
  Drizzle's differ, and `CREATE EXTENSION` lives in a custom migration ordered
  before the journal embedding table.
- `/levels` must never become a route. The middleware exemption is
  prefix-matched, so a `levels` route would exempt `/levels-explained` too;
  `badges:check` §12 fails if any directory under `src/app` starts with `badges`
  or `levels`.
- `npm run stats:recompute --prune` is the only destructive operation in the app
  and refuses to combine with `--all` without `--force`.

[v0.1.0]: https://github.com/miftahulmahfuzh/daily-words/releases/tag/v0.1.0
[v0.2.0]: https://github.com/miftahulmahfuzh/daily-words/releases/tag/v0.2.0
