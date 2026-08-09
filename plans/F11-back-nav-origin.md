# F11 — Back navigation returns to its origin

`/vocab/[id]` currently hardcodes `<BackLink href={vocabListHref()} label="Collection" />`.
Open a word from today's card, press back, and you land in the Collection — a
screen you were never on. In the user's words:

> if i opened a detailed vocab page from today's card, when user click back from
> it, we should go back to today's card, not to Collection (if user opened
> detailed vocab page from Collection, then in this case back should point to
> Collection)

This plan adds a **closed, whitelisted origin token** to the word-detail URL,
resolved server-side into a `{ href, label }` pair, threaded forward through the
practice-chat hop, and degrading to "Collection" whenever it is absent or
unrecognised. It supersedes nothing in F1–F10; it *extends* the F4 contract in
`src/lib/vocab/links.ts` (the file's own comment already claims ownership of
"every URL into the vocab surface, in one place"), and it changes one line of
F6's `chat-client.tsx` from computing its own back href to receiving one.

Prerequisite for nobody. F16–F18 must read §2 D9 before adding share URLs.

---

## 1. Decisions

### D1 — The origin travels as `?from=<token>` in the URL, resolved server-side against a closed whitelist

Four mechanisms were considered. The table is the argument; the paragraphs after
it are the parts that are not one-liners.

| | Cold launch at a deep URL | Can produce a destination *label* | Survives reload | Survives the chat hop | Client JS | Verdict |
|---|---|---|---|---|---|---|
| **(a) `?from=` + whitelist** | degrades to Collection | yes, from the whitelist | yes | yes, by threading the param | none on the real page | **chosen** |
| (b) `router.back()` / `history.back()` | **no** — empty history stack | **no** — history exposes no name | n/a | by accident only | required | rejected |
| (c) `useSelectedLayoutSegments` / `Referer` | no | only via a whitelist anyway | no | no | none | rejected |
| (d) parallel / intercepting routes | **no** — falls back to the real route, which still needs (a) | no | no | no | required | rejected |

**Why not (b).** `src/components/layout/back-link.tsx` already documents the
decision this would reverse, verbatim:

> A supplement to the iOS edge-swipe gesture, never a replacement — it is a real
> `<Link href>` so it also works when the app is launched cold at a deep route,
> which a `history.back()` button does not.

`/vocab/[id]` renders `<Screen>` **without** `tabs`, so there is no tab bar on
that screen. A back control that no-ops on a cold launch would leave a user who
opened a pasted or shared URL with no way out of the page except the browser
chrome. Separately, `history` cannot name where it goes, so the label would have
to collapse to a generic "Back" for every origin — which the requirement
forbids. And the history stack is not trustworthy here: `vocab-search.tsx`
calls `router.replace()` on every keystroke, so the entry *behind* a word opened
from a search result is not the entry the user thinks it is.

**Why not (c).** `useSelectedLayoutSegments` reports the segments of the route
being rendered, not the route departed from; it cannot answer this question at
all. The `Referer` header can — `headers()` is readable from this server
component — but it is (i) absent on a cold launch and under strict referrer
policies, (ii) attacker-controlled, so it needs the same closed whitelist as (a)
and buys nothing in exchange, and (iii) **not part of the router cache key**.
`/vocab/abc` is one URL whether it was reached from Today or from Collection, so
a cached RSC payload rendered with `Referer: /today` can be replayed for a visit
from Collection and show the wrong label. `?from=` makes the origin part of the
address, which is precisely what makes the two visits distinct.

**Why not (d).** Intercepting routes are the canonical Next.js answer to
"a list item opens over its list", and their back affordance is `router.back()`
— so they inherit (b)'s cold-launch failure and still need the real route
underneath. They also imply a modal presentation, which the roadmap locks out:

> ### Vocab detail is a page, not a modal
> Decided deliberately. A full-page modal on iOS Safari loses the edge-swipe
> back gesture, requires hand-rolled scroll locking, and breaks fixed-height
> layout math when the URL bar collapses.

And they would need two interception sites — `/today` and `/vocab` are different
branches of the layout tree — plus `default.tsx` files in both, to produce a
label the whitelist gives away for free.

