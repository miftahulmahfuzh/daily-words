---
name: generate-new-badge
description: Add one new badge to Daily Words end to end — key, title, the evaluateBadges rule, the modal prose, the scene line — then hand off to /generate-badge-art. Use when asked to create, add or invent a badge from a name and a description, e.g. "/generate-new-badge 'three times the charm' 'awarded when the user makes 3 daily cards in a week'", "add a badge for six words before noon", "we should have a badge for coming back after a long gap". Not for regenerating art on a badge that already exists — that is /generate-badge-art.
---

# Add a new badge

One badge per invocation. The arguments are

```
/generate-new-badge "<name>" "<description>"
```

and **both are intent, not text.** The name is a hint at the title; the
description is a hint at the rule. Neither is copied into the codebase verbatim.
If either is missing, ask for it — a badge with no rule is a shelf row nothing
can ever award, and a badge with no name gets one invented for it, which is
worse than asking.

## The order is forced, not preferred

`tools/gen_badge_art.py` refuses to start unless the set of keys inside
`<!-- SCENES -->` in `style.md` is **exactly** the set of keys in
`BADGE_CATALOG`. So the catalog entry and the scene line both have to exist
before art is reachable at all. Code first, art second, and there is no version
of this that runs the other way round.

Say this out loud in your first message, because it looks like breakage and is
not: **between adding the key and promoting the art, `npm run typecheck` is red
on `badge-art.ts` and `badge-meta.ts`.** `BADGE_ART` and `BADGE_META` are total
`Record<BadgeKey, …>`s, never `Partial<>`, so a new key with no art and no
metadata is a type error in the same session. That is both parity guards firing
correctly. It clears when `make_badge_assets.py` runs, which is the operator's
act and not this skill's.

---

## 1. Derive the key, and the title

Two different jobs with two different rules. Do not let one decide the other.

**The key names the trigger. Never the joke.** It is the value in
`badges_awarded.badge_key`, the value in `style.md`'s scene list, and the value
carried in the content-hashed art filename under `public/badges/`, which
`next.config.ts` serves `immutable` for a year. Renaming it later is a
regeneration and an orphaned award row, not a refactor — `badgeTitle` returns
`null` for an unknown key, the shelf silently drops it, and `--prune` deletes
it. Badge #14 is the worked example and it is in the file: drafted `sauron`,
adopted `tolkien`, because a recompute diff reading `sauron` is unreadable. See
`style.md` § "The fourteenth" and the comment on `ibu` in `badges.ts`.

- `snake_case`, semantic, no numbers-as-position.
- Reads correctly in a database row seen out of context, six months from now.
- `three_in_a_week`, not `charm`; `six_before_noon`, not `early_bird`.

**The title is display and costs nothing to change.** Match the deck's voice,
which is dry, period, and slightly sidelong — "The Uncle's Trick", "Burning the
Midnight Oil", "No Weekend Without Ration Card", "Ghost of Christmas Vocab". Not
a congratulation, not an exclamation, and typographic apostrophes only (`’`).
The user's `<name>` is the strongest input here; keep it if it already fits the
voice, and say so if you are changing it.

Check both against the whole catalog: `stats:check` asserts keys are unique and
**titles are unique**.

## 2. Classify the rule — Tier 1 or Tier 2

State the tier in your first line of output. Tier 1 is three files; Tier 2 is
five and touches the replay path. The operator should know which one they
authorised before you start.

`evaluateBadges` is **pure** — no database, no `new Date()`, no ambient clock —
and this is the most important property in the feature: the live award path and
`npm run stats:recompute` call the same function, so a replay that disagreed
with what was awarded on the day would be unfixable. Every input arrives in
`BadgeContext`. That is what decides the tier.

**Tier 1 — expressible in today's `BadgeContext`:**

| Shape | Field | Example in the file |
|---|---|---|
| Fixed calendar date | `cardDate` | `month === 12 && day === 25` |
| Day of week | `cardDate` via `localDayOfWeek` | `dow === 0` |
| Nth weekday of a month | `cardDate` | `fathers_day`, computed not looked up |
| Hour window | `localHour` | `midnight_oil`, `< 4` |
| Streak multiple | `runLength` | `full_week`, `% 7 === 0` |
| First ever | `isFirstCardEver` | `first_card` |

One line in `evaluateBadges`, one comment above it, appended at the end of the
function in catalog order.

**Tier 2 — needs a new `BadgeContext` field.** Rolling-window counts, "N cards
in the last M days", "returned after a gap", "cards on both a Saturday and a
Sunday". Anything that is a fact about *history* rather than about the card's
own date or hour. Follow §3b.

