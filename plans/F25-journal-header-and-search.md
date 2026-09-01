# F25 — The journal grows a header, an add button and a search

**Card:** [daily-words#3](https://github.com/miftahulmahfuzh/daily-words/issues/3)
**Round 1**, 2026-09-01.

Numbered **F25**, not F24: card #2 was in flight in a parallel session and took
that number for `plans/F24-pane-scroll-memory.md`. The two met in a merge
conflict on `journal-feed.tsx` and `kitchen-sink/journal/page.tsx`, and both
sides are kept — its `restoreScroll` sits on the `ScreenBody` this plan
rewrote.

Two things the user asked for, in their words: *"user can search journal
quickly, and if user wants to add a new journal, they can click a button on top
right."*

---

## 0. The decision that had to be made before any of the others

`/journal` is the one screen in the app whose add affordance is not a button,
and that is not an accident of implementation — it is written into the roadmap
twice and into `composer.tsx`'s own header comment:

> **[R3]** … the journal composer is a permanent textarea at the top of
> `/journal`, explicitly *"not behind a button, sheet, or FAB"*.
>
> **[R21]** … F10's own always-present textarea is **unchanged and still
> correct**.

`CLAUDE.md`'s authority order puts § Reconciliation Decisions above everything,
including the rest of the roadmap, and says to stop and report a discrepancy
rather than guess. So the card is not a restyle request; it asks for the one
thing the highest authority in the repo forbids.

**Resolution: the roadmap is amended, not ignored.** The precedent is [R22],
which says so out loud — *"The table is authoritative; it is also amendable, and
this is what an amendment looks like"* — and which was itself written from a
direct user request recorded in `plans/F11-F18-BRIEF.md`. This card has exactly
that provenance: the user asked for it in the session that opened the card. So
this plan writes **[R23]** into the roadmap in [R22]'s shape, and amends
`composer.tsx`'s comment rather than deleting it, the way
`app/api/journal/route.ts` amends its own no-constraint paragraph rather than
replacing it.

Leaving the amendment out was rejected outright: it would leave the repo's
highest authority contradicting its own code, and that is precisely the drift
no check in this project can see, because every check measures code and none
reads prose.

**What [R23] does *not* do:** it does not reinstate a floating "+". [R21]'s
ruling that `add-word-fab.tsx` is not built, and that the app shell takes no
`showAddButton` prop, is untouched. The journal's add control is a pill on the
journal's own header, which is the same shape as `/vocab`'s and the same shape
[R21] chose over a FAB.

---

## 1. Approaches considered

### Where the composer goes

| | A — a `/journal/new` route | **B — inline expand (chosen)** | C — a `<dialog>` |
|---|---|---|---|
| Convention | mirrors `/vocab/new` exactly | mirrors nothing; new shape | breaks a stated rule |
| Scope | new route + page + layout entry; the optimistic insert is lost across the navigation; the duplicate flow has to survive a route change | one boolean in `JournalFeed`; `Composer` unchanged in substance | a second `<dialog>` in the app |
| Verifiability | `journal-duplicate.spec.ts` rewritten around navigations | one extra tap in `openJournal` | the spec asserts `dialog[open]` is **0** |
| Reversibility | diff across ~8 files | one component | — |

**A lost on scope and verifiability.** The optimistic insert is the screen's
promise — `journal-feed.tsx` says a spinner where the row should be *"would
break that promise on exactly the connection where it matters — a phone on a
train"* — and a route boundary between the composer and the list deletes it.

**C lost on a rule, not on taste.** *"There is exactly one modal in the app"*,
and [S4]'s duplicate warning is specified in `limits.ts` as *"a block under the
composer … **not** a modal"*, asserted by `journal-duplicate.spec.ts` as
`dialog[open]` having count 0.

### Whether the search runs in the browser

| | A — client-side, vocab's local mode | **B — server-side (chosen)** |
|---|---|---|
| Payload | a `JournalEntryDto` carries up to `JOURNAL_TEXT_MAX` = 1000 characters of text plus an insight of ~600. At vocab's 1,500-row ceiling that is ~1.5 MB, against the ~330 kB `VOCAB_CLIENT_INDEX_MAX` was sized for | one page, as today |
| Round trips | none per keystroke | one per 250 ms of typing |

The Collection can ship its whole collection because a `VocabListItem` is
**~220 bytes** — the number is written into `lib/vocab/search.ts` and the
ceiling was derived from it. A journal entry is an order of magnitude larger,
so **the local branch does not transfer** and `/journal` takes vocab's *server*
mode only: `q` on the query, a debounced `router.replace`, and the existing
cursor untouched.

That makes `lib/journal/search.ts` a smaller module than its vocab sibling —
`searchNeedle` and the documented transcription of the SQL, with no
`filterBySearch` and no ceiling, because nothing filters in the browser.

### What happens when the composer opens over an active search

**Chosen: opening the composer clears the query.** One sentence explains it —
you are adding a line, not looking for one — and it removes a whole class of
question: a save can never land under a filter, so the optimistic row is always
one the list should show, and the top block never holds the search field and
the composer at once, which is what keeps [R19]'s budget.

**The loser:** preserving the query across a compose. It reads tidier and costs
an edge case that has no good answer — an optimistic row that does not match
the filter it is being inserted into, which is either a lie about the query or
a line the user just wrote and cannot see.

---

## 2. The trap this design walks into, found by reading

`Composer` restores a `sessionStorage` draft **on mount**, and the comment says
why: *"iOS Safari discards a backgrounded tab aggressively. Switching to the
Kindle app to check the wording of the line being copied is the expected way to
use this screen."*

Collapsed by default, the composer never mounts, so that restore never runs and
the paste is silently stranded behind a button. Nothing throws; the user simply
loses the thing the feature exists to protect.

**Fix:** `JournalFeed` opens the composer on mount when a draft exists. That
puts `JOURNAL_DRAFT_KEY` and its try/catch discipline in two files, so the
read/write/clear moves into `lib/journal/draft.ts` and both call it. `hasDraft`
is what the feed asks; `journal:check` asserts the module is the only place
under `src/` that names the key.

Hydration: the check is an effect, not a `useState` initialiser —
`sessionStorage` does not exist during the server render and an initialiser
that reached for it would be a hydration mismatch. One collapsed frame, then
open.

---

## 3. The changes

| File | What |
|---|---|
| `ROADMAP_v0.1.0.md` | **new [R23]**, amending [R21]'s last paragraph |
| `src/lib/journal/search.ts` | **new** — `JOURNAL_SEARCH_MAX_CHARS`, `searchNeedle`, the SQL transcription in prose |
| `src/lib/journal/draft.ts` | **new** — `readDraft` / `writeDraft` / `clearDraft` / `hasDraft` |
| `src/lib/journal/links.ts` | `journalListHref({ q })` |
| `src/lib/journal/schemas.ts` | `q` on `listJournalQuerySchema` |
| `src/lib/db/queries/journal.ts` | `matchesQuery` over `text` and `source_note`; `q` on `listEntries` |
| `src/app/api/journal/route.ts` | thread `q` |
| `src/lib/journal/client.ts` | `listEntries(cursor, q)` — **page 2 must carry the filter** |
| `src/app/(app)/journal/page.tsx` | read `?q=`, pass `serverQ` |
| `src/app/(app)/journal/journal-feed.tsx` | header + pill + search + compose toggle + the prop-change sync |
| `src/components/journal/journal-search.tsx` | **new**, mirroring `vocab-search.tsx` |
| `src/components/journal/composer.tsx` | use `draft.ts`; amend the [R3] comment; take `onClose` |
| `src/components/ui/pill.tsx` | `onClick` → renders a `<button>` |
| `src/components/README.md` | the `Pill` row |
| `src/app/kitchen-sink/journal/page.tsx` | the fixture grows the same top block |
| `scripts/check-journal.ts` | a new section |
| `tests/e2e/journal-duplicate.spec.ts` | `openJournal` taps the pill |
| `CLAUDE.md` | the journal paragraph |

### The quiet bug to avoid

`Load more` under an active search must send `q`. Without it page 2 is the
unfiltered list appended to a filtered page 1, and the cursor makes it look
correct: the ordering is `(created_at, id)` either way, so the rows arrive in
the right order and simply do not belong. `journal:check` asserts the client
builds `q` into the URL.

---

## 4. Verification

`npm run typecheck`, `npm run lint`, `npm run build`, `npm run journal:check`,
`npm run test:layout`, and `DW_TEST_SESSION=… npm run test:layout` for
`journal-duplicate.spec.ts`.
