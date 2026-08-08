> ## ⚠ SUPERSEDED IN PART — read `ROADMAP_v0.1.0.md` § Reconciliation Decisions first.
>
> - **[R4]** Decision 1 (propose before add) **stands**, but its justification is void — v0.1.0 *does* have a delete path. Rewrite the reasoning: the argument is pollution of the 6-word card pool, not irreversibility.
> - **[R1]** No tombstones exist. Drop any soft-delete handling from the dedup design.
> - **[R17]** F4 froze the Vocab tab contract: `?tab=` params, `DiscoverTabProps { userId }`, no sticky `top: 0`, and the names `tab`/`q`/`status`/`sort` are reserved.
>
> These plans were written in parallel by agents that could not see each other.
> The Reconciliation section wins over anything below.

# F8 — Discovery: LLM Vocab Suggestions

> Read `ROADMAP_v0.1.0.md` first. Its "Locked Decisions" section wins over anything here.
> If this file appears to contradict it, stop and report the discrepancy.

---

## 1. Goal

Keep the vocabulary collection growing on days when the user has not been reading, by
proposing words they do not already have. One prominent button in the **Discover** tab
of `/vocab` proposes a single word tuned to the user's profile; accepting it writes a
`vocab_entries` row with `source='suggested'` so it flows into daily cards like any
manually added word. Discovery must never propose a word already in the collection,
including mastered words and simple morphological variants.

---

## 2. Depends on / blocks

### Depends on

| Feature | What F8 consumes from it | Hard or soft |
|---|---|---|
| **F1** | Drizzle schema + migrations for `vocab_entries` and `profiles`; the shared LLM client in `lib/llm/`; Auth.js session helper; app shell | Hard — nothing here runs without it |
| **F2** | Button, card surface, empty state, and text tokens. F8 writes **no new design primitives** | Hard for final look, soft for wiring |
| **F3** | The enrichment prompt and the create-entry service. F8 calls into it; F8 **never** writes a second enrichment prompt | Hard |
| **F4** | The `/vocab` tab shell that mounts Discover, and the `/vocab/[id]` detail page F8 navigates to | Hard |
| **F7** | `buildProfileContext()` and the `profiles` row it populates | Soft — F8 degrades to a default register when the profile is absent or empty |

### Blocks

Nothing. F8 is a leaf. F5 (daily card) benefits from it — Discovery is the second
supply line into `vocab_entries` — but F5 selects on `status='active'` regardless of
`source` and needs no change to accommodate F8.

### Seams F8 assumes (see §15 — verify these before writing code)

```ts
// F7 — lib/profile/context.ts
export function buildProfileContext(userId: string): Promise<ProfileContext>

// F3 — lib/vocab/create-entry.ts
export function createVocabEntry(input: {
  userId: string
  term: string
  source: 'manual' | 'suggested'
}): Promise<{
  id: string
  term: string            // may differ from input.term if F3 typo-corrected it
  status: 'active' | 'mastered'
  enrichmentStatus: 'pending' | 'ready' | 'failed'
  alreadyExisted: boolean
  rejected?: { reason: string }   // F3 judged the term not a real English word
}>

// F4 — components/vocab/vocab-tabs.tsx (or equivalent) mounts:
import { DiscoverTab } from '@/components/vocab/discover-tab'
```

Both couplings are isolated to exactly one adapter function each
(`renderProfileBlock()` in `lib/llm/prompts/suggest-words.ts`, and the single
`createVocabEntry` call in the accept route), so a signature mismatch is a
five-line fix, never a rewrite.

---

## 3. In scope / explicitly out of scope

### In scope

- The **Discover** tab body: the "Pick a new word for me" button, the proposal card,
  and the accept / next actions.
- `POST /api/vocab/suggestions` — generate a deduplicated batch of candidate words.
- `POST /api/vocab/suggestions/accept` — persist an accepted candidate via F3.
- The suggestion prompt in `lib/llm/prompts/suggest-words.ts` and its zod schema.
- The dedup module `lib/vocab/dedup.ts` — normalisation, morphological folding,
  known-set construction — plus the server-side enforcement that uses it.
- Profile-driven personalisation, including the empty-profile default register.
- A best-effort per-user rate limit on suggestion calls.

### Explicitly out of scope

- **The tab shell, tab bar, and routing for `/vocab`.** F4 owns it. F8 exports one
  component and F4 mounts it.
- **A detail view for suggested words.** Accepting navigates to `/vocab/[id]`, the same
  page every other word uses. Building a second detail view is a defect.
- **A second enrichment prompt.** Definitions, pronunciation, part of speech, and
  examples come from F3's pipeline only.
- **Persisting the preview gloss.** See §9, Decision 3.
- Themed or filtered discovery ("give me legal words", "give me 5 words about the sea").
- Bulk accept ("add all five").
- Server-side memory of rejected words. See §9, Decision 2.
- Any new database table or column. See §5.
- Notifications, scheduled discovery, or auto-adding words. Roadmap principle 5: the
  user nudges, always.
- Spaced repetition or difficulty scoring of suggestions.

---

## 4. Files to create

| Path | Purpose |
|---|---|
| `components/vocab/discover-tab.tsx` | Client component. The entire Discover tab: button, queue state, accept/next handlers, loading and error states. This is the single export F4 mounts. |
| `components/vocab/suggestion-card.tsx` | Presentational, stateless. Renders one proposal: term, part of speech, one-line gloss. Built from F2 primitives only. |
| `app/api/vocab/suggestions/route.ts` | `POST` — auth, zod-validate body, call the suggest service, return a deduplicated candidate batch. Thin. |
| `app/api/vocab/suggestions/accept/route.ts` | `POST` — auth, zod-validate, re-run dedup against fresh DB state, delegate to F3's `createVocabEntry` with `source='suggested'`, return the entry id. Thin. |
| `lib/vocab/suggest.ts` | The suggestion service: load known terms + profile, build the prompt, call the shared LLM client, parse, shape-filter, dedup-filter, one bounded retry when the batch empties. |
| `lib/vocab/dedup.ts` | Pure functions, no IO: `normalizeTerm`, `foldMorphology`, `dedupKey`, `buildKnownKeySet`, `isKnown`. The heart of the hard requirement. |
| `lib/vocab/suggestion-rate-limit.ts` | Best-effort in-memory sliding-window limiter keyed by user id. No dependency, no table. |
| `lib/db/queries/vocab-suggestions.ts` | `listAllUserTerms(userId)` — every term for the user, **no status filter** — and `findEntryByDedupKey(userId, terms)`. Own file so it cannot collide with F3's or F4's query modules. |
| `lib/llm/prompts/suggest-words.ts` | The verbatim system and user prompt, `renderProfileBlock()`, `renderAvoidList()`, and `suggestWordsResponseSchema`. Prompt only — no transport (roadmap: `lib/llm/` owns the client, features add prompts). |
| `lib/vocab/dedup.test.ts` | *Conditional.* Add only if F1 established a test runner. Otherwise verify the §8 worked examples via the §14 checklist. |