### D2 — The whitelist is a `Record<WordOrigin, BackTarget>` and the input string is never interpolated into an href

`parseOrigin()` returns a member of the union or `null`. `backTarget()` maps a
union member — never a string — to a literal `{ href, label }` from a single
object in `src/lib/vocab/links.ts`. There is no code path anywhere that builds
an href *out of* the query value, so `?from=https://evil.example`,
`?from=//evil.example`, `?from=/today` and `?from=javascript:alert(1)` are all
simply not union members and all resolve to the default. An open redirect is not
mitigated here; it is **structurally impossible**.

Two consequences worth stating because they are easy to break later:

- `vocabDetailHref(id, origin?)` types `origin` as `WordOrigin | null | undefined`,
  never `string`. A component cannot accidentally pass user input through it —
  that is a type error.
- **A repeated `?from=` is sampled, not discarded — measured 2026-08-09, and
  this plan said otherwise.** §4 below claims "a repeated param arrives as an
  array and is discarded rather than sampled — one `from` or none". On Next
  15.5.23 that is false: `?from=today&from=discover` reaches the page as the
  string `"today"` and renders `TODAY`; `?from=discover&from=today` renders
  `DISCOVER`. First occurrence wins, and `useSearchParams().get()` agrees.
  `parseOrigin`'s array branch is therefore unreachable from both callers.
  Recorded rather than corrected in place, because the next person to reason
  about duplicated params should find the measurement.

  **This costs nothing, and that is the point of the whitelist.** Whichever
  occurrence Next picks still has to be a union member, so a repeated param can
  only choose between two legitimate origins — it cannot smuggle a third thing
  past `backTarget`. Rejecting duplicates would mean reading the raw query
  string through `headers()` for a purely cosmetic guarantee. Not taken.
- The whitelist must be probed with `Object.hasOwn`, a `Set`, or a `Map`, not
  with a bare `origins[value]` index. `("toString" in {})` is `true` and
  `({})["constructor"]` is a function; a naive lookup would treat `?from=toString`
  as a hit and hand `backTarget` something that is not a `BackTarget`.
  `scripts/check-nav.ts` asserts these three strings specifically.

### D3 — The default is "Collection", and it is reached three ways, all of which must look identical

No `?from=` (cold launch, a shared or pasted URL, a bookmark), an unrecognised
`?from=`, and `?from=collection` all resolve to `{ href: "/vocab", label: "Collection" }`.
That is today's behaviour, unchanged, which is what makes this feature
strictly additive: every URL that works now keeps working and keeps saying the
same thing. `vocabDetailHref(id)` with no origin still returns exactly
`/vocab/${id}` — no `?from=collection` is appended — so shared and copied URLs
stay clean and the "no origin" case is the one that is cheapest to produce.

### D4 — The origin set, in full

Every inbound link to `/vocab/[id]` that exists in the repository today:

| Origin token | Producer (file:line today) | Destination | BackLink label |
|---|---|---|---|
| `today` | `src/components/daily/daily-card-row.tsx:30` | `/today` | `Today` |
| `collection` | `src/components/vocab/vocab-list.tsx:109` | `/vocab` | `Collection` |
| `discover` | `src/components/vocab/discover-panel.tsx:256` | `/vocab?tab=discover` | `Discover` |
| `new` | `add-word-form.tsx:207` (Just added), `add-word-form.tsx:231` (duplicate → Open it), `enrichment-card.tsx:96` (merged → Open it), `enrichment-card.tsx:187` (failed → Open it) | `/vocab/new` | `Add a word` |

`collection` is the default and is therefore also what an absent or bad token
produces. It is still a *named* member of the union so that `vocab-list.tsx` can
state it, and so the check script can distinguish "absent" from "explicit" from
"garbage" while asserting all three land in the same place.

The `new` label is the exact `Eyebrow` string that screen renders — "Add a
word". Uppercased by `BackLink` it is `ADD A WORD`, ten characters, the same
width as the `COLLECTION` that slot already draws, so no new width risk at 320px.

### D5 — `/vocab?tab=discover` is a distinct origin from `/vocab`

