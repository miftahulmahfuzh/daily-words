# F19 — The Collection's search, made instant

**Goal.** Typing in the Collection's search field must filter the list in the
frame the character is typed, and a typed character must never disappear.

**Architecture.** The whole collection is shipped to the browser once, in the
`/vocab` server render, and the search is a plain case-insensitive substring
filter in memory — the same predicate `listVocabEntries` runs in SQL,
transcribed. The search term is still written to the URL, but with
`window.history.replaceState` rather than `router.replace`, so it survives a tap
into a word and a press of back without ever costing a server round trip. Above a
documented ceiling of **1,500 words** the screen falls back to the existing
server-filtered path, which this plan also fixes, because the reversion bug is
in the URL-sync code and not in the round trip.

**Written for an engineer with zero context for this codebase.** Every path is
absolute from the repo root, every command is given with its expected output, and
every non-obvious rule is either quoted from the file that states it or explained
where it is introduced. Read `CLAUDE.md` § "Authority order for the docs" first;
everything below obeys it.

**Supersedes:** `plans/F4-vocab-detail.md` § 7.1's toolbar bullets on search —
specifically *"Typing debounces 250 ms, then `router.replace()`"* and *"**All
filter state lives in the URL.** This is the load-bearing decision for the whole
screen"* — and its acceptance item *"Search → tap a row → browser back → the same
search, the same filter, the same scroll position."* The first is the bug's
proximate cause; the last is half true today and this plan says which half (F4).
Nothing in `ROADMAP_v0.1.0.md` § Reconciliation Decisions is superseded, and
nothing in it constrains this work — see §0.

---

## 0. What the roadmap says about the Collection

Skimmed [R1]–[R22]. Three touch this screen and none of them constrains the
change:

| Decision | What it says | Effect here |
|---|---|---|
| [R17] | Tabs are `?tab=` query params; F8's Discover panel "must not use the param names `tab`, `q`, `status` or `sort`" | `q` stays the Collection's, spelled the same way. This plan changes **who writes it**, not what it is called. |
| [R18] | The Claude Design output is the visual source of truth | Zero visual change. The search field, its `/` mark, the A–Z headings and the row heights are byte-identical after this plan. |
| [R21] | The `+ Word` pill is the only add affordance | Untouched. |

[R19]'s no-scroll height budget applies to `/today`, not `/vocab` — `/vocab` is a
`ScreenBody scroll` pane and always has been. `tests/e2e/` contains no `/vocab`
spec at all (`grep -rn vocab tests/` is empty), so `npm run test:layout` is a
regression guard here rather than a target.

---

## 1. Diagnosis

The user's report, in full, because every clause of it is a clue:

> the Collection - Mine search is fucked up. i think it just delays so much: so i
> typed 'a' . and the UI always deleted it. but turns out, it is like filtering
> rows in the background, so it looks like it is deleting the letter that i typed
> in. after 3 seconds, 'a' will show up again with the filtered list. then i typed
> in 'f' . the 'a' persists, but 'f' got deleted. after 3 seconds, search bar shows
> 'af' with filtered list.

### F1 — The mechanism: `urlQ` holds two different facts in one slot, and the render-phase sync reads the wrong one

This is the finding. It is determined from the code with certainty, and it
predicts all three of the user's observations exactly, including the asymmetric
one ("the 'a' persists, but 'f' got deleted") that no vaguer explanation
produces.

`src/components/vocab/vocab-search.tsx` holds three things:

```tsx
const [value, setValue] = useState(initialQ);   // what is in the box
const [urlQ, setUrlQ]   = useState(initialQ);   // "what we believe the URL holds"

if (initialQ !== urlQ) {
  // The URL moved underneath us: back button, or a link elsewhere on the page.
  setUrlQ(initialQ);
  setValue(initialQ);
}

useEffect(() => {
  const next = value.trim();
  if (next === urlQ) return;
  const timer = setTimeout(() => {
    setUrlQ(next);                                            // ← (A)
    router.replace(vocabListHref({ q: next || undefined }), { scroll: false });
  }, 250);
  return () => clearTimeout(timer);
}, [value, urlQ, router]);
```

`initialQ` is a **prop**, threaded down from `src/app/(app)/vocab/page.tsx` →
`src/components/vocab/mine-tab.tsx`. It is the query the *server* filtered by, and
it can only change when a new RSC payload lands.

Line (A) is the bug. It sets `urlQ` to what the URL is *about to become*, one
network round trip before it becomes it. From that moment until the payload
lands, `initialQ !== urlQ` is true — and the render-phase block above reads that
as *"the URL moved underneath us"* and overwrites the box with the stale server
value. The comment on that block is not wrong about its purpose; it is wrong
about the only evidence it has. `urlQ` is being asked to mean two incompatible
things at once:

- **what we last asked the URL to become** (written at (A), before the trip), and
- **what the server last told us the URL is** (which is `initialQ`, after the trip).

Those differ for the entire duration of the round trip, which on a free-tier Neon
instance is the three seconds the user measured. A component that cannot tell
"the user is mid-flight" from "somebody navigated" will choose one, and this one
chooses to throw the keystroke away.

**The trace, against the report.** `router.replace` runs inside a React
transition, so the old tree stays mounted and `initialQ` keeps its old value
throughout.

| t | Event | `initialQ` | `urlQ` | `value` | On screen |
|---|---|---|---|---|---|
| 0 | field empty, URL `/vocab` | `""` | `""` | `""` | empty |
| 0 | user types `a` | `""` | `""` | `"a"` | **`a`** |
| +250 ms | debounce fires: (A) sets `urlQ="a"`, `router.replace("/vocab?q=a")` | `""` | `"a"` | `"a"` | — |
| +250 ms | React re-renders: `"" !== "a"` → sync fires → `setUrlQ("")`, `setValue("")` | `""` | `""` | `""` | **empty — the letter "was deleted"** |
| +3 s | payload lands, `initialQ="a"` → sync fires → `setValue("a")`; `key={q}` remounts the list | `"a"` | `"a"` | `"a"` | **`a`, filtered** |
| +3 s | user types `f` | `"a"` | `"a"` | `"af"` | **`af`** |
| +250 ms | (A) sets `urlQ="af"`; re-render: `"a" !== "af"` → sync → `setValue("a")` | `"a"` | `"a"` | `"a"` | **`a` — "the 'a' persists, but 'f' got deleted"** |
| +3 s | payload lands, `initialQ="af"` → `setValue("af")` | `"af"` | `"af"` | `"af"` | **`af`, filtered** |

Every row of the user's report is on that table. The asymmetry they noticed is
the tell: the surviving prefix is always exactly what the *server* has already
answered, which is only explicable if the component is reverting to a server
prop.

### F2 — `src/app/(app)/vocab/loading.tsx` is **not** implicated, and here is how we know

`/vocab` has a route-level `loading.tsx` (a skeleton search field plus eight ghost
rows). It is the obvious second suspect: if Next.js revealed that Suspense
boundary on a search-param navigation, `VocabSearch` would unmount, the skeleton
would take its place, and it would remount from `useState(initialQ)` when the
payload landed — producing a superficially similar "the letter vanished and came
back".

It is not what happened, and the user's own words settle it. Under the
`loading.tsx` hypothesis the **whole field disappears** and is replaced by a grey
bar; there is no box to hold a partial value. The user reports *"the 'a'
persists, but 'f' got deleted"* — a mounted input, holding text, for the whole
three seconds. That is only possible if the component stayed mounted, which is
F1.

This is a deduction from the bug report rather than from the source, so state the
experiment that would settle it independently, in case a future session sees a
different symptom: **temporarily rename `src/app/(app)/vocab/loading.tsx` to
`loading.tsx.off`, reload `/vocab`, and type two characters.** If the skeleton
was participating, the flash changes shape; if F1 is the whole story, the
behaviour is bit-for-bit identical. Do this *before* changing any component, and
put the file back.

(After this plan lands the question is moot in the common case: local mode
performs no navigation at all, so no boundary can be revealed. `loading.tsx` keeps
doing its real job, which is covering the cold navigation *into* `/vocab`.)

### F3 — The load-bearing property F4 claimed is half-delivered today, and it is the second half that is missing

`vocab-search.tsx`'s comment, and F4 §7.1 before it, defend the URL round trip
like this:

> the user searches "gen", taps a word, presses back, and Next.js restores the
> same filtered list at the same scroll offset because the URL never changed.

The **filtered list** half is real and must be preserved. The **scroll offset**
half is not delivered and never has been, for a structural reason:
`src/components/layout/screen.tsx` puts scrolling in an inner pane, not on the
window —

```
.dw-pane-scroll { overflow-y: auto; overscroll-behavior-y: contain; }
```

— and the component's own docblock says so: *"The frame is a fixed-height flex
column with `overflow: hidden`; scrolling, where a screen wants it, is an inner
pane's business and never the page's."* Browser and Next.js scroll restoration
both restore `window.scrollY`, which on every screen in this app is permanently
0. `grep -rn "scrollTop\|scrollRestoration" src/` returns nothing. So the
collection's scroll position is lost on back today, with the URL intact, and it
will be lost on back after this plan, with the URL intact. **Nothing regresses,
and nothing is fixed** — see D6, which is where that is decided rather than
merely observed.

### F4 — The round trip is not free even when it works

