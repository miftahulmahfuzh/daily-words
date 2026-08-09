# F15 — Journal semantic near-duplicate warning

> ## ⛔ STOP AND READ: locked decision [S2] is **falsified by measurement**
>
> The brief locks *"embeddings from z.ai's `embedding-3`, on the `LLM_API_KEY`
> already configured"* and instructs F15 to verify it before the design is
> trusted. **It was verified on 2026-08-09 and it does not exist.**
>
> Evidence, all live HTTP against the key in `.env.local` (the key itself is not
> reproduced anywhere):
>
> | Request | Result |
> |---|---|
> | `GET https://api.z.ai/api/paas/v4/models` | **200** — `glm-4.5, glm-4.5-air, glm-4.6, glm-4.7, glm-5, glm-5-turbo, glm-5.1, glm-5.2`. **No embedding model of any kind.** |
> | `GET https://api.z.ai/api/coding/paas/v4/models` | **200** — identical list. |
> | `POST /api/paas/v4/embeddings` `model=embedding-3` | **400** `{"error":{"code":"1211","message":"Unknown Model, please check the model code."}}` |
> | same, `embedding-2`, `embedding-4`, `embedding-v3`, `text-embedding-3`, `glm-embedding`, `text_embedding` | **400**, code `1211`, every one |
> | `POST /api/coding/paas/v4/embeddings` `model=embedding-3` | **400**, code `1211` |
> | `POST https://open.bigmodel.cn/api/paas/v4/embeddings` `model=embedding-3` | **400**, code `1211` (`模型不存在`) — the mainland platform refuses this key's model too |
> | `POST /api/paas/v4/chat/completions` `model=glm-4.6` | **429** `{"code":"1113","message":"Insufficient balance or no resource package."}` |
> | `POST /api/anthropic/v1/messages` `model=glm-5.2` (**what the app actually uses**) | **200**, real completion |
>
> Two independent blockers, either of which is fatal on its own:
>
> 1. **There is no embeddings model on this platform for this key.** The 1211 is
>    a model-code error, not an auth error — the route exists, the key
>    authenticates, and the catalogue simply has no embedder in it.
> 2. **The key is a subscription entitled to the Anthropic-compatible path
>    only.** `/api/anthropic/v1/messages` answers 200 while
>    `/api/paas/v4/chat/completions` answers 429 *insufficient balance*. Even if
>    an embeddings model appeared tomorrow it would bill against a balance this
>    key does not have.
>
> **Therefore the dimensionality [S2] implies could not be measured, because no
> vector was ever returned.** Everything below is designed against the brief's
> own named fallback — OpenAI `text-embedding-3-small` — with the dimension
> pinned in code and asserted at runtime, and with a first phase that ships the
> whole feature *without any embedding provider at all* so that the useful half
> of it is not held hostage to this.
>
> **This is a stop-and-report per the brief's own rule** ("if one turns out to be
> wrong, stop and report it"). §7.1 states the two questions a human must answer
> before Phase B is executed. Phase A may be executed immediately; it depends on
> no provider.
>
> ### ✅ RESOLVED 2026-08-09 — both §7.1 questions are answered
>
> The stop-and-report was made and the user ruled. **Phase B is unblocked and
> proceeds on OpenAI `text-embedding-3-small`.** The brief now carries this as
> **[S2a]**, which supersedes [S2]; the evidence table above is kept so nobody
> re-runs the experiment.
>
> 1. **May journal text leave for OpenAI? — Yes.** The privacy cost was put to
>    the user as the central objection to this option and they chose it with that
>    stated. Nothing below needs to hedge about it any more. What does still
>    apply: the app has told no user this happens, so if Daily Words ever gains a
>    second human user, a line in the interface saying so is owed.
> 2. **Is [D7]'s split acceptable? — Yes, resolved the first way.**
>    `EMBEDDING_API_KEY` stays a distinct variable and should hold a **separate
>    OpenAI project key scoped to embeddings**, not the badge-art secret pasted
>    into two variables. This keeps [S1]'s invariant (`grep OPENAI_API_KEY src/`
>    empty) true as a *property a script can assert* rather than as an
>    honour-system claim, and it keeps the offline tooling key and the runtime
>    key independently revocable — so rotating one after a leaked transcript does
>    not break the other.
>
> **Still open, and still blocking the migration specifically:** §7.3. The 1536
> width is documented, not observed. Make one curl and count the array before
> generating the `vector(N)` migration.

Give the journal what `POST /api/vocab` already gives the vocabulary: an answer
to "have I kept this already?". The user's words were *"same with vocab. we need
semantic similarity capability to check if a new jurnal that the user inputted
already exist in the jurnal collection. and if we detected it, we should forbid
the user from inputting the new journal"* — softened by **[S4]** from *forbid* to
*warn, show the line you already have, and offer to save anyway*.

**Supersedes:** nothing wholesale. It **amends** `plans/F10-journal.md` §"Save a
line" and the `POST` doc-comment in `src/app/api/journal/route.ts`, both of which
state that a save is unconditional; §2.1 below quotes the comment it overrides
and specifies the amendment word for word. It touches no other plan.

---

## 1. What the feature is, concretely

A user pastes a line and taps Save. Before the row is written, the server asks
one question — *is this the same line as something already in this user's
journal?* — in two layers:

- **Layer 1, free and always available.** A normalised-text hash. Catches the
  re-paste: the same Kindle highlight copied twice, with different whitespace,
  different quote glyphs, a trailing full stop, different case. No network, no
  provider, no key. This is the majority of real duplicates.
- **Layer 2, needs an embedding provider.** Cosine distance over pgvector.
  Catches the same proverb in different words.

If either layer fires, the row is **not** written; the response says
`status: "duplicate"` and carries the entry the user already has. The composer
shows it with **Keep it anyway** and **Never mind**. Keep-it-anyway re-POSTs with
`force: true`, which skips both layers entirely.

If the provider is down, missing, slow or unconfigured, Layer 2 is skipped
silently and the save proceeds. A save is never lost to this feature.

---

## 2. Decisions

### 2.1 [D1] The warning replaces a documented promise, and the comment says so

`src/app/api/journal/route.ts` currently reads, above `POST`:

```
/**
 * Save a line. Auth, validate, one INSERT.
 *
 * No uniqueness on `(user_id, text)` and none wanted: the same saying may be
 * met twice and kept twice, and a rejection at the exact moment the screen
 * promises frictionless saving would be the worst possible trade.
 */
```

That comment is **right and stays**. It is amended, not deleted, to exactly:

```
/**
 * Save a line. Auth, validate, a duplicate check, one INSERT.
 *
 * No uniqueness on `(user_id, text)` and none wanted: the same saying may be
 * met twice and kept twice, and a rejection at the exact moment the screen
 * promises frictionless saving would be the worst possible trade.
 *
 * **Amended by F15 [S4].** The route now looks for a near-duplicate before it
 * inserts — but the sentence above is why it *warns* instead of refusing. A
 * near-duplicate comes back as `{ status: "duplicate", match }` with the entry
 * the user already has and no row written; the composer offers "Keep it
 * anyway", which re-POSTs with `force: true` and skips the check. Three things
 * follow from the paragraph above and none of them may be traded away later:
 *   1. There is still no database constraint. The check is advisory.
 *   2. Any failure of the check — provider down, unconfigured, slow, an entry
 *      never embedded — falls through to the INSERT. Product Principle 5: the
 *      save must work.
 *   3. `force: true` is unconditional. It never re-checks, never rate-limits,
 *      and never asks twice.
 */
```