It is not the same screen. Returning a Discover user to the Mine tab throws away
the "Kept from Discover" strip they were building — the very state
`discover-panel.tsx` is designed around ("a Discover sitting is several words
long, and leaving the screen after each one throws the queue away") — and the
label has to read "Discover" because that is the tab they will land on. This is
the same reasoning [R17] used when it made the tab an address (`?tab=`) rather
than component state: if the tab is part of the URL, it is part of where you
came from.

The `discover` entry in the whitelist is written as `vocabListHref({ tab: "discover" })`,
not as the literal `"/vocab?tab=discover"`, so the two cannot drift.
`check-nav.ts` asserts they are equal.

### D6 — The chat is **not** an origin; it *inherits* the word's origin

Today → word → chat → back → back must land on Today. That works by threading
the same token one hop further: `vocabChatHref(id, origin)` produces
`/vocab/{id}/chat?from=today`, and the chat's back link points at
`vocabDetailHref(id, origin)` — `/vocab/{id}?from=today`. The chat's own label
stays `Back`, unchanged, because the chat always returns to its word.

`chat` is deliberately **absent** from the union. `/vocab/[id]/chat` reaching
`/vocab/[id]` is always a backward hop, so naming the chat as the word's origin
would make back a two-node cycle — word → chat → word → chat — with no exit.
The concrete place that trap is waiting is `chat/page.tsx:62`, the not-ready
`EmptyState` whose action is labelled "The word": it must carry the *inherited*
origin, not `from=chat`, or a word whose enrichment has not landed becomes a
navigational dead end. If some future feature ever links from a chat to a
**different** word's detail page (F14's duplicate-merge path is the plausible
one), `chat` gets added to the union then, with a real destination behind it.

### D7 — `loading.tsx` gets a client back link; `not-found.tsx` does not

`loading.tsx` and `not-found.tsx` are special files and receive no props, so
neither can see `searchParams` on the server. Left alone, the skeleton would
draw `← COLLECTION` pointing at `/vocab` for as long as the RSC payload is in
flight, and a tap in that window would go to the wrong place.

For `loading.tsx` the answer is a four-line client component,
`src/components/layout/origin-back-link.tsx`, that reads `useSearchParams()` and
calls the same pure `parseOrigin` / `backTarget` — wrapped in `<Suspense>` with
the plain `BackLink href={vocabListHref()} label="Collection"` as its fallback,
so the build never depends on how Next treats `useSearchParams()` inside a
Suspense fallback. The real page keeps rendering a plain server-side `BackLink`;
it has to parse `searchParams` anyway for the chat button (D6), so making the
page's own link client-side would buy nothing and cost a boundary.

`not-found.tsx` keeps its "Collection" action. It is reached by a malformed id, a
deleted word, and another account's word; in all three the word the origin
pointed at is not there, and the Collection is the honest destination.

### D8 — Deleting a word still lands on the Collection

`delete-word-button.tsx:60,69` calls `router.replace(vocabListHref())` and stays
that way. [R1] refuses to delete a word that has ever been carded, so a
deletable word cannot have been opened from Today; and for the other origins the
surface the user came from no longer contains the thing they came for. Returning
to `/vocab/new` or to the Discover tab after a delete would be returning to a
stale list.

### D9 — The share pages (F16–F18) do not participate

The public share routes live **outside** the `(app)` group (the brief calls this
"the single most likely mistake across F16–F18"), so they render their own page
components at their own URLs and never link to `/vocab/[id]` for an anonymous
visitor. There is no `share` origin and F16–F18 must not add one:

- A signed-in owner who opens their own share link and is bounced to
  `/vocab/[id]` arrives with no `?from=` and gets "Collection". Correct — the
  public page is outside the app, and "← Share" would send the owner back out of
  their own collection.
- F17's claim flow ends in `/vocab/[id]/chat` with no origin. Back → the word,
  back again → Collection. For a brand-new user whose collection now holds
  exactly one word, that is the right landing.
- F16–F18 must **not** import `vocabDetailHref` for a public page. The public
  word URL is a different function in a different module, keyed by share slug.

### D10 — The journal detail page does not need this yet

