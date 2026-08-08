> ## ⚠ SUPERSEDED IN PART — read `ROADMAP_v0.1.0.md` § Reconciliation Decisions first.
>
> - **[R1]** §5 and §9.4 are void. No `deleted_at`, no soft delete, no resurrection amendment to F3. Hard delete only when the word has never been carded; otherwise deletion is refused and the user is offered "mastered".
> - **[R2]** Normalise `z.string().uuid()` to `z.uuid()` (zod 4).
> - **[R17]** Your Vocab tab shell contract stands — F8 conforms to it.
>
> These plans were written in parallel by agents that could not see each other.
> The Reconciliation section wins over anything below.

# F4 — Vocab Detail & Collection Management

> Read `ROADMAP_v0.1.0.md` first, in full, especially **Locked Decisions**. That file wins
> over this one. Where this plan appears to contradict it, stop and report — do not guess.
> Discrepancies I am already aware of are listed in §12.

---

## 1. Goal

Give the user one screen that holds their whole word collection and one screen that holds
a single word, both usable one-handed on an iPhone with 500+ words stored. `/vocab` is a
two-tab shell (**Mine** / **Discover**) with search, sort and a visible active-vs-mastered
distinction; `/vocab/[id]` is a real route showing term, pronunciation, part of speech, the
one-line definition and F3's stored examples, sized to avoid scrolling. It also owns the two
lifecycle actions — mastering a word (retires it from daily cards without touching history)
and deleting it (which must not silently rewrite past daily cards).

---

## 2. Depends on / blocks

### Depends on (must be merged before F4 starts)

| Feature | What F4 needs from it |
|---|---|
| **F1** | Drizzle schema + migrations for `vocab_entries`, `daily_cards`, `daily_card_items`, `chat_sessions`; `auth()` session helper; `lib/db/` client; app shell with the four-item bottom tab bar and safe-area insets; the `/vocab` slot in that tab bar |
| **F2** | Design tokens and the shared component set — list row, card, button, input, empty state, sheet, badge chip. F4 must not invent new primitives; if a primitive is missing, add it to F2's kit directory, not to `components/vocab/` |
| **F3** | `vocab_entries` rows that actually have `part_of_speech`, `pronunciation`, `definition`, `examples`, `enrichment_status`; `POST /api/vocab` create route; the `/vocab/new` screen F4's empty states link to |

F7 is **not** a dependency. F4 renders nothing from `profiles`.

### Blocks / is depended on by

| Feature | What it takes from F4 |
|---|---|
| **F5** | `vocabDetailHref()` for daily-card rows; the `deleted_at IS NULL` filter rule for card selection; the `isDeleted` flag on historical card items |
| **F6** | The chat entry point and the guarantee that `/vocab/[id]/chat` is reachable only for a live entry the user owns |
| **F8** | The tab shell contract — the exact file, props and layout envelope Discover slots into |
| **F9** | The collector-level count rule (soft-deleted rows excluded) |

F4 and F5 sit on the same line of the build order and may be built in parallel. Everything
F5 needs from F4 is in §9; keep those signatures stable.

---

## 3. In scope / explicitly out of scope

### In scope

- `/vocab` route: tab shell, tab routing, the Mine tab in full, a placeholder Discover tab.
- Mine list: search, status filter, sort, count header, keyset pagination, empty states,
  performance to 500+ rows on a phone.
- `/vocab/[id]` detail page: content, layout budget, overflow behaviour, enrichment states.
- Master / un-master toggle (`status`, `mastered_at`).
- Delete, restore, and the soft-delete tombstone view.
- `GET /api/vocab` (list), `GET|PATCH|DELETE /api/vocab/[id]`.
- One schema addition (`vocab_entries.deleted_at`) plus three indexes.
- The chat entry-point button (placement, enablement, href only).
- Shared exports in §9.

### Explicitly out of scope

- **Discover tab content** — F8. F4 ships a placeholder file with a frozen signature.
- **Chat behaviour** — F6 owns `/vocab/[id]/chat` entirely, including its page, prompts and
  API. F4 renders a `<Link>` and stops.
- **Creating or enriching words** — F3. F4 never issues an LLM call. Not one. Detail-page
  content is read from the database, per the roadmap's persistence rule.
- **Editing a word's term, definition or examples.** v0.1.0 has no edit affordance. If the
  enrichment is wrong the user deletes and re-adds. Justification: Simplicity above all —
  an edit form doubles the surface of this feature for a rare case.
- **Bulk actions** (multi-select master/delete). Not in v0.1.0.
- **Tags, folders, notes, favourites** on a word.
- **Audio pronunciation playback** — roadmap out-of-scope list.
- **Undo toast with a timer.** Restore is a route + a button on the tombstone, not a
  transient snackbar. Simpler, and it survives a page reload.
- Any change to daily-card selection code (F5 owns that file; F4 only publishes the rule).

---

## 4. Files to create

Paths are relative to the repo root. `[EDIT]` means the file is expected to already exist
from F1/F3 — add to it, never overwrite it. If an `[EDIT]` file does not exist, create it
containing **only** F4's exports.

```
app/vocab/page.tsx                          — /vocab. Server component. Reads searchParams (tab,q,status,sort), renders the tab strip and either MineTab or DiscoverTab.
app/vocab/loading.tsx                       — Route-level skeleton for the collection list (toolbar bar + 8 ghost rows).
app/vocab/[id]/page.tsx                     — /vocab/[id]. Server component. Loads one entry, renders detail or tombstone; notFound() on bad/foreign id.
app/vocab/[id]/loading.tsx                  — Detail skeleton with the same block heights as the real layout so there is no reflow jump.
app/vocab/[id]/not-found.tsx                — "That word isn't in your collection." + link back to /vocab.
app/api/vocab/route.ts               [EDIT] — Add `GET` (list). F3 owns the `POST` export in this same file; leave it untouched.
app/api/vocab/[id]/route.ts                 — GET one / PATCH (set_status | restore) / DELETE.
components/vocab/vocab-tabs.tsx             — Client. Mine|Discover segmented control; links, not state. The tab shell contract for F8.
components/vocab/mine-tab.tsx               — Server. The Mine tab body: toolbar + count header + list + load-more.
components/vocab/discover-tab.tsx           — PLACEHOLDER owned by F4 until F8 replaces the body. Frozen props signature (§9.1).
components/vocab/vocab-toolbar.tsx          — Client. Debounced search input, status chips (All|Active|Mastered), sort menu. Writes to the URL.
components/vocab/vocab-list.tsx             — Server. Renders the first page of rows + count header + the three empty states.
components/vocab/vocab-row.tsx              — Server. One tappable row: term, one-line definition, mastered marker. Fixed height for CSS virtualisation.
components/vocab/vocab-load-more.tsx        — Client. Cursor pagination; appends pages fetched from GET /api/vocab.
components/vocab/detail-header.tsx          — Server. Term with the adaptive type scale + the single meta line (POS · pronunciation · seen N×).
components/vocab/detail-definition.tsx      — Client. Definition with 3-line clamp and tap-to-expand.
components/vocab/detail-examples.tsx        — Client. Up to 3 examples + "More examples" disclosure; handles empty/pending/failed enrichment.
components/vocab/detail-actions.tsx         — Client. The sticky action bar: chat link, master toggle, delete. Owns the optimistic-state reconciliation.
components/vocab/master-toggle.tsx          — Client. Absolute (non-toggling) PATCH to set_status, optimistic, self-reverting on failure.
components/vocab/delete-word-button.tsx     — Client. Confirm sheet → DELETE → router.replace('/vocab').
components/vocab/restore-word-button.tsx    — Client. PATCH {op:'restore'} from the tombstone.
components/vocab/tombstone.tsx              — Server. Read-only view of a soft-deleted entry: term, definition, why it is still here, Restore.
components/nav/back-link.tsx                — Client. History-aware back control (history.back() when same-origin history exists, else <Link href={fallback}>).
lib/vocab/schemas.ts                        — zod: list query, PATCH body union, list-item and detail DTOs. Single source of truth for shapes.
lib/vocab/links.ts                          — vocabListHref / vocabDetailHref / vocabChatHref. Exported to F5, F6, F8.
lib/vocab/cursor.ts                         — Opaque keyset cursor encode/decode + the per-sort key definitions.
lib/vocab/format.ts                         — termSizeClass(), formatMetaLine(), escapeLikePattern().
lib/db/queries/vocab.ts              [EDIT] — Add listVocabEntries, getVocabEntryDetail, setVocabStatus, deleteVocabEntry, restoreVocabEntry, findResurrectableEntry, countVocabByStatus.
lib/db/schema.ts                     [EDIT] — Add `deletedAt` to vocabEntries + three indexes (§5).
drizzle/<generated>_vocab_soft_delete.sql   — Generated by `npx drizzle-kit generate`. Do not hand-write; commit whatever it emits.
```

