---
name: generate-badge-art
description: Generate and grade one badge medal image for Daily Words' badge shelf via the OpenAI image API. Use when asked to generate, regenerate or iterate on badge art — e.g. "/generate-badge-art midnight_oil", "regenerate the Sunday badge", "the Ibu medal is unreadable at 40px", "make a medal for the new Tolkien badge" — or whenever a key is added to BADGE_CATALOG and needs art. Handles the whole loop: prompt assembly from the locked style contract, generation against the deck anchor, measurement, and visual judgement at the sizes the app actually draws.
---

# Generate badge art

One badge per invocation. **Never a batch loop in one call** — the three-attempt
cap and the look-at-it step are per badge, and a loop makes both ceremonial.

The art style, the thirteen scenes and the reasoning behind them live in
`style.md` next to this file. The full design record is
`plans/F12-badge-art-skill.md`. Read `style.md`; read the plan only when you are
about to change the style.

## The loop

### 1. Resolve the key

The user may give a key (`midnight_oil`), a title ("the Sunday badge"), or a
description ("the Ibu medal"). Resolve it to exactly one key in `BADGE_CATALOG`
in `src/lib/gamification/badges.ts`. If it resolves to more than one or to none,
ask — do not guess, because a wrong key spends money on the wrong picture.

If the key is in `BADGE_CATALOG` but has no line inside `<!-- SCENES -->` in
`style.md`, stop and say so. `gen_badge_art.py` will refuse to start anyway; you
should say why before it does.

### 2. Find the anchor

```bash
ls assets/badges/_anchor.png
```

- **Present** → every generation uses `--reference assets/badges/_anchor.png`.
  This is not optional. Badges are thirteen near-identical objects that must
  share a paper tone, a ring diameter, a rule weight, an ink density and a hatch
  scale, and every one of those is a continuous quantity that a text prompt
  specifies loosely and an image specifies exactly.
- **Absent** → you are generating the anchor. It should be `first_card`; if the
  user asked for something else with no anchor on disk, say that the set has no
  anchor yet and ask whether to make this badge the anchor or to do `first_card`
  first. **Say in your report that this was an anchor run**, because the operator
  has a promotion to perform that they do not have on any other run.

### 3. Generate

```bash
python3 tools/gen_badge_art.py <key> [--reference assets/badges/_anchor.png]
```

Writes `assets/badges/_candidates/<key>.aNN.png` and a `.txt` sidecar holding
the exact prompt, the model, the style version and the reference used. The
sidecar is why a candidate you like six weeks from now can be explained.

`--dry-run` assembles and prints the prompt without reading the key, touching
the network or writing a file. Use it whenever you have edited `style.md` and
want to see what would be sent.

### 4. Measure

```bash
python3 tools/check_badge_art.py assets/badges/_candidates/<key>.aNN.png
```

Nine measurements, four of them hard. Exit code reflects the hard checks only.
It also writes the three files step 5 needs.

**Do not tighten a band because one candidate missed it.** The bands ship as
gross-failure catches; the plan (§6) requires at least six approved badges before
they are re-derived from an observed distribution. A threshold that fails on
something harmless is a threshold somebody comments out.

### 5. LOOK AT IT

`check_badge_art.py` writes three files beside the candidate. **Read all three
with the Read tool before forming any opinion.**

- `<name>.themes.png` — a contact strip: the badge at **40 px and 220 px, on
  `#F0EDE4` and on `#131311`**, four cells. **Judge from this strip. Do not judge
  a badge from the 1024 master** — at 1024 everything looks considered, and the
  app never draws it at 1024.
- `<name>.ring.png` — the annulus at 4×, which is where lettering hides.
- `<name>.centre.png` — the subject at 2×, which is where hands hide.

Then judge in this order, because the order is roughly the frequency of failure:

- **Any lettering at all?** Instant reject. Image models stamp words on round
  seals by reflex — a motto in the band, a date under the subject, a monogram, a
  half-formed serif that resolves into nothing. Read `<name>.ring.png` at full
  size, all the way round. This is the single most likely reason a badge burns
  its three attempts. *Nothing measures this — there is no OCR here, and the one
  cheap proxy is blind by construction because the style block asks for a chain
  of lozenges and dots in exactly the band where letters would sit.*
