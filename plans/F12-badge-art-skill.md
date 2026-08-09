# F12 — `/generate-badge-art`: the badge medal skill, its style contract, its tooling, and the deck of thirteen

Badges are currently thirteen strings in `src/lib/gamification/badges.ts` and a
7px square dot in `src/components/ui/badge-row.tsx`. F13 turns each row into a
tappable thing that opens a panel showing "a picture of the medal and an
explanation of what it means". F12 makes the pictures, and — more importantly —
makes the *machine that makes them*, because in the user's words: "i imagine we
will keep adding badges / achievements in the future, so we definitely gonna
need this new `/generate-badge-art` skill". The user also drew the boundary of
the aesthetic himself: "of course we are not gonna use the dark bloody style
from the tarot card skill. we will create our own art style that conforms with
our existing ui/ux."

This plan supersedes no section of any other plan. It **adds** to two frozen
documents rather than overriding them: `src/components/README.md` gains an asset
contract, and `src/app/(app)/profile/badge-shelf.tsx`'s comment "Tapping a row
does nothing in v0.1.0" is overturned by **F13**, not by F12 — F12 ships assets
and a manifest and touches no component. It does **not** modify
`src/lib/gamification/badges.ts`, so `evaluateBadges`'s purity contract is
untouched.

---

## 1. Decisions

### D1 — The art style is a two-ink letterpress ration coupon, not a medal

The tarot deck's skill is a good *shape* and a wrong *world*. Daily Words is,
per the roadmap's own first line, "a digital rebuild of a pocket vocabulary
card… a 13×8 cm card, carried in a trouser pocket". The design file signs itself
"Est. 2026". The levels are "Keeper of the Pocket" and "The Uncle's Apprentice";
the badges are "Full Week Ration" and "No Weekend Without Ration Card". The
tokens are paper `#F0EDE4`, ink `#20211D`, a deep pine accent `#2F5D50` and a
brick red `#8A3324`, drawn in Source Serif 4 with IBM Plex Mono for anything the
machine tallies. There are **no icons anywhere in this app** ([R18]) — every
mark on screen is a rule, a dot or a word.

A gold medal on a ribbon would be a foreign object in that world. What a
"medal" means here is **an inked impression on a printed ticket**: the thing a
ration office, a lending library or a school stamps on your card to say you were
there. So:

> **Every badge is one square printed keepsake ticket: the app's own cream
> paper, edge to edge, carrying a single circular engraved seal printed in two
> inks — deep pine green for everything, and one small brick-vermilion mark from
> a second pass of the press.**

This choice earns its keep four times over:

- It is **the same materials as the app**: the two ink colours are literally
  `--accent` and `--red`, and the paper is between `--paper` and `--card`.
- **Line engraving is the only rendering that reads at 40 px.** A painted
  medallion turns to mud at shelf size; engraved contour + hatch + stipple keeps
  a silhouette.
- It gives the set a **constant and a variable**: the paper, the ring and the
  two inks are the deck's identity; the thing inside the ring is the badge's.
  That division is what the anchor mechanism (D5) enforces.
- The second ink is the deck's **signature**, exactly as blood was the tarot
  deck's — present on every badge, always as one small mark slightly off
  register. It is measurable (§6, check 6) and it is the thing that makes
  thirteen quiet green pictures feel printed rather than generated.

### D2 — Square, 1024 master, two delivered sizes; the medal is *printed on* a ticket, not *cut out* as a disc

