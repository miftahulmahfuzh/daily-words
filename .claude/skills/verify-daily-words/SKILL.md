---
name: verify-daily-words
description: Prove a Daily Words change works by driving a real, throwaway copy of it (its own next dev on a free loopback port, its own Postgres database with pgvector, three seeded users with database sessions, the real z.ai LLM under a per-run call budget, a local fake push service that decrypts what the hourly tick sends) and capturing evidence. Use before reporting any src/, drizzle/ or scripts/ change as done, when a plan's Proof section names feature-map entries, when a verifier must confirm another agent's work, or to reproduce a bug on main. Never touches the production Neon database (.env.local), real push endpoints, Google sign-in, Vercel, the GitHub Actions reminder workflow or the owner's dev server on port 3200; OpenAI embeddings only behind --embed.
---

# verify-daily-words

"Tests pass" is not proof: the `:check` scripts are offline assertions and the `:db` scripts read
`.env.local`, which is the production Neon database. Proof is the code under test, running, doing
what the user does, with the action and the resulting state saved as evidence a reviewer can open.
Everything goes through one script, run from the checkout (or worktree) being verified:

```sh
V=.claude/skills/verify-daily-words/scripts/verify.sh
$V            # usage
```

The script is bash (shebang), so the zsh the Bash tool may run does not matter. Never hand-write
launch sequences, never `npm run dev` for verification (it serves `.env.local`), and never
`pkill node` / `pkill -f "next dev"`: the owner's server and other runs look the same.

## Launch

```sh
$V up                 # real z.ai, 20-call budget: prints the seed summary, RUN= URL= EVIDENCE= MODE=  (~13 s)
$V up --llm=40        # a bigger z.ai budget
$V up --offline       # every z.ai call is refused before it leaves (plumbing only, NOT proof)
$V up --embed=3       # also allow OpenAI embeddings (journal dedup layer 2), 3 calls; needs EMBEDDING_API_KEY
```

What a run is:

- **Postgres**: database `v_<run>` in the Docker container `daily-words-pg-verify`
  (`pgvector/pgvector:pg16`, 127.0.0.1:55439, created on first use, left running, trust auth on
  loopback). Migrated by the repo's own `drizzle-kit migrate` (postgres-js reaches a local
  Postgres over TCP, so no driver shim is needed), including 0004's `CREATE EXTENSION vector`.
- **App**: a snapshot of the checkout (rsync without `.env*`, `.vercel`, `.git`, `.claude`,
  `.github`, docs, design, plans, assets, tools; `node_modules` hard-linked) served by its own
  `next dev --turbopack` bound to 127.0.0.1 on a free port and **addressed as `localhost:PORT`**
  (see Gotchas). `up` returns once `/today` answers 200 signed in.
