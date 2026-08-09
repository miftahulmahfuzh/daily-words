# Daily Words — working notes

## Port 3200 is the only port

`dev`, `start` and the Playwright `baseURL` are all hardwired to **3200** (3000
and 3100 are taken on this machine). **Never start a server on another port to
work around a busy 3200.** If something is already listening, kill it:

```bash
ss -ltnp | grep 3200        # find the pid
kill <pid>
```

Picking a fresh port each session leaves a trail of orphaned `next-server`
processes and hides the actual problem. Two specific ways this bites:

- `playwright.config.ts` sets `reuseExistingServer: true`. A leftover
  **production** `next start` on 3200 gets reused, `/kitchen-sink` is gated off
  in production, and all 18 layout tests fail with a misleading
  "waiting for locator" timeout that looks like a layout regression.
- `pkill -f "port 3298"` does not match `next dev --turbopack --port 3200 --port 3298`.
  Kill by pid, not by pattern.

## Commands

```bash
npm run dev              # 3200
npm run typecheck        # tsc --noEmit
npm run lint
npm run build
npm run test:layout      # the no-scroll spec; boots its own dev server on 3200
npm run db:generate && npm run db:migrate
npm run llm:check                        # smoke-test z.ai through the shared client
npm run vocab:enrich -- "genteell"       # run the F3 prompt, no database writes
npm run dates:check                      # F5's day-boundary + calendar assertions, offline
npm run nav:check                        # F11's back-origin whitelist and href round trip, offline
npm run selection:check                  # 300 real draws; seeds and rolls back a fixture
npm run profile:check                    # F7's prompt-context and timezone assertions, offline
npm run chat:check                       # F6's turn policy, sanitiser and prompts, offline
npm run chat:db                          # F6's turn cap and rounds; seeds and deletes a fixture user
npm run chat:dry-run -- "genteel"        # the three chat prompts against the live model, no writes
npm run discover:check                   # F8's dedup fold, prompt and limiter, offline
npm run discover:db                      # F8's mastered-blocks-suggestion and source rules
npm run discover:dry-run                 # the suggestion prompt against the live model, no writes
npm run journal:check                    # F10's schemas, cursor, grouping and prompt, offline
npm run journal:db                       # F10's insight claim, edit rules and paging; seeds fixture users
npm run journal:dry-run -- --all         # the insight prompt against the live model, no writes
npm run badges:check                     # F12's badge-art manifest, files, hashes and key scan, offline
npm run stats:check                      # F9's streaks, levels, badges and reveal queue, offline
npm run stats:db                         # F9's hook, idempotence and backfill; seeds two fixture users
npm run stats:recompute -- --all --dry-run   # rebuild user_stats and replay badges
```

`npm run stats:recompute` takes `--user=<uuid|email>`, `--all`, `--dry-run`,
`--prune` and `--force`. `--prune` is the only destructive operation in the app
and refuses to combine with `--all` without `--force`. Run it after any change to
`lib/gamification/badges.ts`, and never on a schedule — there is no cron in
v0.1.0.

`npm run discover:dry-run` takes `--profile full|partial|empty|none`,
`--avoid a,b,c`, `--count N` and `--runs N`. One model call per run. The words it
returns are the feature; read them against F8 §7's rules rather than trusting the
exit code, which only reports transport.

`npm run chat:dry-run` takes `--profile full|partial|empty`, `--round N` and
`--reply "…"`. Four model calls per run; it is the tool for F6's prompt-tuning
pass, and the prompts are the feature.

`npm run journal:dry-run` takes a line as its argument, `--note "…"` and
`--all` (five calibration lines: the worked example, an Indonesian proverb, a
literary line, a bleak one, and an injection attempt). One model call per line.
Read the output against F10 §7's register rubric — no flattery, no second
person, no exclamation, concrete situations — rather than trusting the exit
code, which only reports transport.

## Badge art and `OPENAI_API_KEY`

Badge medals are raster art generated offline by the `/generate-badge-art` skill
(`.claude/skills/generate-badge-art/`). The style contract and the fourteen scene
lines live in that skill's `style.md`, which `tools/gen_badge_art.py` **parses** —
the `<!-- STYLE BLOCK vN -->` and `<!-- SCENES -->` markers are an interface, and
a marker only counts when it is alone on its own line.

```bash
python3 tools/gen_badge_art.py --dry-run --all      # assemble every prompt; no key, no network, no file
python3 tools/gen_badge_art.py <key> --reference assets/badges/_anchor.png
python3 tools/check_badge_art.py <candidate.png>    # 9 measurements + the 3 crops to look at
python3 tools/make_badge_assets.py                  # promote masters → public/badges/** + the manifest
```

**`OPENAI_API_KEY` is a different key from `LLM_API_KEY`.** The app's model access
is GLM via z.ai; this is OpenAI's image API, a different provider and a different
bill. It lives in `.env.local` and is read by `tools/gen_badge_art.py` **and by
nothing else** — `src/lib/env.ts` has no entry, and `grep OPENAI_API_KEY src/`
must stay empty. `npm run badges:check` asserts that emptiness, so the rule is
checked rather than remembered.

