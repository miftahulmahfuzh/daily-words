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
| `ArtHero` | `@/components/gamification/art-hero` | `{ src, intrinsic, plate, dimmed? }` — the full-bleed band, F22's seam |
| `CalendarCell`, `CalendarMarkGlyph` | `@/components/ui/calendar-cell` | `{ day, mark, isToday?, href?, accessibleDate? }` |
| `Tabs` | `@/components/ui/tabs` | `{ items: { label, href, active }[] }` |
| `ToggleRow` | `@/components/ui/toggle-row` | `{ label, hint?, armedLabel?, checked, onChange, confirmOn? }` |
| `Spinner` | `@/components/ui/spinner` | `{ size?: 16\|20\|24 }` |
| `Skeleton` | `@/components/ui/skeleton` | `{ width?, height? }` |
| `DailyCard` | `@/components/daily/daily-card` | `{ items: DailyCardItemView[], hrefFor?, shortCardAction? }` |
| `NoCardYet` | `@/components/daily/no-card-yet` | `{ action }` |
| `DayStrip` | `@/components/daily/day-strip` | `{ days: DayStripItem[], label? }` |
| `Chip`, `ChipSelect` | `@/components/profile/chip-select` | `{ pressed?, onClick? }` / `{ options, selected, onToggle }` |
| `LookupResultCard` | `@/components/vocab/lookup-result-card` | `{ result, originTerm, saving, onAdd, onCancel }` — the non-English resolution, before any row exists |
| `OptionRows` | `@/components/profile/option-rows` | `{ options: { value, label, gloss? }[], value, onChange }` |
| `EntryRow` | `@/components/journal/entry-row` | `{ entry, href? }` |
| `InsightPanel` | `@/components/journal/insight-panel` | `{ insight }` |
| `Composer` | `@/components/journal/composer` | `{ onSave }` — client |
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
| `ConfirmSheet` (native `<dialog>`) | `ToggleRow` two-tap arm | The user's call on the roadmap's open question #1. **One modal in the app, and it is not this one** — F13's `BadgeDialog`, a native `<dialog>` in the top layer on `/profile`. The decision this row records was about a modal that *interrupts a destructive action*, which is the kind that earns the bad reputation; a badge's medal and explanation interrupts nothing. Every destructive action still goes through the two-tap arm. F13 D5. |
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
  `BadgeRow`; recomputes the streak on read ([R11]). **Shipped**: two
  `LevelPill`s (streak and collection) and no progress bars — the design has
  none — over the design's ruled 2×2 stat grid and a `BadgeRow` shelf that shows
  all fourteen, earned first. It also filled the trailing slot F5 left empty on
  `/today` with the design's "N day run" pill, hidden at zero. Reviewable without
  a session at `/kitchen-sink/profile?state=full|lapsed|nowords|empty`.
  `RewardToast` is the one component outside `Screen` allowed `position: fixed`:
  it contributes zero layout height, which is the property the rule protects, and
  `/kitchen-sink/today?n=6&toast=1` is where that is measured.
- **F13** — the shelf's rows are `<button>`s and open `BadgeDialog`, **the one
  modal in the app**. `BadgeRow` itself is unchanged: the kit is frozen and
  exactly one caller needs the behaviour, so the shelf wraps rather than the
  primitive grows. `BadgeDialog` is the second component allowed outside
  `Screen`, on the same argument `RewardToast` won: `showModal()` puts it in the
  **top layer**, outside `.dw-screen`'s flex column and its `overflow: hidden`,
  so it contributes zero layout height — measured in `tests/e2e/no-scroll.spec.ts`
  with the dialog open, not assumed. Its panel borrows `Card`'s tokens without
  being a `Card`, because its body takes a documented `overflow-y` escape and
  `card.tsx` promises a card never scrolls internally. Reviewable without a
  session at `/kitchen-sink/profile?badge=<key>`.
- **F10** — the journal composer is a permanent field at the top of `/journal`;
  entry body is serif; the insight is a ruled accent block. **Shipped**: the
  composer sits in `ScreenBody`'s `top` slot so the list scrolls under it, the
  row is `ListRow` (`stacked`, the layout that exists for this screen), and the
  insight is the design's `border-l-2 border-accent` block carrying the two
  headings the structure needs. Reviewable without a session at
  `/kitchen-sink/journal` and `?state=entry`; the three-line clamp is asserted in
  `tests/e2e/no-scroll.spec.ts`.
  `TextArea` gained a `ref` prop declaration — the only change to a kit
  component, additive, and the same one `TextInput` already carried: React 19
  passes `ref` as an ordinary prop but TypeScript needs it declared, and the
  composer measures the element to auto-grow it and re-focuses it after a save.