Nothing else in the file's comments is touched. `plans/F10-journal.md` is not
edited (plans are historical records); this plan is the amendment of record.

### 2.2 [D2] A sibling table, not a column on `journal_entries`

The trade the brief asks to be argued: a sibling keeps `journal_entries` narrow
and lets an embedding be absent or regenerated, but costs a join on every save.

**Sibling table wins, and not on aesthetics — on a measured hot path.**

Every read in `src/lib/db/queries/journal.ts` is `db.select().from(journalEntries)`
with **no column list**: `listEntries`, `getEntry`, and the `.returning()` on
`createEntry`, `updateEntry`, `completeInsight` and `failInsight`. Drizzle
expands that to every column. A `vector(1536)` column is 6 148 bytes on the
wire. `JOURNAL_PAGE_SIZE` is 30, so **the journal list would drag ~180 kB of
float32 out of Neon on every page, every scroll, to render text**. Fixing that
means enumerating columns in six queries and remembering to do so in the
seventh — the exact class of silent regression `CLAUDE.md` catalogues.

The join cost is close to zero in return:

- **Read paths** (`/journal`, `/journal/[id]`) join nothing. They never look at
  the table.
- **The save path** does not join either. It runs one dedicated query that
  already has to touch both tables to return the matching entry's *text*, so
  the join is not additional — it is the query.
- **The backfill** joins, once, offline.

Secondary benefits that follow for free: the embedding can be absent, retried,
regenerated on a model change, or dropped wholesale (`TRUNCATE`) without
touching a single word the user wrote; and `user_id` denormalised onto the
sibling lets the vector search filter by owner without reaching `journal_entries`
at all.

### 2.3 [D3] What is stored is *embeddability*, never a verdict

The brief requires that "we never checked this one" not look like "we checked
and it was unique". It is satisfied structurally, by three distinguishable
states:

| State | Meaning | Backfill |
|---|---|---|
| **no sibling row** | Never attempted. Pre-F15 entry, or a save during a provider outage. | Highest priority |
| `status = 'failed'` | Attempted; the provider refused or timed out. `attempts` counts tries, `failed_reason` says why. | Retried under `--retry-failed`, capped at `attempts < 3` |
| `status = 'ready'`, `text_sha = sha256(entry.text)` | Embedded, and the vector still describes the current text. | Skipped |
| `status = 'ready'`, `text_sha ≠ sha256(entry.text)` | Stale — the user edited the line after it was embedded. | Re-embedded |

**No verdict is ever stored**, and this is deliberate: "unique" is a statement
about a *collection*, and the collection changes with the next save. A stored
`is_unique = true` is wrong the moment a second entry arrives, and a backfill
could not distinguish it from a stale one. What is stored is only "do we have a
current vector for this text", which is a property of the row alone.

The staleness check needs no invalidation write anywhere, because
`sha256(text::bytea)` is computable **in SQL** — verified against this project's
Neon instance (PostgreSQL 18.4, `sha256()` built in since PG 11):

```sql
select length(encode(sha256('abc'::bytea),'hex'));  -- 64
```

So `PATCH /api/journal/[id]` needs **no change at all**. An edit silently makes
the vector stale, the search stops trusting it in the same statement that finds
it, and the backfill picks it up. Contrast with the insight, which needs an
explicit clear in `updateEntry` because a stale insight is *displayed*.

### 2.4 [D4] The check blocks the save. This is the plan's central UX decision.

The composer's header comment is the constraint: *"Paste, one tap, done."*
Adding a network round trip to that screen looks indefensible until you read how
the screen actually works.

**`handleSave` in `src/app/(app)/journal/journal-feed.tsx` already inserts the
row optimistically before the request is sent** (lines 40–70), and
**`submit` in `composer.tsx` already clears the textarea and returns focus
before awaiting** (lines 110–137). The user's tap is acknowledged in the same
frame, by construction. The `await` is observed **only when it fails** — and the
restore-on-failure path already exists and is already correct.

So the honest accounting is:

| | Blocking (chosen) | Non-blocking |
|---|---|---|
| Perceived latency of the tap | unchanged — the optimistic row is already on screen | unchanged |
| Latency before a *warning* can appear | +200–600 ms | seconds, arbitrary |
| The remedy offered | **"Keep it anyway"** — a non-action | **"Delete it?"** — a destructive one, on a row already saved |
| Rows written when the user says no | none | one, then deleted |
| Ids burned, badges/stats touched | none | one row created and destroyed |
| Matches [S4]'s wording | yes — *"a way to save anyway"* | no — it inverts it |
| Cost when the provider is down | the timeout, once, then it saves | the same, later, invisibly |

Non-blocking loses on every row that matters. Its only advantage — never
delaying the response — buys nothing, because nothing on screen is waiting for
the response.

**The blocking call is budgeted, not unbounded.** `EMBED_TIMEOUT_MS = 2500`,
enforced with `AbortSignal.timeout`, and **any** outcome other than a vector in
time falls straight through to the INSERT. The worst case a user can experience
is a save that took 2.5 s and worked — never a save that failed because of this
feature.

One more reason blocking is the cheap option here: Layer 1 costs **zero**
milliseconds of network and catches the common case, so the provider is only
consulted when Layer 1 misses.

### 2.5 [D5] Under-warning is the correct failure mode

`src/lib/vocab/dedup.ts` states its asymmetry and sizes every guard to it:
*"Under-folding is the correct failure mode. A near-duplicate reaching the user
costs one tap on 'Another'. A false collision hides a perfectly good word from
them forever."*

The journal's asymmetry runs the same way and harder:

- **A missed duplicate** costs the user a duplicate row. It is visible, it is in
  the list, and it takes one swipe to delete. F10 already decided that keeping
  the same saying twice is acceptable.
- **A false warning** interrupts the single most frictionless action in the
  application, in front of two lines the user can see are *not* the same. It
  does that on a screen whose entire premise is that nothing gets in the way.
  And the second time it happens the user stops reading the warning — at which
  point the feature has negative value, because it costs a tap and delivers
  nothing.

**Therefore the threshold is chosen at the strict end and the comparison is
strict**: `distance < NEAR_DUPLICATE_MAX_DISTANCE` warns; a distance exactly at
the threshold does not. When the calibration data is ambiguous, take the smaller
number.

### 2.6 [D6] The embedding transport lives in `lib/llm/embed.ts` and has no prompt

`CLAUDE.md`: *"Every LLM call goes through `lib/llm/`, one prompt module per
feature under `lib/llm/prompts/`. No feature constructs its own SDK client."*