Generated at **1024×1024**, exactly 1:1. Delivered as **768×768** (the panel
F13 draws at ~220 css px, which is 660 device px on a 3× iPhone) and **160×160**
(the shelf's leading mark at ~40 css px, 120 device px at 3×). One master, two
derivatives, no upscaling anywhere.

**A round medal survives a square PNG by not being round.** The seal is a
circular *impression printed on a square ticket*, with a quiet margin of bare
paper around it. There is therefore:

- **no transparency.** No alpha channel, no cut-out, no halo, no premultiply
  bug, no "what colour is behind the antialiased edge" question. The check
  script asserts the alpha channel is absent or uniformly 255.
- **no black mat.** The tarot deck's expensive lesson — the model paints a
  photograph of a card on a table unless told, in capitals, that the image *is*
  the card — applies identically and the style block carries the same rule. The
  polarity of the measurement inverts, though, and that matters: tarot's
  full-bleed test flags a *flat* edge strip as a letterbox bar, whereas here a
  flat edge strip is **correct** (it is bare paper) and the failure looks like a
  *dark* or *inconsistent* edge. §6 check 3 is rewritten for that, not copied.

### D3 — One asset serves both themes, because paper does not invert

This is the real trade and the tarot skill offers nothing on it. Three options
were considered:

| Option | Why not |
|---|---|
| Transparent line art in one ink, tinted per theme | Cannot tint a raster per theme without CSS filters, and no single ink clears 3:1 on both `#F0EDE4` and `#131311`. `--accent` green reads on cream and vanishes on near-black; the dark-mode sage `#86BBA6` does the reverse. |
| Two assets, light and dark | 26 paid images, 26 judgements, and the model will not produce a faithful inverse of an approved image — you get two different pictures, which is worse than one. It also doubles F13's plumbing and the cache story. |
| **One asset carrying its own paper plate** | **Chosen.** |

The badge is an **object**, not a surface. A pressed ticket is cream in both
themes for the same reason a real one is: paper does not repaint itself when the
room gets dark. In light theme it sits nearly flush with `--paper`, separated by
the 1px `--rule` border and `--r-card` radius F13 will draw around it — the
correct, quiet look. In dark theme it reads as a specimen laid on a dark table,
which is a real and long-established way to show a printed object.

The glare objection is answered by measurement, not by taste: **§6 check 5
requires the plate's contrast against dark `--paper` (`#131311`) to be ≥ 3.0
*and* its contrast against light `--paper` (`#F0EDE4`) to sit in 1.02–1.55.**
That band is what forces the paper to be a *toned* cream around 90–92%
luminance rather than a bleached white, and 92% cream on `#131311` at 40 px is
a mark, not a lamp. The check script writes the two composites so the judge
looks at the actual thing rather than reasoning about it (§7).

### D4 — Images come from OpenAI's image API, `OPENAI_API_KEY`, offline only

Locked by the brief [S1]. `gen_badge_art.py` reads `.env.local` first and the
environment second and **prints which one it used**, exactly as the tarot tool
does and for the same scar-tissue reason. `.env.local` is already gitignored
here (`.gitignore` line `.env*` with `!.env.example`), so no gitignore change is
needed — **verify this before the first run rather than assuming it.**

Three hard rules, restated because they are the ones that get eroded:

1. **The literal key appears in no file in this repository, including this plan.**
2. **No application code may read `OPENAI_API_KEY`.** It is not `LLM_API_KEY`;
   `src/lib/llm/client.ts` does not read it and must not. `src/lib/env.ts` does
   not gain an entry. Nothing under `src/` ever mentions it. The only two files
   that name the variable are `tools/gen_badge_art.py` and `CLAUDE.md`.
3. Default model **`gpt-image-2`**, overridable with `--model`, per the tarot
   tool.

### D5 — The deck needs an anchor, and the anchor is `first_card`

Yes, badges need the same mechanism, and arguably need it *more* than tarot
cards do. Tarot cards are 22 different paintings that must share a border;
badges are thirteen near-identical objects that must share a paper tone, a ring
diameter, a rule weight, an ink density and a hatch scale. Every one of those is
a continuous quantity that a text prompt specifies loosely and an image
specifies exactly. **Badges 2–13 are generated against an image with
`--reference`, never against a description of one.**

The anchor is **`first_card` / "The Uncle's Trick"**. Reasons: it is the badge
every single user earns, so it is the most-seen object in the set; it is the
origin story of the whole app (the uncle, the pocket, the card); and its scene
is figurative but simple — one hand, one card — which is the right difficulty
for a reference (a trivial anchor under-specifies hatch density; an ornate one
teaches the model to be ornate).

Setting the anchor is a human act: once `first_card` is approved, the operator
copies it to `assets/badges/_anchor.png`. The skill says so and does not do it.

### D6 — Filenames are content-hashed, so the cache header can be `immutable` from day one

`next.config.ts` in this repo is currently **empty** — no `headers()`, no cache
rules. The tarot repo's trap (`public, max-age=31536000, immutable` on
`/cards/:path*` with slug-based, non-content-hashed filenames, so every existing
install keeps the old art for up to a year after a regeneration) therefore does
not exist here **yet**, and this is the one moment where it can be made
impossible instead of merely documented.

**Every shipped file carries the first 8 hex of the master's SHA-256 in its
name:**

```
public/badges/<key>.<hash8>.webp        768×768   — F13's panel
public/badges/<key>.<hash8>.sm.webp     160×160   — the shelf mark
```

Regenerating a badge changes the master's bytes, changes the hash, changes the
filename, and every cache in the world misses correctly. Only then is it honest
to add:

```ts
async headers() {
  return [{
    source: "/badges/:path*",
    headers: [{ key: "cache-control", value: "public, max-age=31536000, immutable" }],
  }];
}
```

with a comment saying *why* it is safe here and was not safe in the project this
skill was copied from. F13 can rely on the filename never being stable and never
needing a cache-bust query string.

### D7 — WebP for delivery, PNG for source

Source art in `assets/badges/` is PNG, lossless, 1024², never edited in place.
Delivery is WebP: the target is iOS Safari, which has supported it since 14, and
a 768² engraving is ~500 kB as PNG against ~45 kB as WebP. **Encode line art at
`quality=90, method=6`, and if ringing is visible on the hairline rule at 220
css px, fall back to lossless WebP** (still far smaller than PNG for two-ink
art). This is a judgement to make while looking at the first promoted badge, not
a number to trust from this plan — see Risks.

### D8 — Three Python tools, and the skill runs only two of them

`tools/` is a new directory. The existing `scripts/` is uniformly `tsx`/`mjs`
invoked from `package.json`; Python that is invoked by a skill rather than by npm
does not belong there, and the split mirrors the repository this skill is
descended from.

- `tools/gen_badge_art.py` — assembles the prompt from `style.md` and POSTs it.
- `tools/check_badge_art.py` — measures a candidate and writes the look-at-it crops.
- `tools/make_badge_assets.py` — derives `public/badges/**` and regenerates the
  manifest. **The skill never runs this one** (§9).

All three are **stdlib + PIL only**. This machine has PIL 12.3.0 and has no
`requests`, no `httpx` and no `openai` package — verified by running
`python3 -c "import requests"` and watching it fail. One POST, a hand-built
multipart body, and `urllib.request` is the whole cost.

### D9 — Parity between `BADGE_CATALOG` and the art is a *compile* error, not a lint

`make_badge_assets.py` generates `src/lib/gamification/badge-art.ts` typed as
`Record<BadgeKey, BadgeArt>` — **not `Partial<Record<…>>`**. Adding badge #14 to
`BADGE_CATALOG` without generating its art fails `npm run typecheck`
immediately, in the same session, before anything ships. That is a far stronger
guarantee than a check script nobody runs, and it costs one keyword.

`npm run badges:check` then covers the half a type cannot: files actually
present on disk, hashes matching bytes, dimensions correct, and no orphaned
files in `public/badges/` from a superseded generation.