No other file is created. `app/vocab/**` is F4's; do not add routes there.

---

## 5. Data

### Tables and columns touched

**`vocab_entries`** — read and write.

| Column | F8's use |
|---|---|
| `id` | returned to the client on accept, used for `/vocab/[id]` navigation |
| `user_id` | scoping for both the known-term read and the insert |
| `term` | read (all rows, all statuses) to build the dedup set; written on accept |
| `source` | written as `'suggested'`, forced server-side — never taken from the request body |
| `status` | **read but never filtered on.** `'mastered'` rows must still block a suggestion |
| `part_of_speech`, `pronunciation`, `definition`, `examples`, `enrichment_status` | written **by F3's pipeline**, not by F8 |
| `created_at` | ordering for the AVOID-list cap (most recent 300) |

**`profiles`** — read only, and only through F7's `buildProfileContext()`. F8 issues no
direct query against `profiles`.

Nothing else is touched. `daily_cards`, `daily_card_items`, `user_stats`, and
`badges_awarded` are untouched — a suggested word enters daily cards purely by existing
with `status='active'`, which is F5's existing selection rule.

### Proposed additions to the roadmap schema

**None.** F8 requires zero migrations.

This is a deliberate result, not a coincidence:

- `source='suggested'` is already in the authoritative schema, so provenance is
  recorded without a new column. F9's collector level counts *manually* added words, so
  suggested words correctly do not inflate it.
- Rejected suggestions are held in client session state, not persisted (§9, Decision 2),
  so no `vocab_suggestion_rejections` table is needed.
- The candidate queue is client state, so no server-side cache table is needed.
- The rate limiter is in-memory, so no `llm_calls` table is needed.

**Rejected schema ideas, and why:**

| Idea | Why rejected |
|---|---|
| `vocab_suggestion_rejections(user_id, term, created_at)` | A migration, a query module, and an index to buy "don't re-show a word I declined three weeks ago" — a low-value memory. See §9, Decision 2. |
| A third `status` value, `'rejected'`, on `vocab_entries` | The roadmap fixes `status` at `'active' \| 'mastered'`. Adding a value would force F4, F5, and F9 each to learn a filter they do not currently need, and any one of them forgetting it would put a rejected word on the daily card. This is a restructure of shared meaning, which the roadmap forbids. |
| `vocab_entries.suggested_gloss` | The gloss is a preview, discarded on accept. Persisting it would create a second, divergent definition alongside F3's — exactly the defect this plan exists to avoid. |

---

## 6. API contract

Both routes are `POST`: each is non-idempotent (one costs LLM quota, the other writes a
row) and each carries a body. Both are Node-runtime route handlers, server-side only —
no LLM call ever leaves the server (roadmap, LLM access).

Both routes return `401` with `{ error: 'unauthorized' }` when there is no session.
Both zod-validate the body and return `400` with `{ error: 'bad_request', issues }` on
failure, per the roadmap's "validation at every API boundary".

### 6.1 `POST /api/vocab/suggestions`

Generates a batch of candidate words. The client keeps the batch in memory and pops one
per tap.

**Request**

```ts
export const suggestRequestSchema = z.object({
  // Terms the user declined earlier in this browser session. Client-held, best-effort.
  exclude: z.array(z.string().min(1).max(64)).max(50).default([]),
})
```

```jsonc
// example
{ "exclude": ["perspicacious", "quixotic"] }
```

**Response `200`**

```ts
export const suggestionSchema = z.object({
  term: z.string(),            // lowercase, single word, already normalised
  partOfSpeech: z.enum(['noun', 'verb', 'adjective', 'adverb']),
  gloss: z.string(),           // <= 80 chars. PREVIEW ONLY. Never persisted.
})

export const suggestResponseSchema = z.object({
  suggestions: z.array(suggestionSchema),   // 0..5, already deduped
  exhausted: z.boolean(),                   // true when the model could not clear dedup
})
```

```jsonc
{
  "suggestions": [
    { "term": "laconic",  "partOfSpeech": "adjective", "gloss": "using very few words" },
    { "term": "cadence",  "partOfSpeech": "noun",      "gloss": "the rhythm of speech or sound" },
    { "term": "winnow",   "partOfSpeech": "verb",      "gloss": "to sift out what is worthless" }
  ],
  "exhausted": false
}
```

**Other responses**

| Status | Body | When |
|---|---|---|
| `429` | `{ "error": "rate_limited" }` | more than 10 suggest calls from this user in the last hour (§12) |
| `502` | `{ "error": "llm_failed" }` | LLM unreachable, or JSON unparseable after the single permitted retry |

`suggestions: []` with `exhausted: true` is a **success**, not an error: the model ran,
but everything it returned collided with the collection. The UI copy differs from the
`502` copy.

### 6.2 `POST /api/vocab/suggestions/accept`

**Request**

```ts
export const acceptRequestSchema = z.object({
  term: z.string().min(2).max(64),
})
```

Note what is *absent*: no `source`, no `definition`, no `gloss`, no `partOfSpeech`.
`source` is forced to `'suggested'` server-side. Everything descriptive comes from F3.
The client cannot inject content into the collection through this route.

**Response `200`**

```ts
export const acceptResponseSchema = z.object({
  id: z.string().uuid(),
  term: z.string(),
  enrichmentStatus: z.enum(['pending', 'ready', 'failed']),
  alreadyExisted: z.boolean(),
})
```

```jsonc
{ "id": "3f1c…", "term": "laconic", "enrichmentStatus": "ready", "alreadyExisted": false }
```

`alreadyExisted: true` is a **success**. It means the term was added between the
suggestion and the tap (another tab, another device, or a race). The client navigates to
`/vocab/{id}` exactly as it would otherwise; the user sees their word. No error is shown.

**Other responses**

| Status | Body | When |
|---|---|---|
| `422` | `{ "error": "not_a_word", "reason": "…" }` | F3's validation rejected the term (§13). The client silently drops it and advances the queue. |
| `502` | `{ "error": "create_failed" }` | F3's service threw for a non-validation reason |

Enrichment **failure** is not a `502`: F3 persists the row with
`enrichment_status='failed'` and F8 returns `200`. The word is in the collection, which
is the point. F4's detail page owns the retry affordance.

### 6.3 Why F8 owns an accept route instead of posting to F3's `POST /api/vocab`

Reuse happens at the **service** layer, not the HTTP layer. The accept route exists
because it must do three things F3's public add-a-word endpoint has no reason to do:

1. force `source='suggested'` regardless of what the client sends;
2. re-run F8's dedup fold against fresh DB state, including the case where F3's
   typo-correction *changes* the term into a collision (§13);
3. return `alreadyExisted` so the client can navigate to the existing row instead of
   surfacing a unique-violation error.

The route is ~30 lines and contains no enrichment logic whatsoever. All of that is
`createVocabEntry`.

---

## 7. LLM prompt

Lives in `lib/llm/prompts/suggest-words.ts`. Transport is the shared client from F1;
this file exports strings and schemas only.

### 7.1 System prompt (verbatim)

```text
You are a lexicographer building a personal vocabulary list for one adult learner of English.

Your only job is to propose English words the learner does not yet know, chosen to be useful
to that specific learner. You return JSON and nothing else.

Rules:
- Propose SINGLE English words only. No phrases, no hyphenated compounds, no proper nouns,
  no abbreviations, and no foreign borrowings that are not fully naturalised in English.
- Propose words a well-read adult would plausibly meet in a quality newspaper, a literary
  novel, or a serious conversation. Not technical jargon. Not archaic curiosities that no
  living writer uses. Not words so common that any intermediate speaker already knows them.
- Every word you return must be genuinely different from every word on the AVOID list, and
  from every other word you return. "Different" means a different root, not merely a
  different ending. If "obfuscate" is on the AVOID list, do not return "obfuscation",
  "obfuscated", "obfuscatory", or "obfuscator".
- Vary the parts of speech across your answer. Do not return five adjectives.
- The gloss is a definition of at most eight words, plain and unfussy, in the register of a
  dictionary. It is a preview to help the learner decide, not the final definition.

Return exactly this JSON shape and nothing else. No prose, no explanation, no markdown fence:

{"suggestions":[{"term":"...","partOfSpeech":"...","gloss":"..."}]}

partOfSpeech must be exactly one of: noun, verb, adjective, adverb.
```

### 7.2 User prompt template (verbatim)

`{placeholders}` are substituted by `buildSuggestWordsPrompt()`.

```text
LEARNER
{profileBlock}

AVOID
The learner already has these words in their collection, or has just declined them. Do not
return any of them, and do not return any word that shares a root with one of them.
{avoidList}

Return exactly {count} suggestions.
```

### 7.3 `renderProfileBlock()` — the F7 adapter

The single point of coupling to F7. Takes whatever `buildProfileContext(userId)` returns
and produces plain text.

**Populated profile** — emit only the fields that are non-empty, one per line:

```text
Occupation: backend engineer
Interests: 19th-century novels, cycling, Indonesian history
Currently reading or watching: Bleak House by Charles Dickens
Uses English for: work email, technical writing, reading fiction
```

**Empty profile** — used when `buildProfileContext` returns nothing, when the `profiles`
row is missing, or when every personalisation field on it is null or an empty array
(the user skipped every onboarding question, which F7 explicitly permits). Emit exactly:

```text
No profile on file. Assume an adult non-native speaker of English at upper-intermediate
level, who reads general news and fiction, and who wants words that make everyday writing
and speech more precise. Favour words that are useful in a wide range of situations over
words tied to any one field.
```

`timezone` and `chat_tone` are never sent — neither has bearing on word choice, and the
roadmap's cost discipline says do not pay tokens for fields that change nothing.

### 7.4 `renderAvoidList()`

- Newline-separated, one term per line, lowercase, no bullets or numbering.
- Union of: the user's terms from `listAllUserTerms` (**all statuses**) and the request's
  `exclude` array.
- Capped at **300 terms**, taking the most recently created first. Recency correlates
  with the user's current level and current reading, which is precisely where the model
  is most likely to collide. At roughly 2 tokens per word this costs ~600 tokens — cheap
  and bounded. Everything beyond the cap is caught server-side (§8), so the cap trades
  prompt weight for a slightly higher filter rate, never for a wrong result.
- When the union is empty, emit `(none yet — this is a new collection)`.

### 7.5 Call parameters

```ts
{
  model: process.env.LLM_MODEL,     // glm-4.6
  max_tokens: 700,
  temperature: 0.9,                 // variety matters more than determinism here
  system: SUGGEST_WORDS_SYSTEM,
  messages: [{ role: 'user', content: userPrompt }],
}
```

`count` is **5** (§9, Decision 3). `temperature: 0.9` is deliberate: a low temperature
makes repeated taps converge on the same handful of "safe" words, which reads as broken.

### 7.6 Response schema

```ts
export const suggestWordsResponseSchema = z.object({
  suggestions: z
    .array(
      z.object({
        term: z.string().min(1).max(64),
        partOfSpeech: z.string().min(3).max(16),
        gloss: z.string().min(3).max(160),
      }),
    )
    .min(1)
    .max(8),
})
```

**The schema is deliberately loose.** Strict per-item rules — single word, `[a-z]{2,32}`,
a four-value part-of-speech enum, gloss ≤ 80 chars — are enforced in the **shape filter**
in `lib/vocab/suggest.ts`, not in zod. Reason: zod failure discards the whole batch and
spends the one permitted retry, so one malformed item would cost four good ones. The
filter drops the bad item and keeps the rest. Zod's job here is only "is this the right
JSON envelope".

Shape filter, applied per item after parse:

```
keep item iff
  normalizeTerm(item.term) matches /^[a-z]{2,32}$/          // single word, no digits/spaces/hyphens
  && partOfSpeech.toLowerCase() ∈ {noun, verb, adjective, adverb}
  && gloss.trim().length between 3 and 80
```

Gloss is truncated to 80 characters at a word boundary rather than dropped, since an
over-long gloss is a formatting slip, not a wrong word.

Parse handling follows the roadmap exactly: strip any markdown fence, `JSON.parse`,
zod-parse; **on failure retry the call once**; on second failure return `502`.
No further retries.

### 7.7 Example response

```json
{
  "suggestions": [
    { "term": "laconic",     "partOfSpeech": "adjective", "gloss": "using very few words" },
    { "term": "cadence",     "partOfSpeech": "noun",      "gloss": "the rhythm of speech or sound" },
    { "term": "winnow",      "partOfSpeech": "verb",      "gloss": "to sift out what is worthless" },
    { "term": "ostensibly",  "partOfSpeech": "adverb",    "gloss": "apparently, though perhaps not truly" },
    { "term": "wend",        "partOfSpeech": "verb",      "gloss": "to go slowly by a winding way" }
  ]
}
```

---

## 8. Dedup strategy

The hard requirement: a suggestion must never be a word the user already has —
including `status='mastered'` words, and including case and simple morphological
variants. The `UNIQUE (user_id, lower(term))` constraint is the backstop that keeps the
database honest; it is not the strategy, because it only fires at insert time, catches
nothing morphological, and turns a silent filter into a user-facing error.

