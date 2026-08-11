# Instant word detail from today's card

*2026-08-11*

## The problem

Tapping a word on today's card is slow, and the cause is not the render — it is
six **serial** Neon roundtrips before `/vocab/[id]` can paint:

| # | Where | Query |
|---|---|---|
| 1 | `(app)/layout.tsx` → `requireOnboardedUser` → `auth()` | session + user |
| 2 | same → `getProfile` | profile row |
| 3 | `vocab/[id]/page.tsx` → `requireUser` → `auth()` | **session + user again** |
| 4 | `getVocabEntryDetail` | `vocab_entries` |
| 5 | same function, second statement | `daily_card_items` |
| 6 | `getShareForEntity` | `shares` |

Auth.js is configured `session: { strategy: 'database' }`, so #1 and #3 are real
reads, not cookie parses, and there is no `react.cache` anywhere in `src/lib/`.
Nothing in the app prefetches: `grep prefetch src/` finds only three comments
about *avoiding* prefetchable GETs, and `next.config.ts` sets no `staleTimes`.

Two independent levers follow: stop paying for roundtrips nobody needs, and get
the payload to the client before the finger lands.

## The measured fact this rests on

`node_modules/next/dist/client/components/router-reducer/prefetch-cache-utils.js:279`:

```js
function getPrefetchEntryCacheStatus({ kind, prefetchTime, lastUsedTime }) {
  if (Date.now() < (lastUsedTime ?? prefetchTime) + DYNAMIC_STALETIME_MS) { … }
  if (kind === PrefetchKind.AUTO) { … return stale }      // loading boundary only
  if (kind === PrefetchKind.FULL) {
    if (Date.now() < prefetchTime + STATIC_STALETIME_MS) return reusable
  }
  return expired
}
```

`staleTimes.dynamic` defaults to **0** (`server/config-shared.js:202`), so the
first branch never fires — which is exactly why nothing is instant today. But an
explicit `prefetch={true}` is `PrefetchKind.FULL`, and that branch is governed by
`STATIC_STALETIME_MS` = **300s**, ignoring `staleTimes.dynamic` entirely.

So a full prefetch is reusable for five minutes with **no config change**. The
default (`AUTO`) returns `stale`, reusing only a loading boundary and lazy-fetching
the real data, which is the behaviour we have.

## Rejected: cookies

Six definitions plus examples is 2–4 kB, against a 4 kB per-cookie limit, and a
cookie is re-uploaded on **every** request — RSC payloads, API calls, art under
`/badges` and `/levels`. You would pay for it forever to save one navigation.

## Rejected for now: ship the detail data inside today's payload

