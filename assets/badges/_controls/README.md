# Controls for `tools/check_badge_art.py`

Three synthetic images that calibrate the checker before any money is spent.
**An instrument that has never been shown a known failure has an unknown floor**,
and one that has never passed anything has an unknown ceiling. These give it
both, offline, for free.

Run them after any edit to `check_badge_art.py`:

```bash
for f in assets/badges/_controls/*.png; do
  python3 tools/check_badge_art.py "$f" --no-crops --no-anchor
done
```

**`--no-anchor` is required.** These are drawn from the token palette by
arithmetic, not printed on the deck's stock, so once `_anchor.png` exists they
fail check 9 by construction — `synthetic_seal` is on `#F7F4EC` with a 38.3%
seal against the deck's `#EDE9D8` and 41.0%. That failure carries no information,
and a control whose failure you have learned to ignore has stopped being a
control. `--no-anchor` restricts them to checks 1–8, which is what they were
built to calibrate.

| Control | What it is | Must do |
|---|---|---|
| `flat_paper.png` | 1024² of solid `#F0EDE4` | **Pass** geometry, alpha, edge, palette. **Fail** check 5 (no ink pixels at all) and check 8a (no seal ring to find). Warn on 6 and 7. |
| `black_mat.png` | The same paper inset at 76%, on a black mat | **Fail** check 3 — this is the tarot deck's expensive lesson, the model painting a photograph of a ticket on a table instead of the ticket itself. |
| `synthetic_seal.png` | A crude two-ink seal on toned cream: double rule, lozenge band, hatched centre, one vermilion mark | **Pass every hard check in 1–8.** It is not art and it would never be approved, but it proves the bands are reachable. |

`synthetic_seal.png` is the important one and the one the plan did not ask for.
Without it, the first real generation is simultaneously the first test of the
instrument and the first test of the prompt, and a failure cannot be attributed
to either. It is drawn from the token palette by arithmetic, so if it ever stops
passing, the checker changed and not the art.

## Regenerating them

They are committed as bytes so the calibration is reproducible without a run,
but this is exactly how they were made:

```python
import math
from PIL import Image, ImageDraw

N = 1024
PAPER = (0xF0, 0xED, 0xE4)   # --paper
TONED = (0xF7, 0xF4, 0xEC)   # between --paper and --card: the plate the style block asks for
GREEN = (0x2F, 0x5D, 0x50)   # --accent, the first ink
VERM  = (0x8A, 0x33, 0x24)   # --red, the second pass

# 1 — flat paper
Image.new("RGB", (N, N), PAPER).save("assets/badges/_controls/flat_paper.png")

# 2 — the same paper inset in a black mat
mat = Image.new("RGB", (N, N), (0, 0, 0))
inset = int(N * 0.12)
mat.paste(Image.new("RGB", (N - inset * 2, N - inset * 2), PAPER), (inset, inset))
mat.save("assets/badges/_controls/black_mat.png")

# 3 — a crude two-ink seal that should clear every hard band
img = Image.new("RGB", (N, N), TONED)
d = ImageDraw.Draw(img)
c, r = N / 2, N * 0.38
d.ellipse([c - r, c - r, c + r, c + r], outline=GREEN, width=9)              # heavy rule
d.ellipse([c - r * 0.96, c - r * 0.96, c + r * 0.96, c + r * 0.96],
          outline=GREEN, width=3)                                            # hair line
d.ellipse([c - r * 0.84, c - r * 0.84, c + r * 0.84, c + r * 0.84],
          outline=GREEN, width=5)                                            # inner rule
for i in range(48):                                                          # lozenge band
    a = 2 * math.pi * i / 48
    lx, ly = c + r * 0.90 * math.cos(a), c + r * 0.90 * math.sin(a)
    d.ellipse([lx - 7, ly - 7, lx + 7, ly + 7], fill=GREEN)
ri = r * 0.80                                                                # hatched centre
for y in range(int(c - ri), int(c + ri), 7):
    half = math.sqrt(max(0.0, ri * ri - (y - c) ** 2))
    d.line([(c - half, y), (c + half, y)], fill=GREEN, width=3)
d.ellipse([c + 40, c + 96, c + 96, c + 152], fill=VERM)                      # the second pass
img.save("assets/badges/_controls/synthetic_seal.png")
```

The hatch pitch (7 px on, 3 px wide) is what puts the ink share near 40% and the
40 px stddev well over its floor. It is coarser than a real engraving, which is
why this control passes comfortably rather than marginally — it is a floor test,
not a lookalike.

## The correction note the reference path needs

Measured over the whole deck: `/v1/images/edits` (any run with `--reference`)
prints the plate about **5 points darker** than `/v1/images/generations` did for
the anchor — a parchment drift, and the single most common reason a badge needed
a second attempt. Ten of twelve reference-path badges landed inside their bands
on the first try once this was appended with `--note`:

> The stock is a cool clean cream, the colour of a fresh index card, close to
> #F0EDE4 — lighter and greyer than parchment or a manila card, and a clear step
> lighter than the reference image's paper. It is inked evenly from edge to edge:
> the paper in every corner is the same tone as the paper at the centre, flat and
> open, with only a fine tooth in it. The single vermilion mark is printed in the
> same dull brick vermilion as the second pass, a definite mark rather than a
> pale pink one.

It is a `--note`, deliberately, and not a line in the style block: a style-block
edit bumps the version and leaves thirteen badges on v1, which is the mixed set
the version stamp exists to catch.

Do not push it further than this. Telling the model the stock is "exactly the
same cream as the reference" over-corrects to ~76%, and asking for a lighter
stock again over-corrects to ~90%.