---

## 2. Schema changes

**None. No migration.** `badges_awarded` (`badge_key`, `awarded_for_date`,
`created_at`) is untouched; art is addressed by `badge_key` through a static
manifest, and a raster path has no business in a database row that
`stats:recompute` replays. F13 owns any description text and may or may not want
a column for it; F12 has no opinion and adds nothing.

---

## 3. Files

| File | New/Modified | Why |
|---|---|---|
| `.claude/skills/generate-badge-art/SKILL.md` | new | The loop: resolve → anchor → generate → measure → **look** → revise (cap 3) → report. Frontmatter per §4. |
| `.claude/skills/generate-badge-art/style.md` | new | **The deliverable of this plan.** One verbatim style block plus one scene line per badge. Parsed by the generator — the fences and `- <key>: <scene>` format are an interface. §5. |
| `tools/gen_badge_art.py` | new | Assemble prompt, POST to `/v1/images/generations` or `/v1/images/edits`, write `<key>.aNN.png` + `.txt` sidecar. `--dry-run` spends nothing. |
| `tools/check_badge_art.py` | new | Nine measurements (§6) and three written crops (§7). Exit 0/1 on hard checks only. |
| `tools/make_badge_assets.py` | new | Promote-time: master → two WebPs with hashed names → regenerate the TS manifest. Never run by the skill. |
| `assets/badges/.gitkeep` | new | Source art lives here, one `<key>.png` per approved badge. "Never edit in place, never delete." |
| `assets/badges/_anchor.png` | new (by hand) | The approved `first_card`, copied by a human. |
| `assets/badges/_candidates/` | new, **gitignored** | Every attempt plus its prompt sidecar and its crops. Add `assets/badges/_candidates/` to `.gitignore`. |
| `assets/badges/_controls/` | new | Two synthetic PNGs that calibrate the checker before any money is spent (§8 step 3). |
| `public/badges/<key>.<hash8>.webp` (×13) | new | 768² panel art. |
| `public/badges/<key>.<hash8>.sm.webp` (×13) | new | 160² shelf art. |
| `src/lib/gamification/badge-art.ts` | new, **generated** | `Record<BadgeKey, BadgeArt>`. The compile-time parity guard (D9). Plain data, imported by F13's client modal — **no `import "server-only"`**, and it holds no secret. |
| `scripts/check-badge-art.ts` | new | `npm run badges:check`: offline, no network, no database. |
| `package.json` | modified | `"badges:check": "tsx scripts/check-badge-art.ts"`. |
| `next.config.ts` | modified | The `immutable` header for `/badges/:path*`, safe only because of D6, with that reasoning in the comment. |
| `CLAUDE.md` | modified | The new command, the `OPENAI_API_KEY` rule, and the sentence that keeps it out of `src/`. |
| `src/components/README.md` | modified | One paragraph: the badge asset contract and the two rendered sizes F13 must draw at. |
| `.gitignore` | modified | `assets/badges/_candidates/` only. `.env*` already covers `.env.local` — verify. |

`src/lib/gamification/badges.ts` appears nowhere in this table, on purpose.

---

## 4. The skill's frontmatter

```yaml
---
name: generate-badge-art
description: Generate and grade one badge medal image for Daily Words' badge shelf via the OpenAI image API. Use when asked to generate, regenerate or iterate on badge art — e.g. "/generate-badge-art midnight_oil", "regenerate the Sunday badge", "the Ibu medal is unreadable at 40px", "make a medal for the new Tolkien badge" — or whenever a key is added to BADGE_CATALOG and needs art. Handles the whole loop: prompt assembly from the locked style contract, generation against the deck anchor, measurement, and visual judgement at the sizes the app actually draws.
---
```

One badge per invocation. Never a batch loop in one call: the three-attempt cap
and the look-at-it step are per badge, and a loop makes both ceremonial.

---

## 5. `style.md` — the contract

> Preamble that goes at the top of the file, before the block: *Read by
> `tools/gen_badge_art.py`, which parses this file — the fences and the
> `- <key>: <scene>` line format are an interface, not decoration. One file a
> human edits and a script reads, so the prompt that was sent can never drift
> from the prompt that is documented. **Bump the version when you change the
> style block.** Every badge carries its version in its `.txt` sidecar and in
> the manifest, so a mixed set is detectable rather than merely suspected.*

### 5.1 The style block, verbatim

Sent identically with every single badge.

