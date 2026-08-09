# F14 — Vocab duplicate handling

The user's words: *"duplicate handling: make sure we handle if user input an
existing vocab. or an edge case where 'user input a typo vocab, but the correct
typed vocab already exist as well'."*

Most of the exact-duplicate machinery already exists and works. This plan is
about the seams around it: a spelling suggestion that can be stranded where no
screen ever draws it, a near-duplicate class the `lower(term)` index cannot see,
a merge that discards the survivor's identity, a mastered duplicate with no way
forward, and a Discover accept path that returns `alreadyExisted` to a client
that ignores it.

**Supersedes:**

- `plans/F3-vocab-capture.md` §6.1's response table (`duplicate: boolean` becomes
  a three-valued `outcome`), §6.3's `409 in_use` row (becomes a `200`
  `kept_both`), §8.3's "F3 does **not** offer a 'make it active again' button
  here", and §11 rows E12, E14, E15, E16.
- `plans/F4-vocab-detail.md` §7.3 — the detail page gains a correction banner
  above the term. It renders only when `suggested_correction` is non-null, so
  the §7.3 height budget is unaffected in the default case.
- `plans/F8-discovery.md` §6.2's claim that the client "can navigate to the
  existing row instead" on `alreadyExisted` — true of the route, never
  implemented in the panel. §8's Layer 5 is **kept as written** and the
  divergence from the add path is justified in D7 rather than removed.

Everything here obeys the shared brief `plans/F11-F18-BRIEF.md`, which wins over
this file.

---

## 1. What already exists, verified by reading the code on 2026-08-09

Do not re-invent any of this. Every line below was checked against the file
named, not inferred from a plan.

| Behaviour | Where | Verified |
|---|---|---|
| Exact duplicate on add | `src/app/api/vocab/route.ts:88-112` | Insert first, catch `23505` via `isUniqueViolation`, re-read with `findEntryByNormalizedTerm`, return `{...toSummary(existing), duplicate: true}` at 200. One retry if the colliding row vanished. |
| Duplicate notice UI | `src/components/vocab/add-word-form.tsx:223-236` | Two copies — active and mastered — plus "Open it". Dismissed by typing. |
| Correction merge | `src/lib/db/queries/vocab.ts:177-239` | `applyCorrection` runs one transaction: `SELECT … FOR UPDATE` the typo, read `suggestedCorrection`, look for another row with the same `lower(term)`, probe `daily_card_items`, then either delete the typo (`merged`) or clear the suggestion and keep both (`in_use`). |
| Correction UI | `src/components/vocab/enrichment-card.tsx:38-101` | Renders "Did you mean genteel?", handles `merged` with "You already had genteel." + Open it, and shows the `in_use` message inline. |
| The prompt that produces the collision | `src/lib/llm/prompts/vocab-enrich.ts:194-195` | `<term>genteell</term>` → `{"status":"corrected","correction":"genteel", …}`, and every other field describes **genteel**. |
| The fold | `src/lib/vocab/dedup.ts` | Pure, no imports, calibrated by `npm run discover:check`. |
| Discover's exact re-check | `src/app/api/vocab/suggestions/accept/route.ts:66-74` | `findEntryByNormalizedTerm` → `alreadyExisted: true`. |

### 1.1 The typo-collision case, traced end to end — it works today

The brief asked what actually happens. The answer is: **the merge fires and is
correct.** There is no `23505`, no silent failure and no duplicate row.

1. User holds `genteel`. User types `genteell`.
   `UNIQUE (user_id, lower(term))` does not fire — different string — so
   `createVocabEntry` returns a new row and `POST /api/vocab` answers `201`.
2. `POST /api/vocab/[id]/enrich` calls the model, gets
   `status: "corrected", correction: "genteel"`, and
   `writeEnrichmentSuccess` stores `suggested_correction = 'genteel'` together
   with **genteel's** definition, IPA, part of speech and examples
   (`src/app/api/vocab/[id]/enrich/route.ts:90-99`, D3).