- **F11** — `BackLink`'s props are unchanged and stay `{ href, label }`. On
  `/vocab/[id]` both now come from `backTarget()` in `lib/vocab/links.ts`, which
  names the screen the user came from; `OriginBackLink` is the client wrapper
  that does the same for `loading.tsx`, which cannot see `searchParams`. Nothing
  in the kit knows about origins — a `BackLink` still just renders the two
  strings it is handed.
- **F16** — the public share page is a `Screen` with **no `tabs`, no
  `ScreenHeader` and no `BackLink`**: the viewer arrived from WhatsApp with no
  session, so four tabs that all bounce to `/signin` are a trap and a back link
  has nowhere to go. It is the one screen whose single action sits **outside** the
  scrolling pane, as the last row of the flex column with `var(--pad-bottom)` —
  the same shape as F6's composer footer and for a related reason: "Practise this
  word" is the only thing the page exists to offer, to someone who may not
  scroll, and it was measured 150px under the fold at 320×568 before it was
  pulled out. It adds no primitive; the body is `/vocab/[id]`'s type stack minus
  everything that belongs to an owner. The Share affordance on `/vocab/[id]` is
  drawn exactly like `DeleteWordButton` — `min-h-[44px]`, mono, uppercase,
  `text-ink-3`, two taps to revoke — because it joins that same foot stack.
  Reviewable without a session or a database at
  `/kitchen-sink/share?state=short|long|noexamples`; the frame is asserted in
  `tests/e2e/share-frame.spec.ts`.
- **F17** — that action is `<PractiseThisWord />`, a client component for one
  reason: it appends the browser's `detectTimeZone()` to the href on mount,
  because the claim completes onboarding and **writes may not fall back to a
  default zone**. It stays a `Button href` — an anchor, which is what
  `share-frame.spec.ts` finds by `getByRole("link")` and what keeps the page
  working with no JavaScript. `/claim` adds no primitive either: its stop states
  are `EmptyState` and its sign-in state reuses `/signin`'s own `SignInButton`
  verbatim, so the two screens say "Taking you to Google…" in one voice. The
  interstitial's button is a real submit inside a real form that a client
  component fires on mount — visible and tappable, because a dead screen is what
  a spinner becomes when the effect never runs.
- **F18** — one additive kit prop and four `components/share/*` components.

  `DailyCard` gained **`hrefFor?: (item, index) => string`**, and `DailyCardRow`
  the `href?` behind it — the second additive change to a kit component after
  F10's `TextArea ref`, and the shape F11's own comment predicted: "if F18's
  public shared card ever wants this row, lift the href to a prop rather than
  adding a `share` origin — a public page's rows must not link into `(app)`,
  which would bounce an anonymous visitor to /signin." Defaulted, so `/today`
  and `/card/[date]` are untouched, and **one** row component still serves both
  pages, which is what keeps `data-testid="daily-card-row"` covering both.

  | Component | Import | Props |
  |---|---|---|
  | `SharedCard` | `@/components/share/shared-card` | `{ payload, slug, today }` |
  | `SharedJournal` | `@/components/share/shared-journal` | `{ payload }` |
  | `ShareButton` | `@/components/share/share-button` | `{ entityType, entityId, title, label, initialSlug, initialUrl }` — client |
  | `StartYourOwnJournal` | `@/components/share/start-your-own-journal` | `{}` — client |

  `SharedWord` gained `position?` and `eyebrow?`, both optional: one word of a
  shared card is the same five fields as a shared word, so it renders through
  that component rather than a fork that would drift. `ShareButton` is F16's
  `ShareWordButton` generalised to three entity types rather than copied — the
  `navigator.share` → clipboard → selectable-field chain is the part of this
  feature most likely to behave differently on a real phone, and three copies of
  it would be three sets of failure modes.

  **The public card gets a different vertical budget and says so structurally.**
  No tab bar (+61px), no day strip (+91.8px), no `ScreenHeader`, and it scrolls —
  so the card is `min-h-[396px] flex-none` rather than `flex-1`. `flex-none` and
  `flex-1` are the same `tailwind-merge` group, so it genuinely replaces the
  card's own class rather than sitting beside it; inside a scroll container
  `flex-1` against `min-h-0` gives rows their content height, which is
  unpredictable. That is arithmetic where [R19] preferred structure, and if it
  looks wrong on a tall device the fix is a `min-h`/`max-h` pair, **not** a
  return to `flex-1` inside a scroll container.

  `SharedJournal` reuses `InsightPanel` **unchanged**, and reuses it specifically
  so its last line — "Written by the machine. Keep or discard." — cannot be
  dropped by a public-page rewrite. That sentence was written for the owner's
  screen; it is more true on a stranger's.

  **A control that was measured out of existence.** F18 D3 wanted a 32px Share
  pill in `/today`'s header beside the streak pill, costing zero vertical pixels,
  and estimated ~33px of slack at 375px. Measured with a three-digit streak, the
  header went from 70.4px to **117px** — "Today's card" wrapped. The existing
  eighteen assertions would all have stayed green, because a two-line header
  leaves rows at ~60.8px and the floor is 52px. D3's own fallback was taken: the
  date `Eyebrow` on `/today` is a link to `/card/[date]`, where a scrolling
  screen affords a full 44px control. `no-scroll.spec.ts` gained the single-row
  assertion that caught it, and `/kitchen-sink/today?streak=` is what drives it.

  Reviewable without a session or a database at
  `/kitchen-sink/share?kind=card&n=6` and `?kind=journal`.
