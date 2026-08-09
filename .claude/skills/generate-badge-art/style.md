# The badge deck's style contract

Read by `tools/gen_badge_art.py`, which parses this file — the fences, the
`<!-- STYLE BLOCK vN -->` markers and the `- <key>: <scene>` line format are an
**interface, not decoration**. One file a human edits and a script reads, so the
prompt that was sent can never drift from the prompt that is documented.

**Bump the version when you change the style block.** Every badge carries its
version in its `.txt` sidecar and in the generated manifest, so a mixed set is
detectable rather than merely suspected.

## What the parser takes from this file

| Region | Delimiters | Used for |
|---|---|---|
| The style block | `<!-- STYLE BLOCK vN -->` … `<!-- /STYLE BLOCK -->` | Sent verbatim with every badge. `N` becomes `styleVersion`. |
| The scenes | `<!-- SCENES -->` … `<!-- /SCENES -->`, lines matching `- <key>: <scene>` | One line appended per badge as `SUBJECT FOR THIS BADGE:` |

**A marker only counts when it is alone on its own line.** That is why the table
above can quote `<!-- SCENES -->` inline without the parser mistaking the table
for the scenes; it was the first thing that went wrong when this file was
written, and a non-greedy match that started at the table returned zero scenes
rather than an error.

Everything outside those two regions is prose for humans and is never sent to
the model. That is why §"The fourteenth" below can hold a drafted scene line
without the generator seeing it: it sits outside `<!-- SCENES -->`.

`gen_badge_art.py` refuses to start unless the set of keys inside `<!-- SCENES -->`
is exactly the set of keys in `BADGE_CATALOG` in
`src/lib/gamification/badges.ts`. A scene line with no badge, or a badge with no
scene line, is a startup error rather than a surprise twelve images later.

---

## The style block

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

---

## The scenes

One line per badge, appended to the style block as `SUBJECT FOR THIS BADGE:`.
Each names a **distinct central object and a distinct internal geometry**, and
each names **where the single vermilion mark goes** — that placement is part of
the design, not decoration, because a mark that lands in the same place thirteen
times stops being a second pass and starts being a logo.

Three rules learned from the deck this skill descends from:

**Say what the picture IS.** Every negative you write is a noun the model has now
been told to think about. The style block carries the negatives it must; the
scene lines carry none.

**Describe a pose, never count body parts.** Hands appear in this set and hands
are where these models fail. `one hand cupped inside the other` fixes the
arrangement and implies exactly two without ever enumerating anything; `two
hands, both visible` reads as anatomical enumeration and produces worse results,
not better ones.

**Avoid faces of numbers and faces of clocks.** Anything with a dial invites
numerals, and numerals are text. Turn the face away.

```
<!-- SCENES -->
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
<!-- /SCENES -->
```

### The collision audit

Done at design time so the judge has a baseline to check against, rather than
noticing convergence on badge eleven:

hand-and-pocket / fanned coupons / columns-and-mug / oil lamp /
hourglass-and-ink-pot / mimosa-and-envelope / stage-and-stool / coiled wristwatch
/ microphone-and-pole / cupped hands / door knocker / stack of leaves /
hare-and-wall.

**Two known adjacencies to watch:** `first_card` and `ibu` are both hands
(different framings — a back of a hand vs a cupped pair), and `full_week` and
`year_end` are both stacks of paper (a fanned arc vs a squared block). If either
pair converges in generation, the one to change is `full_week` — a bundle of
seven wooden tally sticks bound with twine is the prepared alternative.

**`christmas` deliberately is not a candle.** The obvious Dickens image is a
guttering stub under a conical extinguisher, and it would have been the second
flame in the set after `midnight_oil`. Marley's knocker is unmistakably *A
Christmas Carol*, holds a silhouette at 40 px far better than smoke does, and
frees the flame for the badge that is actually about staying up.

---

## The fourteenth, drafted and deliberately not generated

F13 adds "Sauron's Favorite" for a card drawn on 2 September, the day Tolkien
died. F13 owns the key; `sauron` is suggested. The scene line is drafted here so
that F13's author can adopt it rather than invent a style, and so that the
"adding badge #14" procedure has a worked example.

**This line sits outside `<!-- SCENES -->` on purpose.** The generator's key-set
assertion compares the scenes region against `BADGE_CATALOG`, and `sauron` is not
in the catalog yet. To adopt it, move the line inside the scenes fence, in the
same position the key occupies in `BADGE_CATALOG`, so the two files read in the
same order.

    - sauron: A plain heavy iron ring set down on a bare table beside a briar pipe gone cold, the ring's band entirely smooth and unmarked, a thin coil of smoke still rising from the bowl. VERMILION: a wax seal on the table beside the ring.

`the ring's band entirely smooth and unmarked` is load-bearing. The One Ring's
defining feature in every reference image this model has ever seen is an
inscription, and an inscription is text, and text is an automatic rejection.

---

## Where this style came from

The user drew the boundary himself: *"of course we are not gonna use the dark
bloody style from the tarot card skill. we will create our own art style that
conforms with our existing ui/ux."*

The two inks are literally `--accent` (`#2F5D50`) and `--red` (`#8A3324`) from
`src/styles/tokens.css`; the paper sits between `--paper` (`#F0EDE4`) and
`--card` (`#FBFAF5`). There are **no icons anywhere in this app** ([R18]) — every
mark on screen is a rule, a dot or a word — so a gold medal on a ribbon would be
a foreign object. What a "medal" means here is an inked impression on a printed
ticket: the thing a ration office or a lending library stamps on your card to say
you were there.

The full argument is `plans/F12-badge-art-skill.md` §1 D1–D3. Read it before
changing anything above the line.