An embedding call has no prompt, no system message, no temperature and no
repair retry, so **nothing is added under `lib/llm/prompts/`** — adding an empty
prompt module to satisfy a pattern would be worse than not.

It also cannot use `lib/llm/client.ts`: that is an `@anthropic-ai/sdk` instance
pointed at `/api/anthropic`, and the Anthropic Messages API has no embeddings
endpoint at all. `lib/llm/embed.ts` therefore owns a plain `fetch` to an
OpenAI-compatible `POST /embeddings`. This does not violate the rule — the rule
forbids a *feature* from building its own transport, and `lib/llm/` is where
transports are allowed to live. It is enforced by making `lib/llm/embed.ts` the
only file in the repository that may name an embeddings URL, and by asserting it
in `journal:check` (§6.1).

`import 'server-only'` at the top, like every other file under `lib/llm/`. The
key never reaches a client bundle, and any client import becomes a build error.

`src/lib/llm/client.ts`'s comment "The ONE SDK instance. No feature may
construct its own." gains one sentence naming `embed.ts` as the second,
deliberate transport, so a later reader does not read the two as contradictory.

### 2.7 [D7] The provider key is `EMBEDDING_API_KEY`, never `OPENAI_API_KEY`

[S1] is unambiguous: `OPENAI_API_KEY` is F12's badge-art key and *"no
application code may read it — only the skill's generation tool, which runs
offline on a developer's machine."*

Runtime embeddings on OpenAI would violate that literally. The resolution is a
distinct variable, read by exactly one runtime file:

```
EMBEDDING_BASE_URL=https://api.openai.com/v1
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_API_KEY=…
```

Even where the operator pastes the same secret into both, `grep OPENAI_API_KEY
src/` stays empty and [S1]'s invariant survives as a testable property rather
than a convention. **The human must be told that the two variables may hold the
same secret** — that is a real change to [S1]'s intent and §7.1 raises it.

`EMBEDDING_API_KEY` is `.optional()` in `lib/env.ts`. The application must boot,
build and serve without it — Phase A does exactly that, and CI has no key.

### 2.8 [D8] The dimension is a code constant, not configuration

`vector(N)` fixes N in DDL. A configurable dimension is a configuration value
that can silently disagree with the database, and the failure is a runtime bind
error at the worst moment.

`EMBEDDING_DIMENSIONS = 1536` lives in `src/lib/journal/similarity.ts` as a
plain exported const — 1536 is `text-embedding-3-small`'s native width, so
nothing is truncated, and it is well under pgvector's 2 000-dimension HNSW
ceiling. `embed()` asserts `vector.length === EMBEDDING_DIMENSIONS` and returns a
`config`-kind error on mismatch rather than handing a wrong-width array to
Postgres. `journal:check` asserts the constant equals the schema's declared
width, offline, so a future provider swap cannot change one without the other.

