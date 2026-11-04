# Discover

## Sub-features

- `/vocab?tab=discover`: "Nothing here until you ask. The app does not choose for you." and
  **Pick a new word for me** (1 z.ai call, `suggest-words.ts`, returns a batch filtered against the
  whole collection, mastered words included).
- **Another** walks the batch in the browser without a call; a new call only when it runs out.
- **Keep**: `POST /api/vocab/suggestions/accept` inserts `source = 'suggested'`, then enrichment
  (1 call); the word is listed under **Kept from Discover**.
- A suggestion already held (a race) draws the existing-word notice instead.

## How to get to it (user POV)

Vocab -> Discover -> **Pick a new word for me** -> **Keep** or **Another**.

## Driving it with verify.sh

```sh
$V ui RUN $S/discover.mjs            # tap Another once, then Keep
# suggestion: chancery noun court dealing with equity and estates KEEP ANOTHER
# another: attrition noun gradual wearing down or loss KEEP ANOTHER
# kept: attrition
$V sql RUN "select term, source, enrichment_status from vocab_entries where source = 'suggested' order by created_at desc limit 1"
# attrition | suggested | ready     (pending for a second or two after Keep)
$V budget RUN                        # +2
```

## Gotchas

- `ui` exits as soon as "Kept from Discover" lists the word; the enrichment may still be in flight,
  so read `enrichment_status` a moment later (it was `pending`, then `ready`, measured).
- The words are generated: assert on the source, the status and the Kept list, not on which word.
- `discover.mjs -- 0` keeps the first suggestion; a larger number taps Another more often (free
  until the batch runs out).