- **Users** (`--as NAME` on `api` and `ui`; default `demo`):
  - `demo`: the README's own seeder, `scripts/seed-demo.ts`, run inside the snapshot with the run's
    env: Barnaby (`barnaby@demo.invalid`, Asia/Jakarta), 29 words, 39 cards made through
    `createCard`, streaks and 21 badge awards from `recomputeUserGamification`, five journal lines
    (the first with an insight), one mid-round chat, three shares (word, card, journal). **Today's
    card is deliberately not made.**
  - `stranger`: onboarded, birthday asked, an empty collection: the reader and claimer of shares.
  - `newcomer`: a user plus a bare profile (what Auth.js's `createUser` leaves), not onboarded.
  - Sessions are `sessions` rows with random tokens (the seeder's fixed token is replaced), sent as
    the `authjs.session-token` cookie. Auth.js is not bypassed: `strategy: 'database'` reads the row.
- **Stand-in** (`scripts/standin.mjs`, loopback): the paid-call budget, and a fake push service on
  HTTPS (a per-run certificate the app trusts through `NODE_EXTRA_CA_CERTS`) that checks the VAPID
  key and decrypts each notification (RFC 8291) with the device key it minted.
- **Egress guard** (`scripts/preload.mjs`, `NODE_OPTIONS=--import` in every Node process the run
  starts): wraps `fetch`, `http.request/get` and `https.request/get`; loopback and the font CDN pass,
  z.ai and the embeddings host take one call from the budget, everything else is refused and logged.
- **Env**: every process starts from `env -i` with only the run's values: `DATABASE_URL` is the
  run's database, `AUTH_SECRET`, `CRON_SECRET` and the VAPID pair are minted per run, `AUTH_GOOGLE_*`
  are placeholders, `APP_URL` is the run's URL, and from `.env.local` only `LLM_BASE_URL`,
  `LLM_MODEL` and (when the budget is above 0) `LLM_API_KEY` are read.

Runs are isolated: parallel verifiers each `up` their own. Measured 2026-11-04: two runs up at
once, a word added in one, absent from the other's database.

## Doctor

```sh
$V doctor RUN
```

Read-only. Checks the stand-in and its push sink, that `next` is alive and owns its port (process
group, not a name), who holds 3200 (reported, never touched), each user's session (`demo` and
`stranger` 200 on `/today`, `newcomer` 307 to `/onboarding`), the database counts, that every push
subscription points at this run's sink, the mode and budget, and the egress fence: from a process
with the server's exact env and preload, `api.github.com`, `web.push.apple.com`,
`accounts.google.com`, `console.neon.tech` and an `https.request` to FCM must be `blocked`, and the
sink must answer 404 over trusted HTTPS. Run it before the first drive and after any surprise.

- `code WARN HEAD moved` / `working tree changed since up`: the snapshot is stale. `down` + `up`.
- `budget SEEDING`: `up` died before arming; `down` it.
- `egress N paid call REFUSED POST https://api.z.ai`: calls the budget refused (spent, or offline).
- `egress 1 egress BLOCKED GET https://registry.npmjs.org`: Next dev's version check. Expected.

## Drive

| Surface | Command | Notes |
| --- | --- | --- |
| Web page (text) | `$V api RUN [--as USER\|--anon] GET /path` | HTML saved whole; the visible text (aria-labels as `[label]`) printed, plus `set-cookie` and `cache-control`. |
| HTTP route | `$V api RUN [--as USER\|--anon] POST /api/... '{json}'` | Cookie + same-origin `Origin`. JSON in, status and body out. |
| Browser | `$V ui RUN steps.mjs [--as USER\|--anon] [--width 375] [--height 667] [--theme light\|dark] [--tz Asia/Jakarta] [-- ARG...]` | Playwright, fenced network, no permissions. Video, screenshots, console errors. Default is the iPhone SE 3 (375x667), the design target. |
| Layout suite | `$V layout RUN [tests/e2e/x.spec.ts ...]` | The repo's own `tests/e2e` against this run; see [layout.md](features/layout.md). |
| Push | `$V push RUN subscribe [--gone] [--as USER]` / `$V push RUN inbox` | A device on the fake push service, registered through `POST /api/push/subscription`; the inbox is what it received, decrypted. |
| Tick | `$V tick RUN [--secret=WRONG]` | `POST /api/push/tick` with the run's own `CRON_SECRET` (what the GitHub workflow's curl sends). |
| State | `$V sql RUN [--value] "select ..."` | Read-only transaction; writes are refused. `--value` prints one bare cell, for `ID=$($V sql RUN --value "select id …")`. |
| Server log | `$V logs RUN [REGEX] [N]` | Matching `next.log` lines (default: errors, refusals, blocks). |
| Budget | `$V budget RUN` | Paid calls spent / left / refused, and each one made. |
| Log | `$V note RUN "what this proved"` | Appends to `evidence/LOG.md`. |

A steps file (the ones in `features/steps/` run as they are; put ad-hoc ones in the scratchpad):

```js
const steps = async ({ page, context, base, shot, log, allow, args }) => {
  await page.goto(`${base}/today`, { waitUntil: 'networkidle' }) // let it hydrate
  await page.getByRole('button', { name: 'Make today’s card' }).click()
  await page.getByTestId('daily-card').waitFor({ timeout: 60_000 })
  log(`rows: ${await page.getByTestId('daily-card-row').count()}`)
  await shot('card')
}
export default steps
```

`allow(/status of 404/)` declares a console error the journey causes on purpose. Use roles,
aria-labels and test ids: `grep -rhoE 'aria-label="[^"]+"|data-testid="[^"]+"' src | sort -u`; the
share and claim copy is in `src/lib/share/policy.ts` and `src/lib/share/claim.ts`. Never
coordinates. `ui` fails on a console error, a page error, ending on `/signin` while signed in, or
horizontal scroll. Wait on the app's own signal (the turn meter's aria-label, "finding it…" going
away, "Practise again" appearing), never on a URL alone: `/today` redirects twice for a newcomer.

Examples, one per surface:

```sh
$V api RUN GET /today                                   # "13 day run ... No card yet ... Make today’s card"
$V api RUN --anon GET /s/<word slug from 00-seed.txt>   # 200, the word, "Practise this word", no cookie
$V ui RUN .claude/skills/verify-daily-words/features/steps/vocab-add.mjs -- lugubrious
$V layout RUN                                           # 99 passed, 3 skipped; then onboarding.spec 4 passed
$V push RUN subscribe && $V tick RUN && $V push RUN inbox
$V sql RUN "select term, enrichment_status, source from vocab_entries order by created_at desc limit 3"
```

The seed's ids and slugs are in `evidence/00-seed.txt` (also printed by `up`).