3. The user taps "Yes". `POST /api/vocab/[id]/correction` →`applyCorrection`
   finds the pre-existing `genteel` (`ne(vocabEntries.id, entry.id)` excludes
   self), probes `daily_card_items` for the typo, finds none, deletes the typo
   row, and returns `{outcome: "merged", entry: <genteel>}`.
4. `enrichment-card.tsx` swaps to "You already had genteel." with "Open it".

So F3 §11's E15 is implemented. **The gaps are around it**, and they are the
subject of this plan.

---

## 2. The gaps, each verified

### Gap 1a — the correction banner exists on exactly one screen

`grep -rn EnrichmentCard src/` returns two hits: its own file and
`add-word-form.tsx`. `toDetail` in `src/lib/vocab/serialize.ts:53-69` does not
carry `suggestedCorrection`, and `vocabDetailResponseSchema` has no such field,
so `/vocab/[id]` (`src/app/(app)/vocab/[id]/page.tsx`) cannot draw the banner
and does not.

Three ordinary things strand the suggestion permanently:

- the enrichment reply arrives after "Add another" was tapped —
  `add-word-form.tsx:103` discards it: `if (ticket.current !== mine) return;`
- the user closes the tab or navigates away while "finding it…" is up
- the user reloads `/vocab/new`

The stranded row is the expensive part. `selectCardCandidates`
(`src/lib/cards/selection.ts:81-82`) filters on `v.status = 'active'` **and
nothing else**, so `genteell` — which is `enrichment_status = 'ready'` carrying
genteel's definition — is fully eligible for tomorrow's card. Once carded,
`daily_card_items.vocab_entry_id` is `ON DELETE RESTRICT` ([R1],
`src/lib/db/schema.ts:207-209`), so the typo can never be deleted
(`deleteVocabEntry` → `in_use`) and can never be merged (`applyCorrection` →
`in_use`). A suggestion nobody was shown becomes a permanent misspelling with a
correct word's definition attached.

**This is the real bug behind the user's edge case.**

### Gap 1b — the blocked merge throws away the survivor

`applyCorrection` returns `{outcome: "in_use", entry: existing}` — the survivor.
`src/app/api/vocab/[id]/correction/route.ts:44-48` drops it on the floor and
returns `fail(409, "Kept both — this one is already on a card.", "in_use")`. The
`{error:{code,message}}` envelope has nowhere to put an id, so the client cannot
offer a way to the word the user actually meant. It also files a deliberate,
successful, fully explained outcome as an error.

### Gap 1c — the rename path can 500

