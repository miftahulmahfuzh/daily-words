# F21 — The badge dialog's full-bleed art hero

**Goal.** Replace the badge modal's small centred medal-on-card with a
**full-bleed hero band across the top of the dialog** — edge to edge, no paper
margin, the artwork's own paper colour carrying the whole region — with the
eyebrow, title, condition, gloss and dates below it.

**Architecture.** The medal art is already an *opaque, square, full-bleed* image
(no alpha, 1024² masters → 768² WebP), so there is nothing to composite and no
new asset to draw; but the deck cannot be cropped into a wide band without
slicing ink (measured in §2), so the hero paints its band with the badge's **own
plate colour**, sampled from the master by `tools/make_badge_assets.py` and
carried as a new `plate` field in the generated `BADGE_ART` manifest, and lays
the square art `object-fit: contain` on top of it. The band is a new reusable
component, `ArtHero`, which knows nothing about `BadgeKey` — it takes `src`,
`plate` and a dimmed flag — so F22 can hang streak and collector level art in the
same treatment.

**Reads before you start:** `CLAUDE.md` §"There is exactly one modal in the app"
and §"Badge art and `OPENAI_API_KEY`"; `src/components/README.md` §"The badge
asset contract (F12)"; `plans/F13-badge-detail.md` (this plan amends it);
`plans/F12-badge-art-skill.md` §on `make_badge_assets.py`.

