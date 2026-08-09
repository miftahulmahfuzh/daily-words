#!/usr/bin/env python3
"""Generate one badge medal image for Daily Words via the OpenAI image API.

    python3 tools/gen_badge_art.py first_card
    python3 tools/gen_badge_art.py ibu --reference assets/badges/_anchor.png
    python3 tools/gen_badge_art.py sunday --note "the mug is floating; set it on the base rule"
    python3 tools/gen_badge_art.py --dry-run --all

Design record: plans/F12-badge-art-skill.md (D4, D8, §10).
Style contract: .claude/skills/generate-badge-art/style.md — a file a human
edits and this script reads, so the prompt that was sent can never drift from
the prompt that is documented.

stdlib + PIL only, on purpose (F12 D8). This machine has PIL and has neither
`requests` nor `httpx` nor the `openai` package; one POST and a hand-built
multipart body is the whole cost of not adding a dependency to an art tool that
runs offline on one developer's machine.

THE KEY. `OPENAI_API_KEY` is read here and nowhere else. It is NOT `LLM_API_KEY`
— the app's model access is GLM via z.ai through `src/lib/llm/client.ts`, and
this is a different provider, a different key and a different bill. No file
under `src/` may ever name this variable; `grep OPENAI_API_KEY src/` staying
empty is a checked property of the repository. This script prints which SOURCE
the key came from and never prints the key.
"""

import argparse
import base64
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

# Inherited from the repository this skill descends from, where AAAA lookups
# were measured hanging 4-12 s under WSL before every request. This is the same
# WSL image (6.6.87.2-microsoft-standard-WSL2) but the hang has NOT been
# measured here — the line is free and the honest note is cheaper than the
# measurement. Must be set before any DNS resolution happens.
os.environ.setdefault("RES_OPTIONS", "no-aaaa")

ROOT = Path(__file__).resolve().parent.parent
STYLE_MD = ROOT / ".claude" / "skills" / "generate-badge-art" / "style.md"
BADGES_TS = ROOT / "src" / "lib" / "gamification" / "badges.ts"
CANDIDATES = ROOT / "assets" / "badges" / "_candidates"

API_BASE = "https://api.openai.com/v1"
DEFAULT_MODEL = "gpt-image-2"
SIZE = "1024x1024"
QUALITY = "high"


# --------------------------------------------------------------------------- #
# The style contract
# --------------------------------------------------------------------------- #

# Markers only count when they are alone on their own line. style.md quotes both
# markers inline in its interface table, and a non-greedy match that did not
# anchor started at the table and returned zero scenes rather than an error.
STYLE_RE = re.compile(
    r"^<!-- STYLE BLOCK (v\d+) -->$\n(.*?)^<!-- /STYLE BLOCK -->$",
    re.S | re.M,
)
SCENES_RE = re.compile(r"^<!-- SCENES -->$\n(.*?)^<!-- /SCENES -->$", re.S | re.M)
SCENE_LINE_RE = re.compile(r"^- ([a-z0-9_]+): (.+)$", re.M)


def load_style():
    """(version, style_block, [(key, scene), ...]) from style.md."""
    if not STYLE_MD.exists():
        die(f"no style contract at {rel(STYLE_MD)}")
    text = STYLE_MD.read_text(encoding="utf-8")

    m = STYLE_RE.search(text)
    if not m:
        die("style.md has no `<!-- STYLE BLOCK vN -->` … `<!-- /STYLE BLOCK -->` "
            "region with each marker alone on its own line")
    version, block = m.group(1), m.group(2).strip()

    s = SCENES_RE.search(text)
    if not s:
        die("style.md has no `<!-- SCENES -->` … `<!-- /SCENES -->` region with "
            "each marker alone on its own line")
    scenes = SCENE_LINE_RE.findall(s.group(1))
    if not scenes:
        die("style.md's SCENES region holds no `- <key>: <scene>` lines")

    return version, block, scenes


CATALOG_RE = re.compile(r"BADGE_CATALOG\s*=\s*\[(.*?)\]\s*as const", re.S)
KEY_RE = re.compile(r'key:\s*"([a-z0-9_]+)"')


def load_catalog_keys():
    """Badge keys in BADGE_CATALOG order, read out of badges.ts.

    Read rather than hardcoded, and this is the difference between this tool and
    the tarot tool it descends from. A tarot deck is 22 cards forever, so
    `len(scenes) != 22` is a fair assertion there. A badge set is explicitly not
    fixed — F12 exists because the user said "we will keep adding badges" — so a
    hardcoded 13 is a line that would need editing in a fourth file every time.
    """
    if not BADGES_TS.exists():
        die(f"no badge catalog at {rel(BADGES_TS)}")
    m = CATALOG_RE.search(BADGES_TS.read_text(encoding="utf-8"))
    if not m:
        die(f"could not find `BADGE_CATALOG = [...] as const` in {rel(BADGES_TS)}")
    keys = KEY_RE.findall(m.group(1))
    if not keys:
        die(f"BADGE_CATALOG in {rel(BADGES_TS)} parsed to zero keys")
    return keys