## Targeted, not exhaustive

z.ai is the product (enrichment, the non-English lookup, the chat, Discover, journal insights), so
it is real by default, under a per-run budget of **20 calls** (`--llm=N` to change). Every fetch to
the configured `LLM_BASE_URL` host takes one call from the stand-in; an empty budget makes the fetch
fail like a vendor outage, and the app shows its own failure state. Pick the feature-map entries the
change touches; the index lists what each journey spends. Measured costs (2026-11-04):

| Journey | z.ai calls |
| --- | --- |
| `up` (seeding makes none) | 0 |
| make today's card, share, claim's write, profile, onboarding, push, `layout` | 0 |
| add an English word (enrichment) | 1 |
| non-English lookup + add | 1 (the add copies the signed answer, no second call) |
| chat: opening a word's scene / each reply | 1 / 1 |
| chat: one full round (opener, 7 replies, verdict) | 9 |
| Discover: "Pick a new word for me" + Keep | 2 (1 batch, 1 enrichment; "Another" walks the batch free) |
| journal insight | 1 |
| claim, landing on the word's chat | 1 (the opener) |
| a call that fails upstream | 2 (the SDK retries once; each attempt is a fetch) |

Embeddings (OpenAI, `EMBEDDING_API_KEY`) are peripheral: they only decide whether a journal line
near-duplicates an older one by meaning, and a missing key degrades to "unchecked" by design. Off
unless `--embed[=N]` (default 5 when bare). Never raise a budget to make a journey pass; a journey
that needs more calls than the table says is a finding.

## Evidence

Everything lands in `~/.local/state/daily-words-verify/<RUN>/evidence/`, numbered in drive order:
`NN-api-*.txt` (+ `.html`), `NN-ui-*.{txt,png,webm}`, `NN-layout-*.txt`, `NN-push-*.txt`,
`NN-tick-*.txt`, `NN-sql-*.txt`, `NN-logs-*.txt`, `00-seed.txt`, `LOG.md`, and after `down`:
`zz-next.log`, `zz-standin.log` (every paid call, push device and delivery), `zz-seed.log`,
`zz-migrate.log`, `zz-budget.json`, `zz-push-inbox.jsonl`, `zz-meta`.

Proof standards:

- Drive the real user path: the page, button or route the user touches, not a lib function or a
  test hook. Writes go through the app (`ui`, `api`, `push subscribe`, `tick`). `sql` only reads.
- Capture the action AND the resulting state. A 200 is not proof that a word exists: read the row
  back with `sql`, and re-render the page that shows it.
- For a bug fix, show the failure first (a run from `main`, or before the fix), then the pass.
- LLM output is nondeterministic: assert on structure (`enrichment_status`, `examples` length,
  `chat_messages` kinds and the turn count, `insight_status`, the budget counter) and quote text only
  as support. One miss earns one re-run; two misses are a finding.
- **Read the PNGs.** A green `ui` exit only means nothing threw.
- A step you could not drive is `inconclusive` with its reason. Never weaken a journey to make it
  pass. A `MODE=offline` run is not proof of anything that needs a model.

The report you hand back lists the evidence files that prove each claim, one line each.

## Cleanup

```sh
$V down RUN       # kills exactly the process groups up started, drops v_<run>, deletes the snapshot
$V down --all     # every run still up
$V ls             # runs, state, mode, evidence count
```

Evidence survives `down`. Run `down` after every run, failed ones included. The container
`daily-words-pg-verify` stays up for the next run; it holds nothing but `v_*` databases.

## Feature map

`features/README.md` indexes what the app does and what proves each feature works, one file per
feature. A plan's **Proof** section names entries from it. A change that adds or alters a
user-facing feature updates its entry in the same change. A journey that fails because the app is
wrong is a product bug: report it, do not edit the entry to match.

## Gotchas

