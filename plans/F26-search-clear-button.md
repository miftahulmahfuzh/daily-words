# F26 — A clear mark inside the two search fields

**Card:** [daily-words#5](https://github.com/miftahulmahfuzh/daily-words/issues/5)
**Round 1**, 2026-09-01.

The user's words: *"add an X button in vocab search field and journal search
field. this way user can reset their query quickly."*

---

## 0. The decision this reverses, and why it is a comment rather than an [R]

`vocab-search.tsx` and `journal-search.tsx` carry the same paragraph, verbatim,
and it is a decision rather than an oversight — F19 §2a wrote it and F25 copied
it across:

> No clear button of its own: `type="search"` gives iOS Safari a native one, and
> the no-matches empty state carries a "Clear search" action for everyone else.
> A third affordance inside a 40px field is chrome, not help.

**It is not in the roadmap.** `grep` over `ROADMAP_v0.1.0.md` finds no
Reconciliation Decision about a clear control; [R19] governs the *height* budget
these fields sit in and says nothing about what is drawn inside one. So this is a
component-level call being revisited by the person who asked for it, and it needs
an amended comment — the shape `composer.tsx` and `app/api/journal/route.ts`
already use — not a roadmap amendment. The original paragraph is kept above the
amendment rather than deleted.

**What the original argument got right, and where it has a hole.** Both premises
are true and both are about the *empty* field:

- iOS Safari does draw `::-webkit-search-cancel-button`. So does desktop Safari
  (focused, non-empty) and desktop Chrome (non-empty). **Chrome on Android draws
  nothing, and Firefox has never drawn one on any platform.** So the native
  control is not a floor, it is a coin flip decided by the user's browser.
- The empty state's "Clear search" action is real, and it is exactly as far as
  it goes: it exists *only when nothing matched*. A query that **does** match —
  the ordinary case, the one the field is for — puts no clear affordance on
  screen at all on the majority of browsers.

So the reset costs a select-all-and-delete precisely when the field is working.
That is the hole, and it is the whole of the case for reversing.

**The "chrome, not help" clause survives intact**, because §2 below only draws
the mark when the field has a value. An empty field is byte-for-byte as clean as
it is today, which is the state F19 was defending and the state the design file
draws.

## 0a. What the design source of truth actually says

[R18] makes `design/from-claude-design/Daily Words.dc.html` authoritative for
layout. It draws the collection's search field twice — line 309 and line 688 —
and **both are the empty state**, carrying the placeholder `Search 227 words`.
There is no filled-state artboard anywhere in the file. So the design does not
contradict this change; it is silent on it, and the empty field it does draw is
unchanged.

---

## 1. Approaches considered

### 1a. Where the control lives

| | Approach | Verdict |
|---|---|---|
| **A** | Inline the button in both search components | **lost** |
| **B** | One `ClearButton` in `components/ui/`, used from both `trailing` slots | **chosen** |
| **C** | An `onClear` prop on `TextInput` itself | **lost** |

**B wins on Convention and Scope.** `TextInput`'s `trailing` slot already exists
and its own doc says what it is for — *"Rendered inside the field, after the
input. **May be a control.**"* — while `leading` says "A mark, not a control".
The slot was specified for exactly this and has had no user until now.

**A lost on Convention read the other way.** The two search components are
deliberately near-duplicates — F25's `journal-search.tsx` header enumerates the
two differences from its vocab twin and keeps everything else identical — so
duplicating *presentation* between them is in keeping. What is not in keeping is
duplicating the accessible name and the tap geometry, which are the two things
that drift silently and that no check in this repo can see.

**C lost on Scope and Reversibility.** `src/components/README.md` is a frozen
contract; widening `TextInput` puts a clear affordance within reach of every
field in the app, including `/vocab/new`'s 30px word field, for the benefit of
two callers. B adds a component and removes nothing.

### 1b. The glyph

| | Approach | Verdict |
|---|---|---|
| **A** | `✕` in the mono face at `text-ink-3`, mirroring the leading `/` | **chosen** |
| **B** | The word `CLEAR`, mono uppercase | **lost** |
| **C** | An inline SVG icon | **lost** |

**C lost outright and without argument: there is not one `<svg>` in `src/`.**
This app draws its marks as characters — `calendar-cell.tsx` already uses `✕`
(U+2715) for a missed day and `badge-row.tsx` uses `×` for a count. A draws the
same codepoint the repo already chose for a cross.

**A also answers the "chrome" objection on its own terms.** At
`font-mono text-mono-lg text-ink-3` the mark reads as the field's own punctuation
opposite the leading `/` — one mono mark at each end, same tone — rather than as
a second control bolted into the row.

**B is the repo's language for a small text action** (`BackLink`,
`DeleteWordButton`, `ShareButton` are all `font-mono text-mono-sm tracking-nav`
uppercase) and it lost on two counts: the card asks for an X in its own words,
and `CLEAR` costs ~44px of the input's width against a glyph's ~12 in a field
that is 331px wide at 375px.

### 1c. The native `::-webkit-search-cancel-button`

**This is the part that would have shipped broken.** Chrome and Safari draw
their own clear control for `type="search"`, so a trailing button of ours puts
**two** X marks side by side on the desktop browsers the author reviews in.

| | Approach | Verdict |
|---|---|---|
| **A** | Suppress the native one in `@layer base` | **chosen** |
| **B** | Draw ours only where the native one is absent | **lost** |
| **C** | Drop `type="search"` | **lost** |