Every keystroke past the debounce is: an RSC request → `requireUser()` (a session
read) → `countVocabEntries` + `listVocabEntries` against Neon → a payload → a
remount of `VocabList` (its `key={q}` changes). Two SQL statements and a full
subtree remount, per accepted keystroke, to answer a question about at most a few
hundred short strings the client could have held in 60 kB. The latency the user
measured is the free-tier connection, but the architecture is what put a network
in the loop, and fixing only the reversion would leave a search box that lags the
finger by three seconds and merely stops lying about it.

---

## 2. Decisions

### D1 — The whole collection is shipped to the browser and filtered in memory

The user's own suggestion, and it is right at this scale. `plans/F4-vocab-detail.md`
§ "Deliberately NOT added" states the scale the whole screen was designed for:

> At the stated scale — 500 words, a few thousand at the outside, always filtered
> by `user_id` first — a `LIKE '%q%'` over the user's own rows is sub-millisecond.
> […] Revisit past ~5,000 rows per user.

If the *server* side is sub-millisecond at that size, the only thing the round
trip buys is the round trip. Ship the rows instead:

- `MineTab` (server) issues **one** statement — `listVocabEntries(userId, { limit:
  VOCAB_CLIENT_INDEX_MAX + 1 })`, unfiltered — and hands the result to a client
  component.
- The client holds the array, filters it with `String.prototype.includes`, and
  renders a window of `VOCAB_PAGE_SIZE` rows.
- No `fetch`, no `router.replace`, no Suspense boundary, no remount, and no
  database statement is issued by typing. **Zero network requests while typing** is
  an assertable property and §6's manual pass asserts it.

This is also strictly *fewer* statements than today in the common case: today
`MineTab` runs `countVocabEntries` **and** `listVocabEntries` on every load; after
this it runs one, because when the unfiltered probe comes back short its length
*is* the total.

### D2 — The rejected alternatives, and why

**(a) Keep server filtering; just fix the reversion, and add `useTransition`.**
This is the smallest possible change and it is genuinely correct — F1 is a
self-contained bug. It is rejected as the *primary* design because it leaves a
three-second lag between the finger and the list on the app's only search box,
and because the fix's own machinery (a debounce, two pieces of state tracking one
URL, a pending affordance to explain the wait) is more moving parts than the
thing it is compensating for. It is **not discarded**: it is exactly what D5's
fallback path is, so this plan builds it anyway, and it is the reason the fallback
is not new code (see D5).

**(b) Hybrid — client-filter what is loaded, fetch the rest.** Rejected. It
produces a filter whose completeness depends on how far the user happened to have
scrolled, so `"3 matches of 214"` would sometimes mean "3 matches among the 50
rows you have seen". A search that silently under-reports is worse than a search
that waits, and there is no honest copy for the intermediate state. The correct
version of the hybrid is D5's *whole-collection-or-server*, where the mode is
decided once, on a number, before any rows are drawn.

**(c) A trigram index and a faster query.** Rejected for the reason F4 already
gave: the query is not the slow part.

### D3 — The search term still goes in the URL, written with `window.history.replaceState`

The property F3 identifies as real — search "gen", tap a word, press back, the
list is still filtered by "gen" — is preserved, and it is preserved by keeping
`?q=` in the URL exactly as it is today. What changes is who writes it and what
that write costs:

```ts
window.history.replaceState(null, "", vocabListHref({ q: needle || undefined }));
```

Next.js 15 patches `window.history.pushState`/`replaceState` and folds them into
its own router state, so this updates `usePathname()`/`useSearchParams()` and the
address bar **without re-running a server component, without a Suspense
boundary, and without a fetch**. That is the whole difference from
`router.replace`, which is a navigation.

The property that makes this safe is worth naming, because it is the plan's
quietest load-bearing decision:

> **In local mode the server render does not depend on `q` at all.**

`MineTab` ships the whole collection whatever `q` says. So the RSC tree for
`/vocab` and the RSC tree for `/vocab?q=gen` are *the same tree*, and it does not
matter whether the browser's history entry has a server tree that was fetched for
the one URL and now displays the other. Give the server back its dependence on
`q` in local mode — "just to render the count on the server" — and this
degenerates into a cache that disagrees with the URL. `vocab:check` asserts that
`MineTab`'s local branch passes no `q` to the query.

The write is **debounced 500 ms**, and that is not cosmetic: Safari throttles
`history.replaceState` to roughly 100 calls per 30 seconds and throws a
`SecurityError` past it. Debounced at 500 ms, sustained one-character-per-pause
typing tops out at 60 calls per 30 s; burst typing produces exactly one.

### D4 — The search term is read from the URL **once**, at mount, and never again

This is the structural deletion of F1. The component does not "sync with the
URL"; it seeds from it and then owns it.

```tsx
const [query, setQuery] = useState(
  () => searchParams.get("q")?.trim().slice(0, MAX_SEARCH_CHARS) ?? "",
);
```

A `useState` initialiser runs on the first render and never again, so there is no
render-phase branch that can fire mid-flight and no second piece of state to
disagree with the first. Back-navigation works because navigating away *unmounts*
the tree: `/vocab` → `/vocab/abc` → back remounts `MineClient`, the initialiser
runs against the restored URL, and the field and the filter come back together.

The one thing this gives up is adopting a URL change that happens *while the
component stays mounted*. There is exactly one such path in the app: tapping the
**Mine** tab while already on Mine with a search active (`Tabs` links to
`vocabListHref()`, i.e. `/vocab`). In local mode that leaves the field reading
"gen" with the URL reading `/vocab` for up to 500 ms, until the next keystroke
rewrites it. That is invisible — the user tapped the tab they were already on —
and it is the correct trade against reintroducing a prop-to-state sync. In
**server** mode the same path is handled properly, because there it is
distinguishable; see D5.

### D5 — Above 1,500 words the screen falls back to server filtering, and that path is the *fixed* version of today's code

**The ceiling.** `VOCAB_CLIENT_INDEX_MAX = 1500`, in `src/lib/vocab/search.ts`.

The number, with its arithmetic, because a ceiling nobody can check is a wish. A
`VocabListItem` on the wire is `{ id, term, definition, status, enrichmentStatus }`:

```
{"id":"3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d","term":"perspicacious",
 "definition":"Having a ready insight into and understanding of things.",
 "status":"active","enrichmentStatus":"ready"}
```

45 B of uuid, ~23 B of term, ~72 B of a 56-character definition, 45 B of the two
enums — **~185 B**, call it **220 B** with the RSC flight framing and a longer
definition.

| Collection | Raw payload | Over the wire (brotli) | Filter cost per keystroke |
|---|---|---|---|
| 300 words | ~66 kB | ~14 kB | ~0.1 ms |
| 1,000 | ~220 kB | ~45 kB | ~0.3 ms |
| **1,500 (the ceiling)** | **~330 kB** | **~60 kB** | **~0.5 ms** |
| 5,000 | ~1.1 MB | ~200 kB | ~1.6 ms |

At the ceiling the payload is roughly one webfont's worth ([R18] loads two), paid
once per visit to `/vocab`, in exchange for deleting a 3-second round trip from
every keystroke. At 5,000 it is not, which is also where F4 said to revisit. The
**DOM** cost is flat at every size because the render is windowed at
`VOCAB_PAGE_SIZE = 50` rows regardless of how many match (D7).

**What happens when it is crossed.** `MineTab` asks for `VOCAB_CLIENT_INDEX_MAX +
1` rows. If it gets them all back, the probe overflowed: the component switches to
server mode — `countVocabEntries` for the total, one filtered page, the cursor,
`GET /api/vocab` for "load more", `router.replace` for the URL — which is exactly
today's architecture, with F1 fixed. Nothing breaks, silently or otherwise; the
search goes back to costing a round trip, which is the honest degradation.

**Server mode's fix for F1** is to stop conflating the two facts named in §1 by
storing them in two fields:

```tsx
const [sync, setSync] = useState({ requested: serverQ ?? "", seen: serverQ ?? "" });

if (serverQ !== null && serverQ !== sync.seen) {
  const external = serverQ !== sync.requested;   // ← the distinction F1 could not make
  setSync({ requested: serverQ, seen: serverQ });
  …
  if (external) setQuery(serverQ);               // only a navigation we did not cause wins
}
```

`requested` advances when the debounce fires; `seen` advances only when a payload
lands. When the two agree, the server is answering our own question and the field
is left alone. When they disagree, someone else navigated — the Mine tab, the back
button — and the URL wins. Same comparison the old code made; the opposite
conclusion, because it now has the second fact to compare against.

**This mode will not run for this user.** `memory/daily-words-production-scale.md`
records one user with one card. That is a real risk (§7 R2), and the mitigation is
that it is *not new code*: it is the code that ships today, moved, with the two
facts separated. The manual pass in §6 forces it by setting the constant to 0.

### D6 — Scroll restoration is not attempted, and the copy that promised it is corrected