- **F21** — `BadgeDialog`'s medal becomes `ArtHero`, a full-bleed band across the
  top of the panel. The ask was about colour, not size: the art's paper stopped
  at the medal's edge with 82px of `--card` around it at 375px, so the picture
  read as a tile dropped on a sheet. The band extends the *colour* instead of
  cropping the art, because the deck cannot be cropped — ink runs from 6.2% to
  95.7% of the image height across the fourteen masters, capping a centred crop
  at an aspect ratio of 1.094.

  `ArtHero` takes `src`, `intrinsic`, `plate` and `dimmed` and **never a
  `BadgeKey`** — it is the seam F22 reuses for streak and collector level art,
  which is also why the unearned flag is `dimmed` rather than `earned`. The dim
  goes on the band and not the `<img>`: on the image the plate stays at full
  strength, and in dark mode an unearned badge becomes a slab of full-brightness
  cream, brighter than an earned one, inverting the only signal between them.

  Two things were measured. The band costs the panel **less** than the medal and
  its padding did (580.03px against 597 at the design target, up from 15.28px of
  headroom to 16.97), so both existing badge-dialog assertions pass unmodified —
  and the art must be **out of flow**, or `height: 100%` finds no definite height
  to resolve against, the square source draws itself at the band's full width,
  and the band is 330px while `aspect-ratio` still computes to `16 / 9`.

  `BadgeMedal` is kept and unchanged; the dialog simply no longer mounts it.
  Reviewable at `/kitchen-sink/profile?badge=<key>`, in both schemes.

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

## The badge and level asset contract (F12, F22)

Generated art is the one place this kit draws a raster. Everything else on screen
is a rule, a dot or a word ([R18]), and these are the deliberate exception:
**two decks from one offline pipeline**, both engraved letterpress on the same
cream stock in the same two inks.

- **Badges** — fourteen circular **seals**, one per `BADGE_CATALOG` key,
  contracted by `style.md`.
- **Levels** — seventeen rectangular **panels**, one per band in `STREAK_LEVELS`
  and `COLLECTOR_LEVELS`, contracted by `levels.md` and generated with
  `--kind level`.

**The two forms are the design, not drift** (F22 D3). A badge is an award
*stamped* on a day that happened; a level is the grade *printed* on the card.
They sit on one screen, so art that could not tell them apart would make the
picture beside "Keeper of the Pocket" read as a fifteenth badge, and no caption
fixes a picture that says the wrong thing. Same press, same paper, same green.

**Four sizes ship, and a component must draw at or below them:**

| Field | Intrinsic | Draw at | Where |
|---|---|---|---|
| `BADGE_ART[key].src` | 768×768 | **the hero band's height** — 185px at 375, 190px at the 340px dialog cap; ~220 remains the ceiling | the badge modal (F13, F21) |
| `BADGE_ART[key].small` | 192×192 | **~40 css px** | the shelf mark on `/profile` |
| `LEVEL_ART[key].src` | 768×768 | the same hero band, the same component | the level arm of the same modal (F22) |
| `LEVEL_ART[key].small` | 192×192 | **56 css px**, a constant | the level mark on `/profile` |