The instinctive fix — widen `readCardItems` and render `/vocab/[id]` from a
client cache — is the only option that is instant on a *cold* tap with no
prefetch window, and F18 already set the precedent for widening (`ShareCardItemRow`
adds `pronunciation` and `examples` "because `readCardItems` selects five columns
because that is all `/today` draws").

It is still the wrong first move. `/vocab/[id]` is a server component whose entire
ownership check is server-side, it draws six fields the card does not carry plus
the share slug, and client-rendering it means a second parallel implementation.
Held in reserve if measurement shows the 300s window is missed too often.

## Section 1 — cut the serial roundtrips

Behaviour-preserving, and it speeds up every screen in `(app)`, not just this one.

**1a. Dedupe the session read.** Wrap `getSessionUser` in React's `cache()`, and
`getProfile` likewise. The layout's `requireOnboardedUser` and the page's
`requireUser` currently read the same session row twice, serially, on every authed
page. Wrap the plain reads rather than `requireUser`/`requireOnboardedUser`, which
throw via `redirect()`. `cache()` is per-request, so there is no staleness surface.

**1b. Merge `getVocabEntryDetail`'s two statements.** drizzle 0.45.2 exports
`exists()`, so `carded` becomes a subquery column in the same statement. One
roundtrip instead of two; `VocabEntryDetail` unchanged.

This one had a documented landmine, and it is worth recording how it was cleared.
The two statements were deliberate: an earlier correlated-subquery attempt
rendered `daily_card_items.vocab_entry_id = daily_card_items.id`, returned a tidy
`false` for every row, threw nothing, and "would have shipped a Delete button on
words with history" — an [R1] violation. That failure turned out to be a property
of a raw `sql` **fragment**, not of correlated subqueries: `exists()` takes a query
builder, so it qualifies the correlation structurally.

Rendered SQL was *not* accepted as proof, because the bug it replaces also
rendered clean SQL. Both readings were run side by side over all **37 live rows,
18 carded and 19 not — zero disagreements**. That comparison, not the SQL, is what
licensed the merge, and the amended comment in `queries/vocab.ts` says to re-run it
rather than re-derive it.

**1c. Not taken.** Left-joining `shares` into 1b would save a further roundtrip
for free, but `getShareForEntity` is a deliberate third page-level read documented
as "issued only when the word is ready, because that is the only state in which
the control renders" (F16). Left available as a one-line follow-up.

Net: `/vocab/[id]` goes from **6 serial roundtrips to 3**.

## Section 2 — the prefetch

**2a. `prefetch` becomes a prop**, threaded `/today` → `DailyCard` →
`DailyCardRow` → `<Link>`. Not a default on the row: `DailyCardRow` is shared with
F18's public shared card, whose rows point at `/s/<slug>/<n>`, and eagerly
prefetching six public snapshot pages for a stranger is a decision nobody asked
for. Additive and defaulted to Next's `auto` — the same shape the `href` prop took
for the same reason.

**2b. Only rows whose word is ready get prefetched.** A 300s-reusable payload is
a win only if the data is settled. A word still enriching renders "finding it…";
prefetch that at page load and the tap serves that sentence from cache for five
minutes, where today it renders fresh and shows the definition. That is a
regression no layout assertion could see. The gate is already computed —
`toDailyCardItemView` nulls `definition` unless `enrichmentStatus === "ready"`, so
`item.definition !== null` **is** "ready", and `DailyCardRow` already branches on
it. The pending skeleton and the no-prefetch rule become one condition rather than
two.

**2c. No `next.config.ts` change.** `staleTimes` stays absent; setting `dynamic`
would extend reuse to every dynamic navigation in the app, and `PrefetchKind.FULL`
already gets its 300s from the `STATIC_STALETIME_MS` branch.

**2d. Scope stops at `/today`.** `/card/[date]` renders the same card and is a
one-line extension later, but a past card is browsed rather than tapped through,
so it does not earn the amplification yet.

### Accepted cost

Six full page renders fire once `/today` settles: 6 × 3 = ~18 roundtrips, at low
priority, on a warm connection, once per view of `/today`. Production is one user
and one card. Accepted deliberately over prefetch-on-`pointerdown`, which buys
only the 100–300ms between finger-down and finger-up.

### Why the staleness surface is small

Every mutation on the detail page — `MasteredToggle`, `DeleteWordButton`,
`ShareButton`, `RetryEnrichmentButton` — already calls `router.refresh()`, which
clears the router cache including prefetch entries. Returning to `/today` also
re-mounts the links and refreshes each entry.

## Section 3 — verification

`playwright.config.ts:80` boots `npm run dev`, and
`client/components/links.js:194` returns early on viewport prefetch in
non-production — "because it requires compiling the target page". So the existing
18 no-scroll assertions are **untouched** by section 2, and equally give it **no
coverage**. No check script: section 2's rule is one boolean over
`item.definition`, already the row's own pending branch.

Offline evidence for section 1 is `npm run typecheck` plus `vocab:check`,
`nav:check` and `dates:check` still passing — it is behaviour-preserving by
construction.

The prefetch needs a production build and a real browser:

```bash
npm run build && npm run start          # 3200, production
# DevTools → Network → filter _rsc → load /today
#   expect one request per ready row: /vocab/<id>?from=today&_rsc=…
#   expect NO request for a row drawing the skeleton
# tap a row → expect zero new requests, instant paint
# wait >300s, tap again → expect one request (proves the window)
ss -ltnp | grep 3200 && kill <pid>      # MANDATORY
```

That last line is not housekeeping. Leaving a **production** server on 3200 is the
trap `CLAUDE.md` documents: `reuseExistingServer: true` adopts it,
`/kitchen-sink` is gated off in production, and all 18 layout tests fail with a
"waiting for locator" timeout that reads as a layout regression.

## Measured, 2026-08-11

Production build on 3200, real database, a minted session, 375×667, against the
live card for 2026-08-11 (six words, all `ready`). Both legs are the same kind of
client-side navigation to the same kind of page, in the same browser:

| Start | Prefetch kind | Requests for the word on tap | Paint |
|---|---|---|---|
| `/today` (this change) | `FULL` | **0** | **73 ms** |
| `/vocab` (unchanged) | `AUTO` | 1 | 855 ms |

Six distinct `/vocab/<id>?from=today&_rsc=…` prefetches fire while `/today` idles —
one per ready row, all six in the viewport because the card does not scroll.

The baseline leg is the useful part: `/vocab` **also** prefetches, seven times, and
is still 855 ms. That is the `AUTO`-is-only-`stale` branch of
`getPrefetchEntryCacheStatus` demonstrated rather than argued — an `AUTO` payload
reuses the loading boundary and goes back for the data. Confirms the mechanism this
whole design rests on, and confirms that the win comes from the *kind*, not from
prefetching at all.

One request does occur during the fast tap — `/vocab/<id>/chat?from=today` — which
is the detail page's own "Practise this word" link auto-prefetching the *next* hop
after arrival. Not on the critical path.

Also verified: `npm run typecheck`, `npm run lint`, `vocab:check`, `nav:check`,
`dates:check`, `vocab:db`, and `npm run test:layout` (80 passed, 10 skipped —
the `DW_TEST_SESSION` specs).
