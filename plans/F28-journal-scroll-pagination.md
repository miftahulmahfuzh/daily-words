# F28 — The journal fetches its next page on scroll

**Card:** [daily-words#9](https://github.com/miftahulmahfuzh/daily-words/issues/9)
**Round 1 — 2026-09-02**

## The requirement

> Right now we need to click **Load More** to fetch the next batch of journal
> items. Can we make it more natural? That is, if the user scrolls down to the
> bottom, we automatically fetch the next "page".

Scope: `/journal` only. `/vocab` was not asked about — and, as §2 shows, does not
need asking about, because it is where the answer came from.

## 1. This reverses a decision, and the reversal is the interesting part

`journal-feed.tsx` shipped with a comment that rejects this feature by name:

> *"A button, not infinite scroll: the list is under a fixed top block and above
> a fixed tab bar, and a scroll that keeps loading makes both harder to reach."*

The user overruled it, which is their call. But the objection was **measurably
wrong about both halves**, and that is what makes this a correction rather than a
trade:

- `screen.tsx:41-48` — the tab bar is a **sibling** of the scrolling pane inside
  `.dw-screen`, which is a fixed-height flex column with `overflow: hidden`. It
  is a row in the flow of the *frame*, not of the list.
- `ScreenBody`'s `top` block (`screen.tsx:104-112`) is the other sibling, marked
  `shrink-0`, and carries the header and the search field.

So neither the top block nor the tab bar is *in* the growing list, and neither
can be pushed anywhere by appending rows to it. The thing an infinite scroll
genuinely makes unreachable is whatever sits **below** the list inside the pane —
and in this screen nothing does. The comment is rewritten to record the reversal
rather than deleted, per the card.

The other half of the original worry — a fetch chain that never terminates — is
answered by arithmetic that was already true: `JOURNAL_PAGE_SIZE = 30`
(`lib/journal/limits.ts:21`) and a `cursor` that goes null at the end.

## 2. The design: copy the neighbour, exactly

`/vocab` already does this, and has since F19:

| Piece | Where it already lives |
|---|---|
| sentinel ref + `IntersectionObserver`, disabled on error | `components/vocab/vocab-list.tsx:57-69` |
| the button **kept** as the affordance when IO never fires | `vocab-list.tsx:124-128` |
| a `busy` **ref** guard so a re-observed sentinel cannot double-fetch | `components/vocab/mine-client.tsx:147-149` |
| "stop auto-loading and leave the button" on a failed fetch | `mine-client.tsx:155-158` |

There is nothing to invent. The journal gets the same four things, in its own
file, and the result is that the two screens paginate the same way for the first
time.

### Two claims on the card that the neighbour disproves

Both were written from reading and are corrected here from what ships:

1. **`root` must not be the pane.** The card said an `IntersectionObserver`
   watching a sentinel inside `.dw-pane-scroll` must be given `root: <the pane>`,
   because `window.scrollY` is permanently 0. That conflates scrolling with
   intersection. With `root: null` the observer compares the sentinel's *current*
   viewport rect — which the pane's scrolling moves — against the viewport, and
   clips it against every ancestor's overflow on the way up, so the pane's
   `overflow-y: auto` is what takes the sentinel out of the intersection rect
   when it is scrolled past. `/vocab` ships `new IntersectionObserver(cb)` with
   no options and works. Passing the pane as `root` would additionally require
   finding it by `data-dw-scroll-key`, which is machinery bought for nothing.

2. **There is no cascade.** The card feared that F24's scroll restoration, which
   clamps a returning reader to the bottom of page one, leaves the sentinel
   already intersecting on mount — and that each fetch re-arms it, walking the
   whole journal in one navigation. The first half is true and the second is not:
   a page is 30 entries, which is several viewports, so appending one pushes the
   sentinel far below the fold and the observer goes quiet. The real behaviour is
   **exactly one** page fetched on return, for a reader who was already at the
   bottom of the list. That is a feature, and it costs one request.

   A `hasScrolled` guard to suppress even that was considered and dropped: it is
   state and a decision to maintain, in exchange for withholding a page from
   somebody demonstrably at the end of the list.

## 3. The changes

`src/app/(app)/journal/journal-feed.tsx`, and nothing else:

1. **`loadMore` gets a `busy` ref and a `useCallback`.** The `loading` state
   stays — it drives the button's spinner — but it cannot be the guard for an
   observer, because the observer is rebuilt whenever its deps change and a
   rebuild between the call and React's commit would fire a second fetch through
   a closure that still reads `loading === false`. `busy.current` is set
   synchronously and has no such window. This is `mine-client.tsx`'s shape.

2. **A sentinel ref on the existing `Load more` container**, with the observer
   effect from `vocab-list.tsx`, gated on `cursor && !problem`.

   The ref goes on the container that **already exists**, so this adds no DOM
   node. That matters in a repo whose test suite is eighteen height assertions
   and whose `PaneScrollMemory` renders `null` specifically to avoid growing a
   flex column by one `gap`.

3. **The button stays, and its comment says why** — borrowed from `vocab-list`:
   it is the whole affordance where `IntersectionObserver` never fires (reduced
   capability, a screen reader's virtual cursor) and the only affordance after a
   failed fetch, where auto-retrying on every re-entry is a scroll-driven spin.

4. **The rejecting comment is rewritten** into the record of the reversal.

## 4. Approaches that lost

| Approach | Why it lost |
|---|---|
| **Extract a shared `useNearBottom` hook / `<LoadMore>` component** used by both `/vocab` and this screen | Convention and scope. `src/components/README.md` is a frozen UI-kit contract, so a new shared primitive is an edit to a frozen document; and it would rewrite `/vocab`'s pagination, which the card explicitly says not to widen into. This repo also has form for keeping two implementations apart on purpose and documenting the difference — `lib/journal/search.ts` beside `lib/vocab/search.ts`, three separate modules for dedup / normalize / search. Eight lines twice, each next to the state it guards, is the local idiom. Worth revisiting only if a **third** screen paginates. |
| **`scroll` listener on the pane** with a `scrollHeight - scrollTop < threshold` test | Needs the pane by `data-dw-scroll-key`, fires on every frame of a fling, and has to be throttled by hand. `IntersectionObserver` is the same behaviour with none of that, and is already in the repo. |
| **Drop the button entirely** once the sentinel works | Loses the error affordance and the no-IO affordance, both of which `vocab-list.tsx` documents as load-bearing. Also strictly wider than the card, which asked for scrolling to work — not for the button to go. |
| **Fetch on `cursor` change, eagerly, until the pane overflows** | Prefetching pages nobody scrolled to, on a phone, on a train. The screen's whole premise is the opposite. |

## 5. Ambiguity call

"If the user scrolls down to the bottom, we automatically fetch" reads two ways:
the sentinel replaces the button, or the sentinel joins it. **Built: joins it.**
The narrower reading of the words — the tap stops being *required* — satisfies the
card fully while keeping the two cases where a sentinel cannot work at all. If the
user wanted the button gone, that is one comment and one round.

## 6. Measured, in a real browser

The two claims above are behavioural, so neither `journal:check` nor
`test:layout` can see them. Measured on 2026-09-02 against `npm run dev` at
375x812, with a throwaway fixture user carrying **65** entries and a session
cookie, driving Chromium and counting `GET /api/journal` requests. Nothing was
ever clicked.

| | Measured |
|---|---|
| First paint | 30 rows, `Load more` present, **0** fetches |
| Scroll to the bottom | 60 rows, **1** fetch, carrying a cursor |
| 1.5 s later, untouched | still 60 rows, still **1** fetch — the observer went quiet |
| Scroll to the bottom again | 65 rows, 2 fetches, `Load more` gone, tab bar still visible |

And the restore case, which is the one the card feared:

| | Measured |
|---|---|
| Offset stored while deep in the list | `dw:scroll:journal:list` = **5795** |
| Offset on the remount that has 30 rows | **2637** — F24's clamp, `scrollHeight 3246 - clientHeight 609` |
| Fetches on that mount | **1** |
| After it | 60 rows, `scrollHeight` 3246 → 6404, `scrollTop` still 2637 |

So the sentinel ends up ~3.7k px below the fold and stops. One request, and a
returning reader who was deep in the list now has the next page already there to
scroll into — the clamped restore is strictly better than it was.

The fixture and the driver were both throwaway and are not committed; there is no
regression test, for the same reason `/vocab`'s sentinel has none — asserting it
needs a signed-in user with more than `JOURNAL_PAGE_SIZE` entries, which no
fixture in `tests/e2e` has, and `/kitchen-sink/journal` renders no cursor at all.
The numbers above are the record.

## 7. Verification

- `npm run journal:check` — F10/F25's offline schemas, cursor, grouping, search.
  It asserts `loadMore` sends `sync.seen`; this change routes the sentinel
  *through* `loadMore` rather than growing a second fetch path, so that property
  is preserved by construction.
- `npm run typecheck`, `npm run lint`, `npm run build`.
- `npm run test:layout` — no new DOM node, and `/kitchen-sink/journal` renders no
  `Load more` at all (its fixture has no cursor), so the eighteen height
  assertions see nothing new. Run anyway; it is the gate.
