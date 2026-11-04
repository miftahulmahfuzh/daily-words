# The journal

## Sub-features

- `/journal`: the feed grouped by day ("Today", "Yesterday", dates), a search field, and **+ Line**
  (the composer behind a pill, [R23]): `A line worth keeping`, `Where from`, **Save**.
- The near-duplicate warning ([S4]): a re-paste that folds onto a kept line ("YOU KEPT THIS
  ALREADY", the earlier line and its date) with **Keep it anyway** (re-POST with `force: true`) and
  **Never mind** (the paste comes back, nothing written). Layer 1 is a normalised-text hash, free;
  layer 2 is pgvector over OpenAI embeddings and is off in a run unless `--embed`.
- `/journal/<id>`: **Ask for an insight** (1 z.ai call, claimed before the call) -> "What it means",
  "When it applies", "Written by the machine. Keep or discard."; edit, delete (two-tap), share.

## How to get to it (user POV)

Journal -> **+ Line** -> paste -> **Save**. Tap a line -> **Ask for an insight**.

## Driving it with verify.sh

```sh
$V ui RUN $S/journal-line.mjs
# saved and listed: Still water breeds mosquitoes, mw1db5ih.
# warning: YOU KEPT THIS ALREADY Still water breeds mosquitoes, mw1db5ih. heard on the train · Saved 4 Nov 2026 KEEP IT ANYWAY NEVER MIND
# after "Never mind" the composer holds: "STILL WATER BREEDS MOSQUITOES, MW1DB5IH."
$V logs RUN 'journal.dedup'
# [journal.dedup] layer 2 unavailable: config EMBEDDING_API_KEY is not set
# [journal.dedup] user=… layer1=miss … verdict=unchecked   then   layer1=hit … verdict=duplicate
JID=$($V sql RUN --value "select id from journal_entries order by created_at desc limit 1")
$V ui RUN $S/journal-insight.mjs -- $JID
# insight: WHAT IT MEANS Stagnant conditions ... WHEN IT APPLIES ... Written by the machine. Keep or discard.
$V sql RUN "select insight_status, jsonb_array_length(insight->'whenItApplies') from journal_entries where id = '$JID'"
# ready | 3
```

Cost: a line 0, the warning 0, an insight 1. `layout` also runs `journal-duplicate.spec.ts`
(signed in as `demo`, at se3), which covers **Keep it anyway** and the draft surviving a discard.

## Gotchas

- The default line carries a base-36 stamp so every drive is unique; the model notices it ("the
  trailing string is noise"). Pass a clean line as the argument when the insight's text matters.
- After the first **Save** the feed refreshes under the composer and a tap in that re-render is
  dropped silently: the steps wait for `networkidle` and half a second before the re-paste.
- Without `--embed`, a meaning-level duplicate (a paraphrase) is never warned about: the verdict is
  `unchecked`, by design ("under-warning is the correct failure mode"). Not a bug.
