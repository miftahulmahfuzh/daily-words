> ## ⚠ SUPERSEDED IN PART — read `ROADMAP_v0.1.0.md` § Reconciliation Decisions first.
>
> - **[R14]** Your layout budget is authoritative. F5 conforms to 52 px rows / 347 px card.
> - **[R16]** Dark mode and `viewport-fit=cover` are now explicitly in roadmap scope; editing the F1-owned viewport tag is expected, not a conflict.
> - **[Still open #1]** `ConfirmSheet` is provisionally accepted for two uses only — flagged for the user's call.
>
> These plans were written in parallel by agents that could not see each other.
> The Reconciliation section wins over anything below.

# F2 — Design System & Mobile UI Kit

> Read `ROADMAP_v0.1.0.md` first. It wins on every conflict. This plan adds detail to it
> and does not restructure anything it locks.

---

## 1. Goal

Establish the complete visual language of Daily Words — tokens, typography, and one small,
disciplined component set — so that the eight remaining features assemble screens rather
than invent styling. The look is a physical pocket card: warm paper, ink, one accent, hairlines,
no ornament. The single hardest deliverable is a `/today` layout in which a six-word card
provably never scrolls at 375 px width, in iOS Safari, in light and dark, with the URL bar
both expanded and collapsed.

---

## 2. Depends on / blocks

### Depends on (F1 — Foundation)

F2 cannot start until F1 has landed these, and F2 **modifies** some of them:

| From F1 | State F2 needs | F2 action |
|---|---|---|
| Next.js 15 App Router + TypeScript scaffold | exists, builds | consume |
| Tailwind CSS v4 wired via `@tailwindcss/postcss` | `app/globals.css` contains `@import "tailwindcss";` | **rewrite** `app/globals.css` |
| `app/layout.tsx` root layout | exists | **edit** — attach font variables, `<html>` classes, colour-scheme meta |
| Viewport meta with `viewport-fit=cover` | **required** — `env(safe-area-inset-*)` returns `0` without it | verify; add if missing (see §13) |
| PWA manifest | exists | verify `theme_color` / `background_color` match F2 tokens; update if not |
| Bottom tab bar + app shell (F1 stub) | routes exist | **replace** implementation with F2 `Screen` + `TabBar` |
| `@/*` path alias in `tsconfig.json` | exists | consume |
| `/today`, `/vocab`, `/journal`, `/profile` routes existing (even as stubs) | needed so `TabBar` active state can be exercised | consume |

### Blocks

Everything with a screen. F3, F4, F5, F6, F7, F8, F9, F10 all import from §10.
F5 is the tightest coupling: it owns the daily-card *data*, F2 owns the daily-card *box*
and the height budget that makes it legal.

### Does not block

`lib/db/`, `lib/llm/`, API route handlers, migrations. Server work can proceed in parallel.

---

## 3. In scope / explicitly out of scope

### In scope

- Tailwind v4 design tokens (colour light + dark, type, spacing, radii, elevation, motion, z-index).
- Font selection, loading strategy, and the typographic rules for every component.
- The `Screen` layout primitive that owns the `dvh` budget, and `PageHeader`.
- `TabBar` — four items, safe-area aware, the only navigation surface in the app.
- The component inventory in §6, as React server components where possible.
- Global iOS Safari hardening: input zoom, tap highlight, overscroll, edge-swipe protection,
  sticky hover, text-size-adjust.
- A dev-only `/kitchen-sink` route that renders every component and every variant.
- Standalone preview HTML under `design/previews/` and the DesignSync bridge to
  claude.ai/design project `8c1c015d-78c9-4945-8382-23bf124f2333`.
- One Playwright spec that mechanically proves the no-scroll constraint.

### Explicitly out of scope

- **Any data fetching, any Drizzle query, any LLM call.** Every F2 component takes props.
  If a component needs a database row, it takes the row shape as a prop and the owning
  feature supplies it.
- **A theme toggle.** The app follows `prefers-color-scheme` and nothing else. No settings
  screen, no localStorage theme, no flash-of-wrong-theme script. (Simplicity, principle 1.)
- **An icon library dependency.** Six inline SVGs, authored here, ~40 lines total.
- **Animation beyond `:active` feedback and one 120 ms fade.** No page transitions, no
  spring physics, no skeleton shimmer.
- **A toast/snackbar system.** Feedback is inline and local to the control that caused it.
- **Modal dialogs used for navigation.** Locked by the roadmap. The single `ConfirmSheet`
  exception is constrained in §6.14 and flagged in §13.
- **Responsive breakpoints beyond one guard.** The app is a phone app. A single
  `max-width: 430px` centred column on wider viewports; no tablet or desktop layout.
- **Storybook.** `/kitchen-sink` plus the DesignSync previews cover the need at zero cost.
- **Component unit tests.** These are presentational. The Playwright layout spec is the test
  that matters; everything else is checked by eye on a real iPhone.

---

## 4. Files to create

Paths are relative to the repository root.

### Tokens and global CSS

| Path | Purpose |
|---|---|
| `styles/tokens.css` | Raw token values — light on `:root`, dark in a `prefers-color-scheme` block. The single source of truth for every colour in the app. |
| `app/globals.css` | **Rewrite.** `@import "tailwindcss"`, imports `tokens.css`, declares `@theme inline`, and holds the base reset + iOS hardening layer. |
| `app/fonts.ts` | `next/font/google` declaration for Source Serif 4; exports the CSS variable class. |

### Utilities

| Path | Purpose |
|---|---|
| `lib/ui/cn.ts` | `cn()` — `clsx` + `tailwind-merge` class combiner used by every component. |
| `lib/ui/layout.ts` | Exported numeric layout constants (header height, tab bar height, card row height, design floor). Imported by components *and* by the Playwright spec so the budget is asserted against the same numbers it is built from. |
| `lib/ui/types.ts` | Shared presentational types: `DailyCardItemView`, `CalendarMark`, `TabKey`, `ChatRole`, `LevelKind`. |
| `lib/ui/use-visual-viewport.ts` | Client hook exposing `visualViewport.height` / keyboard-open state, for F6's chat composer. Returns stable values on non-iOS. |

### Layout primitives

| Path | Purpose |
|---|---|
| `components/layout/screen.tsx` | The `dvh` grid shell. Owns the no-scroll contract. Every route renders exactly one. |
| `components/layout/page-header.tsx` | 48 px header: title, optional subtitle, optional single trailing action. |

### Navigation

| Path | Purpose |
|---|---|
| `components/nav/tab-items.ts` | The four tab definitions (key, label, href, match prefix). Exported so tests and `Screen` can reason about active state. |
| `components/nav/tab-bar.tsx` | Bottom tab bar; safe-area padded; active state from `usePathname()`. |
| `components/icons/index.tsx` | Six inline SVG icons: `IconToday`, `IconVocab`, `IconJournal`, `IconProfile`, `IconChevronRight`, `IconPlus`. Plus `IconTick`, `IconCross` for the calendar. |

### UI kit

| Path | Purpose |
|---|---|
| `components/ui/card.tsx` | Card surface — the paper primitive everything sits on. |
| `components/ui/list-row.tsx` | 56 px tappable row: leading, title, subtitle, trailing, chevron. |
| `components/ui/button.tsx` | Primary / secondary / ghost button, link-or-button, loading state. |
| `components/ui/field.tsx` | Label + hint + error wrapper shared by input and textarea. |
| `components/ui/text-input.tsx` | Single-line input. Enforces the 17 px anti-zoom size. |
| `components/ui/text-area.tsx` | Multi-line input for the journal composer and chat composer. |
| `components/ui/empty-state.tsx` | Centred title / body / single action. Used on every list before first write. |
| `components/ui/chat-bubble.tsx` | `ChatBubble` (user + assistant) and `ChatBubbleTyping`. |
| `components/ui/badge-chip.tsx` | Awarded-badge chip with optional `×N` count. |
| `components/ui/level-pill.tsx` | Streak / collector level pill with tier-driven weight. |
| `components/ui/calendar-cell.tsx` | 44 px calendar cell: tick / cross / future, plus today ring. |
| `components/ui/segmented-tabs.tsx` | Two-segment link tabs for `/vocab` (Mine / Discover). See §13. |
| `components/ui/confirm-sheet.tsx` | Native `<dialog>` confirmation for destructive non-navigational actions only. See §13. |
| `components/ui/spinner.tsx` | 16 px inline spinner; the only indeterminate indicator in the app. |
| `components/ui/skeleton.tsx` | Static (non-shimmering) placeholder block for `enrichment_status = 'pending'`. |

### Daily card

| Path | Purpose |
|---|---|
| `components/daily/daily-card.tsx` | The six-slot card. Deterministic height. Renders rows plus a "short card" prompt when fewer than six words exist. |
| `components/daily/daily-card-row.tsx` | One word: term line (truncated) + definition line (clamped to 1). Exactly 52 px, always. |

### Dev gallery

| Path | Purpose |
|---|---|
| `app/kitchen-sink/page.tsx` | Dev-only route rendering every component × every variant. `notFound()` in production. |

### Design bridge

| Path | Purpose |
|---|---|
| `design/README.md` | How the bridge works, the group labels, and the one-file-at-a-time rule. |
| `design/previews/_shared.css` | Plain-CSS restatement of component styles for standalone previews (no Tailwind available there). |
| `design/previews/00-foundations.html` | Colour ramps, spacing, radii, elevation, both themes. |
| `design/previews/01-typography.html` | Type scale specimen and the serif/sans split rationale. |
| `design/previews/02-buttons.html` | Button variants × states. |
| `design/previews/03-inputs.html` | Input, textarea, field errors, focus rings. |
| `design/previews/04-surfaces.html` | Card, list row, empty state, skeleton. |
| `design/previews/05-daily-card.html` | The six-word card, plus 6/3/0-word states and the long-term truncation case. |
| `design/previews/06-navigation.html` | Page header, tab bar, segmented tabs. |
| `design/previews/07-calendar.html` | Calendar cells, week strip, month grid. |
| `design/previews/08-chat.html` | Chat bubbles, typing state, composer. |
| `design/previews/09-gamification.html` | Badge chips, level pills, streak numeral. |
| `design/previews/10-screens.html` | Full 375×667 `/today` mock with the height budget drawn on it as a ruler. |
| `design/.dssync-manifest.json` | `{ filename: sha256 }` map of what has been pushed, so pushes stay incremental. |
| `scripts/build-previews.mjs` | Injects `styles/tokens.css` + `_shared.css` into each preview between marker comments, so previews cannot drift from the app tokens. |
| `scripts/dssync-changed.mjs` | Prints the list of preview files whose hash differs from the manifest. Feeds the DesignSync push. |

### Test

| Path | Purpose |
|---|---|
| `tests/e2e/no-scroll.spec.ts` | Playwright: iPhone SE viewport, light + dark, 6 words, worst-case long strings — asserts nothing scrolls. |
| `playwright.config.ts` | Minimal config: one project, `devices['iPhone SE']`, `webServer` running `next dev`. |

### Package changes

- Add deps: `clsx`, `tailwind-merge`.
- Add dev deps: `@playwright/test`.
- Add scripts: `"design:build"`, `"design:changed"`, `"test:layout"`.

---

## 5. Design tokens

Two hues in the whole application: a warm neutral (paper and ink) and one accent
(a stamp-red ochre). There is no success green, no warning amber, and **no separate danger
colour** — destructive intent is carried by copy and by the accent, never by a second red.
Locked. Do not add a colour without amending this file.

### 5.1 `styles/tokens.css`

```css
/* Daily Words — raw token values.
   Light on :root. Dark overrides only the values that change.
   Consumed by app/globals.css via `@theme inline`, so utilities follow the theme
   with no `dark:` classes anywhere in the component layer. */

:root {
  color-scheme: light dark;

  /* ---- Surfaces & ink -------------------------------------------------- */
  --dw-paper:          #F7F4EE;  /* app background — card stock            */
  --dw-surface:        #FFFFFF;  /* raised card                            */
  --dw-surface-sunken: #EFEBE3;  /* inputs, pressed rows                   */
  --dw-ink:            #1A1917;  /* primary text        17.6:1 on surface  */
  --dw-ink-muted:      #5F5B54;  /* definitions, meta    6.8:1 on surface  */
  --dw-ink-faint:      #7C766B;  /* placeholders         4.5:1 on surface  */
  --dw-ink-ghost:      #B5AFA3;  /* absent marks, disabled — NON-TEXT ONLY */
  --dw-line:           #E2DCD1;  /* decorative hairline                    */
  --dw-line-strong:    #9A9182;  /* interactive boundary  3.1:1 on surface */

  /* ---- Accent (the only chromatic hue) --------------------------------- */
  --dw-accent:         #9E3B2E;  /* 6.7:1 on surface, 6.1:1 on paper       */
  --dw-accent-strong:  #7E2E23;  /* :active                                */
  --dw-accent-soft:    #F2E4E0;  /* accent-tinted fill (today ring bg)     */
  --dw-accent-ink:     #FFFFFF;  /* text on an accent fill — 6.7:1         */

  /* ---- Shadows (light only; dark uses surface lift instead) ------------ */
  --dw-shadow-card:   0 1px 2px rgb(26 25 23 / 0.05), 0 1px 1px rgb(26 25 23 / 0.04);
  --dw-shadow-lift:   0 8px 24px -10px rgb(26 25 23 / 0.20);
}

@media (prefers-color-scheme: dark) {
  :root {
    --dw-paper:          #131211;
    --dw-surface:        #1C1B18;
    --dw-surface-sunken: #0E0D0C;
    --dw-ink:            #F0EBE1;  /* 14.9:1 on surface                    */
    --dw-ink-muted:      #A9A296;  /* 6.9:1  on surface                    */
    --dw-ink-faint:      #857E72;  /* 4.5:1  on surface                    */
    --dw-ink-ghost:      #514B42;
    --dw-line:           #2B2925;
    --dw-line-strong:    #6B6559;  /* 3.0:1 on surface                     */

    --dw-accent:         #D9765F;  /* 5.5:1 on surface — LIGHTENED, the    */
    --dw-accent-strong:  #C46349;  /* light accent is only 2.6:1 in dark   */
    --dw-accent-soft:    #3A2620;
    --dw-accent-ink:     #131211;  /* dark text on the accent fill, 6.0:1  */

    --dw-shadow-card:    none;
    --dw-shadow-lift:    0 8px 24px -10px rgb(0 0 0 / 0.55);
  }
}

@media (prefers-contrast: more) {
  :root {
    --dw-ink-muted:   #46433D;
    --dw-line:        #C6BEB0;
    --dw-line-strong: #6E6759;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --dw-ink-muted:   #C9C2B6;
      --dw-line:        #45423B;
      --dw-line-strong: #8B8477;
    }
  }
}
```

**Why the accent flips value in dark mode.** `#9E3B2E` measures 2.6:1 against the dark
surface — unreadable. The dark accent is a lighter tint of the same hue, and because it is
light, the text placed *on* an accent fill flips to near-black (`--dw-accent-ink`). This is
the only token pair in the system that inverts its role; every component gets it for free by
using `bg-accent text-accent-ink`.

### 5.2 `app/globals.css` — theme mapping

```css
@import "tailwindcss";
@import "../styles/tokens.css";

/* `inline` makes utilities emit `var(--dw-*)` directly instead of copying the
   value at build time. That is what allows the media-query override above to
   repaint the whole app with zero `dark:` variants. */
@theme inline {
  --color-paper:          var(--dw-paper);
  --color-surface:        var(--dw-surface);
  --color-surface-sunken: var(--dw-surface-sunken);
  --color-ink:            var(--dw-ink);
  --color-ink-muted:      var(--dw-ink-muted);
  --color-ink-faint:      var(--dw-ink-faint);
  --color-ink-ghost:      var(--dw-ink-ghost);
  --color-line:           var(--dw-line);
  --color-line-strong:    var(--dw-line-strong);
  --color-accent:         var(--dw-accent);
  --color-accent-strong:  var(--dw-accent-strong);
  --color-accent-soft:    var(--dw-accent-soft);
  --color-accent-ink:     var(--dw-accent-ink);

  --shadow-card: var(--dw-shadow-card);
  --shadow-lift: var(--dw-shadow-lift);
}

@theme {
  /* ---- Type families --------------------------------------------------- */
  --font-serif: var(--font-source-serif), ui-serif, Georgia, "Times New Roman", serif;
  --font-sans:  -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI",
                system-ui, sans-serif;

  /* ---- Type scale (size / line-height) — seven steps, no more ---------- */
  --text-2xs:  0.6875rem;  --text-2xs--line-height:  0.875rem;  /* 11 / 14 */
  --text-xs:   0.8125rem;  --text-xs--line-height:   1.125rem;  /* 13 / 18 */
  --text-sm:   0.9375rem;  --text-sm--line-height:   1.25rem;   /* 15 / 20 */
  --text-base: 1.0625rem;  --text-base--line-height: 1.5rem;    /* 17 / 24 */
  --text-lg:   1.25rem;    --text-lg--line-height:   1.625rem;  /* 20 / 26 */
  --text-xl:   1.625rem;   --text-xl--line-height:   1.875rem;  /* 26 / 30 */
  --text-2xl:  2rem;       --text-2xl--line-height:  2.25rem;   /* 32 / 36 */

  --tracking-tight:  -0.012em;   /* large serif settings                    */
  --tracking-normal:  0em;
  --tracking-wide:    0.06em;    /* 11px uppercase eyebrows only            */

  --leading-tight:   1.15;
  --leading-snug:    1.3;
  --leading-normal:  1.5;

  /* ---- Spacing: 4px base. Utilities are computed, not enumerated. ------ */
  --spacing: 0.25rem;   /* p-1 = 4px … p-4 = 16px … p-12 = 48px            */

  /* ---- Radii ----------------------------------------------------------- */
  --radius-xs:   0.25rem;   /*  4px — skeletons, marks                     */
  --radius-sm:   0.375rem;  /*  6px — chips, inputs                        */
  --radius-md:   0.625rem;  /* 10px — buttons                              */
  --radius-lg:   0.875rem;  /* 14px — cards, sheets                        */
  --radius-pill: 999px;

  /* ---- Motion ---------------------------------------------------------- */
  --ease-out-quint: cubic-bezier(0.22, 1, 0.36, 1);
  --dw-dur-fast: 120ms;
  --dw-dur-base: 200ms;

  /* ---- The only breakpoint. Phone app. --------------------------------- */
  --breakpoint-phone: 430px;
}

:root {
  /* ---- Layout constants. Mirrored in lib/ui/layout.ts — change both. ---- */
  --dw-header-h:     48px;
  --dw-tabbar-h:     49px;
  --dw-weekstrip-h:  56px;
  --dw-row-h:        52px;   /* one daily-card word row                     */
  --dw-listrow-h:    56px;
  --dw-touch-min:    44px;
  --dw-gutter:       16px;
  --dw-card-pad-y:   14px;
  --dw-z-header:     30;
  --dw-z-tabbar:     40;
  --dw-z-sheet:      50;
}
```

### 5.3 Elevation

Four levels, and three of them are "not elevated". Paper does not float.

| Token | Value (light) | Used by |
|---|---|---|
| flat | no shadow, no border | page background, empty state |
| hairline | `border: 1px solid var(--color-line)` | list rows, calendar grid, dividers |
| `shadow-card` | `0 1px 2px / 0 1px 1px` at 4–5 % | `Card`, `DailyCard`, chat bubbles |
| `shadow-lift` | `0 8px 24px -10px` at 20 % | `ConfirmSheet` only |

In dark mode `--dw-shadow-card` is `none`. Elevation there is communicated by
`--dw-surface` (#1C1B18) sitting lighter than `--dw-paper` (#131211), which is how iOS
does it. Any component that relies on a shadow to be legible is wrong; add a hairline.

### 5.4 Contrast ledger (WCAG 2.1, computed, must hold)

| Pair | Light | Dark | Requirement |
|---|---|---|---|
| ink on surface | 17.6:1 | 14.9:1 | AA body ✅ |
| ink-muted on surface | 6.8:1 | 6.9:1 | AA body ✅ |
| ink-faint on surface | 4.5:1 | 4.5:1 | AA body (placeholders) ✅ |
| ink-ghost on surface | 1.9:1 | 1.7:1 | **non-text only** ⚠ |
| line-strong on surface | 3.1:1 | 3.0:1 | AA non-text (1.4.11) ✅ |
| line on surface | 1.2:1 | 1.2:1 | **decorative only** ⚠ |
| accent on surface | 6.7:1 | 5.5:1 | AA body ✅ |
| accent on paper | 6.1:1 | 5.4:1 | AA body ✅ |
| accent-ink on accent | 6.7:1 | 6.0:1 | AA body ✅ |

Rules that follow: `ink-ghost` and `line` may never carry text or be the sole indicator of
an interactive boundary. Focus rings use `accent` (≥3:1 both themes).

---

### 5.5 Typography

#### The choice

**One webfont. Source Serif 4 (variable), latin subset, self-hosted by `next/font/google`.
Everything else is the iOS system sans.**

```ts
// app/fonts.ts
import { Source_Serif_4 } from "next/font/google";

export const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-source-serif",
  weight: ["400", "600"],   // two weights. Not three.
});
```

#### Why

1. **The product is words, so the words must be the only typeset thing.** If the chrome is
   also styled, the chrome competes. Setting all UI furniture — tab labels, buttons, inputs,
   metadata, badges — in the platform sans makes it visually disappear into iOS, and leaves
   the serif to mean exactly one thing: *this is content, this is a word, read it*. That is a
   semantic use of typeface, which is the strongest form of hierarchy available and costs
   nothing.
2. **It is the dictionary register.** Principle 4 in the roadmap asks for "the register of a
   dictionary — plain, precise, unfussy". A transitional text serif *is* that register. A
   geometric sans would make a vocabulary card read like a productivity dashboard.
3. **Source Serif 4 specifically:** designed for screen text, large x-height (survives at
   15 px on a 3× phone screen), true italic, a real 600 that holds up at 17 px, variable so
   two weights cost one file, SIL OFL so it is free forever (principle 3).
4. **Zero-byte chrome.** SF Pro is already resident on every target device. Using it for the
   UI means the app ships exactly one font file (~40 KB woff2 subset), on a free hosting tier,
   to a phone on mobile data. No FOUT on any control the user can tap.
5. **`next/font` fetches at build time and self-hosts.** No runtime request to Google,
   no third-party dependency at runtime, automatic size-adjust fallback metrics.

#### Assignment table

| Element | Family | Size / line-height | Weight | Colour | Tracking |
|---|---|---|---|---|---|
| Page title (`PageHeader`) | serif | `text-lg` 20/26 | 600 | ink | tight |
| Screen H1 on `/profile` numerals | serif | `text-2xl` 32/36 | 600 | ink | tight |
| Daily-card **term** | serif | `text-base` 17/**22 fixed** | 600 | ink | tight |
| Daily-card **definition** | serif | `text-sm` 15/**20 fixed** | 400 | ink-muted | normal |
| Vocab detail definition | serif | `text-base` 17/24 | 400 | ink | normal |
| Journal entry body | serif | `text-base` 17/24 | 400 | ink | normal |
| Chat bubble text | serif | `text-base` 17/24 | 400 | ink | normal |
| Example sentences | serif *italic* | `text-sm` 15/20 | 400 | ink-muted | normal |
| List row title | serif | `text-base` 17/24 | 400 | ink | normal |
| List row subtitle | sans | `text-xs` 13/18 | 400 | ink-muted | normal |
| Button label | sans | `text-base` 17/24 | 600 | per variant | normal |
| Input value | sans | `text-base` **17 px min** | 400 | ink | normal |
| Field label | sans | `text-xs` 13/18 | 600 | ink-muted | normal |
| Tab bar label | sans | `text-2xs` 11/14 | 500 | per state | normal |
| Badge / level pill | sans | `text-2xs` 11/14 | 600 | per variant | normal |
| Calendar numeral | sans | `text-xs` 13/18 | 500 | ink-muted | normal |
| Eyebrow / section label | sans **uppercase** | `text-2xs` 11/14 | 600 | ink-faint | wide |
| Metadata, dates, counts | sans | `text-xs` 13/18 | 400 | ink-faint | normal |
| Error message | sans | `text-xs` 13/18 | 500 | accent | normal |

#### Typographic rules

- **Pronunciation strings are always sans.** IPA glyphs (`/dʒɛnˈtiːl/`) live in the Unicode
  *IPA Extensions* block, which the Google Fonts `latin` subset of Source Serif 4 does not
  guarantee. SF Pro covers it. Rendering IPA in the serif produces silent fallback and a
  visibly mismatched line. This is a hard rule for F3 and F4.
- **No italics for emphasis in UI copy.** Italic is reserved for example sentences and for
  quoted journal source lines.
- **No text is ever centred except inside `EmptyState`.** Left rag right everywhere else.
- **`text-wrap: balance`** on `PageHeader` titles and `EmptyState` titles only.
- **`text-wrap: pretty`** on definition and body paragraphs (prevents single-word last lines).
- **Never `hyphens: auto`.** English hyphenation in Safari is aggressive and makes the card
  look broken.
- **Numerals:** `font-variant-numeric: tabular-nums` on the calendar grid, streak counts, and
  `×N` badge counts, so nothing shifts when a digit changes.

---

## 6. Component inventory

Conventions for every component below:

- Server component by default. `"use client"` only where noted (`TabBar`, `TextInput`,
  `TextArea`, `SegmentedTabs`, `ConfirmSheet`, `Button` when `onClick` is used).
- Every component accepts `className?: string`, merged last via `cn()`.
- Every component forwards `data-*` and `aria-*` through `...rest` where it has an element
  to hang them on.
- No component fetches data. No component imports from `lib/db` or `lib/llm`.
- Anything tappable is ≥ 44 × 44 px including padding, has `touch-action: manipulation`,
  and has a visible `:active` state (because global CSS kills the iOS tap highlight).

---

### 6.1 `Card` — `components/ui/card.tsx`

The paper primitive.

```ts
type CardProps = {
  as?: "div" | "section" | "article";
  variant?: "raised" | "sunken" | "outline";   // default "raised"
  padding?: "none" | "sm" | "md";              // default "md"
  children: React.ReactNode;
  className?: string;
};
```

| Variant | Background | Border | Shadow |
|---|---|---|---|
| `raised` | `surface` | none (light) / `line` (dark) | `shadow-card` |
| `sunken` | `surface-sunken` | none | none |
| `outline` | transparent | `1px line` | none |

Padding: `none` = 0, `sm` = 12 px, `md` = 16 px. Radius always `radius-lg` (14 px).

**Usage rules.** A card never nests inside another card. A card never scrolls internally —
if content overflows, the *page* scrolls or the content is clamped. On `/today` the card is
`DailyCard`, not this; `Card` is the generic surface for `/vocab/[id]`, `/journal/[id]`,
`/profile` stat blocks.

---

### 6.2 `ListRow` — `components/ui/list-row.tsx`

```ts
type ListRowProps = {
  href?: string;                       // renders next/link when present
  onClick?: () => void;                // renders <button> when present, no href
  leading?: React.ReactNode;           // ≤ 28px square
  title: string;
  titleSlot?: React.ReactNode;         // rendered after title, e.g. a LevelPill
  subtitle?: string;
  trailing?: React.ReactNode;          // ≤ 88px wide, right aligned
  chevron?: boolean;                   // default true when href is set
  size?: "default" | "compact";        // 56px | 44px
  muted?: boolean;                     // mastered words render muted
  disabled?: boolean;
  className?: string;
};
```

Layout: `grid-template-columns: auto 1fr auto`, `gap: 12px`, `padding-inline: 16px`.
Height `--dw-listrow-h` (56 px) default, 44 px compact. Title `truncate`, subtitle
`line-clamp-1`. Separator is a `1px` `line` border on the container's `:not(:last-child)`,
inset 16 px from the left to align with the title, full-bleed on the right.

States: `:active` → `bg-surface-sunken` for 120 ms. `muted` → title colour `ink-muted`.
`disabled` → `ink-ghost`, `pointer-events: none`, `aria-disabled`.

**Usage rules.** This is the *only* list affordance in the app. `/vocab`, `/journal`,
`/profile` badge lists, and the `/vocab/[id]` example list all use it. Never put a second
tappable control inside a row — the row's trailing slot may contain text or a static icon,
not a button (nested tap targets are the number-one source of mis-taps on a phone).

---

### 6.3 `TabBar` — `components/nav/tab-bar.tsx` `"use client"`

Exactly four items. Fixed set, defined in `components/nav/tab-items.ts`:

```ts
export type TabKey = "today" | "vocab" | "journal" | "profile";

export const TAB_ITEMS = [
  { key: "today",   label: "Today",   href: "/today",   match: /^\/today/ },
  { key: "vocab",   label: "Vocab",   href: "/vocab",   match: /^\/vocab/ },
  { key: "journal", label: "Journal", href: "/journal", match: /^\/journal/ },
  { key: "profile", label: "Profile", href: "/profile", match: /^\/profile/ },
] as const;
```

```ts
type TabBarProps = { className?: string };   // no props. Deliberately.
```

Structure and geometry:

```
<nav aria-label="Primary">                     role=navigation
  height: var(--dw-tabbar-h)             = 49px  content row
  padding-bottom: env(safe-area-inset-bottom, 0px)
  background: color-mix(in srgb, var(--color-paper) 88%, transparent)
  backdrop-filter: saturate(180%) blur(20px)
  border-top: 1px solid var(--color-line)
  display: grid; grid-template-columns: repeat(4, 1fr)
```

Each item: `flex-col items-center justify-center gap-[2px]`, icon 24 px, label `text-2xs`.
Hit area = 375 / 4 = **93.75 × 49 px** — exceeds the 44 px minimum on both axes.

States: active → icon and label `accent`, icon stroke-width 2; inactive → `ink-faint`,
stroke-width 1.5. Active item carries `aria-current="page"`.

**Usage rules.** Rendered by `Screen` when `tabBar` is not `false`. Never rendered directly
by a route. Hidden on `/signin` and `/onboarding` (F1/F7 pass `tabBar={false}`). It is
`position: static` inside the shell grid — **not** `position: fixed` — which is what removes
the entire class of "content hidden behind the tab bar when the URL bar moves" bugs.

---

### 6.4 `Button` — `components/ui/button.tsx`

```ts
type ButtonProps = {
  variant?: "primary" | "secondary" | "ghost";   // default "secondary"
  size?: "md" | "lg";                            // 44px | 52px
  fullWidth?: boolean;                           // default false
  href?: string;                                 // renders next/link
  type?: "button" | "submit";                    // default "button"
  loading?: boolean;                             // shows Spinner, disables, keeps width
  disabled?: boolean;
  iconLeft?: React.ReactNode;                    // 20px
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
};
```

| Variant | Rest | Active | Disabled | When to use |
|---|---|---|---|---|
| `primary` | `bg-accent` / `text-accent-ink`, no border | `bg-accent-strong` | `bg-ink-ghost`, `text-surface` | **Exactly one per screen.** "Make today's card", "Add word", "Sign in with Google". |
| `secondary` | `bg-surface`, `1px line-strong`, `text-ink` | `bg-surface-sunken` | `text-ink-ghost`, border `line` | Confirmations, secondary paths. |
| `ghost` | transparent, `text-accent` | `bg-accent-soft` | `text-ink-ghost` | Inline/tertiary, header trailing actions, "Skip". |

Geometry: `radius-md` (10 px), `padding-inline` 20 px (`md`) / 24 px (`lg`),
`min-height` 44/52 px, label `font-sans` 17/600, `gap: 8px`.
`loading` renders `<Spinner size={16}/>` in place of `iconLeft`, sets `aria-busy`, keeps the
label so the button does not resize.

**Usage rules.** One primary per screen — the roadmap's "one sentence per screen" principle
made literal. Do not create an icon-only button variant; if an action cannot be labelled in
one or two words, it does not belong on a phone screen. Destructive actions use `secondary`
plus explicit copy ("Mark as mastered") and, when irreversible, a `ConfirmSheet`.

---

### 6.5 `Field` — `components/ui/field.tsx`

Wrapper providing label, hint, error, and the `aria-describedby` wiring.

```ts
type FieldProps = {
  id: string;                 // must match the control's id
  label: string;
  hint?: string;
  error?: string;             // presence sets aria-invalid on the child
  required?: boolean;         // renders nothing visual; sets aria-required
  children: React.ReactNode;
  className?: string;
};
```

Renders `<label htmlFor>` (13/600 sans, `ink-muted`), the control, then either the hint
(13 sans `ink-faint`) or the error (13/500 sans `accent`, `role="alert"`) — never both;
error wins. Vertical rhythm: 6 px label→control, 6 px control→message.

---

### 6.6 `TextInput` — `components/ui/text-input.tsx` `"use client"`

```ts
type TextInputProps = {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;     // already unwrapped from the event
  type?: "text" | "email" | "search" | "url";   // NEVER "number" — see §11
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  maxLength?: number;
  autoFocus?: boolean;
  autoCapitalize?: "none" | "sentences" | "words";  // default "none"
  autoCorrect?: "on" | "off";                       // default "off"
  spellCheck?: boolean;                             // default false
  enterKeyHint?: "enter" | "done" | "go" | "search" | "send";
  inputMode?: "text" | "search" | "email";
  className?: string;
};
```

Geometry: `min-height: 48px`, `padding: 12px 14px`, `radius-sm`, `bg-surface-sunken`,
`border: 1px solid var(--color-line-strong)`, `text-ink`, placeholder `ink-faint`.

**`font-size: var(--text-base)` = 17 px. Non-negotiable.** See §7.5.1.

Focus: `outline: 2px solid var(--color-accent); outline-offset: 2px;` — an outline, not a
box-shadow, so it survives `forced-colors`. `invalid` → border `accent`.

Defaults chosen for the app's actual use: `autoCapitalize="none"`, `autoCorrect="off"`,
`spellCheck={false}` — because the primary input in this app is `/vocab/new`, where iOS
autocorrect will happily rewrite "genteel" into "gentle" and destroy the feature.
F10's journal composer and F6's chat composer override to `sentences` / `on` / `true`.

---

### 6.7 `TextArea` — `components/ui/text-area.tsx` `"use client"`

Same props as `TextInput` minus `type`/`inputMode`, plus:

```ts
  rows?: number;            // default 4
  autoGrow?: boolean;       // default false; when true, grows to maxRows then scrolls
  maxRows?: number;         // default 6
```

Same 17 px floor. `autoGrow` is used only by F6's chat composer; it measures via a hidden
mirror element rather than reading `scrollHeight` on every keystroke.
`resize: none` always — a draggable resize handle on a phone is noise.

---

### 6.8 `EmptyState` — `components/ui/empty-state.tsx`

```ts
type EmptyStateProps = {
  title: string;                 // ≤ 40 chars, sentence case, no period
  body?: string;                 // ≤ 90 chars, one sentence
  action?: { label: string; href?: string; onClick?: () => void };
  variant?: "page" | "inline";   // default "page"
  className?: string;
};
```

`page`: centred in the available space, `max-width: 260px`, title serif `text-lg`/600 ink,
body sans `text-sm` `ink-muted`, 20 px gap, action as `primary` `md`.
`inline`: left-aligned, no vertical centring, action as `ghost`. Used inside a `Card`.

**No illustration, no icon, no emoji.** The empty state is a sentence and a button.

Copy this feature supplies as defaults for the eight consumers (they may override):
- `/vocab` Mine: "No words yet" / "Add the first one when you meet it." → *Add a word*
- `/today` no card: "No card for today" / "Make one when you are ready." → *Make today's card*
- `/journal`: "Nothing kept yet" / "Paste a line worth keeping." → *Write one*

---

### 6.9 `ChatBubble` — `components/ui/chat-bubble.tsx`

```ts
type ChatRole = "user" | "assistant";

type ChatBubbleProps = {
  role: ChatRole;
  children: React.ReactNode;      // plain text; no markdown rendering in v0.1.0
  state?: "sent" | "pending" | "failed";   // default "sent"
  onRetry?: () => void;           // rendered only when state === "failed"
  className?: string;
};

// Also exported:
function ChatBubbleTyping(): JSX.Element;   // three ink-faint dots, 1.2s loop
```

| Role | Alignment | Background | Text | Corners |
|---|---|---|---|---|
| `assistant` | left | `surface` + `1px line` | `ink` | `14px`, bottom-left `4px` |
| `user` | right | `accent` | `accent-ink` | `14px`, bottom-right `4px` |

`max-width: 82%`, padding `10px 14px`, serif `text-base` 17/24, `overflow-wrap: anywhere`.
Sequential bubbles from the same role: 4 px gap; role change: 12 px gap.
`state="pending"` → `opacity: 0.6`. `state="failed"` → `1px accent` border plus a 13 px
`ghost` "Retry" button beneath, right-aligned.

**Usage rules.** F6 renders the *assistant's first message* on session open — the bubble
must therefore look correct as the very first element with no preceding user turn. No avatars,
no names, no timestamps. The turn counter (`n/8`) belongs in F6's header, not in a bubble.

---

### 6.10 `BadgeChip` — `components/ui/badge-chip.tsx`

```ts
type BadgeChipProps = {
  label: string;          // the exact title string from the roadmap table
  count?: number;         // rendered as "×2" when > 1
  earned?: boolean;       // default true
  date?: string;          // pre-formatted, e.g. "17 Aug 2026"; shown below in lists
  size?: "sm" | "md";     // 24px | 28px tall
  className?: string;
};
```

Earned: `bg-accent-soft`, `text-accent`, `radius-pill`, `padding: 0 10px`, sans
`text-2xs`/600, `tabular-nums` on the count.
Unearned: `bg-transparent`, `1px dashed line-strong`, `text-ink-faint`.

**Usage rules.** F9 only. Badge titles are long ("No Weekend Without Ration Card") — chips
therefore wrap onto multiple lines in a `flex-wrap` container with 6 px gaps, and never
truncate. A truncated badge name is worse than a tall list.

---

### 6.11 `LevelPill` — `components/ui/level-pill.tsx`

```ts
type LevelKind = "streak" | "collector";

type LevelPillProps = {
  kind: LevelKind;
  label: string;          // exact title, e.g. "Keeper of the Pocket"
  tier: number;           // 1-based index into the roadmap's level table
  tierCount: number;      // 9 for streak, 8 for collector
  size?: "sm" | "md";
  className?: string;
};
```

Visual: `radius-pill`, `1px solid`, sans `text-2xs`/600, plus a **tier ramp** — the fill
opacity of `accent-soft` steps with `tier / tierCount` (from 12 % at tier 1 to 100 % at the
top tier) and the border steps from `line-strong` to `accent`. This is how progression is
communicated without introducing a second colour or a progress bar. A `title` attribute
carries `"{label} — level {tier} of {tierCount}"`; the visible label is the title alone.

---

### 6.12 `CalendarCell` — `components/ui/calendar-cell.tsx`

```ts
type CalendarMark = "tick" | "cross" | "future";

type CalendarCellProps = {
  date: string;           // "YYYY-MM-DD", user-local calendar date
  day: number;            // 1..31, the numeral to render
  mark: CalendarMark;
  isToday?: boolean;      // orthogonal to mark — today can be tick OR cross
  href?: string;          // link to that day's card when mark === "tick"
  weekday?: string;       // "M","T","W"… rendered above in the /today week strip
  className?: string;
};
```

Six legal renderings (3 marks × today/not):

| `mark` | `isToday` | Numeral | Glyph | Ring |
|---|---|---|---|---|
| `tick` | no | `ink-muted` | filled tick, `ink` | none |
| `tick` | yes | `accent`/600 | filled tick, `accent` | `2px accent` |
| `cross` | no | `ink-faint` | thin cross, `ink-ghost` | none |
| `cross` | yes | `accent`/600 | thin cross, `ink-ghost` | `2px accent` |
| `future` | no | `ink-ghost` | none | none |
| `future` | yes | — | — | **illegal**; today is never `future` |

Geometry: the *visual* cell is 32 × 32 px (`radius-sm`), but the rendered element is
**44 × 44 px** with the visual centred inside — the hit target requirement is met by
padding, not by making the grid look chunky. In a 7-column month grid at 375 px:
`(375 − 32 gutter) / 7 = 49 px` per column, so 44 px targets fit with room.

`accessibleLabel` is generated internally: `"8 August, card made"` / `"7 August, no card"` /
`"9 August"`. `future` cells render as `<div aria-hidden>` when the numeral is the only
content, to keep the screen-reader tour short.

**Usage rules.** F5 owns both the `/today` week strip and the `/calendar` month grid, and
uses this same cell for both. "Tick" means a `daily_cards` row exists for that local date.
Crosses only appear on or after `user_stats.first_card_on` — the app does not scold the user
for days before they started.

---

### 6.13 `SegmentedTabs` — `components/ui/segmented-tabs.tsx` `"use client"`

Link-based, because the roadmap requires routes.

```ts
type SegmentedTabsProps = {
  items: { label: string; href: string; match?: RegExp }[];   // 2 or 3 items
  className?: string;
};
```

`bg-surface-sunken`, `radius-md`, 3 px inner padding, each segment `min-height: 38px`,
sans `text-sm`/600. Active segment: `bg-surface`, `text-ink`, `shadow-card`.
Inactive: `text-ink-muted`. `role="tablist"` with `aria-selected` on each link.
Full width, sits directly under `PageHeader` with 12 px bottom margin.

Used by `/vocab` for **Mine / Discover** (F4 / F8). See §13 for why this component exists.

---

### 6.14 `ConfirmSheet` — `components/ui/confirm-sheet.tsx` `"use client"`

Constrained escape hatch. Built on native `<dialog>`.

```ts
type ConfirmSheetProps = {
  open: boolean;
  title: string;                 // a question, ≤ 50 chars
  body?: string;                 // ≤ 100 chars
  confirmLabel: string;          // a verb, not "OK"
  onConfirm: () => void;
  onCancel: () => void;
  className?: string;
};
```

Bottom-anchored, `radius-lg` top corners only, `shadow-lift`, `padding-bottom:
calc(16px + env(safe-area-inset-bottom))`. Backdrop `rgb(26 25 23 / 0.32)`.
Buttons stacked: `secondary` confirm on top, `ghost` cancel beneath.
Enters with a 200 ms translate + fade; respects `prefers-reduced-motion`.

**Hard constraints — read before using.**
1. **It may never contain navigation, a form, or scrollable content.** Title, body, two buttons.
2. **It may only be opened by a direct user tap** on the element it confirms.
3. Native `<dialog showModal()>` handles focus trapping and `Escape`. Do not hand-roll either.
4. It sets `inert` on the shell, not `overflow: hidden` on `<body>` — body scroll locking on
   iOS Safari is the exact failure mode the roadmap's no-modals rule exists to avoid, and our
   shell does not scroll anyway.
5. Approved uses in v0.1.0: **"Mark as mastered?"** (F4) and **"Sign out?"** (F9). Nothing else
   without amending this plan.

---

### 6.15 `Spinner` / `Skeleton`

```ts
type SpinnerProps   = { size?: 16 | 20 | 24; className?: string };   // currentColor, 1.5px stroke, 800ms
type SkeletonProps  = { width?: string; height?: number; className?: string };  // bg-surface-sunken, radius-xs
```

`Skeleton` does **not** shimmer. A static block is calmer and costs no animation frame.
Used for `enrichment_status === "pending"` rows in F3/F4.

---

### 6.16 `Screen` — `components/layout/screen.tsx`

The most important component in the feature. It owns the height budget.

```ts
type ScreenProps = {
  title?: string;                 // renders PageHeader when present
  subtitle?: string;
  headerTrailing?: React.ReactNode;   // one ghost Button or nothing
  back?: { href: string; label: string };  // renders a back chevron in the header
  tabBar?: boolean;               // default true
  scroll?: boolean;               // default true. FALSE on /today.
  padded?: boolean;               // default true → 16px inline gutter on the content area
  children: React.ReactNode;
  className?: string;
};
```

Rendered DOM:

```html
<div class="dw-shell">          <!-- height:100dvh; display:grid;
                                     grid-template-rows: auto 1fr auto;
                                     overflow:hidden;
                                     padding-top: env(safe-area-inset-top) -->
  <PageHeader/>                  <!-- row 1: auto, 48px -->
  <main class="dw-content"/>     <!-- row 2: 1fr, min-height:0,
                                     overflow-y: auto | hidden,
                                     overscroll-behavior-y: contain -->
  <TabBar/>                      <!-- row 3: auto, 49px + safe-area-inset-bottom -->
</div>
```

`scroll={false}` sets `overflow: hidden` on `main` — used by `/today` only. Every other
route scrolls its content area while the header and tab bar stay put, which is why the
header and tab bar are grid rows rather than `position: fixed`.

**Usage rules.** Every page under `app/` renders exactly one `Screen` as its outermost
element. `Screen` is never nested. `/signin` and `/onboarding` pass `tabBar={false}`.
Nothing else in the app may set `height: 100vh`, `position: fixed`, or `overflow` on
`<body>` — those are `Screen`'s job, and duplicating them is how the budget breaks.

---

### 6.17 `PageHeader` — `components/layout/page-header.tsx`

```ts
type PageHeaderProps = {
  title: string;
  subtitle?: string;                     // 13px sans ink-faint, on the same 48px row
  back?: { href: string; label: string };
  trailing?: React.ReactNode;
  className?: string;
};
```

`min-height: var(--dw-header-h)` = 48 px, `padding: 10px 16px`, `bg-paper`,
`border-bottom: 1px solid var(--color-line)`. Title serif 20/26/600, `truncate`.
`back` renders a 44 × 44 px chevron button whose `aria-label` is `Back to {label}` —
it is a *supplement* to the iOS edge-swipe gesture, never a replacement, and it uses
`<Link href>` so it also works when the app is launched cold at a deep route.

---

### 6.18 `DailyCard` — `components/daily/daily-card.tsx`

```ts
// lib/ui/types.ts
export type DailyCardItemView = {
  id: string;             // vocab_entries.id
  term: string;
  definition: string | null;   // null while enrichment_status !== 'ready'
  href: string;                // `/vocab/${id}`
};

// components/daily/daily-card.tsx
type DailyCardProps = {
  items: DailyCardItemView[];      // 0..6. More than 6 is a programming error.
  shortCardAction?: React.ReactNode;  // rendered when items.length < 6
  className?: string;
};
```

Structure:

```
<Card variant="raised" padding="none">          radius-lg, 1px line (dark), shadow-card
  padding-block: 14px
  <ol>
    <DailyCardRow/> × items.length              52px each, hairline between
  </ol>
  {items.length < 6 && shortCardAction}         one ghost Button, 44px, below the rows
</Card>
```

`DailyCardRow` (`components/daily/daily-card-row.tsx`):

```ts
type DailyCardRowProps = { item: DailyCardItemView; position: number };
```

```
<li>  height: 52px exactly (padding-block 5px, content 42px)
  <Link href>  display:block; padding-inline:16px
    <span class="term">        serif 17px / line-height 22px / 600 / ink
                               white-space:nowrap; overflow:hidden; text-overflow:ellipsis
    <span class="definition">  serif 15px / line-height 20px / 400 / ink-muted
                               -webkit-line-clamp:1; display:-webkit-box
```

**Both lines are hard-clamped to exactly one line each. This is what makes the height
deterministic, and the no-scroll guarantee provable rather than hoped for.**
When `definition` is `null`, the second line renders a 12 px `Skeleton` at 60 % width, still
inside the same 20 px line box, so the row height does not change.

**Usage rules.**
- The card is not interactive as a whole; each row links to `/vocab/[id]`.
- The card never scrolls, never grows, never animates its height.
- Fewer than six items: rows collapse, the card shrinks, the slack falls into the shell's
  flexible row. F5 passes `shortCardAction` (a `ghost` "Add more words" link to `/vocab/new`).
  **Never pad with placeholder rows** — the roadmap forbids filler.
- The definition string must be short. F3 must generate ≤ **60 characters**; beyond ~48
  characters at 15 px in a 311 px line box, the ellipsis becomes visible on most terms.
  This is a contract on F3, restated in §10.

---

## 7. The no-scroll daily card layout budget

### 7.1 Why `dvh`, and why not the others

iOS Safari has three viewport heights and picking wrong is the classic failure:

| Unit | Means | On iPhone |
|---|---|---|
| `vh` / `lvh` | **large** viewport — as if the browser toolbars were hidden | **Taller than what is visible.** `height: 100vh` puts the bottom ~50 px of your layout *underneath* the URL bar and makes the page scrollable. This is the bug. |
| `svh` | **small** viewport — toolbars shown | Always visible, never grows. Safe but wastes space when the toolbar collapses. |
| `dvh` | **dynamic** — whatever is visible right now | Tracks the toolbar. `min(dvh) === svh`, `max(dvh) === lvh`. |

We use **`100dvh`**, with a progressive fallback chain:

```css
.dw-shell { height: 100vh; height: 100svh; height: 100dvh; }
```

(`dvh` shipped in Safari 15.4; the `svh` line catches 15.0–15.3; the `vh` line is the
never-reached last resort. Later declarations win where supported.)

**The key insight about the URL bar.** Safari collapses its toolbar in response to *page
scroll*. Our `/today` shell has `overflow: hidden` and no scrollable content, so **the
toolbar never collapses on that screen, and `100dvh` sits permanently at its minimum, which
equals `100svh`.** The dynamic unit is therefore *stable* here, not jittery. We nonetheless
design against that minimum, so:

- **If the bar collapses anyway** (user scrolls a child pane on another route, then swipes
  back; or a future Safari changes the heuristic) `dvh` grows. Growth is absorbed entirely by
  the shell's single `1fr` row — a piece of empty space between the card and the tab bar.
  No text moves, no reflow of the card, no jitter during the collapse animation.
- **If it re-expands**, `dvh` shrinks back to exactly the value we budgeted for. It cannot go
  lower, because expanded *is* the minimum.

Corollaries, all enforced in `Screen`:
- The `1fr` row must be the **only** flexible row, and must carry `min-height: 0` so it can
  shrink below its content instead of forcing the grid taller.
- The header and tab bar are `auto` grid rows, not `position: fixed`. Fixed positioning
  against a viewport whose height is changing under animation is the other classic bug.
- Nothing animates `height` or `top`. `dvh` resizes are absorbed structurally, never
  transitioned.

### 7.2 The arithmetic

Reference width **375 px** (iPhone SE / mini / 12 mini). All values in CSS px.

**Daily card interior — bottom-up, all fixed:**

```
  term line box                                    22
+ definition line box                              20
  ------------------------------------------------ 42   row content
+ row padding-block (5 top + 5 bottom)             10
  ================================================ 52   ONE ROW  (= --dw-row-h)

  6 rows        6 × 52                            312
+ hairline dividers   5 × 1                         5
+ card padding-block  14 × 2                       28
+ card border         1 × 2                         2
  ================================================ 347  DAILY CARD
```

**`/today` screen stack:**

```
  env(safe-area-inset-top)                          T   Safari: 0 · standalone PWA: 20–59
+ PageHeader                                       48
+ week strip block (8 margin + 48 cells)           56
+ gap card↕strip                                   12
+ DailyCard                                       347
+ flexible slack row (1fr, minimum)                 8
+ TabBar content row                               49
+ env(safe-area-inset-bottom)                       B   SE: 0 · notched: 34
  ================================================
  FIXED SUBTOTAL                                  520
  REQUIREMENT:      100dvh  ≥  520 + T + B
```

**Device ledger** (measure and record the real numbers in step 14; these are the design
assumptions):

| Device / mode | `100dvh` | T | B | Needed | **Slack** |
|---|---|---|---|---|---|
| iPhone SE 3rd gen, Safari, bar expanded | ~596 | 0 | 0 | 520 | **+76** |
| iPhone SE 3rd gen, Safari, bar collapsed | ~641 | 0 | 0 | 520 | +121 |
| iPhone SE 3rd gen, standalone PWA | 667 | 20 | 0 | 540 | +127 |
| iPhone 13 mini, Safari, expanded | ~733 | 0 | 34 | 554 | +179 |
| iPhone 12/13/14 (390 w), Safari, expanded | ~758 | 0 | 34 | 554 | +204 |
| iPhone 15/16 (393 w), Safari, expanded | ~773 | 0 | 34 | 554 | +219 |
| iPhone 15, standalone PWA | 852 | 59 | 34 | 613 | +239 |

**The binding case is iPhone SE in Safari with the URL bar expanded, at +76 px of slack.**
Everything else is comfortable. The budget therefore has room for one future 44 px element
on `/today` and still clears the worst device.

**Horizontal budget at 375 px** (why the term line cannot silently wrap):

```
  375 viewport
−  32 shell gutter (16 × 2)
−   2 card border
−  32 row padding-inline (16 × 2)
  ==== 309 px available per line
```
309 px at 17 px Source Serif 4 Semibold ≈ 26–30 characters before the ellipsis appears; at
15 px Regular ≈ 44–48 characters. Hence the ≤ 60-character contract on definitions in §10 —
it keeps the ellipsis rare rather than constant.

### 7.3 Enforcement

Three independent guards, because one is not enough:

1. **Structural.** `.dw-shell { overflow: hidden }` and `main { overflow: hidden }` on
   `/today`. Even a miscalculation cannot produce a scrollbar; it would clip, which is loud
   and gets noticed.
2. **Deterministic.** Every row is exactly 52 px because both text lines are hard-clamped
   with a fixed `line-height`. No font, no string, and no locale can change the height.
3. **Mechanical.** `tests/e2e/no-scroll.spec.ts` asserts, at `devices['iPhone SE']`, in both
   `colorScheme: 'light'` and `'dark'`:
   - `document.scrollingElement.scrollHeight <= clientHeight + 1`
   - `[data-testid="daily-card"]` → `scrollHeight === clientHeight`
   - the tab bar's `getBoundingClientRect().bottom <= window.innerHeight + 1`
   - all six rows have `offsetHeight === 52`
   run against a fixture card containing a 24-character term and a 140-character definition.

### 7.4 Escape hatch (deliberate, documented)

If Safari page zoom is set above 100 % for the site, or a future iOS shrinks the viewport
below 520 px, the budget cannot hold. In that case `/today`'s content area is permitted to
scroll: `Screen` applies `overflow-y: auto` when `@media (max-height: 545px)` matches.
The *card itself* still never scrolls internally. Degrading to a scrolling page is
acceptable; clipping a word off the bottom of a card is not.

---

### 7.5 Touch targets and iOS Safari traps

All of this lives in the base layer of `app/globals.css`.

#### 7.5.1 The 16 px input rule

Mobile Safari zooms the viewport when a focused form control has a computed `font-size`
below **16 px**. The zoom is not undone on blur; the user is left in a magnified,
horizontally-scrollable page. There is no way to detect or reverse this, and
`user-scalable=no` in the viewport meta is both ignored by modern iOS and an accessibility
violation.

Our `--text-base` is **17 px**, which clears it. Belt and braces:

```css
@layer base {
  input, textarea, select, button {
    font: inherit;
    font-size: max(1rem, var(--text-base));   /* never below 16px, ever */
  }
}
```

`select` is included even though the app has none, so a future one cannot regress this.
`type="number"` is banned in §6.6 for a related reason: iOS renders it with a numeric keypad
that hides the return key and it triggers spinner UI on some builds. Use
`inputMode="numeric"` on a `type="text"` field instead.

#### 7.5.2 Tap highlight

```css
@layer base {
  * { -webkit-tap-highlight-color: transparent; }
}
```

iOS paints a translucent grey rectangle over any tapped element, which ignores our radii and
looks like a rendering bug on a card with 14 px corners. Removing it removes *all* tap
feedback, which is worse — so **every interactive component in §6 defines an explicit
`:active` state**, and that is a review requirement, not a suggestion. Feedback must appear
within one frame: use `background-color` or `opacity` transitions of ≤ 120 ms, never
`transform: scale` on text (it reflows and looks cheap at 3×).

#### 7.5.3 Overscroll / rubber-band

```css
@layer base {
  html, body { height: 100%; overscroll-behavior: none; }
  body { overflow: hidden; background: var(--color-paper); }
}
.dw-content { overscroll-behavior-y: contain; -webkit-overflow-scrolling: auto; }
```

- `overscroll-behavior: none` on the document kills the whole-page rubber-band, which on a
  non-scrolling app shell reads as brokenness.
- `overscroll-behavior-y: contain` on the scrolling content pane stops **scroll chaining** —
  reaching the bottom of the vocab list must not start bouncing the shell behind it.
- `background` is set on `body`, not just the shell, so the overscroll gutter (which still
  exists in the standalone PWA) is paper-coloured rather than white-in-dark-mode.
- `-webkit-overflow-scrolling: touch` is **not** used. It has been a no-op since iOS 13 and
  it creates stacking contexts that break `position: sticky`.

#### 7.5.4 Edge-swipe back

This is the reason the roadmap forbids modals for navigation, and F2 must not undo it.

Rules, all enforceable by code review:
1. **Never set `touch-action: none` on any element that spans the viewport width**, and never
   on `html`/`body`/`.dw-shell`. Interactive elements get `touch-action: manipulation`
   (which disables the 300 ms double-tap-zoom delay while leaving panning and system gestures
   intact) — never `none`.
2. **No `preventDefault()` on `touchstart`/`touchmove`** anywhere in this codebase. There are
   no swipe handlers in v0.1.0.
3. **No horizontal swipe gestures at all.** Month navigation on `/calendar` uses prev/next
   buttons. Mine/Discover uses `SegmentedTabs` links. Both are deliberate: a horizontal swipe
   starting within ~20 px of the screen edge is claimed by iOS for back-navigation, so any
   swipe UI is unreliable in exactly the region a one-handed user's thumb reaches first.
4. **Never `history.replaceState` on a user-initiated navigation.** Replacing entries removes
   the destination the back-swipe would return to. Filters and tab state go in the URL via
   `<Link>` (push), not `replaceState`.
5. `ConfirmSheet` is the only overlay, it is a native `<dialog>`, and `Escape` / backdrop tap
   close it. It does not push a history entry, so a back-swipe with the sheet open navigates
   the page — acceptable, because the sheet is only ever opened by a direct tap and confirms
   nothing destructive without a second tap.

#### 7.5.5 Remaining base layer

```css
@layer base {
  html {
    -webkit-text-size-adjust: 100%;   /* stop Safari inflating text on rotate */
    text-size-adjust: 100%;
    font-family: var(--font-sans);
    color: var(--color-ink);
    background: var(--color-paper);
  }
  /* Sticky hover: on iOS, :hover latches after a tap until the next tap elsewhere. */
  @media (hover: hover) and (pointer: fine) { /* all :hover rules go inside this */ }

  /* Chrome (nav, buttons, labels) is not selectable; content is. */
  nav, button, [role="tab"], .dw-chrome {
    -webkit-user-select: none; user-select: none; -webkit-touch-callout: none;
  }
  /* Words, definitions, journal text and chat MUST stay selectable — the user
     will long-press a term to use iOS Look Up. Never blanket user-select:none. */

  :focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  :focus:not(:focus-visible) { outline: none; }

  /* iOS autofill repaints inputs pale yellow and ignores background-color. */
  input:-webkit-autofill {
    -webkit-text-fill-color: var(--color-ink);
    box-shadow: 0 0 0 1000px var(--color-surface-sunken) inset;
    caret-color: var(--color-ink);
  }

  img, svg { max-width: 100%; display: block; }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 1ms !important; animation-iteration-count: 1 !important;
      transition-duration: 1ms !important; scroll-behavior: auto !important;
    }
  }
}

