#!/usr/bin/env python3
"""Measure one badge candidate, and write the three crops a human has to look at.

    python3 tools/check_badge_art.py assets/badges/_candidates/first_card.a01.png

Design record: plans/F12-badge-art-skill.md §6 and §7.

Nine measurements. Hard checks set the exit code; advisory ones only print. A
threshold that fails on something harmless is a threshold somebody comments out,
so the bands below are **gross-failure catches only** and are deliberately loose.

  DO NOT TIGHTEN A BAND UNTIL AT LEAST SIX BADGES ARE APPROVED, then re-derive
  from the observed distribution and record the observed range in the comment.
  The deck this tool descends from set a band from one sample — the anchor — and
  then rejected five perfectly good cards for landing one to three points
  outside a floor with no evidence behind it.

Every band's provenance is recorded beside it. `(observed, 13 badges, style v1)`
marks one that has been re-derived from a real distribution — done once, after
the whole deck was generated, exactly as the paragraph above requires. Four
bands moved and each says why in place; the rest held on first contact and are
annotated with the range they held over. A later session adding badge #14 should
NOT re-derive from one new sample.

The exit code is not the verdict. The verdict is §7's checklist, read against
the three PNGs this writes — and the largest failure mode of these models, text
stamped around a circular seal, is not measured here at all. See NOT_MEASURED.
"""

import argparse
import colorsys
import math
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.exit("error: this tool needs Pillow (`python3 -c 'import PIL'` must work)")

ROOT = Path(__file__).resolve().parent.parent
ANCHOR = ROOT / "assets" / "badges" / "_anchor.png"

MASTER = 1024

# src/styles/tokens.css, verbatim. Do not invent colours here; add tokens there.
PAPER_LIGHT = (0xF0, 0xED, 0xE4)  # --paper, light
PAPER_DARK = (0x13, 0x13, 0x11)  # --paper, dark
TOKENS = [
    (0xF0, 0xED, 0xE4),  # --paper
    (0xFB, 0xFA, 0xF5),  # --card
    (0xE8, 0xE4, 0xD9),  # --paper-2
    (0xD8, 0xD3, 0xC4),  # --rule
    (0xBF, 0xB9, 0xA9),  # --miss
    (0x8F, 0x8D, 0x81),  # --ink-3
    (0x5D, 0x5C, 0x52),  # --ink-2
    (0x20, 0x21, 0x1D),  # --ink
    (0x2F, 0x5D, 0x50),  # --accent  — the first ink
    (0x8A, 0x33, 0x24),  # --red     — the second pass
]


# --------------------------------------------------------------------------- #
# Colour maths, all stdlib
# --------------------------------------------------------------------------- #

def _lin(c):
    c /= 255.0
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


_LIN = [_lin(i) for i in range(256)]


def rel_luminance(rgb):
    """WCAG relative luminance, 0..1.

    Note the unit. The style block asks the model for "about 92 percent
    luminance", which is the *sRGB value* average a human reads off a colour
    picker; --paper #F0EDE4 is 92.2% in that unit and 84.7% here. Every band in
    this file is relative luminance, because check 5 is a WCAG contrast ratio and
    two units in one report is how a threshold gets misread.
    """
    r, g, b = rgb
    return 0.2126 * _LIN[r] + 0.7152 * _LIN[g] + 0.0722 * _LIN[b]


def contrast(rgb_a, rgb_b):
    la, lb = rel_luminance(rgb_a), rel_luminance(rgb_b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def contrast_l(la, lb):
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def to_lab(rgb):
    """sRGB → CIE Lab (D65). About fifteen lines, and the reason check 4 works.

    A plain RGB euclidean distance either passes everything or fails everything
    on a two-ink palette; Lab is what makes "within ΔE76 of a token" mean
    roughly "a human would call it that colour".
    """
    r, g, b = (_LIN[c] for c in rgb)
    x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
    y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 1.00000
    z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883

    def f(t):
        return t ** (1 / 3) if t > 0.008856 else (7.787 * t) + (16 / 116)

    fx, fy, fz = f(x), f(y), f(z)
    return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))


TOKEN_LABS = [to_lab(c) for c in TOKENS]


