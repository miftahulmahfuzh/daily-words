# F28 — The Collection comes back to where you were reading

**Card:** [daily-words#10](https://github.com/miftahulmahfuzh/daily-words/issues/10)
— *Back from a word must land the Collection where the reader left it.*
**Round 1**, 2026-09-02. Branch `task/10-the-collection-comes-back-to-where-you`.

---

## 1. What is being asked, and what already works

Search the Collection, scroll the result, tap a row, back-swipe: the list must
still be filtered *and* at the offset it was left at.

**The filter half already works** and needs nothing. `?q=` is in the URL,
`MineClient` reads it once in a `useState` initialiser at mount, so a popstate
back restores both the field and the filtered list. F19 made that structural.

**The offset half is a one-word opt-in that was never taken.** F24 built
`PaneScrollMemory` and `ScreenBody restoreScroll="<key>"` precisely because
`Screen` is a fixed-height flex column with `overflow: hidden` — scrolling is an
inner `.dw-pane-scroll` pane's, `window.scrollY` is permanently 0, and 0 is all
that native and Next scroll restoration know how to restore. Before this change
`grep -rn restoreScroll src/` returned two call sites, both `/journal`.

So the feature is not "build scroll memory". It is "opt `/vocab` in, and pay the
two costs that `/vocab` has and `/journal` did not".

## 2. What was chosen

| | Decision |
|---|---|
| **Key** | one flat key per *tab* — `vocab:mine`, `vocab:discover` — in `lib/vocab/format.ts`, passed by `page.tsx`. Not scoped to the query. |
| **Render window** | `MineClient` persists and restores `shown` in **local mode only**, so an offset past row 50 has somewhere to land. |
| **`PaneScrollMemory`** | unchanged. No new props, no contract change. |
| **`links.ts` / `BACK_TARGETS`** | unchanged. |

### 2a. Why the key is per tab

`src/app/(app)/vocab/page.tsx` has a **single** `ScreenBody scroll` whose child
is `discover ? <DiscoverTab/> : <MineTab/>`. One key would restore Discover's
offset into Mine's list and back — two unrelated lists sharing one slot. The page
already computes `discover`, so the split costs one ternary.

The constants live in `lib/vocab/format.ts` beside `VOCAB_PAGE_SIZE`, mirroring
`JOURNAL_SCROLL_KEY` in `lib/journal/limits.ts`: the screen and its kitchen-sink
fixture read the same symbol and cannot drift apart.

### 2b. Why the key is **not** scoped to the query

This was the card's open question and it is the one real decision here.

The hazard is genuine: with a flat key, the header back arrow on `/vocab/[id]`
resolves `?from=collection` through `BACK_TARGETS` to bare `/vocab` — a push with
no `q` — so an offset saved against a *filtered* list is restored into the
*unfiltered* one.

**It is not scoped anyway, for two reasons.**

**The requirement is met exactly without it.** Back-swipe is a popstate: it
restores the whole URL, `?q=` included, `MineClient` re-reads it, and the list
under the restored offset is the same list the offset was taken from. Steps 1–4
of the card pass with a flat key.

**Scoping it is not a small change — it forces the primitive open.** The key
would have to be *live and browser-owned*, and it cannot be, because of an
asymmetry that is easy to miss:

> In local mode `history.replaceState` deliberately never asks the server for
> anything. So a `restoreScroll` computed from `searchParams` freezes at the
> **mount-time** query while the pane's contents follow the **typed** query.

Traced concretely: land on `/vocab` (server key `vocab:mine`), type `gen`, scroll
to 300 — the write goes to `vocab:mine`, because that is the attribute stamped on
the pane. Back-swipe returns to `/vocab?q=gen`, whose server key is
`vocab:mine:gen`. Nothing is there. **A server-computed query key is strictly
worse than no query key**: it breaks the case the card actually asked for.

Making it live means `MineClient` owning the `PaneScrollMemory` instance, which
means splitting the pane-finding attribute from the storage key — two props and a
mode on a layout primitive the card explicitly fenced off ("No change to
`PaneScrollMemory`'s contract unless option 1 forces it"). And it introduces key
churn while typing, with the render-window reset racing the clamp write.

**And the degradation is bounded, which is what makes the trade acceptable.** A
filtered list is a subsequence of the unfiltered one, so it is never *taller*:
any offset recorded under a query is a valid, modest offset in the list without
it. The worst case for the back arrow is landing a few rows down the Collection
instead of at its top — never a jump to somewhere the user has never been. Today
it is always the top; this is a small change to a path the card did not ask
about, in exchange for the path it did.

If the back arrow turns out to matter, the honest fix is not a scoped key — it is
making the arrow and the swipe agree by carrying `q` in `vocabDetailHref` and
`BACK_TARGETS`, which is a second card with its own `check-nav.ts` work.

### 2c. Why the render window **is** restored, when the journal's is not

`MineClient` starts at `shown = VOCAB_PAGE_SIZE` (50) and grows by tapping
"More". Scroll past row 50, open a word, come back, and the pane has only 50 rows
to clamp against — the offset lands at the bottom of row 50 rather than where the
user was. That is a miss of "the same position", not a nicety.

F24 §4 accepted exactly this clamp for `/journal`, and the reason it gave does
not transfer:

> "Replaying the pages belongs to the screen that paginates, not to a layout
> primitive" — it costs one round trip per page, shows an extend-and-jump, and
> races the composer's optimistic rows.

Below `VOCAB_CLIENT_INDEX_MAX` (1,500) the Collection's **whole** list is already
in the browser. `shown` is a pure render window over an array that is already
there: no fetch, no round trip, no jump, nothing to race. Restoring it is a
`useState` initialiser reading one integer.

Three things keep it honest:

- **Local mode only.** Above the ceiling, `pages` is fetched through a cursor and
  this is the journal's situation again — clamping to the bottom of page 1 stays
  the accepted answer. The write is skipped entirely in server mode so the two
  modes cannot leave each other a value.
- **It rides the existing reset.** `onQueryChange` already does
  `setShown(VOCAB_PAGE_SIZE)`; the persist effect follows `shown`, so a new
  search writes 50 and no stale window survives a query change.
- **The DOM is committed before the restore reads it.** React commits every row
  for the restored `shown`, and only then runs layout effects — which is when
  `PaneScrollMemory` assigns `scrollTop`. The ordering is what makes the two
  halves compose rather than fight.

## 3. Approaches that lost

| Approach | Why it lost |
|---|---|
| **Query-scoped storage key** | §2b. Correct-looking and, computed on the server, actively breaks the requirement; computed in the browser it forces `PaneScrollMemory`'s contract open for a path the card did not ask about. |
| **Carry `q` through `vocabDetailHref` and `BACK_TARGETS`** | Makes the back arrow and the swipe agree, which is the real fix for §2b's wart — but it touches the closed origin whitelist, every `vocabDetailHref` caller, the detail page and `check-nav.ts`. Out of proportion to a card about scroll offset. Named here so the next round starts from it. |
| **Clear the stored offset whenever the query changes** | Cheap, and fixes nothing: the back arrow lands *after* the list screen is gone, so there is no query change left to observe. It also throws away the unfiltered offset the user would want back. |
| **Replay `shown` by re-fetching in server mode too** | The journal already rejected this shape, and above the ceiling the objection is unchanged. |
| **Default `restoreScroll` on for every `scroll` pane** | F24 rejected it and the reason still holds: the chat transcript is bottom-anchored. Opt-in is one word per screen. |

## 4. The ambiguity call

The card says "back-swipe". The narrow reading — restore on the popstate path —
is what is built, and it is what a mount-keyed design gives for free on every
path including a cold load. The wide reading — *every* route back into `/vocab`
lands exactly where the user was, header arrow included — is **not** built,
because it is §2b's second row: a change to the navigation contract rather than
to scroll memory. It is written down here and in the card comment so the next
round starts from a named alternative rather than from scratch.

## 5. What is touched

| File | Change |
|---|---|
| `src/lib/vocab/format.ts` | `VOCAB_MINE_SCROLL_KEY`, `VOCAB_DISCOVER_SCROLL_KEY`, `VOCAB_SHOWN_KEY` |
| `src/app/(app)/vocab/page.tsx` | `restoreScroll={discover ? … : …}` |
| `src/components/vocab/mine-client.tsx` | persist/restore `shown` in local mode; amend the stale "What back gives you, honestly" block |
| `src/app/kitchen-sink/vocab/page.tsx` | new — a `MineClient` fixture with `?fill=N` |
| `tests/e2e/no-scroll.spec.ts` | the restore, the tab split, the render window |
| `src/components/README.md` | the `restoreScroll` note gains its second screen |

## 6. How it is verified

- **`npm run test:layout`** — the eighteen no-scroll assertions must stay green,
  plus three new ones. They follow F24's *second* test rather than its first:
  seed `sessionStorage`, load cold, assert where the pane lands. That test is the
  one that isolates the feature ("if the pane lands at 240 it landed there
  because this feature put it there"); the round-trip variant needs a navigable
  detail fixture, which `/vocab` has not got — `VocabList` builds its hrefs
  through `vocabDetailHref`, so every row leaves the kitchen sink for an
  authenticated route. The shared primitive's round trip is already proven by the
  journal's test; what is new here is the key split and the render window, and
  both are visible on a single load.
- **`npm run vocab:check`** — `MineTab` must still carry exactly one `q:` in a
  query argument (§6). The local-mode RSC-tree invariant is what makes
  `history.replaceState` safe and nothing here goes near it.
- **`npm run nav:check`** — unchanged code, run because §2b considered touching it.
- **`npm run typecheck`, `npm run lint`, `npm run build`.**
- **Manual, on a touch device**, because Playwright does not back-swipe: search,
  scroll deep, open a word, swipe back. Then the header back arrow, which must
  land a few rows down the unfiltered list and never at its bottom.