`src/app/(app)/journal/[id]/page.tsx:42` hardcodes
`<BackLink href="/journal" label="Journal" />`, and it is **correct**, because
`/journal/[id]` has exactly one inbound link in the whole repository —
`src/app/(app)/journal/journal-feed.tsx:126`, on `/journal`. One origin needs no
origin parameter. F15's near-duplicate warning also links from `/journal`, and
F18's shared journal entry is a public route outside `(app)` (D9), so neither
adds a second origin.

Two things to record rather than do:

- `journal-feed.tsx:126` builds `` `/journal/${entry.id}` `` as a template
  literal. That is exactly the drift `links.ts` exists to prevent for vocab. The
  moment a **second** file links to a journal entry, extract
  `journalEntryHref` into `src/lib/journal/links.ts` and apply this plan's
  mechanism there. Not before — an abstraction over one call site is noise.
- The trigger condition, written down so the next session recognises it: *a
  second file importing or constructing a `/journal/[id]` URL.*

### D11 — Search terms are not preserved across the hop

A word opened from `/vocab?q=gent` backs out to `/vocab`, not to
`/vocab?q=gent`. Preserving it would mean carrying user-typed text alongside the
token. That is *safe* — `vocabListHref({ q })` builds the string through
`URLSearchParams` on a relative path — but it turns a four-value closed
whitelist into a whitelist plus free text, and it is not what was asked for. If
it is wanted later, it is a **separate** `q` search param on the detail URL,
read and re-emitted through `vocabListHref`, and never folded into the `from`
token. Do not make `from` parseable.

---

## 2. Schema changes

**None.** No migration. Nothing here touches the database, `drizzle/`, or any
`lib/db/queries/` module. Do not run `db:generate`.

---

## 3. Files

| File | Created / modified | Why |
|---|---|---|
| `src/lib/vocab/links.ts` | modified | The whole mechanism: `WordOrigin`, `BackTarget`, the whitelist, `parseOrigin`, `backTarget`, and the two href builders gaining an optional origin. |
| `src/app/(app)/vocab/[id]/page.tsx` | modified | Accepts `searchParams`, resolves the origin once, feeds `BackLink` and `vocabChatHref`. Replaces the hardcoded `vocabListHref()` / `"Collection"` at line 59. |
| `src/app/(app)/vocab/[id]/loading.tsx` | modified | Swaps its hardcoded `BackLink` for `<Suspense><OriginBackLink/></Suspense>` so the skeleton's only escape hatch points where the real page will. |
| `src/components/layout/origin-back-link.tsx` | **created** | The one client reader of `?from=`. Exists solely for `loading.tsx`, which cannot see `searchParams`. |
| `src/app/(app)/vocab/[id]/chat/page.tsx` | modified | Reads its own `?from=`, passes a fully-formed `backHref` down; the not-ready `BackLink` and `EmptyState` action both carry the inherited origin (D6). |
| `src/app/(app)/vocab/[id]/chat/chat-client.tsx` | modified | Takes `backHref: string` instead of calling `vocabDetailHref(entryId)` itself. Stays dumb; no union import in a client bundle. |
| `src/components/daily/daily-card-row.tsx` | modified | `vocabDetailHref(item.id, "today")`. The line the user's complaint is about. |
| `src/components/vocab/vocab-list.tsx` | modified | `vocabDetailHref(item.id, "collection")`. |
| `src/components/vocab/discover-panel.tsx` | modified | `vocabDetailHref(word.id, "discover")` on the Kept-from-Discover rows. |
| `src/components/vocab/add-word-form.tsx` | modified | `"new"` on both the "Just added" `Pill` and `DuplicateNotice`'s "Open it". |
| `src/components/vocab/enrichment-card.tsx` | modified | `"new"` on both "Open it" buttons (merged, and enrichment-failed). |
| `scripts/check-nav.ts` | **created** | The offline check. Whitelist closure, hostile inputs, the round trip, the chat hop. |
| `package.json` | modified | `"nav:check": "tsx scripts/check-nav.ts"`. No `--env-file`, no `--conditions`: nothing here is server-only. |
| `CLAUDE.md` | modified | `npm run nav:check` in the command list, and one Conventions bullet on the origin rule. |
| `src/components/README.md` | modified | One line under the feature notes: `BackLink`'s props are unchanged; on `/vocab/[id]` its `href` and `label` come from `backTarget()`. |