**Amends:** `plans/F13-badge-detail.md` §4.4 (the panel's internal layout) and
§4.5 (the medal's size rule). F13's D1–D6 all stand; **D5 in particular is
untouched** — this is still one native `<dialog>` in the top layer, not a route.
`src/components/README.md` §"The badge asset contract (F12)" gains a fifth
bullet and one changed number. Nothing in `ROADMAP_v0.1.0.md` is touched; [R19]
is *satisfied by the same mechanism as before* and re-asserted by the same test.

---

## 0. The user's ask, and what it actually is

> "i see that we can click on the badge and a modal would pop up. i have a small
> change request: right now, there is a small image square inside the modal. can
> we change it so the color of the small square fill the whole top half of the
> modal, so it is in full color, instead of showing small square on top of a
> white background."

Read the sentence carefully: **"the color of the small square fill the whole top
half"**. The complaint is not that the medal is small. It is that the medal's
*paper colour* stops at the medal's edge, and a strip of `--card` (#fbfaf5)
surrounds it on all four sides — 82px of it on each side at 375px — so the
picture reads as a tile dropped onto a white sheet rather than as part of the
panel.

That is exactly what §2's measurement forces the design into anyway: the
artwork cannot be stretched or cropped to fill a wide band, so the **colour** is
extended and the seal stays whole. The user asked for the right thing.

**One part of the ask this plan does not deliver literally, and says so up
front:** at the design target the hero lands at ~32% of the panel, not 50%.
§3.4 does that arithmetic and §1 D4 records the alternative that would buy a
true half, what it costs, and why it is not taken. Read D4 before deciding the
change is wrong.

---

## 1. What was measured before anything was designed

Every number below came from the files on disk, not from the style prompt.
Reproduce any of them with the snippets in §7.4.

### 1.1 The PNGs are opaque, square, and already full-bleed

```
assets/badges/*.png   1024 × 1024, bit depth 8, PNG colour type 2 (truecolour, NO alpha)
public/badges/*.webp   768 ×  768, mode RGB (no alpha)
public/badges/*.sm.webp 192 × 192
```

Colour type 2 means there is **no alpha channel at all** — not a flat-255 one, no
channel. This is not accidental; it is the style contract's first rule
(`.claude/skills/generate-badge-art/style.md`):

> FULL BLEED — THIS IS THE MOST IMPORTANT RULE. The ticket's own paper fills the
> entire image, edge to edge and corner to corner. … The image IS the paper.

and `tools/check_badge_art.py` check 2 is a **hard** gate on it, with check 3
gating the edge strips at 78–96% relative luminance, per-strip stdev ≤ 6.0 and
inter-strip spread ≤ 4.0.

**What follows.** The question the brief flagged as deciding the whole feature —
"if the medals are transparent PNGs drawn to sit on paper, filling the top half
needs a backdrop" — resolves the *other* way, and better: each medal carries its
own backdrop, edge to edge, and it is uniform to within 4 luminance points by a
checked property. There is no halo, no fringe, and no "what is behind the
antialiased edge" question. `src/components/README.md` already says this and
already draws the conclusion — *"Do not put a background behind a badge expecting
it to show through"* — and this plan does not violate it: it puts a background
**beside** the badge, in the badge's own colour, which is a different act.

### 1.2 The deck cannot be cropped into a wide band

This is the finding that decides the layout, and it contradicts the style
prompt. The prompt says the seal occupies "about 76 percent of the image width …
with a quiet margin of bare paper all around it", which would license a crop down
to a 1.32 aspect ratio. The pixels disagree.

Ink extent per badge, as a percentage of image height, measuring "ink" as a pixel
below 50% of the plate's relative luminance and a row as inked when ≥1% of it is:

| badge | ink top | ink bottom |
|---|---|---|
| christmas | 7.0% | 91.8% |
| fathers_day | 7.0% | 91.0% |
| first_card | 7.4% | 91.8% |
| full_week | 6.6% | 92.2% |
| **ibu** | **6.2%** | **95.7%** |
| indonesia_independence | 7.4% | 92.2% |
| leap_day | 7.4% | 89.8% |
| midnight_oil | 7.0% | 92.6% |
| new_year | 7.0% | 91.4% |
| sunday | 7.4% | 90.6% |
| tolkien | 7.4% | 90.6% |
| womens_day | 8.2% | 89.5% |
| world_book_day | 7.0% | 90.2% |
| year_end | 7.4% | 91.4% |

**Deck envelope: 6.2% – 95.7%.** `ibu` is the outlier and it is not noise: open
`public/badges/ibu.6bff7bcb.webp` and look — the prayer-bead tassel **hangs out
of the bottom of the seal ring**, down to 95.7% of the image height. It is the
subject, not a speck, and the style contract never forbade a subject that breaks
the ring.

The consequence, computed from that envelope:

| crop strategy | max wide aspect ratio before ink is cut |
|---|---|
| centred (`object-position: center`) | **1.094** |
| optimally anchored, deck-wide (`center 59.3%`) | **1.118** |

**So `object-fit: cover` into any band wider than about 1.1 slices the seal on at
least one badge, and a per-badge `object-position` is fourteen hand-authored
numbers that no check can validate.** Cropping is off the table. The hero band
must be filled by something other than the image's own pixels — which §1.3
supplies.

### 1.3 The plate colour is per-badge, and the spread is visible

Sampled with the same rule `tools/check_badge_art.py`'s `plate_rgb_and_luminance`
already uses (mean RGB of the outer 5% frame of the 1024² master):

| badge | plate | badge | plate |
|---|---|---|---|
| christmas | `#ede8dc` | new_year | `#f0ebdf` |
| fathers_day | `#edeadc` | sunday | `#ece8dd` |
| first_card | `#ede9d8` | tolkien | `#ebe7da` |
| full_week | `#f1ede1` | womens_day | `#efebe1` |
| ibu | `#eae6d7` | world_book_day | `#efeadd` |
| indonesia_independence | `#ede9da` | year_end | `#eeebdd` |
| leap_day | `#eeeade` | midnight_oil | `#ece8db` |

Range `#eae6d7` … `#f1ede1` — about 7 levels per channel end to end. A single
constant would sit flush on `midnight_oil` and show a seam on `ibu` and
`full_week`, which is precisely the artefact this feature exists to remove.
**Per-badge, and generated.**

### 1.4 The dialog's height budget, exactly

At the design target, 375×667, with `env(safe-area-inset-*)` resolving to 0
(which is what a browser and Playwright give):

```
--gutter    22px      --pad-top  16px      --pad-bottom  10px
dialog width  = min(100vw - 2*22, 340)  = min(331, 340) = 331px  (border-box)
              → content box                              = 329px  (1px border each side)
dialog max-h  = 100dvh - 16 - 10 - 2*22                  = 597px
```

Today's vertical spend, from `badge-dialog.tsx` and `globals.css`:

```
p-5 top                     20.00
.dw-badge-medal  min(220px, 25dvh) = min(220, 166.75)  166.75
gap-4                       16.00
[ body ]
gap-4                       16.00
Button size="sm" → h-11     44.00
p-5 bottom                  20.00
                           ------
non-body                   282.75      body available = 597 - 282.75 = 314.25
```

`src/components/README.md` records the measurement that fixed the 25dvh clamp: a
flat 220px medal "pushes the longest gloss in `badge-meta.ts` 38px past the
panel's max-height". 220 − 166.75 = 53.25, so available at 220 is 261.00 and it
overflows by 38 ⇒ **`tolkien`'s natural body height is ≈ 299px, and today's slack
at the design target is ≈ 15px.**

Fifteen pixels is the entire budget this feature has to spend. §3.4 spends
none of it.

### 1.5 Locked/unrevealed badges leak nothing, because nothing is hidden

Checked, because the brief asked and because guessing here would be a privacy
bug:

- `src/app/(app)/profile/badge-shelf.tsx` is explicit: *"No padlock, no `???`, no
  blur on the unearned rows. They are empty places on a shelf, not locked
  content — a user should be able to read 'Leap Year Lexicographer' and work out
  that a leap day will do it."* Every unearned badge is already listed by title.
- `BadgeDialog` already opens on unearned rows and already draws the **full art**,
  the full `condition` and the full `gloss`; only the eyebrow changes ("Not yet
  earned") and the dates line is omitted.
- `BadgeMedal` draws unearned as `opacity-40` **and nothing else** — its own
  comment rules out `grayscale()` and `blur()`.
- `src/lib/gamification/reveal.ts` is **not** a reveal-gate. It is the one-slot
  browser channel that hands `POST /api/cards`'s reward payload to `RewardToast`
  on `/today`. It decides what is *announced*, never what is *visible*, and it
  imports `BADGE_CATALOG` only for a sort order.

**Rule, therefore: a full-colour hero for an unearned badge leaks nothing that
`/profile` does not already show, and the unearned treatment stays exactly
`opacity-40`.** What changes is only *what the opacity is applied to* — see D6,
which is a real trap and would have looked fine in light mode.

---

## 2. Decisions

### D1 — The hero is a **band the width of the dialog** with the square art laid `contain` on the badge's own plate colour

The only three ways to fill a wide region with a square opaque image:

| | verdict |
|---|---|
| `object-fit: cover` (crop) | **Rejected.** §1.2 — cuts `ibu`'s tassel at any ratio past 1.094, and a wide band is the whole point. |
| `object-fit: fill` (stretch) | **Rejected without discussion.** A stretched engraved seal is an ellipse; the deck's identity is a circle. |
| `object-fit: contain` on a matched backdrop | **Taken.** No crop, no distortion, and the band is one continuous sheet of the badge's own paper. |

At the design target this draws a 185×185 seal centred in a 329×185 band, with
72px of bare plate on each side. That 72px is the feature: today it is `--card`
(#fbfaf5) and it is what makes the picture read as a tile.

Two alternatives to a stored colour were considered and rejected:

- **A second, wide, full-bleed variant of each asset.** Fourteen more images,
  fourteen more generations at `OPENAI_API_KEY`'s expense, a second style
  contract to keep in sync, and a doubled `badges:check` surface — to reproduce a
  flat colour that is already a checked property of the image we ship.
- **Sampling the plate in CSS from the image itself**, e.g.
  `background: url(src) 0 0 / 2000% 2000%` to blow the guaranteed-bare top-left
  5% up into the band. No new data, but a 51px region stretched to 329×185 turns
  the paper tooth into visible blotching, and nothing checks that it stayed
  acceptable after a regeneration. A number that a script can assert beats a
  trick that only an eye can.

### D2 — The plate colour is **generated into `BADGE_ART`**, never hand-authored, and never put in `badge-meta.ts`

`src/lib/gamification/badge-art.ts` opens with **"GENERATED FILE — do not edit by
hand"** and `CLAUDE.md` repeats it. That is not a reason to route around it; it
is a reason to extend the generator, and this datum belongs there for the same
reason `sha256` does: **it is a property of the master's bytes.** Regenerate a
badge and its paper can shift; a hand-written hex in `badge-meta.ts` would then
be silently wrong, in exactly the way a hand-written `src` path would be — which
is why the F11–F18 brief's [C3] already forbids that for the path.

`badge-meta.ts` holds *editorial* data: `condition` and `gloss`, prose a human
writes. A sampled colour is not prose.

So `tools/make_badge_assets.py` grows a `plate_hex()` function — the same outer-5%
frame rule `check_badge_art.py` already uses, so the two agree by construction —
emits `plate: "#rrggbb"` per entry, and `scripts/check-badge-art.ts` grows one
assertion per badge that recomputes it from the master, exactly as it already
recomputes the SHA-256. Drift becomes a red `npm run badges:check`, not a
seam somebody notices in six months.

### D3 — **No new asset, no new path, no header change.** The `immutable` licence is untouched

Nothing this plan adds is a file. `public/badges/*` keeps its content-hashed
filenames and keeps `next.config.ts`'s `public, max-age=31536000, immutable`,
and the licence for that header — *"`npm run badges:check` asserts that the hash
in each filename is still the SHA-256 of `assets/badges/<key>.png`"* — is not
weakened, because the new `plate` field is checked by the same script against the
same master.

The `plate` value ships inside the JS bundle, which is already versioned by the
build. **Do not add a `?v=` to any badge URL and do not extend the `immutable`
header to any new path** — there is no new path to extend it to.

### D4 — The hero is **16 / 9**, which is budget-neutral, and it lands at ~32% of the panel rather than 50%

The ask says "top half". Here is why it is not affordable, in numbers, and what
would buy it.

The hero's height is a function of the dialog's width, which is already clamped
(`min(100vw - 2*var(--gutter), 340px)`). With `aspect-ratio: 16 / 9` on a
content box of 329px the band is **185.06px**, and the whole layout costs:

```
                     TODAY        F21 (16/9)      Δ body
375×667  non-body   282.75          281.06        +1.7px
320×568  non-body   258.00          250.06        +7.9px
390×844  non-body   327.00          286.06       +40.9px
```

**The body gets *more* room at every tested viewport than it has today.** The
existing assertion `"the badge panel does not scroll internally at the design
target"` — the one driven by `tolkien`, the longest gloss in the deck — stays
green with its 15px of slack intact and a further 1.7px on top. Not one of
§1.4's numbers is spent.

The seal itself is drawn at the band's height: **185px at 375 (today: 167 — it
gets bigger), 154px at 320 (today: 142 — bigger), 190px at 390×844 (today: 211 —
21px smaller, and still under the ~220 ceiling `src/components/README.md`
publishes).**

Now the half. `tolkien`'s panel is 281.06 + 299 = 580px, so a 185px hero is
**31.9%**. The tallest band that fits the 15px slack is ratio 1.63 (H = 202px),
which is 34.4%. **Even spending the entire budget buys two and a half points**,
because the panel is mostly prose: 299 of its 580 pixels are the condition and
the gloss, and those are what the user came to the modal to read (F13: "a picture
of the medal, **and what this badge means**").

**What would actually buy a half, and why it is not taken.** Make the hero square
and full-bleed — 329×329, **53% of a 597px panel** — and let
`.dw-badge-dialog-body` scroll, which it is already built to do. One line of CSS:

```css
.dw-badge-hero { aspect-ratio: 1 / 1; }   /* the "true half" variant */
```

The cost, measured: body available drops to 597 − (329 + 96) = 172px, against a
299px natural body on `tolkien` and roughly 185–230px on most of the deck. **The
gloss goes under the fold on about twelve of fourteen badges** — the modal stops
answering the question it was built to answer — and it takes the earned-on date
with it, which F13 §4.5 and `src/components/README.md` both name as *"the one
thing on that panel a user cannot reconstruct from anywhere else"*.

That objection is repairable (move the dates line up under the eyebrow, so the
thing that scrolls is the gloss and not the record), and if the user looks at the
shipped 16/9 band and still wants a half, **that is the change to make, in this
order: reorder the body, then flip the ratio, then replace the no-scroll
assertion with the priority assertion in §6.3.** It is deliberately not taken
first, because it trades a certain regression for an uncertain gain and the user
has not yet seen the certain improvement.

Two more ratio schemes were rejected:

- **A `dvh` clamp on the hero height** (mirroring `.dw-badge-medal`'s
  `min(220px, 25dvh)`). Rejected: the band's *width* is already viewport-clamped,
  so a height clamp couples the same box to the viewport twice and makes the
  ratio — and therefore the size of the bare plate margins — a different number
  on every phone. The width clamp alone is sufficient and deterministic, which is
  also what lets §6.2's Playwright assertion state an exact expected height.
- **A flex-grown hero inside a definite-height dialog** (`height: <the max-height
  calc>`, hero `flex: 1 1 auto`), so the band absorbs whatever the prose leaves.
  Genuinely elegant for `tolkien` and a disaster for `new_year`: at 390×844 a
  short gloss would leave 477px for the art, a 768² source drawn at 477 css px,
  far past the contract ceiling, and the modal becomes a poster. Capping it just
  reintroduces dead space below a fixed-height dialog.

### D5 — `ArtHero` takes art, not a `BadgeKey`, because F22 is next

A sibling plan (F22) adds art for the streak and collector levels and will want
this treatment on level rows. So the band is its own component and it is
**structurally incapable** of knowing about badges:

```ts
// src/components/gamification/art-hero.tsx
export function ArtHero(props: {
  src: string;
  intrinsic: number;   // the source's intrinsic square size, e.g. BADGE_ART_SIZE
  plate: string;       // "#rrggbb" — the art's own paper, from the generated manifest
  dimmed?: boolean;    // the unearned / unreached treatment
  className?: string;
}): React.JSX.Element
```

No `BadgeKey`, no `BADGE_ART` import, no `BADGE_META` import, no `earned`
(F22's rows are not "earned"; `dimmed` is the shared idea). The caller resolves
the key and passes pixels. `BadgeDialog` becomes
`<ArtHero {...} /> + <header/body>`, and F22 writes its own caller.

**What F21 does *not* do:** it does not extract a `HeroPanel`/`ArtDialog` that
also owns the title and prose. F22's level art may well not be a dialog at all,
and a second caller is the earliest honest moment to find out what the shared
shape is (`badge-row.tsx`'s comment on the frozen kit makes the same argument).
The seam left here is exactly one component wide.

`BadgeMedal` is **kept, not deleted** — it is the sized square medal, it is still
what a non-hero context wants, and deleting a working component to prove a point
is churn. It is simply no longer imported by `BadgeDialog`. If F22 lands and
nothing imports it, delete it then.

### D6 — The unearned dim goes on the **hero container**, not on the `<img>`, and this is a dark-mode trap

`BadgeMedal` puts `opacity-40` on the image. Move that unchanged onto the new
`<img>` and light mode looks fine and **dark mode silently breaks**:

- The plate backdrop is painted at full strength (it is a `background-color`, not
  an image, so `opacity` on the `<img>` does not touch it).
- In light mode the plate ≈ `--card`, so a faded seal on a full-strength plate
  looks like a faint impression on paper. Charming, and nobody notices.
- In dark mode `--card` is `#1e1e1a`. Today an unearned medal at `opacity-40`
  blends *toward that dark card* and reads as dim. With a full-strength plate it
  would become a **329×185 slab of full-brightness cream** with faint ink on it —
  brighter and more prominent than an *earned* badge's medal is today. The one
  visual signal separating earned from unearned inverts, and nothing throws.

So: `opacity` on `.dw-badge-hero`, which composites plate and ink together and
reproduces today's behaviour in both schemes at the new size. §7.3's manual pass
has an unearned badge in dark mode as a named step for exactly this reason.

### D7 — Initial focus does not move, and nothing focusable goes in the hero

`showModal()` focuses the first focusable descendant. Today that is the Close
button — the medal is an `<img alt="" aria-hidden>` and there is nothing else.
**After F21 that is still true**, because `ArtHero` renders an `<img>` with the
same `alt=""`, `aria-hidden="true"`, `draggable={false}`, and no `tabIndex`.
Initial focus, the tab order, the focus ring and the element the UA restores
focus to on close are all byte-identical to today.

Which means the two documented `<dialog>` traps are handled by *not moving*:

- **`.dw-badge-dialog[open]`, never bare `.dw-badge-dialog`.** The one new rule
  this plan adds to that selector (`overflow: clip`, D8) goes on the `[open]`
  form. Nothing else on the dialog element changes.
- **No React `autoFocus`.** None is added; `badge-dialog.tsx`'s existing
  twenty-line comment explaining why stays exactly where it is.

**Do not put a close ✕ in the hero.** It is tempting — it looks tidy and it would
reclaim the Close button's 44px. But it becomes the *first* focusable descendant,
so `showModal()` focuses it, and the first thing a screen-reader user hears on
opening the modal changes from the panel's labelled content to the word "Close".
That is a real regression for a 44px saving this plan does not need (D4: the body
gains room). If a later plan wants it, it must move initial focus deliberately
and say so.

### D8 — The dialog needs `overflow: clip`, or the hero squares off its rounded corners

`.dw-badge-dialog[open]` sets `border-radius: var(--r-card)` and **no overflow**.
That has been harmless because the inner wrapper's `p-5` kept every child away
from the corners. A full-bleed child changes that: the hero's own square top
corners will paint over the dialog's 10px radius, and the panel gets two hard
corners at the top and two round ones at the bottom. Nothing throws; it just
looks broken.

`overflow: clip` rather than `overflow: hidden`, deliberately — `clip` does not
create a scroll container, so it cannot interact with
`.dw-badge-dialog-body`'s `overflow-y: auto`, cannot become a scroll port for a
focus-scroll, and cannot be scrolled programmatically. Rounding the hero's own
top corners instead was rejected: the 1px `border-rule` sits outside it and
antialiasing leaves a visible hairline crescent between the border and the art
in the corners.

---

## 3. Files

### Created

| Path | What |
|---|---|
| `src/components/gamification/art-hero.tsx` | The reusable band. D5's props, no `BadgeKey`. |

### Modified

| Path | Change |
|---|---|
| `tools/make_badge_assets.py` | `plate_hex()`; `plate` in the emitted entry and in the emitted `BadgeArt` type. |
| `src/lib/gamification/badge-art.ts` | **Regenerated, never hand-edited.** Gains `plate` on the type and on all fourteen entries. |
| `scripts/check-badge-art.ts` | §3 gains one assertion per badge: manifest `plate` equals the master's. |
| `src/app/globals.css` | `.dw-badge-hero` + `.dw-badge-hero img`; `overflow: clip` on `.dw-badge-dialog[open]`; `.dw-badge-medal`'s comment amended. |
| `src/components/gamification/badge-dialog.tsx` | Wrapper restructured: hero flush at the top, padding moved into the body and the footer. |
| `tests/e2e/no-scroll.spec.ts` | One new assertion (§6.2). The two existing badge-dialog tests are **not** changed. |
| `src/components/README.md` | §"The badge asset contract (F12)": the panel draw row, a fifth guaranteed property, and `ArtHero` in the kit table. |
| `CLAUDE.md` | §"There is exactly one modal in the app" gains the `overflow: clip` note and the plate rule. |

**Untouched, and it matters:** `src/lib/gamification/badge-meta.ts` (D2),
`src/lib/gamification/badges.ts`, `src/lib/gamification/reveal.ts` (§1.5),
`src/app/(app)/profile/badge-shelf.tsx`, `src/components/ui/badge-row.tsx` (the
kit is frozen), `next.config.ts` (D3), `src/lib/ui/cn.ts` (no new `--text-*` or
`--tracking-*` token is introduced, so tailwind-merge needs no teaching),
`.claude/skills/generate-badge-art/style.md` (**no style bump** — not one pixel
of art changes, so the deck stays v1 and every sidecar stays valid).

---

## 4. Tasks

Bite-sized and ordered. Each ends in a commit. Tasks 1–3 are the generator and
can be verified with no browser; tasks 4–6 are the UI.

### Task 1 — Measure the current panel, so the change is against numbers

No code. Run this and keep the output; it is the before-picture §7.2 compares
against, and it is what makes a later move to D4's square variant a decision
rather than a guess.

```bash
ss -ltnp | grep 3200 || true      # kill by pid if anything is listening
npm run dev                        # 3200, and only 3200
```

In a second shell:

```bash
npx playwright test --project=se3 --reporter=line -g "badge panel does not scroll"
```

Then, in the browser at exactly 375×667, open
`http://localhost:3200/kitchen-sink/profile?badge=tolkien` and run in the console:

```js
const d = document.querySelector('dialog');
const b = document.querySelector('.dw-badge-dialog-body');
console.table({
  dialogH: d.getBoundingClientRect().height,
  dialogW: d.getBoundingClientRect().width,
  maxH: parseFloat(getComputedStyle(d).maxHeight),
  medal: document.querySelector('.dw-badge-medal').getBoundingClientRect().height,
  bodyClient: b.clientHeight,
  bodyScroll: b.scrollHeight,
  slack: b.clientHeight - b.scrollHeight,
});
```

**Expected**, from §1.4: `dialogW` 331, `maxH` 597, `medal` ≈ 166.75, `slack`
small and **≥ 0** (the assertion in the spec is that it is ≥ −1). Record `slack`
— §1.4 predicts ≈ 15. If it is negative, stop: the panel already overflows and
this plan's arithmetic is built on a false premise.

*Commit:* none (measurement only). Paste the numbers into the PR description.

### Task 2 — Teach `make_badge_assets.py` the plate colour

`tools/make_badge_assets.py`, beside the existing helpers:

```python
def plate_hex(img):
    """The art's own paper, as #rrggbb.

    The same rule tools/check_badge_art.py's `plate_rgb_and_luminance` uses —
    the mean of the outer 5% frame — so the promoted value and the graded value
    can never disagree. That frame is bare paper by construction: the style
    contract's FULL BLEED rule makes the image the paper, and check 3 gates the
    four edge strips at 78–96% luminance with an inter-strip spread of at most
    4.0 points. That bound is the reason a single flat colour can sit beside the
    art in F21's hero with no visible seam.

    Sampled from the 1024² master rather than the 768² derivative: the master is
    what `sha256` is taken over, so both fields describe the same bytes and one
    check can assert both.
    """
    px = img.convert("RGB").load()
    w, h = img.size
    band = max(1, int(round(min(w, h) * 0.05)))
    rs, gs, bs = [], [], []
    for y in range(h):
        edge_row = y < band or y >= h - band
        for x in range(w):
            if not (edge_row or x < band or x >= w - band):
                continue
            r, g, b = px[x, y]
            rs.append(r); gs.append(g); bs.append(b)
    n = len(rs)
    return "#%02x%02x%02x" % (round(sum(rs) / n), round(sum(gs) / n), round(sum(bs) / n))
```

Thread it through. `main()` already opens each master and computes its `sha`;
carry the plate alongside so the file is read once — extend the `entries` tuples
from `(key, sha)` to `(key, sha, plate)` and update `emit_manifest`'s signature
and its loop:

```python
    for key, sha, plate in entries:
        h8 = sha[:8]
        lines += [
            f"  {key}: {{",
            f'    src: "/badges/{key}.{h8}.webp",',
            f'    small: "/badges/{key}.{h8}.sm.webp",',
            f'    sha256: "{sha}",',
            f'    plate: "{plate}",',
            f'    styleVersion: "{style_versions.get(key) or "unknown"}",',
            "  },",
        ]
```

and the emitted type, in the same `emit_manifest` string list:

```python
        "export type BadgeArt = {",
        "  /** 768×768 WebP for the badge modal. */",
        "  src: string;",
        "  /** 192×192 WebP for the shelf mark. */",
        "  small: string;",
        "  /** SHA-256 of `assets/badges/<key>.png`, the approved master. */",
        "  sha256: string;",
        "  /**",
        "   * The art's own paper, `#rrggbb`, as the mean of the master's outer 5%",
        "   * frame. F21's hero paints its band with this so the square art can sit",
        "   * `object-fit: contain` on a wider region with no seam and no crop —",
        "   * the deck cannot be cropped (F21 §1.2: ibu's tassel reaches 95.7% of",
        "   * the image height). Sampled, never chosen: regenerating a badge can",
        "   * shift its paper, and `npm run badges:check` recomputes this from the",
        "   * master exactly as it recomputes `sha256`.",
        "   */",
        "  plate: string;",
        "  /** The `style.md` version this image was generated against. */",
        "  styleVersion: string;",
        "};",
```

Then regenerate:

```bash
python3 tools/make_badge_assets.py
git diff --stat src/lib/gamification/badge-art.ts
```

**Expected:** `badge-art.ts` changes and **nothing under `public/badges/` does** —
no file is rewritten, because no master changed. If a `.webp` shows up in
`git status`, the promotion step re-encoded something and the hashes must be
re-checked before going on.

Confirm the fourteen emitted values against §1.3's table. They must match
character for character.

```bash
npm run typecheck
```

**Expected:** clean. `BadgeArt` gained a required field and every entry has it.

*Commit:* `F21: sample each badge's plate colour into the generated manifest`

### Task 3 — Assert the plate in `badges:check`

`scripts/check-badge-art.ts`, inside the existing §3 per-key loop (the one that
already reads the master and computes `sha`), after the `sha256` assertion:

```ts
  // The same recomputation the hash assertion makes, for the same reason. The
  // plate is a property of the master's bytes, so a hand-edit to the generated
  // manifest — or a regenerated badge whose paper shifted and whose manifest was
  // not rebuilt — is a red run rather than a seam somebody eventually notices
  // beside the art in F21's hero.
  check(`${key}: manifest plate equals the master’s`, art.plate, plateHex(master))
```

and the helper, beside the file's other top-level functions:

```ts
/**
 * Mean RGB of the master's outer 5% frame, as `#rrggbb`.
 *
 * A deliberate second implementation of `tools/make_badge_assets.py`'s
 * `plate_hex` — not a shared module, because there is no shared language here.
 * The point of the assertion is that two independent readings of the same file
 * agree; importing the producer's arithmetic into the checker would assert
 * nothing at all.
 *
 * PNG decoding without a dependency: `sharp` is not in this project and this
 * script must stay offline and dependency-free like its neighbours, so the
 * frame is read from the already-decoded pixels the existing size check pulls
 * out. See the note there.
 */
function plateHex(masterPath: string): string { /* … */ }
```

**Implementation note for whoever writes `plateHex`.** `check-badge-art.ts`
already opens both the masters and the shipped WebPs to assert their dimensions —
find how it does that and reuse the same reader. If it only parses the IHDR
header (which is all a dimension check needs) and cannot decode pixels, then do
**not** add an image dependency to `src`'s toolchain: instead have
`make_badge_assets.py --check` re-derive the plate and diff it against the
manifest, and make `badges:check` shell out to it. Decide by reading the file;
either shape satisfies the requirement, which is *the value is recomputed from
the master by something other than the generator's own emission*.

```bash
npm run badges:check
```

**Expected:** every section `ok`, ending
`All badge-art assertions passed (14 badges, style v1).` Now break it on purpose:
hand-edit one `plate` digit in `badge-art.ts`, re-run, see exactly one `FAIL`,
then `git checkout src/lib/gamification/badge-art.ts`. An assertion that has
never failed has not been tested.

*Commit:* `F21: badges:check recomputes each plate from the master`

### Task 4 — `ArtHero`

New file `src/components/gamification/art-hero.tsx`:

```tsx
import { cn } from "@/lib/ui/cn";

/**
 * A full-bleed band of art across the top of a panel: the square plate laid
 * `object-fit: contain` on a backdrop painted in the art's **own** paper colour,
 * so the region is one continuous sheet edge to edge.
 *
 * The user's ask (F21 §0): "can we change it so the color of the small square
 * fill the whole top half of the modal, so it is in full color, instead of
 * showing small square on top of a white background."
 *
 * **Why `contain` on a colour and not `cover` on a crop.** The deck is opaque,
 * square and already full-bleed, so cropping it into a wide band is the obvious
 * move — and it is wrong. Measured over all fourteen masters, ink reaches from
 * 6.2% to 95.7% of the image height (`ibu`'s prayer-bead tassel hangs out of the
 * bottom of the seal ring), which caps a centred crop at an aspect ratio of
 * 1.094. Any band worth calling a band slices a badge. F21 §1.2 has the table.
 *
 * **Why the colour is a prop and not a constant.** The fourteen plates span
 * #eae6d7 to #f1ede1 — one constant sits flush on `midnight_oil` and seams on
 * `ibu`. It comes from `BADGE_ART[key].plate`, sampled from the master by
 * `tools/make_badge_assets.py` and re-derived by `npm run badges:check`.
 *
 * **No `BadgeKey`, and that is the point.** F22 hangs streak and collector level
 * art in this same band; this component must not learn what a badge is. It takes
 * pixels and a colour. `dimmed` rather than `earned` for the same reason — a
 * level is not "earned".
 *
 * **Nothing here is focusable.** `showModal()` focuses the first focusable
 * descendant of the dialog, which is and must remain the Close button; an `<img>`
 * with no `tabIndex` keeps that true. Do not add a control to this band without
 * reading F21 D7.
 *
 * Not `next/image`, for the reason `badge-medal.tsx` gives: it is imported
 * nowhere in `src`, there is no `images` block in `next.config.ts`, and these are
 * fixed-size content-hashed local assets already served `immutable` for a year.
 */
export function ArtHero({
  src,
  intrinsic,
  plate,
  dimmed = false,
  className,
}: {
  src: string;
  /** The source's intrinsic square size, e.g. `BADGE_ART_SIZE`. Never a literal. */
  intrinsic: number;
  /** `#rrggbb`, the art's own paper. From the generated manifest, never chosen. */
  plate: string;
  /** The unearned / unreached treatment. See F21 D6 — it dims the whole band. */
  dimmed?: boolean;
  className?: string;
}) {
  return (
    <div
      // The dim goes HERE and not on the <img>. With it on the image the plate
      // stays at full strength, and in dark mode an unearned badge becomes a
      // slab of full-brightness cream — brighter than an earned one. F21 D6.
      className={cn("dw-badge-hero shrink-0", dimmed && "opacity-40", className)}
      // A per-instance custom property rather than an inline `background`, so the
      // rule that consumes it stays in globals.css beside the dialog's other
      // measured sizing and there is exactly one place that decides what the
      // fallback is.
      style={{ "--dw-plate": plate } as React.CSSProperties}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        // The intrinsic size, not the drawn one — it is what stops the band
        // reflowing while the image loads.
        width={intrinsic}
        height={intrinsic}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
    </div>
  );
}
```

`src/app/globals.css`, immediately after the `.dw-badge-medal` block:

```css
/* F21's hero band. The badge's own paper, edge to edge, with the square plate
   laid on top of it — never cropped: measured over the deck, ink runs from 6.2%
   to 95.7% of the image height (ibu's tassel hangs out of the seal ring), which
   caps a centred crop at an aspect ratio of 1.094. See F21 §1.2.

   THE RATIO IS THE SIZE RULE, and it is deliberately not a dvh clamp. The band's
   width is already viewport-clamped by the dialog
   (`min(100vw - 2*var(--gutter), 340px)`), so the height follows from it and is
   deterministic: 185.06px at 375, 154.06px at 320, 190.13px at the 340px cap.
   Clamping the height too would couple one box to the viewport twice and make
   the plate margins a different width on every phone.

   Measured, not chosen: at 375×667 this spends 1.7px LESS than the medal-and-
   padding it replaces, so the body gets more room than it has today and the
   `tolkien` no-scroll assertion keeps its slack. F21 §1.4 and D4 have the
   arithmetic, including what a true `aspect-ratio: 1 / 1` half would cost. */
.dw-badge-hero {
  width: 100%;
  aspect-ratio: 16 / 9;
  /* The art's own paper, from the generated manifest. The fallback is only ever
     reached by a caller that forgot the prop; --paper-2 is the nearest token to
     the deck's measured range (#eae6d7…#f1ede1) and is wrong for every badge,
     which is the correct behaviour for a value that must be supplied. */
  background-color: var(--dw-plate, var(--paper-2));
  border-bottom: 1px solid var(--rule);
}

.dw-badge-hero img {
  display: block;
  width: 100%;
  height: 100%;
  /* `contain`, never `cover`. See the note above. */
  object-fit: contain;
}
```

and amend `.dw-badge-dialog[open]` — one added line, and the `[open]` stays:

```css
.dw-badge-dialog[open] {
  max-height: calc(100dvh - var(--pad-top) - var(--pad-bottom) - 2 * var(--gutter));
  border-radius: var(--r-card);
  /* F21. A full-bleed child paints over the radius and the panel gets two square
     top corners and two round bottom ones, with nothing throwing. `clip` rather
     than `hidden` on purpose: it does not create a scroll container, so it can
     never become a second scroll port beside `.dw-badge-dialog-body` or be
     scrolled by a focus move. */
  overflow: clip;
  display: flex;
  flex-direction: column;
}
```

```bash
npm run typecheck && npm run lint
```

*Commit:* `F21: ArtHero — a full-bleed band of art on its own plate`

### Task 5 — Restructure the dialog

`src/components/gamification/badge-dialog.tsx`. Swap the import:

```diff
-import { BadgeMedal } from "@/components/gamification/badge-medal";
+import { ArtHero } from "@/components/gamification/art-hero";
+import { BADGE_ART, BADGE_ART_SIZE } from "@/lib/gamification/badge-art";
```

Replace the wrapper and the medal block. The old shape was one padded flex
column; the new one is a padding-free column whose first child bleeds:

```tsx
      {selection && meta && (
        // No padding on the column itself — the hero is flush to all three of
        // its edges, which is the whole change. The padding moved into the body
        // and the footer below. `gap` is gone for the same reason: the spacing
        // under the hero is the body's `pt-4`, so the hero has nothing between
        // it and the dialog's border.
        <div className="dw-in flex min-h-0 flex-col">
          <ArtHero
            src={BADGE_ART[selection.key].src}
            intrinsic={BADGE_ART_SIZE}
            plate={BADGE_ART[selection.key].plate}
            dimmed={selection.earned === null}
          />

          {/* Everything below the hero is what gives when the panel cannot fit
              the viewport — the hero and the close button keep their size. The
              same documented degradation `.dw-pane-fixed` takes below
              LAYOUT.designFloorDvh, and for the same reason: clip nothing,
              scroll instead. F21 D4 measured that at the design target it does
              not have to: the band spends 1.7px less than the medal and its
              padding did. */}
          <div className="dw-badge-dialog-body flex w-full flex-col items-center gap-2.5 px-5 pt-4 text-center">
            <Eyebrow size="sm" tone={selection.earned ? "accent" : "muted"}>
              {selection.earned ? "Earned" : "Not yet earned"}
            </Eyebrow>

            {/* The same classes ScreenHeader gives its <h1>. Not a new size. */}
            <h2 id={titleId} className="m-0 text-2xl font-normal tracking-title text-ink">
              {selection.title}
            </h2>

            <Prose size="base" tone="ink">
              {meta.condition}
            </Prose>

            <Prose size="sm" tone="muted">
              {meta.gloss}
            </Prose>

            {/* Absent when unearned — not "—", not "never". An empty place on a
                shelf says what it needs to say. */}
            {selection.earned && <Meta>{datesLine(selection.earned)}</Meta>}
          </div>

          {/* **No `autoFocus` here, and it is not an oversight.** `showModal()`
              already focuses the first focusable descendant, and this is still
              it — F21's hero is an `<img>` with no `tabIndex`, exactly as the
              medal was, so initial focus did not move. React's `autoFocus` prop
              additionally calls `.focus()` when the element *mounts*, which is
              one commit BEFORE the effect above runs `showModal()`. The dialog
              therefore records the Close button as the element to restore focus
              to, that button is unmounted on close, and focus lands on `<body>`
              — the shelf row the user tapped loses it silently. Measured, both
              on the pointer and the keyboard path.

              Do not move this control into the hero. It would become the FIRST
              focusable descendant and `showModal()` would announce "Close"
              before the panel's content. F21 D7. */}
          <div className="flex shrink-0 justify-center px-5 pb-5 pt-4">
            <Button variant="outline" size="sm" fullWidth={false} onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}
```

Two things to keep straight while editing:

- **`items-center` came off the column.** It was centring the medal; a full-bleed
  child must stretch, and `items-center` on the column would shrink the hero to
  its content width. The body keeps its own `items-center`, and the footer
  centres the button with `justify-center`.
- **`min-h-0` on the column** — `.dw-badge-dialog > *` already supplies it, and
  restating it here is belt to that brace. It is the mechanism that lets the body
  shrink below its content height and scroll instead of overrunning the panel's
  `max-height`. Without it the gloss is clipped by the border radius with nothing
  throwing.

Amend the header comment's paragraph about the medal, and amend
`.dw-badge-medal`'s comment in `globals.css` to say that F13's dvh clamp now
applies only to `BadgeMedal`, which the dialog no longer mounts — leave the rule
itself in place until something deletes the component.

```bash
npm run typecheck && npm run lint
```

*Commit:* `F21: the badge dialog's art becomes a full-bleed hero`

### Task 6 — Assert the band, and re-run everything

`tests/e2e/no-scroll.spec.ts`, after the existing
`"the badge panel does not scroll internally at the design target"` test. **Do
not modify either of the two existing badge-dialog tests** — the whole claim of
D4 is that they keep passing unchanged, and editing them would destroy the
evidence.

```ts
/**
 * F21's hero, and the two properties that make it more than a bigger picture.
 *
 * The first is the user's actual ask: the art's colour reaches both edges of the
 * panel. That is invisible to every other assertion here — a hero inset by 20px
 * of `--card` looks correct in a screenshot at a glance and is exactly the thing
 * being removed.
 *
 * The second is the size rule. The band's height comes from its width through a
 * fixed aspect ratio and from nothing else, so it is a number this test can
 * state: at 375 the dialog's content box is 329px and 329 * 9/16 = 185.06.
 * Asserting the number rather than "it is tall" is what catches a well-meaning
 * dvh clamp being added later — see the note in globals.css for why there is
 * none.
 */
test("the badge hero bleeds to both edges of the panel", async ({ page }) => {
  await page.goto("/kitchen-sink/profile?badge=tolkien");
  await expect(page.locator("dialog")).toBeVisible();

  const { hero, panel, ratio } = await page.evaluate(() => {
    const d = document.querySelector("dialog")!.getBoundingClientRect();
    const h = document.querySelector(".dw-badge-hero")!.getBoundingClientRect();
    return { hero: { l: h.left, r: h.right, h: h.height, w: h.width },
             panel: { l: d.left, r: d.right }, ratio: h.width / h.height };
  });

  // Flush to the border on both sides — the 1px border is the only gap allowed.
  expect(hero.l - panel.l, "the hero is inset on the left").toBeLessThanOrEqual(1.5);
  expect(panel.r - hero.r, "the hero is inset on the right").toBeLessThanOrEqual(1.5);

  // 16 / 9 = 1.7778, and it must not be a dvh clamp in disguise.
  expect(ratio, "the hero is not 16/9").toBeCloseTo(16 / 9, 2);

  if (!DESIGN_TARGET_PROJECTS.includes(test.info().project.name)) return;
  expect(hero.w, "the dialog content box is not 329px at 375").toBeCloseTo(329, 0);
  expect(hero.h, "the hero is not 185px at the design target").toBeCloseTo(185.06, 0);
});
```

Then the full pass:

```bash
npm run typecheck
npm run lint
npm run badges:check
npm run stats:check
npm run test:layout
npm run build
```

*Commit:* `F21: assert the hero bleeds to both edges at a fixed ratio`

### Task 7 — Documentation

`src/components/README.md` §"The badge asset contract (F12)":

- The table's panel row: `**~220 css px**` → `**the hero band's height** — 185px
  at 375, 190px at the 340px dialog cap; ~220 remains the ceiling`.
- The `~220 is a ceiling` paragraph: keep it (it is why `min(220px, 25dvh)` still
  guards `BadgeMedal`) and add that F13's dvh clamp no longer governs the dialog,
  which sizes its band from its width — F21 D4.
- The "No transparency" bullet: keep the sentence *"Do not put a background
  behind a badge expecting it to show through"* verbatim and append: **"— but do
  put the badge's own `plate` colour *beside* it. `ArtHero` fills its band with
  `BADGE_ART[key].plate` and lays the square art `contain` on top, because the
  deck cannot be cropped (F21 §1.2)."**
- A fifth guaranteed property: **"Each master carries its plate colour as data."**
  `BADGE_ART[key].plate`, generated, checked against the master by
  `npm run badges:check`, uniform to within 4 luminance points across the four
  edges by `check_badge_art.py` check 3 — which is what licenses a flat fill
  beside the art.
- The kit table gains `ArtHero` with D5's props, marked as the seam F22 reuses.

`CLAUDE.md` §"There is exactly one modal in the app" — a third bullet under the
two traps:

> - **A full-bleed child needs `overflow: clip` on the dialog.**
>   `.dw-badge-dialog[open]` carries `border-radius: var(--r-card)` and no
>   overflow, which was invisible while `p-5` kept every child off the corners.
>   F21's hero reaches them, and without the clip the panel gets two square
>   corners at the top and two round ones at the bottom. `clip`, not `hidden` —
>   `hidden` would make the dialog a scroll container beside
>   `.dw-badge-dialog-body`.

and, in §"Badge art and `OPENAI_API_KEY`", after the content-hash paragraph:

> `BADGE_ART[key].plate` is the art's own paper (`#rrggbb`, the mean of the
> master's outer 5% frame), and it is **generated for the same reason `sha256`
> is** — it is a property of the master's bytes, so a regenerated badge whose
> paper shifted invalidates it. `npm run badges:check` recomputes it from the
> master. It exists because the deck **cannot be cropped**: ink runs to 95.7% of
> the image height on `ibu`, so F21's hero fills its band with this colour and
> lays the square art `contain` on top rather than `cover`.

*Commit:* `F21: document the plate colour and the hero's overflow trap`

---

## 5. What must stay green, and what changes

### 5.1 `npm run test:layout` — the [R19] assertions

Eighteen no-scroll assertions plus the badge-dialog work. **Two tests touch this
feature and neither is modified:**

| Test | Why it stays green |
|---|---|
| `the badge dialog stays inside the viewport (light/dark)` | Asserts (1) the page does not scroll with the dialog open — the top layer still contributes zero document height, and the dialog element itself is unchanged; (2) the tab bar is on screen; (3) all four edges of the panel are inside the viewport — `max-height` is unchanged and D4 shows the panel is *shorter* than today at every tested viewport; (4) focus is inside the dialog — D7, initial focus did not move; (5) Escape closes it — `onCancel` untouched. |
| `the badge panel does not scroll internally at the design target` | The one that could have broken. §1.4 puts today's slack at ≈ 15px on `tolkien`; D4's table shows the hero spends **1.7px less** than the medal and the padding it replaces, so the slack grows to ≈ 17px. This is the assertion the whole ratio choice was made against. |

If the second one goes red, the ratio is the lever and the cause is measurable in
one command — not a guess:

```bash
npx playwright test --project=se3 -g "badge panel does not scroll"
```

then re-run Task 1's console snippet to see by how much. Widening the ratio to
`aspect-ratio: 2 / 1` recovers 20px; do that rather than deleting the assertion.

**No existing assertion needs updating for the new dialog height.** That is a
claim, and Task 6's run is what tests it.

### 5.2 The offline scripts

| Command | What it covers here | Expected |
|---|---|---|
| `npm run badges:check` | The manifest, the files, the hashes, the new plate assertion, and the `OPENAI_API_KEY` grep emptiness — F21 adds no `src/` mention of it and must not. | `All badge-art assertions passed (14 badges, style v1).` |
| `npm run stats:check` | F9's streaks, levels, badge evaluation and the `badge-meta.ts` register rules. F21 touches none of it; this proves the blast radius. | passes, unchanged output |
| `npm run typecheck` | `BadgeArt` gained a **required** `plate`; a partially regenerated manifest is a compile error, which is the same total-`Record` discipline `sha256` gets. | clean |
| `npm run lint` | The `@next/next/no-img-element` disable in `art-hero.tsx` is on its own line directly above the `<img>`. | clean |
| `npm run build` | The dialog is a client component; `badge-art.ts` is plain data with no `server-only`, and it stays that way. | clean |

### 5.3 What is deliberately *not* verified by a script

The seam between the flat plate and the art's edge, and the size of a
full-brightness cream band in dark mode. Neither is expressible as an assertion —
§7.3's manual pass is the verification, and D6 names the specific way the second
one fails.

---

## 6. Manual pass

Port **3200**, and only 3200. If something is listening, `ss -ltnp | grep 3200`
and kill it **by pid** — a leftover production `next start` gets reused by
`reuseExistingServer` and `/kitchen-sink` is gated off in production, which
presents as eighteen misleading layout failures.

```bash
npm run dev
```

### 6.1 At 375×667 — the design target, earned

DevTools device toolbar, **exactly 375 × 667**, and confirm the number: an
approximate viewport moves every measurement in §1.4.

`http://localhost:3200/kitchen-sink/profile?badge=tolkien`

1. The band reaches the panel's left and right borders. **Put a finger on the
   screen edge of the band and look for a lighter strip** — if `--card` shows on
   either side, `items-center` is still on the column (Task 5).
2. The band's top corners are rounded, matching the bottom two. Square corners ⇒
   `overflow: clip` is missing (D8).
3. **The seam.** Look at the vertical line where the art's edge meets the flat
   plate, at the left and right of the seal. It should be invisible. If a faint
   step is visible, the manifest's `plate` disagrees with this badge's paper —
   `npm run badges:check` should already have caught it; if it passes and the seam
   is real, the outer-5% mean is the wrong sampling rule for this badge and that
   is a finding worth writing down.
4. Everything below reads without scrolling: **Earned**, the title, the condition,
   the full gloss, and the dates line `×2 · first 2 September 2025 · latest
   2 September 2026`. `tolkien` is the longest gloss in the deck; if its last line
   is cut, the ratio overspent (§5.1).
5. Escape closes it. Tab, then Enter on Close, closes it. **After closing by
   either route, the focus ring is back on the shelf row you opened** — not on
   `<body>`. That is the `autoFocus` trap, and it is the one this restructure was
   most likely to reintroduce.

### 6.2 At 375×667 — unearned, both schemes

`http://localhost:3200/kitchen-sink/profile?badge=leap_day` (unearned in the
fixture).

6. Light scheme: the whole band is dimmed — plate *and* ink — and reads as
   quieter than `?badge=tolkien` side by side.
7. **Dark scheme** (DevTools → Rendering → `prefers-color-scheme: dark`). Open
   `leap_day` and `tolkien` in turn. **The unearned band must be the dimmer of
   the two.** If the unearned one is a bright cream slab, the `opacity` is on the
   `<img>` instead of on `.dw-badge-hero` — D6, and it is invisible in light mode.
8. Still in dark: `leap_day`'s eyebrow says **Not yet earned**, there is no dates
   line, and the title and condition are fully legible against the dimmed band.

### 6.3 At 320×568 and at a tall viewport

9. **320×568.** The band is 154px tall and still edge to edge. The body will
   scroll — that is the documented degradation below the design floor, not a
   failure. The Close button must stay pinned and fully visible; if it scrolls
   away, the footer lost its `shrink-0` or the column lost `min-h-0`.
10. **390×844.** The band is 190px and the dialog is comfortably short of its
    597px+ ceiling. Check the top corners again here: a taller viewport is where
    a missing `overflow: clip` is most obvious.
11. **A short landscape, ~740×360.** The panel hits `max-height`, the body
    scrolls, the band does not shrink. Confirm nothing is clipped by the radius —
    a clipped gloss with no scrollbar means `min-height: 0` was lost somewhere in
    the chain.

### 6.4 One pass over the whole deck

12. Walk all fourteen: `?badge=<key>` for each key in `BADGE_CATALOG`. You are
    looking for exactly two things — **a visible seam** (§6.1 step 3) and **ink
    touching the band's top or bottom edge**. The second must never happen:
    `contain` cannot crop, so if it does, someone changed `object-fit`. `ibu` is
    the badge to check first; its tassel reaches 95.7% of the image height and is
    the reason the deck is not croppable.

---

## 7. Risks

**R1 — The 15px slack in §1.4 is derived, not measured.** It comes from
`src/components/README.md`'s "38px past the panel's max-height" note plus the
25dvh clamp, not from a live reading. If the real slack is smaller, Task 6's
`test:layout` goes red on `tolkien`. *Mitigation:* Task 1 measures it before any
code is written, and the ratio is the one-line lever (§5.1). *Residual:* low —
the design gives back 1.7px rather than spending any.

**R2 — The plate mean may not sit flush on a badge whose paper has a gradient.**
`check_badge_art.py` check 3 bounds per-strip stdev at 6.0 and inter-strip spread
at 4.0 luminance points, which is a strong guarantee but not a proof of
flatness. *Mitigation:* §6.4 walks all fourteen. *If it fails on one badge*, the
fix is a better sampling rule in the generator (median rather than mean, or the
mean of the two side strips only, since those are what the band actually abuts) —
**not** a hand-authored override, which would put a value in a generated file.

**R3 — "Top half" is not delivered literally.** D4 is explicit and quantitative
about this and about what a true half costs. *Mitigation:* ship, show the user,
and if they still want the half, D4 names the three changes in order. Do not
guess at the half now: it regresses twelve of fourteen badges.

**R4 — F22 may want a ratio this component hard-codes.** `aspect-ratio: 16 / 9`
lives in `.dw-badge-hero`, so a level hero in a different shape would need either
a modifier class or a prop. *Deliberately left:* one caller cannot tell you what
varies, and F22 is the second. When it lands, if it needs a different band, that
is the moment to lift the ratio into a prop — not before.

**R5 — Someone adds a close ✕ to the hero later.** It steals initial focus and
changes what a screen reader announces first. *Mitigation:* D7 says so, the
component's doc comment says so, and `badge-dialog.tsx`'s footer comment says so.
Three places, because this one does not throw.

### 7.4 Reproducing §1's measurements

```bash
# 1.1 — the masters have no alpha channel (PNG colour type 2)
python3 -c "
import struct,glob,os
for p in sorted(glob.glob('assets/badges/*.png')):
    b=open(p,'rb').read(33); w,h=struct.unpack('>II',b[16:24])
    print(os.path.basename(p), w,'x',h,'depth',b[24],'colortype',b[25])"

# 1.2 and 1.3 — ink extent and plate colour, per badge
python3 - <<'PY'
from PIL import Image; import glob, os
from statistics import mean
def L(c):
    f=lambda v:(v/255)/12.92 if v/255<=0.04045 else (((v/255)+0.055)/1.055)**2.4
    return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2])
for p in sorted(glob.glob('assets/badges/*.png')):
    k=os.path.basename(p)[:-4]
    if k.startswith('_'): continue
    full=Image.open(p).convert('RGB'); W,H=full.size; fp=full.load()
    band=max(1,round(min(W,H)*0.05)); rs=[];gs=[];bs=[]
    for y in range(H):
        er=y<band or y>=H-band
        for x in range(W):
            if not(er or x<band or x>=W-band): continue
            r,g,b=fp[x,y]; rs.append(r);gs.append(g);bs.append(b)
    plate=(round(mean(rs)),round(mean(gs)),round(mean(bs)))
    im=full.resize((256,256),Image.LANCZOS); w,h=im.size; px=im.load()
    thr=L(plate)*0.50
    rows=[y for y in range(h) if sum(1 for x in range(w) if L(px[x,y])<thr)>=w*0.01]
    print(f"{k:24} plate #{plate[0]:02x}{plate[1]:02x}{plate[2]:02x}  "
          f"ink {rows[0]/h*100:5.1f}% .. {(rows[-1]+1)/h*100:5.1f}%")
PY
```

Expected: colour type 2 on all fifteen files (`_anchor.png` included), and §1.2
and §1.3's tables exactly. If the ink envelope has moved, a badge was regenerated
and D1's crop argument must be re-checked before the ratio is touched.