- **Does it read at 40 px?** Look at the first cell of the theme strip and
  nothing else for a moment. At shelf size a badge is a silhouette. If you cannot
  tell it from the badge above it without reading the title beside it, it has
  failed, regardless of how good it is at 220.
- **Does it repeat another badge's subject?** The ring and the paper are shared
  by design; the interior is not. **Keep a running tally across the set:** how
  many badges now contain a book, a quill, a wreath, a star, a flame, a hand, a
  stack of paper? Two badges centred on an open book means one of them is wrong,
  and the one that is wrong is the one whose title did not demand it. Check
  `style.md`'s collision audit — the two adjacencies flagged there
  (`first_card`/`ibu` hands, `full_week`/`year_end` paper stacks) are the ones to
  look at first.
- **Is the paper the app's paper?** The most likely quiet drift is toward
  parchment, sepia, tea-stain and burnt edges — "old paper" is what the model
  thinks "letterpress" means. Hold the theme strip's light-mode cell against
  `#F0EDE4`: a brown ticket on cream reads as a different app.
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
  default for "independence day" is fireworks and a generic flag, and its default
  for "mother's day" is a bouquet and a heart. Reject both defaults on sight. The
  pennant on `indonesia_independence` must read as solid-over-bare, which is
  Merah-Putih; the buds on `ibu` must be melati jasmine, which is the flower of
  Hari Ibu, and not roses.
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

### 6. Revise, at most three attempts

An attempt is one generation. On rejection, say concretely what failed and pass a
correction through `--note "…"`, which is appended to the prompt after the scene
line. Revise with **positive, physical language**: name what the picture should
be, not what it should stop being. Every negative you write is a noun the model
has now been told to think about.

If a scene is structurally wrong rather than badly executed — the subject cannot
hold a silhouette at 40 px, or it keeps colliding with another badge — **stop and
propose a `style.md` scene edit** rather than spending the third attempt. A scene
line is cheap to change and an attempt is not.

If three attempts fail on lettering specifically, say so plainly in the report
and do not start a fourth. The plan's escalation is structural: a hexagonal or
square seal sits much further from the "official stamp with a motto" training
distribution than a circular one does. That is a v2 style block, it invalidates
the anchor, and it is the operator's decision.

### 7. Report

- the winning candidate's path
- its measurements, and any band it missed
- the theme strip, and what you saw in it
- what was rejected and why
- the attempt count
- the two suggested human acts (below)

## What this skill deliberately does not do

Three things, because each is a decision and none is undone by re-running a
script.

- **It never writes to `assets/badges/`.** That is source art. Promotion of a
  candidate is a human act; suggest it and stop:

      cp assets/badges/_candidates/<key>.aNN.png assets/badges/<key>.png
      cp assets/badges/_candidates/<key>.aNN.txt assets/badges/<key>.txt

  **Both files, always.** `make_badge_assets.py` reads the style version out of
  the sidecar, and it reads it from there rather than from `style.md` on purpose:
  taking the current version would stamp every badge "the version now" and make a
  mixed deck undetectable, which is the one thing the version stamp exists to
  catch. A master with no sidecar is recorded `"unknown"` and warned about.

  `_candidates/` is gitignored and is where every attempt lives, with its exact
  prompt beside it.

- **It never sets the anchor.** Approving one badge as the reference for the
  other twelve is the highest-leverage decision in the whole feature and it is
  made once. Suggest it and stop, after the promotion above:

      cp assets/badges/first_card.png assets/badges/_anchor.png

- **It never runs `tools/make_badge_assets.py`.** That regenerates
  `public/badges/**` and `src/lib/gamification/badge-art.ts` — it changes what
  ships. Because filenames are content-hashed the change is *safe*, but it is
  still a change to the shipped app made from inside an art-generation loop, and
  it belongs in its own commit alongside a `npm run badges:check` run. Flag it
  and let the operator sequence it.

## The one thing that must never happen

`OPENAI_API_KEY` is read by `tools/gen_badge_art.py` and by nothing else. **No
application code may read it** — it is not `LLM_API_KEY`, `src/lib/env.ts` has no
entry for it, and `grep OPENAI_API_KEY src/` must stay empty. Never print the
value, never echo it into a report, never paste it into a file. The tool prints
*which source* it came from and not what it is.