Explicitly **not** touched: `src/app/(app)/vocab/[id]/not-found.tsx` (D7),
`src/components/vocab/delete-word-button.tsx` (D8),
`src/app/(app)/journal/[id]/page.tsx` (D10), `src/app/kitchen-sink/**` (previews;
`kitchen-sink/page.tsx:242` renders `<BackLink href="#" label="Collection" />`
as a swatch and should stay a swatch).

---

## 4. The API, exactly

All of it in `src/lib/vocab/links.ts`. The file keeps its "No `server-only` —
client components import these too" property: nothing added here imports zod,
`server-only`, or anything from `lib/db`.

```ts
/** Where the user was when they opened a word. A closed set. */
export type WordOrigin = "today" | "collection" | "discover" | "new";

/** What a back affordance needs: somewhere to go, and what to call it. */
export type BackTarget = { href: string; label: string };

/**
 * The whitelist. The only place a `?from=` token becomes a URL.
 *
 * `label` is user-visible copy and must name the destination — `BackLink`
 * uppercases it, so keep it title case and short.
 */
const BACK_TARGETS: Record<WordOrigin, BackTarget> = {
  today:      { href: "/today",                            label: "Today" },
  collection: { href: vocabListHref(),                     label: "Collection" },
  discover:   { href: vocabListHref({ tab: "discover" }),  label: "Discover" },
  new:        { href: "/vocab/new",                        label: "Add a word" },
};

/** No origin, and every origin we do not recognise, mean the same thing. */
export const DEFAULT_ORIGIN: WordOrigin = "collection";

/**
 * A `?from=` value from the wire, narrowed or discarded.
 *
 * Takes what Next hands a page: `string | string[] | undefined`. A repeated
 * param arrives as an array and is discarded rather than sampled — one `from`
 * or none.
 *
 * Uses `Object.hasOwn`, not `value in BACK_TARGETS` and not
 * `BACK_TARGETS[value]`: `"toString"` and `"constructor"` are truthy on any
 * object literal and would otherwise pass for origins.
 */
export function parseOrigin(value: string | string[] | undefined): WordOrigin | null;

/** True for the four tokens and nothing else. Exported for the check script. */
export function isWordOrigin(value: unknown): value is WordOrigin;

/**
 * The resolver. Total: every input, including `null`, yields a real target.
 * Returns a fresh object so a caller cannot mutate the whitelist.
 */
export function backTarget(origin: WordOrigin | null | undefined): BackTarget;

/**
 * `/vocab/{id}` — plus `?from={origin}` when, and only when, an origin is given.
 * The no-origin form is byte-identical to what it returned before F11, so every
 * shared, pasted and bookmarked URL keeps working and stays clean.
 *
 * `origin` is typed as the union, never `string`: user input cannot reach it
 * without a cast.
 */
export function vocabDetailHref(id: string, origin?: WordOrigin | null): string;

/** `/vocab/{id}/chat` — carries the *word's* origin one hop further. See D6. */
export function vocabChatHref(id: string, origin?: WordOrigin | null): string;
```

`vocabListHref` is unchanged. Both href builders keep their current one-argument
behaviour, so every existing call site compiles untouched and step 2 below can
land before step 3.

### How the page consumes it

`src/app/(app)/vocab/[id]/page.tsx`:

```ts
export default async function WordPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  ...
  const origin = parseOrigin((await searchParams).from);
  const back = backTarget(origin);
  ...
  <BackLink href={back.href} label={back.label} />
  ...
  <Button variant="filled" href={ready ? vocabChatHref(entry.id, origin) : undefined} ... />
}
```

Note `searchParams` is typed `string | string[]`, wider than the `string` that
`src/app/(app)/vocab/page.tsx` uses for `tab` and `q`, because `parseOrigin` is
the thing that has to be honest about a repeated param.

---

## 5. Implementation order

Each step ends with `npm run typecheck && npm run lint && npm run build` green
and the app behaving — no step leaves a half-threaded param.

