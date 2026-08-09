#!/usr/bin/env python3
"""Promote approved masters to shipped assets, and regenerate the manifests.

    python3 tools/make_badge_assets.py
    python3 tools/make_badge_assets.py --dry-run
    python3 tools/make_badge_assets.py --lossless

Design record: plans/F12-badge-art-skill.md D6, D7, D9; plans/F22-level-art.md
D1, D6 for the second deck.

  assets/badges/<key>.png                  1024² PNG, lossless, never edited in place
    → public/badges/<key>.<hash8>.webp       768²  — F13's panel
    → public/badges/<key>.<hash8>.sm.webp    192²  — the shelf mark
    → src/lib/gamification/badge-art.ts      the manifest, a TOTAL Record

  assets/levels/<key>.png                  the same, for F22's seventeen tiers
    → public/levels/<key>.<hash8>.webp       768²  — the dialog's hero
    → public/levels/<key>.<hash8>.sm.webp    192²  — the 56px row mark
    → src/lib/gamification/level-art.ts      the manifest, a TOTAL Record

TWO DECKS, ONE INVOCATION (F22 D5). Everything below the `DECKS` table is
shared: the SHA-256, the `h8` filename, the LANCZOS resizes, the WebP encode,
the plate sample, the orphan sweep and the mixed-version warning. Only the
identities differ. Generalising rather than copying is also what makes a change
to one deck's arithmetic reach the other automatically — F21 added `plate_hex`
here and F22 inherited it for free at one call site rather than two.

SEPARATE PUBLIC DIRECTORIES, deliberately. Putting level art under
`public/badges/` would inherit the immutable header and the middleware exemption
for free, and it would also inherit the orphan sweep: the stale-file regex below
and `check-badge-art.ts` §5 both compute "expected filenames" from ONE key set,
and a shared directory makes both correct only against the union. That is
precisely the coupling that lets a stale file survive a regeneration unnoticed.

THE SKILL NEVER RUNS THIS (F12 §9). Regenerating public/** changes what ships.
Because of D6 the change is *safe* — new bytes, new hash, new filename, every
cache in the world misses correctly — but it is still a change to the shipped
app, and it belongs in its own commit alongside `npm run badges:check`.

WHY THE HASH IS IN THE FILENAME. The repository this skill descends from set
`public, max-age=31536000, immutable` on slug-named art, so every existing
install kept the old picture for up to a year after a regeneration. That trap
does not exist here yet, and content-hashed names are the one thing that makes it
impossible rather than merely documented. `next.config.ts` may only carry the
immutable header — on both directories — because of this file.

WHY THE Record IS TOTAL. `Record<BadgeKey, BadgeArt>` and
`Record<LevelArtKey, LevelArt>`, never `Partial<>`. Adding badge #15 to
BADGE_CATALOG, or a tenth streak band to STREAK_LEVELS, without generating its
art fails `npm run typecheck` in the same session, before anything ships. That
failure is the feature, and it costs one keyword.
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
GAMIFICATION = ROOT / "src" / "lib" / "gamification"

MASTER_SIZE = 1024
PANEL = 768
# 192, not D2's 160. F12 §12's own insurance note: 160 assumes F13 draws the
# shelf mark at ~40 css px, and F13 has not been written. If it turns out to be
# 56 px, a 160 asset is short at 3×. 192 costs about 2 kB and lets a consumer
# draw it smaller, which is always safe. F22's level row draws at exactly 56,
# which is the case that note was insuring against.
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
STREAK_RE = re.compile(r"STREAK_LEVELS\s*=\s*\[(.*?)\]\s*as const", re.S)
COLLECTOR_RE = re.compile(r"COLLECTOR_LEVELS\s*=\s*\[(.*?)\]\s*as const", re.S)
KEY_RE = re.compile(r'key:\s*"([a-z0-9_]+)"')
STYLE_VER_RE = re.compile(r"^style version:\s*(v\d+)\s*$", re.M)


def keys_from(source, *regexes):
    """Every `key: "…"` inside each named array literal, in source order."""
    text = source.read_text(encoding="utf-8")
    keys = []
    for rx in regexes:
        m = rx.search(text)
        if not m:
            sys.exit(f"error: could not find `{rx.pattern[:20]}…` in {source}")
        keys.extend(KEY_RE.findall(m.group(1)))
    if not keys:
        sys.exit(f"error: {source} parsed to zero keys")
    return keys


def badge_keys():
    return keys_from(GAMIFICATION / "badges.ts", CATALOG_RE)


def level_keys():
    """Streak tiers then collector tiers — the order `/profile` draws them in."""
    return keys_from(GAMIFICATION / "levels.ts", STREAK_RE, COLLECTOR_RE)


# --------------------------------------------------------------------------- #
# The two decks. Adding a third is a row here.
# --------------------------------------------------------------------------- #

DECKS = [
    {
        "noun": "badge",
        "plural": "badges",
        "masters": ROOT / "assets" / "badges",
        "public": ROOT / "public" / "badges",
        "url": "/badges",
        "manifest": GAMIFICATION / "badge-art.ts",
        "keys": badge_keys,
        "key_type": "BadgeKey",
        "key_import": 'import type { BadgeKey } from "./badges";',
        "art_type": "BadgeArt",
        "const": "BADGE_ART",
        "size_const": "BADGE_ART_SIZE",
        "small_const": "BADGE_ART_SMALL_SIZE",
        "source_of_keys": "BADGE_CATALOG",
        "panel_use": "the badge modal",
        "small_use": "the shelf mark",
        "totality_lines": [
            "This is a TOTAL `Record<BadgeKey, BadgeArt>` on purpose (F12 D9). A badge",
            "key added to BADGE_CATALOG with no art fails `npm run typecheck`",
            "immediately, in the same session, before anything ships — which is a far",
            "stronger guarantee than a check script nobody runs, and it costs one",
            "keyword. The fix for that failure is to generate the art, not to reach",
            "for `Partial<>`.",
        ],
        "client_lines": [
            'Plain data. No `import "server-only"` — F13\'s badge modal is a client',
            "component and imports this — and it holds no secret.",
        ],
        "generate_hint": "/generate-badge-art <key>",
    },
    {
        "noun": "level",
        "plural": "levels",
        "masters": ROOT / "assets" / "levels",
        "public": ROOT / "public" / "levels",
        "url": "/levels",
        "manifest": GAMIFICATION / "level-art.ts",
        "keys": level_keys,
        "key_type": "LevelArtKey",
        "key_import": 'import type { LevelArtKey } from "./levels";',
        "art_type": "LevelArt",
        "const": "LEVEL_ART",
        "size_const": "LEVEL_ART_SIZE",
        "small_const": "LEVEL_ART_SMALL_SIZE",
        "source_of_keys": "STREAK_LEVELS + COLLECTOR_LEVELS",
        "panel_use": "the level dialog’s hero band",
        "small_use": "the 56px mark on /profile",
        "totality_lines": [
            "This is a TOTAL `Record<LevelArtKey, LevelArt>` on purpose (F12 D9, F22",
            "D1). A band added to STREAK_LEVELS or COLLECTOR_LEVELS with no art fails",
            "`npm run typecheck` immediately, in the same session, before anything",
            "ships — which is a far stronger guarantee than a check script nobody",
            "runs, and it costs one keyword. The fix for that failure is to generate",
            "the art, not to reach for `Partial<>`.",
        ],
        "client_lines": [
            'Plain data. No `import "server-only"` — the level dialog is a client',
            "component and imports this — and it holds no secret. A level is derived",
            "from a number and awarded nothing, so no row anywhere names these keys",
            "(F22 D1); they exist only here, in `levels.ts` and in the filenames.",
        ],
        "generate_hint": "python3 tools/gen_badge_art.py <key> --kind level "
                         "--reference assets/levels/_anchor.png",
    },
]


def style_version_for(masters, key):
    """The style version this master was generated against — from its sidecar.

    NOT from the contract file's current version. Reading the current version
    here would stamp every image with "the version now" and make a mixed set
    undetectable, which is the exact thing the version stamp exists to catch.

    The sidecar arrives by promotion: `gen_badge_art.py` writes `<key>.aNN.txt`
    beside every candidate, and the promotion step copies BOTH files. A master
    with no sidecar is recorded as "unknown" and warned about rather than
    guessed at.

    The two decks carry INDEPENDENT version series (F22 D3), which is why this
    takes the master directory: `badges:check` asserts one version per deck, and
    asserting one across the union would couple them.
    """
    sidecar = masters / f"{key}.txt"
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

    One implementation, both decks. F22's level panels need it for exactly the
    reason the badge seals did, and a second copy would be a second thing to
    keep in step with the checker's independent reading.
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


def emit_manifest(deck, entries, style_versions):
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
        f" * Source art is `assets/{deck['plural']}/<key>.png`; these are its derivatives.",
        f" * Every entry here is {ver_note}.",
        " *",
        *(f" * {line}" for line in deck["totality_lines"]),
        " *",
        " * Filenames carry the first 8 hex of the master's SHA-256. Regenerating an",
        " * image changes its bytes, its hash and its filename, so every cache misses",
        f" * correctly and `next.config.ts` may serve {deck['url']}/* as `immutable`.",
        " *",
        *(f" * {line}" for line in deck["client_lines"]),
        " */",
        deck["key_import"],
        "",
        f"export type {deck['art_type']} = {{",
        f"  /** {PANEL}×{PANEL} WebP for {deck['panel_use']}. */",
        "  src: string;",
        f"  /** {SMALL}×{SMALL} WebP for {deck['small_use']}. */",
        "  small: string;",
        f"  /** SHA-256 of `assets/{deck['plural']}/<key>.png`, the approved master. */",
        "  sha256: string;",
        "  /**",
        "   * The art's own paper, `#rrggbb`, as the mean of the master's outer 5%",
        "   * frame. F21's hero paints its band with this so the square art can sit",
        "   * `object-fit: contain` on a wider region with no seam and no crop —",
        "   * the deck cannot be cropped (F21 §1.2: ibu's tassel reaches 95.7% of",
        "   * the image height). Sampled, never chosen: regenerating an image can",
        "   * shift its paper, and `npm run badges:check` recomputes this from the",
        "   * master exactly as it recomputes `sha256`.",
        "   */",
        "  plate: string;",
        "  /** The contract-file version this image was generated against. */",
        "  styleVersion: string;",
        "};",
        "",
        "/** Intrinsic pixel sizes, so a consumer never has to restate them. */",
        f"export const {deck['size_const']} = {PANEL};",
        f"export const {deck['small_const']} = {SMALL};",
        "",
        f"export const {deck['const']}: Record<{deck['key_type']}, {deck['art_type']}> = {{",
    ]
    for key, sha, plate in entries:
        h8 = sha[:8]
        lines += [
            f"  {key}: {{",
            f'    src: "{deck["url"]}/{key}.{h8}.webp",',
            f'    small: "{deck["url"]}/{key}.{h8}.sm.webp",',
            f'    sha256: "{sha}",',
            f'    plate: "{plate}",',
            f'    styleVersion: "{style_versions.get(key) or "unknown"}",',
            "  },",
        ]
    lines += ["};", ""]
    return "\n".join(lines)


def promote(deck, args):
    """One deck. Returns True on success, False if it refused.

    A deck that refuses writes NOTHING — not the derivatives, not the manifest —
    and the other deck is unaffected. A partial total `Record` would not
    compile, and refusing is what keeps the build green while a deck is still
    being generated.
    """
    masters = deck["masters"]
    public = deck["public"]
    keys = deck["keys"]()

    missing = [k for k in keys if not (masters / f"{k}.png").exists()]
    if missing:
        print(f"error: {len(missing)} of {len(keys)} masters are missing from "
              f"{masters.relative_to(ROOT)}/:", file=sys.stderr)
        for k in missing:
            print(f"  {k}.png", file=sys.stderr)
        print(f"\nNothing was written for the {deck['noun']} deck. The manifest is a\n"
              f"TOTAL Record and a partial one would not compile — refusing is what\n"
              f"keeps the build green while the deck is still being generated.\n"
              f"Generate and promote the rest:\n"
              f"  {deck['generate_hint']}\n"
              f"  cp assets/{deck['plural']}/_candidates/<key>.aNN.png "
              f"assets/{deck['plural']}/<key>.png\n"
              f"  cp assets/{deck['plural']}/_candidates/<key>.aNN.txt "
              f"assets/{deck['plural']}/<key>.txt",
              file=sys.stderr)
        return False

    public.mkdir(parents=True, exist_ok=True)
    entries = []
    versions = {}
    expected = set()

    for key in keys:
        master = masters / f"{key}.png"
        raw = master.read_bytes()
        sha = hashlib.sha256(raw).hexdigest()
        h8 = sha[:8]
        versions[key] = style_version_for(masters, key)
        if versions[key] is None:
            print(f"warning: {key} has no assets/{deck['plural']}/{key}.txt sidecar; "
                  f"its style version will be recorded as \"unknown\". Copy the "
                  f"candidate's .txt when you promote.", file=sys.stderr)

        img = Image.open(master).convert("RGB")
        if img.size != (MASTER_SIZE, MASTER_SIZE):
            sys.exit(f"error: {master} is {img.size[0]}×{img.size[1]}, "
                     f"want {MASTER_SIZE}²")

        # Sampled here, off the master already in memory, so the file is read
        # once and both fields of the entry describe the same bytes.
        entries.append((key, sha, plate_hex(img)))

        for size, suffix in ((PANEL, "webp"), (SMALL, "sm.webp")):
            out = public / f"{key}.{h8}.{suffix}"
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
    # human put there deliberately. The key set is THIS deck's, which is why the
    # two decks may not share a directory.
    shape = re.compile(rf"^({'|'.join(map(re.escape, keys))})\.[0-9a-f]{{8}}\.(sm\.)?webp$")
    for path in sorted(public.iterdir()):
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

    text = emit_manifest(deck, entries, versions)
    manifest = deck["manifest"]
    if args.dry_run:
        print(f"\nwould write {manifest.relative_to(ROOT)} "
              f"({len(entries)} entries, {len(text.splitlines())} lines)")
    else:
        manifest.write_text(text, encoding="utf-8")
        print(f"\nwrote {manifest.relative_to(ROOT)}  ({len(entries)} entries)")

    mixed = sorted({v for v in versions.values() if v})
    if len(mixed) > 1:
        print(f"\nwarning: MIXED STYLE VERSIONS across the {deck['noun']} deck: "
              f"{', '.join(mixed)}. `npm run badges:check` treats this as a failure, "
              f"not a surprise.", file=sys.stderr)

    return True


def main():
    parser = argparse.ArgumentParser(
        description="Promote approved masters for both decks and regenerate "
                    "both manifests."
    )
    parser.add_argument("--dry-run", action="store_true",
                        help="report what would change; write nothing")
    parser.add_argument("--lossless", action="store_true",
                        help="lossless WebP (D7's fallback if the hairline rule rings)")
    args = parser.parse_args()

    ok = True
    for i, deck in enumerate(DECKS):
        if i:
            print()
        ok = promote(deck, args) and ok

    if not ok:
        sys.exit(1)

    print("\nnext: npm run badges:check && npm run typecheck")


if __name__ == "__main__":
    main()