def assert_parity(scene_keys, catalog_keys):
    """Refuse to start on any disagreement between style.md and badges.ts.

    One of the three drift mechanisms in F12 §10, and the only one that has to
    fire before money is spent. The other two are `npm run typecheck` (a badge
    key with no art) and `npm run badges:check` (art with no badge key).
    """
    missing = [k for k in catalog_keys if k not in scene_keys]
    orphan = [k for k in scene_keys if k not in catalog_keys]
    if missing or orphan:
        lines = ["style.md and BADGE_CATALOG disagree:"]
        if missing:
            lines.append(f"  in badges.ts, no scene line: {', '.join(missing)}")
            lines.append("  → add `- <key>: <scene>` inside <!-- SCENES --> in style.md")
        if orphan:
            lines.append(f"  scene line, not in badges.ts: {', '.join(orphan)}")
            lines.append("  → the key was renamed or removed, or the scene is a draft "
                         "that belongs outside <!-- SCENES -->")
        die("\n".join(lines))
    if scene_keys != catalog_keys:
        # Not fatal. Order is a readability property of a generated diff, not a
        # correctness one, and failing a paid run over it would be absurd.
        warn("style.md's scene order differs from BADGE_CATALOG's; the two files "
             "read more easily in the same order")


# --------------------------------------------------------------------------- #
# Prompt assembly
# --------------------------------------------------------------------------- #

def build_prompt(style_block, scene, note=None):
    parts = [style_block, "", f"SUBJECT FOR THIS BADGE: {scene}"]
    if note:
        # After the scene line, so a correction is read as a refinement of this
        # badge rather than as an amendment to the deck's style.
        parts += ["", f"CORRECTION FOR THIS ATTEMPT: {note}"]
    return "\n".join(parts)


# --------------------------------------------------------------------------- #
# The key
# --------------------------------------------------------------------------- #

def read_api_key():
    """`.env.local` first, then the environment. Prints WHICH, never the value.

    The order and the announcement are both scar tissue: a stale exported shell
    variable silently winning over the file you just edited is a confusing hour,
    and one printed word ends it.
    """
    env_file = ROOT / ".env.local"
    if env_file.exists():
        for raw in env_file.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if line.startswith("#") or "=" not in line:
                continue
            name, _, value = line.partition("=")
            if name.strip() != "OPENAI_API_KEY":
                continue
            value = value.strip().strip('"').strip("'")
            if value:
                print("key source: .env.local")
                return value

    value = os.environ.get("OPENAI_API_KEY", "").strip()
    if value:
        print("key source: environment")
        return value

    die("OPENAI_API_KEY is in neither .env.local nor the environment.\n"
        "  It is a DIFFERENT key from LLM_API_KEY — the app's model access is\n"
        "  GLM via z.ai and this is OpenAI's image API. Add it to .env.local,\n"
        "  which is already gitignored.")


# --------------------------------------------------------------------------- #
# The request
# --------------------------------------------------------------------------- #

def post_generation(key, model, prompt):
    body = json.dumps({
        "model": model,
        "prompt": prompt,
        "size": SIZE,
        "quality": QUALITY,
        "n": 1,
    }).encode("utf-8")
    req = urllib.request.Request(
        f"{API_BASE}/images/generations",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
    )
    return send(req)


def post_edit(key, model, prompt, reference: Path):
    """The reference path: /v1/images/edits with the anchor as the input image.

    Multipart is hand-built because this script has no `requests`. The boundary
    is derived from the payload rather than random so that a rerun of the same
    inputs produces the same bytes on the wire, which makes a captured request
    diffable.
    """
    image_bytes = reference.read_bytes()
    boundary = "----dwbadge" + hashlib.sha256(
        image_bytes[:4096] + prompt.encode("utf-8")
    ).hexdigest()[:24]
    sep = f"--{boundary}\r\n".encode()

    parts = []
    for name, value in (("model", model), ("prompt", prompt),
                        ("size", SIZE), ("quality", QUALITY), ("n", "1")):
        parts.append(sep)
        parts.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        parts.append(f"{value}\r\n".encode())

    parts.append(sep)
    parts.append(
        f'Content-Disposition: form-data; name="image[]"; filename="{reference.name}"\r\n'
        f"Content-Type: image/png\r\n\r\n".encode()
    )
    parts.append(image_bytes)
    parts.append(b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode())
    body = b"".join(parts)

    req = urllib.request.Request(
        f"{API_BASE}/images/edits",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
    )
    return send(req)


def send(req):
    started = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:2000]
        die(f"HTTP {exc.code} from the image API\n{detail}\n\n"
            f"  If this says the model is unknown, try --model gpt-image-1.\n"
            f"  {DEFAULT_MODEL!r} is F12 D4's default, inherited from the tarot\n"
            f"  tool and NOT confirmed against this account (F12 §12).")
    except urllib.error.URLError as exc:
        die(f"could not reach {API_BASE}: {exc.reason}")

    elapsed = time.monotonic() - started
    data = payload.get("data") or []
    if not data or "b64_json" not in data[0]:
        die(f"response had no b64_json image:\n{json.dumps(payload)[:2000]}")
    print(f"generated in {elapsed:.1f}s")
    return base64.b64decode(data[0]["b64_json"])