**Step 1 — the mechanism and its test, with no callers.**
Add the union, the whitelist, `parseOrigin`, `isWordOrigin`, `backTarget`, and
the optional second argument on both href builders. Write `scripts/check-nav.ts`
and the `nav:check` entry in `package.json`. Nothing in the app changes
behaviour: no producer passes an origin and no consumer reads one.
Gate: `npm run nav:check` passes; the app is byte-identical in the browser.

**Step 2 — the detail page reads the origin.**
`page.tsx` accepts `searchParams`, resolves once, and uses the result for both
the `BackLink` and the chat button. Still no producer emits `?from=`, so every
screen still says "Collection" — but hand-typing `/vocab/<id>?from=today` in the
address bar now flips the label, which is the manual gate for this step.

**Step 3 — the producers.**
In this order, so each one is separately visible: `daily-card-row.tsx` →
`"today"` (this is the bug in the report; verify it by hand before continuing),
then `vocab-list.tsx` → `"collection"`, `discover-panel.tsx` → `"discover"`,
`add-word-form.tsx` and `enrichment-card.tsx` → `"new"`.
Gate: all four origins produce the right label and the right destination.

**Step 4 — the chat hop.**
`chat/page.tsx` accepts `searchParams`, computes
`const backHref = vocabDetailHref(state.vocabEntryId, parseOrigin(from))` once,
and uses it in three places: the not-ready `BackLink`, the not-ready
`EmptyState` action, and the `backHref` prop now passed to `ChatClient`.
`chat-client.tsx` takes `backHref: string` and drops its `vocabDetailHref`
import.
Gate: Today → word → Practise this word → Back → Back lands on `/today`.

**Step 5 — the loading skeleton.**
Create `origin-back-link.tsx`; use it in `loading.tsx` inside a `<Suspense>`
whose fallback is the plain "Collection" `BackLink`. If the build objects to
`useSearchParams()` in that position (see Risks), revert this step alone — every
other step stands without it.
Gate: `npm run build`; then throttle the network and watch the skeleton's label.

**Step 6 — docs.**
`CLAUDE.md` gains the `nav:check` line in the command block and one Conventions
bullet. `src/components/README.md` gains one line. No code changes.

---

## 6. Verification

### `npm run nav:check` — `scripts/check-nav.ts`

Same shape as `check-dates.ts` / `check-discover.ts`: plain assertions, a
`check(label, actual, expected)` helper comparing `JSON.stringify`, a failure
counter, `process.exit(1)`. No database, no network, no environment.

**§1 The whitelist is closed and total.**
- `Object.keys(BACK_TARGETS)` deep-equals `["today","collection","discover","new"]`.
  This is the guard against someone adding an origin without a label, or a
  label without a destination.