/* Wider than a phone: centre the column, do not redesign. */
.dw-shell { margin-inline: auto; max-width: var(--breakpoint-phone); }
```

Touch target minimums, restated as a single enforceable rule: **44 × 44 px, always.**
`--dw-touch-min: 44px`. Where the visual is smaller (calendar cell 32 px, header back chevron
24 px glyph, spinner), the *element* is still 44 px and the visual is centred inside it.
Adjacent independent targets keep ≥ 8 px of dead space between them.

---

## 8. Claude Design sync workflow

### 8.1 What this bridge is and is not

The `DesignSync` tool moves **files** between this repository and the user's design-system
project at `claude.ai/design`, project id **`8c1c015d-78c9-4945-8382-23bf124f2333`**
(currently **empty** — the first push creates everything).

**Claude Design cannot be prompted programmatically.** There is no API call from this session
that says "design me a button". Generative design happens *in the browser*, by the user, in
that project. `DesignSync` is a two-way **file channel** around that:

- **Push (repo → browser):** publish the preview HTML so the kit is reviewable on a phone and
  so the browser-side design work starts from the real tokens instead of from nothing.
- **Pull (browser → repo):** `get_file` retrieves whatever the user generated or edited in
  the browser, which is then read by a Claude session and **hand-ported** into
  `styles/tokens.css` and the React components. There is no automatic import. The React
  components in `components/` are always the source of truth for the shipped app; the design
  project is a review-and-exploration surface.

### 8.2 Local layout

```
design/
  README.md                     the rules below, for whoever opens this next
  .dssync-manifest.json         { "00-foundations.html": "<sha256>", ... }
  previews/
    _shared.css                 plain-CSS component styles (no Tailwind in previews)
    00-foundations.html
    01-typography.html
    02-buttons.html
    03-inputs.html
    04-surfaces.html
    05-daily-card.html
    06-navigation.html
    07-calendar.html
    08-chat.html
    09-gamification.html
    10-screens.html