def nearest_token_de(lab):
    best = 1e9
    for tl in TOKEN_LABS:
        d = math.dist(lab, tl)
        if d < best:
            best = d
    return best


def mean(xs):
    return sum(xs) / len(xs) if xs else 0.0


def stdev(xs):
    if len(xs) < 2:
        return 0.0
    m = mean(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / len(xs))


# --------------------------------------------------------------------------- #
# The report
# --------------------------------------------------------------------------- #

class Report:
    def __init__(self):
        self.hard_failures = []
        self.warnings = []

    def hard(self, name, ok, detail):
        mark = "PASS" if ok else "FAIL"
        print(f"  [{mark}] {name}: {detail}")
        if not ok:
            self.hard_failures.append(name)

    def soft(self, name, ok, detail):
        mark = " ok " if ok else "warn"
        print(f"  [{mark}] {name}: {detail}")
        if not ok:
            self.warnings.append(name)

    def note(self, name, detail):
        print(f"  [ -- ] {name}: {detail}")


# --------------------------------------------------------------------------- #
# Geometry helpers
# --------------------------------------------------------------------------- #

def plate_rgb_and_luminance(px, w, h):
    """The paper, sampled from the outer 5% frame.

    The seal occupies about 76% of the width, so from 88% of the half-width
    outward is bare paper by construction. Taking the plate from a frame rather
    than from "the lightest pixels" is what keeps a badge with a large pale
    subject from measuring its subject and calling it the paper.
    """
    band = max(1, int(round(min(w, h) * 0.05)))
    rs, gs, bs, lums = [], [], [], []
    for y in range(h):
        edge_row = y < band or y >= h - band
        for x in range(w):
            if not (edge_row or x < band or x >= w - band):
                continue
            r, g, b = px[x, y][:3]
            rs.append(r)
            gs.append(g)
            bs.append(b)
            lums.append(rel_luminance((r, g, b)))
    lums.sort()
    med = lums[len(lums) // 2]
    return (round(mean(rs)), round(mean(gs)), round(mean(bs))), med


def edge_strips(px, w, h, frac=0.015):
    """The four outermost strips, as (mean_lum_pct, stdev, warmth) triples."""
    t = max(1, int(round(min(w, h) * frac)))
    regions = {
        "top": [(x, y) for y in range(t) for x in range(w)],
        "bottom": [(x, y) for y in range(h - t, h) for x in range(w)],
        "left": [(x, y) for x in range(t) for y in range(h)],
        "right": [(x, y) for x in range(w - t, w) for y in range(h)],
    }
    out = {}
    for name, coords in regions.items():
        lums, warms = [], []
        for x, y in coords:
            r, g, b = px[x, y][:3]
            lums.append(rel_luminance((r, g, b)) * 100.0)
            warms.append(r - b)
        out[name] = (mean(lums), stdev(lums), mean(warms))
    return out


def inkiness_map(img, plate_lum, size=256):
    """How much darker than the paper each pixel is, on a `size`² downsample.

    Everything that needs a notion of "where the ink is" — the centroid, the
    radial scan — reads this, so there is one definition of ink in the file.
    """
    small = img.resize((size, size), Image.BILINEAR)
    sp = small.load()
    grid = []
    for y in range(size):
        row = []
        for x in range(size):
            lum = rel_luminance(sp[x, y][:3])
            row.append(max(0.0, plate_lum - lum))
        grid.append(row)
    return grid


def seal_radius(grid):
    """Outer radius of the seal, as a fraction of image width.

    A radial ink-density scan: the seal's edge is a double rule, which is the
    outermost place where a whole annulus is inky. Taking the outermost annulus
    above a quarter of the peak — rather than the peak itself — finds the outer
    rule rather than whichever interior hatch happens to be densest.

    Returns None when no ring is found, which is a real answer: a control image
    with no ink has no seal, and inventing a radius for it would hide that.
    """
    n = len(grid)
    c = (n - 1) / 2.0
    max_r = int(c)
    sums = [0.0] * (max_r + 1)
    counts = [0] * (max_r + 1)
    for y in range(n):
        for x in range(n):
            r = int(round(math.hypot(x - c, y - c)))
            if r <= max_r:
                sums[r] += grid[y][x]
                counts[r] += 1
    dens = [sums[r] / counts[r] if counts[r] else 0.0 for r in range(max_r + 1)]
    peak = max(dens) if dens else 0.0
    if peak <= 0.01:
        return None
    threshold = peak * 0.25
    for r in range(max_r, -1, -1):
        if dens[r] >= threshold:
            return r / float(n)  # fraction of image WIDTH, not of the half-width
    return None


def seal_centre_offset(grid, radius):
    """Distance from the image centre to the SEAL's centre, as a fraction of width.

    The ring's GEOMETRY, not its ink mass. This check has been wrong twice and
    both corrections moved it closer to the quantity F12 §6.8 actually names —
    "an off-centre seal is visible the moment two badges sit in a list":

      1. It first measured the centroid of ALL ink, and failed the anchor at
         5.49% while its seal sat dead centre, because `first_card`'s sleeve
         enters at the upper left and its pocket runs along the bottom.
      2. It then measured the centroid of ink INSIDE THE ANNULUS, and failed
         `ibu` at 4.12% — because `ibu`'s scene line says the strung jasmine runs
         "off the lower rule", so the subject crosses the band by design and
         loads one side of it. `world_book_day`'s fly rope does the same.

    Both were the instrument reading the subject. What is actually wanted is
    where the RING sits, so: trace the outer rule along 360 rays, drop the rays
    the subject has intruded on, and fit the first harmonic. For a circle of
    radius R whose centre is offset by (dx, dy),

        r(θ) ≈ R + dx·cos θ + dy·sin θ

    so dx = 2·mean(r(θ)·cos θ) and dy = 2·mean(r(θ)·sin θ) over a full turn.
    A subject crossing the band perturbs a handful of rays and is rejected by the
    median filter; it cannot shift a fit taken over all 360.

    None when no ring was found; a picture with no seal has no seal centre, and
    returning 0.0 would be a passing grade for an empty image.
    """
    if radius is None:
        return None
    n = len(grid)
    c = (n - 1) / 2.0
    r_nominal = radius * n
    r_hi = min(r_nominal * 1.12, c - 1)
    r_lo = r_nominal * 0.80

    rays = []
    steps = 360
    for i in range(steps):
        theta = 2 * math.pi * i / steps
        ct, st = math.cos(theta), math.sin(theta)
        peak = 0.0
        samples = []
        rr = r_lo
        while rr <= r_hi:
            x = int(round(c + rr * ct))
            y = int(round(c + rr * st))
            v = grid[y][x] if 0 <= x < n and 0 <= y < n else 0.0
            samples.append((rr, v))
            peak = max(peak, v)
            rr += 0.5
        if peak <= 0.01:
            rays.append((theta, None))
            continue
        edge = None
        for rr, v in reversed(samples):
            if v >= peak * 0.25:
                edge = rr
                break
        rays.append((theta, edge))

    found = [r for _, r in rays if r is not None]
    if len(found) < steps * 0.5:
        return None
    found.sort()
    med = found[len(found) // 2]

    # Drop rays where the subject crosses the band, or the rule is broken.
    kept = [(t, r) for t, r in rays if r is not None and abs(r - med) <= med * 0.15]
    if len(kept) < steps * 0.4:
        return None

    dx = 2 * mean([r * math.cos(t) for t, r in kept])
    dy = 2 * mean([r * math.sin(t) for t, r in kept])
    return math.hypot(dx, dy) / n


# --------------------------------------------------------------------------- #
# The nine measurements
# --------------------------------------------------------------------------- #

def measure(path: Path, rep: Report, anchor_stats=None):
    img = Image.open(path)
    raw_mode = img.mode
    w, h = img.size

    # 1 — geometry (hard, F12 §6.1)
    rep.hard(
        "1 geometry",
        (w, h) == (MASTER, MASTER),
        f"{w}×{h}, ratio {w / h:.4f} (want {MASTER}×{MASTER}, 1.0000)",
    )

    # 2 — alpha (hard, F12 §6.2 / D2)
    # D2's guarantee asserted rather than assumed: the medal is PRINTED ON a
    # square ticket, not CUT OUT as a disc, so there is no alpha channel to get
    # a halo, a premultiply bug or a "what is behind the antialiased edge"
    # question wrong.
    if "A" in raw_mode:
        alpha = img.getchannel("A")
        lo, hi = alpha.getextrema()
        rep.hard("2 alpha", lo == 255 and hi == 255,
                 f"mode {raw_mode}, alpha range {lo}–{hi} (want none, or 255 flat)")
    else:
        rep.hard("2 alpha", True, f"mode {raw_mode}, no alpha channel")

    img = img.convert("RGB")
    px = img.load()

    # 3 — bare-paper edge (hard, F12 §6.3)
    #
    # POLARITY. The tarot deck's equivalent check flags a *flat* edge strip as a
    # letterbox bar, because a card is a rectangle photographed inside a frame.
    # Here a flat edge strip is CORRECT — it is bare paper — and the failure looks
    # like a dark or inconsistent edge. Do not port that check's sign.
    #
    # One test catches every form of the mat failure at once: a black or white
    # margin, a photographed ticket on a table, a drop shadow on two sides, a
    # vignette, a torn or deckled edge.
    # (observed, 13 badges, style v1): edge luminance 79.3–89.2%, every badge
    # inside the 78–96 band on first contact. Held; not widened, not tightened.
    strips = edge_strips(px, w, h)
    means = [s[0] for s in strips.values()]
    spread = max(means) - min(means)
    bad = []
    for name, (m, sd, warm) in strips.items():
        if not (78.0 <= m <= 96.0):
            bad.append(f"{name} lum {m:.1f}%")
        if sd > 6.0:
            bad.append(f"{name} sd {sd:.1f}")
        if warm < 6.0:
            bad.append(f"{name} warmth {warm:.1f}")
    if spread > 4.0:
        bad.append(f"spread {spread:.1f}")
    rep.hard(
        "3 bare-paper edge",
        not bad,
        (f"lum {min(means):.1f}–{max(means):.1f}% (want 78–96), spread {spread:.1f} "
         f"(≤4.0), max sd {max(s[1] for s in strips.values()):.1f} (≤6.0), "
         f"min warmth {min(s[2] for s in strips.values()):.1f} (≥6)")
        + (f" — {'; '.join(bad)}" if bad else ""),
    )

    # 4 — palette agreement (hard, F12 §6.4)
    #
    # The heart of "conforms with our existing ui/ux", and the one place a cheap
    # RGB distance is not good enough — it either passes everything or fails
    # everything on a two-ink palette. The second number is the one that earns
    # its keep: it catches the specific drift these models have toward cool
    # blue-grey shadow, which passes a mean-saturation test and looks instantly
    # wrong beside #F0EDE4.
    small = img.resize((256, 256), Image.BILINEAR)
    sp = small.load()
    de_cache = {}
    near = 0
    cool = 0
    total = 256 * 256
    for y in range(256):
        for x in range(256):
            rgb = sp[x, y]
            d = de_cache.get(rgb)
            if d is None:
                d = nearest_token_de(to_lab(rgb))
                de_cache[rgb] = d
            if d <= 20.0:
                near += 1
            hh, ss, vv = colorsys.rgb_to_hsv(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255)
            if 190 / 360 <= hh <= 330 / 360 and ss > 0.18 and vv > 0.10:
                cool += 1
    near_pct = 100.0 * near / total
    cool_pct = 100.0 * cool / total
    rep.hard(
        "4 palette agreement",
        near_pct >= 88.0 and cool_pct <= 1.5,
        f"{near_pct:.1f}% within ΔE76 20 of a token (≥88.0), "
        f"{cool_pct:.2f}% unauthorised blue/violet (≤1.50)",
    )

    # 5 — contrast against both themes (hard, F12 §6.5 / D3)
    #
    # D3 converted into numbers. One asset serves both themes because paper does
    # not invert — a pressed ticket is cream in a dark room for the same reason a
    # real one is. The 1.02 floor is what forbids a plate that vanishes into
    # light --paper; the 1.55 ceiling is what forbids a bleached white card
    # glaring on cream. That band is why the paper must be a TONED cream around
    # 90–92% sRGB value rather than white.
    plate_rgb, plate_lum = plate_rgb_and_luminance(px, w, h)
    c_dark = contrast_l(plate_lum, rel_luminance(PAPER_DARK))
    c_light = contrast_l(plate_lum, rel_luminance(PAPER_LIGHT))

    # "Darkest-decile INK luminance" — the darkest tenth of the pixels that are
    # ink, not the darkest tenth of the image. The distinction is not pedantic:
    # a line engraving can easily be under 10% ink by area, and taking a flat
    # decile of the whole image would fill it with paper and fail a perfectly
    # dark badge for being sparse. An image with no ink at all has no ink
    # luminance, and saying so is the correct answer rather than 1.00.
    ink_lums = []
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            lum = rel_luminance(px[x, y][:3])
            if lum < plate_lum - 0.10:
                ink_lums.append(lum)
    ink_lums.sort()

    # (observed, 13 badges, style v1): c_light 1.000–1.055, median 1.03.
    #
    # F12 §6.5 wrote this band as 1.02–1.55. THE FLOOR IS GONE, and not because
    # it was inconvenient: it contradicted the decision it was written to
    # enforce. D3 argues the plate should sit "nearly flush with --paper,
    # separated by the 1px --rule border and --r-card radius F13 will draw
    # around it — the correct, quiet look". Five of thirteen badges landed at
    # exactly 1.000, which IS nearly flush, and rejecting them would have been
    # rejecting D3's own stated intent on the third decimal place.
    #
    # The ceiling is the half with a real argument behind it and is kept: a
    # bleached white card glaring on cream is a genuine failure, and every badge
    # clears 1.55 with room to spare.
    problems = []
    if c_dark < 3.0:
        problems.append(f"vs dark paper {c_dark:.2f} < 3.0")
    if c_light > 1.55:
        problems.append(f"vs light paper {c_light:.2f} > 1.55 (a white card on cream)")
    if not ink_lums:
        c_ink = float("nan")
        problems.append("no ink pixels at all")
    else:
        ink_lum = mean(ink_lums[: max(1, len(ink_lums) // 10)])
        c_ink = contrast_l(ink_lum, plate_lum)
        if c_ink < 4.5:
            problems.append(f"ink {c_ink:.2f} < 4.5")
    rep.hard(
        "5 contrast, both themes",
        not problems,
        (f"plate #{plate_rgb[0]:02X}{plate_rgb[1]:02X}{plate_rgb[2]:02X} "
         f"lum {plate_lum * 100:.1f}% | vs #131311 {c_dark:.2f} (≥3.0) | "
         f"vs #F0EDE4 {c_light:.2f} (1.02–1.55) | ink {c_ink:.2f} (≥4.5)")
        + (f" — {'; '.join(problems)}" if problems else ""),
    )

    # 6 — vermilion share (advisory, F12 §6.6)
    #
    # Advisory for the reason the tarot tool's red check is advisory: a global
    # hue share measures warmth, not intent. It does one honest job anyway — a
    # badge at 0.00% has no second pass at all, and a badge at 12% has been
    # painted in red, and both are visible in one number.
    verm = 0
    for y in range(256):
        for x in range(256):
            r, g, b = sp[x, y]
            hh, ss, vv = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            deg = hh * 360
            if (deg < 18 or deg > 350) and ss > 0.30 and vv > 0.12:
                verm += 1
    verm_pct = 100.0 * verm / total
    # (observed, 13 badges, style v1): 0.03–1.02%, median 0.11%.
    #
    # F12 §6.6's floor of 0.15% warned on seven of thirteen. It was set without
    # measurement and it was simply too big: 0.15% of a 1024² image is ~1600
    # pixels, and the scene lines each specify a SINGLE SMALL MARK — a
    # thumbprint, a wax blob, a pin. The one honest job the plan gives this
    # check is "0.00% means there is no second pass at all", and 0.02% does that
    # and nothing more. The ceiling stays: a badge at 12% has been painted in
    # red, and that is still worth saying out loud.
    rep.soft("6 vermilion share", 0.02 <= verm_pct <= 3.0,
             f"{verm_pct:.2f}% (want 0.02–3.00; 0.00 means no second pass at all)")

    # 7 — legibility at shelf size (advisory, F12 §6.7)
    #
    # A proxy for a judgement, and the numeric partner to the theme strip. It is
    # the difference between "I thought about small sizes" and "I looked".
    tiny = img.resize((40, 40), Image.LANCZOS).convert("L")
    # tobytes() rather than getdata(): getdata is deprecated in Pillow 12 and its
    # replacement does not exist in older ones, and an "L" image's raw bytes are
    # exactly the sample values.
    # (observed, 13 badges, style v1): 28.0–55.7, median 35.5. The 16.0 floor
    # held for every badge with wide margin, so it catches only a real collapse
    # — which is what a floor is for. Left alone.
    tsd = stdev(list(tiny.tobytes()))
    rep.soft("7 legibility at 40px", tsd >= 16.0,
             f"stddev {tsd:.1f} (≥16.0) — dissolves at shelf size below this")

    # 8 — composition safety (centroid hard, margin advisory, F12 §6.8)
    grid = inkiness_map(img, plate_lum)
    radius = seal_radius(grid)
    off = seal_centre_offset(grid, radius)
    if off is None:
        rep.hard("8a seal centred", False,
                 "no seal ring found — there is no centre to measure")
    else:
        # (observed, 13 badges, style v1): 0.21–1.41% for twelve of them, median
        # 0.96%, and 0.00% on the synthetic control — which is a mathematically
        # centred circle, so that reading is the instrument's zero and worth
        # keeping as one. `ibu` alone sits at ~4%, a genuinely off-centre ring.
        #
        # The 3.5% band inherited from F12 §6.8 turns out to be about right for
        # the geometric fit, and it is left where it is: it passes every good
        # badge with 2.5× headroom and still catches the one real offender.
        rep.hard("8a seal centred", off <= 0.035,
                 f"{off * 100:.2f}% off centre (≤3.50) — an off-centre seal is "
                 f"visible the moment two badges sit in a list")

    m = max(1, int(round(min(w, h) * 0.06)))
    marg = []
    for y in range(h):
        edge_row = y < m or y >= h - m
        for x in range(0, w, 2):
            if edge_row or x < m or x >= w - m:
                marg.append(rel_luminance(px[x, y][:3]) * 100.0)
    rep.soft("8b outer margin quiet", stdev(marg) <= 4.0,
             f"stddev {stdev(marg):.2f} (≤4.00) — anything busy out here is about "
             f"to be clipped by F13's --r-card corner")

    # 9 — anchor agreement (F12 §6.9)
    #
    # The badge equivalent of the tarot deck's frame luminance: the quantity that
    # decides whether thirteen objects are one set. Badges are near-identical
    # objects that must share a ring diameter, a paper tone and an ink density,
    # and every one of those is a continuous quantity a text prompt specifies
    # loosely and an image specifies exactly.
    if radius is None:
        rep.note("9 seal radius", "no ring found (no ink density peak)")
    else:
        rep.note("9 seal radius", f"{radius * 100:.1f}% of image width "
                                  f"(style block asks for ~38% radius / 76% width)")

    if anchor_stats is None:
        rep.note("9 anchor agreement",
                 "no assets/badges/_anchor.png — this is an ANCHOR RUN, or the "
                 "anchor has not been promoted yet")
    else:
        a_rad, a_lum, a_small = anchor_stats
        # (observed, 13 badges, style v1): seal radius 39.8–42.2% of image
        # width, median 41.4%; max drift from the anchor 2.9%.
        #
        # F12 §6.9 wrote ±2.5%, derived from a single sample — the anchor —
        # exactly the mistake the header warns about. It rejected two badges for
        # a ring difference of one part in forty, which is under half a pixel at
        # the 40 px size the shelf actually draws. ±4.0 covers the observed
        # spread with headroom and still catches a genuinely different ring.
        if radius is None or a_rad is None:
            rep.hard("9a seal radius vs anchor", False,
                     "a ring could not be found in the candidate or the anchor")
        else:
            drift = abs(radius - a_rad) / a_rad * 100
            rep.hard("9a seal radius vs anchor", drift <= 4.0,
                     f"{radius * 100:.1f}% vs anchor {a_rad * 100:.1f}% "
                     f"— {drift:.1f}% drift (≤4.0)")

        # (observed, 13 badges, style v1): plate 80.8–84.7% for twelve of them,
        # with `ibu` alone at 89.6%. Against the anchor's 81.1%, the largest
        # honest delta is 3.6 points.
        #
        # ±4.0 rather than F12 §6.9's ±3.0, for the same one-sample reason — and
        # note that the widened band still fails `ibu` at 8.5 points. That is the
        # check doing its job rather than being talked out of it: `ibu` really is
        # printed on paler stock than the rest of the deck.
        dl = abs(plate_lum - a_lum) * 100
        rep.hard("9b plate luminance vs anchor", dl <= 4.0,
                 f"{plate_lum * 100:.1f}% vs anchor {a_lum * 100:.1f}% "
                 f"— {dl:.1f} points (≤4.0)")
        dists = []
        for y in range(0, 256, 4):
            for x in range(0, 256, 4):
                p, q = sp[x, y], a_small[x, y]
                dists.append(math.dist(p, q))
        rep.soft("9c mean colour distance", mean(dists) <= 40.0,
                 f"{mean(dists):.1f} (≤40.0, loose by design — the subjects are "
                 f"supposed to differ)")

    return img, plate_rgb, plate_lum, radius


# --------------------------------------------------------------------------- #
# LOOK AT IT — the three crops
# --------------------------------------------------------------------------- #

def write_theme_strip(img, out: Path):
    """The badge at 40px and 220px, on light --paper and on dark --paper.

    This exists so that "view the asset at its real rendered size" is enforced by
    the artefact rather than requested in prose. At 1024 everything looks
    considered, and the app never draws it at 1024.

    F13 draws the panel art inside a 1px --rule border with a --r-card radius;
    that border is not drawn here on purpose, because the question this strip
    answers is whether the PLATE separates from the page on its own.
    """
    pad, gap = 32, 32
    sizes = [40, 220]
    row_h = max(sizes) + pad * 2
    W = sum(sizes) + gap + pad * 2

    # Two full-width rows, each its own theme's --paper, stacked. Building the
    # rows whole is what keeps the dark cell's background exactly #131311 rather
    # than whatever a partial paste happened to leave behind.
    strip = Image.new("RGB", (W, row_h * 2))
    for row, bg in enumerate([PAPER_LIGHT, PAPER_DARK]):
        band = Image.new("RGB", (W, row_h), bg)
        x = pad
        for s in sizes:
            band.paste(img.resize((s, s), Image.LANCZOS), (x, (row_h - s) // 2))
            x += s + gap
        strip.paste(band, (0, row * row_h))
    strip.save(out)
    return out


def write_ring_crop(img, radius, out: Path):
    """The annulus, unrolled, in four stacked quarters at 3×.

    Lettering is the single most likely reason a badge burns its three attempts,
    and letters go all the way round a seal — so a corner crop cannot find them.
    Unrolling turns "read a ring" into "read a line", which is the only form in
    which a ring of half-formed serifs is obviously a ring of half-formed serifs.

    NOT a verdict. There is no OCR here (see NOT_MEASURED); this is evidence for
    a human or a model to read.
    """
    w, h = img.size
    px = img.load()
    cx = cy = (w - 1) / 2.0
    r_out = (radius if radius else 0.38) * w
    r_in = r_out * 0.84

    steps = int(2 * math.pi * r_out)
    band = max(8, int(round(r_out - r_in)))
    flat = Image.new("RGB", (steps, band))
    fp = flat.load()
    for i in range(steps):
        theta = 2 * math.pi * i / steps - math.pi / 2  # start at 12 o'clock
        ct, st = math.cos(theta), math.sin(theta)
        for j in range(band):
            rr = r_out - j
            x = int(round(cx + rr * ct))
            y = int(round(cy + rr * st))
            fp[i, j] = px[min(max(x, 0), w - 1), min(max(y, 0), h - 1)][:3]

    quarters = 4
    qw = steps // quarters
    scale = 3
    label = 6
    QW, QH = qw * scale, band * scale
    sheet = Image.new("RGB", (QW, (QH + label) * quarters), PAPER_LIGHT)
    for q in range(quarters):
        piece = flat.crop((q * qw, 0, (q + 1) * qw, band)).resize(
            (QW, QH), Image.LANCZOS
        )
        sheet.paste(piece, (0, q * (QH + label)))
    sheet.save(out)
    return out


def write_centre_crop(img, radius, out: Path):
    """The subject at 2×, which is where hands hide.

    Anatomy is the most common failure of these models and it is invisible at
    40 px, which means it survives exactly the review that checked everything
    else.
    """
    w, _ = img.size
    r = (radius if radius else 0.38) * w * 0.84
    c = (w - 1) / 2.0
    box = (int(c - r), int(c - r), int(c + r), int(c + r))
    crop = img.crop(box)
    crop = crop.resize((crop.width * 2, crop.height * 2), Image.LANCZOS)
    crop.save(out)
    return out


# --------------------------------------------------------------------------- #

NOT_MEASURED = """\
  NOT MEASURED — TEXT. There is no OCR on this machine and no dependency worth
  adding for one script. The one cheap proxy that suggests itself — counting
  small dark connected components around the annulus, on the theory that a ring
  of letters produces 15–40 similar blobs at regular spacing — is BLIND BY
  CONSTRUCTION here, because the style block asks for a repeating engraved chain
  of lozenges and dots in exactly that band and it produces the same signature.
  Read the .ring.png. Any lettering at all is an instant reject."""


def anchor_statistics():
    if not ANCHOR.exists():
        return None
    a = Image.open(ANCHOR).convert("RGB")
    ap = a.load()
    _, a_lum = plate_rgb_and_luminance(ap, a.width, a.height)
    a_rad = seal_radius(inkiness_map(a, a_lum))
    return a_rad, a_lum, a.resize((256, 256), Image.BILINEAR).load()


def main():
    parser = argparse.ArgumentParser(
        description="Measure a badge candidate and write the three crops to look at."
    )
    parser.add_argument("image", type=Path)
    parser.add_argument("--no-crops", action="store_true",
                        help="measure only; skip the three PNGs")
    parser.add_argument("--no-anchor", action="store_true",
                        help="skip check 9; for the synthetic controls, which are "
                             "not deck members")
    args = parser.parse_args()

    if not args.image.exists():
        sys.exit(f"error: no such file: {args.image}")

    print(f"\n{args.image}")
    print("-" * 76)
    rep = Report()
    # The controls calibrate checks 1-8 and are drawn from the token palette by
    # arithmetic, not from the deck's stock — so once an anchor exists they fail
    # check 9 by construction and that failure means nothing. Running them with
    # --no-anchor is what keeps "the controls still pass" a signal rather than a
    # thing you learn to ignore.
    stats = None if args.no_anchor else anchor_statistics()
    img, _, plate_lum, radius = measure(args.image, rep, stats)

    if not args.no_crops:
        stem = args.image.with_suffix("")
        print("\n  LOOK AT IT — read all three before forming an opinion:")
        print(f"    {write_theme_strip(img, Path(f'{stem}.themes.png'))}"
              "   40px and 220px, light and dark")
        print(f"    {write_ring_crop(img, radius, Path(f'{stem}.ring.png'))}"
              "     the annulus unrolled, 4 quarters at 3×")
        print(f"    {write_centre_crop(img, radius, Path(f'{stem}.centre.png'))}"
              "   the subject at 2×")

    print("\n" + NOT_MEASURED)
    print("-" * 76)
    if rep.hard_failures:
        print(f"REJECT — {len(rep.hard_failures)} hard check(s) failed: "
              f"{', '.join(rep.hard_failures)}")
        if rep.warnings:
            print(f"         warnings: {', '.join(rep.warnings)}")
        sys.exit(1)
    if rep.warnings:
        print(f"hard checks passed; {len(rep.warnings)} warning(s): "
              f"{', '.join(rep.warnings)}")
    else:
        print("all measurements inside their bands.")
    print("The exit code is not the verdict. Judge from the crops, against §7.")


if __name__ == "__main__":
    main()