## 3a. Tier 1: write the rule

1. **Append** the `{ key, title }` to `BADGE_CATALOG` in
   `src/lib/gamification/badges.ts`. Appending is not stylistic: catalog order
   is shelf order, toast order and evaluator return order, and
   `check-gamification.ts` asserts a specific index tuple (`[0, 1, 3, 10]`).
   Inserting in the middle moves it. The comment above `tolkien` says this
   already; do not restate it, extend it if you must.
2. Add the condition to `evaluateBadges`, last, with a comment saying **why the
   day is the day** or why the boundary is where it is — the file's existing
   comments are the standard (`midnight_oil` records that 04:00:00 exactly does
   not qualify; `tolkien` records that `(9, 2)` transposed passes a single-date
   test).

## 3b. Tier 2: the five-step checklist

This is the part a hand-written badge most reliably gets wrong. Do all five.

1. **`BadgeContext` in `badges.ts`** — add the field with a doc comment saying
   what it counts, over what window, and in whose timezone.
2. **A helper in `src/lib/gamification/streaks.ts`**, beside
   `runLengthEndingAt`, not inlined at the two call sites. It takes day numbers
   through `toDayNumber` and stays in integers: this module does **no date
   arithmetic of its own**, because `lib/time/local-date.ts` is the only place
   allowed to, and two implementations of "what day is it" is the one bug this
   feature cannot survive.
3. **`on-card-created.ts`** — compute it from `dates`, which is read
   post-commit and so already includes the card that just landed.
4. **`recompute.ts`** — compute it from `seen`, **never from `history`**.
   `seen` holds the dates up to and including the card being judged. Reading
   `history` lets the replay see the future, and a backfilled award would then
   disagree with the one the live hook made on the day. There is no test that
   catches this for you; `full_week` carries the same comment for the same
   reason.
5. **`check-gamification.ts`** — add the field to the `ordinary` fixture
   (line ~257) so `on({})` still typechecks, then add the assertions in §4.

## 4. The prose, and the assertions

**`src/lib/gamification/badge-meta.ts`** — `condition` and `gloss`. This file is
a peer of `badges.ts`, not a wrapper, and the split is measured: `reveal.ts`
imports `badges.ts` and ships it to every `/today` visit, so explanation prose
belongs here and nothing here may be imported by `reveal.ts`,
`on-card-created.ts` or `recompute.ts`.

The register is enforced by `stats:check` rather than remembered:

- **No second person.** State the rule as a fact about cards. This is also what
  lets one string serve both the earned and the unearned state.
- No exclamation, no flattery, no loss aversion, no deadline.
- Typographic apostrophes.
- `condition` ≤ 140 characters, `gloss` ≤ 320. Past these the dialog reaches for
  its scrolling escape hatch on a 375×667 screen.

The `gloss` says what the title refers to and why the occasion is the occasion.
Read three existing ones before writing; `world_book_day` and `leap_day` are the
range.

**`scripts/check-gamification.ts`** needs real edits, not only a count bump:

- Three literal `14`s → `15` (`'fourteen badges, no more'` and the two
  uniqueness checks). Rename the first check's label to match the number.
- `check('tolkien is last in the catalog', …)` → the new key. That assertion
  exists to protect the index tuple; keep it pointed at whatever is last.
- One positive and one negative assertion for the new rule, in §8.3, in the
  style of the block already there. **Both boundaries** if it has any —
  `full_week` asserts 7, 14, 21 *and* 8 and 13.
- If the new badge can co-occur with an existing one, add the combination to
  §8.3's second block. Several badges firing at once is normal and all are
  awarded.

`npm run badges:check` needs **no** edit: it derives its counts from the key
set. If you find yourself editing it, you have found a real bug — say so.

## 5. The scene line

One line inside `<!-- SCENES -->` in `.claude/skills/generate-badge-art/style.md`,
in catalog order, in the established format:

```
- <key>: <the subject, drawn>. VERMILION: <one small mark>.
```

Read the whole scenes block first and read the **collision audit** below it. The
ring and the paper are shared by design; the interior is not. Keep a tally: how
many badges already contain a book, a quill, a hand, a stack of paper, a flame?
Two badges centred on an open book means one of them is wrong, and the wrong one
is the one whose title did not demand it.

Three things the format is doing, all load-bearing:

- **A physical object, described positively.** Name what the picture *is*. Every
  negative is a noun the model has now been told to think about.
- **No text, and no object whose defining feature is text.** The style block
  already forbids lettering; the scene line must not fight it. `tolkien`'s
  `the ring's band entirely smooth and unmarked` is in the file because the One
  Ring's defining feature in every reference image is an inscription.