**`LevelMark` has no unearned state, by construction** (F22 D5). `BadgeMedal`
takes `earned` because the shelf deliberately draws every unearned badge at
`opacity-40`; `LevelMark` takes no such prop because the key it draws came out of
`levelArtKey(kind, level.index)`, and a tier the user does not hold has no index
to produce one. `/profile` has never listed the tiers and this does not start.
`.dw-level-mark` is a flat 56px rather than a `dvh` clamp, because it lives in a
`ScreenBody` that scrolls rather than in a dialog competing for a fixed budget.

**~220 is a ceiling, and `BadgeMedal` draws it as `min(220px, 25dvh)`.** Measured:
at 375×667 a flat 220 pushes the longest gloss in `badge-meta.ts` 38px past the
panel's max-height, and the first line to go under the fold is the earned-on
date — the one thing on that panel a user cannot reconstruct from anywhere else.
At 390×844 the clamp resolves to 211 and nothing moves. The rule lives in
`.dw-badge-medal` in `globals.css`, beside the dialog's other measured sizing.

**F21: that dvh clamp no longer governs the dialog.** The modal draws `ArtHero`
instead, whose band sizes from the dialog's already-clamped *width* through a
fixed `16 / 9` ratio and from nothing else — 185.06px at 375, 154.06 at 320,
190.13 at the cap. Clamping the height too would couple one box to the viewport
twice and make the plate margins a different width on every phone. `BadgeMedal`
is unchanged and still the right component for a sized square medal.

Import them from `src/lib/gamification/badge-art.ts` and
`src/lib/gamification/level-art.ts` — **generated** files, never edited by hand —
together with `BADGE_ART_SIZE` / `BADGE_ART_SMALL_SIZE` and `LEVEL_ART_SIZE` /
`LEVEL_ART_SMALL_SIZE`, so a component never restates the numbers. Both are plain
data with no `import "server-only"`, so a client component may import either.
Both are **total** `Record`s, which is what makes a key with no art a
`npm run typecheck` error rather than a missing picture.

Five properties the art already guarantees, so no component should re-implement
them:

- **No transparency.** Each file carries its own cream paper plate, edge to edge.
  There is no alpha channel, so there is no halo and no "what colour is behind
  the antialiased edge" question. Do not put a background behind a badge
  expecting it to show through — but do put the badge's own `plate` colour
  *beside* it. `ArtHero` fills its band with `BADGE_ART[key].plate` and lays the
  square art `contain` on top, because the deck cannot be cropped (F21 §1.2).
- **One asset serves both colour schemes.** Paper does not invert. In light theme
  the plate sits nearly flush with `--paper`; in dark theme it reads as a
  specimen laid on a dark table. **Do not add a `dark:` variant, a CSS filter or
  a second asset** — the plate's contrast against both `--paper` values is a
  checked property of the art (`tools/check_badge_art.py` check 5).
- **The art has its own quiet margin** of bare paper around the seal. It does not
  need padding, and a `--r-card` radius clips only that margin.
- **Filenames are content-hashed** and served `immutable` for a year. Never add a
  cache-busting query string; regenerating a badge changes the filename.
- **Each master carries its plate colour as data.** `BADGE_ART[key].plate` and
  `LEVEL_ART[key].plate` are the art's own paper as `#rrggbb`, the mean of the
  master's outer 5% frame — generated, and recomputed from the master by
  `npm run badges:check` exactly as `sha256` is, because it is a property of the
  master's bytes rather than an editorial choice. The badge deck spans
  `#eae6d7`…`#f1ede1` and the level deck `#ede6ca`…`#f5efd3`, so a single
  constant would seam on both; and `tools/check_badge_art.py` check 3 holds the
  four edge strips to an inter-strip spread of 4.0 luminance points, which is
  what licenses a flat fill sitting beside the art with no visible step.
- **Both decks live under their own directory**, `public/badges/` and
  `public/levels/`, and that is not tidiness. The orphan sweeps in
  `tools/make_badge_assets.py` and in `badges:check` each compute "expected
  filenames" from *one* key set; a shared directory makes both correct only
  against the union, which is how a stale file survives a regeneration
  unnoticed.

Titles are drawn by the app, never by the picture — both style contracts forbid
lettering inside the frame, which is why a badge or a level needs its title
beside it to name the occasion.

## Checking your work

```
npm run dev        # then open /kitchen-sink at 375px, in both colour schemes
npm run test:layout  # the no-scroll spec — see tests/e2e/no-scroll.spec.ts
npm run badges:check # the badge-art manifest, files, hashes and key scan
npm run design:build && npm run design:changed
```