Five layers. The first is persuasion; layers 2–5 are enforcement.

### Layer 1 — prompt-side steering

The AVOID list (§7.4) plus the "different root, not merely a different ending" rule with
its worked `obfuscate` example. This reduces collisions; it does not eliminate them, and
the plan assumes the model will ignore it some of the time.

### Layer 2 — normalisation

`normalizeTerm(raw: string): string` in `lib/vocab/dedup.ts`:

1. Unicode `NFKD` normalise, then strip combining marks `̀-ͯ` → `naïve` → `naive`
2. `trim()`
3. strip leading and trailing characters outside `[A-Za-z]` → `"Genteel."` → `Genteel`
4. collapse internal whitespace runs to a single space
5. `toLowerCase()`

Result: `"  Naïve. "` → `naive`; `"Genteel"` → `genteel`.

### Layer 3 — morphological folding

`foldMorphology(n: string): string` — input already normalised and single-word. Applied
identically to **both** the user's known terms and the candidates, so what matters is
consistency, not linguistic perfection.

```
if n.length <= 4: return n                    // too short to fold without collateral damage

// (a) inflection — longest match, applied at most ONCE
   iest → y      ier → y      ies → y      ied → y      ying → y
   ing  → ''     ed  → ''     es  → ''     s   → ''
   guards:
     -s   skipped when the word ends in ss, us, is, or as   (glass, genius, crisis, bias)
     -es  applied only after s, x, z, ch, sh                (buses, boxes, wishes)
     the stem left behind must be >= 3 characters, else the rule is skipped
   after -ing or -ed only: if the stem now ends in a doubled consonant, drop one
     runn → run,  stopp → stop        (never applied outside these two rules)

// (b) derivation — longest match, applied at most TWICE
   ication → icate    ation → ate    ness → ''     ment → ''
   tion → t           sion → s       ity  → ''     ously → ous
   ly   → ''          able → ''      ible → ''     ive  → ''
   ous  → ''          ic   → ''      al   → ''     er   → ''
   est  → ''          ist  → ''      ism  → ''
   guard: the stem left behind must be >= 5 characters, else the rule is skipped

// (c) tail cleanup
   if the stem ends in 'e' and is >= 5 characters, drop the 'e'
```

The `>= 5` derivational guard is the safety valve. Without it, `sober → sob`,
`formal → form`, `cover → cov`, `letter → lett` — false collisions that would silently
hide perfectly good words from the user forever. **Under-folding is the correct failure
mode**: a rare near-duplicate reaching the user is a small annoyance, while a false
collision permanently blocks a word with no visible cause.

`dedupKey(raw) = foldMorphology(normalizeTerm(raw))`.

### Layer 4 — server-side enforcement in `/api/vocab/suggestions`

```
terms   = listAllUserTerms(userId)              // SELECT term FROM vocab_entries
                                                //  WHERE user_id = $1   -- NO status filter
known   = new Set(terms.flatMap(t => [normalizeTerm(t), dedupKey(t)]))
excl    = new Set(body.exclude.flatMap(t => [normalizeTerm(t), dedupKey(t)]))
batch   = new Set<string>()                     // within-batch collisions

for each candidate c from the LLM, in order:
  n = normalizeTerm(c.term); k = dedupKey(c.term)
  drop if !/^[a-z]{2,32}$/.test(n)              // shape filter, §7.6
  drop if known.has(n) || known.has(k)
  drop if excl.has(n)  || excl.has(k)
  drop if batch.has(n) || batch.has(k)
  otherwise: batch.add(n); batch.add(k); emit { term: n, partOfSpeech, gloss }
```

Both the plain normalised form and the folded form go into every set. This catches exact
case differences even where folding is skipped (words of 4 characters or fewer), and
catches morphological variants where it is not.

`listAllUserTerms` is one indexed single-column read on `user_id`. At 500 words it is
tens of kilobytes. **It must not filter on `status`** — this is the single most likely
implementation mistake in F8, and the reason it lives in its own query module with the
constraint written in a comment above the query.

If every candidate is dropped, retry **once** with the collided terms appended to the
AVOID list. If the second batch also empties, return `{ suggestions: [], exhausted: true }`.
Two calls maximum per request, both counted against the rate limit.

### Layer 5 — accept-time re-check and the constraint backstop

The user may have added the word manually in another tab between the suggestion and the
tap. `/api/vocab/suggestions/accept` therefore re-runs layers 2–4 against fresh DB state
before calling F3. If it collides, the route resolves the existing row and returns it
with `alreadyExisted: true` — a success, not an error.

Beneath that, `createVocabEntry` inserts with
`ON CONFLICT (user_id, lower(term)) DO NOTHING`; a zero-row result is followed by a
`SELECT` of the existing row. The unique constraint never surfaces as a 500.

### Worked examples

| User already has | Model returns | Normalised | Folded | Outcome |
|---|---|---|---|---|
| `Genteel` (**mastered**) | `genteel` | `genteel` = `genteel` | — | **dropped** at layer 4 — mastered rows are in `known` |
| `naïve` | `Naive` | `naive` = `naive` | — | **dropped** — diacritics folded in layer 2 |
| `run` | `running` | `run` vs `running` | `run` vs `runn`→dedouble→`run` | **dropped** — inflection + dedouble |
| `peruse` | `perusing` | `peruse` vs `perusing` | `perus` vs `perus` | **dropped** — `-ing`, then final-`e` cleanup on the known term |
| `obfuscate` | `obfuscation` | differ | `obfuscat` vs `ation→ate` then final-`e` → `obfuscat` | **dropped** — the exact case the prompt warns about |
| `lucid` | `lucidity` | differ | `lucid` vs `-ity` → `lucid` (5 ≥ 5, allowed) | **dropped** |
| `create` | `creative` | differ | `creat` vs `-ive` → `creat` (5 ≥ 5) | **dropped** |
| `study` | `studies` | differ | `study` vs `-ies→y` → `study` | **dropped** |
| `bus` | `buses` | differ | `bus` (len ≤ 4, unfolded) vs `-es` after `s` → `bus` | **dropped** |
| `sob` | `sober` | differ | `sob` vs `-er` → `sob` is 3 chars, **< 5 guard fails**, stays `sober` | **kept** — correct, they are unrelated words |
| `form` | `formal` | differ | `form` vs `-al` → `form` is 4 chars, guard fails, stays `formal` | **kept** — correct |
| `gentle` | `genteel` | differ | `gentl` vs `genteel` | **kept** — correct, different words |
| `glass` | `glass` | equal | — | **dropped** — `-s` guard prevents `glass→glas`, but the normalised forms match directly |
| — | `laconic` twice in one batch | — | second collides in `batch` | second **dropped** |
| — | `New York` | fails `/^[a-z]{2,32}$/` | — | **dropped** at the shape filter |
| user typed `cadence` in another tab | `cadence` | matches on re-check | — | accept returns the existing id, `alreadyExisted: true` |

