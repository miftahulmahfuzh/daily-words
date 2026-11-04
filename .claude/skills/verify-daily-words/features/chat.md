# Practising a word (the chat)

## Sub-features

- `/vocab/<id>/chat` opens the scene by itself (`POST /api/chat/<id>/open`, the proactive opener,
  personalised from the profile: the demo's Bleak House shows up). 1 z.ai call.
- Each reply (`Your reply`, **Send**): 1 call, answered in the scene. The turn meter is
  `role="img"` labelled "N of 8 turns used".
- The cap: `UPDATE … WHERE turn_count < 8` before every call (`MAX_ASSISTANT_TURNS`). At 8 of 8
  the composer goes, "Wrapping up", the page calls `POST /api/chat/<id>/close` (1 call) and the
  verdict (`kind = 'verdict'`, "Worth keeping: …") closes the round; **Practise again** starts the
  next round.
- A failed opener: "Couldn’t start the scene." with **Try again**.

## How to get to it (user POV)

Vocab -> a word -> **Practise this word**. A claimed word lands here directly (see share-claim.md).

## Driving it with verify.sh

```sh
ID=$($V sql RUN --value "select id from vocab_entries where term='lugubrious'")   # a word added this run
$V ui RUN $S/chat.mjs -- $ID
# opened: 1 of 8 turns used / > I think the lugubrious tone of that email was a bit much. / < meter: 2 of 8
$V ui RUN $S/chat.mjs -- $ID "reply 3" "reply 4" "reply 5" "reply 6" "reply 7" "reply 8"
# < meter: 3 of 8 ... < meter: 8 of 8 turns used / closed: the verdict is in; "Practise again" is offered
$V sql RUN "select s.round, s.turn_count, s.closed_at is not null closed, (select string_agg(kind, ',' order by created_at) from chat_messages m where m.session_id = s.id) from chat_sessions s join vocab_entries v on v.id = s.vocab_entry_id where v.term = 'lugubrious'"
# 1 | 8 | t | opener,reply,reply,...,verdict   (15 messages + the verdict)
$V budget RUN    # a full round is 9 calls (opener, 7 replies, verdict)
```

Measured 2026-11-04: opener + 1 reply = 2 calls; the rest of the round 7 more (6 replies, verdict).

## Gotchas

- A full round is 9 calls of a 20-call budget. Prove the cap with one round, not two; `--llm=40`
  if a change needs more, and say why.
- Re-opening a chat already at 8 of 8 fires the close by itself; `chat.mjs` with no replies then
  only waits for **Practise again** (it sends nothing when the meter reads 8).
- The seeded `genteel` session is mid-round (turn 2) on purpose, for the README; a fresh word gives
  a clean opener.
- Never assert on the scene's text: it is generated. Assert on the meter, the `chat_messages`
  kinds, `turn_count`, `closed_at` and the budget.
- `CHAT_MAX_NEW_ROUNDS_PER_DAY` stays at its default (30) in a run, so the per-day 429 is not
  driven by any recipe here. A change to it needs its own journey; record it here when one exists.