- Every `href` starts with `/` and does not start with `//`; contains no `:`,
  no `\`, and no whitespace. (A whitelist entry is the only thing that could
  ever produce an off-site back link, so it is the thing to assert about.)
- Every `label` is a non-empty string, and the four literals are asserted
  exactly: `Today`, `Collection`, `Discover`, `Add a word`.
- `BACK_TARGETS.discover.href === vocabListHref({ tab: "discover" })` and
  `BACK_TARGETS.collection.href === vocabListHref()` — the anti-drift assertion
  from D5.

**§2 `parseOrigin` accepts exactly four strings.**
- The four tokens round-trip to themselves.
- `undefined` → `null`.
- Near misses → `null`: `""`, `"Today"`, `"TODAY"`, `" today"`, `"today "`,
  `"todays"`, `"collections"`.
- **Prototype keys → `null`: `"toString"`, `"constructor"`, `"__proto__"`,
  `"hasOwnProperty"`, `"valueOf"`.** These fail on a naive `in` or bracket
  lookup and are the reason D2 mandates `Object.hasOwn`.
- Hostile → `null`: `"https://evil.example"`, `"//evil.example"`,
  `"http://evil.example"`, `"/today"`, `"../../etc/passwd"`,
  `"javascript:alert(1)"`, `"data:text/html,x"`, `"today?x=1"`, `"today#f"`,
  `"%2Ftoday"`, `"today%00"`, a 4096-character string.
- Arrays → `null`: `["today"]`, `["today","discover"]`, `[]`.

**§3 `backTarget` is total and defaults correctly.**
- `backTarget(null)`, `backTarget(undefined)`, `backTarget("collection")` and
  `backTarget(parseOrigin("nonsense"))` all deep-equal
  `{ href: "/vocab", label: "Collection" }` — the unknown-value case, end to end,
  which is the single most important assertion in this file.
- Each of the four origins maps to its row of the D4 table.
- Mutating the returned object does not change what the next call returns.

**§4 The href builders.**
- `vocabDetailHref("abc")` === `"/vocab/abc"` (no query — D3).
- `vocabDetailHref("abc", null)` === `"/vocab/abc"`.
- `vocabDetailHref("abc", "today")` === `"/vocab/abc?from=today"`.
- `vocabChatHref("abc")` === `"/vocab/abc/chat"`.
- `vocabChatHref("abc", "discover")` === `"/vocab/abc/chat?from=discover"`.
- **The round trip, as a property over all four origins:** for every `o`,
  `parseOrigin(new URL(vocabDetailHref("id", o), "http://x").searchParams.get("from")) === o`,
  and the same for `vocabChatHref`. If this holds, the feature works; if it
  fails, no amount of UI is going to save it.

**§5 The chat hop (D6), simulated.**
Compose the real chain — `vocabDetailHref(id, "today")` → read its `from` →
`vocabChatHref(id, thatOrigin)` → read *its* `from` → `vocabDetailHref(id, …)` →
`backTarget(…)` — and assert the final target is `{ href: "/today", label: "Today" }`.
Then run the same chain seeded with `undefined` and assert it ends at Collection.

**§6 One place builds the param.**
Walk `src/` with `node:fs` and assert the literal `from=` occurs in exactly one
file, `src/lib/vocab/links.ts`. This is the mechanical version of the F4
comment's warning — "a template literal in a fifth file is how it drifts" — and
it is cheap because reading the source tree is neither the database nor the
network. Consumers read the value as a property (`.from`), not as `from=`, so
they do not trip it.

### Manual passes no script can cover

Run with `npm run dev` on 3200, in an iOS Safari viewport (375×667), signed in.

1. **The reported bug.** `/today` → tap a card row → back → **Today**, label
   `TODAY`, and the card is still there.
2. Collection → tap a word → back → **Collection**, `COLLECTION`. Unchanged
   behaviour, and the thing most likely to be broken by a careless step 3.
3. `/vocab?tab=discover` → keep a word → tap it in "Kept from Discover" → back →
   **the Discover tab**, `DISCOVER`, with the kept strip still populated.
4. `/vocab/new` → add a word → tap it in "Just added" → back → **`/vocab/new`**,
   `ADD A WORD`, with "Just added" repopulated from the server's `recentEntries`.
5. `/vocab/new` → type a word already in the collection → "Open it" → back →
   `/vocab/new`. (This is the flow F14 will build on; confirm it is sane now.)
6. **The chat chain.** Today → word → Practise this word → Back → Back → **Today**.
   Repeat from Collection and from Discover.
7. **Cold launch.** Copy `/vocab/<id>?from=today`, quit Safari, paste it into a
   fresh tab. The label reads `TODAY` and tapping it goes to `/today`. Now strip
   the query and repeat: `COLLECTION`.
8. **Hostile URLs, by hand**, because seeing them is worth more than reading an
   assertion: `?from=https://example.com`, `?from=//example.com`, `?from=/today`,
   `?from=toString`. All four render `COLLECTION` pointing at `/vocab`; none
   renders an off-site link; none 500s.
   **`?from=today&from=discover` renders `TODAY`, not `COLLECTION`** — see D2's
   measured note. Both values are union members, so the page picks a legitimate
   origin either way; this is the expectation that was wrong, not the code.
9. **A word that is still enriching**, opened from Today: the "Practise this
   word" button is disabled, back still says `TODAY`. Then let it finish, open
   the chat, and use the not-ready `EmptyState` path by opening
   `/vocab/<pending-id>/chat?from=today` directly — "The word" must return to
   `/vocab/<id>?from=today`, **not** to a chat loop (D6).