Cosine (`<=>`, drizzle's `cosineDistance()`) rather than L2 or inner product.
OpenAI returns unit-normalised vectors, for which all three rank identically —
so the choice is about the *next* provider, which may not normalise. Cosine is
scale-free and is the only one of the three whose threshold survives a provider
change unexamined.

### 2.9 [D9] Two phases, and Phase A ships without any provider

Phase A depends on no key, no balance and no external service, and it catches
the re-paste, which is the duplicate a user actually creates. Phase B is
additive: one column already exists, one query gains a branch.

- **Phase A** — extension, table, Layer 1 (normalised hash), the whole API
  contract, the whole composer UI, both check scripts. Fully useful, fully
  shippable, zero provider risk.
- **Phase B** — `lib/llm/embed.ts`, the vector search, the backfill, the
  calibration script and the measured threshold. Gated on §7.1's two answers.

The `vector(1536)` column and the extension land in **Phase A's** migration even
though nothing writes them yet: DDL on an empty table is free, and a second
migration later is a second chance to get `CREATE EXTENSION` ordering wrong.

---

## 3. Schema changes

### 3.1 The extension, and exactly how it reaches `drizzle/`

**drizzle-kit will not emit `CREATE EXTENSION` for you.** Extensions are not in
its snapshot, so `db:generate` emits a table using type `vector` against a
database that has no such type, and `db:migrate` dies with
`type "vector" does not exist`.

Verified on this project's Neon instance — the extension is **available and not
yet installed**:

```
name    | default_version | installed_version
vector  | 0.8.1           | (none)
pg_trgm | 1.6             | (none)
```

The brief says *"Never hand-edit `drizzle/`"*. That rule is about editing an
auto-diffed file, which drizzle will overwrite or contradict. drizzle-kit has a
first-class mechanism for the other case, confirmed present in 0.31.10:

```
npx drizzle-kit generate --help
  --custom   Prepare empty migration file for custom SQL (default: false)
```

So, **in this order, and the order is the whole point**:

```bash
# 1. an empty, journalled migration authored by drizzle-kit itself
npx drizzle-kit generate --custom --name=enable_pgvector
#    → drizzle/0004_enable_pgvector.sql  +  an entry in drizzle/meta/_journal.json
```

Its entire contents:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

```bash
# 2. only now add journalEntryEmbeddings to schema.ts, then
npm run db:generate     # → drizzle/0005_<name>.sql, the table + indexes
npm run db:migrate      # 0004 before 0005, so `vector` exists when 0005 runs
```

`IF NOT EXISTS` makes it re-runnable. Neon grants the extension to the database
owner, which is the role in `DATABASE_URL_UNPOOLED`; `drizzle.config.ts` already
prefers that URL for DDL, with the comment *"DDL prefers a real session over
PgBouncer"*. Later `db:generate` runs will not try to drop the extension —
drizzle has no record of it, which is the same reason it would not create it.

### 3.2 The table

Add to `src/lib/db/schema.ts`, immediately after `journalEntries`:

```ts
/**
 * F15: one embedding per journal entry, in a table of its own.
 *
 * Deliberately NOT a column on `journal_entries`. Every read in
 * `lib/db/queries/journal.ts` is `db.select().from(journalEntries)` with no
 * column list, so a vector(1536) — 6 148 bytes — would ride along on all thirty
 * rows of every journal page to render text. See F15 §2.2.
 *
 * `user_id` is denormalised so the search filters by owner without touching
 * `journal_entries`; the FK to `users` mirrors `journal_entries` so a deleted
 * user cascades from both directions.
 *
 * `text_sha` is sha256 of the exact text that was embedded. Postgres computes
 * `sha256(text::bytea)` natively (PG 11+; this instance is 18.4), so a stale
 * vector is detected inside the search query itself and an edit needs no
 * invalidation write anywhere. `norm_sha` is sha256 of `normalizeForCompare()`
 * output and is Layer 1 — the free, provider-free duplicate check.
 *
 * No verdict is stored. "Unique" is a property of a collection that changes
 * with the next save; what is stored is only whether a current vector exists.
 */
export const journalEntryEmbeddings = pgTable(
  'journal_entry_embeddings',
  {
    entryId: uuid('entry_id')
      .primaryKey()
      .references(() => journalEntries.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 'ready' | 'failed'. The absence of a row is the third state: never tried. */
    status: text('status').$type<'ready' | 'failed'>().notNull(),
    /** sha256 hex of the exact text embedded. Stale when it != sha256(entry.text). */
    textSha: text('text_sha').notNull(),
    /** sha256 hex of normalizeForCompare(text). Layer 1, and it needs no provider. */
    normSha: text('norm_sha').notNull(),
    /** Which model produced it. A model change invalidates by value, not by DDL. */
    model: text('model'),
    /** Null on 'failed'. pgvector skips NULLs in the index. */
    embedding: vector('embedding', { dimensions: 1536 }),
    attempts: integer('attempts').notNull().default(0),
    /** Server-log detail for a 'failed' row. Never rendered. */
    failedReason: text('failed_reason'),
    createdAt: tsz('created_at').notNull().defaultNow(),
    updatedAt: tsz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    // Layer 1. The only index the feature strictly needs.
    index('journal_entry_embeddings_norm_idx').on(t.userId, t.normSha),
    // Drives the backfill's "what is missing" scan and the coverage count.
    index('journal_entry_embeddings_user_status_idx').on(t.userId, t.status),
    // Layer 2. See §3.3 — present, and not what correctness rests on.
    index('journal_entry_embeddings_hnsw_idx')
      .using('hnsw', t.embedding.op('vector_cosine_ops')),
  ],
)
```

**drizzle-orm 0.45.2 has native `vector()`. Checked, not assumed:**

```
node_modules/drizzle-orm/pg-core/columns/vector_extension/vector.d.ts
  export declare function vector<TName extends string, D extends number>(
    name: TName, config: PgVectorConfig<D>): PgVectorBuilderInitial<TName, D>
node_modules/drizzle-orm/pg-core/indexes.d.ts
  PgIndexMethod = … | 'hnsw' | 'ivfflat' | …
  PgIndexOpClass = … | 'vector_cosine_ops' | 'vector_l2_ops' | 'vector_ip_ops' | …
node_modules/drizzle-orm/sql/functions/vector.d.ts
  export declare function cosineDistance(column, value): SQL
```

**No `customType` is needed.** `sparsevec`, `halfvec` and `bit` are there too if
they are ever wanted. Import `vector` from `drizzle-orm/pg-core` and
`cosineDistance` from `drizzle-orm`; `integer` and `index` are already imported
in `schema.ts`.

`src/lib/db/types.ts` gains `JournalEntryEmbedding` alongside the existing row
types.

### 3.3 Index type: hnsw, and why the query must not depend on it

**`ivfflat` is wrong here and would be wrong for months.** It builds its lists by
*clustering the rows that exist at build time*; on an empty table it produces
degenerate lists and recall collapses, and it does not repair itself as rows
arrive — it has to be dropped and rebuilt. `journal_entries` currently holds
**one row** (counted, 2026-08-09). `hnsw` needs no training rows, is correct from
the first insert, and builds in milliseconds on an empty table — which is also
the only moment it is free to build.

But the search is `WHERE user_id = $1 ORDER BY embedding <=> $2 LIMIT 3`, and a
selective equality filter beside an ANN order-by is the classic pgvector
foot-gun: with a plain HNSW scan Postgres retrieves `ef_search` neighbours
*globally* and only then discards the ones belonging to other users, so a user
whose entries are not in the global top-40 gets **zero rows back and no error**.
pgvector 0.8 added `hnsw.iterative_scan` for exactly this, and this instance has
**0.8.1** available.

The resolution, in priority order:

1. **Correctness does not depend on the index.** At this project's scale — a few
   hundred vectors per user — the planner will choose a filtered sequential scan
   over `journal_entry_embeddings` and compute exact distances. That is
   sub-millisecond and has perfect recall. This is the intended plan today.
2. **The index is created anyway**, because creating it on an empty table costs
   nothing and creating it later costs a lock on a table under load.
3. **When a single user passes ~5 000 entries**, and only then, set
   `SET LOCAL hnsw.iterative_scan = relaxed_order` in the search transaction and
   re-verify recall with `journal:db`. Do not do it before; it is a slower plan
   at small N. Written into the query's comment so the next reader finds it at
   the point of use.

### 3.4 What is *not* changing

- **No unique constraint, no index, nothing on `(user_id, text)`.** [D1].
- **`journal_entries` gains no column.** [D2].
- **`lib/db/queries/journal.ts` is untouched.** `updateEntry` needs no
  invalidation because of `text_sha` [D3]; `deleteEntry` needs nothing because
  the FK cascades.

---

## 4. Files

### New

| Path | Why |
|---|---|
| `drizzle/0004_enable_pgvector.sql` | `CREATE EXTENSION IF NOT EXISTS vector;` — authored via `drizzle-kit generate --custom`, §3.1 |
| `drizzle/0005_<generated>.sql` | The table and its three indexes. Emitted by `db:generate`, never hand-edited |
| `src/lib/journal/similarity.ts` | **Pure, no imports, no `server-only`.** `normalizeForCompare`, `NEAR_DUPLICATE_MAX_DISTANCE`, `EMBEDDING_DIMENSIONS`, `isNearDuplicate`, `duplicateVerdict`. The `lib/vocab/dedup.ts` of this feature — and, like it, the reason the logic is testable offline |
| `src/lib/journal/duplicate-check.ts` | `import 'server-only'`. Orchestration: Layer 1, then Layer 2, then the degradation rules. The only caller of both the query module and `embed()` |
| `src/lib/journal/links.ts` | `journalEntryHref(id)`. Two call sites exist as template literals today and the warning UI would be a third — `lib/vocab/links.ts` is the precedent the brief names |
| `src/lib/llm/embed.ts` | The embeddings transport. `import 'server-only'`. The only file allowed to name an embeddings URL. §2.6 |
| `src/lib/db/queries/journal-embeddings.ts` | Every statement against the new table: `findByNormSha`, `findNearest`, `upsertEmbedding`, `selectPendingForBackfill`, `coverage` |
| `src/components/journal/duplicate-warning.tsx` | The warning block under the composer: excerpt, meta, link, two actions |
| `scripts/journal-similarity.ts` | `npm run journal:similarity` — the calibration corpus. Real calls, no writes |
| `scripts/embed-journal.ts` | `npm run journal:embed` — the backfill |

### Modified

| Path | Why |
|---|---|
| `src/lib/db/schema.ts` | `journalEntryEmbeddings`; import `vector` and `integer` from `drizzle-orm/pg-core` |
| `src/lib/db/types.ts` | `JournalEntryEmbedding` row type |
| `src/lib/env.ts` | `EMBEDDING_BASE_URL`, `EMBEDDING_MODEL`, `EMBEDDING_API_KEY` — all optional with defaults, §2.7 |
| `src/lib/llm/client.ts` | One sentence naming `embed.ts` as the second, deliberate transport |
| `src/lib/llm/index.ts` | Re-export `embed`, `type EmbedResult` |
| `src/lib/journal/limits.ts` | The duplicate copy strings and `EMBED_TIMEOUT_MS`. **Here, not in `schemas.ts`** — the composer is a client component and `schemas.ts` imports zod |
| `src/lib/journal/schemas.ts` | `force` on `createEntrySchema`; `duplicateMatchDtoSchema`; `createEntryResultSchema` as a discriminated union |
| `src/lib/journal/serialize.ts` | `toDuplicateMatchDto(row, timezone)` — excerpt, not full text |
| `src/lib/journal/client.ts` | `saveEntry(text, sourceNote, opts?)`, returning the union type |
| `src/app/api/journal/route.ts` | The amended `POST` comment [D1] and the check itself |
| `src/components/journal/composer.tsx` | The third save outcome and the warning state; `SaveResult` gains a `duplicate` arm |
| `src/app/(app)/journal/journal-feed.tsx` | Remove the optimistic row on `duplicate`; pass `force` through on **Keep it anyway** |
| `src/components/journal/entry-row.tsx` / `journal-feed.tsx` | Use `journalEntryHref` instead of the inline template literal |
| `scripts/check-journal.ts` | §6.1's assertions |
| `scripts/check-journal-db.ts` | §6.2's assertions |
| `package.json` | `journal:similarity`, `journal:embed` |
| `CLAUDE.md` | Two lines in § Commands; one line in § Conventions recording [D1], [D5] and the two-layer degradation |
| `.env.example` | The three `EMBEDDING_*` variables, commented as optional |

---

## 5. Implementation order

Every step ends with the application building.

### Phase A — no provider required

**A1. Extension migration.** `npx drizzle-kit generate --custom
--name=enable_pgvector`, put `CREATE EXTENSION IF NOT EXISTS vector;` in it,
`npm run db:migrate`. Verify: `select extversion from pg_extension where
extname='vector'` → `0.8.1`. *Nothing in `src/` has changed yet.*

**A2. Schema + table.** Add `journalEntryEmbeddings` and the row type,
`npm run db:generate && npm run db:migrate`, `npm run typecheck`. Read the
generated SQL before migrating: it must say `vector(1536)` and
`USING hnsw (embedding vector_cosine_ops)`.

**A3. `lib/journal/similarity.ts`.** Pure. `normalizeForCompare`, `sha256Hex`
(node `crypto`, and note this file is imported by the *server* and the scripts
only — the composer imports nothing from it), `EMBEDDING_DIMENSIONS`,
`NEAR_DUPLICATE_MAX_DISTANCE` (provisional, marked as such in a comment),
`isNearDuplicate(d)`, and `duplicateVerdict(input)` — the total function §6.1
asserts against.

**A4. `lib/db/queries/journal-embeddings.ts`.** `findByNormSha`, `upsertEmbedding`,
`selectPendingForBackfill`, `coverage`. Leave `findNearest` for B2.
`userId` first parameter, in every WHERE clause, per the convention.

**A5. `lib/journal/duplicate-check.ts`.** Layer 1 only for now, behind the same
`DuplicateCheck` result type Layer 2 will return. A row that has no sibling row
is invisible to Layer 1 — that is the partial-coverage case and it under-warns,
which [D5] says is the right direction.

**A6. Contract.** `limits.ts` copy, `schemas.ts` union + `force`,
`serialize.ts` excerpt, `client.ts` signature. Typecheck.

**A7. The route.** Amend the comment **first**, verbatim from [D1]. Then: parse,
`if (!force)` run the check, on a hit return `ok({ status: 'duplicate', match,
distance }, 200)`, otherwise insert, write the Layer-1 sibling row (status
`'failed'`, `failed_reason: 'not embedded'`, `attempts: 0` — so `norm_sha` exists
for the next save even with no provider), and return
`ok({ status: 'saved', entry }, 201)`.

> Writing a `'failed'` row on every save is what makes Layer 1 work in Phase A.
> It is also exactly the state [D3] calls "attempted, could not", which the
> backfill will pick up under `--retry-failed` the moment a provider exists.

**A8. UI.** `duplicate-warning.tsx`, then `composer.tsx`, then `journal-feed.tsx`.
The composer's restore-on-failure path is reused unchanged for the duplicate
arm — see §6.3 on the draft.

**A9. Scripts.** `check-journal.ts` and `check-journal-db.ts` additions; both
green. `CLAUDE.md`, `.env.example`, `package.json`.

**Phase A is shippable here.** No key, no OpenAI, no [S1] question to answer.

### Phase B — with an embedding provider, and only after §7.1 is answered

**B1. `lib/env.ts` + `lib/llm/embed.ts`.** `embed(inputs: string[])` →
`{ ok: true; vectors: number[][]; model: string } | { ok: false; error: LlmError }`,
reusing `llmError()` and `USER_MESSAGES` from `lib/llm/errors.ts` so the error
vocabulary stays one vocabulary. `AbortSignal.timeout(EMBED_TIMEOUT_MS)`. No
retry — the SDK's one transport retry has no equivalent here and a retry inside
a 2.5 s budget is a way to spend the budget twice. Assert the width [D8].

**B2. `findNearest`.** In `queries/journal-embeddings.ts`:

```sql
select j.id, j.text, j.source_note, j.created_at,
       e.embedding <=> $2 as distance
  from journal_entry_embeddings e
  join journal_entries j on j.id = e.entry_id
 where e.user_id = $1
   and e.status = 'ready'
   and e.embedding is not null
   and e.text_sha = encode(sha256(j.text::bytea), 'hex')   -- §2.3: stale vectors excluded here
 order by e.embedding <=> $2
 limit 3
```

Built with drizzle's `cosineDistance(journalEntryEmbeddings.embedding, vec)`.
`limit 3` rather than 1 so the server log can carry the runner-up distance —
that log is how the threshold gets re-tuned against real data (§6.4).

**B3. Layer 2 in `duplicate-check.ts`.** Layer 1 first (free); only on a miss
call `embed()`; on any `ok: false`, return `unchecked` and let the save proceed.
When the vector arrives, write it into the sibling row on the same request —
one save, one embedding call, one row, no second pass.

**B4. `scripts/journal-similarity.ts`** and the calibration pass (§6.4). **Replace
the provisional `NEAR_DUPLICATE_MAX_DISTANCE` with the measured number and
record the run's output in a comment beside it.**

**B5. `scripts/embed-journal.ts`**, then run it (§5.1).

### 5.1 Backfill — `npm run journal:embed`

```
npm run journal:embed -- --all [--limit=500] [--retry-failed] [--dry-run]
npm run journal:embed -- --user=<uuid|email>
```

- **Selection.** `journal_entries` LEFT JOIN the sibling table, taking rows where
  the sibling is missing, **or** `status='ready'` with `text_sha ≠
  sha256(text)` (stale after an edit), **or** — under `--retry-failed` —
  `status='failed' AND attempts < 3`. Ordered by `created_at`, `LIMIT` applied.
- **Batching.** 64 inputs per request. `JOURNAL_TEXT_MAX` is 1 000 characters
  ≈ 300 tokens, so a batch is ~19 k tokens — an order of magnitude under
  OpenAI's 300 k per-request ceiling and well under the 2 048-input one. 250 ms
  between batches. A batch that fails marks its rows `'failed'` with the reason
  and `attempts + 1`, and the run continues; one bad line must not stop 400 good
  ones.
- **Idempotence.** `INSERT … ON CONFLICT (entry_id) DO UPDATE SET embedding,
  status, text_sha, norm_sha, model, attempts = 0, failed_reason = null,
  updated_at = now()`. Re-running immediately selects nothing and costs nothing.
  Interruptible at any point: every batch is committed before the next starts.
- **`--dry-run`** prints the selection counts and makes no call and no write.
- **Exit code** is non-zero only on a config error or when *every* batch failed
  — the same "the exit code only reports transport" discipline as the dry-runs.

**What a save does while coverage is partial.** Nothing special, and it says
nothing to the user. An entry with no `'ready'` sibling row is invisible to
Layer 2 and the new line is reported unique. The user is never told "we only
checked 60 % of your journal" — that is a sentence about the application's
internals, on the screen least able to afford one, and the remedy is not theirs.
Coverage converges from both ends: new saves embed themselves, and one
`journal:embed` run closes the back catalogue. Under-warning during the gap is
the direction [D5] chose deliberately. `coverage(userId)` exists in the query
module for the scripts and the server log, not for the UI.

---

## 6. Verification

### 6.1 `npm run journal:check` — offline, no database, no network

Added to `scripts/check-journal.ts`, in its existing `check(label, actual,
expected)` idiom.

**The normaliser** (`normalizeForCompare`), each of these must land on one key:

| Input | Reason |
|---|---|
| `Nothing to be done.` / `nothing to be done` | case, trailing stop |
| `  Nothing   to be\n done. ` | whitespace runs and newlines |
| `a fall in a pit, a gain in one’s wit` / `…one's wit` | U+2019 vs U+0027 — the single most common real re-paste difference |
| `“Nothing to be done.”` / `"Nothing to be done."` | smart double quotes |
| `Sedikit demi sedikit, lama‑lama menjadi bukit.` (U+2011) / `lama-lama` | non-breaking hyphen |
| `Naïve.` / `Naive` | NFKD + mark strip, the `lib/vocab/dedup.ts` treatment |

And these must **not** collide: `Nothing to be done.` vs `Nothing to be gained.`;
`Time heals all wounds.` vs `Time wounds all heels.` Layer 1 is exact-after-
normalisation and nothing else — it does no stemming and no fuzzy matching. A
one-word difference is a different line.

**The threshold logic** (`isNearDuplicate`): `0` → true; `T - ε` → true; **`T`
exactly → false** ([D5]'s strict comparison, asserted so a later `<=` is caught);
`T + ε` → false; `NaN` → false; `null` → false.

**The degradation states** — `duplicateVerdict` is a total function and every
row of this table is an assertion:

| layer 1 hit | provider | distance | verdict | row written |
|---|---|---|---|---|
| yes | any | any | `duplicate` | no |
| no | ok | `< T` | `duplicate` | no |
| no | ok | `≥ T` | `unique` | yes |
| no | error `transport` | — | `unchecked` | **yes** |
| no | error `config` (no key) | — | `unchecked` | **yes** |
| no | timeout | — | `unchecked` | **yes** |
| no | no `ready` rows at all | — | `unchecked` | **yes** |
| `force: true` | — | — | `forced` | **yes**, no call made |

The property the whole feature rests on, asserted directly: **`verdict !==
'duplicate'` for every input in which the provider did not answer.** A provider
outage can never prevent a save.

**The serialiser** (`toDuplicateMatchDto`): a 1 000-character entry yields an
excerpt of exactly `DUPLICATE_EXCERPT_MAX` characters plus `…`; a 40-character
entry is returned whole with no ellipsis; `sourceNote: null` survives; the
excerpt cuts on a word boundary where one exists within the last 20 characters;
`localDate` is the value the DTO already carries and is not recomputed. Assert
that the DTO contains **no** `insight` and no `updatedAt` — the warning shows a
line, not an entry.

**Schema and copy:** `force` defaults to `false` and `{ text: 'x'.repeat(1001),
force: true }` is still rejected (`force` skips the *duplicate* check, never the
validation); `createEntryResultSchema` accepts both arms and rejects a body with
both `entry` and `match`; every user-visible string in the warning comes from
`limits.ts`, asserted by identity, the same discipline as `TOO_LONG_MESSAGE`.

**Two structural greps, as assertions rather than convention:**

- `EMBEDDING_DIMENSIONS` equals the width declared on
  `journalEntryEmbeddings.embedding` (read via drizzle's column metadata) — this
  is what makes a provider swap fail at CI rather than at bind time.
- `src/lib/llm/embed.ts` is the only file under `src/` containing the string
  `/embeddings`, and `OPENAI_API_KEY` appears nowhere under `src/` ([S1], [D7]).

### 6.2 `npm run journal:db` — real Postgres, **no network**

Added to `scripts/check-journal-db.ts`, which already seeds throwaway
`@example.invalid` users and deletes them in a `finally`.

Vectors are **constructed by hand, never fetched.** A 1536-wide array of zeros
with a 1 at index 0 is a unit vector; one with 1 at index 1 is orthogonal to it;
`[0.6, 0.8, 0, …]` sits at a known angle. Cosine distances are then exact
constants and the assertions are about *the query*, not about a model.

1. **The extension is really there.** `select extversion from pg_extension where
   extname = 'vector'` returns a row. A migration that silently did not run is a
   real failure mode and everything below would fail confusingly without it.
2. **The column round-trips.** Insert `[1,0,0,…]`, read it back, assert 1536
   numbers and `[0] === 1`. This is the postgres.js ↔ drizzle `mapToDriverValue`
   path and it is worth one assertion.
3. **`findNearest` orders by distance.** Three entries at known angles; assert
   the order and each distance to within `1e-6`.
4. **The user filter holds.** A second fixture user with a byte-identical vector
   is never returned. This is the `userId`-in-every-WHERE convention, and it is
   the one bug in this feature that would be a privacy incident.
5. **Stale vectors are excluded.** Embed an entry, then `updateEntry` its text,
   then search with the original vector: **zero rows**, with no invalidation
   write in between. This asserts [D3]'s `text_sha = sha256(j.text::bytea)`
   predicate, and it is the reason `PATCH` needed no change.
6. **The partial-backfill case.** An entry with no sibling row at all is
   invisible to the search, returns no row, and raises nothing.
7. **`status='failed'` rows are excluded**, and their presence does not suppress
   a `'ready'` match on another row.
8. **Layer 1 works with no vector at all.** Two entries whose texts differ only
   in whitespace and quote glyphs, both with `status='failed'` sibling rows:
   `findByNormSha` finds the first from the second's normalised hash. **This is
   the Phase-A path and it must pass with `EMBEDDING_API_KEY` unset.**
9. **Cascades.** `deleteEntry` removes the sibling row; deleting the user
   removes both. Asserted by counting, because a missing `onDelete` is invisible
   until the FK blocks a delete in production.
10. **Backfill selection and idempotence.** With a stub embedder (a local
    function returning a fixed vector — the script makes no network call):
    `selectPendingForBackfill` returns the un-embedded rows, the run writes
    them, a second call returns **none**, and a third after an `updateEntry`
    returns exactly the edited row.
11. **`coverage()`** counts `ready`-and-current rows over total entries, and is
    `0` for a user with entries and no sibling rows.

### 6.3 Manual passes no script can cover

- **The draft survives the round trip.** Paste a line that is a duplicate, tap
  Save, get the warning, tap **Never mind**, background the tab, return. The
  text must still be there. It is *by construction*: `submit()` clears
  `sessionStorage` and the fields, the duplicate arm restores the snapshot
  through the same `setText(current => current === "" ? snapshot.text : current)`
  path the failure arm uses, and the debounced `useEffect` on `[text,
  sourceNote]` rewrites the draft 300 ms later. **Verify it rather than trusting
  it** — and note the constant is `JOURNAL_DRAFT_KEY` in `sessionStorage`, not
  localStorage, deliberately: *"a draft is the state of one visit to one tab"*.
- **Type while the check is in flight.** Paste a duplicate, tap Save, and type a
  new line before the response lands. The warning must appear **without**
  clobbering what is being typed — the existing `current === ""` guard is what
  does it, and the duplicate arm must not bypass it.
- **The optimistic row is withdrawn.** The saved row appears at the top of the
  list the instant Save is tapped. On `duplicate` it must disappear again, and
  the list must not flicker a second copy of the matched entry.
- **Keep it anyway.** Tap it; the row lands; there is no second warning; the
  entry page opens; the two near-identical entries both exist.
- **The link out.** Tap the matched entry in the warning. It opens
  `/journal/[id]`. Then press back: the composer is empty (the save was
  abandoned) — this is the acceptable loss, and it is why the link is not the
  primary action.
- **Provider down.** `EMBEDDING_BASE_URL=http://127.0.0.1:9` and save a line
  that *is* a duplicate. It must save, within the 2.5 s budget, with no error
  shown and a `[journal.dedup]` line in the server log. Repeat with
  `EMBEDDING_API_KEY` unset entirely. **This is Product Principle 5 and it is the
  single most important manual pass in this plan.**
- **Register.** Read the warning copy aloud. It must not scold. Proposed, and to
  be judged against F10 §7's rubric — plain, no exclamation, no second-person
  advice:
  - Heading: `You kept this already`
  - Body: the excerpt, then its meta line (`entryMeta`-styled: source note ·
    date), then, muted: `Saved 3 Aug 2026`
  - Actions: `Keep it anyway` (accent, mono, uppercase — the composer's Save
    treatment) and `Never mind` (muted text)
  - **Not** "Duplicate detected", **not** "Are you sure?", **not** a modal. It
    is a block that appears under the composer where the counter and the error
    already appear, in `Meta`, so the screen's one-column rhythm is unbroken.

### 6.4 `npm run journal:similarity` — the calibration corpus

**A threshold decides whether a user is interrupted, and it cannot be chosen
from an armchair.** This script embeds a fixed corpus of pairs, prints the cosine
distance for each, sorted, grouped by what the pair is *for*, and prints the
window in which a safe threshold could sit. It writes nothing and exits 0 unless
the transport failed — the numbers are the deliverable, exactly as
`journal:dry-run`'s text is.

```
npm run journal:similarity                # the whole corpus
npm run journal:similarity -- --group=C   # one group
npm run journal:similarity -- "line one" "line two"   # an ad-hoc pair
```

Distinct strings are embedded once and reused across pairs; the corpus below is
20 pairs over ~30 distinct strings, so one full run is one batched call.

**Group A — must be at or near zero. Layer 2 must never miss these.**

| # | A | B |
|---|---|---|
| 1 | `a fall in a pit, a gain in one's wit` | *itself* |
| 2 | `a fall in a pit, a gain in one's wit` | `A Fall In A Pit, A Gain In One's Wit` |
| 3 | `Nothing to be done.` | `  Nothing   to be\ndone ` |
| 4 | `a fall in a pit, a gain in one’s wit` (U+2019) | `a fall in a pit, a gain in one's wit` |

*(Layer 1 already catches all four. They are here to establish the floor and to
prove the two layers agree — if any of these exceeds the threshold, the
threshold is wrong.)*

**Group B — the feature's actual purpose. Should be below the threshold; if the
data says otherwise, we accept under-warning and say so.**

| # | A | B |
|---|---|---|
| 5 | `a fall in a pit, a gain in one's wit` | `Every time you fall into a pit you come out a little wiser.` |
| 6 | `Sedikit demi sedikit, lama-lama menjadi bukit.` | `Little by little, it eventually becomes a hill.` |
| 7 | `Sedikit demi sedikit, lama-lama menjadi bukit.` | `Many a little makes a mickle.` |
| 8 | `The past is a foreign country: they do things differently there.` | `The past is a foreign country; they do things differently there.` |
| 9 | `The past is a foreign country: they do things differently there.` | `People in the past did things differently — it is almost another country.` |
| 10 | `Nothing to be done.` | `— Estragon, in Waiting for Godot: "Nothing to be done."` |

*(6 and 7 are the cross-lingual cases, reusing F10's dry-run corpus line. See
§7.4 — these are the ones expected to fail.)*

**Group C — the dangerous false positives. Every one of these must sit ABOVE the
threshold, and the threshold is chosen from the smallest number in this group.**

| # | A | B | why it is a trap |
|---|---|---|---|
| 11 | `Nothing to be done.` | `Nothing to be gained.` | two characters apart, different claim |
| 12 | `Time heals all wounds.` | `Time wounds all heels.` | near-identical tokens, unrelated meaning |
| 13 | `Failure is the best teacher.` | `Success has many fathers; failure is an orphan.` | same topic, different claim |
| 14 | `The unexamined life is not worth living.` | `The examined life is painful.` | same topic, opposed claim |
| 15 | `Do not go gentle into that good night.` | `Rage, rage against the dying of the light.` | **adjacent lines of the same poem** — a user will save both |
| 16 | `Sedikit demi sedikit, lama-lama menjadi bukit.` | `Air beriak tanda tak dalam.` | two Indonesian proverbs, unrelated. Embedders cluster by *language*; this measures how much |
| 17 | `a fall in a pit, a gain in one's wit` | `Chinese proverb, heard in a film` | a line vs its own source note — measures whether provenance leaks into similarity |

**Group D — short vs long, and the floor.**

| # | A | B |
|---|---|---|
| 18 | `Carpe diem.` | `Seize the day, boys. Make your lives extraordinary.` |
| 19 | `Nothing to be done.` | a 900-character Godot passage *containing* that sentence |
| 20 | `a fall in a pit, a gain in one's wit` | a 900-character passage about compound interest |

**The procedure, and it is the whole point of the script:**

1. Run it. Record `maxA`, `minB`, `minC`, and the full sorted table.
2. **Sanity gate:** `maxA < minC`. If it fails, the model is unusable for this
   and Phase B stops.
3. **Choose `T = minC × 0.8`, then round down to two decimals.** The 20 % margin
   is because seventeen pairs are not a distribution; `minC` is the smallest
   dangerous distance *observed*, and the real one is smaller.
4. **Clamp: `T ≤ 0.25`.** Beyond that the warning is guessing regardless of what
   the corpus said.
5. Report how many of Group B fall below `T`. **If it is few, that is an
   acceptable outcome, not a failure** — Layer 1 still catches the re-paste, and
   [D5] says a quiet feature beats a crying-wolf one.
6. Write `T` into `NEAR_DUPLICATE_MAX_DISTANCE` **with the run's date, the model
   string, `minC`, and which pair produced `minC`, in the comment beside it.** A
   bare number in this file is unmaintainable; the next reader needs to know
   what it was measured against.

**Provisional value until step 6 runs: `NEAR_DUPLICATE_MAX_DISTANCE = 0.15`, and
it is a guess.** For `text-embedding-3-small` the shape usually seen is
identical ≈ 0.00, trivial variants ≈ 0.02–0.06, paraphrase ≈ 0.15–0.35,
same-topic-different ≈ 0.30–0.55, unrelated ≈ 0.6–0.9 — which would put `minC`
around 0.30 and `T` around 0.24. **None of that has been measured on this
project and the constant must carry a `TODO(F15-B4)` until it has.**

**The field loop.** Every save logs one line whether or not it warned:

```
[journal.dedup] user=<8 chars> layer1=miss d=0.213 runner=0.402 T=0.15 warned=false ms=284
```

That is how `T` gets re-tuned against a real journal rather than a corpus, and it
is why `findNearest` returns three rows.

### 6.5 Cost and latency, measured against what the feature buys

- **One embedding call per save**, and only when Layer 1 misses. At OpenAI's
  `text-embedding-3-small` pricing a 1 000-character entry is ~300 tokens, so a
  thousand saves is well under a cent. Cost is not the constraint here.
- **Latency:** typically 150–400 ms, hard-capped at `EMBED_TIMEOUT_MS = 2500`,
  and **not on the user's critical path** because the row is already on screen
  ([D4]).
- **The backfill** is a one-off: 1 000 entries in 16 batches, under a minute.
- **`journal:similarity`** is ~30 inputs, one batched call, per run.

---

## 7. Risks and open questions

### 7.1 The two questions a human had to answer before Phase B — ANSWERED

Both were put to the user on 2026-08-09 and both are settled. Recorded in full
because the reasoning constrains how Phase B is built, not just whether.

1. **Is it acceptable for journal text to leave for OpenAI? — YES.** [S2] chose
   z.ai partly because it *"adds no second provider to the runtime"*, and the
   journal is the most personal content in the application. That cost was stated
   plainly as the main argument against this option; the user chose it anyway,
   which makes it a decision rather than an oversight. **Do not relitigate it in
   the implementing session.** One obligation survives: no user has been told
   this happens. Single-user today, so nothing is owed yet — but a second human
   user makes a line in the interface owed before their first save.
2. **Is [D7]'s split acceptable? — YES, via the first resolution.**
   `EMBEDDING_API_KEY` remains a distinct variable holding a **separate OpenAI
   project key scoped to embeddings**. Not the badge-art secret pasted into two
   variables — that is the shape that would hollow out [S1] while appearing to
   honour it. Two properties this buys, both worth the two minutes it costs:
   `grep OPENAI_API_KEY src/` stays empty and is asserted by `journal:check`
   rather than believed; and the offline tooling key and the runtime key rotate
   independently, which matters because the badge-art key has already been
   through a chat transcript.

### 7.2 The threshold is unmeasured

`NEAR_DUPLICATE_MAX_DISTANCE` is stated above as `0.15` and **that number is a
guess**, because no vector could be obtained from any provider reachable from
this machine with the credentials in the repository. §6.4 is the procedure that
replaces it. Phase B must not be called done with the provisional value in place;
the `TODO(F15-B4)` marker is there so a grep finds it.

### 7.3 The dimensionality is asserted, not measured

1536 is `text-embedding-3-small`'s documented native width. It was **not**
observed on this machine. If it is wrong, `embed()` fails loudly at the width
assertion [D8] rather than writing a malformed vector — but the migration would
then need re-issuing against a different `vector(N)`. **Before running A2 in
Phase B, make one curl to the chosen provider and count the array.** On an empty
table the correction is one migration; after a backfill it is a re-embed of
everything.

### 7.4 Cross-lingual duplicates will probably not work

Pairs 6 and 7 embed an Indonesian proverb against its English rendering.
`text-embedding-3-small` is multilingual but its cross-lingual alignment is
weak, and those pairs plausibly land at 0.35–0.5 — above any threshold that
Group C allows. Meanwhile pair 16 (two *unrelated* Indonesian proverbs) may land
*lower* than pair 6, because the model clusters by language before it clusters
by meaning. **If pair 16 < pair 6, cross-lingual detection is not merely absent,
it is inverted**, and the honest response is to state in this plan's successor
that the feature works within a language and not across one. Pair 16 exists in
the corpus precisely to make that measurable rather than assumed.

### 7.5 HNSW recall under the user filter

§3.3's plan assumes the planner prefers an exact filtered scan at this scale. It
should, and at one row it certainly will — but it is a *planner* decision, not a
guarantee. If a user ever gets enough entries for the planner to switch, recall
silently drops and the feature quietly stops warning (the safe direction, but
invisibly). The mitigation is `hnsw.iterative_scan = relaxed_order`, available on
this instance's pgvector 0.8.1, and the trigger to apply it is a `journal:db`
assertion that a filtered search over a seeded 200-vector fixture returns the
known-nearest row. **This is a guess about a planner and it is written here
rather than as a confident sentence in §3.**

### 7.6 Smaller ones

- **`--custom` migrations and drizzle's snapshot.** `0004` is invisible to
  drizzle's differ. That is what makes it safe (nothing will try to reverse it)
  and also what makes it easy to forget when provisioning a fresh database —
  `db:migrate` runs it from the journal, so the only real risk is someone using
  `db:push`, which skips the journal entirely. **Do not use `db:push` on this
  schema.** Worth a line in `CLAUDE.md`.
- **Neon and `CREATE EXTENSION`.** `vector 0.8.1` is available on this instance
  and the role in `DATABASE_URL_UNPOOLED` is expected to be the owner. Not
  executed — this plan is read-only. If the grant is missing, A1 fails
  immediately and visibly, which is the right place for it to fail.
- **The composer's `SaveResult` is a public shape** shared with `journal-feed`.
  Widening it to a discriminated union is a small refactor with a compiler behind
  it; keeping it as `{ ok: boolean; message?; duplicate? }` is less typing and
  less safe. **Prefer the union** — `ok: true | false` with a third `duplicate`
  arm is exactly the case where a boolean stops being a boolean.
- **`force: true` and validation.** `force` skips the duplicate check and
  nothing else. Asserted in §6.1, because "force" is the kind of flag that
  accumulates meanings.
- **Two saves racing.** Two devices posting the same line within the same second
  both see an empty collection and both write. There is no constraint and [D1]
  says there must not be. Accepted, and it is the same trade F10 already made.
