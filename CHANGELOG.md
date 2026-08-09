# Changelog

All notable changes to Daily Words are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries name the feature plan (`F<n>`) that shipped the work, because the plans in
`plans/` and the decisions in `ROADMAP_v0.1.0.md` are where the reasoning lives.
Where a decision has a reconciliation number — `[R1]`, `[S3]` — it is cited rather
than restated.

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
