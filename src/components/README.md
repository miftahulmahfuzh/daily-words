# The UI kit — frozen contract for F3–F10

Import per file (`@/components/ui/button`). There is no barrel: an `index.ts`
re-export in an App Router project drags every client component into any server
component that touches it.

**No feature may introduce a new colour, a new type size, or a new radius.** If one
is genuinely needed, add it to `src/styles/tokens.css` or the `@theme` block in
`src/app/globals.css`, regenerate the previews, and say why in the commit.

## Layout

| Export | Path | Props |
|---|---|---|
| `Screen` | `@/components/layout/screen` | `{ tabs?, keyboardAware?, className, children }` |
| `ScreenBody` | `@/components/layout/screen` | `{ top?, scroll?, padded?, className, children }` |
| `ScreenHeader` | `@/components/layout/screen` | `{ eyebrow?, title?, trailing?, className }` |
| `BackLink` | `@/components/layout/back-link` | `{ href, label }` |
| `TabBar` | `@/components/nav/tab-bar` | `{}` — rendered by `Screen`, never by a route |
| `TAB_ITEMS`, `TabKey`, `activeTab` | `@/components/nav/tab-items` | frozen four-item tuple |

Every page is one `Screen` as its outermost element. `Screen` is never nested.
Nothing else may set `height: 100vh`, `position: fixed`, or `overflow` on `<body>` —
those belong to `Screen`, and duplicating them is how the height budget breaks.

## Components

| Export | Path | Key props |
|---|---|---|
| `Card` | `@/components/ui/card` | `{ as?, variant?: raised\|outline\|dashed, padding?: none\|sm\|md\|lg }` |
| `ListRow` | `@/components/ui/list-row` | `{ href?, onClick?, leading?, title, subtitle?, trailing?, layout?: inline\|stacked, muted?, strikethrough?, divider? }` |
| `Button` | `@/components/ui/button` | `{ variant?: filled\|outline\|quiet, size?: sm\|md\|lg, shape?: field\|pill, fullWidth?, href?, type?, loading?, disabled?, onClick? }` |
| `Pill` | `@/components/ui/pill` | `{ href?, tone?: outline\|accent\|ink, mono? }` |
| `Field` | `@/components/ui/field` | `{ id, label, hint?, error?, hideLabel? }` |
| `TextInput` | `@/components/ui/text-input` | `{ variant?: boxed\|underline\|pill, leading?, trailing?, ref?, inputClassName? }` + all `<input>` props |
| `TextArea` | `@/components/ui/text-area` | all `<textarea>` props |
| `EmptyState` | `@/components/ui/empty-state` | `{ title?, body, action? }` |
| `Eyebrow`, `Meta`, `Prose` | `@/components/ui/text` | see file |
| `ChatBubble`, `ChatBubbleTyping` | `@/components/ui/chat-bubble` | `{ role, eyebrow?, state?: sent\|pending\|failed }` |
| `BadgeRow` | `@/components/ui/badge-row` | `{ label, count? }` |
| `LevelPill` | `@/components/ui/level-pill` | `{ kind, label, tier, tierCount }` |
| `CalendarCell`, `CalendarMarkGlyph` | `@/components/ui/calendar-cell` | `{ day, mark, isToday?, href?, accessibleDate? }` |
| `Tabs` | `@/components/ui/tabs` | `{ items: { label, href, active }[] }` |
| `ToggleRow` | `@/components/ui/toggle-row` | `{ label, hint?, armedLabel?, checked, onChange, confirmOn? }` |
| `Spinner` | `@/components/ui/spinner` | `{ size?: 16\|20\|24 }` |
| `Skeleton` | `@/components/ui/skeleton` | `{ width?, height? }` |
| `DailyCard` | `@/components/daily/daily-card` | `{ items: DailyCardItemView[], shortCardAction? }` |
| `NoCardYet` | `@/components/daily/no-card-yet` | `{ action }` |
| `DayStrip` | `@/components/daily/day-strip` | `{ days: DayStripItem[], label? }` |
| `Chip`, `ChipSelect` | `@/components/profile/chip-select` | `{ pressed?, onClick? }` / `{ options, selected, onToggle }` |
| `OptionRows` | `@/components/profile/option-rows` | `{ options: { value, label, gloss? }[], value, onChange }` |
| `ChatTranscript` | `@/components/chat/chat-transcript` | `{ messages, timezone, pending, thinking }` |
| `ChatComposer` | `@/components/chat/chat-composer` | `{ value, onChange, onSend, busy, error }` |
| `TurnMeter` | `@/components/chat/turn-meter` | `{ used }` |
| `RoundDivider` | `@/components/chat/round-divider` | `{ round, startedAt, timezone }` |
| `VerdictCard` | `@/components/chat/verdict-card` | `{ content }` |

