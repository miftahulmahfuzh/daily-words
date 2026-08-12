# F23 — Friday Blessing: badge #21

**Goal.** Add one badge to the deck, `friday_blessing`, awarded on any card made
on a Friday in the user's own timezone. Title "Friday Blessing"; the gloss names
Al-Ahzab 33:56 and the Friday practice of sending the greeting on the Prophet.
Art is one new seal in the existing badge deck.

**The user's words, in full** (issue
[miftahulmahfuzh/daily-words#1](https://github.com/miftahulmahfuzh/daily-words/issues/1)):

> use /generate-new-badge
> create badges for these new ideas that popped up:
> - badge "Friday Blessing" with description "God and His Angels bless the
>   Prophet, so you who believe bless Him too and give him greetings of peace" .
>   we give this badge if user generate a card on a friday

**Architecture, for an engineer with zero context.** A badge is a key and a title
in `BADGE_CATALOG` (`src/lib/gamification/badges.ts`), a rule inside the pure
function `evaluateBadges` in that same file, a `condition`/`gloss` pair in
`src/lib/gamification/badge-meta.ts`, a scene line in
`.claude/skills/generate-badge-art/style.md`, and a generated image promoted into
`public/badges/` by `tools/make_badge_assets.py`, which rewrites
`src/lib/gamification/badge-art.ts` as a **total** `Record<BadgeKey, BadgeArt>`.
That totality is the parity guard: a key with no art is a `tsc` error, not a
runtime surprise. `evaluateBadges` is called by both the live award path
(`on-card-created.ts`) and the replay (`recompute.ts`), which is why it holds no
clock and no database handle — every input arrives in `BadgeContext`.

**Supersedes:** nothing. This is `plans/F12-badge-art-skill.md` §10 ("adding
badge #14") followed rather than amended; CLAUDE.md § "Badge and level art" is
the authority and this plan is one application of it.

---

## 1. What this badge costs, and what it does not

**It adds no `BadgeContext` field.** `evaluateBadges` already computes

```ts
const dow = localDayOfWeek(ctx.cardDate); // 0 = Sunday
```

for `sunday` (`dow === 0`) and `fathers_day` (third Sunday of June). Friday is
`dow === 5` against the same value. So:

| Touched | Not touched |
|---|---|
| `badges.ts` — catalog entry + one rule line | `BadgeContext` — no new field |
| `badge-meta.ts` — condition + gloss | `on-card-created.ts` — nothing to thread |
| `check-gamification.ts` — count, last-key, rule cases | `recompute.ts` — nothing to thread |
| `style.md` — one scene line | any migration — a badge is a row in `badges_awarded` under an existing schema |
| `assets/badges/` + `public/badges/` + `badge-art.ts` (generated) | `levels.ts`, `level-art.ts`, `level-meta.ts` |

This is the cheapest shape a badge can have — the same shape `sunday`, `new_year`
and `leap_day` have. `five_shares` and `birthday` are the expensive shape, each
having added a context field threaded through two call sites.

**The timezone is already correct and needs no thought.** `ctx.cardDate` is a
`LocalDate` computed in the user's zone by `lib/time/local-date.ts`; a card made
at 23:30 on Friday in Jakarta is dated Friday regardless of where the server is.
`localDayOfWeek` does the arithmetic in that module, the only file allowed to.

## 2. `src/lib/gamification/badges.ts`

**Appended to `BADGE_CATALOG`, never inserted.** Catalog order is shelf order,
toast order and evaluator return order, and `check-gamification.ts` pins a
positional index tuple. Appending preserves every existing index; inserting in
the middle is the edit that shifted `year_end` and `tolkien` when `christmas` was
removed, and it is not needed here.

```ts
// #22, and the second badge in the deck keyed on a plain day of the week —
// `sunday` is the first, and the two are `dow === 0` and `dow === 5` against
// the same value. Written with the wrong constant either one still passes a
// single-date test, which is why §5 pins the pair.
{ key: "friday_blessing", title: "Friday Blessing" },
```

The key names the trigger *and* what the day is for, which is a shade more than
`sunday` spends; it is kept because the title is literal and the key should not
be the more evocative of the two. Frozen once art exists — it is the value in
`badges_awarded.badge_key`, in the art filename and in `style.md`'s scene list.

And in `evaluateBadges`, **after** the `birthday` block and before `return
earned`:

```ts
// A card made on a Friday, in the zone the card was made in. `dow === 5`
// against the same value `sunday` reads as 0 — see the catalog comment.
if (dow === 5) earned.push("friday_blessing");
```

Placement is not cosmetic: the function's contract is "Order follows
`BADGE_CATALOG`", the new key is last in the catalog, so its push goes last in
the function. Putting it beside `sunday`'s line — which is where it reads most
naturally — silently breaks that contract for every multi-badge card.

## 3. `src/lib/gamification/badge-meta.ts`

```ts
friday_blessing: {
  condition: "A card made on a Friday.",
  gloss:
    "Al-Ahzab 33:56 — God and His angels bless the Prophet, and those who " +
    "believe are asked to do the same. The greeting is given most on Fridays, " +
    "a day that arrives once a week without being sent for.",
},
```

197 characters against the 320 cap; `condition` is 24 against 140.

**The verse is rendered in the third person, and that is a constraint rather
than a preference.** `check-gamification.ts` runs
`/\byou\b|\byour\b|\byours\b|\byou['’]re\b/i` over every string of copy in the
feature, so the verse's own "O you who believe" cannot appear verbatim. "those
who believe are asked to do the same" is the same sentence with the address
removed — which is also the register the rest of the deck keeps: a condition is
a fact about cards, never a thing the reader did, and that is what lets one
string serve both the earned and the unearned state (F13 D2).

The em dash is fine; there are no apostrophes at all, straight or typographic, so
the straight-apostrophe check cannot fire.

## 4. `.claude/skills/generate-badge-art/style.md`

One line inside `<!-- SCENES -->`, last, so the key set still matches
`BADGE_CATALOG` exactly — `gen_badge_art.py` refuses to start otherwise, and that
refusal is the guard working.

```
- friday_blessing: A short flight of wooden pulpit steps standing alone on a bare rule, seen from the side, four treads rising from left to right to a small empty platform at the top, a low turned handrail running up beside them, the timber drawn in firm engraved contour with cross-hatch in the shadow under each tread, and the treads worn hollow at their centres. VERMILION: a small mark on the lowest tread.
```

**This is the fallback, adopted on 2026-08-12 after the first subject was
generated and rejected. §6.1 is the record of what it cost and why.**

Three things about this line are deliberate:

**No Arabic calligraphy, and none was considered.** The style block's NO TEXT
rule covers "no glyph or mark that could be read as writing in any alphabet" and
calls any text an automatic rejection. A calligraphic salawat is the obvious
subject for this badge and it is unavailable — the same way the One Ring's
inscription was unavailable to `tolkien`, whose scene line spends
`the ring's band entirely smooth and unmarked` on exactly that risk.

**The subject is an object, not a figure.** No depiction of the Prophet and none
of the angels. The deck's own register wants this anyway — "a clerk's object and
a working desk" — so the constraint costs nothing here.

**The stepped profile is the 40px mitigation, and it is why this subject won on
the second pass.** Nothing else in the deck is a staircase, so the silhouette is
unambiguous at shelf size; `four treads` and `a small empty platform` fix the
count and the emptiness rather than leaving either to the model; and
`from left to right` fixes the orientation, which is what makes two attempts
comparable instead of merely different.

Vermilion placement is new: no existing badge puts its mark on a stair tread.

### 6.1 The lattice, generated and rejected

The first scene line was a carved mashrabiya screen, chosen over these steps
after the 40px risk was raised and accepted. It was generated once
(`qwen/qwen-image-3-pro`, anchored, seed 11) and rejected. The record matters
more than the image, because it is the deck's worked example of READ AT FORTY
PIXELS costing a **subject** rather than a redraw.

The line asked for `a small number of large interlocking geometric openings with
broad heavy bars` — deliberately coarse, since fine lattice is exactly what the
style block forbids. The coarseness was not what failed. **`interlocking` was**:
the model read it as *nested*, and returned a labyrinth of rectangles inside
rectangles instead of a pierced flat screen. At 220px it reads as a maze; at 40px
it is a blob.

| check | lattice | plain-jug probe, same model + anchor |
|---|---|---|
| 7 legibility at 40px | **24.4** | 36.4 |
| 9b plate vs anchor | 0.4 pts | 1.1 pts |
| 8a seal centred | 0.47% | 0.35% |
| 3 bare-paper edge | **FAIL** (right sd 7.9) | FAIL (spread 4.8) |

Two things worth carrying forward. **Check 7's floor is 16.0 and the lattice
scored 24.4** — comfortably above it and still unreadable on a shelf, so a pass
on that check is not evidence a subject reads. And **everything that measures the
pipeline passed**: plate within half a point of the anchor, seal centred, palette
99.9%. The provider was never the problem, which is precisely why the repair was
a different subject and not a different model.

Do **not** bump the style block's `v1` — the style block is unchanged, and its
version exists so a mixed deck is detectable. Adding a scene is not a style
change.

## 5. `scripts/check-gamification.ts`

Four edits:

1. `check('twenty badges, no more', BADGE_CATALOG.length, 20)` → `21`, and
   retitle it.
2. `check('birthday is last in the catalog', BADGE_CATALOG.at(-1)?.key, 'birthday')`
   → `friday_blessing`. The comment at line ~611 ("#21 is last in the catalog, so
   it comes last however many fire with it") moves to the new key.
3. A rule case: a Friday card earns `friday_blessing`, and a Saturday one does
   not.
4. **The pair assertion**, which is the one that earns its keep. `sunday` is
   `dow === 0` and this is `dow === 5`; a rule written against the wrong
   constant passes any single-date test. Assert both on dates that separate
   them — a known Friday returns `friday_blessing` and not `sunday`, a known
   Sunday returns `sunday` and not `friday_blessing`. This is the same trap the
   file already pins for `dobby` (3, 30) against `dumbledore` (6, 30), and for
   `leap_day` (2, 29) against `tolkien` (9, 2).

Also check for a co-fire case worth having: a first card on a Friday is
`first_card` + `friday_blessing`, in that order, which exercises §2's placement
claim.

## 6. Art, in order

```bash
python3 tools/gen_badge_art.py --dry-run friday_blessing        # read the prompt; free
python3 tools/gen_badge_art.py friday_blessing --reference assets/badges/_anchor.png
python3 tools/check_badge_art.py <candidate.png>                # 9 measurements + 3 crops
```

Then judge it at 40px by eye — that is the whole risk on this badge — promote
**both** the `.png` and its `.txt` sidecar into `assets/badges/`, and

```bash
python3 tools/make_badge_assets.py
```

Never edit `src/lib/gamification/badge-art.ts` by hand.

**Between §2 and this step, `npm run typecheck` is red on `badge-art.ts` and
`badge-meta.ts`.** That is both parity guards firing, not a mistake. `--dry-run`
is the last free moment and it is not optional: it is what caught a scene line
contradicting the style block on the level deck.

## 7. Verification

```bash
npm run typecheck
npm run lint
npm run badges:check      # art/key parity, hashes, style version, the OPENAI_API_KEY scan
npm run stats:check       # the rules, the register, the caps, the reveal queue
```

`stats:check` is the one that reads the new copy; `badges:check` is the one that
reads the new file. Both must be green before the card moves.

## 8. The retroactive award, named rather than discovered

CLAUDE.md requires `npm run stats:recompute` after any change to
`lib/gamification/badges.ts`. The replay calls the *current* `evaluateBadges`
against every historical card, so **every past Friday card in every existing
user's history earns this badge on the day it was made**, and the shelf grows by
however many Fridays are behind them.

That is correct and is how every date badge in this deck behaves — `birthday`
did exactly this when it landed. It is written down here because it is a visible
change to shelves the user already looked at, and because the alternative
(awarding only from today forward) is not expressible: nothing in
`badges_awarded` records when a rule was introduced, and inventing a cutoff would
make the live path and the replay disagree, which is the one thing
`evaluateBadges`'s purity exists to prevent.

Run it deliberately, once, after §7 is green:

```bash
npm run stats:recompute -- --all --dry-run     # read the diff first
npm run stats:recompute -- --all
```

Never `--prune` here: this change only adds a key, and `--prune`'s job is
deleting awards under keys that no longer exist.

## 9. Out of scope

The issue says "badges" plural and "these new ideas that popped up" before
listing exactly one. If more arrive, each is its own round on the card and its
own `- <key>: <scene>` line; nothing in this plan is shaped around a batch.