```
<!-- STYLE BLOCK v1 -->
A single printed keepsake ticket, square, in the manner of a nineteenth-century
letterpress ration coupon.

FULL BLEED — THIS IS THE MOST IMPORTANT RULE. The ticket's own paper fills the
entire image, edge to edge and corner to corner. Do not render a photograph of a
ticket. No table, no desk, no background surface, no mat, no border of empty
space, no drop shadow, no rounded corners, no torn or deckled edge, no curl, no
white or black margin on any side. The image IS the paper.

NO TEXT ANYWHERE. No title, no motto, no date, no year, no numeral, no initial,
no monogram, no signature, no watermark, no ring of lettering around the seal,
no glyph or mark that could be read as writing in any alphabet. The application
prints the title beneath the picture. Any text is an automatic rejection.

PAPER: flat, evenly toned cream stock, warm and very slightly grey — the colour
of a clean index card, about 92 percent luminance, a touch of yellow in it,
never bleached to pure white. A very fine paper tooth and nothing else: no
stain, no foxing, no ring marks, no sepia, no tea-brown ageing, no scorched
edge. This is fresh stock, printed this morning.

THE SEAL: one circular impression, centred, occupying about 76 percent of the
image width, with a quiet margin of bare paper all around it. Its edge is a
double rule — one heavier line and one hair line — enclosing a narrow band. That
band carries a repeating engraved chain of small lozenges and dots and nothing
else; it never carries words. Inside the band sits this badge's own subject,
alone, with generous space around it.

INK: exactly two inks, the way a small press runs them.
The first ink is a deep pine green, desaturated and quiet, near #2F5D50. It
draws everything — the rules, the band, the subject, all of it.
The second ink is a dull brick vermilion, near #8A3324, and it appears once and
once only: a single small mark sitting very slightly off register from the
green, the fingerprint of a second pass through the press. It never colours the
subject and it never outlines anything.
No third colour appears anywhere. Green ink, one vermilion mark, cream paper.

RENDERING: line engraving. Every tone is built from engraved line — contour,
cross-hatch, stipple — the way a dictionary plate or a banknote vignette is
built, the ink sitting on the paper and biting very slightly into it. Even
weight throughout, nothing darker than a firm mid-tone. No painting, no wash, no
soft gradient, no airbrush, no glow, no bevel, no embossing, no metallic sheen,
no three-dimensional rendering, no photographic realism, and no shadow anywhere
inside the seal.

TONE: quiet, dry, matter-of-fact, fond without sentiment. A clerk's object and a
working desk, not an award. The vocabulary of this set is engraved line, plain
rules, and ordinary things that have been used. It contains no ribbons, no
rosettes, no laurel wreaths, no stars, no trophies, no cups, no crowns and no
ticks.

READ AT FORTY PIXELS. The application draws this forty pixels wide in a list and
about two hundred and twenty in a panel. One clear silhouette, generous internal
spacing, heavy enough line to survive the reduction, and no detail that exists
only at full resolution.

ONE SUBJECT, ITS OWN SUBJECT. The paper, the ring and the two inks belong to the
whole set; what sits inside the ring belongs to this badge alone. Do not fall
back on an open book, a quill, a wreath or a star as a default centre. Thirteen
badges built from the same object is the way this set fails.
<!-- /STYLE BLOCK -->
```

### 5.2 Scenes

One line per badge, appended to the style block as `SUBJECT FOR THIS BADGE:`.
Format is parsed: `- <key>: <scene>`. Each names a **distinct central object and
a distinct internal geometry**, and each names **where the single vermilion mark
goes** — that placement is part of the design, not decoration, because a mark
that lands in the same place thirteen times stops being a second pass and starts
being a logo.

Three rules learned from the deck this skill descends from, restated for badges:

**Say what the picture IS.** Every negative you write is a noun the model has
now been told to think about. The block above carries the negatives it must; the
scene lines carry none.

**Describe a pose, never count body parts.** Hands appear in this set and hands
are where these models fail. `one hand cupped inside the other` fixes the
arrangement and implies exactly two without ever enumerating anything;
`two hands, both visible` reads as anatomical enumeration and produces worse
results, not better ones.

**Avoid faces of numbers and faces of clocks.** Anything with a dial invites
numerals, and numerals are text. Turn the face away.

```
- first_card: A hand seen from the back, drawing a small blank card half out of a coat pocket; the pocket's stitching, the card's clean edge, and nothing else. The card's face is bare stock. VERMILION: a small thumbprint smudged at the card's lower corner.
- full_week: Seven identical narrow coupons joined in a strip, perforated between them and fanned into a shallow arc so that all seven edges show; the leading coupon already torn away along its perforation, its stub still attached. VERMILION: a short mark struck across that stub.
- sunday: Seven narrow ruled columns standing like palings, the last one wider than the rest and filled with dense cross-hatch, and in front of them a plain enamel mug set down on the base rule. VERMILION: the ring the mug has left on the rule.
- midnight_oil: A small brass oil lamp with a tall glass chimney, its flame low, the light drawn as straight engraved rays falling across a bare desk edge, and a moth settled on the chimney's rim. VERMILION: the flame itself at the wick, the only warm thing in the picture.
- new_year: An hourglass laid on its side and run out, beside a squat stoneware ink pot whose paper seal is still unbroken. VERMILION: a blob of wax on that seal.
- womens_day: A single sprig of mimosa laid diagonally across an open, emptied envelope, its round blossoms drawn as fine stipple, the envelope's flap creased back. VERMILION: a plain ring mark clipped by the envelope's edge, empty of any device.
- world_book_day: An empty wooden stage seen from the wings, one stool at its centre, a rope of the fly system falling past the near edge of the frame, boards receding into the dark. VERMILION: a single rose lying on the stool.
- fathers_day: A man's wristwatch with a cracked leather strap, unbuckled and laid down in a loose coil, turned so that only the plain case back shows. VERMILION: the worn patch on the strap where the buckle has bitten through.
- indonesia_independence: An upright ribbon microphone on a plain stand, seen a little from below, with a tall bamboo pole rising behind it and a halyard falling from the pole's top; a small pennant is bent to the halyard, its upper half printed solid and its lower half left as bare paper. VERMILION: that pennant's upper half.
- ibu: A woman's hands, one cupped inside the other, holding a small heap of melati jasmine buds, with a strung length of the same buds running out between her fingers and off the lower rule. VERMILION: the thread the buds are strung on.
- christmas: A heavy door-knocker on a panelled door, its lion mask softening into a human face, the ring hanging dead still, the panelling's mouldings drawn in firm contour. VERMILION: a sprig of holly wedged behind the ring.
- year_end: A squared stack of twelve identical torn-off paper leaves on a desk, the topmost lifting at one corner in a draught, the empty calendar backing board leaning against the stack behind. VERMILION: the pin still stuck through the top leaf.
- leap_day: A hare in mid-leap over a low stone wall, drawn as a natural-history plate, its shadow the only thing beneath it; the wall's coping stones run in even blocks with one block missing from the run and set aside on the grass below. VERMILION: a mark on that single set-aside stone.
```