**B is not expressible.** There is no feature query for "this engine draws a
search cancel button"; it would be a UA sniff, which is worse than the bug.

**C loses the semantics that made `type="search"` right in the first place** —
the iOS keyboard's Search return key comes from `enterKeyHint`/`inputMode`, but
the field's role and the browser's own search-history affordances come from the
type. It also does not remove the need for A on any other field, it just moves it.

**A is total and provably narrow**: `grep 'type="search"' src/` finds exactly two
inputs, and both are these. The rule goes in `@layer base` for the reason
`globals.css` states twice already — unlayered CSS outranks every utility class —
even though a pseudo-element has no utility competitor here. Consistency, not
necessity.

### 1d. Always drawn, or only when the field has a value

**Only when non-empty.** The card asks for a way to *reset a query*; an empty
field has no query. Drawing it always would spend the exact objection F19 raised
for no gain, and would narrow the placeholder for nothing.

The cost is that the input's width changes by 50px when the first character is
typed. Text in the field is left-aligned, so nothing already on screen moves;
this is the behaviour of every native search field and of the empty-state action
it sits beside.

---

## 2. The change

### 2a. `src/components/ui/clear-button.tsx` — new

A presentational `<button type="button">`, no state, no ref of its own. Props:
`onClick` and `label` (the accessible name — "Clear search" at both call sites
today, but the component does not assume it).

- `h-10 w-10` — a **40×40** hit area. The repo's touch floor is 44px
  (`back-link.tsx`, `chip-select.tsx`, `delete-word-button.tsx` and five more all
  say so), and it **cannot be met inside this field**: the field is `h-10` on
  both screens, and a 44px child would overflow its border box by 2px top and
  bottom. 40×40 is the largest square the field admits, and it is larger than the
  36px `+ Line` pill that F25 ships on the header directly above it. Recorded
  here rather than silently taken — this is the one measurement of the change
  that misses a repo convention.
- `-mr-3.5` cancels the field's own right padding, so the button's edge is flush
  with the inner border and the glyph sits centred 20px in. Without it the glyph
  floats 34px from the edge and reads as unaligned.
- No `:active` state of its own: `globals.css` gives every `button` an
  `opacity: 0.6` active state and removes the tap highlight, and this is a
  `button`.

### 2b. Both search components

Each gains a `useRef<HTMLInputElement>`, passes it to `TextInput`'s `ref` (React
19 passes `ref` as an ordinary prop; the type declaration is already on
`TextInput` for `/vocab/new`), and renders `trailing={value ? <ClearButton …/> :
null}`.

The handler is `onChange(""); inputRef.current?.focus()` — two lines, in that
order. Focus returns to the field because clearing is what a user does *before
typing something else*, which is what both native implementations do, and because
`composer.tsx` records that iOS only honours `.focus()` inside the gesture that
asked for it — a click handler is inside that gesture.

**The invariant in both doc comments survives and is restated rather than
dropped:** the components still hold no state, read no router and write no URL. A
ref is none of those three. That paragraph is what F19 exists for and it is not
being weakened.

### 2c. `src/app/globals.css`

```css
@layer base {
  input[type="search"]::-webkit-search-cancel-button {
    -webkit-appearance: none;
    appearance: none;
  }
}
```

### 2d. `src/components/README.md`

One row for `ClearButton` in the kit table, and an F26 note recording 2a's 40px
decision so the next reader of the 44px floor finds the exception where the other
exceptions are.

### 2e. What is deliberately **not** changed

**The empty state's "Clear search" action stays, on both screens.** The card
raised it as an open question — *"whether the existing 'Clear search' empty-state
action stays or becomes redundant"* — and the narrow reading wins: the two serve
different moments. The field's mark is reachable while results are on screen; the
empty state's action is a full-width control where the eye already is when nothing
matched, and `vocab-list.tsx` carries a comment explaining why it is a callback
rather than a link that would have to be rewritten to delete it. Removing it is a
deletion the card did not ask for. *The other reading — that one clear affordance
per screen is enough — is recorded on the card.*

**The kitchen-sink journal fixture's field stays inert.** It is a static replica
because a real `JournalSearch` needs an `onChange` and the page is a server
component. §3 extends it rather than replacing it.

---

## 3. Verification

**The repo has no `.github/workflows/`,** so `land` will report `gate: none` and
the gate is derived from the repo itself:

```
npm run typecheck
npm run lint
npm run build
npm run test:layout
npm run vocab:check
npm run journal:check
```

`test:layout` is the one that matters, and the card named the right worry: it
flagged the field's slack at 375px with a trailing control as **unmeasured**. Two
things make it measurable rather than argued:

- **No height changes at all.** The button is a child of a row that is already
  40px tall, so every one of the eighteen no-scroll assertions and F25's
  single-row header assertion are testing the same geometry they tested before.
- **The width is measured, not estimated.** `/kitchen-sink/journal` gains
  `?q=<text>`, which draws the replica field with a value and the clear mark, and
  `no-scroll.spec.ts` gains one assertion at 375px: the search row is a single
  40px line and the mark is on it. The vocab field has no kitchen-sink route, but
  it is the same component in the same 22px gutter at the same height, so the
  geometry the fixture measures is the shared geometry.

`vocab:check` and `journal:check` assert search *rules* and touch no component;
they are in the gate to prove this changed neither.