scripts/
  build-previews.mjs            inlines tokens.css + _shared.css into each preview
  dssync-changed.mjs            lists previews whose sha256 ≠ manifest
```

Every preview is **fully standalone**: one HTML file, all CSS inlined, no external requests,
no fonts loaded from a CDN (previews declare `font-family: Georgia, serif` as the serif
stand-in and note it in a caption — the point of a preview is layout and colour, and pulling
a font over the network would break the self-contained rule).

### 8.3 `@dsCard` group labels

**The very first line of each preview file must be the card comment.** Anything before it —
a doctype, a blank line, a BOM — and the Design System pane will not render a preview card.

| File | First line |
|---|---|
| `00-foundations.html` | `<!-- @dsCard group="Foundations" -->` |
| `01-typography.html` | `<!-- @dsCard group="Typography" -->` |
| `02-buttons.html` | `<!-- @dsCard group="Buttons" -->` |
| `03-inputs.html` | `<!-- @dsCard group="Inputs" -->` |
| `04-surfaces.html` | `<!-- @dsCard group="Surfaces" -->` |
| `05-daily-card.html` | `<!-- @dsCard group="Daily Card" -->` |
| `06-navigation.html` | `<!-- @dsCard group="Navigation" -->` |
| `07-calendar.html` | `<!-- @dsCard group="Calendar" -->` |
| `08-chat.html` | `<!-- @dsCard group="Chat" -->` |
| `09-gamification.html` | `<!-- @dsCard group="Gamification" -->` |
| `10-screens.html` | `<!-- @dsCard group="Screens" -->` |

Group labels are Title Case, human-readable, and **stable** — they are the card identity in
the pane. Renaming a group orphans its card. The numeric filename prefixes control ordering;
do not renumber existing files, append new ones.

### 8.4 Tool call sequence

**Read before you write. Always. Three reads, one plan, one write.**

First push (project is empty):

```
1. DesignSync.list_projects
   → confirm 8c1c015d-78c9-4945-8382-23bf124f2333 is present; note its name.
     If it is absent, STOP and report — do not create a project.

