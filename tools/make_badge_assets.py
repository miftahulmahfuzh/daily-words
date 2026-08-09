#!/usr/bin/env python3
"""Promote approved masters to shipped assets, and regenerate the manifest.

    python3 tools/make_badge_assets.py
    python3 tools/make_badge_assets.py --dry-run
    python3 tools/make_badge_assets.py --lossless

Design record: plans/F12-badge-art-skill.md D6, D7, D9.

  assets/badges/<key>.png                  1024² PNG, lossless, never edited in place
    → public/badges/<key>.<hash8>.webp       768²  — F13's panel
    → public/badges/<key>.<hash8>.sm.webp    192²  — the shelf mark
    → src/lib/gamification/badge-art.ts      the manifest, a TOTAL Record

THE SKILL NEVER RUNS THIS (F12 §9). Regenerating public/badges/** changes what
ships. Because of D6 the change is *safe* — new bytes, new hash, new filename,
every cache in the world misses correctly — but it is still a change to the
shipped app, and it belongs in its own commit alongside `npm run badges:check`.

WHY THE HASH IS IN THE FILENAME. The repository this skill descends from set
`public, max-age=31536000, immutable` on slug-named art, so every existing
install kept the old picture for up to a year after a regeneration. That trap
does not exist here yet, and content-hashed names are the one thing that makes it
impossible rather than merely documented. `next.config.ts` may only carry the
immutable header because of this file.

WHY THE Record IS TOTAL. `Record<BadgeKey, BadgeArt>`, never `Partial<>`. Adding
badge #14 to BADGE_CATALOG without generating its art fails `npm run typecheck`
in the same session, before anything ships. That failure is the feature, and it
costs one keyword.
"""

import argparse
import hashlib
import re
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.exit("error: this tool needs Pillow (`python3 -c 'import PIL'` must work)")

ROOT = Path(__file__).resolve().parent.parent
MASTERS = ROOT / "assets" / "badges"
PUBLIC = ROOT / "public" / "badges"
BADGES_TS = ROOT / "src" / "lib" / "gamification" / "badges.ts"
MANIFEST = ROOT / "src" / "lib" / "gamification" / "badge-art.ts"

MASTER_SIZE = 1024
PANEL = 768
# 192, not D2's 160. F12 §12's own insurance note: 160 assumes F13 draws the
# shelf mark at ~40 css px, and F13 has not been written. If it turns out to be
# 56 px, a 160 asset is short at 3×. 192 costs about 2 kB and lets F13 draw it
# smaller, which is always safe.
SMALL = 192
QUALITY = 90
METHOD = 6
# D7 left the lossy/lossless choice as "a judgement to make while looking at the
# first promoted badge, not a number to trust from this plan", and flagged that
# the file sizes had not been measured. Measured on the full deck, style v1:
#
#   quality=90, method=6   96-154 kB per 768² badge, 1.48 MB for thirteen
#   lossless, method=6     ~819 kB per badge,        7.94 MB for thirteen (5.4x)
#
# Decoded and compared against the reference AT 220 CSS PX — the size F13's panel
# actually draws — the lossy encode differs by a maximum of 6/255 and a mean of
# 0.8/255. There is no visible ringing on the hairline rule, so D7's lossless
# fallback is not needed. `--lossless` keeps it one flag away if a future style
# block makes the engraving finer.

CATALOG_RE = re.compile(r"BADGE_CATALOG\s*=\s*\[(.*?)\]\s*as const", re.S)
KEY_RE = re.compile(r'key:\s*"([a-z0-9_]+)"')
STYLE_VER_RE = re.compile(r"^style version:\s*(v\d+)\s*$", re.M)


def catalog_keys():
    m = CATALOG_RE.search(BADGES_TS.read_text(encoding="utf-8"))
    if not m:
        sys.exit(f"error: could not find BADGE_CATALOG in {BADGES_TS}")
    return KEY_RE.findall(m.group(1))


def style_version_for(key):
    """The style version this master was generated against — from its sidecar.

    NOT from style.md's current version. Reading the current version here would
    stamp every badge with "the version now" and make a mixed set undetectable,
    which is the exact thing the version stamp exists to catch.

    The sidecar arrives by promotion: `gen_badge_art.py` writes `<key>.aNN.txt`
    beside every candidate, and the promotion step copies BOTH files. A master
    with no sidecar is recorded as "unknown" and warned about rather than
    guessed at.
    """
    sidecar = MASTERS / f"{key}.txt"
    if not sidecar.exists():
        return None
    m = STYLE_VER_RE.search(sidecar.read_text(encoding="utf-8"))
    return m.group(1) if m else None