F3 established that the pane's `scrollTop` is not restored today. This plan does
not add it. Restoring an inner pane's offset means storing it per history entry
(`history.state` is Next's, `sessionStorage` keyed on the entry is hand-rolled),
restoring it after the list has rendered enough rows to be that tall, and
therefore also restoring `shown` — three pieces of machinery for a screen whose
common case is "search four letters, get three rows, tap one". Not worth it, and
guessing at it is how a screen ends up jumping on every back.

What the plan does instead is stop claiming it. `vocab-search.tsx`'s comment and
F4 §7.1's bullet both assert a scroll offset that has never been restored; the new
comment in `src/components/vocab/mine-client.tsx` says what is actually true —
**the filtered list survives, the scroll offset does not, and the reason is that
`.dw-pane-scroll` is not the window.** If it is ever wanted, it belongs in
`src/components/layout/screen.tsx` for every scrolling pane in the app, not in
the Collection.

### D7 — Pagination stays, as a client-side window; `VOCAB_PAGE_SIZE` keeps its meaning and `key={q}` is deleted

Client-side filtering over a paginated list is only correct if the whole set is
present — in local mode it is, by construction, which is exactly what the ceiling
buys. So the pagination that remains is a **render** window, not a fetch window:

- `MineClient` holds `shown`, initialised to `VOCAB_PAGE_SIZE` and reset to it on
  every query change (in the same handler that sets the query — not in an effect,
  so there is no frame where 800 rows are mounted).
- "Load more" and the `IntersectionObserver` sentinel are unchanged as
  affordances; in local mode they call `setShown(n => n + VOCAB_PAGE_SIZE)`
  instead of `listEntries()`. The `Button` stays, for the reason `vocab-list.tsx`
  already gives: it "is the whole affordance when `IntersectionObserver` never
  fires, which is the case in reduced-capability browsers and in a screen
  reader's virtual cursor".
- `key={q}` on `<VocabList>` is **deleted**. Its job was to discard accumulated
  server pages when the filter moved; in local mode there are no accumulated pages
  and remounting the list on every keystroke would reintroduce, in React, exactly
  the flicker this plan exists to remove. In server mode the same reset is done by
  three `setState` calls in the render-phase branch of D5, which is where the new
  `initialCursor` arrives anyway.
- The cursor (`src/lib/vocab/cursor.ts`), `GET /api/vocab`'s cursor handling and
  `listEntries()` in `src/lib/vocab/client.ts` are **all untouched**. They are
  server mode's, and server mode is a supported path.

Ordering is preserved for free: the rows arrive sorted by Postgres `lower(term)`,
`Array.prototype.filter` is order-preserving, and nothing sorts in JS —
`src/lib/vocab/format.ts` warns why (`groupByLetter` "never sorts, because the
database already did, and it must not").

One improvement falls out: `"N matches of {total}"` becomes the true match count
rather than "how many have been fetched so far".

### D8 — The matching rule is a transcription of the SQL, and lives in neither `dedup.ts` nor `normalize.ts`

`CLAUDE.md` is explicit that these two modules answer different questions and
"disagree about case, diacritics and punctuation on purpose". The search filter
must use **neither**:

- **`lib/vocab/dedup.ts`** answers *"are these two strings the same word?"*. It
  NFKD-normalises, strips combining marks, strips edge junk and folds morphology.
  Used for search it would make `cafe` find `café` (pleasant) and, far worse, make
  the browser disagree with `listVocabEntries`' SQL — so the same query would
  return different rows above and below D5's ceiling. Its own docblock forbids
  this: it is calibrated for "under-folding is the correct failure mode" on a
  suggestion filter, which is not what a search box is.
- **`lib/vocab/normalize.ts`** answers *"what did the user type, as a term?"*. It
  straightens curly quotes, strips edge punctuation and drops a lone trailing full
  stop, so a search for `"i.e."` would silently become a search for `i.e`. A
  search box is not a term field.

The third question — *"does this row match what is in the box, exactly as
Postgres would have answered it?"* — gets a third, tiny module,
`src/lib/vocab/search.ts`, named for its job. **The exact rule, and it must not
change meaning:**

| | Server, `matchesQuery` in `src/lib/db/queries/vocab.ts` | Client, `matchesSearch` in `src/lib/vocab/search.ts` |
|---|---|---|
| Fields | `term` **or** `coalesce(definition, '')` | `term` **or** `definition ?? ""` |
| Case | `lower()` on both sides | `toLowerCase()` on both sides |
| Match | `position(…) > 0` — plain substring | `String.prototype.includes` — plain substring |
| Diacritics | **not folded**: `cafe` does not match `café` | **not folded** |
| Metacharacters | none — `position`, not `LIKE`, so `%`, `_` and `\` are literal | none — `includes`, not `RegExp` |
| Empty query | predicate omitted; every row matches | `needle === ""` → every row matches |
| Length cap | `MAX_SEARCH_CHARS` (64), sliced in `listVocabQuerySchema` | `MAX_SEARCH_CHARS`, sliced in `searchNeedle` |
| Trim | `.trim()` in the schema and in `page.tsx` | `.trim()` in `searchNeedle`, **before** the slice |

Two rules that keep it a transcription rather than a lookalike:

1. **`toLowerCase()`, never `toLocaleLowerCase()`.** The former is the
   locale-independent Unicode default mapping and is the same on every device;
   the latter would make the search depend on the phone's language.
2. **Trim, then slice, then lowercase — in that order**, because that is the
   order the server does it (`z.string().trim().transform(s => s.slice(0, 64))`,
   then `lower()` in SQL). Lowercasing before slicing can change the length
   (`İ`.toLowerCase() is two code units) and the two would drift on exactly the
   inputs nobody tests.

The one residual divergence is Postgres `lower()` versus JS `toLowerCase()` on
Turkish dotted I and final sigma — the same divergence `queries/vocab.ts` already
documents beside `sameTerm` and `POST /api/vocab` already tolerates. Here its
worst consequence is that one row's membership in a result set differs between
local and server mode. Recorded, not fixed.

### D9 — "Clear search" becomes a callback, not a `<Link>`

`vocab-list.tsx` today renders `action={{ label: "Clear search", href:
vocabListHref() }}` in the no-matches empty state. In local mode a navigation to
`/vocab` would be a 3-second server round trip to clear a text field — the exact
cost this plan removes, on the one control that exists to recover from a bad
search. `EmptyState` already accepts `action.onClick` (`src/components/ui/empty-state.tsx`),
so this is a prop change and **not** a kit change; `src/components/README.md`
needs no edit.

It also removes the last reason `urlQ` existed. Its comment says it is there
because otherwise *"'Clear search' navigates to `/vocab`, the debounce below sees
`value` still reading 'gen', and pushes the query straight back — the button
would visibly undo itself."* With Clear as `setQuery("")` there is no navigation
to race, in either mode.

The native iOS clear (×) that `type="search"` provides keeps working unchanged:
it fires an `input` event with an empty value, which is the same `onChange`.

### D10 — `VocabSearch` becomes a controlled input with no state, no router and no URL

Three responsibilities lived in one 74-line component: the field, the debounce,
and the URL. F1 is what that costs. After this plan `VocabSearch` takes `value`,
`onChange` and `total`, renders a `TextInput`, and imports nothing from
`next/navigation`. Every stateful decision moves up into
`src/components/vocab/mine-client.tsx`, which is the one place that knows which
mode it is in.

Keeping it as a separate file rather than inlining it into `MineClient`: it is
the component `MineTab` positions in its own sticky block, its props are the whole
of its contract, and a 25-line presentational component is easier to be sure about
than the same JSX buried in a 150-line client island.

### D11 — No `useDeferredValue`, and no staleness affordance in local mode

Both were considered and both are omitted, on this codebase's own precedent.
`vocab-list.tsx` records why an unmeasured optimisation was removed rather than
guessed at:

> `contain-intrinsic-size` that disagrees with the real height moves the
> scrollbar as rows render […] so the optimisation was removed rather than
> guessed at. At this scale the list is fast without it.

The measured work per keystroke in local mode is ≤1,500 `includes()` calls
(~0.5 ms) plus a React render of at most 50 rows. That is inside one frame, so
`useDeferredValue` would defer nothing and would only introduce a state where the
field and the list disagree — a small, permanent version of the bug being fixed.
Likewise a dimming/pending treatment: there is nothing to wait for.

Where they *would* earn their keep is server mode, where there genuinely is a
round trip. They are omitted there too, deliberately, because that path must stay
the same code that ships today plus the F1 fix (D5) — adding an unmeasured visual
treatment to a branch that never runs for the only user is how a fallback becomes
untrustworthy. §7 R2 names the trigger for revisiting.

### D12 — No schema change, no API change, no route change

Stated so a later session does not go looking. `GET /api/vocab` keeps its query
schema, its cursor and its 400s. `src/lib/vocab/schemas.ts`,
`src/lib/vocab/cursor.ts`, `src/lib/vocab/serialize.ts`, `src/lib/db/queries/vocab.ts`
and `src/app/api/vocab/route.ts` are **not edited by this plan**. The only
server-side change is which arguments `MineTab` passes to a function that already
exists.

---

## 3. Schema changes

**None. No migration.** `npm run db:generate` must stay silent; a migration
appearing during this work means something else changed.

No index either. `listVocabEntries` orders by `lower(term), id`, which is served
by the existing functional unique index `UNIQUE (user_id, lower(term))`, and the
unfiltered probe of D5 is an index range scan capped at 1,501 rows.

---

## 4. Files

### Created

| File | Why |
|---|---|
| `src/lib/vocab/search.ts` | D8's matching rule and D5's ceiling. Client-safe: no `server-only`, no zod, no `next/*`. Read by the server component, the browser and `scripts/check-vocab.ts`, which is the whole reason it is a module and not three copies. |
| `src/components/vocab/mine-client.tsx` | `'use client'`. The Mine tab's entire client state: the query, the render window, the URL write, and server mode's fetch loop. The one file that knows which mode it is in. |

### Modified

| File | Change |
|---|---|
| `src/components/vocab/mine-tab.tsx` | One unfiltered probe of `VOCAB_CLIENT_INDEX_MAX + 1`; mode decided on its length; the two-statement filtered path kept for the overflow branch. Renders `MineClient`. |
| `src/components/vocab/vocab-search.tsx` | D10: controlled, stateless, routerless. |
| `src/components/vocab/vocab-list.tsx` | Presentational: takes exactly the rows to draw plus `onMore` / `onClear` / `matchCount`. Loses `useState`, `listEntries`, `vocabListHref` and `key`-driven resets. Keeps the sentinel, the `Button`, the two empty states and the group rendering byte-identical. |
| `scripts/check-vocab.ts` | §5 and §6 of §6 below — the matching rule against a transcribed SQL oracle, the ceiling arithmetic, and four repo greps. |
| `CLAUDE.md` | One paragraph under **Conventions** (§5, task 4). |

### Explicitly NOT modified

`src/app/(app)/vocab/page.tsx` (it already slices and trims `q` correctly, and
still passes it to `MineTab` for server mode) · `src/app/(app)/vocab/loading.tsx`
(F2) · `src/app/api/vocab/route.ts` · `src/lib/vocab/schemas.ts` ·
`src/lib/vocab/cursor.ts` · `src/lib/vocab/client.ts` · `src/lib/vocab/format.ts`
· `src/lib/vocab/links.ts` · `src/lib/vocab/dedup.ts` ·
`src/lib/vocab/normalize.ts` · `src/lib/db/queries/vocab.ts` ·
`src/components/ui/*` (no kit change — D9) · `src/components/README.md` ·
`tests/e2e/*`.

**No new `package.json` script.** `vocab:check` is extended, per the house rule
that a feature extends an existing check pair rather than adding a third.

---

## 5. Implementation

Four tasks. Each ends green and each ends with a commit. Run every command from
`/home/miftah/daily-words`.

Before starting, confirm the baseline (this is the output you must be able to get
back to):

```bash
npm run typecheck && npm run lint && npm run vocab:check && npm run nav:check
```

Expected tail: `all vocab duplicate checks passed` and `All navigation-origin
assertions passed.` `typecheck` and `lint` print nothing but their banners.

---

### Task 1 — `src/lib/vocab/search.ts`, and its assertions

Nothing imports it yet. This is the smallest possible commit and it is the one
that pins the semantics.

**1a. Create `/home/miftah/daily-words/src/lib/vocab/search.ts`:**

```ts
import { MAX_SEARCH_CHARS } from "@/lib/vocab/format";

/**
 * The Collection's search rule, and the ceiling on the client-side index.
 *
 * Client-safe by construction: no `server-only`, no zod, no `next/*`, and the
 * one thing it imports is a number. `MineTab` (server), `MineClient` (browser)
 * and `scripts/check-vocab.ts` (offline) all read it, and the point of the file
 * is that the three cannot disagree.
 *
 * **This is neither `dedup.ts` nor `normalize.ts`, and the difference is the
 * reason it is a third file.** CLAUDE.md states that those two "disagree about
 * case, diacritics and punctuation on purpose"; this one disagrees with both,
 * also on purpose.
 *
 * - `lib/vocab/dedup.ts` answers *"are these two strings the same word?"* — it
 *   strips diacritics and folds morphology. Used here, `cafe` would find `café`
 *   (pleasant) and — fatally — the browser would disagree with the SQL in
 *   `listVocabEntries`, so the same query would return different rows above and
 *   below VOCAB_CLIENT_INDEX_MAX. Its fold is calibrated for a suggestion
 *   filter, where under-folding is the correct failure mode. A search box is
 *   not that.
 * - `lib/vocab/normalize.ts` answers *"what did the user type, as a term?"* — it
 *   straightens quotes and strips edge punctuation, so a search for `"i.e."`
 *   would silently become a search for `i.e`. A search box is not a term field.
 *
 * What this module answers is a third question: *"does this row match what is in
 * the search box, exactly as Postgres would have answered it?"* It is a
 * transcription of `matchesQuery` in `lib/db/queries/vocab.ts`:
 *
 *     position(lower($q) in lower(term)) > 0
 *     or position(lower($q) in lower(coalesce(definition, ''))) > 0
 *
 * Case-insensitive substring, over two fields, with no diacritic folding, no
 * word splitting, no ranking and no metacharacters — `position` has none, and
 * `includes` has none, which is why neither side needs an escape rule. Both
 * halves must stay a transcription of the other; `npm run vocab:check` §5 drives
 * one table through a JS re-reading of the SQL and through this file and
 * requires the same answer.
 *
 * The one known divergence is Postgres `lower()` versus JS `toLowerCase()` on
 * the Turkish dotted I and final sigma — the same divergence
 * `queries/vocab.ts` documents beside `sameTerm`. Its worst consequence here is
 * that one row's membership differs between the two modes. Recorded, not fixed.
 */

/**
 * The largest collection that is shipped to the browser whole.
 *
 * A `VocabListItem` is ~220 bytes on the wire once the uuid, a definition and
 * the RSC framing are counted, so 1,500 rows is ~330 kB raw and ~60 kB brotli —
 * about one of the app's two webfonts, paid once per visit to /vocab, in
 * exchange for deleting a server round trip from every keystroke. At 5,000 it is
 * not, which is also where F4 §"Deliberately NOT added" said to revisit search.
 *
 * Crossing it is not a failure: `MineTab` falls back to server-side filtering,
 * which is the path `GET /api/vocab`'s cursor still serves. It is a documented
 * ceiling, and `npm run vocab:check` asserts the arithmetic behind the number so
 * that raising it has to face the payload size rather than just the constant.
 *
 * The DOM cost does not scale with this: the list renders a window of
 * VOCAB_PAGE_SIZE rows however many match.
 */
export const VOCAB_CLIENT_INDEX_MAX = 1500;

/** True when the whole collection may be held and filtered in the browser. */
export function canIndexLocally(total: number): boolean {
  return total <= VOCAB_CLIENT_INDEX_MAX;
}

/**
 * What the search box holds, reduced to the needle the row test uses.
 *
 * Trim, then slice, then lowercase — **in that order**, because that is the
 * order the server does it: `listVocabQuerySchema` trims and slices to
 * MAX_SEARCH_CHARS, and SQL lowercases afterwards. Lowercasing first can change
 * the length (`"İ".toLowerCase()` is two code units) and the two would drift on
 * exactly the inputs nobody tests.
 *
 * `toLowerCase`, never `toLocaleLowerCase`: the former is the locale-independent
 * Unicode default mapping and is the same on every device.
 *
 * Returns `""` for "no search", never `undefined`, so no caller can forget the
 * branch.
 */
export function searchNeedle(raw: string): string {
  return raw.trim().slice(0, MAX_SEARCH_CHARS).toLowerCase();
}

/** One row against one needle. `needle` must have come from `searchNeedle`. */
export function matchesSearch(
  item: { term: string; definition: string | null },
  needle: string,
): boolean {
  if (!needle) return true;
  return (
    item.term.toLowerCase().includes(needle) ||
    (item.definition ?? "").toLowerCase().includes(needle)
  );
}

/**
 * Order-preserving, and it must be.
 *
 * The rows arrive sorted by Postgres `lower(term)`; `groupByLetter` in
 * `format.ts` depends on that order and says so ("it never sorts, because the
 * database already did, and it must not"). `Array.prototype.filter` preserves
 * it. Nothing here sorts, and nothing here may.
 *
 * Returns the input array unchanged when there is no needle, so an empty search
 * costs nothing and the reference stays stable for `useMemo`.
 */
export function filterBySearch<T extends { term: string; definition: string | null }>(
  items: T[],
  needle: string,
): T[] {
  if (!needle) return items;
  return items.filter((item) => matchesSearch(item, needle));
}
```

**1b. Append to `/home/miftah/daily-words/scripts/check-vocab.ts`**, immediately
before the `/* ---- Result ---- */` block at the end of the file. Add the import
at the top of the file beside the others:

```ts
import {
  VOCAB_CLIENT_INDEX_MAX,
  canIndexLocally,
  filterBySearch,
  matchesSearch,
  searchNeedle,
} from '../src/lib/vocab/search'
```

and the section:

```ts
/* ------------------- §5 the collection search rule (F19) -------------------- */

section('§5 the search filter is a transcription of the SQL, not of dedup.ts')

/**
 * The oracle: `matchesQuery` in `lib/db/queries/vocab.ts`, re-read in JS.
 *
 *   position(lower($q) in lower(term)) > 0
 *   or position(lower($q) in lower(coalesce(definition, ''))) > 0
 *
 * `position(x in y) > 0` is `y.indexOf(x) !== -1`. Written out longhand rather
 * than by calling `matchesSearch`, because a check that calls the thing it is
 * checking asserts nothing.
 */
function sqlOracle(item: { term: string; definition: string | null }, q: string): boolean {
  const needle = q.trim().slice(0, 64).toLowerCase()
  if (needle === '') return true
  return (
    item.term.toLowerCase().indexOf(needle) !== -1 ||
    (item.definition ?? '').toLowerCase().indexOf(needle) !== -1
  )
}

const ROWS: { term: string; definition: string | null }[] = [
  { term: 'genteel', definition: 'Polite, refined, or respectable.' },
  { term: 'Café', definition: 'A small restaurant selling light meals.' },
  { term: 'naïve', definition: null },
  { term: 'sober', definition: 'Not affected by alcohol.' },
  { term: 'sob', definition: 'To weep with convulsive gasps.' },
  { term: 'i.e.', definition: 'That is; in other words.' },
  { term: 'margin', definition: 'A 100% increase in the edge of a page.' },
  { term: 'winnow', definition: 'To blow a current of air through grain.' },
]

const QUERIES = [
  'gen', 'GEN', 'Gen', 'cafe', 'café', 'CAFÉ', 'naive', 'naïve',
  'sob', 'sober', '100%', '_', '\\', 'i.e.', 'i.e', '', '   ',
  'polite', 'POLITE', 'grain', 'zzz', 'e',
]

for (const q of QUERIES) {
  const needle = searchNeedle(q)
  check(
    `matchesSearch agrees with the SQL for ${JSON.stringify(q)}`,
    ROWS.map((row) => matchesSearch(row, needle)),
    ROWS.map((row) => sqlOracle(row, q)),
  )
}

// The three that would silently change meaning if someone reached for the wrong
// module, spelled out so a regression names itself.
check('diacritics are NOT folded — cafe does not find Café', matchesSearch(ROWS[1], searchNeedle('cafe')), false)
check('…and café does', matchesSearch(ROWS[1], searchNeedle('café')), true)
check('% is a literal, not a wildcard', ROWS.filter((r) => matchesSearch(r, searchNeedle('100%'))).length, 1)
check('a lone _ matches nothing', ROWS.filter((r) => matchesSearch(r, searchNeedle('_'))).length, 0)
check('a lone backslash matches nothing', ROWS.filter((r) => matchesSearch(r, searchNeedle('\\'))).length, 0)
check('the trailing full stop is NOT stripped — i.e. is searched as typed', matchesSearch(ROWS[5], searchNeedle('i.e.')), true)
check('a null definition never throws', matchesSearch(ROWS[2], searchNeedle('weep')), false)
check('an empty needle matches every row', ROWS.every((r) => matchesSearch(r, searchNeedle('  '))), true)

// searchNeedle: trim, then slice, then lowercase — in that order.
check('searchNeedle trims', searchNeedle('  gen  '), 'gen')
check('searchNeedle lowercases', searchNeedle('GEN'), 'gen')
check('searchNeedle caps at MAX_SEARCH_CHARS', searchNeedle('x'.repeat(200)).length, 64)
check('searchNeedle trims before slicing', searchNeedle(' ' + 'x'.repeat(64) + ' ').length, 64)

// Order is the database's and must survive the filter untouched.
const ordered = filterBySearch([...ROWS], searchNeedle('e'))
check(
  'filterBySearch preserves the database order',
  ordered.map((r) => r.term),
  ROWS.filter((r) => matchesSearch(r, searchNeedle('e'))).map((r) => r.term),
)
check('an empty needle returns the same array reference', filterBySearch(ROWS, '') === ROWS, true)

section('§5b the client-index ceiling is a number somebody checked')

check('at the ceiling, local', canIndexLocally(VOCAB_CLIENT_INDEX_MAX), true)
check('one over, server', canIndexLocally(VOCAB_CLIENT_INDEX_MAX + 1), false)
check('an empty collection is local', canIndexLocally(0), true)

/**
 * The arithmetic behind the constant. A worst-case row, serialised, times the
 * ceiling, against a raw-payload budget of 400 kB (~70 kB brotli). Raising
 * VOCAB_CLIENT_INDEX_MAX without raising the budget fails here rather than on a
 * user's phone.
 */
const WORST_ROW = JSON.stringify({
  id: '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  term: 'intellectualisation',
  definition: 'x'.repeat(110),
  status: 'active',
  enrichmentStatus: 'ready',
})
const budget = VOCAB_CLIENT_INDEX_MAX * WORST_ROW.length
console.log(`  note worst-case payload at the ceiling: ${Math.round(budget / 1024)} kB raw`)
check('the whole-collection payload stays under 400 kB raw', budget < 400_000, true)
```

**1c. Run it.**

```bash
npm run typecheck && npm run lint && npm run vocab:check
```

Expected: every `§5` line prints `ok`, the `note` line prints
`worst-case payload at the ceiling: 359 kB raw` (245 bytes × 1,500, against the
400 kB budget on the next line), and the script ends
`all vocab duplicate checks passed`.

**1d. Commit.**

```bash
git add src/lib/vocab/search.ts scripts/check-vocab.ts
git commit -m "F19: the collection's search rule, as a transcription of the SQL

A third module beside dedup.ts and normalize.ts, because it answers a third
question. vocab:check drives one table through a JS re-reading of matchesQuery
and through matchesSearch and requires the same answer, so the browser and
Postgres cannot drift. VOCAB_CLIENT_INDEX_MAX carries its own arithmetic."
```

---

### Task 2 — the client rewrite

Four files change together because their prop contracts change together; split
any smaller and the tree does not typecheck.

**2a. Replace `/home/miftah/daily-words/src/components/vocab/vocab-search.tsx` entirely:**

```tsx
"use client";

import { TextInput } from "@/components/ui/text-input";
import { MAX_SEARCH_CHARS } from "@/lib/vocab/format";

/**
 * The collection's one control. A controlled input, and nothing else.
 *
 * It holds no state, reads no router and writes no URL. All three used to live
 * here, and the combination is what made a typed character visibly disappear:
 * the component kept one `urlQ` slot that meant both "what we asked the URL to
 * become" and "what the server says the URL is", and a render-phase sync read
 * the disagreement between the two — which lasts for the whole of a round trip —
 * as "the URL moved underneath us", and reverted the field to the stale server
 * value. See `mine-client.tsx`, which now owns all of it and keeps the two facts
 * apart.
 *
 * No clear button of its own: `type="search"` gives iOS Safari a native one, and
 * the no-matches empty state carries a "Clear search" action for everyone else.
 * A third affordance inside a 40px field is chrome, not help.
 */
export function VocabSearch({
  value,
  onChange,
  total,
}: {
  value: string;
  /** Called with the raw field value. Normalisation is the parent's business. */
  onChange: (next: string) => void;
  /** Size of the whole collection, ignoring the search. Placeholder only. */
  total: number;
}) {
  return (
    <TextInput
      type="search"
      name="q"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      maxLength={MAX_SEARCH_CHARS}
      inputMode="search"
      enterKeyHint="search"
      aria-label="Search your collection"
      placeholder={total > 0 ? `Search ${total} words` : "Search"}
      className="h-10"
      inputClassName="h-10 text-body"
      leading={<span className="font-mono text-mono-md text-ink-3">/</span>}
    />
  );
}
```

**2b. Replace `/home/miftah/daily-words/src/components/vocab/vocab-list.tsx` entirely.**
Everything below the props is unchanged from today except that `items` is now
exactly what to draw and the two callbacks replace the fetch loop:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/list-row";
import { Eyebrow, Meta } from "@/components/ui/text";
import { groupByLetter, listGloss } from "@/lib/vocab/format";
import { vocabDetailHref } from "@/lib/vocab/links";
import type { VocabListItem } from "@/lib/vocab/schemas";

/**
 * The collection, A–Z, in pages. Presentational: it draws exactly the rows it is
 * given and asks its parent for more.
 *
 * Page 1 arrives from the server render inside `MineClient`'s props, so the
 * first paint carries real rows and no fetch. What "more" means is the parent's
 * business and differs by mode — a wider slice of an array the browser already
 * holds, or another `GET /api/vocab` page — and keeping that decision out of
 * here is what let the search stop being a navigation.
 *
 * **Never sorts.** The rows arrive in the database's `lower(term)` order and
 * `groupByLetter` requires it; re-sorting here would silently disagree with the
 * cursor's ordering and make the seam between two server pages wrong.
 *
 * No virtualisation library, and no `content-visibility` either. F4 §7.1 called
 * for `content-visibility: auto; contain-intrinsic-size: 0 64px` on every row,
 * on the premise that rows are a fixed height. Measured at 375px they are not:
 * an ordinary row is 49.3px and one whose term wraps to two lines is 71px.
 * `contain-intrinsic-size` that disagrees with the real height moves the
 * scrollbar as rows render — several hundred pixels of drift over a long
 * collection — so the optimisation was removed rather than guessed at. At this
 * scale the list is fast without it.
 */
export function VocabList({
  items,
  q,
  total,
  matchCount,
  onMore,
  onClear,
  problem,
}: {
  /** Exactly the rows to draw, in the database's order. */
  items: VocabListItem[];
  /** The active search, or "". Drives which empty state is right. */
  q: string;
  /** Size of the whole collection, ignoring the search. */
  total: number;
  /** How many rows match `q` in all. `items.length` is only what is drawn. */
  matchCount: number;
  /** Null when there is nothing further to show. */
  onMore: (() => void) | null;
  onClear: () => void;
  /** A failed fetch, in server mode. Null in local mode, which cannot fail. */
  problem: string | null;
}) {
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !onMore || problem) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) onMore();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [onMore, problem]);

  if (items.length === 0) {
    return q ? (
      <EmptyState
        title="Nothing matches"
        body={`No word or meaning contains “${q}”.`}
        /* A callback, not a link to /vocab: in local mode a navigation here
           would be a server round trip to clear a text field, on the one control
           that exists to recover from a bad search. */
        action={{ label: "Clear search", onClick: onClear }}
      />
    ) : (
      <EmptyState
        title="No words yet"
        body="Add the first one, or let Discover suggest one."
        action={{ label: "Add a word", href: "/vocab/new" }}
      />
    );
  }

  return (
    <>
      {groupByLetter(items).map((group) => (
        <div key={group.letter}>
          {/* 62px is the sticky search block above: 12 pad + 40 field + 10 pad. */}
          <div className="sticky top-[62px] z-1 bg-paper pt-2.5 pb-1.5">
            <Eyebrow>{group.letter}</Eyebrow>
          </div>
          {group.items.map((item) => (
            <ListRow
              key={item.id}
              href={vocabDetailHref(item.id, "collection")}
              title={item.term}
              subtitle={listGloss(item)}
              muted={item.status === "mastered"}
              trailing={
                item.status === "mastered" ? (
                  <>
                    <span className="size-[5px] shrink-0 rounded-full bg-accent" />
                    <span className="sr-only">Mastered</span>
                  </>
                ) : undefined
              }
            />
          ))}
        </div>
      ))}

      {q && (
        <Meta className="py-3">
          {matchCount} {matchCount === 1 ? "match" : "matches"} of {total}
        </Meta>
      )}

      {onMore && (
        <div ref={sentinel} className="flex flex-col items-center gap-2 py-4">
          {/* The button is not a fallback for slow networks — it is the whole
              affordance when IntersectionObserver never fires, which is the
              case in reduced-capability browsers and in a screen reader's
              virtual cursor. */}
          <Button size="sm" fullWidth={false} onClick={onMore}>
            Load more
          </Button>
          {problem && <Meta className="text-red">{problem}</Meta>}
        </div>
      )}
    </>
  );
}
```

**2c. Create `/home/miftah/daily-words/src/components/vocab/mine-client.tsx`:**

```tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { VocabList } from "@/components/vocab/vocab-list";
import { VocabSearch } from "@/components/vocab/vocab-search";
import { listEntries } from "@/lib/vocab/client";
import { MAX_SEARCH_CHARS, VOCAB_PAGE_SIZE } from "@/lib/vocab/format";
import { vocabListHref } from "@/lib/vocab/links";
import { filterBySearch, searchNeedle } from "@/lib/vocab/search";
import type { VocabListItem } from "@/lib/vocab/schemas";

/**
 * The Mine tab's entire client state: the query, the render window, the URL, and
 * — above the ceiling only — a fetch loop.
 *
 * ## Two modes, chosen on a number by `MineTab`
 *
 * **Local** (`serverQ === null`) is the normal one: the server shipped the whole
 * collection and the search is `String.includes` over an array. Typing issues no
 * request of any kind. The load-bearing property, which is quiet and easy to
 * break:
 *
 *   > In local mode the server render does not depend on `q` at all.
 *
 * That is what makes the URL write below safe. `window.history.replaceState`
 * changes the address bar without asking the server for anything, so the history
 * entry for `/vocab?q=gen` carries the RSC tree that was fetched for `/vocab` —
 * which is fine only because those are the same tree. Reintroduce a server-side
 * dependence on `q` here ("just to render the count on the server") and this
 * becomes a cache that disagrees with its own URL.
 *
 * **Server** (`serverQ` is a string) is the fallback above
 * `VOCAB_CLIENT_INDEX_MAX`: the server filtered, the cursor paginates, and typing
 * is a `router.replace`. It is the architecture that shipped before F19, with
 * one bug removed — see the `sync` state below.
 *
 * ## What back gives you, honestly
 *
 * Search "gen", tap a word, press back: the field still reads "gen" and the list
 * is still filtered, because `?q=` is in the URL and the mount below reads it.
 * The **scroll offset is not restored**, before or after F19, and that is
 * structural rather than an oversight: `screen.tsx` scrolls an inner
 * `.dw-pane-scroll` pane, while browser and Next.js scroll restoration both
 * restore `window.scrollY`, which is permanently 0 in this app. F4 §7.1's
 * acceptance line promised the offset; it was never delivered. If it is ever
 * wanted it belongs in `screen.tsx`, for every scrolling pane, not here.
 */
export function MineClient({
  items,
  total,
  serverQ,
  initialCursor,
}: {
  /**
   * Local mode: the **whole** collection, sorted by Postgres `lower(term)`.
   * Server mode: page 1 of the server's answer for `serverQ`.
   */
  items: VocabListItem[];
  /** The size of the whole collection, ignoring any search. */
  total: number;
  /**
   * `null` in local mode — and that is the mode switch. `null` rather than `""`
   * on purpose: `""` is a real, distinguishable server answer.
   */
  serverQ: string | null;
  /** Server mode only. Always null in local mode. */
  initialCursor: string | null;
}) {
  const local = serverQ === null;
  const searchParams = useSearchParams();
  const router = useRouter();

  /**
   * Read the URL **once**, at mount, and never again.
   *
   * A `useState` initialiser runs on the first render only, so there is no
   * render-phase branch that can fire mid-flight and no second slot to disagree
   * with this one. That is the structural deletion of the bug F19 exists to fix.
   * Back-navigation still works because navigating away unmounts this tree, so
   * coming back runs the initialiser again, against the restored URL.
   */
  const [query, setQuery] = useState(
    () => searchParams.get("q")?.trim().slice(0, MAX_SEARCH_CHARS) ?? "",
  );

  /** How many matching rows are drawn. A render window, never a fetch window. */
  const [shown, setShown] = useState(VOCAB_PAGE_SIZE);

  const onQueryChange = useCallback((next: string) => {
    setQuery(next);
    // Reset here rather than in an effect: an effect would leave one committed
    // frame with the previous window's row count mounted against the new filter.
    setShown(VOCAB_PAGE_SIZE);
  }, []);

  const onClear = useCallback(() => onQueryChange(""), [onQueryChange]);

  /* ------------------------------ server mode ------------------------------ */

  const [pages, setPages] = useState<VocabListItem[]>([]);
  const [cursor, setCursor] = useState(initialCursor);
  const [problem, setProblem] = useState<string | null>(null);
  /** A ref, not state: the observer fires again before a re-render lands. */
  const busy = useRef(false);

  /**
   * Two facts, in two fields, because putting them in one is the bug.
   *
   * `requested` is what we last asked the URL to become; `seen` is what the
   * server last told us it is. They differ for the whole of a round trip — three
   * seconds on a free-tier Neon instance — and the old code stored both in one
   * `urlQ`, so it could not tell "the user is mid-flight" from "somebody
   * navigated". It read the first as the second and reverted the field to the
   * stale server value, one keystroke at a time.
   */
  const [sync, setSync] = useState({ requested: serverQ ?? "", seen: serverQ ?? "" });

  if (serverQ !== null && serverQ !== sync.seen) {
    // React's documented "adjust state when a prop changes": a state update in
    // the render body, which React re-runs immediately rather than committing.
    const external = serverQ !== sync.requested;
    setSync({ requested: serverQ, seen: serverQ });
    // The reset that `key={q}` on <VocabList> used to do. The new page-1 rows
    // and the new cursor arrive as props in the same render.
    setPages([]);
    setCursor(initialCursor);
    setProblem(null);
    // Only an answer we did not ask for may overwrite the field: a Link
    // elsewhere on the page (the Mine tab), or the back button.
    if (external) setQuery(serverQ);
  }

  useEffect(() => {
    if (local) return;
    const next = query.trim();
    if (next === sync.requested) return;
    const timer = setTimeout(() => {
      setSync((s) => ({ ...s, requested: next }));
      // `replace`, not `push` — otherwise the back button walks the user
      // backwards through "g", "ge", "gen" instead of leaving the screen.
      router.replace(vocabListHref({ q: next || undefined }), { scroll: false });
    }, 250);
    return () => clearTimeout(timer);
  }, [local, query, sync.requested, router]);

  const loadMore = useCallback(async () => {
    if (busy.current || !cursor) return;
    busy.current = true;
    setProblem(null);

    const result = await listEntries({ q: sync.seen || undefined, cursor });
    busy.current = false;

    if (!result.ok) {
      // Stop auto-loading and leave the button. Retrying a failing fetch every
      // time the sentinel re-enters the viewport is a scroll-driven spin.
      setProblem(result.message);
      return;
    }

    setPages((prev) => [...prev, ...result.data.items]);
    setCursor(result.data.nextCursor);
  }, [cursor, sync.seen]);

  /* ------------------------------- local mode ------------------------------ */

  useEffect(() => {
    if (!local) return;
    const href = vocabListHref({ q: query.trim() || undefined });
    /**
     * Debounced, and not for performance: Safari throttles
     * `history.replaceState` to roughly 100 calls per 30 seconds and throws a
     * SecurityError past it. At 500 ms, burst typing produces one call and the
     * worst sustained case is 60 per 30 s.
     */
    const timer = setTimeout(() => {
      if (href !== window.location.pathname + window.location.search) {
        window.history.replaceState(null, "", href);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [local, query]);

  /* ------------------------------- both modes ------------------------------ */

  const needle = searchNeedle(query);

  const matches = useMemo(
    () => (local ? filterBySearch(items, needle) : items.concat(pages)),
    [local, items, needle, pages],
  );

  const visible = local ? matches.slice(0, shown) : matches;

  const showMore = useCallback(() => setShown((n) => n + VOCAB_PAGE_SIZE), []);
  const fetchMore = useCallback(() => void loadMore(), [loadMore]);
  const hasMore = local ? shown < matches.length : Boolean(cursor);
  const onMore = hasMore ? (local ? showMore : fetchMore) : null;

  /**
   * The query the rows on screen were actually selected by. In local mode that
   * is what is in the box; in server mode it is what the server last answered,
   * so the count line and the empty state cannot describe a result that has not
   * arrived.
   */
  const shownQuery = local ? query.trim() : sync.seen;

  return (
    <>
      <div className="sticky top-0 z-2 bg-paper pt-3 pb-2.5">
        <VocabSearch value={query} onChange={onQueryChange} total={total} />
      </div>

      <VocabList
        items={visible}
        q={shownQuery}
        total={total}
        matchCount={matches.length}
        onMore={onMore}
        onClear={onClear}
        problem={problem}
      />
    </>
  );
}
```

**2d. Replace `/home/miftah/daily-words/src/components/vocab/mine-tab.tsx` entirely:**

```tsx
import { MineClient } from "@/components/vocab/mine-client";
import { countVocabEntries, listVocabEntries } from "@/lib/db/queries/vocab";
import { encodeCursor } from "@/lib/vocab/cursor";
import { VOCAB_PAGE_SIZE } from "@/lib/vocab/format";
import { VOCAB_CLIENT_INDEX_MAX } from "@/lib/vocab/search";
import { toListItem } from "@/lib/vocab/serialize";

/**
 * The Mine tab: the user's whole collection, A–Z.
 *
 * Rendered here, on the server, from the database — never fetched by the client
 * on mount. That is what keeps the first paint a complete list on a cold 3G
 * connection instead of a spinner followed by a reflow.
 *
 * Ordered alphabetically and nothing else. The design ([R18], the visual source
 * of truth) draws a search field and A–Z groups with no status chips and no sort
 * menu; F4 §7.1's toolbar was written before that design existed. One order
 * means one cursor, one index, and no way for page 2 to arrive under a different
 * ordering than page 1.
 *
 * **Which mode, and why the probe.** One unfiltered statement asks for one row
 * past `VOCAB_CLIENT_INDEX_MAX`. If it comes back short, the whole collection is
 * in hand: `probe.length` *is* the total, so this branch runs **one** statement
 * where the pre-F19 version ran two, and the browser can filter without asking
 * the database anything ever again. If it fills, the collection is too large to
 * ship and the pre-F19 path takes over — a count, one filtered page and a
 * cursor, three statements, only above the ceiling.
 *
 * **`q` is not passed to the query in the local branch, and must not be.** The
 * whole safety of `MineClient`'s `history.replaceState` rests on the RSC tree
 * for `/vocab` and for `/vocab?q=gen` being the same tree. `npm run vocab:check`
 * §6 asserts that this file contains exactly one `q:` in a query argument.
 */
export async function MineTab({ userId, q }: { userId: string; q: string }) {
  const probe = await listVocabEntries(userId, { limit: VOCAB_CLIENT_INDEX_MAX + 1 });

  if (probe.length <= VOCAB_CLIENT_INDEX_MAX) {
    return (
      <MineClient
        items={probe.map(toListItem)}
        total={probe.length}
        serverQ={null}
        initialCursor={null}
      />
    );
  }

  const [total, rows] = await Promise.all([
    countVocabEntries(userId),
    listVocabEntries(userId, { q: q || undefined, limit: VOCAB_PAGE_SIZE + 1 }),
  ]);

  const hasMore = rows.length > VOCAB_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, VOCAB_PAGE_SIZE) : rows;
  const last = page[page.length - 1];

  return (
    <MineClient
      items={page.map(toListItem)}
      total={total}
      serverQ={q}
      initialCursor={
        hasMore && last ? encodeCursor({ term: last.sortKey, id: last.id }) : null
      }
    />
  );
}
```

**2e. Run.**

```bash
npm run typecheck && npm run lint && npm run build
```

Expected: all three clean. In the `build` route table, `/vocab`'s First Load JS
should move by only a few hundred bytes — no new dependency is added, and
`ListRow`, `Button` and `EmptyState` were already in that bundle via
`vocab-list.tsx`.

> **If `npm run build` fails with `useSearchParams() should be wrapped in a
> suspense boundary at page "/vocab"`** — it should not, because `page.tsx`
> awaits `searchParams` and calls `requireUser()`, which makes the route dynamic
> — the fix is one wrapper in `mine-tab.tsx` and nothing else:
> `import { Suspense } from "react"` and return `<Suspense fallback={null}><MineClient …/></Suspense>` in both branches.
> Do **not** switch to reading `window.location.search`; a `typeof window` branch
> in a state initialiser is a hydration mismatch waiting for the one request
> where the prop and the URL disagree.

**2f. Commit.**

```bash
git add src/components/vocab/
git commit -m "F19: the collection filters in the browser, and stops eating keystrokes

VocabSearch was holding one urlQ slot that meant both 'what we asked the URL to
become' and 'what the server says it is'. Those disagree for the whole of a
round trip, and the render-phase sync read the disagreement as 'the URL moved
underneath us' and reverted the field — so 'a' vanished for three seconds and
came back, and the 'f' after it vanished while the 'a' stayed.

MineTab now ships the whole collection (one statement, down from two) and
MineClient filters it with String.includes. Typing issues no request at all;
?q= is still written to the URL, with history.replaceState, so back still
restores the filtered list. Above VOCAB_CLIENT_INDEX_MAX the old server-filtered
path takes over, with the two facts kept in two fields."
```

---

### Task 3 — the greps that keep it true

Four properties that a plausible future edit would break silently. Append to
`/home/miftah/daily-words/scripts/check-vocab.ts`, after §5b, and add
`import { readFileSync } from 'node:fs'` and `import { join } from 'node:path'`
at the top if they are not already there.

```ts
/* -------------- §6 the four things a future edit would break --------------- */

section('§6 structural properties of the collection search')

const root = join(import.meta.dirname, '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

const searchModule = read('src/lib/vocab/search.ts')
const mineTab = read('src/components/vocab/mine-tab.tsx')
const mineClient = read('src/components/vocab/mine-client.tsx')
const vocabSearch = read('src/components/vocab/vocab-search.tsx')

// 1. The rule must not become dedup's or normalize's. Either import would change
//    what the search means and make the browser disagree with the SQL.
//    Anchored to `^import` on purpose: search.ts's own docblock names both files
//    in prose, and it should keep being allowed to.
check(
  'search.ts imports neither dedup.ts nor normalize.ts',
  /^import[^\n]*vocab\/(dedup|normalize)/m.test(searchModule),
  false,
)

// 2. toLocaleLowerCase would make the search depend on the phone's language.
//    Matched as a *call* — the docblock says the word, and must keep saying it.
check('search.ts uses no locale-sensitive case mapping', searchModule.includes('.toLocaleLowerCase('), false)

// 3. The local branch must not filter on the server. If it does,
//    history.replaceState starts pointing a history entry at a tree that was
//    rendered for a different query — silently, and only on back.
check(
  'mine-tab.tsx passes q to exactly one query (the server-mode branch)',
  (mineTab.match(/q: q \|\| undefined/g) ?? []).length,
  1,
)

// 4. The trap CLAUDE.md documents: one value import of a zod schema put all of
//    zod in /vocab/new, 73 kB -> 4.6 kB once it was type-only. Both client
//    islands import VocabListItem and both must import it as a type.
for (const [name, source] of [
  ['mine-client.tsx', mineClient],
  ['vocab-search.tsx', vocabSearch],
  ['vocab-list.tsx', read('src/components/vocab/vocab-list.tsx')],
] as const) {
  const valueImport = /^import \{[^}]*\} from ["']@\/lib\/vocab\/schemas["']/m.test(source)
  check(`${name} imports schemas.ts as a type only`, valueImport, false)
}

// 5. The field must not grow a router again. Everything URL-shaped lives in
//    mine-client.tsx, which is the only file that knows which mode it is in.
check('vocab-search.tsx imports nothing from next/navigation', vocabSearch.includes('next/navigation'), false)
check('vocab-search.tsx holds no state', vocabSearch.includes('useState'), false)
```

Run and commit:

```bash
npm run vocab:check && npm run nav:check && npm run typecheck && npm run lint
git add scripts/check-vocab.ts
git commit -m "F19: assert the four properties a plausible edit would break silently

The search rule not becoming dedup's; the local branch not filtering on the
server (which is what makes history.replaceState safe); zod staying type-only in
all three client islands; and the search field never growing a router again."
```

---

### Task 4 — the convention paragraph, and the manual pass

**4a.** Add to `/home/miftah/daily-words/CLAUDE.md`, under **Conventions**,
immediately after the paragraph beginning "The word-detail back link names where
the user came from":

```markdown
- **The Collection's search runs in the browser, and the search term is written
  to the URL rather than read from it.** `MineTab` ships the whole collection
  when it is at most `VOCAB_CLIENT_INDEX_MAX` (1,500) rows — one statement, and
  `q` is deliberately **not** passed to that query, because the whole safety of
  `MineClient`'s `history.replaceState` rests on the RSC tree for `/vocab` and
  for `/vocab?q=gen` being the same tree. Typing issues no request of any kind;
  the field is seeded from `?q=` once, in a `useState` initialiser, and never
  re-read. Above the ceiling the pre-F19 server-filtered path takes over
  unchanged. The rule itself is `lib/vocab/search.ts` — a **third** module beside
  `dedup.ts` and `normalize.ts`, and neither of theirs: it is a transcription of
  `matchesQuery`'s SQL (case-insensitive substring over term and definition, no
  diacritic folding, no metacharacters), and `vocab:check` drives one table
  through a JS re-reading of the SQL and through it and requires the same answer.
  The bug this replaced is worth knowing because nothing threw: `vocab-search.tsx`
  kept one `urlQ` slot meaning both "what we asked the URL to become" and "what
  the server says it is", and a render-phase sync read the disagreement between
  them — which lasts for a whole round trip — as "the URL moved underneath us",
  reverting the field to the stale server value one keystroke at a time. Back
  still restores the filtered list; it has never restored the **scroll offset**,
  because `.dw-pane-scroll` is an inner pane and scroll restoration restores
  `window.scrollY`.
```

**4b.** Run the full offline suite and the layout spec. **Port 3200 is the only
port** — `playwright.config.ts` sets `reuseExistingServer: true`, so a leftover
production `next start` on 3200 gets reused and all 18 tests fail with a
misleading locator timeout. Check first, and kill by pid:

```bash
ss -ltnp | grep 3200        # if anything is listening: kill <pid>
npm run typecheck && npm run lint && npm run vocab:check && npm run nav:check && npm run dates:check && npm run build
npm run test:layout
```

Expected: `18 passed`. `/vocab` has no layout spec; this is a regression guard
that nothing in `globals.css` or the kit moved.

**4c.** The manual pass in §6. **4d.** Commit:

```bash
git add CLAUDE.md
git commit -m "F19: record the collection-search convention and the bug it replaced"
```

---

## 6. Verification

### Offline, no database, no network

| Command | Must print |
|---|---|
| `npm run typecheck` | nothing but its banner |
| `npm run lint` | nothing but its banner |
| `npm run vocab:check` | every `§5`/`§5b`/`§6` line `ok`, ending `all vocab duplicate checks passed` |
| `npm run nav:check` | `All navigation-origin assertions passed.` — this is the guard that the literal `from=` still appears only in `lib/vocab/links.ts`, and `vocab-list.tsx` still builds its row hrefs through `vocabDetailHref(id, "collection")` |
| `npm run dates:check` | `All date and calendar assertions passed.` — unaffected, run because `format.ts` sits next to the date helpers and a stray edit there is cheap to catch |
| `npm run db:generate` | **no new migration file.** §3: there is no schema change |
| `npm run build` | clean, and no `useSearchParams() should be wrapped in a suspense boundary` warning |
| `npm run test:layout` | `18 passed` |

`share:check`, `claim:check`, `journal:check`, `chat:check`, `discover:check`,
`stats:check` and `badges:check` are untouched by this work and are not part of
the pass; run them only if something unexpected moved.

**Why the new assertions belong in `vocab:check` and not a new script.** The
house rule is that a feature extends the existing check pair for the surface it
touches rather than adding a third. `vocab:check` already owns the pure,
offline, database-free assertions for everything under `lib/vocab/` — the add
path's outcome table, the correction matrix, the enrichment copy — and the search
rule is exactly that kind of fact. There is no database assertion to make (no
schema change, no new query), so `vocab:db` gains nothing.

### The manual pass

`npm run dev` serves 3200 and nothing else may. If 3200 is busy, `ss -ltnp | grep
3200` and `kill <pid>` — never pick another port, and note that
`pkill -f "port 3298"` does not match `next dev --turbopack --port 3200 --port 3298`.

1. **The reported bug, exactly.** Open `http://localhost:3200/vocab`. Type `a`,
   then `f`. **Every character must appear on the frame it is typed and must
   never disappear.** The list must narrow as you type. This is the one that has
   to work.
2. **Zero requests while typing.** With the DevTools **Network** panel open and
   filtered to `All`, type six characters. **The request count must not move.**
   This is the assertion the bug report earned: not "it feels faster", but "there
   is no longer a network in the loop".
3. **The URL still carries the search.** After typing `gen`, wait half a second:
   the address bar reads `http://localhost:3200/vocab?q=gen`. The **Network**
   panel still shows nothing, and the **Console** shows no `SecurityError`.
4. **Back restores the filtered list.** With `?q=gen` active, tap a word to open
   `/vocab/<id>`, then press the browser back button. The field must read `gen`
   and the list must still be filtered. (The scroll offset will be at the top —
   that is F3/D6, unchanged from before this work. Confirm it behaves the same on
   `git stash`-ed `main` if it looks like a regression.)
5. **Reload with the query in the URL.** Open
   `http://localhost:3200/vocab?q=gen` directly. The first paint must already be
   filtered with the field pre-filled — no flash of the full list, which proves
   the SSR pass read the URL.
6. **Both clears.** With a search that matches nothing (`zzzq`), tap **Clear
   search** in the empty state: instant, no navigation, no request. Then type
   again and use the native × that `type="search"` draws: same.
7. **The Mine tab link.** With `?q=gen` active, tap the **Mine** tab. Nothing
   surprising happens (D4 documents the ≤500 ms cosmetic lag in the URL).
8. **Slow 3G.** DevTools → Network → **Slow 3G**, reload `/vocab`, and repeat
   step 1 once the page has painted. Typing must be unaffected — that is the
   whole point of holding the rows.
9. **The fallback path.** Edit `src/lib/vocab/search.ts` and set
   `VOCAB_CLIENT_INDEX_MAX = 0`. Reload `/vocab`. The screen is now in server
   mode. Repeat step 1: characters are slow to take effect but **must still never
   revert** — this is the regression test for F1 in the path that is otherwise
   never exercised. Then repeat steps 4 and 7 (back and the Mine tab must both
   adopt the URL and overwrite the field, because in this mode they are
   distinguishable). Scroll to the bottom and confirm **Load more** still appends
   a page from `GET /api/vocab`. **Restore the constant to 1500 and confirm
   `npm run vocab:check` is green again.**
10. **Both colour schemes at 375px**, since the search block is sticky and the
    letter headings sit at `top-[62px]` beneath it. Nothing should have moved;
    this is a look, not a measurement.

Not automatable, and named so it is not assumed: whether iOS Safari's native
search × fires `onChange` with an empty value on a *real* device (it does in
every engine tested, and the empty-state Clear exists for the case it does not),
and whether Safari's `replaceState` throttle is ever reached in real typing.

---

## 7. Risks and open questions

**R1 — `history.replaceState` and Next.js's router are coupled, and the coupling
is a version-level assumption.** D3 relies on Next 15.5.23 folding a native
`replaceState` into its own canonical URL, so that `useSearchParams()` on a
restored history entry reports `?q=gen`. This is documented behaviour and it is
what the manual pass's steps 3–5 exercise, but it is the one thing in this plan
that a Next upgrade could quietly change. **The failure mode is benign and
visible**: back would restore an unfiltered list with a stale `?q=` in the
address bar. If that ever happens, the fix is to seed `query` from `MineTab`'s
`q` prop as well and take the first non-empty of the two — not to go back to
`router.replace`.

**R2 — Server mode will never run for the only user, and untested code rots.**
`memory/daily-words-production-scale.md` records one user with one card; the
ceiling is 1,500 words. Mitigations, in order of strength: it is not new code (it
is the pre-F19 path with F1 fixed); §6 step 9 forces it with a one-line constant
change and is part of the pass; and `vocab:check` §6 assertion 3 pins the one
property that distinguishes the branches. What is *not* mitigated is behavioural
rot in the fetch loop, which no offline assertion can reach. If the collection
ever approaches four figures, the honest move is to run step 9 as a standing part
of the release pass rather than to trust it.

**R3 — The probe fetches up to 1,501 rows and throws them away above the
ceiling.** D5's single-statement mode decision costs one wasted index scan on
every `/vocab` load for a user over the ceiling, followed by three more
statements. The alternative — `countVocabEntries` first, then branch — makes the
common case two sequential round trips instead of one, which is latency added to
the exact page this plan exists to speed up. The waste is bounded, it is in the
rare branch, and it is the right way round.

**R4 — 220 bytes per row is an estimate.** The table in D5 is arithmetic on a
representative row, not a measured RSC payload. `vocab:check` §5b asserts the
worst case against a 400 kB budget, which is the part that actually binds, but
nobody has read the real Content-Length of a 1,500-word `/vocab`. If the ceiling
is ever raised, **measure it** (`curl -s -H 'RSC: 1' … | wc -c` against a seeded
fixture) rather than re-deriving it.

**R5 — Postgres `lower()` and JS `toLowerCase()` disagree on Turkish dotted I and
final sigma.** D8. One row's membership in a result set can differ between local
and server mode. `queries/vocab.ts` already documents and tolerates the same
divergence on the add path, where it is backstopped by the unique index; here
there is no backstop and none is warranted, because the consequence is one row in
a search result rather than a lost write.

**R6 — Dropping `key={q}` means `VocabList` is now reconciled rather than
remounted across searches.** Rows are keyed on `item.id` and groups on
`group.letter`, both stable, so React's reconciliation is correct. The thing to
watch is any future *stateful* child of a row (an inline editor, an expanded
gloss): its state would now survive a query change. Nothing in the row is
stateful today, and `ListRow` is a `Link`.

### Open questions

**Q1 — Should the search also match `part_of_speech`, `pronunciation` or
`examples`?** It matches `term` and `definition` today, in SQL, and this plan is
a transcription — widening it here would be a behaviour change smuggled inside a
performance fix. In local mode it is now nearly free to widen (the fields would
have to be shipped, which is why it is not free). Decide it as a product
question, on both sides at once, and update `matchesQuery` and `matchesSearch` in
the same commit or `vocab:check` §5 will fail — which is the point of that
assertion.

**Q2 — Should the scroll offset be restored on back?** D6 says no here and says
where it would belong if the answer changes: `src/components/layout/screen.tsx`,
for every `.dw-pane-scroll` in the app, keyed on the history entry. Doing it for
the Collection alone would make one screen behave unlike the other nine.

**Q3 — Should "Clear search" also clear the URL immediately?** It does, 500 ms
later, through the same debounced write. An immediate `replaceState` on clear is
one line and would make the address bar agree with the screen faster, at the cost
of a second call site for the URL write. Left as one call site on purpose;
revisit only if the lag is ever visible.
