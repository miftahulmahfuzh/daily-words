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
```

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
  read and written as `'YYYY-MM-DD'` strings, never as JS `Date`s.