- **VERMILION is one small mark**, slightly off register — a signature, not an
  outline, not a fill, not a second subject.

**Do not contradict the style block.** A scene line hanging keys on "a ring"
while the style block three paragraphs above says *no ring anywhere in this
image* is a real thing that happened, and the model resolves it arbitrarily.
§6's dry run is what catches it.

## 6. Verify, before the gate

```bash
npm run typecheck                                  # red on badge-art.ts only — expected
npm run stats:check
python3 tools/gen_badge_art.py <key> --dry-run     # no key, no network, no file, no money
```

Read the assembled prompt. This is the last free moment.

## 7. THE GATE — stop here

Present, and wait. Do not generate art before the operator answers.

1. **The key and the title**, with one sentence on why the key names the trigger.
2. **The tier**, and the list of files touched.
3. **The rule as written**, quoted from the diff.
4. **The interpretation chosen, and the one rejected.** Every English
   description of a badge is ambiguous somewhere — rolling window or calendar
   week, awarded once or every time the window holds, the card's own date or
   today's. Pick, then name the alternative and why it lost.
5. **One mandatory line, as a number: "on a 100-day streak this fires N times."**
   This is [R12]'s trap in the one form that makes it visible. Read literally,
   "7 cards in 7 consecutive days" is satisfied by every day past the seventh —
   94 awards on a 100-day run — which is why `full_week` awards once per
   completed week instead. If N is not the number the operator expects, the rule
   is wrong and no picture will fix it. For a badge that cannot repeat, say
   "once, ever" and say why.
6. **The condition and the gloss**, with their character counts.
7. **The scene line**, and which existing badges it was checked against.
8. **The assembled prompt** from the dry run.

## 8. Hand off

On approval:

```
/generate-badge-art <key>
```

Invoke it as a skill and let it run its own loop. It owns the anchor, the
three-attempt cap, the nine measurements, the theme strip and the look-at-it
step. **Do not re-implement, wrap, summarise or shortcut any of that**, and in
particular do not call `gen_badge_art.py` for real from here — the judgement
step is the whole value of that skill and a wrapper is how it becomes
ceremonial.

## 9. Report

- The tier, and every file changed.
- The key, the title, and the rule.
- The interpretation chosen and the one rejected, and the N.
- Everything `/generate-badge-art` reported, unedited.
- **The operator's remaining acts, in order**, because this skill performs none
  of them:

```bash
cp assets/badges/_candidates/<key>.aNN.png assets/badges/<key>.png
cp assets/badges/_candidates/<key>.aNN.txt assets/badges/<key>.txt   # BOTH, always
python3 tools/make_badge_assets.py
npm run typecheck && npm run badges:check && npm run stats:check
npm run stats:recompute -- --all --dry-run
```

The sidecar is not optional: `make_badge_assets.py` reads the style version out
of it rather than out of `style.md`, precisely so that a mixed deck is
detectable. A master with no sidecar is recorded `"unknown"`.

The recompute dry run is last and is not decoration — CLAUDE.md requires it
after any change to `badges.ts`, and it is how the new rule's history replay is
seen before it is applied.

## What this skill never does

Four refusals, three of them inherited from `/generate-badge-art` for the same
reasons, and each one a decision that re-running a script does not undo.

- **Never promotes a candidate** into `assets/badges/`. That is source art.
- **Never sets `_anchor.png`.**
- **Never runs `tools/make_badge_assets.py`.** It changes what ships, and that
  belongs in its own commit beside a `badges:check` run.
- **Never edits `src/lib/gamification/badge-art.ts` by hand.** It is generated.
  A hand-written path drifts from the files on disk the first time a badge is
  regenerated, and the filenames are content-hashed for exactly that reason.

And one that is this skill's own: **it does not add levels.** A level tier is a
different deck, a different contract (`levels.md`), a different `--kind`, and it
carries a step badges do not have — inserting a tier in the middle shifts every
`LevelProgress.index` above it and moves the `levelUp` comparison in
`on-card-created.ts`. If the request is really a level, say so and stop.

## The one thing that must never happen

`OPENAI_API_KEY` is read by `tools/gen_badge_art.py` and by nothing else. It is
not `LLM_API_KEY` and not `EMBEDDING_API_KEY`. `src/lib/env.ts` has no entry for
it and `grep OPENAI_API_KEY src/` must stay empty — `badges:check` and
`journal:check` both assert that emptiness over the whole tree, **including
comments and prose**. Never print the value, never echo it into a report, never
write it into a file, and never mention the literal string in anything you add
under `src/`.