**Collision audit of the thirteen, done at design time so the judge has a
baseline to check against:** hand-and-pocket / fanned coupons / columns-and-mug
/ oil lamp / hourglass-and-ink-pot / mimosa-and-envelope / stage-and-stool /
coiled wristwatch / microphone-and-pole / cupped hands / door knocker / stack of
leaves / hare-and-wall. Two known adjacencies to watch: `first_card` and `ibu`
are both hands (different framings — a back of a hand vs a cupped pair), and
`full_week` and `year_end` are both stacks of paper (a fanned arc vs a squared
block). If either pair converges in generation, the one to change is
`full_week` — a bundle of seven wooden tally sticks bound with twine is the
prepared alternative.

**`christmas` deliberately is not a candle.** The obvious Dickens image is a
guttering stub under a conical extinguisher, and it would have been the second
flame in the set after `midnight_oil`. Marley's knocker is unmistakably *A
Christmas Carol*, holds a silhouette at 40 px far better than smoke does, and
frees the flame for the badge that is actually about staying up.

### 5.3 The fourteenth, drafted for F13 and not generated by F12

F13 adds "Sauron's Favorite" for a card drawn on 2 September, the day Tolkien
died. F13 owns the key; `sauron` is suggested. The scene line is drafted here so
that F13's author can adopt it rather than invent a style, and so that the
"adding badge #14" procedure in §10 has a worked example:

```
- sauron: A plain heavy iron ring set down on a bare table beside a briar pipe gone cold, the ring's band entirely smooth and unmarked, a thin coil of smoke still rising from the bowl. VERMILION: a wax seal on the table beside the ring.
```

`the ring's band entirely smooth and unmarked` is load-bearing. The One Ring's
defining feature in every reference image this model has ever seen is an
inscription, and an inscription is text, and text is an automatic rejection.

---

## 6. `check_badge_art.py` — what is objectively measurable

Nine measurements. **Four hard checks fail the run; the rest warn.** A threshold
that fails on something harmless is a threshold somebody comments out.

All initial bands below are **gross-failure catches only**. The tarot deck's
most expensive tuning lesson was setting a band from *one* sample — the anchor —
and then rejecting five perfectly good cards for landing one to three points
outside a floor with no evidence behind it. **Do not tighten any band until at
least six badges are approved**, then re-derive from the observed distribution
and record the range in the comment, as `check_card_art.py` does.

**Cheap and worth it (hard):**

1. **Geometry.** `size == (1024, 1024)`, ratio 1.0000. One line, catches a
   mis-typed `--size` before anything else is measured.
2. **Alpha.** No alpha channel, or an alpha channel that is 255 everywhere.
   D2's guarantee, asserted rather than assumed.
3. **Bare-paper edge (the full-bleed test, polarity inverted).** For each of the
   four outermost 1.5% strips: mean luminance in **78–96%**, warm (`R − B ≥ 6`),
   per-strip stddev **≤ 6.0**, and the largest pairwise difference between the
   four strips' means **≤ 4.0**. This one test catches every form of the mat
   failure at once — a black or white margin, a photographed ticket on a table,
   a drop shadow on two sides, a vignette, a torn edge. Note in the comment that
   tarot's equivalent check flags a *flat* strip as a bar and this one requires
   flatness, and why.
4. **Palette agreement against the token palette.** The heart of "conforms with
   our existing ui/ux", and the one place a cheap RGB distance is not good
   enough — it either passes everything or fails everything. Convert sRGB → Lab
   (about fifteen lines of stdlib) and, over a 256² bilinear downsample, compute
   the share of pixels within **ΔE76 ≤ 20** of the locked set
   `{#F0EDE4, #FBFAF5, #E8E4D9, #D8D3C4, #BFB9A9, #8F8D81, #5D5C52, #20211D,
   #2F5D50, #8A3324}`. Require **≥ 88%**. Independently require **unauthorised
   hue mass ≤ 1.5%**: pixels in hue 190–330° (blue/violet) at `s > 0.18,
   v > 0.10`. That second number is the one that catches the specific drift
   these models have toward cool blue-grey shadow, which passes a mean-saturation
   test and looks instantly wrong beside `#F0EDE4`.
5. **Contrast against both themes.** WCAG relative luminance, stdlib arithmetic.
   Plate median luminance vs dark `--paper` `#131311`: ratio **≥ 3.0**. Vs light
   `--paper` `#F0EDE4`: ratio **1.02–1.55** — the plate must be *distinguishable*
   from the page and must not be a white card on cream. Darkest-decile ink
   luminance vs plate median: ratio **≥ 4.5**, so the engraving actually reads.
   This is D3 converted into numbers, and it is why the theme decision is not a
   matter of opinion after the anchor lands.

**Cheap but advisory:**

6. **Vermilion share.** Pixels in the red wedge (hue < 18° or > 350°, `s > 0.30`,
   `v > 0.12`) as a share of the whole: **0.15–3.0%**. Advisory for the reason
   the tarot tool's red check is advisory — a global hue share measures warmth,
   not intent — but here it does one honest job: a badge with **0.00%** has no
   second pass at all, and a badge at 12% has been painted in red, and both are
   visible in one number.
7. **Legibility at shelf size.** Downsample to 40×40 and take the stddev:
   **≥ 16**. A design that dissolves at 40 px scores low here. It is a proxy for
   a judgement, but it is the numeric partner to the crop the script writes, and
   it is the difference between "I thought about small sizes" and "I looked".
8. **Composition safety.** Ink centroid within **3.5%** of the image centre
   (hard — an off-centre seal is visible the moment two badges sit in a list),
   and the outer 6% paper margin's stddev **≤ 4.0** (advisory — anything busy out
   there is about to be clipped by F13's `--r-card` corner).