Nothing else. In particular do **not** create `app/vocab/discover/page.tsx` — see §7.1 for
why the tab is a search param and not a route segment.

---

## 5. Data

### 5.1 Tables read

| Table | Columns used | Where |
|---|---|---|
| `vocab_entries` | `id, user_id, term, source, status, part_of_speech, pronunciation, definition, examples, enrichment_status, last_shown_on, created_at, mastered_at` | list + detail |
| `daily_card_items` | `vocab_entry_id` | delete-time reference count; "seen N×" on detail |
| `chat_sessions` | `id, user_id, vocab_entry_id` | delete path only |

### 5.2 Tables written

| Table | Operation |
|---|---|
| `vocab_entries` | `UPDATE` status/`mastered_at`; `UPDATE deleted_at`; `DELETE` (hard path only) |
| `chat_sessions` | `DELETE` for the word being deleted (`chat_messages` follows via its existing `ON DELETE CASCADE`) |
| `daily_card_items` | **never written by F4** |
| `daily_cards` | **never touched by F4** |

### 5.3 Proposed additions to the roadmap schema

The roadmap permits added columns and indexes with justification. Four additions, no renames,
no restructuring, no FK rule changes.

#### A. `vocab_entries.deleted_at timestamptz` (nullable, default null)

```ts
// lib/db/schema.ts, inside vocabEntries
deletedAt: timestamp('deleted_at', { withTimezone: true }),
```

**Justification.** `daily_card_items.vocab_entry_id` is a plain FK — Postgres default
`NO ACTION`. A hard `DELETE` of a word that has ever appeared on a card therefore *raises a
foreign-key violation*; the feature cannot ship without deciding what to do about that. The
three candidate answers:

1. **Add `ON DELETE CASCADE` to `daily_card_items.vocab_entry_id`.** Rejected. It deletes
   rows out of *past* daily cards, leaving a card that recorded six words on 3 August showing
   five, with a hole in the `UNIQUE (card_id, position)` sequence. The daily card is the
   product's record of a day (Product Principle 5, "the ritual is the product"). Deleting a
   word today must not edit what happened last month. It also silently corrupts F9's stats
   inputs and F5's calendar.
2. **Add `ON DELETE SET NULL`.** Rejected. The column is `not null`-adjacent in spirit and a
   null-valued item cannot render a term, so the historical card still loses the word — same
   damage, plus a null-handling branch everywhere.
3. **Soft delete via `deleted_at`.** Chosen. The row survives, so historical cards still
   render their terms, the FK stays exactly as the roadmap wrote it, no FK rule is altered,
   and restore is free.

**But not soft delete unconditionally.** Soft-deleted rows still occupy
`UNIQUE (user_id, lower(term))`, which would block re-adding a word the user deleted. So:

> **Delete rule.** If the entry is referenced by zero `daily_card_items` rows, it is
> **hard-deleted** — there is no history to protect and the row should not linger. Otherwise
> it is **soft-deleted** (`deleted_at = now()`). Either way its `chat_sessions` row is
> deleted outright.

The common case — user mistypes a word, adds it, deletes it a minute later — leaves no
tombstone at all. The uncommon case preserves history. §5.4 handles the residual unique-index
collision.

**Why chat is deleted but cards are not.** Days are sacred; practice is not. A daily card is
a dated record of the ritual and feeds streaks, the calendar and badges. A chat session is
scaffolding for learning one word — it feeds no stat in F9 and has no date semantics. Keeping
a closed 8-turn chat attached to a word the user asked to remove is clutter, and keeping it
across a delete/re-add cycle would hand the user a used-up session (`chat_sessions` is
`UNIQUE (user_id, vocab_entry_id)` — one durable session per word) with no way to start over.
Deleting it is both cleaner and kinder.

#### B. `idx_daily_card_items_vocab_entry_id` on `daily_card_items(vocab_entry_id)`

**Justification.** Required twice: the delete path counts references before choosing hard vs
soft, and the detail page reads "seen N×". Without it both are sequential scans over every
card item the user has ever accumulated. The existing `UNIQUE (card_id, position)` index
cannot serve a lookup keyed on `vocab_entry_id`.

#### C. `idx_vocab_entries_user_created` on `vocab_entries(user_id, created_at DESC, id DESC)`

**Justification.** The default list sort and its keyset pagination predicate. Composite and
including `id` so the cursor comparison `(created_at, id) < (?, ?)` is a pure index range scan.

#### D. `idx_vocab_entries_user_last_shown` on `vocab_entries(user_id, last_shown_on ASC NULLS FIRST, id ASC)`

**Justification.** Serves F4's "Least seen" sort *and* F5's selection order, which the
roadmap specifies as `last_shown_on ascending, nulls first`. Declared here because F4 lands
first; F5 should not duplicate it.

#### Deliberately NOT added

- **No `pg_trgm` / GIN trigram index for search.** At the stated scale — 500 words, a few
  thousand at the outside, always filtered by `user_id` first — a `LIKE '%q%'` over the
  user's own rows is sub-millisecond. Adding an extension and an index for it is cost with no
  payoff, and Product Principle 1 applies to the data layer too. Revisit past ~5,000 rows
  per user.
- **No `times_shown` counter column.** "Seen N×" is a `COUNT(*)` on index B. A denormalised
  counter would need maintaining from F5's card-creation path, which F4 does not own.
- **No `deleted_reason`, no separate `vocab_entries_deleted` archive table.**

### 5.4 Resurrect-on-re-add (the unique-index consequence)

`UNIQUE (user_id, lower(term))` is roadmap-locked and counts soft-deleted rows. If the user
soft-deletes "genteel" and later adds it again, F3's `INSERT` will violate it.

F4 therefore amends the **create path** — surgically, without changing F3's route contract or
its UI. Inside `lib/db/queries/vocab.ts`, before the insert:

```
findResurrectableEntry(userId, term)
  → SELECT * FROM vocab_entries
    WHERE user_id = $1 AND lower(term) = lower($2) AND deleted_at IS NOT NULL
```

If it returns a row, the create path **resurrects** instead of inserting:

```
UPDATE vocab_entries
   SET deleted_at = NULL,
       status = 'active',
       mastered_at = NULL,
       enrichment_status = 'pending',
       term = $newTerm            -- adopt the user's new casing
 WHERE id = $found.id
```

`created_at` is deliberately **not** reset: the word has been in the collection since then,
and its historical card appearances are still attached to this id. Enrichment is re-run
(status back to `pending`) so F3's existing pipeline refreshes definition and examples —
the user may be re-adding it precisely because the old enrichment was wrong. The route then
returns the same `{ id }` shape F3 already returns, so `/vocab/new` redirects to the detail
page with no change to F3's code.

If a **live** (non-deleted) row exists for the term, this is not F4's business — F3's
existing duplicate handling stands.

### 5.5 The `deleted_at IS NULL` filter rule (cross-feature)

Every query that treats `vocab_entries` as "the user's collection" must add
`AND deleted_at IS NULL`:

| Consumer | Rule |
|---|---|
| F4 list (`/vocab` Mine) | filter — deleted rows never appear |
| F4 detail | **no filter** — loads the row, then branches to the tombstone view |
| F5 daily-card selection | filter — a deleted word must never be selected |
| F5 rendering a *past* card's items | **no filter** — history renders as it was |
| F8 Discover dedup | **no filter** — dedup against every row including deleted and mastered ones, otherwise a suggestion collides with the unique index |
| F9 collector level ("count of manually added words") | filter, plus `source = 'manual'` |

This table is repeated in §9.3 as an exported contract.

