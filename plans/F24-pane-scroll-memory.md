# F24 — Pane scroll memory

**Card:** [daily-words#2](https://github.com/miftahulmahfuzh/daily-words/issues/2)
— *Journal list loses its scroll position when you come back from an entry.*
**Round 1**, 2026-09-01. Branch `task/2-journal-list-loses-its-scroll-position`.

---

## 1. The bug, and why nothing in the platform fixes it

Scroll a long way down `/journal`, tap a line, come back: the list is at the top
again. The user has to re-scroll every time.

Two independent facts produce it, and they have to be separated because only the
first is in scope.

**The app has no scrollable page.** `Screen` is a fixed-height flex column with
`overflow: hidden`, and scrolling is an inner `.dw-pane-scroll` pane's business
(`src/components/layout/screen.tsx`, `src/app/globals.css:251`). So
`window.scrollY` is permanently `0`, and *both* the browser's native scroll
restoration and Next's restore exactly that number. Neither is broken; neither
has anything to restore. `src/components/vocab/mine-client.tsx` already wrote
this down for the Collection, named it structural rather than an oversight, and
named where the fix belongs:

> If it is ever wanted it belongs in `screen.tsx`, for every scrolling pane, not
> here.

**Back is not always a `popstate`.** `BackLink` is a real `<Link href>`, on
purpose — it has to work when the app is launched cold at a deep route. So the
in-app back arrow is a *push*, the iOS edge-swipe is a *pop*, and `Delete` is a
`router.replace`. Any fix keyed on `popstate` would work for one of the three.
Keying on **mount** covers all three for free, and that is what this does. (The
card listed the push/pop distinction as unverified; it is verified here by
reading `back-link.tsx`, and the design makes it not matter.)

## 2. What was chosen

A **pane-scoped scroll memory**, opt-in per screen, living in the layout layer:

- `ScreenBody` gains one prop, `restoreScroll?: string`. When set it stamps the
  scrolling pane with `data-dw-scroll-key` and renders `<PaneScrollMemory>`.
- `PaneScrollMemory` (`src/components/layout/pane-scroll-memory.tsx`) is a client
  component that **renders `null`**. It finds the pane by that attribute, writes
  `scrollTop` into `sessionStorage` on scroll (rAF-throttled), and puts it back
  on mount.
- `/journal` passes `JOURNAL_SCROLL_KEY`. Nothing else opts in.

Three things about the shape are load-bearing rather than incidental:

**It renders nothing.** The obvious implementation — a zero-size `<span ref>` as
the pane's first child — inserts a real element into a flex column, and any pane
carrying `gap-*` would grow by one gap. A `null`-rendering component plus a data
attribute cannot move a layout, which matters in a repo whose entire test suite
is eighteen height assertions.

**`ScreenBody` stays a server component.** Making it `"use client"` would push a
foundational layout primitive into every route's client bundle to buy an effect
that two screens want.

**The saved value is a ref-free direct write on scroll, not a flush on unmount.**
A `useEffect` cleanup that reads `el.scrollTop` can run *after* React has
detached the node, and a detached element reads `0` — a silent, intermittent
"it saved the top of the list". Recording during the scroll has no such window.

`useLayoutEffect` for the restore, not `useEffect`: on a client-side navigation
the layout effect runs before the browser paints, so the list appears already at
the right offset instead of flashing the top for a frame. It is guarded for SSR
in the usual way, because `ScreenBody`'s children are server-rendered.

## 3. Approaches that lost

| Approach | Why it lost |
|---|---|
| **B. Journal-local `useEffect` in `journal-feed.tsx`** | The scrolling element is not that component's — it belongs to `ScreenBody` — so it would reach for `querySelector` anyway, and buy nothing reusable. `mine-client.tsx` had already argued this belongs in `screen.tsx`. |
| **C. Automatic for every `scroll` pane, no opt-in** | Silently changes `/vocab`, `/profile`, `/calendar` and every future pane. The chat transcript is bottom-anchored; a restored offset there is a regression on a screen the card never mentioned. Opt-in is one word per screen and keeps the blast radius equal to the report. |
| **D. Replay the loaded pages before restoring** | See §4. |

## 4. The ambiguity call: "the exact position", past page 1

`/journal` renders 30 entries server-side and appends more through *Load more*
into `useState`. Coming back re-mounts the feed with page 1 only, so an offset
recorded three pages down has nowhere to land.

**The narrow reading is built:** the offset is restored exactly within the
server-rendered page, and beyond it the browser clamps to the furthest
restorable point — bottom of page 1 rather than top of it. Strictly better than
today in every case, and wrong in none.

**The wide reading — replay every loaded page on mount, then restore — was
rejected**, and the card's own body suggests as much. It costs one round trip per
page before the list is usable, shows an extend-and-jump while they land, and
races the composer's optimistic rows. If the pages-deep case turns out to matter,
that is a second card with a real measurement behind it, not a guess bolted on
here.

## 5. What is touched

| File | Change |
|---|---|
| `src/components/layout/pane-scroll-memory.tsx` | new — the client component |
| `src/components/layout/screen.tsx` | `restoreScroll?: string` on `ScreenBody` |
| `src/lib/journal/limits.ts` | `JOURNAL_SCROLL_KEY`, beside `JOURNAL_DRAFT_KEY` |
| `src/app/(app)/journal/journal-feed.tsx` | passes it |
| `src/app/kitchen-sink/journal/page.tsx` | passes it; `?fill=N` so the fixture can scroll |
| `tests/e2e/no-scroll.spec.ts` | the round trip, at both viewports |
| `src/components/README.md` | the `ScreenBody` row |

## 6. How it is verified

`sessionStorage` and a scroll offset are not a function, so an offline check
script would assert a key spelling and nothing else. The honest gate is the
browser:

- **`no-scroll.spec.ts`** drives `/kitchen-sink/journal?fill=24`, scrolls the
  pane, leaves for the entry fixture, comes back, and asserts the pane's
  `scrollTop`. It leaves by `goto` rather than `goBack` on purpose — a real back
  can be served from the bfcache, which restores the offset natively and would
  make the test pass with none of this code present.
- A second assertion that a pane **without** the prop still lands at the top, so
  the opt-in is a property rather than a convention.
- `npm run typecheck`, `npm run lint`, `npm run build`, and the eleven offline
  check scripts, since the repo has no CI workflow to read a gate out of.