Three things drift-proof the deck, each by a different mechanism:

| Drift | Caught by |
|---|---|
| A badge key with no art | `npm run typecheck` — `BADGE_ART` is a total `Record<BadgeKey, BadgeArt>`, never `Partial<>` |
| Art with no badge key, a stale hash, a lost style version | `npm run badges:check` |
| A scene line with no key, or a key with no scene line | `gen_badge_art.py` refuses to start |

`public/badges/*` filenames carry the first 8 hex of the master's SHA-256. That is
the **only** reason `next.config.ts` may serve them `immutable` for a year:
regenerating a badge changes the bytes, the hash and the filename, so every cache
misses correctly. Do not extend that header to a path whose names are not
content-hashed. `src/middleware.ts` excludes `badges` from the auth matcher —
badge art is committed art, not user data, and F16–F18 serve it to strangers.

Adding badge #15: add the key to `BADGE_CATALOG`, add one `- <key>: <scene>` line
inside `<!-- SCENES -->` in `style.md`, add its `condition` and `gloss` to
`src/lib/gamification/badge-meta.ts`, run `/generate-badge-art <key>`, promote
**both** the `.png` and its `.txt` sidecar (the sidecar carries the style version,
and losing it makes a mixed deck undetectable), then
`python3 tools/make_badge_assets.py`. Never edit `src/lib/gamification/badge-art.ts`
by hand. Between adding the key and promoting the art, `npm run typecheck` is red
on `badge-art.ts` and `badge-meta.ts` — that is both parity guards firing, not a
mistake. Badge #14 (`tolkien`) was added exactly this way and is the worked
example.

## There is exactly one modal in the app

`src/components/gamification/badge-dialog.tsx`, on `/profile`, opened by tapping a
badge row. A native `<dialog>` + `showModal()`, so the focus trap, Escape, the
backdrop and focus restoration are the UA's rather than the app's. It is in the
**top layer** — outside `.dw-screen`'s flex column and its `overflow: hidden` —
which is what exempts it from [R19]'s height budget, and
`npm run test:layout` asserts that with the dialog open rather than assuming it.

Two things bite here and neither throws:

- **`.dw-badge-dialog[open]`, never bare `.dw-badge-dialog`.** A bare
  `display: flex` beats the UA's `dialog:not([open]) { display: none }`, and the
  closed element then sits on the page as an empty bordered box.
- **No React `autoFocus` inside a `<dialog>`.** React focuses on *mount*, one
  commit before the effect calls `showModal()`, so the dialog records a child of
  its own as the element to restore focus to — and that child is unmounted on
  close, dropping focus to `<body>`. `showModal()` already focuses the first
  focusable descendant.

Every *destructive* action still uses `ToggleRow`'s two-tap arm. The ban this
relaxes was about confirmation modals; see [R22]'s neighbours and F13 D5.

`scripts/profile-peek.ts` is the F7 verification helper — `show`, `unonboard`,
`onboard`, `tz <zone> [manual]`, `clear`, `delete`, `context`. Run it with
`tsx --conditions=react-server --env-file=.env.local`.

## Authority order for the docs

1. `ROADMAP_v0.1.0.md` § **Reconciliation Decisions** ([R1]–[R21]) — wins over
   everything, including the rest of that file.
2. `ROADMAP_v0.1.0.md` § Locked Decisions and § Database schema.
3. `design/from-claude-design/Daily Words.dc.html` — the visual source of truth
   for layout ([R18]). Its *filler content* is not authoritative ([R20]).
4. `src/components/README.md` — the frozen UI-kit contract. **Read this, not
   `plans/F2-design-system.md`**, which is substantially void.
5. `plans/F*.md` — written in parallel by agents that could not see each other.
   Each plan's header lists which of its sections are superseded.

If a plan contradicts the roadmap, the roadmap wins — stop and report the
discrepancy rather than guessing.

## Traps that fail silently

These were all found by measuring the DOM or the bundle, not by anything
throwing. Each cost real time.

- **Unlayered CSS in `globals.css` beats every utility class.** Put element-level
  rules in `@layer base`. Written bare, `button { font: inherit }` made every
  `Button` in the app render in inherited serif with `text-paper` dropped.
  See `src/components/README.md` § "Two traps worth knowing about".
- **`cn()` must be taught every non-t-shirt-sized `--text-*` and `--tracking-*`
  token** in `src/lib/ui/cn.ts`, or tailwind-merge reads it as a colour and
  silently deletes the size.
- **Never import a zod schema as a value from a client component.** Import the
  inferred type instead. One value import put all of zod in `/vocab/new`: 73 kB
  → 4.6 kB once it was type-only.
- **`import 'server-only'`** goes at the top of everything under `lib/db/`,
  `lib/llm/` and `lib/env.ts`. It is what turns an API-key leak into a build
  error.

## Conventions