def plate_hex(img):
    """The art's own paper, as #rrggbb.

    The same rule tools/check_badge_art.py's `plate_rgb_and_luminance` uses —
    the mean of the outer 5% frame — so the promoted value and the graded value
    can never disagree. That frame is bare paper by construction: the style
    contract's FULL BLEED rule makes the image the paper, and check 3 gates the
    four edge strips at 78-96% luminance with an inter-strip spread of at most
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


def emit_manifest(entries, style_versions):
    versions = sorted({v for v in style_versions.values() if v})
    ver_note = (
        f"generated against style {versions[0]}"
        if len(versions) == 1
        else f"MIXED STYLE VERSIONS: {', '.join(versions)}"
        if versions
        else "style version unknown"
    )
    lines = [
        "/**",
        " * GENERATED FILE — do not edit by hand.",
        " *",
        " *   python3 tools/make_badge_assets.py",
        " *",
        " * Source art is `assets/badges/<key>.png`; these are its derivatives.",
        f" * Every entry here is {ver_note}.",
        " *",
        " * This is a TOTAL `Record<BadgeKey, BadgeArt>` on purpose (F12 D9). A badge",
        " * key added to BADGE_CATALOG with no art fails `npm run typecheck`",
        " * immediately, in the same session, before anything ships — which is a far",
        " * stronger guarantee than a check script nobody runs, and it costs one",
        " * keyword. The fix for that failure is to generate the art, not to reach",
        " * for `Partial<>`.",
        " *",
        " * Filenames carry the first 8 hex of the master's SHA-256. Regenerating a",
        " * badge changes its bytes, its hash and its filename, so every cache misses",
        " * correctly and `next.config.ts` may serve /badges/* as `immutable`.",
        " *",
        " * Plain data. No `import \"server-only\"` — F13's badge modal is a client",
        " * component and imports this — and it holds no secret.",
        " */",
        'import type { BadgeKey } from "./badges";',
        "",
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
        "",
        "/** Intrinsic pixel sizes, so a consumer never has to restate them. */",
        f"export const BADGE_ART_SIZE = {PANEL};",
        f"export const BADGE_ART_SMALL_SIZE = {SMALL};",
        "",
        "export const BADGE_ART: Record<BadgeKey, BadgeArt> = {",
    ]
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
    lines += ["};", ""]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Promote approved badge masters and regenerate the manifest."
    )
    parser.add_argument("--dry-run", action="store_true",
                        help="report what would change; write nothing")
    parser.add_argument("--lossless", action="store_true",
                        help="lossless WebP (D7's fallback if the hairline rule rings)")
    args = parser.parse_args()

    keys = catalog_keys()
    missing = [k for k in keys if not (MASTERS / f"{k}.png").exists()]
    if missing:
        print(f"error: {len(missing)} of {len(keys)} masters are missing from "
              f"assets/badges/:", file=sys.stderr)
        for k in missing:
            print(f"  {k}.png", file=sys.stderr)
        print("\nNothing was written. The manifest is a TOTAL Record and a partial\n"
              "one would not compile — refusing is what keeps the build green while\n"
              "the deck is still being generated. Generate and promote the rest:\n"
              "  /generate-badge-art <key>\n"
              "  cp assets/badges/_candidates/<key>.aNN.png assets/badges/<key>.png\n"
              "  cp assets/badges/_candidates/<key>.aNN.txt assets/badges/<key>.txt",
              file=sys.stderr)
        sys.exit(1)

    PUBLIC.mkdir(parents=True, exist_ok=True)
    entries = []
    versions = {}
    expected = set()

    for key in keys:
        master = MASTERS / f"{key}.png"
        raw = master.read_bytes()
        sha = hashlib.sha256(raw).hexdigest()
        h8 = sha[:8]
        versions[key] = style_version_for(key)
        if versions[key] is None:
            print(f"warning: {key} has no assets/badges/{key}.txt sidecar; its style "
                  f"version will be recorded as \"unknown\". Copy the candidate's "
                  f".txt when you promote.", file=sys.stderr)

        img = Image.open(master).convert("RGB")
        if img.size != (MASTER_SIZE, MASTER_SIZE):
            sys.exit(f"error: {master} is {img.size[0]}×{img.size[1]}, "
                     f"want {MASTER_SIZE}²")

        # Sampled here, off the master already in memory, so the file is read
        # once and both fields of the entry describe the same bytes.
        entries.append((key, sha, plate_hex(img)))

        for size, suffix in ((PANEL, "webp"), (SMALL, "sm.webp")):
            out = PUBLIC / f"{key}.{h8}.{suffix}"
            expected.add(out.name)
            if args.dry_run:
                print(f"would write {out.relative_to(ROOT)}  ({size}²)")
                continue
            opts = {"lossless": True} if args.lossless else {"quality": QUALITY}
            img.resize((size, size), Image.LANCZOS).save(
                out, "WEBP", method=METHOD, **opts
            )
            print(f"{out.relative_to(ROOT)}  {size}²  {out.stat().st_size / 1024:.0f} kB")

    # Orphans: a stale hash left behind by a regeneration. Only files matching the
    # generated shape for a known key are removed; anything else is reported and
    # left alone, because this tool should not be the thing that deletes a file a
    # human put there deliberately.
    shape = re.compile(rf"^({'|'.join(map(re.escape, keys))})\.[0-9a-f]{{8}}\.(sm\.)?webp$")
    for path in sorted(PUBLIC.iterdir()):
        if path.name in expected or path.is_dir():
            continue
        if shape.match(path.name):
            print(f"{'would remove' if args.dry_run else 'removed'} stale "
                  f"{path.relative_to(ROOT)}")
            if not args.dry_run:
                path.unlink()
        else:
            print(f"warning: unrecognised file left alone: {path.relative_to(ROOT)}",
                  file=sys.stderr)

    text = emit_manifest(entries, versions)
    if args.dry_run:
        print(f"\nwould write {MANIFEST.relative_to(ROOT)} "
              f"({len(entries)} entries, {len(text.splitlines())} lines)")
    else:
        MANIFEST.write_text(text, encoding="utf-8")
        print(f"\nwrote {MANIFEST.relative_to(ROOT)}  ({len(entries)} entries)")

    mixed = sorted({v for v in versions.values() if v})
    if len(mixed) > 1:
        print(f"\nwarning: MIXED STYLE VERSIONS across the deck: {', '.join(mixed)}. "
              f"`npm run badges:check` treats this as a failure, not a surprise.",
              file=sys.stderr)

    print("\nnext: npm run badges:check && npm run typecheck")


if __name__ == "__main__":
    main()