2. DesignSync.list_files  { project_id: "8c1c015d-78c9-4945-8382-23bf124f2333" }
   → expect []. If it is NOT empty, the user has been working in the browser:
     go to the incremental flow instead and do not overwrite anything.

3. (skipped on first push — nothing to get)

4. DesignSync.finalize_plan
   → declare all 11 previews as additions, with the group label of each.

5. DesignSync.write_files
   → all 11 files, each with its @dsCard first line.

6. node scripts/dssync-changed.mjs --write-manifest
   → record the sha256 of each pushed file in design/.dssync-manifest.json, and commit it.
```

Incremental update (**the normal case — one component at a time**):

```
1. npm run design:build
   → regenerate previews so inlined tokens match styles/tokens.css.

2. node scripts/dssync-changed.mjs
   → prints ONLY the files whose sha256 differs from the manifest.
     If it prints nothing, stop. There is nothing to push.

3. DesignSync.list_files { project_id }
   → confirm the file you are about to touch still exists under the expected name.

4. DesignSync.get_file { project_id, path: "<the one file>" }
   → READ THE REMOTE VERSION FIRST. If it differs from the last-pushed content in a way
     you did not author, the user edited it in the browser. STOP and reconcile:
     port their change into design/previews/ and into the React component, then re-run.