- **Never driven, no flag turns them on (harmful):**
  - The production Neon database. `.env.local`'s `DATABASE_URL` is production and there is no dev
    instance. The snapshot has no `.env*`, the server env never holds that URL, and every Neon host
    is refused by the guard. This rules out **every `npm run` script with `--env-file=.env.local`**
    (`*:db`, `*:dry-run`, `push:send`, `demo:seed`, `demo:capture`, `stats:recompute`,
    `journal:embed`, `journal:similarity`, `selection:check`, `llm:check`, `vocab:enrich`) and
    `db:migrate` / `db:push`. A verify run uses the demo seeder only inside its snapshot, with the
    run's env.
  - Real push endpoints. `npm run push:send` sends to the owner's real devices and is never run.
    In a run, the VAPID pair is minted per run (no real subscription was made against it), the
    browser is never granted notifications (so it never creates a subscription or contacts FCM),
    `push subscribe` registers only the stand-in's endpoints, `doctor` fails if any subscription
    points elsewhere, and the guard refuses `https.request` (what `web-push` uses) to any
    non-loopback host. That is three structural reasons plus a fence, not a fence alone.
  - The scheduler. `.github/workflows/push-reminders.yml` curls production's `/api/push/tick` with
    the production `CRON_SECRET`; nothing here dispatches it or knows that secret. `tick` drives the
    run's own route with the run's own secret.
  - Google sign-in (`AUTH_GOOGLE_*` are placeholders, the browser aborts `accounts.google.com`;
    sessions are seeded rows), Vercel (no `.vercel` link, no `VERCEL_*`, `APP_URL` is the run), and
    the owner's real account (`barnaby@demo.invalid` and `*@daily-words-verify.invalid` exist only
    in `v_<run>`).
  - The badge-art tooling (`tools/gen_badge_art.py` spends `OPENAI_API_KEY` / `OPENROUTER_API_KEY`;
    `make_badge_assets.py` rewrites tracked `public/**` and manifests) and `stats:recompute --prune`.
    Not excluded by a fence: nothing in a run calls them, and a verifier must not either.
- **Off unless a flag opts in:** OpenAI embeddings (`--embed`). Without it `EMBEDDING_API_KEY` is
  empty, `[journal.dedup] layer 2 unavailable` is logged on every journal save and the verdict is
  `unchecked` or layer 1's: the expected end state, not a bug. **This machine's `.env.local` has no
  `EMBEDDING_API_KEY`, so `--embed` refuses to start here** (measured; inconclusive until a key exists).
- **Port 3200 and verify runs coexist like this** (decided 2026-11-04, nobody to ask): CLAUDE.md's
  rule governs the owner's `npm run dev`, which serves `.env.local` from the checkout and must stay
  on 3200. A verify run is a different server: its own snapshot directory (two `next dev`s in one
  directory share `.next`), its own database, a free port the OS picks (never 3200, refused
  explicitly), bound to 127.0.0.1 only, recorded by process group and killed by `down`, listed by
  `ls`. It never stops, reuses or drives whatever listens on 3200; `doctor` only reports it. The
  failure CLAUDE.md warns about (Playwright's `reuseExistingServer` picking up a stray server on
  3200) cannot happen through `layout`, which drops `webServer` and points `baseURL` at the run.
- **The run is addressed as `localhost`, bound to 127.0.0.1.** `next dev` reports every request's
  `req.url` as `http://localhost:PORT` whatever the Host header said, so `/s/<slug>/claim`'s
  `NextResponse.redirect(new URL('/claim', req.url))` moved a browser on `127.0.0.1` to another
  cookie origin, dropping the session (measured). Production builds `req.url` from the real host,
  so this is a dev artefact, not a product bug.
- **Decided here, because the code cannot say (2026-11-04):** z.ai is the product, so it is real by
  default at 20 calls (one full chat round is 9); embeddings are peripheral and off; the budget
  counts fetches, so a call that fails upstream costs 2.
- **What cannot be produced locally:** a browser push subscription. Headless Chromium reports
  `Notification.permission === "denied"`, so `/profile/edit` draws its denied copy ("Notifications
  are turned off for Daily Words…") and no switch: that is the end state to assert. The
  subscription body is posted by `push subscribe` to the same route the switch would call. The iOS
  Home-Screen install path (CLAUDE.md) is a phone, not this harness.
- **Time-of-day dependent:** the tick only sends between 07:00 and 19:59 in the user's zone, once per
  slot. Outside that window for Asia/Jakarta, move the user (see
  [push-reminders.md](features/push-reminders.md)) rather than waiting.
- **One-shot state in a run:** `demo`'s card for today (the second `today-card` finds a card),
  `newcomer`'s onboarding (run `layout` first: `onboarding.spec` needs an un-onboarded user), and a
  push slot once delivered. `down` + `up` for a clean slate (13 s).
- **`api` shows the visible HTML, and a `notFound()` page's sentence is not in it** under
  `next dev`: `/s/<bad slug>` answers 404 with only "Daily Words" visible, the "This link is not
  available" copy being in the RSC payload. Assert the 404 status with `api` and the copy with `ui`
  (`share.mjs` does).
- The snapshot does not follow your edits. `down` + `up` after changing the app.
- The first hit on each route compiles it (0.3-4 s). Steps use `waitUntil: 'networkidle'` before
  tapping: a tap before hydration is dropped, and so is one during a `router.refresh()` re-render
  (`journal-line.mjs` waits after its first save for that reason).
- `layout`'s Playwright browser is the suite's own, not the fenced one. It only loads the run's
  pages (`/kitchen-sink/*` and the signed-in journal), which fetch nothing off-origin.