**Known limitation, accepted.** Folding is single-pass per rule class and will miss
chains such as `laconically → laconical → lacon`. The prompt discourages adverbial
derivatives, the AVOID list makes them unlikely, and the residual outcome is one
near-duplicate the user can decline with a single tap. Tightening the guards to catch it
would cost false collisions, which is the worse trade.

---

## 9. Decisions and their justifications

### Decision 1 — Propose first, add only on accept

**Committed: the word is shown first. Nothing is written until the user taps "Add to my
words".**

The roadmap's simplicity principle argues for immediate-add, and it is a real argument:
one tap, one word, no second decision. It loses to a harder constraint.

**v0.1.0 has no delete.** The roadmap's route map, schema, and F4 description contain no
deletion path — `status='mastered'` retires a word from daily cards but leaves it in the
collection, and it is semantically a lie ("I have mastered this") for a word the user has
never seen. So an immediate-add button is an **irreversible write behind a control whose
entire design invites repeated tapping**. That is a defect regardless of how simple it is.

The cost lands on the product's centrepiece. The daily card is exactly 6 words, selected
by weighted random from all active entries. Ten idle taps put ten unwanted words in the
pool, and within days the card — the whole product — is mostly words the user never chose.
Roadmap: "Never pad with filler." Auto-adding is filler with extra steps.

And the simplicity cost is genuinely small. The screen stays explainable in one sentence:
*"tap the button, look at the word, keep it or ask for another."* It is one card and two
buttons — fewer elements than the word-detail page. Principle 1 is about the user's mental
model, not about minimising taps.

Consequence: the accept path costs one extra tap per kept word, and the reject path costs
nothing but a tap. Both are cheap. This decision is what makes Decision 3 necessary.

### Decision 2 — Rejections are remembered for the session only, in the client. No table.

**Committed: the client holds an array of declined terms and sends it as `exclude` on the
next suggest call. Nothing is persisted. No schema addition.**

The annoyance being solved is narrow and immediate: `temperature: 0.9` notwithstanding,
a model given the same profile and the same AVOID list will re-propose the same strong
candidate within a few taps. Seeing `perspicacious` again ten seconds after declining it
reads as a broken button. That is worth fixing, and `exclude[]` fixes it completely — it
folds into the AVOID list and into the same layer-4 set that already exists.

Cross-session memory is a different and much weaker proposition. If the user declined a
word three weeks ago and it resurfaces, that is not a bug — their reading has moved on,
and a second encounter may land where the first did not. Buying that with a migration, a
query module, an index, a growing table, and a rule about when entries expire fails the
roadmap's hobby-project economics. An extra table must earn its keep; this one does not.

The rejected alternative — `status='rejected'` on `vocab_entries` — is worse than a new
table, not better. The roadmap fixes `status` at two values. A third would oblige F4, F5,
and F9 each to add a filter they do not currently need, and the first one to forget it
puts a declined word on the daily card. That is restructuring shared meaning, which the
roadmap forbids outright.

Accepted cost: a page reload clears the reject history. This is invisible in practice —
sessions are short, and the AVOID list still carries everything the user actually kept.

### Decision 3 — Batch of 5, served from a client queue, fetched lazily. No prefetch.

**Committed: one LLM call returns 5 candidates; the client pops one per tap; a new call
is made only when the queue is empty and the user taps again.**

Decision 1 makes this necessary rather than merely nice. Accept/reject only works if
"Show me another" is instant. If every rejection costs a 2–4 second wait, rejecting feels
expensive and the user starts accepting words to avoid the wait — which reintroduces
exactly the collection pollution Decision 1 exists to prevent. A slow reject button
silently converts an accept/reject UI back into an auto-add UI.

Quota arithmetic favours it too: a ten-tap session costs 2 calls instead of 10 — an 80%
reduction on the free tier that principle 3 protects. Batching also *improves* output,
since the model can vary parts of speech across a set in a way it cannot across five
independent calls.

The complexity is genuinely small: a `useState<Suggestion[]>` array, a `shift()`, and one
"if empty, fetch" branch. Perhaps fifteen lines.

**Batch size 5**, not 10: a 10-word list drifts toward filler at the tail, and dedup may
remove some of any batch, so a larger batch mostly buys wasted tokens. 5 covers a typical
session in one or two calls.

**No prefetch, deliberately.** Warming the next batch when the queue drops to one would
make every tap instant, but it spends quota on words the user may never see — the common
case is a user who taps twice and stops. So one tap in five waits, and four are instant.
That is the right side of the trade for principle 3, and the wait is masked by a
"Thinking…" state on a button the user just pressed.

**Enrichment is not batched.** The suggest call returns a short preview gloss only;
F3's full enrichment runs on accept, for one word. Enriching all five would spend four
calls' worth of definitions, pronunciations, and examples on words that are about to be
thrown away.

**The preview gloss is never persisted.** It is discarded the moment the accept request
is sent; the stored `definition` comes only from F3's pipeline. This is the guard against
the "two divergent enrichment prompts" defect: the suggestion prompt produces a decision
aid, F3's prompt produces the record, and only F3's output ever reaches the database.

---

## 10. UI/UX spec — the Discover tab on a phone

Target: iPhone Safari at 375 px wide. All primitives come from F2 — F8 defines no new
tokens, colours, or radii. Copy is terse and in dictionary register per principle 4.

### Mounting

`components/vocab/discover-tab.tsx` exports `DiscoverTab`, a `'use client'` component
taking no props. F4 mounts it as the body of the Discover tab. It renders inside F4's
tab shell and above the global bottom tab bar; it owns no navigation chrome and no
safe-area handling of its own beyond not overlapping the shell's padding.

### States

**A — Resting (initial, and after any completed action)**

```
        (vertical centre of the available area)

        ┌───────────────────────────────────┐
        │     Pick a new word for me        │   ← primary button, full width
        └───────────────────────────────────┘      minus 16 px gutters, ≥ 48 px tall

              One word at a time.               ← single line, muted, small
```

Nothing else. No queue counter, no "3 remaining", no explanation of how it works. The
machinery is hidden; principle 1.

**B — Thinking** (only when the queue is empty and a call is in flight)

Button label becomes `Thinking…`, disabled, with F2's loading treatment. The subtitle
line is unchanged. No spinner overlay, no skeleton card — the card has not been promised
yet, and an empty skeleton implies a shape the response may not fill.

**C — Proposal**