---

## 6. API contract

All routes are Node runtime, dynamic (they call `auth()`), and validate with zod at the
boundary per the roadmap. All queries go through `lib/db/queries/vocab.ts` — no inline
Drizzle in a route handler or a component.

### 6.0 Conventions

**Auth.** Every handler starts with `const session = await auth()`; no session →
`401 { error: { code: 'unauthorized' } }`. Every query is scoped
`WHERE user_id = session.user.id`. An id belonging to another user returns **404, not 403** —
do not leak the existence of other users' rows.

**Error envelope.**

```ts
type ApiError = { error: { code: ErrorCode; message: string } };
type ErrorCode = 'unauthorized' | 'not_found' | 'invalid_request' | 'conflict' | 'server_error';
```

If F1 or F3 already established a different envelope, **adopt theirs** and note the deviation
at the top of this plan's implementation. Do not introduce a second shape.

**Mutation → refresh.** Client mutations call the route handler with `fetch`, then
`router.refresh()` to re-render the server components. Do not add `revalidatePath` — these
pages are already dynamic because of `auth()`.

### 6.1 `lib/vocab/schemas.ts`

```ts
import { z } from 'zod';

export const vocabTabSchema = z.enum(['mine', 'discover']).catch('mine');
export const vocabStatusFilterSchema = z.enum(['all', 'active', 'mastered']).catch('all');
export const vocabSortSchema = z.enum(['newest', 'alpha', 'least_seen']).catch('newest');
export const vocabStatusSchema = z.enum(['active', 'mastered']);

/** GET /api/vocab query string. `.catch()` above makes junk params degrade, never 400. */
export const listVocabQuerySchema = z.object({
  // Slice rather than .max() so an over-long param degrades instead of 400-ing (see §10.16).
  q: z.string().trim().transform((s) => s.slice(0, 64)).optional(),
  status: vocabStatusFilterSchema.default('all'),
  sort: vocabSortSchema.default('newest'),
  cursor: z.string().max(256).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListVocabQuery = z.infer<typeof listVocabQuerySchema>;

export const vocabListItemSchema = z.object({
  id: z.string().uuid(),
  term: z.string(),
  definition: z.string().nullable(),
  status: vocabStatusSchema,
  partOfSpeech: z.string().nullable(),
  enrichmentStatus: z.enum(['pending', 'ready', 'failed']),
  createdAt: z.string(),            // ISO 8601
  lastShownOn: z.string().nullable(),// YYYY-MM-DD
  masteredAt: z.string().nullable(),
});
export type VocabListItem = z.infer<typeof vocabListItemSchema>;

export const listVocabResponseSchema = z.object({
  items: z.array(vocabListItemSchema),
  nextCursor: z.string().nullable(),
  counts: z.object({ total: z.number(), active: z.number(), mastered: z.number() }),
});
export type ListVocabResponse = z.infer<typeof listVocabResponseSchema>;

export const vocabDetailSchema = vocabListItemSchema.extend({
  pronunciation: z.string().nullable(),
  examples: z.array(z.string()),
  source: z.enum(['manual', 'suggested']),
  cardAppearances: z.number().int(),
  deletedAt: z.string().nullable(),
});
export type VocabDetail = z.infer<typeof vocabDetailSchema>;

/** PATCH /api/vocab/[id] body. Discriminated so new ops cannot collide. */
export const patchVocabBodySchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('set_status'), status: vocabStatusSchema }),
  z.object({ op: z.literal('restore') }),
]);
export type PatchVocabBody = z.infer<typeof patchVocabBodySchema>;

export const vocabIdSchema = z.string().uuid();
```

Note the deliberate asymmetry: **query params use `.catch()` and degrade** (a bookmarked URL
with `?sort=banana` should show the list, not an error page), while **request bodies are
strict and 400** (a malformed mutation must be loud).

### 6.2 `GET /api/vocab`

Added to the existing `app/api/vocab/route.ts`. Lists the caller's Mine collection.

Request: query string per `listVocabQuerySchema`.

`200` response: `ListVocabResponse`.

```jsonc
{
  "items": [{
    "id": "0f0d…", "term": "genteel",
    "definition": "polite and refined in a way that is affected",
    "status": "active", "partOfSpeech": "adjective",
    "enrichmentStatus": "ready", "createdAt": "2026-08-01T09:12:00.000Z",
    "lastShownOn": "2026-08-07", "masteredAt": null
  }],
  "nextCursor": "eyJrIjpbIjIwMjYtMDgtMDFUMDk6MTI6MDBaIiwiMGYwZC…il19",
  "counts": { "total": 512, "active": 488, "mastered": 24 }
}
```

Errors: `401 unauthorized`, `400 invalid_request` (only for an undecodable `cursor`),
`500 server_error`.

`counts` is computed once per request with a single grouped query and reflects the **search
filter but not the status filter** — the chips must be able to display "All 512 / Active 488
/ Mastered 24" while one of them is selected.

**Query construction** (`listVocabEntries`):

```
WHERE user_id = $userId
  AND deleted_at IS NULL
  [AND status = $status]                        -- when status != 'all'
  [AND (lower(term) LIKE $pattern
        OR lower(coalesce(definition,'')) LIKE $pattern)]   -- when q present
  [AND <cursor predicate>]
ORDER BY <sort keys>
LIMIT $limit + 1                                -- +1 probes for nextCursor
```

`$pattern = '%' || escapeLikePattern(lower(q)) || '%'`. `escapeLikePattern` escapes `\`, `%`
and `_`, and the query uses `LIKE … ESCAPE '\'`. A user searching for `100%` must not match
everything.

**Sort keys and cursor predicates** (keyset, never `OFFSET` — offset pagination re-scans and
skips rows when the list mutates under the user):

| `sort` | ORDER BY | cursor payload | predicate |
|---|---|---|---|
| `newest` | `created_at DESC, id DESC` | `[createdAt, id]` | `(created_at, id) < ($1, $2)` |
| `alpha` | `lower(term) ASC, id ASC` | `[lowerTerm, id]` | `(lower(term), id) > ($1, $2)` |
| `least_seen` | `last_shown_on ASC NULLS FIRST, id ASC` | `[lastShownOn\|null, id]` | see below |

`least_seen` cannot use a plain row comparison because of the null ordering. Emit:

```sql
-- cursor had a null last_shown_on:
(last_shown_on IS NULL AND id > $2) OR last_shown_on IS NOT NULL
-- cursor had a date:
(last_shown_on > $1) OR (last_shown_on = $1 AND id > $2)
```

`lib/vocab/cursor.ts` encodes `{ s: sort, k: [key, id] }` as base64url JSON. Decoding
validates that `s` matches the request's `sort`; a mismatch (user changed sort while a cursor
was in flight) returns `400 invalid_request` and the client silently restarts from page 1.

### 6.3 `GET /api/vocab/[id]`

Returns `200 { entry: VocabDetail }` or `404 not_found`. Present for the client components'
reconciliation after a mutation; the page itself reads the database directly server-side and
never calls this.

`cardAppearances` = `SELECT count(*) FROM daily_card_items WHERE vocab_entry_id = $id`.

A soft-deleted entry **is** returned here, with `deletedAt` set — the tombstone needs it.

### 6.4 `PATCH /api/vocab/[id]`

Body: `patchVocabBodySchema`. Response `200 { entry: VocabDetail }`.

| Op | Effect |
|---|---|
| `{ op: 'set_status', status: 'mastered' }` | `SET status='mastered', mastered_at = now()` — but only if the current status is not already `mastered`, so a double-tap does not move the timestamp |
| `{ op: 'set_status', status: 'active' }` | `SET status='active', mastered_at = NULL`. `last_shown_on` is **left alone** so an un-mastered word re-enters the rotation at high priority via the roadmap's nulls-first ordering |
| `{ op: 'restore' }` | `SET deleted_at = NULL`. Status and `mastered_at` are preserved as they were at delete time |

Mastering is deliberately expressed as an **absolute target status, not a toggle verb**. Two
phones, a double-tap, or a retried request all converge on the same state.

Errors: `401`, `404`, `400 invalid_request` (body fails zod),
`409 conflict` for `set_status` on a soft-deleted entry (restore it first).
`restore` on a live entry is a no-op returning `200`.