# --------------------------------------------------------------------------- #
# Output
# --------------------------------------------------------------------------- #

def next_attempt_path(key):
    CANDIDATES.mkdir(parents=True, exist_ok=True)
    used = {
        int(m.group(1))
        for p in CANDIDATES.glob(f"{key}.a*.png")
        if (m := re.fullmatch(rf"{re.escape(key)}\.a(\d+)\.png", p.name))
    }
    return CANDIDATES / f"{key}.a{(max(used) + 1) if used else 1:02d}.png"


def write_sidecar(png_path, key, model, version, reference, prompt):
    """The exact prompt beside the exact image.

    This is what lets a candidate you like six weeks from now be explained, and
    what makes "is this badge on the current style block?" answerable without
    guessing.
    """
    sidecar = png_path.with_suffix(".txt")
    sidecar.write_text(
        "\n".join([
            f"badge:          {key}",
            f"model:          {model}",
            f"style version:  {version}",
            f"reference:      {rel(reference) if reference else '(none — anchor run)'}",
            f"size / quality: {SIZE} / {QUALITY}",
            f"image sha256:   {hashlib.sha256(png_path.read_bytes()).hexdigest()}",
            "",
            "--- prompt as sent ---",
            prompt,
            "",
        ]),
        encoding="utf-8",
    )
    return sidecar


# --------------------------------------------------------------------------- #

def rel(path):
    try:
        return str(Path(path).resolve().relative_to(ROOT))
    except ValueError:
        return str(path)


def die(message):
    print(f"\nerror: {message}", file=sys.stderr)
    sys.exit(1)


def warn(message):
    print(f"warning: {message}", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(
        description="Generate one badge medal image for Daily Words.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="The style contract is .claude/skills/generate-badge-art/style.md.",
    )
    parser.add_argument("key", nargs="?", help="a badge key from BADGE_CATALOG")
    parser.add_argument("--all", action="store_true",
                        help="every badge; only legal with --dry-run")
    parser.add_argument("--dry-run", action="store_true",
                        help="assemble and print the prompt; no key, no network, no file")
    parser.add_argument("--reference", type=Path,
                        help="anchor image, normally assets/badges/_anchor.png")
    parser.add_argument("--note", help="a correction appended after the scene line")
    parser.add_argument("--model", default=DEFAULT_MODEL,
                        help=f"image model (default {DEFAULT_MODEL})")
    args = parser.parse_args()

    version, style_block, scenes = load_style()
    scene_by_key = dict(scenes)
    scene_keys = [k for k, _ in scenes]
    catalog_keys = load_catalog_keys()
    assert_parity(scene_keys, catalog_keys)

    if args.all:
        if not args.dry_run:
            die("--all is only legal with --dry-run. One badge per invocation: the "
                "three-attempt cap and the look-at-it step are per badge, and a "
                "loop makes both ceremonial.")
        targets = catalog_keys
    elif args.key:
        if args.key not in scene_by_key:
            die(f"unknown badge key {args.key!r}. Known keys:\n  "
                + "\n  ".join(catalog_keys))
        targets = [args.key]
    else:
        die("name a badge key, or pass --dry-run --all")

    if args.reference and not args.reference.exists():
        die(f"no reference image at {rel(args.reference)}")

    if args.dry_run:
        for i, key in enumerate(targets):
            prompt = build_prompt(style_block, scene_by_key[key], args.note)
            print(f"\n{'=' * 76}\n{key}  (style {version}, model {args.model}, "
                  f"{len(prompt)} chars)\n{'=' * 76}\n{prompt}")
        print(f"\n{'-' * 76}\ndry run: {len(targets)} prompt(s) assembled. "
              f"No key was read, nothing was sent, nothing was written.")
        return

    key_name = targets[0]
    if not args.reference:
        anchor = ROOT / "assets" / "badges" / "_anchor.png"
        if anchor.exists():
            warn(f"{rel(anchor)} exists but --reference was not passed. Badges 2-N "
                 f"should be generated against the anchor, never against a "
                 f"description of it.")
        else:
            print("no --reference and no anchor on disk: this is an ANCHOR RUN.")

    api_key = read_api_key()
    prompt = build_prompt(style_block, scene_by_key[key_name], args.note)
    print(f"badge {key_name}, style {version}, model {args.model}, "
          f"{len(prompt)} chars of prompt")

    if args.reference:
        png = post_edit(api_key, args.model, prompt, args.reference)
    else:
        png = post_generation(api_key, args.model, prompt)

    out = next_attempt_path(key_name)
    out.write_bytes(png)
    sidecar = write_sidecar(out, key_name, args.model, version, args.reference, prompt)

    print(f"\nwrote {rel(out)}  ({len(png) / 1024:.0f} kB)")
    print(f"      {rel(sidecar)}")
    print(f"\nnext: python3 tools/check_badge_art.py {rel(out)}")


if __name__ == "__main__":
    main()