```
        ┌───────────────────────────────────┐
        │                                   │
        │  laconic                          │   ← term, largest type on screen
        │  adjective                        │   ← small, muted, italic
        │                                   │
        │  using very few words             │   ← gloss, one line, may wrap to two
        │                                   │
        └───────────────────────────────────┘

        ┌───────────────────────────────────┐
        │        Add to my words            │   ← primary
        └───────────────────────────────────┘
        ┌───────────────────────────────────┐
        │        Show me another            │   ← secondary / quiet
        └───────────────────────────────────┘
```

- The card is F2's card surface. `suggestion-card.tsx` is presentational only.
- Term is the visual anchor — this screen is about one word.
- Both buttons ≥ 48 px tall with ≥ 8 px between them: they do opposite things and must
  not be mis-tapped.
- "Add to my words" is primary. "Show me another" is quiet but not hidden — declining is
  a normal, expected action, not a failure.
- **The tab never scrolls in this state at 375 px.** Card plus two buttons plus subtitle
  fits between F4's tab header and the bottom tab bar. If a gloss wraps to a third line,
  the gloss clamps; the layout does not grow. Consistent with the roadmap's non-scrolling
  discipline.

**D — Adding**

"Add to my words" shows F2's inline loading state and both buttons disable. This is the
only place the user waits on F3's enrichment. On resolve: `router.push('/vocab/' + id)`.
The Discover tab is left behind; returning to it via the tab bar shows state A with the
queue intact.

**E — Error**

One line of terse error text between the card and the buttons; the button remains
tappable.

| Condition | Copy |
|---|---|
| `502` from suggest | `Could not fetch a word. Try again.` |
| `exhausted: true` | `Nothing new came back. Try again in a moment.` |
| `429` | `That's plenty of new words for now.` — button disabled |
| `502` from accept | `Could not save that one. Try again.` |
| offline / network throw | `No connection.` |

**F — Session cap reached** (§12)

Button label becomes `That's plenty for one sitting.` and disables. No countdown, no
explanation of quota. Reloading the page resets it — this is a nudge, not a wall.

### Interaction rules

- "Show me another" **never** issues a network call when the queue is non-empty. It is a
  local `shift()` and must feel instant.
- The declined term is pushed onto the client's `rejected` array and sent as `exclude`
  on the next fetch.
- Tapping "Add to my words" twice does nothing the second time — the button is disabled
  while the request is in flight.
- Accept is the only action that navigates. Nothing else changes the URL, so F4's tab
  state is never disturbed.
- No confirmation dialog anywhere. Adding a word is not destructive and there is no
  modal in this app.

### Accessibility and platform

- Both buttons are real `<button>` elements with accessible labels.
- The term renders with `lang="en"`.
- Touch targets ≥ 44×44 px (iOS HIG) — the ≥ 48 px height satisfies this.
- No fixed-position elements: the iOS URL bar collapsing must not move anything.
- Works in light and dark mode by using F2 tokens exclusively.

---

## 11. Implementation steps

Each step is independently verifiable. Do not start a step before the previous one
checks out.

1. **Confirm the seams.** Read `plans/F3-vocab-capture.md`, `plans/F4-vocab-detail.md`,
   and `plans/F7-onboarding.md`. Record the real signatures of `createVocabEntry` and
   `buildProfileContext`, and the real mount point for the Discover tab. If any differs
   from §2, adjust only `renderProfileBlock()`, the single `createVocabEntry` call, and
   the export name — and note the deviation in §15.
   *Verify:* the three symbols exist and typecheck when imported.

2. **Write `lib/vocab/dedup.ts`.** `normalizeTerm`, `foldMorphology`, `dedupKey`,
   `buildKnownKeySet(terms, exclude)`, `isKnown(set, term)`. Pure, no imports beyond
   the standard library.
   *Verify:* every row of the §8 worked-examples table produces the stated outcome.
   Add `lib/vocab/dedup.test.ts` if F1 provided a runner; otherwise drive it from a
   throwaway script and delete the script.

3. **Write `lib/db/queries/vocab-suggestions.ts`.** `listAllUserTerms(userId)` and
   `findEntryByDedupKey(userId, candidates)`. Put a comment directly above the first
   query: `// NO status filter — mastered words must still block a suggestion.`
   *Verify:* seed a user with one `active` and one `mastered` entry; the function returns
   both terms.

4. **Write `lib/llm/prompts/suggest-words.ts`.** The verbatim system prompt, the user
   template, `renderProfileBlock`, `renderAvoidList`, `buildSuggestWordsPrompt`, and
   `suggestWordsResponseSchema`. No SDK import in this file.
   *Verify:* `buildSuggestWordsPrompt` with a populated profile and a 400-term collection
   emits the default-register block only when appropriate, and an AVOID list of exactly
   300 lines.

5. **Write `lib/vocab/suggest.ts`.** Compose steps 2–4 with F1's shared LLM client:
   load terms, build the prompt, call, fence-strip, `JSON.parse`, zod-parse, retry once
   on parse failure, shape-filter, dedup-filter, one retry when the batch empties.
   *Verify:* with the LLM client stubbed to return a batch containing a known word, a
   duplicate, a two-word phrase, and two good words, the service returns exactly the two
   good words.

6. **Write `lib/vocab/suggestion-rate-limit.ts`.** In-memory sliding window,
   10 calls / user / hour. Export `check(userId): { ok: boolean }`.
   *Verify:* eleven calls in a loop — the eleventh returns `ok: false`.

7. **Write `app/api/vocab/suggestions/route.ts`.** Auth → rate limit → zod → service →
   respond. Under 40 lines.
   *Verify:* `curl` as a signed-in user returns a valid `suggestResponseSchema` body;
   unauthenticated returns `401`; `{"exclude": 123}` returns `400`.

8. **Write `app/api/vocab/suggestions/accept/route.ts`.** Auth → zod → re-dedup →
   `createVocabEntry({ userId, term, source: 'suggested' })` → handle F3's
   typo-correction and rejection cases → respond.
   *Verify:* accepting a fresh term creates a row with `source='suggested'`; accepting a
   term the user already has returns `alreadyExisted: true` and the pre-existing id, and
   creates no second row.

9. **Write `components/vocab/suggestion-card.tsx`.** Presentational only, F2 primitives,
   no state, no fetch.
   *Verify:* renders term, part of speech, and gloss; no layout break at 375 px with a
   32-character term and an 80-character gloss.

10. **Write `components/vocab/discover-tab.tsx`.** Queue state, rejected-terms array,
    the six UI states from §10, the two handlers, and the session call cap.
    *Verify:* first tap fetches and shows a word; taps 2–5 are instant with no network
    request in the Network panel; tap 6 fetches again.