**Worth it, and only available once there is an anchor:**

9. **Anchor agreement.** Three numbers, and the first is the badge equivalent of
   the tarot deck's frame luminance — the quantity that decides whether thirteen
   objects are one set:
   - **Seal-disc radius**, found by a radial ink-density scan out from the
     centre: within **±2.5%** of the anchor's. (hard)
   - **Plate luminance**: within **±3.0** points of the anchor's. (hard)
   - **Mean colour distance**: **≤ 40**, loose by design, because the subjects
     are supposed to differ. (advisory)

**What is deliberately not measured: text.** There is no OCR on this machine and
no dependency worth adding for one script. Worse, the one cheap proxy that
suggests itself — counting small dark connected components around the annulus,
on the theory that a ring of letters produces 15–40 similar blobs at regular
spacing — is **blind by construction here**, because the style block asks for a
repeating chain of lozenges and dots in exactly that band, which produces the
same signature. Say so in the comment rather than shipping a number that cannot
work. The script's contribution to the text problem is evidence, not a verdict:
it writes a 4× magnified crop of the annulus so the judge can see glyphs at a
size where glyphs are visible.

---

## 7. LOOK AT IT — the judgement checklist

`check_badge_art.py` writes three files next to the candidate before it prints
its verdict, and the skill's step 5 begins by reading them:

- `<name>.themes.png` — a contact strip: the badge at **40 px and 220 px, on
  `#F0EDE4` and on `#131311`**, four cells. This exists so that the sentence
  "view the asset at its real rendered size" is enforced by the artefact rather
  than requested in prose. **Judge from this strip. Do not judge a badge from
  the 1024 master** — at 1024 everything looks considered, and the app never
  draws it at 1024.
- `<name>.ring.png` — the annulus at 4×, which is where lettering hides.
- `<name>.centre.png` — the subject at 2×, which is where hands hide.

Then judge, in this order, because the order is roughly the frequency of failure:

- **Any lettering at all?** Instant reject. Image models stamp words on round
  seals by reflex — a motto in the band, a date under the subject, a monogram, a
  half-formed serif that resolves into nothing. Read `<name>.ring.png` at full
  size, all the way round. This is the single most likely reason a badge burns
  its three attempts.
- **Does it read at 40 px?** Look at the first cell of the theme strip and
  nothing else for a moment. At shelf size a badge is a silhouette. If you
  cannot tell it from the badge above it without reading the title beside it, it
  has failed, regardless of how good it is at 220.
- **Does it repeat another badge's subject?** The ring and the paper are shared
  by design; the interior is not. **Keep a running tally across the set:** how
  many badges now contain a book, a quill, a wreath, a star, a flame, a hand, a
  stack of paper? Two badges centred on an open book means one of them is wrong,
  and the one that is wrong is the one whose title did not demand it. Check
  §5.2's collision audit — the two adjacencies flagged there (`first_card`/`ibu`
  hands, `full_week`/`year_end` paper stacks) are the ones to look at first.
- **Is the paper the app's paper?** The most likely quiet drift is toward
  parchment, sepia, tea-stain and burnt edges — "old paper" is what the model
  thinks "letterpress" means. Hold the theme strip's light-mode cell against
  `#F0EDE4` in your head: a brown ticket on cream reads as a different app.
- **Is it two inks, or has it become a painting?** The contract is engraving:
  contour, hatch, stipple. A soft airbrushed gradient is off-brief even when it
  is pretty, because it is the treatment that dies at 40 px.
- **Does the vermilion read as a second pass?** One small mark, slightly off
  register from the green. If the red has become an outline, a fill, a second
  subject, or four marks, it has stopped being a signature.
- **Is the occasion legible without words?** The shelf shows the mark and the
  title; the panel shows the explanation. But a badge that needs the sentence to
  be understood at all has failed the picture's own job. Could someone who knows
  nothing about this app guess that `ibu` is about mothers?
- **Cultural check on the two Indonesian badges.** `indonesia_independence` and
  `ibu` are the two the model will most confidently get wrong, because its
  default for "independence day" is fireworks and a generic flag, and its
  default for "mother's day" is a bouquet and a heart. Reject both defaults on
  sight. The pennant on `indonesia_independence` must read as solid-over-bare,
  which is Merah-Putih; the buds on `ibu` must be melati jasmine, which is the
  flower of Hari Ibu, and not roses.
- **COUNT THE HANDS.** Hands appear in `first_card` and `ibu` and will wander
  into others. Trace each one from wrist to fingertip and check the fingers
  belong to it. Then do the same for the hare's four legs in `leap_day`. Zoom in
  on `<name>.centre.png`; anatomy is the most common failure of these models and
  it is invisible at 40 px, which means it survives exactly the review that
  checked everything else. **Fix it with pose language, never by counting** —
  `one hand cupped inside the other` generates; `two hands, no extra fingers`
  does not.
- **Is it an award?** Ribbons, rosettes, laurel, cups, stars, ticks. A trophy is
  the wrong world.
- **Is it actually good?**

---

## 8. Implementation order

Each step ends somewhere the repository still builds.

1. **Preflight, spending nothing.** Confirm `OPENAI_API_KEY` is present in
   `.env.local` or the environment (`grep -c OPENAI_API_KEY .env.local` — never
   print the value). Confirm `.env*` is in `.gitignore`. Confirm `python3 -c
   "import PIL"` succeeds and `import requests` fails. Confirm `next.config.ts`
   has no `headers()` yet.
2. **Write `style.md`** — §5 in full — and **`SKILL.md`** — §4, §7 and §9. This
   is the reviewable artefact and it costs nothing. Read the thirteen scene lines
   against the thirteen titles and the thirteen rules in
   `src/lib/gamification/badges.ts` before going further.