`Chip` is the tappable sibling of `Pill` — same radius and tones, a real
`<button>` with `aria-pressed` and a 44px floor. `ChipSelect` reports *which*
chip was tapped and never computes the next selection; the caller applies
`toggleCapped` / `toggleExclusive` from `@/lib/profile/selection` inside a
functional `setState`. Deriving it inside the component loses taps that land
before React re-renders — six rapid taps produced three selections.

Types and utilities live in `@/lib/ui/types`, `@/lib/ui/cn` and `@/lib/ui/layout`.

## Where this differs from `plans/F2-design-system.md`

F2 was written before the Claude Design output existed. ROADMAP [R18] makes that
output authoritative, so several of the plan's §6 and §10 names describe components
the design does not contain. The differences, and why:

| F2 §10 said | Reality | Ruling |
|---|---|---|
| `components/icons/index.tsx`, 8 SVGs | **Deleted from scope.** | [R18]: "No icons anywhere." The tab bar is four words and a dot; ticks and crosses are text glyphs. |
| `SegmentedTabs` | `Tabs` | The design uses underline tabs, not an iOS segmented control on a sunken track. Same job, correct drawing. |
| `BadgeChip` (wrapping pills) | `BadgeRow` (ruled list) | The design draws a list. It is also the better answer to F2's own rule against truncating a badge name — "No Weekend Without Ration Card" is not a chip. |
| `LevelPill` tier ramp | plain accent pill | The design has no ramp. The tier survives in the `title` attribute only. |
| `ConfirmSheet` (native `<dialog>`) | `ToggleRow` two-tap arm | The user's call on the roadmap's open question #1. No modal anywhere in the app. |
| `PageHeader { title, subtitle, trailing }` | `ScreenHeader { eyebrow, title, trailing }` + composition | Every screen's header differs; one frozen 48px bar cannot express them. |
| `Screen { title, headerTrailing, back, padded }` | `Screen { tabs }` + `ScreenBody` | F1 shipped this split and [R19] depends on it. |
| `LAYOUT.dailyCardH: 347`, `todayFixedTotal: 520` | removed | [R19] replaced the arithmetic with structure. `LAYOUT` now publishes a floor and a count, not a total. |
| tokens, type scale, one webfont | `src/styles/tokens.css`, `@theme` in `globals.css`, two webfonts | [R18] in full. The accent is green, not stamp red. |

Obligations F2 placed on the other features still stand:

- **F3** — generated `definition` ≤ 60 characters, one clause, no trailing full stop.
  `pronunciation` is rendered in `font-mono` (the serif's latin subset does not cover
  IPA Extensions).
- **F4** — `/vocab/[id]` is a `Screen` with `BackLink`; "mastered" uses `ToggleRow`,
  not a dialog. [R1]: a word that has ever been carded cannot be deleted.
- **F5** — `/today` uses `ScreenBody` without `scroll`; at most six
  `DailyCardItemView`; supplies `shortCardAction`; both the week strip and the month
  grid draw their marks with `CalendarMarkGlyph`.
- **F6** — the chat pane scrolls, the composer sits outside it and owns the bottom
  inset; the assistant's opening turn is the first `ChatBubble`. **Shipped**, and
  it is the one screen that passes `keyboardAware` — see below.
- **F7** — `/onboarding` is one `Screen` with no `tabs` and five React states, not
  five routes. It lives **outside** the `(app)` route group, whose layout gates on
  `onboarded_at`. `/profile/edit` is a `Screen` with `BackLink` and a footer that
  is the last row of the flex column, never `position: fixed`.
- **F8** — Discover lives behind `Tabs` on `/vocab` via `?tab=`, not a new route
  segment and not a fifth tab. [R17]. **Shipped**: the proposal is a `Card`, the
  kept strip is `ListRow` (`inline`), and the tab draws no primitive of its own.
  Reviewable without a session at `/kitchen-sink/discover`.