**Neither op touches `daily_card_items`.** This is the roadmap's requirement that mastering
preserves history, and it is satisfied by simply never writing that table.

### 6.5 `DELETE /api/vocab/[id]`

No body. Response `200 { mode: 'hard' | 'soft', id }`.

One transaction:

```
BEGIN
  1. SELECT id FROM vocab_entries WHERE id = $id AND user_id = $uid FOR UPDATE
     → no row: ROLLBACK, 404
  2. DELETE FROM chat_sessions WHERE vocab_entry_id = $id AND user_id = $uid
     (chat_messages follow via their existing ON DELETE CASCADE)
  3. SELECT count(*) AS refs FROM daily_card_items WHERE vocab_entry_id = $id
  4. refs = 0 → DELETE FROM vocab_entries WHERE id = $id            → mode 'hard'
     refs > 0 → UPDATE vocab_entries SET deleted_at = now()
                 WHERE id = $id AND deleted_at IS NULL              → mode 'soft'
COMMIT
```

Deleting an already-soft-deleted entry returns `200 { mode: 'soft' }` — idempotent. Step 1's
`FOR UPDATE` closes the race where F5 is concurrently inserting a `daily_card_items` row for
this word: the card-creation transaction blocks on the locked entry row, so we cannot observe
`refs = 0`, hard-delete, and then have F5's insert fail on a missing FK target.

Errors: `401`, `404`, `500`.

---

## 7. UI/UX spec

Global constraints, applied to every screen in this feature:

- **375 × 667 CSS px is the design target** (iPhone SE / smallest live iOS Safari). Verified
  there before anything wider.
- Heights use `dvh`, never `vh`. The URL bar collapses; `vh` lies about it.
- Bottom padding respects `env(safe-area-inset-bottom)` and the F1 tab bar.
- Every tap target ≥ 44 × 44 px.
- No horizontal scroll anywhere, ever.
- Copy is terse and in dictionary register. Sentence case. No exclamation marks.

### 7.1 `/vocab` — the tab shell

**Why the tab is a search param.** `/vocab?tab=discover`, not `/vocab/discover`. A
`app/vocab/discover/` segment would sit alongside `app/vocab/[id]/` and, while Next.js
resolves static before dynamic, it makes "is `discover` an id?" a permanent live question for
every future contributor and every link builder. The roadmap's route map lists exactly one
route — `/vocab` with tabs — and a search param is the reading that adds nothing to it.
Absent or unrecognised `tab` → `mine`.

Structure, top to bottom:

```
┌───────────────────────────────┐
│  Words                    (+) │  header, 44px. (+) → /vocab/new
├───────────────────────────────┤
│  [ Mine ]   Discover          │  tab strip, 40px, sticky
├───────────────────────────────┤
│  ⌕ search…                    │  toolbar, 44px, sticky under the strip   ┐
│  All · Active · Mastered  ⇅   │  chips + sort, 36px, sticky              ┘ Mine only
├───────────────────────────────┤
│  512 words · 24 mastered      │  count header, scrolls away
│  ─────────────────────────    │
│  genteel                      │  row, 64px
│  polite in an affected way    │
│  ─────────────────────────    │
│  …                            │
└───────────────────────────────┘
         [ bottom tab bar — F1 ]
```