- Database columns `snake_case`; TypeScript `camelCase`.
- All Drizzle access goes through `lib/db/queries/<resource>.ts`. `userId` is the
  first parameter of every function there and appears in every WHERE clause;
  components and route handlers never build queries inline.
- Route handlers use `requireApiUser()` + `ok()` / `fail()` from `lib/api/`. The
  error envelope is `{ error: { code, message } }` and `message` is shown to the
  user verbatim.
- Every LLM call goes through `lib/llm/`, one prompt module per feature under
  `lib/llm/prompts/`. No feature constructs its own SDK client, and exactly one
  repair retry is allowed — never a loop.
- zod 4: `z.uuid()`, not `z.string().uuid()` ([R2]).
- Every "day" boundary is computed in the user's timezone. `date` columns are
  read and written as `'YYYY-MM-DD'` strings, never as JS `Date`s. All of it goes
  through `lib/time/local-date.ts` — the only place `Intl.DateTimeFormat` is
  constructed, and the only file allowed to do date arithmetic. `grep toISOString`
  should never find a new hit outside `lib/cards/serialize.ts`,
  `lib/chat/serialize.ts` and `lib/journal/{serialize,cursor}.ts`, where it
  serialises an instant rather than a day.
- Reads may fall back to a default timezone; **writes may not**. `POST /api/cards`
  refuses with 409 rather than date a card by guesswork.
- The daily card is created by `POST /api/cards` and by nothing else. No cron, no
  `revalidate`, no creation on page load.
- The chat's 8-turn cap is a conditional `UPDATE … WHERE turn_count < 8` taken
  **before** every model call, never after. `MAX_ASSISTANT_TURNS` lives in
  `lib/chat/turn-policy.ts` and the literal `8` appears nowhere else. A second
  opener in a round is refused by a partial unique index, not by application
  code — see `npm run chat:db`.
- `app/(app)/layout.tsx` calls `requireOnboardedUser()`, so **every** route inside
  that group is gated on `profiles.onboarded_at`. `/onboarding` is a sibling of
  the group, not a member: putting it inside makes the guard part of its own
  layout chain and every visit an infinite redirect. API routes are outside every
  layout, which is what keeps `POST /api/profile/complete` reachable.
- The user's timezone is detected, never asked. `timezone_source = 'manual'`
  means a human corrected it and automatic re-detection must leave it alone.
- Discovery's `listAllUserTerms` carries **no status filter** — a mastered word
  must still block a suggestion. `lib/vocab/dedup.ts` answers "are these the same
  word?" and is not `lib/vocab/normalize.ts`, which answers "what did the user
  type?"; the two disagree about case, diacritics and punctuation on purpose.
  Under-folding is the correct failure mode: a near-duplicate costs one tap, a
  false collision hides a good word forever.
- The word-detail back link names where the user came from, carried as
  `?from=<token>` and resolved server-side against a **closed whitelist** in
  `lib/vocab/links.ts` — `parseOrigin` narrows to a four-member union or `null`,
  `backTarget` maps a union member (never a string) to a literal `{ href, label }`,
  and no code path builds an href *out of* the query value, so an open redirect
  is structurally impossible rather than mitigated. Absent, unrecognised and
  `collection` all resolve to the Collection, so every pre-F11 URL still says
  what it said. `vocabDetailHref(id, origin)` and `vocabChatHref(id, origin)`
  type `origin` as the union: user input cannot reach them without a cast. The
  chat is not an origin — it *inherits* the word's, or back becomes a two-node
  cycle. Adding a fifth origin means adding a row to `BACK_TARGETS`, not a
  template literal in a producer; `npm run nav:check` fails if the literal
  `from=` appears in any file under `src/` but `lib/vocab/links.ts`.
- `user_stats` is a **cache and is never displayed** ([R11]). `current_streak`
  decays with the passage of time and nothing writes on absence, so every
  consumer — `/profile` and `/today`'s streak pill alike — recomputes from
  `daily_cards` on read and treats the row as a value to verify and repair.
  `lib/gamification/` holds no clock and no `Intl.DateTimeFormat` of its own; it
  converts dates to integers through `lib/time/local-date.ts` and stays there.
  `evaluateBadges` is pure for one reason: the live award path and
  `npm run stats:recompute` call it, and a replay that disagreed with what was
  awarded on the day would be unfixable.
- A journal insight is generated **once**, by an explicit tap, and never on page
  load or on save. The slot is taken by a conditional `UPDATE … WHERE status IN
  ('none','failed') OR (status='pending' AND requested_at < now() - 120s)` before
  the model call — the same discipline as the chat's turn cap — and both the
  completion and the failure writes match on `text = <the text at claim time>`,
  so an insight can never describe a line the user has since edited. Editing the
  text clears the insight; editing only the source note keeps it.
  `lib/db/queries/journal.ts` writes every timestamp with SQL `now()`, never
  `new Date()`: `edited` compares `updated_at` against a `created_at` the
  database wrote, and app-to-Neon clock skew silently decided the answer.