3. **Write `gen_badge_art.py` and prove `--dry-run`.** `python3
   tools/gen_badge_art.py --dry-run --all` prints all thirteen assembled prompts
   and makes no network call, does not read the key, and writes nothing. Read
   them. This is the last checkpoint before money.
4. **Write `check_badge_art.py` and calibrate it on synthetic controls.** Build
   two by hand in `assets/badges/_controls/`: a flat `#F0EDE4` 1024² square (must
   pass geometry, alpha and edge; must fail palette-agreement's ink requirement
   and legibility) and a 1024² square with the same paper inset inside a black
   mat (must fail check 3). An instrument that has never been shown a known
   failure is an instrument with an unknown floor.
5. **The anchor run.** `python3 tools/gen_badge_art.py first_card` — no
   `--reference`; this is the anchor, and the report must say so. Iterate to
   approval under the three-attempt cap. **Show the operator the theme strip and
   ask explicitly whether the cream plate on `#131311` is acceptable** — D3 is
   the one decision in this plan that should be confirmed against a real image
   rather than a number, and this is the cheapest moment to reverse it.
6. **Human promotes the anchor**: copy the winning candidate to
   `assets/badges/first_card.png` and to `assets/badges/_anchor.png`.
7. **Generate the other twelve**, one skill invocation each, every one with
   `--reference assets/badges/_anchor.png`. After the sixth approval, stop and
   **re-derive the bands in `check_badge_art.py` from the seven observed values**,
   recording the range in each comment.
8. **Human promotes the twelve** into `assets/badges/<key>.png`.
9. **Write and run `make_badge_assets.py`.** It emits the twenty-six WebPs with
   hashed names and regenerates `src/lib/gamification/badge-art.ts`. Inspect the
   768 WebP at 220 css px in a browser for ringing on the hair rule; drop to
   lossless if it is visible (D7).
10. **Write `scripts/check-badge-art.ts`, add `badges:check` to `package.json`,
    run it.** Then `npm run typecheck` — which is now the parity guard.
11. **Add the `immutable` header to `next.config.ts`** with D6's reasoning in the
    comment, and `npm run build`.
12. **Update `CLAUDE.md`** (the command, the key rule, "no application code reads
    `OPENAI_API_KEY`") and **`src/components/README.md`** (the asset contract and
    the two rendered sizes F13 draws at).

---

## 9. What the skill deliberately does not do

Three things, because each is a decision and none is undone by re-running a
script:

- **It never writes to `assets/badges/`.** That is source art. Promotion of a
  candidate is a human act; the skill suggests it and stops. `_candidates/` is
  gitignored and is where every attempt lives, with its exact prompt beside it.
- **It never sets the anchor.** Approving one badge as the reference for the
  other twelve is the highest-leverage decision in the whole feature and it is
  made once.
- **It never runs `make_badge_assets.py`.** Regenerating `public/badges/**`
  changes what ships. Because of D6 the change is *safe* — new hash, new
  filename, correct cache miss — but it is still a change to the shipped app made
  from inside an art-generation loop, and it should sit in its own commit
  alongside a `badges:check` run. The skill flags it and lets the operator
  sequence it.

The skill's report is: the winning candidate's path, its measurements, the theme
strip, what was rejected and why, the attempt count, and the two suggested human
acts.

---

## 10. Extensibility — adding badge #14

This is the reason the skill exists, so the procedure is written down rather
than implied. To add "Sauron's Favorite":

1. **`src/lib/gamification/badges.ts`** — add `{ key: "sauron", title: "Sauron's
   Favorite" }` to `BADGE_CATALOG` and the rule to `evaluateBadges`. (F13's job,
   not F12's. The rule must stay pure — no `new Date()`, dates through
   `lib/time/local-date.ts`.) `npm run typecheck` **now fails**, because
   `BADGE_ART` is a total `Record<BadgeKey, BadgeArt>` and has no `sauron`. That
   failure is the feature.
2. **`.claude/skills/generate-badge-art/style.md`** — add one line to the Scenes
   list: `- sauron: <scene>`, in the same position the key occupies in
   `BADGE_CATALOG`, so the two files read in the same order. §5.3 has the draft.
   Do **not** touch the style block; a change there bumps the version and leaves
   thirteen badges on v1, which is the mixed set the version stamp exists to
   catch.
3. **`/generate-badge-art sauron`** — the skill resolves the key, finds
   `_anchor.png`, generates against it, measures, looks, revises up to three
   times, reports.
4. **Human promotes** the winner to `assets/badges/sauron.png`.
5. **`python3 tools/make_badge_assets.py`** — writes the two WebPs and
   regenerates the manifest. `npm run typecheck` passes again.
6. **`npm run badges:check` and `npm run stats:recompute -- --all`** (the latter
   because `CLAUDE.md` requires it after any change to `badges.ts`).

Three files a human edits — `badges.ts`, `style.md`, and nothing else — and two
generated ones. The three ways this set could drift are each closed by a
different mechanism, on purpose:

| Drift | Caught by |
|---|---|
| A badge key with no art | `npm run typecheck` (total `Record<BadgeKey, …>`) |
| Art with no badge key | `npm run badges:check` (orphan scan of `public/badges/`) |
| A scene line with no key, or a key with no scene line | `gen_badge_art.py` refuses to start: it asserts that the set of keys in `style.md` equals the set parsed out of `BADGE_CATALOG` in `badges.ts` |

That third one is worth spelling out: the generator reads `badges.ts` with a
regex over the `key:` fields rather than hardcoding a count. The tarot tool
hardcodes `len(scenes) != 22` because a tarot deck is 22 forever; a badge set is
explicitly not fixed, and a hardcoded `13` is the line that would need editing in
a fourth file every time.

