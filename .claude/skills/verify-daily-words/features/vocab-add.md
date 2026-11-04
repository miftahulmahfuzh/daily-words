# Adding a word

## Sub-features

- English (`/vocab/new`, **Add**): `POST /api/vocab` inserts the row `pending`, then the client calls
  `POST /api/vocab/<id>/enrich` (1 z.ai call, `lib/llm/prompts/vocab-enrich.ts`, takes only the term)
  and the card fills: IPA, part of speech, definition, three examples. **Add another** resets.
- Exact duplicate: "You already have genteel." / "genteel — you marked this mastered." (outcome
  `duplicate`, no row, no call).
- Near duplicate (F14's fold, `lib/vocab/near-duplicate.ts`): "That looks like winnow, which you
  marked mastered." with **Open it**, **Put it back in rotation** and **Add winnowed anyway**
  (outcome `near_duplicate`, no row, no call).
- Non-English (**Non-English** chip, **As in** sentence, **Look it up**): 1 z.ai call
  (`vocab-translate.ts`) answers the English word with a `fit`; **Add <term>** inserts it `ready`
  with `origin_term`, `origin_language`, `origin_context` in one statement (no second call);
  **Not that word** goes back to the form.
- An enrichment that cannot reach the model: "Couldn't reach the dictionary. Try again." with
  **Try again** (`enrichment_status = failed`, `enrichment_error = llm_unreachable`).

## How to get to it (user POV)

Vocab -> **+** (or `/vocab/new` from Today's empty state) -> type -> **Add**.

## Driving it with verify.sh

```sh
$V ui RUN $S/vocab-add.mjs -- lugubrious
# card: lugubrious /lʊˈɡuːbriəs/ adjective looking or sounding sad and mournful, often overly so
#   The clown wore a lugubrious expression ... ADD ANOTHER
$V ui RUN $S/vocab-add.mjs -- genteel       # existing-word notice: You already have genteel. OPEN IT
$V ui RUN $S/vocab-add.mjs -- winnowed      # That looks like winnow, which you marked mastered. ... ADD WINNOWED ANYWAY
$V api RUN POST /api/vocab '{"term":"Genteel!"}'     # 200 {"term":"genteel","outcome":"duplicate"}
$V api RUN POST /api/vocab '{"term":"winnowed"}'     # 200 {"term":"winnow","outcome":"near_duplicate"}
$V ui RUN $S/vocab-lookup.mjs -- kangen "aku kangen masakan ibu"
# answer: kangen Indonesian miss /mɪs/ verb to feel sad about the absence of someone or something
#   No exact English word for this. ... ADD MISS NOT THAT WORD   ->  saved: miss ... ADD ANOTHER
$V sql RUN "select term, source, enrichment_status, origin_term, origin_language, origin_context from vocab_entries order by created_at desc limit 3"
# miss | manual | ready | kangen | Indonesian | aku kangen masakan ibu
# lugubrious | manual | ready | | |
$V budget RUN    # +1 per English add, +1 per lookup
```

Offline (`up --offline`), the same `vocab-add.mjs` ends on "Couldn't reach the dictionary. Try
again." and the row reads `failed | llm_unreachable`; the budget shows 2 refused (the SDK retries).

## Gotchas

- Pick a word the seed does not hold: the 29 seeded terms are in `scripts/seed-demo.ts`
  (`grep -oE "term: '[^']+'" scripts/seed-demo.ts`). `ineffable`, `genteel`, `winnow` are taken.
- `api POST /api/vocab` alone leaves a new row `pending` forever: the enrichment call is the
  client's second request. Drive adds with `ui`, or follow with `api RUN POST /api/vocab/<id>/enrich`.
- The fold is calibrated and deliberately under-folds some plurals: anything ending `-as`, `-is`,
  `-us`, `-ss` is "not a plural" (`bias`), so `penumbras` is created beside `penumbra`. Not a bug;
  `winnowed` -> `winnow` is the reliable near-duplicate.
- The "Just added" pills under the form are recent words, not the word just typed: never wait on
  them (an early recipe did and passed while the save was still in flight).
- Model text varies between runs (two runs gave two definitions of `lugubrious`); assert on
  `enrichment_status = ready`, three examples and a non-empty IPA.
