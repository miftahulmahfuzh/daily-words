# Non-English lookup on the add path

**Status:** design agreed 2026-08-12. Supersedes nothing.
**Authority:** subordinate to `ROADMAP_v0.1.0.md` § Reconciliation Decisions and
§ Locked Decisions, per CLAUDE.md's authority order. Where this document and the
roadmap disagree, the roadmap wins and the discrepancy is a bug in this file.

## The problem

`/vocab/new` takes an English word. A reader who meets a word in their *own*
language and wants the English for it has nowhere to put it. The worked example
throughout is Indonesian `melumuri` — "to smear" — which today is typed into the
add field, saved, enriched, and comes back `status: "unknown"` with an empty
entry and a `failed` row, because the enrichment prompt defines `unknown` as
exactly this case:

> "unknown"   The term is not English and you cannot identify a plausible
>             intended English word.

So the feature is not "make the model accept foreign words". It is a second
add path that resolves a foreign term to an English one **before** a row exists.

## What the user gets

A toggle on `/vocab/new`: **English** (default, unchanged) / **Non-English**.
In non-English mode a second optional field appears:

```
word:   melumuri
as in:  mereka melumuri budi dengan minyak panas
```

The `as in` line is context for disambiguation. It is the difference between
`melumuri` → *smear* and `melumuri` → *coat*, and it is the reason this feature
is worth more than a dictionary lookup.

Tapping Look up shows the resolved English entry. Tapping Add stores it.

## D1 — The row holds the English word

`term = "smear"`. Not `melumuri`.

The alternative — a bilingual collection keyed on the foreign word — was
rejected on the downstream contracts, not on taste. `vocab-enrich.ts` specifies
`pronunciation` as British Received Pronunciation IPA and requires all three
examples to contain the term. Neither has a defined meaning for an Indonesian
headword, and F5's daily card, F6's chat practice and F9's badges all assume the
row is an English word the user is learning.

`melumuri`, its detected language, and the `as in` sentence are kept as **origin
metadata on the row** and drawn on `/vocab/[id]`, so the trail back to why the
word is in the collection survives.

## D2 — Three flat columns, migration 0008

```sql
ALTER TABLE vocab_entries
  ADD COLUMN origin_term      text,
  ADD COLUMN origin_language  text,
  ADD COLUMN origin_context   text,
  ADD CONSTRAINT vocab_entries_origin_context_needs_term
    CHECK (origin_context IS NULL OR origin_term IS NOT NULL);
```

All nullable, no default, no backfill. Every pre-0008 row reads three NULLs,
which is not a placeholder but the truth: those words were added in English.

Flat columns rather than one `jsonb`, matching the table's own grain —
`part_of_speech`, `pronunciation` and `definition` are flat; `examples` is
`jsonb` because it is a list. These are three scalars, and `origin_language` is
the one plausibly worth an index later.

The CHECK exists because a context sentence with nothing to be the context *of*
is unrepresentable more cheaply than it is testable.

**One origin per row.** A second `melumuri`-shaped lookup that resolves to a word
already carrying an origin is shown the existing one and offers no overwrite.
Multi-origin is YAGNI until a real collision happens.

## D3 — `source` stays `'manual'`

Deliberate, and the opposite call to F17's.

F17 gave a claimed word `source = 'shared'` specifically so F9's collector level
— which counts `source = 'manual'` — would not promote a stranger's word into
the claimer's tally. This is the inverse case: the user typed it, chose it, and
kept it. It should count. A fourth `source` value here would silently *remove*
these words from the collector level, which is a badge regression wearing the
costume of a schema tidy.

No DDL either way: `source` is a plain `text` column with a TypeScript-level
`$type<>` union.

## D4 — One model call, two prompt modules

The call happens **before** the insert, because the term is what the model
returns and `vocab_entries_user_term_uniq` is on `lower(term)` — a row cannot be
inserted as `melumuri` and renamed to `smear` later.

```
POST /api/vocab/lookup    { term, context? }
  → one model call, WRITES NOTHING
  ← { language, english, fit, partOfSpeech, pronunciation,
      definition, examples[], token }

POST /api/vocab           { term: "smear", origin: {…}, lookup: token }
  → one INSERT, enrichment_status 'ready', NO model call
```

`vocab-enrich.ts` is **not** widened. It stays byte-identical and the English
path stays byte-identical with it — the toggle's off position must not be a new
code path, or every existing assertion is now testing something else. The new
work lives in `lib/llm/prompts/vocab-translate.ts`, which shares the enrichment
response schema and extends it with `language`, `english` and `fit`.

Two modules, one call. This also keeps CLAUDE.md's load-bearing sentence
literally true — *`vocab-enrich.ts` takes only the term* — so F17's
`buildClaimEnrichment` argument needs no rewrite.