5. DesignSync.finalize_plan
   → declare exactly the changed files. Never "sync everything".

6. DesignSync.write_files
   → the changed files only.

7. node scripts/dssync-changed.mjs --write-manifest && git add design/.dssync-manifest.json
```

### 8.5 Rules

1. **Never wholesale-replace.** `write_files` receives only files whose hash changed. The
   manifest exists to make that mechanical rather than a judgement call.
2. **Read before write, every time.** Step 4 above is what prevents this bridge from
   destroying browser-side work. The project is a shared surface with a human in it.
3. **A token change is the one legitimate bulk push.** Editing `styles/tokens.css` changes the
   inlined block in all 11 previews. That is fine — but run steps 3–4 for each file first,
   and say so in `finalize_plan`.
4. **Previews are generated, never hand-edited.** Edit `_shared.css` or the preview body
   between the `<!-- @dw:tokens:start -->` / `end` markers; `build-previews.mjs` owns
   everything between the markers.
5. **The repo wins on conflict for anything that ships.** If browser-generated design and the
   React components disagree, the components are what users see; port the design in
   deliberately, run the Playwright layout spec, then push the preview back.
6. **If `DesignSync` is unavailable in the executing session** (it was not present in the
   session that authored this plan), stop at step 2 of §8.4, leave the previews built on disk,
   and report. `npm run design:build` produces reviewable files with or without the bridge.

---

## 9. Implementation steps

Ordered. Each step is independently verifiable; do not start the next until the stated check
passes.

1. **Verify F1 preconditions.** Confirm `app/globals.css` contains `@import "tailwindcss";`,
   `tsconfig.json` has the `@/*` alias, the four tab routes exist, and `app/layout.tsx`'s
   viewport export includes `viewport-fit: "cover"` — add it if missing.
   *Check:* `npm run dev`, all four routes load.

2. **Install dependencies.** `npm i clsx tailwind-merge` and `npm i -D @playwright/test`,
   then `npx playwright install --with-deps chromium webkit`. Add the three npm scripts.
   *Check:* `npm ls clsx tailwind-merge` resolves; `npx playwright --version` prints.

3. **Write `styles/tokens.css`** exactly as §5.1.
   *Check:* file parses; `npm run build` still succeeds.

4. **Rewrite `app/globals.css`** with the imports, `@theme inline`, `@theme`, `:root` layout
   constants, and the full base layer from §5.2 and §7.5.
   *Check:* a scratch page using `bg-paper text-ink border-line rounded-lg shadow-card
   font-serif text-lg` renders correctly, and toggling the OS colour scheme repaints it.

5. **Add `app/fonts.ts`** and wire the variable class onto `<html>` in `app/layout.tsx`.
   Add `<meta name="theme-color">` entries for both schemes (`#F7F4EE` / `#131211`).
   *Check:* DevTools shows the self-hosted woff2 loading from `/_next/static/media/`, and no
   request to `fonts.gstatic.com` at runtime.

6. **Add `lib/ui/cn.ts`, `lib/ui/types.ts`, `lib/ui/layout.ts`.**
   *Check:* `npx tsc --noEmit` clean.

7. **Build `components/icons/index.tsx`** — eight 24 px inline SVGs, `stroke="currentColor"`,
   `strokeWidth` prop-driven, `aria-hidden="true"`, `focusable="false"`.
   *Check:* render all eight on a scratch page at 24 px; all optically balanced.

8. **Build `Screen` + `PageHeader` + `TabBar` + `tab-items.ts`.** Replace F1's shell. Apply
   `Screen` to all four tab routes.
   *Check:* on all four routes the header and tab bar are pinned, the middle scrolls,
   `aria-current` follows the route, and the tab bar clears the home indicator on a notched
   device (or in Safari responsive mode with a simulated inset).

9. **Build the primitives:** `Card`, `ListRow`, `Button`, `Field`, `TextInput`, `TextArea`,
   `EmptyState`, `Spinner`, `Skeleton`.
   *Check:* each renders in `/kitchen-sink` (built incrementally from here on); every
   interactive element measures ≥ 44 px; input focus does not zoom on a real iPhone.

10. **Build `DailyCardRow` and `DailyCard`.** Fixed `line-height: 22px` / `20px`, `truncate`
    on the term, `line-clamp-1` on the definition, `data-testid` on the card and each row.
    *Check:* in `/kitchen-sink`, a row with a 40-character term and a 200-character definition
    still measures exactly 52 px in DevTools.

11. **Assemble the `/today` skeleton** with a hard-coded 6-item fixture, `Screen
    scroll={false}`, a placeholder 56 px week strip, and the `DailyCard`.
    *Check:* at 375 × 667 the page does not scroll, in both themes. Measure the real slack and
    compare it with the +76 px predicted in §7.2.

12. **Write `playwright.config.ts` and `tests/e2e/no-scroll.spec.ts`** per §12 items 8–9.
    *Check:* `npm run test:layout` passes. **Then deliberately break it** — change a row's
    `line-height` to `28px` — and confirm the spec fails. A test that has never failed is not
    a test.

13. **Build the remaining components:** `ChatBubble` + `ChatBubbleTyping`, `BadgeChip`,
    `LevelPill`, `CalendarCell`, `SegmentedTabs`, `ConfirmSheet`,
    `lib/ui/use-visual-viewport.ts`.
    *Check:* all present in `/kitchen-sink`; `ConfirmSheet` traps focus and closes on
    `Escape`; the calendar cell renders all six legal mark × today combinations.

14. **Run the full manual iPhone pass** — §12 items 10–19. Record the measured `dvh` values
    back into the §7.2 device ledger, replacing the estimates.
    *Check:* every item passes, and the ledger contains measurements, not estimates.

15. **Write `design/previews/_shared.css` and the 11 preview HTML bodies**, each with the
    `@dsCard` comment on line 1 and `<!-- @dw:tokens:start --> … <!-- @dw:tokens:end -->`
    markers around the injected block.
    *Check:* each file opens standalone in Safari at 375 px with an empty Network tab.

16. **Write `scripts/build-previews.mjs` and `scripts/dssync-changed.mjs`.** The build script
    injects tokens + shared CSS between the markers and **fails** if any file's line 1 is not
    a well-formed `@dsCard` comment.
    *Check:* §12 items 23, 24, 28, 29 all pass.

17. **First DesignSync push** — §8.4 first-push sequence, all five tool calls in order,
    then write the manifest and commit it.
    *Check:* §12 items 26–27 — 11 files listed, 11 cards visible in the Design System pane
    with the §8.3 group labels.

18. **Write `design/README.md`** stating the group labels, the marker convention, the
    read-before-write rule, and the one-file-at-a-time push discipline.
    *Check:* a reader who has never seen this plan can perform an incremental push from the
    README alone.

19. **Final sweep.** Run every grep in §12 items 3–7, `npm run build`, `npx tsc --noEmit`,
    and `npm run test:layout`.
    *Check:* all clean. F2 is done, and F3–F10 can start importing from §10.

---

## 10. Shared contracts exported to other features

Every path below is an import from the repository root via the `@/*` alias. **These names and
prop shapes are frozen once F2 lands.** A feature that needs a different shape adds a prop
with a default; it does not rename or repurpose.

### 10.1 Layout — used by all eight features

| Export | Path | Signature (abridged) |
|---|---|---|
| `Screen` | `@/components/layout/screen` | `{ title?, subtitle?, headerTrailing?, back?, tabBar?=true, scroll?=true, padded?=true, children }` |
| `PageHeader` | `@/components/layout/page-header` | `{ title, subtitle?, back?, trailing? }` |
| `TabBar` | `@/components/nav/tab-bar` | `{}` — rendered by `Screen`, not by routes |
| `TAB_ITEMS`, `TabKey` | `@/components/nav/tab-items` | frozen 4-item tuple |

**Contract:** every page is `<Screen …>{content}</Screen>`. Nothing sets `100vh`,
`position: fixed`, or `<body>` overflow.

### 10.2 UI kit

| Export | Path | Key props |
|---|---|---|
| `Card` | `@/components/ui/card` | `{ as?, variant?: "raised"\|"sunken"\|"outline", padding?: "none"\|"sm"\|"md" }` |
| `ListRow` | `@/components/ui/list-row` | `{ href?, onClick?, leading?, title, titleSlot?, subtitle?, trailing?, chevron?, size?, muted?, disabled? }` |
| `Button` | `@/components/ui/button` | `{ variant?: "primary"\|"secondary"\|"ghost", size?: "md"\|"lg", fullWidth?, href?, type?, loading?, disabled?, iconLeft?, onClick }` |
| `Field` | `@/components/ui/field` | `{ id, label, hint?, error?, required?, children }` |
| `TextInput` | `@/components/ui/text-input` | `{ id, name, value, onChange(value), type?, placeholder?, invalid?, maxLength?, autoCapitalize?, autoCorrect?, spellCheck?, enterKeyHint?, inputMode? }` |
| `TextArea` | `@/components/ui/text-area` | as `TextInput` + `{ rows?, autoGrow?, maxRows? }` |
| `EmptyState` | `@/components/ui/empty-state` | `{ title, body?, action?: {label, href?, onClick?}, variant?: "page"\|"inline" }` |
| `ChatBubble`, `ChatBubbleTyping` | `@/components/ui/chat-bubble` | `{ role: "user"\|"assistant", state?: "sent"\|"pending"\|"failed", onRetry? }` |
| `BadgeChip` | `@/components/ui/badge-chip` | `{ label, count?, earned?, date?, size? }` |
| `LevelPill` | `@/components/ui/level-pill` | `{ kind: "streak"\|"collector", label, tier, tierCount, size? }` |
| `CalendarCell` | `@/components/ui/calendar-cell` | `{ date, day, mark: "tick"\|"cross"\|"future", isToday?, href?, weekday? }` |
| `SegmentedTabs` | `@/components/ui/segmented-tabs` | `{ items: {label, href, match?}[] }` |
| `ConfirmSheet` | `@/components/ui/confirm-sheet` | `{ open, title, body?, confirmLabel, onConfirm, onCancel }` |
| `Spinner` | `@/components/ui/spinner` | `{ size?: 16\|20\|24 }` |
| `Skeleton` | `@/components/ui/skeleton` | `{ width?, height? }` |
| `DailyCard` | `@/components/daily/daily-card` | `{ items: DailyCardItemView[], shortCardAction? }` |
| icons | `@/components/icons` | `IconToday`, `IconVocab`, `IconJournal`, `IconProfile`, `IconChevronRight`, `IconPlus`, `IconTick`, `IconCross` — all `{ size?: number; className?: string }` |

Import per file (`@/components/ui/button`), not from a barrel. No `index.ts` is created; a
barrel re-export in a Next.js App Router project pulls every client component into any server
component that touches it.

### 10.3 Types and utilities

| Export | Path | Shape |
|---|---|---|
| `DailyCardItemView` | `@/lib/ui/types` | `{ id: string; term: string; definition: string \| null; href: string }` |
| `CalendarMark` | `@/lib/ui/types` | `"tick" \| "cross" \| "future"` |
| `ChatRole` | `@/lib/ui/types` | `"user" \| "assistant"` |
| `LevelKind` | `@/lib/ui/types` | `"streak" \| "collector"` |
| `TabKey` | `@/components/nav/tab-items` | `"today" \| "vocab" \| "journal" \| "profile"` |
| `cn` | `@/lib/ui/cn` | `(...inputs: ClassValue[]) => string` |
| `LAYOUT` | `@/lib/ui/layout` | `{ headerH: 48, tabBarH: 49, weekStripH: 56, rowH: 52, listRowH: 56, touchMin: 44, gutter: 16, cardPadY: 14, dailyCardH: 347, todayFixedTotal: 520, designFloorDvh: 545 }` |
| `useVisualViewport` | `@/lib/ui/use-visual-viewport` | `() => { height: number; keyboardOpen: boolean }` |

### 10.4 Token names other features may use

Colour utilities: `bg-paper`, `bg-surface`, `bg-surface-sunken`, `text-ink`, `text-ink-muted`,
`text-ink-faint`, `text-ink-ghost`, `border-line`, `border-line-strong`, `bg-accent`,
`text-accent`, `bg-accent-soft`, `text-accent-ink`, `bg-accent-strong`.
Type: `text-2xs … text-2xl`, `font-serif`, `font-sans`.
Radii: `rounded-xs|sm|md|lg|pill`. Shadow: `shadow-card`, `shadow-lift`.

**No feature may introduce a new colour, a new type size, or a new radius.** If one is
genuinely needed, amend §5 of this file and regenerate the previews.

### 10.5 Obligations F2 places on other features

| Feature | Obligation |
|---|---|
| F1 | viewport meta must include `viewport-fit=cover`; root layout must apply the font variable class and `<meta name="theme-color">` for both colour schemes |
| F3 | generated `definition` ≤ **60 characters**, one clause, no trailing period; `pronunciation` rendered in `font-sans` (IPA coverage) |
| F4 | `/vocab/[id]` is a `Screen` with `back={{href:"/vocab",label:"Vocab"}}`; "mark as mastered" uses `ConfirmSheet` |
| F5 | `/today` renders `<Screen scroll={false}>`; passes at most 6 `DailyCardItemView`; supplies `shortCardAction`; calendar uses `CalendarCell` for both week strip and month grid |
| F6 | chat pane scrolls, composer uses `TextArea autoGrow` + `useVisualViewport`; the assistant's opening turn is the first `ChatBubble` |
| F7 | onboarding screens pass `tabBar={false}`; one question per `Screen`; skip link is a `ghost` Button |
| F8 | Discover lives behind `SegmentedTabs` on `/vocab`, not a new tab |
| F9 | uses the roadmap's exact level and badge title strings with `LevelPill` / `BadgeChip`; wraps chips, never truncates |
| F10 | journal composer uses `TextArea`; entry body is `font-serif text-base`; insight is a `Card variant="outline"` |

---

## 11. Edge cases and failure modes

| # | Case | Behaviour / mitigation |
|---|---|---|
| 1 | Term longer than the 309 px line ("incomprehensibilities") | Single line, `text-overflow: ellipsis`. **Never wraps.** Row stays 52 px. Full term is on `/vocab/[id]`. |
| 2 | Definition longer than one line | `-webkit-line-clamp: 1`. Row stays 52 px. Mitigated upstream by F3's 60-char contract. |
| 3 | `definition === null` (enrichment pending or failed) | Second line renders a 12 px `Skeleton` at 60 % width inside the same 20 px box. Height unchanged. |
| 4 | 0 active words | `/today` shows `EmptyState`, not an empty card. |
| 5 | 1–5 active words | Card renders that many rows and shrinks; slack goes to the `1fr` row; `shortCardAction` appears. **No filler rows.** |
| 6 | More than 6 items passed to `DailyCard` | Dev: throw. Prod: slice to 6 and `console.warn`. Silent overflow would break the budget. |
| 7 | Safari page zoom > 100 % | `@media (max-height: 545px)` re-enables scrolling on the `/today` content area. Degrade, don't clip. |
| 8 | Landscape on a phone | Height collapses below the floor; case 7 applies. No landscape-specific layout is designed. |
| 9 | iPad / desktop browser | `max-width: 430px` centred column on `bg-paper`. Correct, not optimised. Not tested. |
| 10 | Standalone PWA (added to Home Screen) | `env(safe-area-inset-top)` becomes 20–59 px and `dvh` becomes the full screen; the budget was computed with `T` as a variable, so both cases hold. Verify on device — this is the least-exercised path. |
| 11 | `viewport-fit=cover` missing | All `env(safe-area-inset-*)` return `0`; the tab bar sits under the home indicator on notched phones. **Check this first** when the tab bar looks wrong. F1 obligation, §10.5. |
| 12 | Keyboard opens on `/vocab/new` or chat | iOS resizes only the *visual* viewport, not the layout viewport, so `dvh` does not change and the tab bar stays under the keyboard. `useVisualViewport` lets F6 translate the composer; `TextInput` calls `scrollIntoView({block:'center'})` on focus. |
| 13 | Sticky `:hover` after a tap | All hover rules are inside `@media (hover: hover) and (pointer: fine)`. |
| 14 | Font file fails to load | `next/font` emits size-adjusted metric fallbacks; and row heights are fixed by explicit `line-height`, so even a total font failure cannot change the budget. |
| 15 | Dark mode with the light accent | Would be 2.6:1 and unreadable. Prevented by the accent inverting in `tokens.css`; verified by running the Playwright spec with `colorScheme: 'dark'`. |
| 16 | `forced-colors` / Increase Contrast | Focus rings use `outline`, not `box-shadow`, so they survive. `prefers-contrast: more` darkens `ink-muted` and `line`. |
| 17 | User long-presses a word to use iOS Look Up | Works — `user-select` is only disabled on chrome. Regressing this by adding a blanket `user-select: none` is a bug, not a tidy-up. |
| 18 | Long badge titles wrapping ("No Weekend Without Ration Card") | Chips wrap in a `flex-wrap` container. Never truncate a badge name. |
| 19 | Tab bar backdrop blur unsupported / disabled | `background: color-mix(paper 88%)` is already near-opaque; the fallback is a solid-ish bar, still legible. |
| 20 | `@theme inline` misused | If a token is declared in a plain `@theme` block instead of `@theme inline`, Tailwind copies the *value* at build time and dark mode silently stops working for that utility. Colour and shadow tokens go in the `inline` block; scale tokens go in the plain block. |
| 21 | A feature hard-codes a hex colour | Caught by review and by the grep in §12. There are no hex literals outside `styles/tokens.css`. |
| 22 | Preview drift from app tokens | `npm run design:build && git diff --exit-code design/previews` in CI/verification. |
| 23 | `DesignSync` project not empty on first push | Someone worked in the browser. Switch to the incremental flow; never blind-write. |
| 24 | `@dsCard` comment not on line 1 | No preview card renders. Assert it in `build-previews.mjs` and fail the build. |
| 25 | Reduced motion | Global override reduces all durations to 1 ms. `ConfirmSheet` appears instantly. |

---

## 12. Verification checklist

Run in order. Every item has a stated expected result.

### Build and types

1. `npm run build` → exits 0, no TypeScript errors, no Tailwind "unknown utility" warnings.
2. `npx tsc --noEmit` → exits 0.
3. `grep -rnE '#[0-9a-fA-F]{6}' app components lib --include='*.tsx' --include='*.ts'`
   → **no matches.** All colour lives in `styles/tokens.css`.
4. `grep -rn '100vh' app components styles` → matches **only** the fallback line in
   `app/globals.css`.
5. `grep -rn 'dark:' app components` → **no matches.** Dark mode is token-driven.
6. `grep -rn 'position: *fixed\|position-fixed\|fixed inset' components app` → no matches
   outside `confirm-sheet.tsx`.
7. `grep -rn 'preventDefault' components` → no matches on touch events.

### Layout (the one that matters)

8. `npm run test:layout` → `tests/e2e/no-scroll.spec.ts` passes. Specifically, at
   `devices['iPhone SE']` (375 × 667), in **both** colour schemes, with a fixture of 6 items
   whose terms are 24 chars and definitions are 140 chars:
   - `document.scrollingElement.scrollHeight <= clientHeight + 1` ✅
   - every `[data-testid="daily-card-row"]` has `offsetHeight === 52` ✅
   - `[data-testid="daily-card"]` `scrollHeight === clientHeight` ✅
   - `[data-testid="tab-bar"]` `.getBoundingClientRect().bottom <= innerHeight + 1` ✅
   - the same assertions with `items.length` of 0, 1, 3, and 6 ✅
9. In the same spec, assert `LAYOUT.todayFixedTotal === 520` and that the measured
   `/today` content height ≤ `window.innerHeight`. If the constants and the DOM disagree,
   someone changed CSS without changing `lib/ui/layout.ts`.

### Manual, on a real iPhone (irreplaceable — do all of these)

10. Open `/today` in **iOS Safari**. Scroll-drag the card downward hard: **the page must not
    move at all**, and no rubber-band gutter appears.
11. Rotate to landscape and back: layout recovers; no clipped row.
12. Settings → Display → toggle Dark Mode with the page open: colours repaint, the accent
    lightens, nothing becomes unreadable.
13. Tap a card row: `:active` feedback is visible within one frame, and **no grey rectangle**
    appears over the row.
14. Focus the input on `/vocab/new`: **the page does not zoom.** Blur: nothing shifted.
15. From `/vocab/[id]`, swipe from the left screen edge: **back-navigation works**, returning
    to `/vocab` with scroll position intact.
16. Long-press a word on the card: the iOS selection/Look Up menu appears.
17. Add to Home Screen, launch standalone: tab bar clears the home indicator; the header
    clears the status bar / notch; the card still does not scroll.
18. Repeat 10 and 18 on an iPhone SE (or Safari responsive mode at 375 × 667 with the
    toolbar simulated) — this is the binding case in §7.2.
19. `/kitchen-sink` at 375 px: every component and every variant renders; no overflow;
    check in both themes.

### Accessibility

20. VoiceOver on `/today`: card rows announce "{term}, {definition}, link"; tab bar announces
    "Primary, tab bar", and the active tab announces "current page"; `future` calendar cells
    are skipped.
21. Every interactive element measured ≥ 44 × 44 px in DevTools (spot-check tab items,
    calendar cells, card rows, header back chevron).
22. Contrast spot-check with a picker against the §5.4 ledger — the four body pairs
    (`ink`, `ink-muted`, `ink-faint`, `accent` on `surface`) in both themes.

### Design bridge

23. `npm run design:build` → 11 files written; each begins with `<!-- @dsCard group="…" -->`
    on line 1 (the script asserts this and exits non-zero otherwise).
24. `git diff --exit-code design/previews` immediately after a build → clean. A dirty tree
    means someone hand-edited a generated file.
25. Open each preview locally in Safari at 375 px width → renders standalone with no console
    errors and no network requests (check the Network tab is empty).
26. `DesignSync.list_projects` → project `8c1c015d-78c9-4945-8382-23bf124f2333` is listed.
27. After the push, `DesignSync.list_files` → 11 files; the Design System pane shows 11
    preview cards with the group labels from §8.3.
28. Change one token in `styles/tokens.css`, run `npm run design:build`, then
    `node scripts/dssync-changed.mjs` → lists all 11. Revert, rebuild → lists none.
29. Change only `02-buttons.html`'s body, rebuild → `dssync-changed` lists **exactly one**
    file. This proves the incremental path works.

---

## 13. Open questions / discrepancies with `ROADMAP_v0.1.0.md`

Per the roadmap's instruction, these are reported rather than guessed at. **None of them
block starting F2**; each has a stated default that the plan proceeds with.

1. **"Sheet" appears in the roadmap's F2 description but modals are forbidden elsewhere.**
   The F2 blurb (line ~321) lists "card, list row, tab bar, **sheet**, button, input, empty
   state, chat bubble, badge chip", while the "Vocab detail is a page, not a modal" section
   forbids full-page modals on iOS Safari. *Resolution taken:* build `ConfirmSheet` — a
   native `<dialog>` restricted to two-button confirmations, explicitly barred from carrying
   navigation, forms, or scrollable content (§6.14), and used in exactly two places. This
   honours the word "sheet" without reintroducing what the modal ban protects against. If the
   intent was "no sheets at all", delete `components/ui/confirm-sheet.tsx` and inline the
   confirmations as a second tap on the same button.

2. **`SegmentedTabs` is not in the roadmap's component list**, but the route map requires
   `/vocab` with "tabs: **Mine** / **Discover**". Something must render those tabs. *Default:*
   build it, link-based (each segment is a real URL, so back-swipe and reload both work). It
   is a small addition, and the alternative — two separate routes with no visible switch — is
   worse for the user.

3. **`LevelPill` and `CalendarCell` are also not in the roadmap's F2 list** but are required
   by F9 and F5 respectively. *Default:* they belong here, because both are pure presentation
   with feature-supplied data, and putting them in F5/F9 would duplicate token knowledge.

4. **The roadmap says the tab bar is F1's ("the bottom tab bar and app shell") and also F2's
   ("tab bar" in the component list).** *Default:* F1 builds a functional stub so routing
   works; F2 replaces the implementation with the styled `TabBar` + `Screen`. F2 is the owner
   from that point on. If F1 shipped something more elaborate, F2 still replaces it —
   the height budget in §7 depends on the tab bar being a grid row, not fixed.

5. **`viewport-fit=cover` is not named anywhere in the roadmap**, but "respecting iOS
   safe-area insets" is required and `env(safe-area-inset-*)` silently returns `0` without it.
   *Default:* F2 verifies and adds it to `app/layout.tsx`'s viewport export if F1 omitted it.
   Recorded here because it is an edit to an F1-owned file.

6. **Dark mode is not mentioned in the roadmap at all.** The task brief for F2 requires it
   ("since iOS users get dark mode"). *Default:* full dark support, system-driven only, no
   toggle. This adds no screens and no settings, so it does not violate the simplicity
   principle. Flagged only because it doubles the colour ledger everyone must respect.

7. **Two new runtime dependencies** — `clsx` and `tailwind-merge` (~4 KB combined, both MIT).
   The roadmap says "no component library"; these are class-string utilities, not components,
   and both are free forever, so principles 3 and the "no component library" rule are intact.
   Named here so nobody is surprised. `@playwright/test` is a dev dependency only and never
   ships.

8. **`prefers-reduced-transparency` is not handled.** The tab bar's `backdrop-filter` will
   still blur for users who ask for reduced transparency. Low impact (the fill is already
   88 % opaque). Deferred; add a media query if it is ever noticed.

9. **Device `dvh` values in §7.2 are design assumptions, not measurements.** The arithmetic is
   exact; the "available height" column is estimated from screen size minus typical Safari
   chrome. Step 14 of §9 / item 18 of §12 requires measuring the real numbers on an iPhone SE
   and recording them back into this file. The +76 px slack is comfortable enough that a
   ±20 px estimation error does not change any decision, but the numbers should stop being
   estimates.

10. **`--dw-weekstrip-h: 56px` is F2's budget allocation for an F5-owned component.** If F5's
    week strip needs more than 56 px, the budget must be re-derived here first — it cannot be
    absorbed silently, because the SE case only has 76 px of slack.