- **F9** — uses the roadmap's exact level and badge strings with `LevelPill` and
  `BadgeRow`; recomputes the streak on read ([R11]).
- **F10** — the journal composer is a permanent field at the top of `/journal`;
  entry body is serif; the insight is a ruled accent block.

### `Screen keyboardAware` — the one exception to `100dvh`

`.dw-screen` sizes itself with `100dvh`, which tracks Safari's collapsing URL
bar and is blind to the on-screen keyboard. That is right for every screen whose
fields scroll inside a pane, and wrong for the one screen with a field pinned to
the bottom of the column: F6's chat composer sits under the keyboard the moment
it is focused.

`keyboardAware` adds `.dw-screen-kb`, which sizes from `--vvh` and follows
`--vvo`, both published by `<VisualViewportProbe />`. The fallbacks in the
`var()` calls mean any browser without `visualViewport` behaves exactly as
`.dw-screen` does.

**Do not turn this on globally.** It makes the frame re-layout on every focus,
and the other nine screens gain nothing from it. The composer's safe-area
padding is arithmetic against the same variable — `max(0px, calc(var(--pad-bottom)
- (100dvh - var(--vvh))))` — because the home-indicator inset is already inside
the visual viewport when the keyboard is up, and applying it twice leaves a gap.

## The measured budget

Measured in a browser at 375×667 (iPhone SE 3rd gen, the roadmap's stated test
width), not estimated. F2 §7.2's ledger was assumptions; these are readings.

| Part | Height |
|---|---|
| viewport | 667 |
| safe-area top + gutter (`--pad-top`) | 16 |
| header (title block + baseline-aligned streak pill) | 70.4 |
| **daily card** | **402.8** |
| day strip | 91.8 |
| tab bar (50 + `--pad-bottom`) | 61 |
| one card row | **65.6** |

Headroom above [R19]'s 52px floor is 13.6px per row, so **≈82px of total slack**
on the binding device. That is the number to check any new `/today` element
against — F2 §13.10's warning about the day strip growing silently is real, and
a 100px addition was measured to cost the card 62px and take rows to 55.3px.

At 320×568 (the 2016 SE, below the design target) rows compress to 49px and the
page still does not scroll. That is the intended degradation, and the spec
asserts the no-scroll invariant there but not the floor.

## Two traps worth knowing about

### Unlayered CSS in `globals.css` beats every utility class

`@import "tailwindcss"` declares `@layer theme, base, components, utilities`.
Anything written outside a layer outranks all four — so a bare element rule in
`globals.css` silently wins against the class a component asked for.

Two rules were written bare and both were load-bearing, found in F3 by measuring
the DOM rather than by anything failing:

- `input, textarea, select { font-size: max(1rem, 16px) }` — the iOS
  zoom-on-focus floor. It beat `text-base` and `text-[30px]` alike, so every
  field in the app rendered at exactly 16px, including the 30px word field that
  is the largest thing `/vocab/new` draws.
- `button { font: inherit; color: inherit }` — the worse of the two. The `font`
  shorthand resets family *and* size, so every `Button` ignored its own
  `font-mono` and `text-mono-*` and drew in inherited 16px serif; `color:
  inherit` ate `text-paper`, which made the filled variant ink on ink with an
  invisible label.

Both now sit in `@layer base`, where they still normalise a bare element and
lose to a utility. **Put any new element-level rule in `@layer base`.** If you
mean it to be unbeatable, say so in a comment and expect it to fight the kit.

### `cn()` and the type scale

`cn()` extends `tailwind-merge` with this project's type scale, and it has to.
tailwind-merge only recognises t-shirt sizes as font sizes; it read
`text-mono-xs` as a *colour*, decided it conflicted with the `text-ink-3` after
it, and silently dropped the size. Every eyebrow in the app rendered at the
inherited 16px instead of 10px and the header came out 34px over budget, with
nothing failing anywhere.

**If you add a `--text-*` token whose name is not a t-shirt size, add it to the
`font-size` group in `src/lib/ui/cn.ts`.** Same for `--tracking-*`.

## Checking your work

```
npm run dev        # then open /kitchen-sink at 375px, in both colour schemes
npm run test:layout  # the no-scroll spec — see tests/e2e/no-scroll.spec.ts
npm run design:build && npm run design:changed
```