Inserting `ready` in one statement rather than insert-then-update is F17's
existing pattern and is kept for F17's existing reason: between the two
statements the row is `pending`, and `pending` is precisely the state
`/vocab/[id]/chat` refuses to render.

## D5 — The lookup result is signed

`POST /api/vocab` would otherwise take a client-supplied `definition` and
`examples` on trust. Only into the caller's own collection — but those four
fields are exactly what a stranger copies when they claim a shared word, so
trusting them would put user-authored text on a public page for the first time
in the vocab feature.

`lib/vocab/lookup-token.ts` mirrors `lib/share/intent.ts`:
`v1.<base64url(payload)>.<base64url(hmac-sha256)>`, `AUTH_SECRET` passed **as a
parameter rather than imported**, so the codec is exercisable offline against a
fixture secret and the real secret keeps one visible call site. TTL 60s,
enforced inside the signature rather than by the client.

It lives in `lib/vocab/`, not in `lib/share/intent.ts`, which is share-specific
and sits beside a `policy.ts` that imports nothing on purpose.

## D6 — Privacy: the origin does not cross

`origin_term`, `origin_language` and `origin_context` are **excluded from
`lib/share/serialize.ts`'s payload**, mirroring F18's rule for a journal
entry's `source_note`: the note is about the user's life, not about the word.
`share:check` gets an assertion, so it is tested rather than remembered.

**Stated plainly, because it is the weak point of this design.** The four
enrichment fields on a translated row were produced by a prompt that had read
the user's context sentence, so an example could in principle paraphrase it, and
those four fields *do* cross on claim. The mitigation is a prompt rule — the
context disambiguates and must never be translated into the examples — which is
a rule, not a structure. A two-call design (resolve, then enrich the English
word alone) would have made this structural. One call was chosen for cost with
the trade-off visible; if a dry-run ever shows an example echoing the context,
that is the decision to revisit first.

## D7 — Collisions and loose fits

**Resolved word already held.** The dedup in `POST /api/vocab` runs on `smear`,
the resolved term, so this is the ordinary F14 `duplicate` outcome returning the
row the user already holds. The client adds one new action, *Add melumuri to
it*, which attaches the origin to that existing row. Offered only when the row's
`origin_term IS NULL`. Silent attachment was rejected: a wrong resolution would
quietly edit a word the user already knew.

**No exact equivalent.** The model may answer with up to six words —
`MAX_TERM_WORDS` is already 6 and `part_of_speech` already carries `phrase` and
`idiom`. `gotong royong` → *communal work*. `fit: "loose"` is a field on the
response, not a client heuristic, and drives a "no exact English word" line on
the card so the user decides with the loss visible.

## D8 — Quota

The 50-a-day cap lives at the insert today. A lookup route that writes nothing
would be an uncapped model-call endpoint — worse than what the cap exists to
prevent. Lookups count against the same daily budget, checked **before** the
model call, in the same discipline as the chat's turn cap and F8's limiter.

## D9 — Sanitisation

`normalizeContext` / `validateContext` join `lib/vocab/normalize.ts`, which
already owns the question "what did the user type?" — as against `dedup.ts` ("are
these the same word?") and `search.ts` ("does this row match?").

The context is about to sit inside `<context>` tags, so it gets the term's
posture: strip angle brackets, backticks and newlines, collapse whitespace, cap
at 200 characters. The property to assert is the one `claim:check` learned the
hard way — not "hostile strings are rejected", which is false, but **no newline,
angle bracket or backtick can reach the tags**.

## Scope limit — Latin script only

`TERM_PATTERN` is `\p{Script=Latin}`, so Indonesian, Dutch, Vietnamese, Turkish
and the rest of the Latin-script world work today. 中文 and العربية are rejected
with "Letters only."

Widening the class is one line, but it interacts with the `lower(term)` unique
index and with `normalizeTerm`'s NFC/curly-quote handling, and is not attempted
blind. Out of scope for this change; revisit with a real user and a real word.

## Verification

```bash
npm run db:generate                 # → 0008; DATABASE_URL_UNPOOLED for the DDL
npm run db:migrate
npm run vocab:check                 # + new outcomes, token codec, sanitisation
npm run vocab:db                    # + origin columns, attach-to-existing
npm run vocab:dry-run -- "melumuri" --as-in "mereka melumuri budi dengan minyak panas"
npm run share:check                 # + origin_* never cross into a payload
npm run typecheck && npm run lint
npm run test:layout                 # /vocab/new is in the no-scroll budget
```

`vocab:dry-run` is new and matches `chat:dry-run` and `discover:dry-run`: in this
codebase the prompt's output *is* the deliverable, and an exit code only reports
transport. Whether `melumuri` resolves to *smear* is a thing to read, not to
assert.
