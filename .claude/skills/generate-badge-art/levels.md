# The level deck's style contract

The **second** deck. `style.md` beside this file is the badge deck — fourteen
circular seals, one per `BADGE_CATALOG` key. This file is the seventeen level
tiers from `src/lib/gamification/levels.ts`, and they are **rectangular panels**.
One press, one paper, two inks, two forms. F22 D3 argues the split; the short
version is that a badge is an award *stamped* on a day that happened and a level
is the grade *printed* on the card, and art that cannot tell them apart makes
the picture beside "Keeper of the Pocket" read as a fifteenth badge.

Read by `tools/gen_badge_art.py --kind level`, which parses this file — the
fences, the `<!-- STYLE BLOCK vN -->` markers and the `- <key>: <scene>` line
format are an **interface, not decoration**. One file a human edits and a script
reads, so the prompt that was sent can never drift from the prompt that is
documented.

**Bump the version when you change the style block.** Every level carries its
version in its `.txt` sidecar and in the generated manifest, so a mixed set is
detectable rather than merely suspected. **This `v1` is the level deck's own
series** and has no relationship to `style.md`'s `v1` beyond having been derived
from it — `npm run badges:check` asserts one version *per deck*, never one
across both, precisely so that changing one deck's style block is a decision
about the other rather than an accident to it.

## What the parser takes from this file

| Region | Delimiters | Used for |
|---|---|---|
| The style block | `<!-- STYLE BLOCK vN -->` … `<!-- /STYLE BLOCK -->` | Sent verbatim with every level. `N` becomes `styleVersion`. |
| The scenes | `<!-- SCENES -->` … `<!-- /SCENES -->`, lines matching `- <key>: <scene>` | One line appended per level as `SUBJECT FOR THIS LEVEL:` |

**A marker only counts when it is alone on its own line.** That is why the table
above can quote `<!-- SCENES -->` inline without the parser mistaking the table
for the scenes; it was the first thing that went wrong when `style.md` was
written, and a non-greedy match that started at the table returned zero scenes
rather than an error. `STYLE_RE` and `SCENES_RE` are anchored with `^…$` under
`re.M` for exactly this reason. **Do not reformat the table above onto separate
lines.**

Everything outside those two regions is prose for humans and is never sent to
the model — which is what lets the collision audit below hold three *prepared
alternative* scene lines without the generator ever seeing them.

`gen_badge_art.py --kind level` refuses to start unless the set of keys inside
`<!-- SCENES -->` is exactly the set of `key` values in `STREAK_LEVELS` and
`COLLECTOR_LEVELS` in `src/lib/gamification/levels.ts`. A scene line with no
tier, or a tier with no scene line, is a startup error rather than a surprise
twelve images later — and it is the only one of F22's three drift guards that
fires **before money is spent**.

---

## The style block

Sent identically with every single level. The paragraphs it shares with
`style.md` — FULL BLEED, NO TEXT ANYWHERE, PAPER, INK, RENDERING — are copied
character-for-character and must stay that way: the two decks share a world, and
a drifted paragraph is how they stop.

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
no monogram, no signature, no watermark, no line of lettering along any rule, no
glyph or mark that could be read as writing in any alphabet. The application
prints the title beside the picture. Any text is an automatic rejection.

PAPER: flat, evenly toned cream stock, warm and very slightly grey — the colour
of a clean index card, about 92 percent luminance, a touch of yellow in it,
never bleached to pure white. A very fine paper tooth and nothing else: no
stain, no foxing, no ring marks, no sepia, no tea-brown ageing, no scorched
edge. This is fresh stock, printed this morning.

THE PANEL: one rectangular frame, centred, inset about twelve percent from every
edge, with a quiet margin of bare paper all around it. Its rule is a double
rule — one heavier line and one hair line — and its corners are plain right
angles. The frame carries no ornament: no band, no repeating chain, no lozenges,
no corner flourish and never any lettering. Inside the frame the picture stands
on a single plain ground rule that runs the full width of the frame, with
generous space above it. THIS SET IS RECTANGULAR. There is no circular seal, no
roundel, no disc, no medallion and no ring anywhere in this image; that shape
belongs to a different set and its appearance here is an automatic rejection.

INK: exactly two inks, the way a small press runs them.
The first ink is a deep pine green, desaturated and quiet, near #2F5D50. It
draws everything — the rules, the frame, the ground, the subject, all of it.
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
inside the frame beyond what the ground rule itself carries.

