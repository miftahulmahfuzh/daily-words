#!/usr/bin/env python3
"""Generate one badge medal or level panel for Daily Words via the OpenAI image API.

    python3 tools/gen_badge_art.py first_card
    python3 tools/gen_badge_art.py ibu --reference assets/badges/_anchor.png
    python3 tools/gen_badge_art.py sunday --note "the mug is floating; set it on the base rule"
    python3 tools/gen_badge_art.py --dry-run --all

    python3 tools/gen_badge_art.py --dry-run --all --kind level
    python3 tools/gen_badge_art.py collector_jam_jar_of_words --kind level
    python3 tools/gen_badge_art.py streak_pocket_fuzz --kind level \\
        --reference assets/levels/_anchor.png

Design record: plans/F12-badge-art-skill.md (D4, D8, §10) and
plans/F22-level-art.md (D3, D4).

TWO DECKS, ONE TOOL (F22 D4). `--kind badge` (the default) is F12's fourteen
circular seals, contracted by `style.md` and keyed on `BADGE_CATALOG`.
`--kind level` is F22's seventeen rectangular panels, contracted by `levels.md`
and keyed on `STREAK_LEVELS` + `COLLECTOR_LEVELS`. The flag selects the whole
tuple — contract file, parity source, master directory, subject label — and
nothing else in this file knows which deck it is working on. A second copy of
this script was rejected outright: its hard-won parts are the `.env.local`-
before-environment key order and its printed source, the hand-built multipart
body, the `RES_OPTIONS` line, the attempt numbering and the sidecar, and those
are exactly the parts a copy diverges on first.

Style contracts: `.claude/skills/generate-badge-art/{style,levels}.md` — files a
human edits and this script reads, so the prompt that was sent can never drift
from the prompt that is documented.

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
SKILL = ROOT / ".claude" / "skills" / "generate-badge-art"

# The whole of what `--kind` selects. Adding a third deck is a row here, not a
# branch anywhere below.
KINDS = {
    "badge": {
        "contract": SKILL / "style.md",
        "source": ROOT / "src" / "lib" / "gamification" / "badges.ts",
        "masters": ROOT / "assets" / "badges",
        "subject": "SUBJECT FOR THIS BADGE",
        "noun": "badge",
        # The name of the thing in `source` the parity error should tell the
        # user to look at.
        "table": "BADGE_CATALOG",
    },
    "level": {
        "contract": SKILL / "levels.md",
        "source": ROOT / "src" / "lib" / "gamification" / "levels.ts",
        "masters": ROOT / "assets" / "levels",
        "subject": "SUBJECT FOR THIS LEVEL",
        "noun": "level",
        "table": "STREAK_LEVELS + COLLECTOR_LEVELS",
    },
}

API_BASE = "https://api.openai.com/v1"
DEFAULT_MODEL = "gpt-image-2"
SIZE = "1024x1024"
QUALITY = "high"


# --------------------------------------------------------------------------- #
# The style contract
# --------------------------------------------------------------------------- #

# Markers only count when they are alone on their own line. Both contract files
# quote both markers inline in their interface tables, and a non-greedy match
# that did not anchor started at the table and returned zero scenes rather than
# an error.
STYLE_RE = re.compile(
    r"^<!-- STYLE BLOCK (v\d+) -->$\n(.*?)^<!-- /STYLE BLOCK -->$",
    re.S | re.M,
)
SCENES_RE = re.compile(r"^<!-- SCENES -->$\n(.*?)^<!-- /SCENES -->$", re.S | re.M)
SCENE_LINE_RE = re.compile(r"^- ([a-z0-9_]+): (.+)$", re.M)


def load_style(contract):
    """(version, style_block, [(key, scene), ...]) from a contract file.

    Reused verbatim across both decks — F22 D4's whole argument for giving
    `levels.md` the identical marker vocabulary rather than inventing a
    `LEVEL STYLE BLOCK` marker and a second pair of regexes.
    """
    name = contract.name
    if not contract.exists():
        die(f"no style contract at {rel(contract)}")
    text = contract.read_text(encoding="utf-8")

    m = STYLE_RE.search(text)
    if not m:
        die(f"{name} has no `<!-- STYLE BLOCK vN -->` … `<!-- /STYLE BLOCK -->` "
            "region with each marker alone on its own line")
    version, block = m.group(1), m.group(2).strip()

    s = SCENES_RE.search(text)
    if not s:
        die(f"{name} has no `<!-- SCENES -->` … `<!-- /SCENES -->` region with "
            "each marker alone on its own line")
    scenes = SCENE_LINE_RE.findall(s.group(1))
    if not scenes:
        die(f"{name}'s SCENES region holds no `- <key>: <scene>` lines")

    return version, block, scenes


CATALOG_RE = re.compile(r"BADGE_CATALOG\s*=\s*\[(.*?)\]\s*as const", re.S)
STREAK_RE = re.compile(r"STREAK_LEVELS\s*=\s*\[(.*?)\]\s*as const", re.S)
COLLECTOR_RE = re.compile(r"COLLECTOR_LEVELS\s*=\s*\[(.*?)\]\s*as const", re.S)
KEY_RE = re.compile(r'key:\s*"([a-z0-9_]+)"')


def load_catalog_keys(source):
    """Badge keys in BADGE_CATALOG order, read out of badges.ts.

    Read rather than hardcoded, and this is the difference between this tool and
    the tarot tool it descends from. A tarot deck is 22 cards forever, so
    `len(scenes) != 22` is a fair assertion there. A badge set is explicitly not
    fixed — F12 exists because the user said "we will keep adding badges" — so a
    hardcoded 13 is a line that would need editing in a fourth file every time.
    """
    if not source.exists():
        die(f"no badge catalog at {rel(source)}")
    m = CATALOG_RE.search(source.read_text(encoding="utf-8"))
    if not m:
        die(f"could not find `BADGE_CATALOG = [...] as const` in {rel(source)}")
    keys = KEY_RE.findall(m.group(1))
    if not keys:
        die(f"BADGE_CATALOG in {rel(source)} parsed to zero keys")
    return keys


def load_level_keys(source):
    """Level tier keys in table order (streak, then collector), from levels.ts.

    Read rather than hardcoded for the same reason `load_catalog_keys` is: the
    bands are a tuning decision and the set is explicitly not fixed.

    The parity guard this feeds is the only one of F22's three drift mechanisms
    that fires BEFORE money is spent. The other two are `npm run typecheck` (a
    tier with no art) and `npm run badges:check` (art with no tier).
    """
    if not source.exists():
        die(f"no level tables at {rel(source)}")
    text = source.read_text(encoding="utf-8")
    keys = []
    for rx, name in ((STREAK_RE, "STREAK_LEVELS"), (COLLECTOR_RE, "COLLECTOR_LEVELS")):
        m = rx.search(text)
        if not m:
            die(f"could not find `{name} = [...] as const` in {rel(source)}")
        found = KEY_RE.findall(m.group(1))
        if not found:
            die(f"{name} in {rel(source)} parsed to zero keys")
        keys.extend(found)
    return keys


def assert_parity(scene_keys, source_keys, kind):
    """Refuse to start on any disagreement between the contract and the source.

    One of the three drift mechanisms in F12 §10, and the only one that has to
    fire before money is spent. The other two are `npm run typecheck` (a key
    with no art) and `npm run badges:check` (art with no key).
    """
    contract = kind["contract"].name
    source = rel(kind["source"])
    table = kind["table"]
    missing = [k for k in source_keys if k not in scene_keys]
    orphan = [k for k in scene_keys if k not in source_keys]
    if missing or orphan:
        lines = [f"{contract} and {table} disagree:"]
        if missing:
            lines.append(f"  in {source}, no scene line: {', '.join(missing)}")
            lines.append(f"  → add `- <key>: <scene>` inside <!-- SCENES --> in {contract}")
        if orphan:
            lines.append(f"  scene line, not in {source}: {', '.join(orphan)}")
            lines.append("  → the key was renamed or removed, or the scene is a draft "
                         "that belongs outside <!-- SCENES -->")
        die("\n".join(lines))
    if scene_keys != source_keys:
        # Not fatal. Order is a readability property of a generated diff, not a
        # correctness one, and failing a paid run over it would be absurd.
        warn(f"{contract}'s scene order differs from {table}'s; the two files "
             f"read more easily in the same order")


# --------------------------------------------------------------------------- #
# Prompt assembly
# --------------------------------------------------------------------------- #

def build_prompt(style_block, scene, subject, note=None):
    parts = [style_block, "", f"{subject}: {scene}"]
    if note:
        # After the scene line, so a correction is read as a refinement of this
        # image rather than as an amendment to the deck's style.
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

def next_attempt_path(candidates, key):
    candidates.mkdir(parents=True, exist_ok=True)
    used = {
        int(m.group(1))
        for p in candidates.glob(f"{key}.a*.png")
        if (m := re.fullmatch(rf"{re.escape(key)}\.a(\d+)\.png", p.name))
    }
    return candidates / f"{key}.a{(max(used) + 1) if used else 1:02d}.png"


def write_sidecar(png_path, noun, key, model, version, reference, prompt):
    """The exact prompt beside the exact image.

    This is what lets a candidate you like six weeks from now be explained, and
    what makes "is this badge on the current style block?" answerable without
    guessing.
    """
    sidecar = png_path.with_suffix(".txt")
    sidecar.write_text(
        "\n".join([
            # `badge:` or `level:` — both six characters, so the column stays
            # put. Only `style version:` below is ever parsed
            # (`make_badge_assets.py`); the rest is for a human six weeks later.
            f"{noun + ':':<16}{key}",
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
        description="Generate one badge medal or level panel image for Daily Words.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="The style contracts are .claude/skills/generate-badge-art/"
               "{style,levels}.md — style.md for --kind badge, levels.md for "
               "--kind level.",
    )
    parser.add_argument("key", nargs="?",
                        help="a badge key from BADGE_CATALOG, or a level tier key "
                             "from levels.ts with --kind level")
    parser.add_argument("--kind", choices=sorted(KINDS), default="badge",
                        help="which deck (default badge). `level` is F22's "
                             "rectangular panels, contracted by levels.md")
    parser.add_argument("--all", action="store_true",
                        help="every key in the deck; only legal with --dry-run")
    parser.add_argument("--dry-run", action="store_true",
                        help="assemble and print the prompt; no key, no network, no file")
    parser.add_argument("--reference", type=Path,
                        help="anchor image, normally assets/<deck>/_anchor.png")
    parser.add_argument("--note", help="a correction appended after the scene line")
    parser.add_argument("--model", default=DEFAULT_MODEL,
                        help=f"image model (default {DEFAULT_MODEL})")
    args = parser.parse_args()

    kind = KINDS[args.kind]
    noun = kind["noun"]
    candidates = kind["masters"] / "_candidates"

    version, style_block, scenes = load_style(kind["contract"])
    scene_by_key = dict(scenes)
    scene_keys = [k for k, _ in scenes]
    source_keys = (
        load_level_keys(kind["source"])
        if args.kind == "level"
        else load_catalog_keys(kind["source"])
    )
    assert_parity(scene_keys, source_keys, kind)

    if args.all:
        if not args.dry_run:
            die(f"--all is only legal with --dry-run. One {noun} per invocation: "
                f"the three-attempt cap and the look-at-it step are per {noun}, "
                f"and a loop makes both ceremonial.")
        targets = source_keys
    elif args.key:
        if args.key not in scene_by_key:
            die(f"unknown {noun} key {args.key!r}. Known keys:\n  "
                + "\n  ".join(source_keys))
        targets = [args.key]
    else:
        die(f"name a {noun} key, or pass --dry-run --all")

    if args.reference and not args.reference.exists():
        die(f"no reference image at {rel(args.reference)}")

    if args.dry_run:
        for key in targets:
            prompt = build_prompt(style_block, scene_by_key[key], kind["subject"], args.note)
            print(f"\n{'=' * 76}\n{key}  (style {version}, model {args.model}, "
                  f"{len(prompt)} chars)\n{'=' * 76}\n{prompt}")
        print(f"\n{'-' * 76}\ndry run: {len(targets)} prompt(s) assembled. "
              f"No key was read, nothing was sent, nothing was written.")
        return

    key_name = targets[0]
    if not args.reference:
        # This deck's anchor, never the other's: an edit call against a circular
        # seal produces circular seals, which is the whole point of F22 D3.
        anchor = kind["masters"] / "_anchor.png"
        if anchor.exists():
            warn(f"{rel(anchor)} exists but --reference was not passed. "
                 f"{noun.capitalize()}s 2-N should be generated against the "
                 f"anchor, never against a description of it.")
        else:
            print("no --reference and no anchor on disk: this is an ANCHOR RUN.")

    api_key = read_api_key()
    prompt = build_prompt(style_block, scene_by_key[key_name], kind["subject"], args.note)
    print(f"{noun} {key_name}, style {version}, model {args.model}, "
          f"{len(prompt)} chars of prompt")

    if args.reference:
        png = post_edit(api_key, args.model, prompt, args.reference)
    else:
        png = post_generation(api_key, args.model, prompt)

    out = next_attempt_path(candidates, key_name)
    out.write_bytes(png)
    sidecar = write_sidecar(out, noun, key_name, args.model, version, args.reference, prompt)

    print(f"\nwrote {rel(out)}  ({len(png) / 1024:.0f} kB)")
    print(f"      {rel(sidecar)}")
    print(f"\nnext: python3 tools/check_badge_art.py {rel(out)}")


if __name__ == "__main__":
    main()