**Tab strip.** Two segments, equal width, in F2's segmented-control style. Each is a
`next/link` to `/vocab?tab=mine` / `?tab=discover`. Switching to Discover **drops** `q`,
`status` and `sort` from the URL (they are Mine's state); switching back to Mine restores
defaults. The strip is sticky at `top: 0` within the scroll container and is the **only**
sticky element the shell provides — see §9.1.

**Toolbar** (Mine only, `components/vocab/vocab-toolbar.tsx`, client):

- Search input, `type="search"`, `inputMode="search"`, `enterKeyHint="search"`,
  `autoCapitalize="none"`, `autoCorrect="off"`. Placeholder "Search words". A clear (×)
  button appears once non-empty.
- Typing debounces **250 ms**, then `router.replace()` (not `push`) with the updated `q` so
  the back button does not walk backwards through every keystroke.
- Status chips: All / Active / Mastered, each showing its count. `router.replace`.
- Sort control: a small button opening F2's sheet with three options — **Newest** (default),
  **A–Z**, **Least seen**. Label shows the current choice. `router.replace`.
- **All filter state lives in the URL.** This is the load-bearing decision for the whole
  screen: the user searches "gen", taps a word, presses back, and Next.js restores the same
  filtered list at the same scroll offset because the URL never changed. Local `useState`
  would lose it every time.

**Count header.** `"{total} words · {mastered} mastered"`. With a search active:
`"{n} of {total} match "gen""`.

**Row** (`vocab-row.tsx`) — a `<Link href={vocabDetailHref(id)}>`:

- Line 1: term, 17 px, semibold.
- Line 2: definition, 15 px, muted, **single line**, `text-overflow: ellipsis`. If
  `enrichment_status = 'pending'` → "Preparing…" in italic muted. If `'failed'` → "Needs
  another look" with F2's warning colour dot.
- Mastered distinction (the roadmap requires this be visible): the row's term renders in the
  muted foreground colour rather than the primary one, and a filled ✓ chip sits at the
  trailing edge with the `aria-label` "Mastered". Colour is **not** the only signal — the
  chip carries it for anyone who cannot see the colour difference. No strikethrough:
  mastered is an achievement, not a deletion.
- Fixed **64 px** height. Fixed, not intrinsic, because it makes the virtualisation below
  exact.

**Performance at 500+ words.** Three cheap mechanisms, zero dependencies:

1. **Server-rendered first page of 50.** The server component runs the query with the URL's
   filters and streams 50 rows. That is roughly 3 phone-screens of content — nothing beyond
   it is ever in the initial HTML.
2. **Cursor pagination.** `vocab-load-more.tsx` is an `IntersectionObserver` sentinel below
   the last row; on intersect it `fetch`es `GET /api/vocab` with `nextCursor` and appends.
   It also renders a manual "Load more" button as a fallback so the list is usable if the
   observer never fires. Stops when `nextCursor` is null.
3. **CSS containment on rows** — every row gets
   `content-visibility: auto; contain-intrinsic-size: 0 64px;`. Off-screen rows skip layout
   and paint entirely. Supported in iOS Safari 18+; on older Safari it is simply ignored and
   the list still works — a progressive enhancement, not a requirement. This is why the row
   height is fixed: `contain-intrinsic-size` must match, or scrollbar position jitters.

No virtualisation library. A JS virtualiser at this scale costs more in bundle size and
scroll-jank on an SE than it saves.

**Empty states** (F2's empty-state component):

| Condition | Copy | Action |
|---|---|---|
| Zero words at all | "No words yet." / "Add the first one, or let Discover suggest one." | **Add a word** → `/vocab/new`; secondary **Discover** → `?tab=discover` |
| Search matches nothing | "Nothing matches "gen"." | **Clear search** |
| Filter = Active, all mastered | "Every word is mastered." / "Nothing left for the daily card." | **Add a word** |
| Filter = Mastered, none yet | "Nothing mastered yet." | none |

### 7.2 `/vocab?tab=discover`

F4 renders `<DiscoverTab userId={…} />` from `components/vocab/discover-tab.tsx`. Until F8
lands, that file is an empty state: "Discover is on the way." with a link to `/vocab/new`.
The tab must never 404, never blank-screen, and never throw. §9.1 is the contract.

### 7.3 `/vocab/[id]` — the detail page

The roadmap's stated goal: **no scrolling where possible.**

**The layout budget.** Assume 375 × 667 with iOS Safari's toolbars expanded, the worst
realistic case. Content height is:

```
content = 100dvh − 44px (page header) − 49px (F1 tab bar) − env(safe-area-inset-bottom)
```

which on that device lands around **440–470 px**. So the budget is:

> **The default detail layout must render in ≤ 440 px of content height at 375 px width.**

Allocation:

| Block | Height | Notes |
|---|---|---|
| Term | 34 px | 28 px type, single line, adaptive scale below |
| Meta line | 20 px | `adjective · /dʒɛnˈtiːl/ · seen 7×`, 13 px, muted, one line, ellipsised |
| gap | 12 px | |
| Definition | ≤ 72 px | 17 px / 24 px line-height, clamped to 3 lines |
| gap | 20 px | |
| "Examples" label | 18 px | 12 px, uppercase, tracked, muted |
| 3 example rows | 3 × 56 px = 168 px | 15 px / 22 px, ≤ 2 lines each, 12 px gap |
| gap | 16 px | |
| Action bar | 76 px | 48 px primary chat button + 28 px secondary row |
| **Total** | **≈ 416 px** | 24 px of slack under the 440 budget |

The bottom tab bar **stays visible** on the detail page. It costs 49 px, which the budget
above already absorbs, and removing it would make Vocab the one section of the app where the
global navigation vanishes — a nested-navigation pattern the roadmap forbids.

**The adaptive type scale** (`termSizeClass()` in `lib/vocab/format.ts`) — pure length
buckets, no JS measurement, no layout thrash:

| `term.length` | size / line-height |
|---|---|
| ≤ 14 | 28 / 34 |
| 15–22 | 22 / 28 |
| ≥ 23 | 18 / 24, wraps to at most 2 lines, then ellipsis |

**When content genuinely exceeds the budget.** Ranked rules, applied in order:

1. **Definition** clamps to 3 lines via `-webkit-line-clamp`. If clamped, the block is
   tappable and expands in place; a "more" affordance is rendered so the truncation is never
   silent. Expanding is allowed to push the page into scrolling.
2. **Examples**: render at most **3**, even if F3 stored more. Any remainder sits behind a
   "More examples (2)" disclosure that expands in place. Each example is clamped to 2 lines
   with the same tap-to-expand. Never truncate mid-sentence without an affordance.
3. **Term**: the scale above; at 23+ characters, 2 lines then ellipsis with the full term in
   `title` and `aria-label`.
4. **If it still overflows** — a long definition and three two-line examples on a short
   viewport — **the page scrolls normally.** No inner scroll container, no height hacks. But:

> **The action bar is pinned.** `position: sticky; bottom: 0` directly above the tab bar,
> with F2's surface background and a hairline top border. Whatever the content does, "Practice
> this word", the master toggle and delete are always one tap away without scrolling. It is
> the only pinned element on the page.

This is the honest resolution of "should not need scrolling": the *default* case fits by
budget, the *overflow* case degrades to ordinary scrolling, and the actions never move.

**Page structure:**

```
┌───────────────────────────────┐
│ ‹ Back                        │  44px. BackLink, fallback /vocab
├───────────────────────────────┤
│ genteel                       │  DetailHeader
│ adjective · /dʒɛnˈtiːl/ · 7×  │
│                               │
│ Polite and refined in a way   │  DetailDefinition
│ that is affected or           │
│ pretentious.                  │
│                               │
│ EXAMPLES                      │  DetailExamples
│ · He had a genteel manner …   │
│ · The genteel shabbiness of … │
│ · She spoke in genteel tones… │
│                               │
├───────────────────────────────┤
│ ┌───────────────────────────┐ │  DetailActions — sticky bottom
│ │  Practice this word       │ │  primary, full width, 48px → /vocab/[id]/chat
│ └───────────────────────────┘ │
│  ✓ Mastered            Delete │  toggle (leading) · destructive text (trailing)
└───────────────────────────────┘
         [ bottom tab bar — F1 ]
```

**Enrichment states** (`enrichment_status`):

| State | Definition block | Examples block | Actions |
|---|---|---|---|
| `ready` | as stored | as stored; if `examples` is empty/null → "No examples yet." | all enabled |
| `pending` | shimmer placeholder, 2 lines, + "Preparing this word…" | shimmer, 3 rows | chat button **disabled** with helper text "Available once the word is ready"; master + delete enabled |
| `failed` | "We couldn't look this word up." | hidden | **Try again** secondary button → `POST /api/vocab/[id]/enrich` (F3's route — see §12.3); chat disabled; delete enabled |

`pending` does **not** auto-poll. A page-load-time poll loop on a free-tier app is a cost with
no ceiling; the user pulls to refresh or navigates back in. If F3 exposes a completion signal,
wire it later.

**Master toggle** (`master-toggle.tsx`):

- A switch-styled control labelled **"Mastered"**, with a persistent one-line explanation
  underneath at 12 px muted: *"Kept in your collection. Stops appearing on daily cards."*
  This is the whole mental model in one sentence — it must be on screen, not in a tooltip,
  because it is the single most consequential action on the page.
- Optimistic: flip immediately, `PATCH { op:'set_status', status }`, then `router.refresh()`.
  On failure revert and show F2's inline error "Couldn't save that. Try again."
- `aria-checked`, `role="switch"`, and the control is disabled while a request is in flight.
- Un-mastering is the same control, the same request, `status: 'active'`.
- Mastered words **keep** the chat button. Mastering retires a word from the daily card only;
  practising it is still allowed and F6 has no reason to care.

**Delete** (`delete-word-button.tsx`):

- Trailing text button in F2's destructive colour. Not an icon — an icon-only destroy action
  is exactly the ambiguity Product Principle 1 rejects.
- Opens F2's confirm sheet:
  - Title: `Delete "genteel"?`
  - Body, when `cardAppearances > 0`: *"It stays on the 7 daily cards it appeared on. It will
    not come back on new ones."*
  - Body, when `cardAppearances === 0`: *"This removes it completely."*
  - Buttons: **Delete** (destructive) / **Cancel**.
  - The body copy is fetched from the same `cardAppearances` value already rendered in the
    meta line — no extra request.
- On success `router.replace('/vocab')` — `replace`, not `push`, so the back button cannot
  return to a detail page whose entry no longer exists.

**Tombstone** (soft-deleted entry, reached from a historical daily card link):

```
┌───────────────────────────────┐
│ ‹ Back                        │
│ genteel                       │  muted
│ Removed from your collection  │  13px
│                               │
│ Polite and refined in a way…  │  read-only, no clamping needed
│                               │
│ Kept because it appeared on 7 │
│ daily cards.                  │
│                               │
│ ┌───────────────────────────┐ │
│ │  Restore to my words      │ │  secondary
│ └───────────────────────────┘ │
└───────────────────────────────┘
```

No chat button, no master toggle, no delete. Restore → `PATCH { op:'restore' }` →
`router.refresh()`, and the page becomes the ordinary detail view in place.

### 7.4 Navigation and entry points

Three doors, one route, no variants:

| From | Element | Href |
|---|---|---|
| F5 daily card | a card row | `vocabDetailHref(item.vocabEntryId)` |
| F4 collection | a list row | `vocabDetailHref(entry.id)` |
| F8 Discover | a word just added | `vocabDetailHref(newId)` |

The detail page is stateless about its referrer: it renders identically for all three and
never reads `document.referrer` for content decisions. `BackLink` uses history when it can
(`window.history.length > 1`) so a user who arrived from `/today` goes back to `/today`, and
falls back to `<Link href="/vocab">` on a cold deep link or reload.

---

## 8. Implementation steps

Each step is independently verifiable. Do them in order; commit at each numbered step.

**1. Schema + migration.**
Add `deletedAt` to `vocabEntries` in `lib/db/schema.ts` plus the three indexes from §5.3
(B, C, D). Run `npx drizzle-kit generate`, inspect the emitted SQL (it must contain exactly
one `ADD COLUMN` and three `CREATE INDEX`, and no `DROP`), then `npx drizzle-kit migrate`.
*Verify:* `\d vocab_entries` in psql shows `deleted_at` nullable and the two new indexes;
`\d daily_card_items` shows the third. `npx tsc --noEmit` passes.

**2. Shapes and helpers.**
Write `lib/vocab/schemas.ts`, `lib/vocab/links.ts`, `lib/vocab/cursor.ts`,
`lib/vocab/format.ts`.
*Verify:* a scratch node script round-trips a cursor for each of the three sorts and
confirms `escapeLikePattern('100%_x')` → `100\%\_x`. `tsc --noEmit` passes.

**3. Read queries.**
Add `listVocabEntries`, `countVocabByStatus`, `getVocabEntryDetail` to
`lib/db/queries/vocab.ts`, exactly per §6.2/§6.3, including the `deleted_at IS NULL` filter
on list and its absence on detail.
*Verify:* a scratch script against the dev database seeded with 600 rows returns page 1 of 50,
follows `nextCursor` to the end, and yields 600 distinct ids with no duplicates and no gaps,
for each of the three sorts. `EXPLAIN` on the `newest` query shows an index scan on
`idx_vocab_entries_user_created`.

**4. `GET /api/vocab`.**
Add the `GET` export to `app/api/vocab/route.ts`. Do not touch F3's `POST`.
*Verify:* `curl` with a signed-in cookie returns the documented body; `?limit=999` clamps to
100; `?sort=banana` degrades to `newest` with 200; `?cursor=garbage` returns 400
`invalid_request`; no cookie returns 401. F3's create flow still works end to end.

**5. Tab shell.**
Build `app/vocab/page.tsx`, `components/vocab/vocab-tabs.tsx`, and the placeholder
`components/vocab/discover-tab.tsx` with its frozen props (§9.1). Mine renders a bare
unfiltered list of terms for now.
*Verify:* `/vocab`, `/vocab?tab=mine`, `/vocab?tab=discover` and `/vocab?tab=nonsense` all
render; the strip highlights the right segment; back/forward moves between tabs; no
client-side state survives a reload because there isn't any.

**6. Mine list — rows and empty states.**
`vocab-list.tsx`, `vocab-row.tsx`, the count header, all four empty states from §7.1.
*Verify:* at 375 px, a mastered row is distinguishable from an active row by both the muted
term and the ✓ chip. A brand-new account shows the zero state with a working
**Add a word** link. Rows are exactly 64 px tall.

**7. Toolbar — search, filter, sort.**
`vocab-toolbar.tsx`, wired to `searchParams` via `router.replace`.
*Verify:* typing "gen" updates the URL once, ~250 ms after the last keystroke, not per
keystroke; the browser back button leaves `/vocab` rather than replaying the search;
searching `50%` matches only terms containing "50%"; each status chip shows a count and the
counts do not change when the chip selection changes.

**8. Pagination.**
`vocab-load-more.tsx` with the sentinel plus the manual button fallback. Apply
`content-visibility`/`contain-intrinsic-size` to rows.
*Verify:* with 600 seeded words, scrolling reaches the end through 12 fetches, no row appears
twice, and the button appears and works with the `IntersectionObserver` stubbed out. Chrome
DevTools mobile throttling: scrolling the full list stays above 50 fps.

**9. Detail page — read only.**
`app/vocab/[id]/page.tsx`, `detail-header.tsx`, `detail-definition.tsx`,
`detail-examples.tsx`, `back-link.tsx`, `loading.tsx`, `not-found.tsx`. No actions yet.
*Verify:* the layout budget — at 375 × 667 with a 3-line definition and three 2-line
examples, `document.documentElement.scrollHeight <= innerHeight`. `/vocab/not-a-uuid` and a
word id belonging to another account both render the 404 page. `enrichment_status` of
`pending` and `failed` each render their documented state.

**10. Chat entry point.**
`detail-actions.tsx` with the sticky bar and the primary link to `vocabChatHref(id)`,
disabled while `enrichment_status !== 'ready'`.
*Verify:* the bar stays visible while scrolling an artificially long entry; the link href is
`/vocab/<id>/chat`; it is disabled and explained on a pending entry. A 404 from that route is
expected until F6 lands — note it and move on.

**11. Master toggle.**
`master-toggle.tsx` + the `set_status` branch of `PATCH /api/vocab/[id]`.
*Verify:* toggling on sets `status='mastered'` and a non-null `mastered_at` in the database;
toggling off nulls `mastered_at`; `select count(*) from daily_card_items where
vocab_entry_id = …` is **unchanged** across both; double-tapping does not move `mastered_at`;
a mastered word disappears from `status='active'` list filters; with the network offline the
switch reverts and shows the inline error.

**12. Delete + restore + tombstone.**
`DELETE` and the `restore` branch of `PATCH`; `delete-word-button.tsx`,
`restore-word-button.tsx`, `tombstone.tsx`.
*Verify:* deleting a word with zero card appearances removes the row entirely (`mode:'hard'`)
and its `chat_sessions` row is gone; deleting one that appeared on cards returns
`mode:'soft'`, leaves `daily_card_items` row count unchanged, and the past card still renders
the term; visiting the soft-deleted id shows the tombstone; Restore returns it to the Mine
list with its previous status intact; after deleting, the browser back button does not land
on a dead detail page.

**13. Resurrect-on-re-add.**
Add `findResurrectableEntry` and wire it into the create path in `lib/db/queries/vocab.ts`
per §5.4.
*Verify:* soft-delete a word, then add the same term (different casing) through `/vocab/new`.
No unique-violation error; the entry returns with `deleted_at` null, `status='active'`,
`enrichment_status='pending'`, the original `created_at`, the **same id**, and its historical
`daily_card_items` still pointing at it.

**14. Publish the shared contracts.**
Confirm every export in §9 exists at the stated path with the stated signature. Add a
`// F4 contract — do not change signature without updating plans/F4-vocab-detail.md §9`
comment above each.
*Verify:* `npx tsc --noEmit`, `npm run build`, `npm run lint` all clean. Grep the repo for
inline Drizzle queries under `app/` and `components/` — there must be none.

---

## 9. Shared contracts this feature exports

### 9.1 Tab shell → F8

**The file F8 owns after F4 lands:** `components/vocab/discover-tab.tsx`.

**Frozen signature.** F4 ships this; F8 replaces the body and nothing else.

```ts
// components/vocab/discover-tab.tsx
// F4 contract — F8 replaces the body. Do not change the path, the props, or the default export.
export interface DiscoverTabProps {
  /** Authenticated user id, already resolved from auth() by the shell. */
  userId: string;
}
export default async function DiscoverTab({ userId }: DiscoverTabProps) { /* … */ }
```

Guarantees F4 makes to F8:

1. `/vocab?tab=discover` routes to this component. F8 adds no route, no `page.tsx`, no
   `layout.tsx` under `app/vocab/`.
2. It is rendered as an **async server component** inside the shell's scroll container, below
   the sticky tab strip. It may render client components beneath itself.
3. `userId` is non-null and authenticated. F8 does not call `auth()` again for identity, and
   does not need to handle the signed-out case — the shell already redirected.
4. F8 receives the **full width** of the container and unbounded height. The shell adds no
   horizontal padding, so F8 controls its own gutters (use F2's page-gutter token to match
   the Mine tab).
5. The shell reserves `top: 0` for the tab strip. **F8 must not add a `position: sticky` or
   `fixed` element at `top: 0`** — it will collide. If Discover needs a sticky element, it
   must offset by the strip height, exposed as the CSS custom property
   `--vocab-tabstrip-h` set by the shell.
6. The shell adds bottom padding for the F1 tab bar and the safe-area inset. F8 does not
   repeat it.
7. Query params other than `tab` are **not** cleared by the shell when Discover is active.
   F8 may use its own params freely, provided none is named `tab`, `q`, `status`, `sort`
   (Mine owns those four).
8. If `DiscoverTab` throws, the shell's error boundary keeps the Mine tab reachable. F8 should
   still handle its own failures.

F8 links to a word it has added with `vocabDetailHref(id)` from `lib/vocab/links.ts`, and
**must** dedup its suggestions against every row of `vocab_entries` for the user *including*
soft-deleted and mastered ones (§5.5) — a suggestion matching a soft-deleted term would
violate `UNIQUE (user_id, lower(term))` on accept.

### 9.2 Chat entry point → F6

```ts
// lib/vocab/links.ts
export const vocabChatHref = (id: string) => `/vocab/${id}/chat`;
```

- F4 renders exactly one entry point: the primary button in the sticky action bar on
  `/vocab/[id]`, labelled **"Practice this word"**. F6 may change that label; it must not
  move the button or add a second entry point elsewhere in the vocab surface.
- F4 guarantees the button only renders when: the entry exists, belongs to the session user,
  `deleted_at IS NULL`, and `enrichment_status = 'ready'`. F6's page must still re-verify all
  four itself — the button is not the only way to reach the URL.
- **Mastered words keep the button.** Mastering retires a word from daily cards, not from
  practice. F6 must not special-case `status`.
- F6 owns `app/vocab/[id]/chat/page.tsx` and everything under it. F4 creates no file in that
  directory.
- **Optional enhancement, F6's call.** If F6 exports
  `getChatSessionSummary(userId, vocabEntryId): Promise<{ turnCount: number; closedAt: Date | null } | null>`
  from `lib/db/queries/chat.ts`, F4 will render the button as "Continue practice · 3 of 8" or
  "Practice again". Until then the label is static and F4 issues no chat query. F6 changing
  the label is a one-line edit in `detail-actions.tsx`.
- If a word is deleted, F4 deletes its `chat_sessions` row (and, by the existing cascade, its
  messages). F6 must not assume a session outlives its word.

### 9.3 Rules → F5, F8, F9

```ts
// lib/vocab/links.ts
export const vocabListHref = (params?: { tab?: 'mine' | 'discover' }) => string;
export const vocabDetailHref = (id: string) => `/vocab/${id}`;
```

All three features link to detail through `vocabDetailHref`. No hand-built `/vocab/${id}`
template literals anywhere in the repo.

**The soft-delete filter rule** — the table in §5.5 is the contract. Restated for the two
features most likely to get it wrong:

- **F5 selection must add `AND deleted_at IS NULL`** to its weighted-random query, alongside
  the roadmap's `status = 'active'`. Omitting it will put a deleted word on a new card.
- **F5 rendering an existing card must NOT filter.** A card's items are frozen at creation.
  A word mastered or deleted afterwards still appears on the cards it appeared on — that is
  the point of the whole soft-delete design.
- F4 exposes, for card-item DTOs F5 builds:
  `isDeleted: entry.deletedAt !== null` — optional, for muting a deleted word's styling on a
  historical card. F5 may ignore it; it must not use it to hide the row.
- **F9's collector level** counts `source = 'manual' AND deleted_at IS NULL`.

**Also guaranteed to F5:** F4 never writes `daily_cards` or `daily_card_items`, and never
writes `last_shown_on`. Those remain F5's exclusively.

### 9.4 Create path → F3 (retroactive amendment)

F4 modifies `lib/db/queries/vocab.ts`'s create path to resurrect a soft-deleted row instead
of inserting (§5.4). F3's route contract, request shape, response shape and UI are unchanged.
A future session touching `/vocab/new` must preserve this branch, or re-adding a deleted word
will 500 on a unique violation.

---

## 10. Edge cases and failure modes

**Identity and access**

1. `/vocab/[id]` where `id` is not a UUID (e.g. someone types `/vocab/discover`) → zod parse
   fails → `notFound()`. Never let a malformed id reach the database.
2. `id` belongs to another user → `notFound()`, not 403. Do not disclose existence.
3. Session expires mid-session; a mutation returns 401 → the client shows "Please sign in
   again" and links to `/signin`. No silent failure.

**Delete and restore**

4. Delete a word currently on **today's already-generated card** → the card is frozen and
   still shows it. Correct: the card is a record of a decision made this morning. F5 may mute
   the row via `isDeleted`.
5. Delete a word while F5 is concurrently creating a card that includes it → the `FOR UPDATE`
   lock in §6.5 serialises them. Either the card creation commits first (delete then takes the
   soft path) or the delete commits first (card creation's FK insert fails and F5 retries
   selection). Neither produces a dangling FK.
6. Double-tap Delete → the second request finds the row already soft-deleted, returns
   `200 { mode: 'soft' }`, or finds nothing after a hard delete and returns 404. The client
   treats **both 200 and 404 as success** and navigates away.
7. Delete → back button → the detail page is gone. Mitigated by `router.replace`.
8. A soft-deleted word's detail URL is bookmarked or linked from a card → the tombstone, not
   a 404. This is why detail does not filter `deleted_at`.
9. Restore a word whose term has since been re-added as a **new live row** — impossible: the
   unique index prevents the new row from existing, and §5.4 routes re-adds through the
   resurrect path. If it somehow occurs, the `restore` update violates the unique index →
   return `409 conflict` with "You already have this word."
10. Delete every word → the list shows the zero-words empty state, and F5 shows its own
    "fewer than 6 active words" prompt. Neither pads with filler.

**Master**

11. Master a word that is on today's card → today's card is unchanged; the word is excluded
    from **future** selection only. If the user expects it to vanish today, the toggle's
    explanatory line ("Stops appearing on daily cards") is doing its job by not promising
    otherwise.
12. Master → un-master → master, rapidly. Absolute `set_status` plus the "only set
    `mastered_at` if not already mastered" guard means the timestamp records the *first* of a
    contiguous run, and no request ordering produces an inconsistent state.
13. Master the same word from two devices → both PATCH to the same target; the second is a
    no-op; both responses carry the canonical entry and both clients reconcile.
14. Master a word whose enrichment `failed` → allowed. The user knows what the word means;
    the app's failure to enrich is not a reason to block them.

**List**

15. Search string containing `%`, `_` or `\` → escaped via `escapeLikePattern` with
    `ESCAPE '\'`. Test `100%` explicitly.
16. Search string longer than 64 chars → the schema **slices** it to 64 rather than rejecting
    it, so a pasted paragraph in the search box degrades to a search rather than a 400. This
    is why `q` uses `.transform(s => s.slice(0, 64))` and not `.max(64)` in §6.1 — `.max()` on
    an optional field throws, and `q` carries no `.catch()`.
17. User changes sort while a `load-more` fetch is in flight with the old cursor → the cursor
    carries its sort; mismatch → 400 → the client discards the response and restarts from
    page 1 under the new sort. No mixed-order list.
18. A word is deleted on another device between page 1 and page 2 → keyset pagination is
    stable against deletions (unlike `OFFSET`); at worst one row is absent. Acceptable.
19. Terms that sort identically under `lower(term)` (e.g. "Genteel" and "genteel" — barred by
    the unique index, but casing changes could still tie transiently) → the `id` tiebreaker in
    every sort key guarantees a total order, so pagination cannot loop or skip.
20. 500+ words on a cold 3G connection → only 50 rows in the initial HTML; the rest is
    demand-loaded. Measure the `/vocab` document response size and keep it under ~60 KB.
21. `definition` is null (enrichment pending or failed) → the row shows its state string, never
    an empty second line that collapses the row height and breaks
    `contain-intrinsic-size`.

**Detail rendering**

22. `examples` is `null`, `[]`, or contains non-strings (bad LLM output that got persisted) →
    parse with `z.array(z.string()).catch([])` at the read boundary. Never `.map()` over
    unvalidated jsonb.
23. A single example longer than 200 characters → 2-line clamp + tap to expand.
24. A term of 40+ characters → 18 px, 2 lines, ellipsis, full term in `aria-label`.
25. `pronunciation` null and `part_of_speech` null → the meta line collapses to just
    "seen 7×"; if `cardAppearances` is 0 too, the meta line is omitted entirely and its 20 px
    returns to the budget. Never render a line of lonely separator dots.
26. iOS Safari URL bar collapsing on scroll → `dvh` throughout; verified by scrolling a long
    entry and confirming the sticky action bar never detaches or overlaps the tab bar.
27. Landscape at 667 × 375 → the budget is blown; the page scrolls, the action bar stays
    pinned. Accepted, per Product Principle 2 (one device, one hand, portrait).
28. Dynamic Type / large accessibility text → the layout scrolls rather than clipping. Never
    use fixed pixel heights that clip text; the 64 px row and the budget table are targets,
    enforced by `min-height`, not `height`.

**Network**

29. Any mutation fails (offline, 500) → optimistic state reverts, the inline error appears,
    and the underlying data is untouched. No mutation is fire-and-forget.
30. `router.refresh()` after a mutation fails → the optimistic state is already correct in the
    DOM; the next navigation reconciles. Do not block the UI on the refresh.

---

## 11. Verification checklist

Run all of these. Each has an expected result; a checklist item without one is not a check.

### Build and types

- [ ] `npx tsc --noEmit` → 0 errors.
- [ ] `npm run lint` → 0 errors.
- [ ] `npm run build` → succeeds; no `useSearchParams()` Suspense warnings.
- [ ] `grep -rn "from 'drizzle-orm'" app/ components/` → **no matches** (roadmap convention:
      data access lives in `lib/db/queries/`).
- [ ] `grep -rn "/vocab/\${" app/ components/ --include=*.tsx` → no matches outside
      `lib/vocab/links.ts`.

### Database

- [ ] `\d vocab_entries` → `deleted_at | timestamp with time zone | nullable`; indexes
      `idx_vocab_entries_user_created`, `idx_vocab_entries_user_last_shown` present.
- [ ] `\d daily_card_items` → `idx_daily_card_items_vocab_entry_id` present.
- [ ] The generated migration contains no `DROP`, no `ALTER … TYPE`, and no change to any
      constraint named in the roadmap schema.

### API (with a valid session cookie in `$C`)

- [ ] `curl -s -b $C '/api/vocab?limit=2'` → 200, `items.length === 2`, `nextCursor` non-null,
      `counts` present.
- [ ] Follow `nextCursor` to exhaustion over 600 seeded rows → 600 unique ids, `nextCursor`
      finally null. Repeat for `sort=alpha` and `sort=least_seen`.
- [ ] `curl '/api/vocab'` with no cookie → 401 `unauthorized`.
- [ ] `?sort=banana&status=purple` → 200, behaves as `newest`/`all`.
- [ ] `?cursor=zzz` → 400 `invalid_request`.
- [ ] `?q=100%25` against a term "100% proof" → matches it and nothing else.
- [ ] `PATCH /api/vocab/<id>` body `{"op":"set_status","status":"mastered"}` → 200; DB shows
      `status='mastered'`, `mastered_at` non-null.
- [ ] Repeat the identical PATCH → 200; `mastered_at` **unchanged** (compare the timestamp).
- [ ] `PATCH … {"op":"set_status","status":"active"}` → `mastered_at IS NULL`,
      `last_shown_on` **unchanged**.
- [ ] `PATCH … {"op":"nonsense"}` → 400.
- [ ] `PATCH` another user's id → 404.
- [ ] `DELETE` a word with 0 card items → `{"mode":"hard"}`; row gone; its `chat_sessions` row
      gone; its `chat_messages` gone.
- [ ] `DELETE` a word with ≥1 card item → `{"mode":"soft"}`;
      `select count(*) from daily_card_items where vocab_entry_id=…` **unchanged**;
      `deleted_at` non-null.
- [ ] `DELETE` the same id again → 200 or 404, never 500.

### History preservation (the load-bearing invariant)

- [ ] Snapshot `select card_id, position, vocab_entry_id from daily_card_items order by 1,2`
      into a file. Master three words, un-master one, delete two (one with history, one
      without). Re-run the query. **Diff is empty.**
- [ ] Open a past daily card in F5 (or query it directly) → it still renders all six terms,
      including the soft-deleted one.

### Layout, on an iPhone SE viewport (375 × 667) in Safari or DevTools iOS emulation

- [ ] `/vocab/[id]` for a word with a 3-line definition and three 2-line examples →
      `document.documentElement.scrollHeight <= window.innerHeight`. **No scrollbar.**
- [ ] Same page with a 6-example, 300-character-definition word → the page scrolls, and the
      action bar is visible at every scroll position including the top and the bottom.
- [ ] A 40-character term → renders at the small scale, at most 2 lines, no horizontal
      overflow (`document.body.scrollWidth === 375`).
- [ ] The bottom tab bar is visible on both `/vocab` and `/vocab/[id]`, and nothing is hidden
      behind it (check with `env(safe-area-inset-bottom)` simulated non-zero).
- [ ] Scroll the detail page so the URL bar collapses → the sticky action bar does not
      detach, jump, or overlap the tab bar.

### List behaviour

- [ ] With 600 seeded words, `/vocab` initial HTML contains 50 rows (count
      `data-testid="vocab-row"` occurrences in `curl`'s output).
- [ ] Scroll to the bottom repeatedly → all 600 load; no id appears twice
      (collect them in the console and compare `new Set(ids).size`).
- [ ] Chrome DevTools Performance, 4× CPU throttle, fling the loaded 600-row list →
      no frame over 32 ms sustained.
- [ ] Type "gen" → exactly one URL change ~250 ms after the last keystroke (check the
      Network/History panel).
- [ ] Search → tap a row → browser back → **the same search, the same filter, the same
      scroll position.**
- [ ] Browser back from `/vocab?q=gen` exits to the previous page, not through "ge" and "g".
- [ ] A mastered row is distinguishable from an active row in a greyscale screenshot (the ✓
      chip, not just colour).
- [ ] Each of the four empty states renders with its documented copy and working action.

### Cross-feature

- [ ] `/vocab?tab=discover` renders the placeholder without error, and switching back to Mine
      restores the list.
- [ ] The `DiscoverTab` props interface matches §9.1 character for character.
- [ ] "Practice this word" href is exactly `/vocab/<uuid>/chat` (404 until F6 — expected).
- [ ] The chat button is disabled for a `pending` and a `failed` entry, enabled for a
      `mastered` one.

### Resurrect

- [ ] Soft-delete "genteel"; add "Genteel" via `/vocab/new` → 200, no unique violation; the
      returned id equals the original id; `created_at` is the original; `deleted_at` is null;
      `enrichment_status` is `pending`; the historical `daily_card_items` rows still point at
      it.

---

## 12. Open questions / discrepancies with `ROADMAP_v0.1.0.md`

None of these are contradictions of the roadmap; they are places where it is silent and F4
had to choose. Each states the choice made so the next session can execute without stalling.
If a reviewer disagrees, changing the decision should touch only the cited section.

**12.1 — The roadmap does not say what deleting a word means.** It is explicit that mastering
must not delete history, and it gives `daily_card_items` a plain FK, which makes a naive hard
delete impossible. F4 chose hard-delete-when-unreferenced / soft-delete-otherwise (§5.3), and
added one column to do it. This is the only schema addition with real product consequences —
if it is wrong, correct it before F5 ships, because F5's selection query depends on it.

**12.2 — Chat sessions are deleted with the word; daily card items are not.** The roadmap
doesn't rank these. F4's rule is "days are sacred, practice is not" (§5.3). The alternative —
preserving the chat — hands a resurrected word a used-up, closed session that `UNIQUE
(user_id, vocab_entry_id)` prevents replacing. F6 should confirm it is happy with this.

**12.3 — The re-enrichment endpoint's name is assumed.** The `failed` state renders a "Try
again" button that POSTs to `/api/vocab/[id]/enrich`. F3 owns that route and this plan cannot
see F3's file. **On implementation: grep `app/api/vocab/` for F3's retry route and use its
actual path.** If F3 exposes no retry, render the failed state without the button and log a
note — do not build a second enrichment path in F4, which would violate the roadmap's
"one shared LLM wrapper, features add prompts not transports" rule.

**12.4 — The error envelope may already exist.** §6.0 defines one. If F1 or F3 shipped a
different shape, adopt theirs verbatim and delete §6.0's. Two envelopes in one API is worse
than either.

**12.5 — `/vocab/new` is reached from a header "+" button.** The roadmap's route map has
`/vocab/new` but does not say where the entry point lives, and the four-item tab bar has no
room for it. F4 puts a `+` in the `/vocab` header and in the zero-state. If F3 already placed
one elsewhere, keep F3's and drop the duplicate.

**12.6 — "Seen N×" on the detail meta line is new product surface.** It is a `COUNT(*)` on an
index F4 adds anyway for the delete path, it costs zero layout height (it shares the meta
line), and it makes the mastered decision feel informed. It is not in the roadmap. Cheap to
remove: delete one segment of `formatMetaLine()`.

**12.7 — The tab is `?tab=`, not a route segment.** Reasoning in §7.1. The roadmap's route
map lists `/vocab` with tabs and does not describe the mechanism; this reading adds no route
and avoids a static-vs-dynamic segment ambiguity with `/vocab/[id]`. F8 must not change it.

**12.8 — No edit affordance for an enriched word.** Deliberate (§3). If a user reports bad
enrichment, the answer in v0.1.0 is delete and re-add, which §5.4's resurrect path now makes
a clean re-enrichment. Worth revisiting in v0.2.0 only if it is a real complaint.