---

## 11. Verification

**`npm run badges:check`** — offline, no network, no database, CI-runnable, per
the brief's convention. It asserts:

- every key in `BADGE_CATALOG` has an entry in `BADGE_ART` (belt to
  `typecheck`'s braces, and it is the one that survives a `Partial<>` regression);
- every entry's two files exist under `public/badges/` at exactly 768×768 and
  160×160 (read from the PNG/WebP header, no decode);
- the `<hash8>` in each filename equals the first 8 hex of the SHA-256 recorded
  in the manifest, and that recorded hash equals the SHA-256 of
  `assets/badges/<key>.png` — which is what makes "the shipped file is the
  approved master" a checked statement rather than a hope;
- no orphan files in `public/badges/` (a stale hash left behind by a
  regeneration);
- `BADGE_ART`'s key order matches `BADGE_CATALOG`'s, so a diff of the generated
  file is readable;
- every entry carries the same `styleVersion` — a mixed set is a failure, not a
  surprise.

**`python3 tools/gen_badge_art.py --dry-run --all`** — the `:dry-run` this
feature owes under the brief's convention, with one difference worth stating:
the brief's `:dry-run` convention makes *real model calls* because in those
features the prompt is the deliverable and an exit code only reports transport.
Here the prompt is *also* the deliverable, but a real call costs a paid image, so
this dry run prints the assembly and spends nothing. **The real-call equivalent
is the skill itself**, and its exit code likewise reports only transport — the
badge is the feature and it is read by eye against §7.

**Manual passes no script can cover:**

- The whole set as one contact sheet at 40 px, on both themes. Thirteen badges
  in a column is exactly what `/profile` draws, and it is the only view in which
  "they all look the same" is visible.
- The same at 220 px, one at a time, for the collision tally in §7.
- The two Indonesian badges shown to someone who celebrates those days.
- `/kitchen-sink` at 375 px in both colour schemes once F13 lands, which is where
  the plate-on-dark-paper decision gets its final judgement in situ.

---

## 12. Risks and open questions

Everything here is a thing this plan could not verify without running it.

- **The two-ink discipline may not survive `gpt-image-2`.** These models drift
  toward full colour and toward "aged" paper. The palette-agreement check (§6.4)
  is designed to catch it, but its 88% floor is a guess with no measurements
  behind it, and it may reject good badges or pass bad ones on the first run.
  Treat the first six badges as calibration data, exactly as the tarot deck's
  frame-luminance band had to be re-derived after it rejected five good cards.
- **Hex codes in prompts are aspirational.** `near #2F5D50` is a hint, not a
  specification; the model reads the words far more than the number. The colour
  is enforced by measurement after the fact, not by the prompt.
- **Naming forbidden nouns may summon them.** The TONE paragraph names ribbons,
  rosettes, laurel, stars, trophies, cups and crowns in order to exclude them,
  and image models are notoriously bad at negation. This is a deliberate,
  reversible bet. **If a wreath or a ribbon appears in three consecutive
  generations, delete that list rather than lengthening it** — the failure mode
  of a long negative list is that it becomes a shopping list.
- **The no-text failure rate on ring-shaped art is the largest cost risk in this
  plan and is unquantified.** Circular seals are where these models put words.
  If more than about a third of badges burn all three attempts on lettering, the
  fix is structural, not a stronger sentence: consider specifying a **hexagonal
  or square seal** instead of a circular one, which sits much further from the
  "official stamp with a motto" training distribution. That is a v2 style-block
  change, and it invalidates the anchor.
- **`gpt-image-2` at `1024x1024, quality=high`**: availability and per-image
  cost are assumed from the tarot tool's defaults, not confirmed for the square
  size. Confirm on the anchor run before committing to twelve more.
- **`RES_OPTIONS=no-aaaa` is inherited, not measured here.** The tarot repo sets
  it before any DNS because AAAA lookups hang 4–12 s in this WSL image. This is
  the same machine (`6.6.87.2-microsoft-standard-WSL2`) and the line is free, so
  `gen_badge_art.py` sets it at module scope for the same reason — but nothing in
  `daily-words` has measured that hang, and `CLAUDE.md` here does not mention it.
  Keep the comment honest about where the evidence came from.
- **The cream plate on `#131311` is a design judgement made from tokens, not
  from an image.** D3 argues it from first principles and §6.5 constrains it with
  numbers, but the operator should see the anchor's theme strip and confirm
  before twelve more are generated. If it is rejected, the fallback is not two
  assets — it is a **toned plate**: the same art printed on a mid-tone stock
  around 62% luminance, which reduces contrast against light paper to roughly
  1.7 and against dark paper to roughly 5.5, and reads as card stock rather than
  as writing paper in both. That change costs a v2 style block and a new anchor.
- **WebP lossy on hairline engraving** may ring visibly at 220 css px. D7's
  fallback (lossless WebP) is a one-line change in `make_badge_assets.py`, but
  the file sizes it produces have not been measured.
- **`assets/` does not exist in this repository today.** Adding a top-level
  binary-art directory is a structural choice; the alternative is
  `design/badges/`, next to the existing design source. `assets/` is chosen
  because `design/from-claude-design/` is authoritative *input* ([R18]) and
  mixing generated output into it would blur that authority — but this is a
  convention decision that the operator may reasonably overturn on sight.
- **160 px for the shelf mark assumes F13 draws it at ~40 css px.** F13 has not
  been written. If the shelf mark turns out to be 56 px, the 160 asset is short
  at 3×. Cheap insurance: generate the small derivative at **192**, not 160, and
  let F13 draw it smaller.