In `applyCorrection`, the "does the corrected spelling already exist" `SELECT`
takes no lock on that term, and the `FOR UPDATE` is on the *typo* row. A
concurrent `POST /api/vocab` (second tab, or Discover's accept) that inserts
`genteel` between that `SELECT` and the `UPDATE … SET term = 'genteel'` raises
`23505` inside the transaction. The route has no `catch`; Next returns a
bodyless 500; `request()` in `src/lib/api/client.ts:69-73` fails to parse it and
reports `GARBLED` — **"Something went wrong. Try again."** The retry then takes
the merge path and succeeds, so the damage is one confusing sentence, but the
same one-retry discipline `POST /api/vocab` already carries belongs here.

### Gap 1d — a merge silently destroys a practice transcript

`chat_sessions.vocab_entry_id` is `ON DELETE CASCADE` ([R5],
`src/lib/db/schema.ts:228-230`). The chat is reachable for the typo: it requires
`enrichmentStatus === 'ready' && Boolean(entry.definition)`
(`src/lib/chat/service.ts:335`), which the typo row satisfies with genteel's
definition. So a user can practise `genteell` through eight turns and a verdict,
then tap "Yes" and lose the whole transcript with no mention of it.

### Gap 1e — merging into a mastered survivor is invisible

`applyCorrection` never reads `existing.status`, and
`acceptCorrectionResponseSchema` carries only `{outcome, id, term}`. Merge into
a mastered `genteel` and the user's add has produced nothing that any future
card can show — mastered words are excluded by `selectCardCandidates` — while
the copy says only "You already had genteel."

### Gap 2 — no near-duplicate layer on the add path

`POST /api/vocab` imports `normalizeTerm` and never `dedup.ts`. The only gate is
`lower(term)`. Two verified consequences:

- `study` + `studying` are two rows. `dedupKey('studying')` → `stud` + `y` →
  `study`; the fold knows, the add path never asks it.
- `naive` + `naïve` are two rows, and this one is reachable **through the app's
  own two halves**: `POST /api/vocab/suggestions/accept:53` stores
  `normalizeForDedup(term)`, which strips diacritics, so a Discover-accepted
  `naïve` lands as `naive`; a later manual add of `naïve` stores it as typed
  (`normalizeTerm` preserves diacritics by design) and `lower()` sees two
  different strings.

Note what the fold does **not** do: `dedupKey('genteell')` is `genteell` and
`dedupKey('genteel')` is `genteel`. The fold is not a spell-checker and Gap 2
does not subsume Gap 1.

### Gap 3 — the mastered duplicate is a dead end

The notice says "genteel — you marked this mastered." and offers "Open it".
F3 §8.3 refused to do more, deliberately:

> "F3 does **not** offer a 'make it active again' button here — that writes
> `vocab_entries.status`, which is F4's column, and a silent status change on an
> add is surprising."

The reason is sound; the conclusion is one affordance short.

### Gap 4 — Discover's accept path diverges

`alreadyExisted` is returned by the route and **read by nobody**: `grep -n
alreadyExisted src/components/` is empty. `discover-panel.tsx:158-176` pushes
the word onto the "Kept" strip as though it were new and then fires
`enrichEntry` on it — which, for a row already `failed`, burns one of the three
attempts `MAX_ENRICHMENT_ATTEMPTS` allows. If the pre-existing row is
`mastered`, the panel shows it as kept and no card will ever contain it.

### Gap 5 — "not a word" versus "the model timed out"

This distinction already exists and is already correct.
`src/lib/vocab/display.ts:22-32` maps the four transport codes to `retry: true`
and maps `not_english` ("I couldn't find that in English.") and
`unverified_spelling` ("Kept as typed. Not in the dictionary, so there's no
definition.") to `retry: false`, so the user is never sent round a loop that
cannot end. The route files "the model answered and the answer was no" as
`failed` + `not_english` rather than inventing a fourth status the roadmap
forbids (`enrich/route.ts:85-88`).

Two residual points, both small:

- `not_english`'s copy does not say the word was kept, while
  `unverified_spelling`'s does. The word **is** kept in both cases.
- The duplicate interaction: a `not_english` row still occupies `lower(term)`,
  so re-typing the same gibberish answers "You already have qwertyuio." That is
  true, and correct, and this plan does not special-case it.

---

## 3. Decisions

### D1 — The `suggested_correction` banner is rendered wherever the entry is, not only where it was created

`/vocab/[id]` gains the same "Did you mean genteel?" card, backed by the same
two routes. `vocabDetailResponseSchema` and `toDetail` gain
`suggestedCorrection`.

Rationale: the suggestion is a durable column precisely so it can survive an app
close — F3 §5 says so ("The suggestion arrives asynchronously … and must survive
an app close, a reload, and a navigation to the detail page"). Only the last
clause was never built. Without this, Gap 1a's stranded row is a permanent
misspelling with a correct word's definition, and after one daily card it is
also undeletable.

This is the single highest-value item in F14. Everything else is copy and
plumbing.

### D2 — A blocked merge is a `200 kept_both`, not a `409 in_use`

`acceptCorrectionResponseSchema.outcome` becomes
`'renamed' | 'merged' | 'kept_both' | 'noop'`, and every outcome carries the
surviving entry's `id`, `term` and `status`.

This departs from F3 §6.3:

> "| Merge blocked | `409` | `error: "in_use"`. The misspelled entry is
> referenced by `daily_card_items` and cannot be deleted. Clear the suggestion
> and leave both entries. |"

Nothing failed. The user asked to merge, [R1] says a past card is a record of a
day that happened, so we kept both **on purpose** and can explain it in a
sentence. Filing that as an error envelope is what forced the survivor's id to
be discarded, because `{error:{code,message}}` has nowhere to put one. Keeping
both is the outcome, not the exception to it.

### D3 — `applyCorrection`'s rename retries once on a unique violation

Wrap the call in `isUniqueViolation` handling in the route, exactly as
`POST /api/vocab:105-111` does, and re-run `applyCorrection` once. The second
run finds the row that raced in and takes the merge branch. One retry, never a
loop — "a loop here would be a spin against a live writer."

A cheaper-looking alternative, adding `FOR UPDATE` to the corrected-term lookup,
does not work: there is no row to lock when the collision is an *insert*.

### D4 — A merge that destroys a practice transcript says so

Before deleting, probe `chat_sessions` for the typo row and return
`practiceLost: boolean`. Copy: "You already had genteel. The practice round on
genteell went with it."

Rejected: refusing the merge when a session exists. That would contradict [R5]
("days are permanent, practice is not") and `deleteVocabEntry`'s documented
cascade, both locked. The loss is roadmap policy; being silent about it is not.
One indexed lookup on `chat_sessions_user_entry_uniq` buys the sentence.

### D5 — Near-duplicates on the add path warn; they never block

`POST /api/vocab` gains a layer between validation and the insert:

1. read the user's terms — **no status filter**, mirroring `listAllUserTerms`
2. exact `lower(term)` match → `outcome: 'duplicate'`, unchanged behaviour
3. `normalizeForDedup` equality, **or** (both sides single words) `dedupKey`
   equality → `outcome: 'near_duplicate'`, no row written, no model call
4. otherwise insert, with the `23505` catch intact as the backstop

The client renders the existing word with "Open it" and **"Add studying
anyway"**, which re-POSTs `{term, allowNearDuplicate: true}`.

**On the flipped asymmetry.** `dedup.ts` argues, and CLAUDE.md repeats:

> "**Under-folding is the correct failure mode.** A near-duplicate reaching the
> user costs one tap on 'Another'. A false collision hides a perfectly good word
> from them forever, with no visible cause and no way to ask for it."

That asymmetry was argued for *suggestions*, where the filter is invisible. On
the add path both halves invert:

- A false collision is no longer silent or permanent. The user typed the word
  deliberately, is shown exactly which word we think it collides with, and
  refuses in one tap. Cost: one tap — the same price the old argument put on the
  *other* side of the trade.
- Under-folding costs more here than there. A declined suggestion evaporates; an
  accepted near-duplicate is a durable row that can be carded (and then can
  never be deleted, [R1]), gets its own chat session, counts toward F9's
  collector level, and enters the AVOID list where it makes the *next*
  suggestion worse.

So on the add path the fold should be at least as eager as Discovery's, and the
failure mode chosen is **over-folding, made harmless by refusability**. That is
also the shape the brief locked for journal dedup — **[S4]**, "a journal
near-duplicate warns; it does not block" — so the app now answers "you may
already have this" the same way in both places.

Two guards on the eagerness:

- **The fold is not changed and is not forked.** `dedup.ts` stays the single
  fold, calibrated by `discover:check`'s worked-example table. Two folds in one
  directory is precisely what that file's header warns about. Same fold,
  different response: Discovery drops, Add asks.
- **The morphological fold runs only when both sides are single words.**
  Verified reason: `applyDerivation`'s `stem.length < MIN_DERIVED_STEM` measures
  the **whole string**, so on a phrase the five-character floor is meaningless —
  `dedupKey('so formal')` is `so form` while `dedupKey('formal')` is protected
  and stays `formal`. Phrases compare on `normalizeForDedup` equality only.

`allowNearDuplicate` is named for what it does. It must never be read as
"bypass the unique index": the `23505` catch runs regardless, so a forced add of
an exact duplicate still returns `outcome: 'duplicate'`.

### D6 — `outcome` replaces `duplicate: boolean` on the create response

`CreateVocabResponse` becomes `{...summary, outcome: 'created' | 'duplicate' |
'near_duplicate'}`. Two booleans where one of them changes which entry the `id`
refers to is a trap; a discriminant is one word.

`201` for `created`, `200` for the other two — unchanged for the cases that
existed. One consumer today (`add-word-form.tsx:76`). **F17 must use the new
shape**, since its claim path adds a word on a stranger's behalf.

### D7 — Discovery's accept route keeps its exact-only re-check; only its client changes

F8 §8 Layer 5's comment stands:

> "The fold's job is to stop near-duplicates being *proposed*; once the user has
> looked at a word and chosen to keep it, refusing them because it shares a root
> with something they own would be a rejection with no visible cause."

D5 removes the "no visible cause" half of that, but not the reason: by the time
a suggestion reaches the tap it has **already** been through the fold against
the whole collection in `lib/vocab/suggest.ts`. A fold collision at accept time
can therefore only come from a race, and a race is an exact match. Adding a
second fold there would ask the same question twice and could only produce false
positives.

What does change: the response carries `status`, and `discover-panel.tsx` reads
`alreadyExisted` — showing the existing word instead of pretending it kept a new
one, offering the mastered affordance, and **skipping the enrichment call**, so
an existing `failed` row does not silently lose one of its three attempts.

### D8 — A mastered duplicate gets an explicit "Put it back in rotation"

One button on the notice, PATCHing `{op:'set_status', status:'active'}` through
the existing `setEntryStatus` client and `PATCH /api/vocab/[id]`. It is not a
silent write — it is a labelled tap that says what it will do — so F3 §8.3's
actual objection ("a silent status change on an add is surprising") is honoured
while its dead end is removed. Adding a word you have mastered is a request to
see it again; it should not cost a navigation to find that out.

The same button appears wherever the notice does: exact duplicate, near
duplicate, merged-into-mastered, and Discover's `alreadyExisted`.

### D9 — `not_english` copy says the word was kept; nothing else in Gap 5 changes

`ENRICHMENT_COPY.not_english.message` becomes **"Kept as typed. I couldn't find
it in English."** — parallel to `unverified_spelling`, and it removes the reading
where the user assumes their word was rejected. `retry` stays `false` for both:
retrying a verdict is a loop that cannot end.

Explicitly **not changed**: `selectCardCandidates` gains no
`enrichment_status` filter. A word whose enrichment failed on a transport error
would then vanish from cards for reasons the user cannot see — the wrong failure
mode, and it would silently change `countActiveWords`' arithmetic, which is
F5's. The definition-less-card-row problem is real and is answered upstream: D1
stops the typo row from lingering long enough to be carded. Recorded in §7.

### D10 — One component draws every "you already have this" state

`components/vocab/existing-word-notice.tsx`, used by the add form, the
enrichment card and the Discover panel. Four screens inventing four sentences
for one situation is how "You already have genteel." and "You already had
genteel." drifted into two strings already.

---

## 4. Schema changes

**None. No migration. Do not run `npm run db:generate`.**

Every column this plan needs already exists: `suggested_correction`,
`enrichment_error`, `enrichment_attempts`, `status`, and the unique index
`vocab_entries_user_term_uniq` on `(user_id, lower(term))`. All the additions are
to wire shapes in `src/lib/vocab/schemas.ts`, which are TypeScript and zod only.

**Rejected: a stored `dedup_key` column with an index on it.** It would make the
near-duplicate lookup an index probe instead of a scan of the user's terms. It
is refused because the fold is application logic that will keep changing —
`INFLECTIONS`, `DERIVATIONS` and `MIN_DERIVED_STEM` are all tuned by
`discover:check` — and a stored key turns every future tweak into a backfill
migration that silently disagrees with `dedup.ts` until it runs. At this scale
the scan is a few hundred short strings on an index-covered `user_id` filter.

---

## 5. Files

| File | Created / modified | Why |
|---|---|---|
| `src/lib/vocab/near-duplicate.ts` | created | Pure `findNearDuplicate(rows, term)`. Imports `dedup.ts`; kept out of it so `dedup.ts` stays the import-free fold `discover:check` calibrates. |
| `src/lib/vocab/schemas.ts` | modified | `outcome` on create; `allowNearDuplicate` on the create request; `kept_both` + `status` + `practiceLost` on the correction response; `status` on the accept response; `suggestedCorrection` on the detail response. |
| `src/lib/vocab/serialize.ts` | modified | `toDetail` carries `suggestedCorrection`; new `toCorrectionResponse`. |
| `src/lib/vocab/display.ts` | modified | `existingWordCopy()` for the notice's states; `not_english` copy per D9. |
| `src/lib/db/queries/vocab.ts` | modified | New `listTermsForDedup(userId)` (no status filter). `applyCorrection` gains the `kept_both` outcome, the survivor's `status`, and the `chat_sessions` probe for `practiceLost`. |
| `src/app/api/vocab/route.ts` | modified | The near-duplicate layer, `allowNearDuplicate`, `outcome`. |
| `src/app/api/vocab/[id]/correction/route.ts` | modified | `kept_both` as 200; one `isUniqueViolation` retry. |
| `src/app/api/vocab/[id]/route.ts` | modified | `GET` returns `suggestedCorrection` via `toDetail`. |
| `src/app/api/vocab/suggestions/accept/route.ts` | modified | Return the existing row's `status`. No logic change (D7). |
| `src/components/vocab/existing-word-notice.tsx` | created | The one card for duplicate / near-duplicate / merged / kept-both, with Open it, Add anyway, Put it back in rotation. |
| `src/components/vocab/correction-banner.tsx` | created | Client component: "Did you mean genteel?" on the detail page. `router.refresh()` on success, following `mastered-toggle.tsx`. |
| `src/components/vocab/add-word-form.tsx` | modified | Handle `near_duplicate` and the re-POST; use the shared notice. |
| `src/components/vocab/enrichment-card.tsx` | modified | Handle `kept_both` and `practiceLost`; use the shared notice. |
| `src/components/vocab/discover-panel.tsx` | modified | Read `alreadyExisted`; skip enrichment for it; show the notice. |
| `src/app/(app)/vocab/[id]/page.tsx` | modified | Mount `CorrectionBanner` when `suggestedCorrection` is non-null. |
| `scripts/check-vocab.ts` | created | `npm run vocab:check`, offline. |
| `scripts/check-vocab-db.ts` | created | `npm run vocab:db`, fixture user, `finally` delete. |
| `package.json` | modified | The two scripts. |
| `CLAUDE.md` | modified | The two commands in the Commands block. |

No LLM prompt changes, so there is **no `vocab:dry-run`**: this feature's output
is not a prompt. `npm run vocab:enrich -- "genteell"` already exercises the one
prompt involved.

---

## 6. Implementation order

Each step ends with the app building and `npm run typecheck` clean.

**Step 1 — the pure fold wrapper.**
Write `src/lib/vocab/near-duplicate.ts`: `findNearDuplicate(rows, term)` where
`rows` is `{id, term, status}[]`, returning the first row that matches on
`normalizeForDedup` equality, or — when `isSingleWord` holds for both sides — on
`dedupKey` equality. Exact `lower(term)` equality is the caller's business, not
this function's. Write `scripts/check-vocab.ts`'s first section against it and
add `vocab:check` to `package.json`. It passes before anything else moves.

**Step 2 — wire shapes.**
`schemas.ts` and `serialize.ts` per §5. `outcome` replaces `duplicate` here, so
the build breaks at `add-word-form.tsx:76` — fix that one line to
`created.data.outcome === 'duplicate'` and leave the rest for step 5. zod 4
spelling throughout ([R2]).

**Step 3 — queries.**
`listTermsForDedup`, and `applyCorrection`'s three changes. Carry the comment
from `listAllUserTerms` verbatim in spirit: **no status filter** — a mastered
word must still be found, for the same reason it still blocks a suggestion.
Extend `discover:db`'s sibling, `scripts/check-vocab-db.ts`, with the correction
matrix (§7) and add `vocab:db`. Everything asserts before any route changes.

**Step 4 — routes.**
`POST /api/vocab`'s layer, the correction route's `kept_both` + retry, the
detail `GET`, the accept route's `status`. `curl` each one against a signed-in
session before touching a component.

**Step 5 — the shared notice.**
`existing-word-notice.tsx`, then rewire `add-word-form.tsx` (near-duplicate +
"Add … anyway" re-POST), `enrichment-card.tsx` (`kept_both`, `practiceLost`) and
`discover-panel.tsx` (`alreadyExisted`, no enrich call).

**Step 6 — the detail-page banner (D1, the point of the plan).**
`correction-banner.tsx`, mounted from the server page above the `<h1>` only when
`entry.suggestedCorrection` is non-null. Verify the F4 §7.3 budget: with no
suggestion, zero pixels change.

**Step 7 — docs.**
`CLAUDE.md`'s Commands block; a line in the Conventions block recording that the
add path folds and the accept path does not, and why (D7), so the next reader
does not "fix" the asymmetry.

---

## 7. Verification

### `npm run vocab:check` — offline, no database, no network

Follows `scripts/check-discover.ts`: plain assertions, non-zero exit, no test
runner.

**§1 the add-path outcome table.** `(held, typed) → expected outcome`, driven
through `findNearDuplicate` plus exact `lower()` comparison:

| held | typed | expected | why |
|---|---|---|---|
| `genteel` | `genteell` | `created` | the fold is not a spell-checker; Gap 1 owns this, not Gap 2 |
| `genteel` | `Genteel` | `duplicate` | `lower(term)` |
| `bus` | `Bus` | `duplicate` | same, and `bus` is too short to fold |
| `Bus` | `bus` | `duplicate` | the reverse direction |
| `study` | `studying` | `near_duplicate` | `ying`→`y` |
| `studying` | `study` | `near_duplicate` | symmetric |
| `naive` | `naïve` | `near_duplicate` | **the hole the accept path opens** |
| `naïve` | `naive` | `near_duplicate` | symmetric |
| `cafe` | `café` | `near_duplicate` | same class |
| `resume` | `résumé` | `near_duplicate` | a genuine English pair — must be refusable, never blocked |
| `create` | `creative` | `near_duplicate` | `dedup.ts`'s own table |
| `sob` | `sober` | `created` | `MIN_DERIVED_STEM` holds |
| `form` | `formal` | `created` | same |
| `gentle` | `genteel` | `created` | different words stay different |
| `formal` | `so formal` | `created` | the phrase gate: the fold is not applied to phrases |
| `so formal` | `so form` | `created` | proves the gate, not the fold — `dedupKey('so formal')` is `so form` |
| `in the nick of time` | `in the nick of time.` | `duplicate` | `normalizeTerm` strips the sole trailing stop |

**§2 the two normalizers still disagree on purpose.** `normalizeTerm('naïve')`
is `naïve`; `normalizeForDedup('naïve')` is `naive`. `normalizeTerm('Genteel')`
preserves the capital. This is CLAUDE.md's invariant and a merge of the two
files would pass every other check.

**§3 the request schema.** `{term}` parses with `allowNearDuplicate === false`;
`{term, allowNearDuplicate: true}` parses; `{term, allowNearDuplicate: "yes"}`
fails.

**§4 copy completeness.** Every `('renamed'|'merged'|'kept_both'|'noop') ×
('active'|'mastered')` pair, and every `outcome × status` pair for the notice,
returns a non-empty string. Every `ENRICHMENT_ERROR_CODES` value has copy;
`not_english` and `unverified_spelling` are `retry: false`; the four transport
codes are `retry: true`. This is what stops Gap 5's distinction regressing into
a retry loop on a verdict.

### `npm run vocab:db` — one throwaway user, deleted in a `finally`

Follows `scripts/check-discover-db.ts`, including the `@example.invalid` email so
a crashed run is findable. No LLM calls: `suggested_correction` is written
directly.

1. `genteel` + `genteell` + suggestion → `merged`; survivor is `genteel`'s id;
   the typo row is gone.
2. Same, but the typo is referenced by a `daily_card_items` row → `kept_both`;
   **both rows survive**; `suggested_correction` is cleared; the survivor's id
   and term come back. This is [R1] enforced, not simulated.
3. Same, but the survivor is `mastered` → `merged` with `status: 'mastered'`.
4. Same, but the typo has a `chat_sessions` row → `merged`,
   `practiceLost: true`, and the session row is gone (cascade, [R5]).
5. No pre-existing correct term → `renamed`, `term = 'genteel'`.
6. Apply twice → `noop` on the second.
7. `study` held; the add path returns `near_duplicate` pointing at `study`'s id
   and **writes no row**; with `allowNearDuplicate` it writes one and both exist.
8. `naive` held (as the accept route would store it); adding `naïve` returns
   `near_duplicate`; forcing it creates a second row the unique index accepts —
   which is the hole, demonstrated.
9. A `mastered` exact duplicate returns `outcome: 'duplicate'` with
   `status: 'mastered'`; `setVocabStatus(…, 'active')` then succeeds.
10. `listTermsForDedup` returns mastered rows. A `where status = 'active'` here
    is the same mistake `listAllUserTerms` warns about, and it would pass every
    other check in this file.

### Manual passes no script can cover

- **The stranded suggestion, the whole point of D1.** Add `genteel`. Add
  `genteell`, and the instant "finding it…" appears, tap "Add another". Type
  something else. Then open `/vocab/genteell-id` — the banner must be there.
  Tap Yes; land on `genteel`.
- Same, but reload the page instead of tapping "Add another".
- **iOS.** `autoCorrect="off"` / `spellCheck={false}` are what make this feature
  reachable at all (`text-input.tsx:23`). On a real iPhone, confirm `genteell`
  survives the keyboard. If iOS repairs it, none of Gap 1 ever fires and the
  merge path is untestable by hand.
- The near-duplicate notice at 375 px: "Add studying anyway" must not clip.
  `enrichment-card.tsx:110-115` records exactly this bug on a stacked button —
  `truncate` on a flex container does nothing.
- Discover: accept a word you already hold in another tab, and confirm the panel
  says you already have it rather than adding a second "Kept" chip.
- `npm run discover:check` still passes, unchanged. If it does not, the fold was
  edited, which D5 forbids.
- `npm run build`, and confirm `/vocab/new`'s first-load JS has not grown — no
  zod value import may reach a client component.

---

## 8. Risks and open questions

- **Copy is unreviewed.** Every string in §3 is written to the app's register
  (plain, no exclamation, no second person imperative beyond the button) but has
  not been through the user. The `{error:{code,message}}` messages are shown
  verbatim, so they are the ones to read first.
- **Over-folding will be visible.** D5 accepts warnings on `resume`/`résumé` and
  `create`/`creative`. Both are verified consequences of `dedup.ts` as it stands,
  not guesses. If users find the warning noisy, the fix is the *response* — make
  the notice quieter, or remember a per-session dismissal — never a change to
  the fold, which `discover:check` calibrates for Discovery.
- **Gap 1c was reasoned, not reproduced.** The 500 on a rename race follows from
  reading `applyCorrection` and `lib/api/client.ts` together; I could not run two
  concurrent transactions here. D3's retry is cheap and correct whether or not
  the race is reachable in practice.
- **The per-add collection read is estimated, not measured.** Hundreds to low
  thousands of short strings on a `user_id`-covered scan. If `/vocab/new` ever
  feels slower after step 4, measure before optimising — and re-read §4's
  rejection of a stored `dedup_key` before reaching for one.
- ~~**How many stranded suggestions exist in the live database is unknown.**~~
  **Measured 2026-08-09, during implementation: zero.** `select count(*) from
  vocab_entries where suggested_correction is not null` returns 0 across the
  whole table, so there is no backfill and nothing to clean up — D1 is purely
  forward-looking. Consistent with the app having one real user and a handful of
  cards. Re-run it before assuming the same on any other database; if a stranded
  row is already carded, it is permanent by [R1] and D1 correctly offers
  `kept_both` rather than a merge.
- **Definition-less rows can still be carded** (D9). Verified: nothing between
  `selectCardCandidates` and the card render filters on `enrichment_status`.
  This is F5's territory and is deliberately untouched; if it becomes a real
  complaint it belongs in a plan of its own, not smuggled in here.
- **F17 depends on the new create shape.** The share-claim path adds a word for a
  stranger and must read `outcome`, not `duplicate`, and must decide what a
  stranger sees when the shared word is one they already hold. Flag it there.