11. **Hand the export to F4.** Confirm `<DiscoverTab />` mounts inside F4's Discover tab
    with no wrapper changes and no duplicated navigation.
    *Verify:* `/vocab` → Discover renders state A; switching to Mine and back does not
    lose or duplicate the queue.

12. **End-to-end.** Accept a word, land on `/vocab/[id]`, confirm the definition shown is
    F3's, not the preview gloss, and that the chat entry point is reachable from there.
    *Verify:* the persisted `definition` differs in wording from the gloss shown in
    Discover, and `source='suggested'` in the database.

13. **Run the §14 verification checklist in full.**

---

## 12. Cost control

**Per accepted word: exactly 2 LLM calls** — one suggestion call amortised across five
candidates, plus one F3 enrichment call. Per *declined* word: zero marginal calls, since
the batch is already paid for.

| Bound | Value | Mechanism |
|---|---|---|
| Candidates per suggest call | 5 | prompt `count`, batch size |
| Retries on JSON parse failure | 1 | roadmap-mandated; hard-coded, no loop |
| Retries when the batch fully de-dups away | 1 | `lib/vocab/suggest.ts` |
| **Max LLM calls per suggest request** | **2** | the two retries above are mutually exclusive in practice and jointly capped at 2 |
| Suggest calls per client session | 4 | client counter in `discover-tab.tsx`; state F |
| Suggest calls per user per hour | 10 | `lib/vocab/suggestion-rate-limit.ts` → `429` |
| Enrichment calls | 1 per accepted word | F3's pipeline, F3's budget |
| Prompt size | ≤ ~1200 tokens | AVOID list capped at 300 terms; profile block is a handful of lines |
| Output size | ≤ 700 tokens | `max_tokens` |

**Worst realistic session:** 4 suggest calls (20 candidates seen) + 4 accepts =
4 + 4 = 8 calls, ~10k tokens. A typical session is 1 suggest + 1 accept = 2 calls.

**No prefetch, no background warming, no scheduled generation.** Every call in this
feature originates from a finger on a button, which is also principle 5.

**Honest limitation of the rate limiter.** Vercel's free tier runs multiple ephemeral
instances, so an in-memory window is best-effort: a burst spread across cold starts can
exceed 10/hour. It is still worth having — it catches the common case of a warm instance
serving one user's burst — and the real hard bounds are the free-tier quota itself and
the per-session client cap. A Postgres-backed counter would be exact, but that is a table
and a write on every suggestion for a hobby project with one user. Not worth it. Revisit
only if quota is actually exhausted in practice.

---

## 13. Edge cases and failure modes

**LLM output**

| Case | Handling |
|---|---|
| Response wrapped in a ```` ```json ```` fence | strip fences before `JSON.parse` |
| Response is prose, not JSON | retry once; then `502` |
| Valid JSON, wrong shape | zod fails → retry once → `502` |
| Returns 3 suggestions instead of 5 | accepted; the queue is simply shorter |
| Returns 8 | zod max is 8; extras beyond the queue are kept, they cost nothing |
| One item is a two-word phrase or has digits | shape filter drops that item, batch survives |
| `partOfSpeech` is `"adj."` or `"Noun"` | lowercase and match the enum; unrecognised → drop the item |
| Gloss is a 200-character paragraph | truncate to 80 at a word boundary; do not drop |
| Returns a proper noun (`Kafka`) | shape filter rejects on the leading capital after normalisation only if it is multi-word; single capitalised words normalise to lowercase and pass — accepted risk, the user declines with one tap |
| Every candidate collides with the collection | one retry with collided terms appended to AVOID; then `exhausted: true` |

**Dedup**

| Case | Handling |
|---|---|
| User has a `mastered` word and the model proposes it | dropped — `listAllUserTerms` has no status filter (layer 4) |
| User has 800 words | AVOID capped at the 300 most recent; the other 500 are still enforced server-side, so the only cost is a higher drop rate |
| User has 0 words | AVOID renders `(none yet — this is a new collection)` |
| Word added in another tab between suggest and accept | accept-time re-check → `alreadyExisted: true` → navigate to the existing id |
| Two tabs accept the same term simultaneously | `ON CONFLICT DO NOTHING` inside `createVocabEntry` → one row, both clients get the same id |
| F3's typo-correction changes the term into a collision | after `createVocabEntry` returns, compare `result.term` to the request term; if it changed, re-run dedup on the returned term. If it now collides, F3's own `ON CONFLICT` has already resolved to the existing row — return that id with `alreadyExisted: true` |
| F3 judges the term not a real word | route returns `422`; the client drops the candidate **silently**, advances the queue, and shows the next word with no error text. The user never learns the model proposed a non-word |

**Profile**

| Case | Handling |
|---|---|
| No `profiles` row (never onboarded) | default-register block |
| Row exists, every personalisation field null (skipped all questions) | default-register block — `renderProfileBlock` must treat this identically to a missing row, not emit an empty `LEARNER` section |
| `interests` is `[]` rather than null | treated as empty; the line is omitted |
| `currently_consuming` is set but nothing else | emit that one line plus the default-register sentence about breadth |
| `buildProfileContext` throws | catch, log, fall back to the default block. A profile failure must never block discovery |

**Network and session**

| Case | Handling |
|---|---|
| Session expired mid-session | `401` → the client shows `Sign in again.` and links to `/signin` |
| Offline | fetch throws → `No connection.`, button stays tappable |
| User backgrounds Safari mid-request | request completes or aborts; on return the tab shows state A with the queue intact |
| Reload | queue and reject history are lost by design (§9, Decision 2); the collection is unaffected |
| Rapid double-tap on "Add" | button disabled while in flight |
| Rapid taps on "Show me another" | pure local `shift()`; when the queue empties mid-burst the button enters state B |

**Data**

| Case | Handling |
|---|---|
| Enrichment fails after insert | row persists with `enrichment_status='failed'`; accept still returns `200` and navigates. F4 owns the retry affordance on the detail page |
| Term stored casing | F8 sends the normalised lowercase form to F3. English common nouns are lowercase; the `UNIQUE (user_id, lower(term))` constraint makes stored casing immaterial for dedup, and F3 owns display |

---

## 14. Verification checklist

Run these after step 13. Each has an expected result.

**Dedup unit behaviour** — every row of the §8 worked-examples table, driven through
`dedupKey`. *Expected:* every "dropped" row produces equal keys; every "kept" row
produces unequal keys. This is the single most important check in F8.

**Mastered words block suggestions.**
```sql
UPDATE vocab_entries SET status='mastered', mastered_at=now()
 WHERE user_id=$me AND term='genteel';