TONE: quiet, dry, matter-of-fact, fond without sentiment. A clerk's object and a
working desk, not an award. This set is the grade PRINTED on a card, not the
stamp pressed onto it. The vocabulary is engraved line, plain rules, and
ordinary things that have been used. It contains no ribbons, no rosettes, no
laurel wreaths, no stars, no trophies, no cups, no crowns and no ticks.

READ AT FIFTY-SIX PIXELS. The application draws this fifty-six pixels wide in a
row and about two hundred and twenty in a panel. One clear silhouette, generous
internal spacing, heavy enough line to survive the reduction, and no detail that
exists only at full resolution.

ONE SCENE, ITS OWN SCENE. The paper, the frame and the two inks belong to the
whole set; what stands inside the frame belongs to this level alone. Do not fall
back on an open book, a quill, a wreath or a star as a default centre. Seventeen
levels built from the same object is the way this set fails.
<!-- /STYLE BLOCK -->
```

---

## The scenes

One line per tier, appended to the style block as `SUBJECT FOR THIS LEVEL:`.
Each names a **distinct central object, a distinct internal geometry, and where
the single vermilion mark goes** — that placement is part of the design, not
decoration, because a mark that lands in the same place seventeen times stops
being a second pass and starts being a logo.

The three rules from `style.md` apply unchanged:

**Say what the picture IS.** Every negative you write is a noun the model has now
been told to think about. The style block carries the negatives it must; the
scene lines carry none.

**Describe a pose, never count body parts.** `collector_barnabys_ghost` is the
one animal in this deck; `its head turned in profile, one wing half opened`
fixes an arrangement without enumerating anything.

**Avoid faces of numbers and faces of clocks.** Anything with a dial invites
numerals, and numerals are text. That is why
`streak_keeper_of_the_pocket` hangs the watch chain between two pockets and
never shows the watch.

```
<!-- SCENES -->
- streak_blank_card: A compositor's type case pulled out onto a bench, every one of its small compartments empty and clean, the case's lay of divisions running in even engraved rules to the frame's edge. VERMILION: a dab of ink dried on the case's front rail where a thumb rests.
- streak_pocket_fuzz: A coat pocket turned inside out and hanging, its lining puckered along the seam, with a small drift of pocket lint, one bent pin and a worn-blank ticket stub fallen onto the ground rule beneath it. VERMILION: the head of the bent pin.
- streak_small_scribe: A child's school desk seen from the side, its lid propped open on one hinge, a steel-nibbed pen lying in the pen groove and a round inkwell sunk in its hole at the corner. VERMILION: the ink standing in the well.
- streak_margin_scribbler: A closed book lying flat, a carpenter's pencil laid along its fore-edge, and four narrow paper slips tipped in at different depths so their ends stand proud of the leaves at uneven lengths. VERMILION: the end of the middle slip.
- streak_keeper_of_the_pocket: A waistcoat hung front-on from a plain hook, a watch chain swagged between its two pockets, and a ring of four small flat keys hanging from the chain's bar. VERMILION: the ribbon threaded through the key ring.
- streak_uncles_apprentice: A shop counter with a brass balance standing on it, its pans level and empty, a canvas apron on a hook behind, and a bolt of cloth stood on end at the counter's far side. VERMILION: the single small weight sitting beside the balance.
- streak_lexicon_smuggler: A flat travelling case open on the ground rule, its false bottom lifted and propped upright, the cavity beneath lined with folded packing paper and entirely empty. VERMILION: the broken wax seal on the case's strap.
- streak_walking_errata: A printer's composing stick lying empty on a bare stone, a proof slip folded once beside it, and a loupe standing on its own rim behind them. VERMILION: a single struck mark on the folded slip's edge.
- streak_dickens_would_nod: A hall stand standing alone against a plain wall, a tall silk hat on its upper peg, a muffler looped beside it, an umbrella stood in the drip tray below and a boot-scraper on the floor rule. VERMILION: the hatband.
- collector_word_picker: A shallow wicker basket set down in a ploughed furrow, one windfall apple lying in it, the furrow's ridges running back in even engraved lines to the frame. VERMILION: the bruise on the apple.
- collector_jam_jar_of_words: A glass preserving jar standing on a scrubbed table, a cloth cover tied over its mouth with string, a dozen small smooth pebbles visible through the glass. VERMILION: the knot in the string.
- collector_shelf_of_odds: One plain deal shelf on iron brackets, carrying a mismatched row set at uneven intervals — a china doorknob, a wooden thread spool, a scallop shell, a stoppered bottle and a horseshoe nail. VERMILION: the bottle's stopper.
- collector_bag_man_of_nouns: A canvas kit bag standing upright on a station platform, its neck open and its drawstring hanging loose, the platform's edge and a porter's barrow wheel behind it. VERMILION: the brass eyelet nearest the drawstring's end.
- collector_private_collector: A shallow specimen drawer pulled half out of a cabinet, its interior divided into small square compartments, each holding one pinned object — a beetle, a key, a button, a nib. VERMILION: the pin through the beetle.
- collector_hoarder_of_rare_speech: A bank of forty small square drawers rising to the top of the frame, each with a plain brass cup handle and an empty card holder beneath it, one drawer drawn out an inch from the rest. VERMILION: the handle of that one drawer.
- collector_curator_of_forgotten_tongues: A glazed cabinet on turned legs, its door standing ajar, three objects on graded stands inside — a bone flute, a clay drinking cup and a folded length of cloth. VERMILION: the cord tying the folded cloth.
- collector_barnabys_ghost: A raven standing on the back of an empty ladder-back chair in a bare room, its head turned in profile, one wing half opened, the floorboards running away behind it. VERMILION: the raven's eye.
<!-- /SCENES -->
```

### The collision audit

Done at design time so the judge has a baseline, rather than noticing convergence
on tier eleven. The interior of every picture in **both** decks must stay
distinct, because `/profile` draws them on one screen.

empty type case / turned-out pocket / school desk / book-and-slips / waistcoat
and keys / counter and balance / case with a false bottom / composing stick /
hall stand // basket in a furrow / preserving jar / deal shelf / kit bag /
specimen drawer / bank of drawers / glazed cabinet / raven on a chair.

**Four adjacencies to watch, three of them across the two decks.** If a pair
converges in generation, change the **level** scene and never the badge, using
the prepared alternative already written down for it:

| Pair | Why they are close | Change **this** one, to **this** |
|---|---|---|
| `streak_blank_card` × badge `first_card` | both about a blank card | `streak_blank_card` → *a pigeon-hole rack of empty slots seen square-on, one slot's divider missing* |
| `streak_pocket_fuzz` × `streak_keeper_of_the_pocket` × badge `first_card` | three pockets, one deck apart | `streak_pocket_fuzz` → *a coat's turned-up cuff shaken out over a bare table, its debris fallen in a small drift* |
| `collector_private_collector` × `collector_hoarder_of_rare_speech` | both drawers | `collector_hoarder_of_rare_speech` → *a lock-up store seen through its open door, crates stacked to the ceiling on both sides of a narrow aisle* |
| `collector_curator_of_forgotten_tongues` × badge `midnight_oil` | the first draft held a clay **oil lamp**; the badge deck already owns the only lamp | already changed to a bone flute and a drinking cup — **do not put the lamp back** |

Two deliberate avoidances, recorded so a later session does not "improve" them
back in:

- **`streak_margin_scribbler` shows no writing in the margin.** The title demands
  marginalia and marginalia is lettering, which is an automatic rejection.
  Tipped-in slips at uneven depths say "somebody has been through this book"
  without a single glyph. The same load-bearing trick as `the ring's band
  entirely smooth and unmarked` in `style.md`'s `tolkien`.
- **`streak_walking_errata` does not show a proof mark.** A caret, a delete-dele
  or a stet is a written symbol and the model will resolve it into letters. The
  vermilion is a plain struck mark on an edge.

### The anchor

`assets/levels/_anchor.png`, and it is **`collector_jam_jar_of_words`** —
generated first, with **no** `--reference`, exactly as F12 D5 generated
`first_card` as the badge anchor. Every subsequent image is an
`/v1/images/edits` call *against* the anchor, so whatever the anchor gets wrong
is baked into sixteen edits. The jar is the simplest silhouette in the set — one
object, one ground rule, one knot for the vermilion — which makes its failures
unambiguous. A complicated anchor produces sixteen inheritances of a compromise
nobody decided to make.

**The badge anchor must not be used.** `assets/badges/_anchor.png` is a circular
seal, and an edit call against it produces circular seals; that is the whole
point of the split.

---

## Where this style came from

`plans/F12-badge-art-skill.md` §1 D1–D3, unchanged — the two inks are literally
`--accent` (`#2F5D50`) and `--red` (`#8A3324`) from `src/styles/tokens.css`, and
the paper sits between `--paper` (`#F0EDE4`) and `--card` (`#FBFAF5`). Read it,
and `style.md`'s § "Where this style came from", before changing anything above
the line.

`plans/F22-level-art.md` owns everything that is *different* here: D1 (why this
is a sibling registry and not a widened `BADGE_ART`), D2 (why the key lives on
the band and is frozen), D3 (seal versus panel), D4 (why this is a second file
with the same marker vocabulary) and D5 (why only the held tier is ever drawn,
and why there is no locked state).