10. **The skeleton.** Throttle to Slow 3G, tap a word from Today, and read the
    label on the loading skeleton before the page lands. It must say `TODAY`.
11. **Delete.** Open an uncarded word from Discover, delete it → `/vocab` (D8).
12. **The journal is untouched.** `/journal` → an entry → back → `/journal`.

`npm run typecheck`, `npm run lint`, `npm run build` and `npm run test:layout`
must all pass. `test:layout` is worth running specifically because
`daily-card-row.tsx` is inside the no-scroll fixture's blast radius, even though
this change only touches its `href`.

---

## 7. Risks and open questions

**Unverified — `useSearchParams()` inside a `loading.tsx` fallback.** I did not
run a build with `origin-back-link.tsx` in place. Next 15.5 errors at build time
on `useSearchParams()` outside a Suspense boundary during prerender; the
`(app)` group is dynamic (its layout calls `requireOnboardedUser()`), and step 5
wraps the component in `<Suspense>` regardless, so this should not fire. If it
does, or if the fallback flickers, **revert step 5 only** — the skeleton goes
back to a hardcoded "Collection" link and the cost is a wrong label for the few
hundred milliseconds the RSC payload is in flight. Every other step is
independent of it.

**Unverified — router cache behaviour on back/forward.** The argument in D1
against `Referer` assumes `/vocab/x?from=today` and `/vocab/x?from=collection`
are distinct client-router-cache keys. I believe they are, and Next 15's default
`staleTimes.dynamic` of 0 means a dynamic page is refetched on navigation
anyway, but I did not instrument it. Manual pass 2 immediately after manual pass
1 is the cheap check: if Collection shows `TODAY`, this assumption is wrong and
the resolution is `export const dynamic = "force-dynamic"` on the detail route.

**Unverified — the label at 320px.** `ADD A WORD` is asserted to be no wider
than the `COLLECTION` that slot already renders, by character count, not by
measurement. `BackLink` is mono with `tracking-nav`, so character count is a
good proxy — but the se1 project (320×568) is where to look if it wraps.

**Known asymmetry — the link and the gesture can disagree.** The chat's back
link is a `<Link>`, so it *pushes*: Collection → word → chat → back-link leaves
a stack of `[collection, word, chat, word]`, and an iOS edge-swipe from there
goes to the chat, not to the word's origin. This is pre-existing F6 behaviour
and F11 does not change it. It could be fixed by giving `BackLink` an optional
`replace` prop — but `src/components/README.md` freezes that component's props
at `{ href, label }`, the change alters gesture semantics app-wide, and it
cannot be validated without a physical iOS device. **Open question, deliberately
not taken in F11.**

**`DailyCardRow` hardcodes `"today"`.** It is also rendered by
`/kitchen-sink/today` and `/kitchen-sink`, whose rows will now carry
`?from=today` — harmless in a preview. The real consequence is for F18: a public
shared-daily-card page **cannot** reuse `DailyCardRow` as-is, because its rows
would link into `(app)` and bounce an anonymous visitor to `/signin`. If F18
wants the same visual row, lift the href to a prop rather than adding a
`share` origin (D9).

**`EnrichmentCard` hardcodes `"new"`.** It has exactly one mount point today,
inside `AddWordForm` on `/vocab/new`. F14 is going to rework this component
heavily; if it mounts it anywhere else, the origin must become a prop rather
than stay a literal. Flagged here so F14 does not inherit a silent lie.

**Not addressed by design.** Search terms are lost across the hop (D11).
Scroll position in a long collection is Next's job, not this plan's, and was not
tested. A user who opens a word from Today, masters it, and goes back will find
today's card unchanged — correct, because the card is a record of a day, but it
may read as a stale screen.

**Question for whoever executes this.** Is `Add a word` the right BackLink copy,
or should the `/vocab/new` origin simply not exist and back from a
just-added word go to the Collection? The argument for keeping it is F14's
duplicate flow (manual pass 5); the argument against is that it is the only
origin the user did not explicitly ask for. If it goes, delete the `new` row
from the whitelist, the two producers revert to `vocabDetailHref(id)`, and
§1 of the check script changes by one line — nothing else moves.