```
Then force the model toward it (temporarily add `genteel` to a scratch prompt, or run
20 suggest calls). *Expected:* `genteel` never appears in a response body. Add a
temporary log line in the dedup filter and confirm it fires as `dropped: known`.

**No status filter in the query.**
```
grep -n "status" lib/db/queries/vocab-suggestions.ts
```
*Expected:* matches only the explanatory comment, never a `where` clause.

**No second enrichment prompt.**
```
grep -rn "pronunciation\|part_of_speech\|examples" lib/llm/prompts/suggest-words.ts
```
*Expected:* zero matches. F8's prompt asks for `term`, `partOfSpeech`, and `gloss` only —
`partOfSpeech` here is a display hint on the proposal card, not persisted content.
```
grep -rn "enrich" components/vocab/ app/api/vocab/suggestions/
```
*Expected:* the only match is the single `createVocabEntry` import in the accept route.

**The gloss is never persisted.**
```
grep -rn "gloss" app/api/vocab/suggestions/accept/route.ts
```
*Expected:* zero matches — `acceptRequestSchema` accepts `term` only. Then accept a word
and compare: `SELECT definition FROM vocab_entries WHERE term = $accepted;`
*Expected:* F3's definition, worded differently from the gloss shown in Discover.

**Source is forced server-side.** `curl` the accept route with
`{"term":"winnow","source":"manual"}`. *Expected:* `400` (unknown key rejected by zod
strict) or the row is created with `source='suggested'`. Either is acceptable; a row with
`source='manual'` is a failure.

**Batching is real.** Open Safari DevTools → Network. Tap the button six times, declining
each. *Expected:* exactly 2 requests to `/api/vocab/suggestions`, at taps 1 and 6.
Taps 2–5 issue no request and render within one frame.

**Rate limit.** Loop 11 suggest calls for one user within a minute.
*Expected:* the 11th returns `429`; the UI shows `That's plenty of new words for now.`
and disables the button.

**Session cap.** In one page session, exhaust 4 batches (20 declines).
*Expected:* the button reads `That's plenty for one sitting.` and is disabled; a reload
restores it.

**Empty profile.** Delete the `profiles` row (or null every personalisation field), then
request a suggestion. *Expected:* `200` with plausible general-register words, no crash,
and a log or debug view confirming the default-register block was used — not an empty
`LEARNER` section.

**Personalisation is visible.** Set `currently_consuming = 'Bleak House by Charles
Dickens'` and collect 10 suggestions. Reset it to `'The Three-Body Problem'` and collect
10 more. *Expected:* the two sets are noticeably different in register. If they are
identical, the profile block is not reaching the prompt.

**Empty collection.** New user with zero words. *Expected:* suggestions arrive; the
prompt's AVOID section reads `(none yet — this is a new collection)`.

**Race on accept.** Open `/vocab` in two tabs, propose the same word in both (use
`exclude` to force it), accept in both.
*Expected:* one `vocab_entries` row; both tabs land on the same `/vocab/[id]`; the
second returns `alreadyExisted: true`; no 500, no unique-violation surfaced.

**Layout at 375 px.** Safari responsive mode, iPhone SE. State C with a 20-character term
and an 80-character gloss, light and dark mode.
*Expected:* no vertical scrollbar on the tab body; both buttons ≥ 48 px tall and fully
visible above the bottom tab bar with the home-indicator inset respected.

**Navigation.** Accept a word. *Expected:* lands on `/vocab/[id]` — the same page reached
from the Mine tab — with the chat entry point present. No F8-specific detail view exists
anywhere in the codebase (`grep -rn "suggest" app/vocab/` → zero matches).

**End-to-end into the daily card.** Accept a word, then create today's card on `/today`
until the new word appears in the rotation. *Expected:* it appears exactly like a manual
word, with no visual marker distinguishing it. Confirm `SELECT source FROM vocab_entries
WHERE id = $it;` → `suggested`.

**No client-side LLM access.**
```
grep -rn "@anthropic-ai/sdk\|LLM_API_KEY" components/
```
*Expected:* zero matches.

**No migration.** `npx drizzle-kit generate` after F8 lands. *Expected:* no new migration
file — F8 adds no schema.

---

## 15. Open questions / discrepancies with ROADMAP_v0.1.0.md

**No contradictions with the roadmap.** F8 adds no schema, introduces no new route
outside `app/api/`, adds no navigation, and adds no dependency. The following need
confirmation before or during step 1.

1. **F3's service export is assumed, not verified.** No sibling plan files existed when
   this was written — `plans/` contained only this document. F8 assumes
   `createVocabEntry({ userId, term, source })` in `lib/vocab/create-entry.ts`, returning
   `{ id, term, enrichmentStatus, alreadyExisted, rejected? }`. If F3 exposes only a
   lower-level `enrichTerm(term)`, F8's accept route does the insert itself and calls
   `enrichTerm` — but it still must **not** write its own enrichment prompt. If F3
   exposes only an HTTP route and no service function, raise it: server-to-server HTTP
   inside one Next.js app is the wrong shape, and the right fix is for F3 to extract the
   service. **Do not resolve this by duplicating F3's prompt.**

2. **F7's `buildProfileContext()` return shape is assumed.** F8 needs occupation,
   interests, `currently_consuming`, and `english_contexts` in some readable form, plus a
   way to tell "populated" from "empty". If it returns a pre-rendered string, drop
   `renderProfileBlock`'s field logic and keep only the empty-case branch. Confirm whether
   the helper is async and whether it already handles the missing-row case — if it does,
   F8's fallback becomes a safety net rather than the primary path.

3. **F4's mount mechanism for the Discover tab.** Whether tabs are client state or
   `/vocab?tab=discover` changes nothing about `<DiscoverTab />`, but it does determine
   whether the queue survives a tab switch. §10 assumes client state and therefore
   survival. If F4 chose a URL parameter with a server round-trip, the queue resets on
   every tab switch — acceptable, but note it, and consider whether the session call cap
   should then be lifted to compensate.

4. **Route nesting convention.** The roadmap says "one directory per resource" under
   `app/api/`. F8 uses `app/api/vocab/suggestions/` on the reading that suggestions are a
   sub-resource of vocab. If F3 or F4 established `app/api/suggestions/` as flat-only,
   move it — the change is a directory rename with no other effect.

5. **Whether suggested words should be visually marked in the Mine tab.** Out of scope
   for F8 and not specified by the roadmap. The plan's position is that they should not
   be: the whole point of `source='suggested'` is that the word behaves identically once
   accepted. F4 owns the call, and F9 already uses `source` for collector-level counting,
   which is the only place the distinction should be visible.

6. **Whether `part_of_speech` from the suggestion should be passed to F3 as a hint.**
   F8 currently discards it and lets F3 determine part of speech independently. Passing
   it would be a small token saving and a small risk of propagating the suggestion
   model's error into the persisted record. The plan chooses independence. Revisit only
   if F3's enrichment proves unreliable on part of speech.
