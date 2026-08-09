# F22 — Level art: an illustration for every streak and collector tier

**Goal.** Give every one of the nine streak tiers and eight collector tiers in
`src/lib/gamification/levels.ts` its own generated illustration, promoted into
`public/` by the same offline pipeline that made the fourteen badge medals, and
drawn on `/profile` beside the level the user actually holds.

**Architecture, for an engineer with zero context.** The badge deck already works
like this: a human-edited style contract (`.claude/skills/generate-badge-art/style.md`)
is *parsed* by `tools/gen_badge_art.py`, which sends one prompt per key to
OpenAI's image API; approved 1024² PNG masters live in `assets/badges/`;
`tools/make_badge_assets.py` resizes them into content-hashed WebPs under
`public/badges/` and regenerates `src/lib/gamification/badge-art.ts`, a **total**
`Record<BadgeKey, BadgeArt>` whose totality is what makes "a badge key with no
art" a `tsc` error. F22 builds a **second, sibling deck** with the same
machinery and the same guarantees: a second contract file (`levels.md`) parsed
by the same script under a new `--kind level` flag, masters in `assets/levels/`,
derivatives in `public/levels/`, and a generated `src/lib/gamification/level-art.ts`
holding a total `Record<LevelArtKey, LevelArt>`. Nothing about the database
changes: a level is *derived* from a number (`resolve(STREAK_LEVELS, longestStreak)`),
not awarded, so there is no migration, no new column and no new query.

**The user's words, in full:**

> "for every streak, every collection level, generate a badge illustration as
> well. i like the images. i dont mind the image generation cost"

**Supersedes:** nothing. `plans/F12-badge-art-skill.md` §10 ("Extensibility —
adding badge #14") is the template this plan follows rather than replaces, and
its D6, D7 and D9 are adopted verbatim for the second deck. `plans/F9-gamification.md`
§10.1's level block gains one element and loses nothing; [R18]'s "no progress
bar" and [R13]'s "no title at zero words" both survive unchanged.

**Depends on F21** (the badge dialog's full-bleed hero) for **one task out of
thirteen**. §7.3 states exactly what F22 does if F21 has not landed: it ships
the other twelve and the level rows are simply not tappable.

---

## 1. The count, read from the file rather than guessed

`src/lib/gamification/levels.ts`, as it stands today:

**`STREAK_LEVELS` — nine tiers.** Keyed on the *longest* streak ever achieved,
so a title is never taken away. Never null: the first band starts at 0.

| # | `min` | title |
|---|---|---|
| 1 | 0 | Blank Card |
| 2 | 3 | Pocket Fuzz |
| 3 | 7 | The Small Scribe |
| 4 | 14 | Margin Scribbler |
| 5 | 30 | Keeper of the Pocket |
| 6 | 60 | The Uncle’s Apprentice |
| 7 | 100 | Lexicon Smuggler |
| 8 | 200 | Walking Errata |
| 9 | 365 | Dickens Would Nod |

**`COLLECTOR_LEVELS` — eight tiers.** Keyed on the count of **manually added**
words (`source = 'manual'`, every status — and *not* `'shared'`, which is F17's
whole reason for existing). Starts at 1, not 0: [R13] says there is no title at
zero words, and `resolveCollectorLevel(0)` returns `null`.

| # | `min` | title |
|---|---|---|
| 1 | 1 | Word Picker |
| 2 | 10 | Jam Jar of Words |
| 3 | 25 | Shelf of Odds |
| 4 | 50 | Bag Man of Nouns |
| 5 | 100 | Private Collector |
| 6 | 250 | Hoarder of Rare Speech |
| 7 | 500 | Curator of Forgotten Tongues |
| 8 | 1000 | Barnaby’s Ghost |

**9 + 8 = 17 illustrations.** `LEVEL_TIER_COUNT` already exports `{ streak: 9,
collector: 8 }` and is what `LevelPill` puts in its `title` attribute, so the two
numbers are already load-bearing in the UI and this plan adds no third statement
of them.

For scale: the existing deck is fourteen. F22 more than doubles the raster art in
the app, from 14 masters to 31.

---

## 2. Decisions

### D1 — A parallel `LEVEL_ART` registry, **not** a widened `BADGE_ART`

This is the central decision and the rest of the plan falls out of it.

**Rejected: widen the badge pipeline so `BADGE_CATALOG` and the level tiers share
one art registry.** It is the smaller diff and it is wrong, for four reasons that
are each independently sufficient:

1. **`BadgeKey` is a database value.** `badges_awarded.badge_key` is typed
   `BadgeKey`; `badgeKeySchema` validates it; `evaluateBadges` returns
   `BadgeKey[]`; `stats:recompute --prune` **deletes award rows whose key is not
   in the catalog**. Adding `streak_lexicon_smuggler` to `BADGE_CATALOG` makes it
   an expressible value everywhere a real award is expressible — a row that must
   never exist becomes type-legal, and the type stops being the thing that says
   so. A level has no award row at all: it is recomputed from
   `longestStreak` on every read of `/profile`, exactly like everything else on
   that page ([R11]).
2. **`BADGE_CATALOG` is rendered as a list of badges.** `badge-shelf.tsx` does
   `BADGE_CATALOG.filter(b => !earnedByKey.has(b.key))` and draws every miss as
   an unearned row. Seventeen tiers in the catalog puts seventeen rows named
   "Blank Card", "Pocket Fuzz", "Word Picker" onto the badge shelf, permanently
   unearned, because nothing will ever write a `badges_awarded` row for them.
3. **Catalog order is asserted.** `scripts/check-gamification.ts` asserts a
   specific index tuple out of `evaluateBadges`, `reveal.ts` builds
   `CATALOG_ORDER` from it for toast ordering, and `badges.ts`'s own comment
   records that badge #14 was *appended* precisely to preserve every existing
   index. Seventeen insertions is a different kind of change from one append.
4. **`badges.ts` ships to `/today`.** `reveal.ts` imports it and
   `reward-toast.tsx` is mounted unconditionally on `/today` — this is exactly
   why F13 put the badge prose in a *separate* `badge-meta.ts` (D1 there).
   Seventeen more keys and titles would ride to every visit of a screen that
   never renders them.

**Chosen: a sibling registry with its own key space, its own contract file, its
own manifest and its own generator mode.** The machinery is shared (one Python
generator, one promotion tool, one check script, one style world); the
*identities* are not. This is the same shape F16→F18 arrived at for public
serialisers: one file that decides what a stranger sees, not two conventions.

**The structural guard is preserved exactly.** `level-art.ts` is emitted as

```ts
export const LEVEL_ART: Record<LevelArtKey, LevelArt> = { … };
```

a **total** `Record`, never `Partial<>`, where `LevelArtKey` is derived from the
two level tables themselves. Adding a tier to `STREAK_LEVELS` is therefore a
`npm run typecheck` error on `level-art.ts` (and on `level-meta.ts`) in the same
session, before anything ships — the identical guarantee F12 D9 bought for
badges, for the identical one keyword.

### D2 — The key lives on the band in `levels.ts`, is semantic, and is frozen

A badge key arrives ready-made: it is the value in `badges_awarded.badge_key`. A
level has no such row, so **a stable string key has to be invented for it**, and
the moment art filenames carry it (`public/levels/streak_pocket_fuzz.3f9a1c02.webp`)
renaming it orphans files: the old name is never requested again, the new one has
no file behind it, `badges:check` §8 fails on the missing file, and — because
`next.config.ts` serves that directory `immutable` for a year — any client that
already fetched the old URL keeps the old picture. Rename is not a refactor here;
it is a regeneration.

**Where it lives:** a third field on `LevelBand`, beside `min` and `title`, in
`src/lib/gamification/levels.ts`. One table, three columns, no second file to
keep in sync — the same argument `levels.ts` already makes for storing only `min`
rather than a duplicated upper bound.

**Rejected: positional keys (`streak_5`, `collector_3`).** They look stable and
are not. Insert one tier in the middle of `STREAK_LEVELS` — a plausible future
edit, since the bands are a tuning decision — and every key above it now names
the tier below the picture it points at. Nothing fails: the manifest is still
total, every hash still matches, every file still exists, and the app silently
draws the wrong illustration for seven tiers. A semantic key survives insertion,
deletion and reordering by construction.

**Rejected: deriving the key from the title at runtime.** Titles are display
strings and `levels.ts` already treats them that way. The `ibu` precedent in
`badges.ts` is the rule being followed: *"Title reads 'Mama', key stays `ibu`.
The key is identity … The title is display and costs nothing to change."*

**The form:** `<kind>_<snake_case of the title as first written>`. The kind
prefix is not decoration — it keeps the two tables' namespaces disjoint in one
flat `public/levels/` directory, makes `--kind`-filtered greps trivial, and means
a future collision between a streak title and a collector title costs nothing.
The seventeen keys are fixed by this plan (§3.2) and are never edited again.

### D3 — One visual world, two forms: the badge deck is a circular **seal**, the level deck is a rectangular **panel**

The brief's warning is right — "a streak tier sitting beside a medal on
`/profile` in a different style is a visible mistake" — and the answer is not
"identical". They share the world and differ in one structural element:

**Shared, byte-for-byte from `style.md`:** the full-bleed rule; NO TEXT ANYWHERE;
the paper (flat cream stock, ~92% luminance, no foxing, no sepia); the two inks
(pine green `#2F5D50` doing all the drawing, one dull brick vermilion `#8A3324`
mark slightly off register); line-engraving rendering; the dry, matter-of-fact
tone; the read-at-small-size rule; one-subject-per-picture.

**Different, deliberately:** the badge deck's `THE SEAL` paragraph — *one
circular impression … its edge a double rule … that band carries a repeating
engraved chain of small lozenges* — is replaced by `THE PANEL`: a plain
double-ruled **rectangle** inset ~12% from every edge, right-angled corners, no
ornamented band, the scene standing on a ground rule that runs the width of the
frame.

Three arguments for the split, in order of weight:

1. **The two things are different kinds of object and the user reads them
   differently.** A badge is an award stamped on a day that happened; a level is
   the grade printed on the card. A ration office stamps the one and prints the
   other. Making rank art indistinguishable from award art means the picture
   beside "Keeper of the Pocket" is read as a fifteenth badge, and no caption
   fixes a picture that says the wrong thing.
2. **Thirty-one distinct centred objects inside one circular band is a losing
   fight.** F12 §7's judgement checklist already asks "does it repeat another
   badge's subject?" and keeps a running tally of books, quills, flames, hands
   and paper stacks across *fourteen*. A rectangular frame with a ground rule
   admits a horizontal, staged composition — a shelf, a bank of drawers, a hall
   stand — that a 76%-width roundel cannot hold. The second form buys
   distinguishability rather than spending it.
3. **It costs nothing new.** No third ink, no new treatment, no second paper, no
   change to `check_badge_art.py`'s colour bands. A reader sees the same press,
   the same stock, the same green.

**The version marker is its own series.** `levels.md` opens with
`<!-- STYLE BLOCK v1 -->` and that `v1` is *the level deck's* v1; it has no
relationship to the badge deck's `v1` beyond having been derived from it. Each
manifest records the version its own sidecars carry, and `badges:check` asserts
one version **per deck**, not one across both.

### D4 — Contract file: a second file, the *same* marker vocabulary, and `--kind`

`tools/gen_badge_art.py` parses `style.md` with two anchored regexes and refuses
to start unless the key set inside `<!-- SCENES -->` is exactly the key set in
`BADGE_CATALOG`. F22 needs a second contract with a second key set and a second
parity source.

**Chosen:** a new file `.claude/skills/generate-badge-art/levels.md`, using the
**identical marker vocabulary** — `<!-- STYLE BLOCK vN -->` … `<!-- /STYLE BLOCK -->`
and `<!-- SCENES -->` … `<!-- /SCENES -->` — so `load_style()` is reused verbatim
against a different path, and a new `--kind badge|level` flag selects the whole
tuple (contract path, parity source, master directory, candidate directory).

**The marker contract is unchanged and is restated here because it is the one
thing that has already gone wrong once:** a marker only counts when it is
**alone on its own line**. `STYLE_RE` and `SCENES_RE` are anchored with `^…$`
under `re.M` for exactly this reason — `levels.md` quotes both markers inline in
its own interface table, and an unanchored non-greedy match would start at the
table and return zero scenes rather than an error. Do not reformat those tables
onto their own lines. Scene lines match `^- ([a-z0-9_]+): (.+)$`, which the
seventeen keys in §3.2 satisfy.

**Rejected: four marker regions in one `style.md`.** Two style blocks in one file
means `STYLE_RE.search()` silently returns the first one, and the version stamped
into every level sidecar would be the badge deck's. A `LEVEL STYLE BLOCK` marker
would avoid that but requires two more regexes, and then the file that a human
edits when adding a badge is the same file they must not disturb when adding a
level. Two contracts, two files, one parser.

**Rejected: a second skill directory and `tools/gen_level_art.py`.** That is a
16 kB copy of a tool whose hard-won parts — the `.env.local`-before-environment
key order and its printed source, the hand-built multipart body, the
`RES_OPTIONS=no-aaaa` line, the attempt-numbering, the sidecar — are exactly the
parts a copy diverges on first.

### D5 — Level art is drawn **only for the tier the user holds**, and there is no locked state

`badge-shelf.tsx` shows every unearned badge by name, deliberately: *"No padlock,
no `???`, no blur … They are empty places on a shelf, not locked content."*
`BadgeMedal` draws the unearned medal at `opacity-40`. So for badges there is
already no reveal to spoil, and F22 changes none of that.

Levels are different, and the difference is already in the shipped design:
**`/profile` has never listed the tiers.** `LevelBlock` renders the *held* title
in a `LevelPill` and one `Meta` line naming the next one (`levelCaption`), and
that is all — no ladder, no ramp, no progress bar ([R18] removed F2 §6.11's tier
ramp and F9 §10.2's 4px track for the same reason: the page is a record, not a
dashboard).

**The rule:** F22 draws exactly one illustration per level block — the art for
the tier `resolve()` returned — and nothing else. No row of seventeen thumbnails,
no dimmed next tier, no `opacity-40` variant. Consequences, each stated so that a
later reader does not "fix" one of them:

- **There is no unearned state on `LevelMark`, by construction.** The component
  takes a key that came out of `levelArtKey(kind, level.index)`, and a level the
  user does not hold has no index to produce one. This is why `LevelMark` has no
  `earned` prop while `BadgeMedal` does; the asymmetry is the design, not an
  oversight.
- **The next tier's *name* is already public** — `levelCaption` prints
  "35 more days → Keeper of the Pocket" — and its *picture* is not. That is the
  one thing withheld, it costs nothing, and it is what makes the illustration
  changing under the pill a small event rather than a checklist item ticking.
- **`reveal.ts` is not touched.** The level-up toast on `/today` stays one line
  of text (`{ label: "Level", text: rewards.levelUp.title }`). Putting art in the
  toast means a raster on `/today`, and F18 D3's measurement is the standing
  warning about adding anything to that screen on a calculation: a 32px pill
  estimated at ~33px of slack took the header from 70.4px to **117px** and all
  eighteen no-scroll assertions stayed green. `/today` gets nothing from F22.
- **The `[R13]` null case draws nothing.** At zero manual words
  `resolveCollectorLevel` returns `null`, `LevelBlock` renders "no words yet",
  and there is no tier, so there is no picture. Do not invent a "not started"
  illustration; [R13] is that there is no title at zero words.

### D6 — `public/levels/`, a second directory, content-hashed, with the header and the matcher both extended

Filenames are `<key>.<first 8 hex of the master's SHA-256>.webp` and
`<key>.<hash8>.sm.webp`, written by the same `make_badge_assets.py` code path.
**Yes, they are content-hashed**, and that is the *only* thing that licenses
`next.config.ts` to serve them `immutable` for a year: regenerating a tier
changes the master's bytes, the hash and the filename, so every cache misses
correctly. `next.config.ts` gains a second `source: "/levels/:path*"` entry
carrying the same header and the same paragraph of justification, and
`badges:check` §8 asserts the precondition (each filename's hash is still the
SHA-256 of `assets/levels/<key>.png`) exactly as §3 does for badges.

**Rejected: putting level art under `public/badges/`** to inherit both rules for
free. It inherits the orphan sweeps too: `make_badge_assets.py`'s stale-file
regex and `check-badge-art.ts` §5 both compute "expected filenames" from *one*
key set, and a shared directory makes both correct only against the union. That
is precisely the coupling that lets a stale file survive a regeneration and go
unnoticed — the drift the hash scheme exists to make impossible.

**`src/middleware.ts` must gain `levels` in its matcher exclusion**, beside
`badges`. Without it a request for a level illustration is a middleware
invocation that answers **307 to `/signin`** for anyone without a session
cookie — the exact thing that was *measured, not assumed* when `badges` was added
in F12. Two honest notes:

- **Today no signed-out page draws level art**, so this exclusion is not yet
  load-bearing. It is added now because the failure is invisible when it does
  become load-bearing: F18 found the identical class of bug in
  `isPublicSharePath`, where every row of a shared card bounced a stranger to
  `/signin` while rendering perfectly for the signed-in author.
- **The alternation is prefix-matched.** `(?!api|…|badges|levels|icons|…)` also
  exempts any future route whose path begins with `levels` — the same latent
  hazard `badges` and `icons` already carry, and the reason CLAUDE.md forbids
  moving the *share* exemption into this lookahead. Task 9 adds a cheap
  assertion to `badges:check` that no directory under `src/app` begins with
  `badges` or `levels`, so the constraint is checked rather than remembered.

### D7 — `OPENAI_API_KEY` stays out of `src/`, and F22 makes that easier rather than harder

The key is read by `tools/gen_badge_art.py` and by nothing else. F22 adds no
runtime model call, no environment variable, no `src/lib/env.ts` entry: the
seventeen images are generated offline on one machine and committed. Every file
this plan adds under `src/` (`level-art.ts`, `level-meta.ts`, `level-mark.tsx`)
is plain data or plain markup.

Two greps must stay empty and both are already automated over the whole of
`src/`, including comments and prose:

- `grep OPENAI_API_KEY src/` — asserted by `check-badge-art.ts` §6, which walks
  every `.ts/.tsx/.js/.mjs/.css` file under `src/`. **The new files are covered
  for free**, which is the point of having written it as a walk rather than a
  list.
- `grep EMBEDDING_API_KEY src/` — asserted by `journal:check` for the same
  reason. F22 touches nothing near it and must not explain the distinction in a
  comment under `src/`; `.env.example` is where that prose lives.

Concretely: **no file under `src/` created or edited by this plan may contain
either literal string, even inside a comment explaining that it must not.** Say
"the offline image key" and point at `CLAUDE.md`.

### D8 — The check scripts split along the line they already split on

`stats:check` (`scripts/check-gamification.ts`) owns `levels.ts` — the tables,
the resolver, the captions and the tone of every string in the feature. It gains
the **key** assertions: seventeen keys, unique across both tables, matching
`^(streak|collector)_[a-z0-9_]+$`, one per band, and `levelArtKey` round-tripping
every index. It never touches the disk.

`badges:check` (`scripts/check-badge-art.ts`) owns the disk — manifests, files,
sizes, hashes, style versions, orphans and the key scan. It gains §7–§11
mirroring §1–§5 for the level deck, and one new §12 for D6's route-prefix
hazard. It stays one command; a third `npm run` script for the second half of one
pipeline is how a check stops being run.

---

## 3. The art contract — complete, and a deliverable of this plan

### 3.1 `.claude/skills/generate-badge-art/levels.md` — the style block

Written **verbatim** into the new file between markers that are each alone on
their own line. Paragraphs marked *(verbatim)* are copied character-for-character
from `style.md` v1 and must stay that way: the two decks share a world, and a
drifted paragraph is how they stop.

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

### 3.2 The seventeen scene lines

One line per tier, appended to the style block as `SUBJECT FOR THIS LEVEL:`, in
the same voice and shape as the fourteen: **a distinct central object, a distinct
internal geometry, and an explicit placement for the single vermilion mark.**
F12 §5.2's three rules apply unchanged — say what the picture *is* (every
negative is a noun the model has now been told to think about); describe a pose
rather than counting body parts; keep dials and clock faces out, because a face
invites numerals and a numeral is text.

Written **verbatim** into `levels.md`, markers alone on their own lines:

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

### 3.3 The collision audit, done now rather than on tier eleven

The interior of every picture in **both** decks must stay distinct, because
`/profile` draws them on one screen. Running tally of the level deck:

empty type case / turned-out pocket / school desk / book-and-slips / waistcoat
and keys / counter and balance / case with a false bottom / composing stick /
hall stand // basket in a furrow / preserving jar / deal shelf / kit bag /
specimen drawer / bank of drawers / glazed cabinet / raven on a chair.

**Four adjacencies to watch, three of them across the two decks:**

| Pair | Why they are close | Change **this** one if they converge |
|---|---|---|
| `streak_blank_card` × badge `first_card` | both about a blank card | `streak_blank_card` → prepared alternative: *a pigeon-hole rack of empty slots seen square-on, one slot's divider missing* |
| `streak_pocket_fuzz` × `streak_keeper_of_the_pocket` × badge `first_card` | three pockets, one deck apart | `streak_pocket_fuzz` → prepared alternative: *a coat's turned-up cuff shaken out over a bare table, its debris fallen in a small drift* |
| `collector_private_collector` × `collector_hoarder_of_rare_speech` | both drawers | `collector_hoarder_of_rare_speech` → prepared alternative: *a lock-up store seen through its open door, crates stacked to the ceiling on both sides of a narrow aisle* |
| `collector_curator_of_forgotten_tongues` × badge `midnight_oil` | the first draft held a clay **oil lamp**; the badge deck already owns the only lamp | already changed above to a bone flute and a drinking cup — **do not put the lamp back** |

Two deliberate avoidances worth recording so a later session does not "improve"
them back in:

- **`streak_margin_scribbler` shows no writing in the margin.** The title
  demands marginalia and marginalia is lettering, which is an automatic
  rejection. Tipped-in slips at uneven depths say "somebody has been through this
  book" without a single glyph.
- **`streak_walking_errata` does not show a proof mark.** A caret, a delete-dele
  or a stet is a written symbol and the model will resolve it into letters. The
  vermilion is a plain struck mark on an edge.

### 3.4 The anchor

`assets/levels/_anchor.png`, and it is **`collector_jam_jar_of_words`** —
generated first, with no `--reference`, exactly as F12 D5 generated `first_card`
as the badge anchor.

Not the first tier in table order, and the reason is the same one F12 gives for
choosing carefully: every subsequent image is an `/v1/images/edits` call *against*
the anchor, so whatever the anchor gets wrong is baked into sixteen edits. The
jar is the simplest silhouette in the set — one object, one ground rule, one
knot for the vermilion — which makes its failures unambiguous. A complicated
anchor produces sixteen inheritances of a compromise nobody decided to make.

**The badge anchor must not be used.** `assets/badges/_anchor.png` is a circular
seal, and an edit call against it produces circular seals; that is the whole
point of D3.

---

## 4. Files

**New:**

| Path | What |
|---|---|
| `.claude/skills/generate-badge-art/levels.md` | The level deck's style contract and seventeen scene lines (§3). Parsed by `gen_badge_art.py --kind level`. |
| `assets/levels/_anchor.png` | The deck anchor (`collector_jam_jar_of_words`). |
| `assets/levels/<key>.png` + `<key>.txt` | Seventeen approved masters and their sidecars. **Both are committed**; the sidecar carries the style version. |
| `assets/levels/_candidates/` | Attempts and their crops. **Gitignored**, like `assets/badges/_candidates/`. |
| `public/levels/<key>.<hash8>.webp` + `.sm.webp` | 768² panel and 192² row derivatives. |
| `src/lib/gamification/level-art.ts` | **GENERATED.** `LEVEL_ART: Record<LevelArtKey, LevelArt>`, `LEVEL_ART_SIZE`, `LEVEL_ART_SMALL_SIZE`. Entries carry `src`, `small`, `sha256`, `styleVersion` and — once F21's `plate_hex()` exists — `plate`. Never edited by hand. |
| `src/lib/gamification/level-meta.ts` | Hand-written. `LEVEL_GLOSS: Record<LevelArtKey, string>` — one sentence per tier, the prose the dialog draws. |
| `src/components/gamification/level-mark.tsx` | `LevelMark`, the row illustration. Mirrors `BadgeMedal`. |

**Modified:**

| Path | Change |
|---|---|
| `src/lib/gamification/levels.ts` | `key` on every band; `as const satisfies`; `LevelArtKey`, `LEVEL_KEYS`, `levelArtKey()`, `levelCondition()`. |
| `tools/gen_badge_art.py` | `--kind badge\|level`; a level-key reader over `levels.ts`; per-kind paths. |
| `tools/make_badge_assets.py` | Promotes both decks; emits both manifests. |
| `tools/check_badge_art.py` | One new `--anchor` flag (default unchanged). |
| `scripts/check-gamification.ts` | The key assertions and the tone sweep over the new prose. |
| `scripts/check-badge-art.ts` | §7–§11 for the level deck; §12 for the route-prefix hazard. |
| `next.config.ts` | A second `immutable` header source for `/levels/:path*`. |
| `src/middleware.ts` | `levels` in the matcher exclusion. |
| `src/app/(app)/profile/level-block.tsx` | Draws `LevelMark`. |
| `src/app/globals.css` | `.dw-level-mark`. |
| `src/app/kitchen-sink/profile/page.tsx` | A `?level=` param (F21-gated task only). |
| `tests/e2e/no-scroll.spec.ts` | One new profile test. |
| `src/components/README.md` | The asset contract gains the level rows. |
| `CLAUDE.md` | The badge-art section and (F21-gated) the one-modal sentence. |
| `.gitignore` | `assets/levels/_candidates/` and the level control crops. |

**No schema change.** No migration, no `db:generate`, no new query, no new route
handler, no new environment variable.

---

## 5. Tasks

Ordered so that **every type-level guard and the free offline dry-run come before
any paid generation**. Each task ends with the repository building, except where
a red build is called out as a guard firing on purpose. One commit per task.

### Task 1 — Keys on the bands, and the type that makes them total

`src/lib/gamification/levels.ts`. Add `key` to `LevelBand`, and **drop the
widening annotation**: `export const STREAK_LEVELS: readonly LevelBand[] = […]`
erases the literal types and `LevelArtKey` would resolve to `string`, which
silently destroys the whole guard. `as const satisfies` keeps the literals *and*
still type-checks the shape.

```ts
export type LevelBand = {
  readonly min: number;
  readonly title: string;
  /**
   * This tier's stable identity, and the only thing about a level that must
   * never change.
   *
   * A badge key arrives ready-made — it is the value in
   * `badges_awarded.badge_key`. A level is derived from a number and has no row
   * anywhere, so this string was invented for it (F22 D2), and it is what the
   * art filename carries: `public/levels/<key>.<hash8>.webp`. Renaming it
   * orphans two files, fails `npm run badges:check`, and — because that
   * directory is served `immutable` for a year — leaves every client that
   * already fetched the old URL showing the old picture. Rename is a
   * regeneration, not a refactor.
   *
   * Semantic, never positional. `streak_5` looks stable and is not: insert one
   * band in the middle and every key above it names the tier below its own
   * picture, with the manifest still total, every hash still matching and
   * nothing failing anywhere.
   *
   * The title is display and costs nothing to change; this does not follow it.
   * Same rule as `ibu` in `badges.ts`.
   */
  readonly key: string;
};

export const STREAK_LEVELS = [
  { min: 0, title: "Blank Card", key: "streak_blank_card" },
  { min: 3, title: "Pocket Fuzz", key: "streak_pocket_fuzz" },
  { min: 7, title: "The Small Scribe", key: "streak_small_scribe" },
  { min: 14, title: "Margin Scribbler", key: "streak_margin_scribbler" },
  { min: 30, title: "Keeper of the Pocket", key: "streak_keeper_of_the_pocket" },
  { min: 60, title: "The Uncle’s Apprentice", key: "streak_uncles_apprentice" },
  { min: 100, title: "Lexicon Smuggler", key: "streak_lexicon_smuggler" },
  { min: 200, title: "Walking Errata", key: "streak_walking_errata" },
  { min: 365, title: "Dickens Would Nod", key: "streak_dickens_would_nod" },
] as const satisfies readonly LevelBand[];

export const COLLECTOR_LEVELS = [
  { min: 1, title: "Word Picker", key: "collector_word_picker" },
  { min: 10, title: "Jam Jar of Words", key: "collector_jam_jar_of_words" },
  { min: 25, title: "Shelf of Odds", key: "collector_shelf_of_odds" },
  { min: 50, title: "Bag Man of Nouns", key: "collector_bag_man_of_nouns" },
  { min: 100, title: "Private Collector", key: "collector_private_collector" },
  { min: 250, title: "Hoarder of Rare Speech", key: "collector_hoarder_of_rare_speech" },
  { min: 500, title: "Curator of Forgotten Tongues", key: "collector_curator_of_forgotten_tongues" },
  { min: 1000, title: "Barnaby’s Ghost", key: "collector_barnabys_ghost" },
] as const satisfies readonly LevelBand[];

/**
 * The union `LEVEL_ART` and `LEVEL_GLOSS` are keyed on. Derived from the tables
 * rather than restated, which is what makes adding a tier a `tsc` error on both
 * of those files in the same session — the same guarantee `BadgeKey` gives
 * `BADGE_ART` (F12 D9).
 */
export type LevelArtKey =
  | (typeof STREAK_LEVELS)[number]["key"]
  | (typeof COLLECTOR_LEVELS)[number]["key"];

export const LEVEL_KEYS: Record<LevelKind, readonly LevelArtKey[]> = {
  streak: STREAK_LEVELS.map((b) => b.key),
  collector: COLLECTOR_LEVELS.map((b) => b.key),
};

/**
 * Null rather than a throw, mirroring `badgeTitle` exactly.
 *
 * `index` reaches this having crossed `levelProgressSchema`, where it is a plain
 * non-negative integer — the schema cannot know how many bands there are, and
 * pinning it there would put a second copy of the table's length in a second
 * file. A missing illustration draws nothing; it does not 500 the profile page.
 */
export function levelArtKey(kind: LevelKind, index: number): LevelArtKey | null {
  return LEVEL_KEYS[kind][index] ?? null;
}

/**
 * The rule, in one sentence, derived from the table rather than written out
 * seventeen times. Seventeen hand-typed thresholds is seventeen chances for a
 * number to disagree with the band beside it.
 */
export function levelCondition(kind: LevelKind, index: number): string {
  const bands = kind === "streak" ? STREAK_LEVELS : COLLECTOR_LEVELS;
  const band = bands[index];
  if (!band) return "";
  if (kind === "collector") {
    return `${band.min} word${band.min === 1 ? "" : "s"} added by hand.`;
  }
  if (band.min === 0) return `Held until a streak reaches ${STREAK_LEVELS[1].min} days.`;
  return `A longest streak of ${band.min} days.`;
}
```

`resolve()` is unchanged: `readonly LevelBand[]` still accepts both tables, and
the extra property is not a fresh-object-literal excess-property position.

Then extend `scripts/check-gamification.ts` with a new section:

```ts
section('§N level tier keys — the identity F22 art filenames carry')

const allKeys = [...STREAK_LEVELS, ...COLLECTOR_LEVELS].map((b) => b.key)
check('seventeen tiers', allKeys.length, 17)
check('every key is unique', new Set(allKeys).size, allKeys.length)
check('every key is snake_case and names its kind', allKeys.filter((k) => !/^(streak|collector)_[a-z0-9_]+$/.test(k)), [])
check('streak keys all carry the streak prefix', STREAK_LEVELS.filter((b) => !b.key.startsWith('streak_')).length, 0)
check('collector keys all carry the collector prefix', COLLECTOR_LEVELS.filter((b) => !b.key.startsWith('collector_')).length, 0)

// The round trip the profile page depends on: the index `resolve()` returns
// selects the art for the band it resolved, and nothing else.
check('levelArtKey round-trips every streak band', STREAK_LEVELS.map((b) => levelArtKey('streak', resolveStreakLevel(b.min).index)), STREAK_LEVELS.map((b) => b.key))
check('levelArtKey round-trips every collector band', COLLECTOR_LEVELS.map((b) => levelArtKey('collector', resolveCollectorLevel(b.min)!.index)), COLLECTOR_LEVELS.map((b) => b.key))
check('an out-of-range index draws nothing rather than throwing', levelArtKey('streak', 99), null)

check('the condition names the band’s own threshold', [levelCondition('streak', 0), levelCondition('streak', 4), levelCondition('collector', 0), levelCondition('collector', 7)], ['Held until a streak reaches 3 days.', 'A longest streak of 30 days.', '1 word added by hand.', '1000 words added by hand.'])
```

**Commit:** `F22 task 1: a stable key on every level band, and the union derived from it`

**Verify:** `npm run typecheck` (silent), `npm run stats:check` (all pass).

### Task 2 — `level-meta.ts`, and the tone sweep that keeps it honest

`src/lib/gamification/level-meta.ts`. Only the gloss lives here — the
`condition` is computed from the band (task 1) so that no threshold is typed
twice. A **total** `Record`, for D1's reason.

```ts
import type { LevelArtKey } from "./levels";

/**
 * What each level title refers to. One sentence, the prose the level dialog
 * draws beneath the illustration.
 *
 * A peer of `levels.ts` and deliberately not part of it, for the reason F13 D1
 * gives about `badge-meta.ts`: `levels.ts` is imported by `on-card-created.ts`
 * on the write path and by `profile-stats.ts` on every profile read, and ~2 kB
 * of explanation that only one panel renders has no business travelling with
 * the resolver.
 *
 * Browser-safe by construction: no `import "server-only"`, no zod, no React, no
 * clock. The `LevelArtKey` import is **type-only** and adds no runtime edge.
 *
 * **No art path here.** `LEVEL_ART` in the generated `level-art.ts` owns that
 * and carries content-hashed filenames; a hand-written path would drift the
 * first time a tier was regenerated.
 *
 * Register, enforced by `npm run stats:check` rather than remembered: no second
 * person, no exclamation, no flattery, no loss aversion, no deadline,
 * typographic apostrophes only, ≤ 320 characters.
 */
export const LEVEL_GLOSS: Record<LevelArtKey, string> = {
  streak_blank_card:
    "Every card starts as this one. The title is the plain truth about a pocket with nothing in it yet, and it is not an insult.",
  streak_pocket_fuzz:
    "What is actually in a coat pocket after three days of carrying something: not much, and more than there was.",
  streak_small_scribe:
    "A week was the smallest unit a ration office recognised. A scribe is anybody who writes things down for other people to use later.",
  streak_margin_scribbler:
    "The margin is where a reader argues with a book. A fortnight is roughly how long it takes to stop being polite about it.",
  streak_keeper_of_the_pocket:
    "A month. The keys are the point — a keeper is somebody trusted with the small things that open other things.",
  streak_uncles_apprentice:
    "The uncle in question is the one with the trick: six words in a pocket at the moment somebody asked. Two months is about an apprenticeship in it.",
  streak_lexicon_smuggler:
    "A hundred days of moving words across a border nobody is watching. The false bottom is empty because the goods are already through.",
  streak_walking_errata:
    "An errata slip is the printer admitting the book went out wrong. Two hundred days of corrections is a person who has become one.",
  streak_dickens_would_nod:
    "A year. Dickens wrote to a deadline for most of his working life and would have recognised the arithmetic, whatever he made of the vocabulary.",
  collector_word_picker:
    "One word, picked up rather than looked up. That is the whole qualification.",
  collector_jam_jar_of_words:
    "Ten. A jam jar is what a collection lives in before anybody admits it is a collection.",
  collector_shelf_of_odds:
    "Twenty-five, and no two alike. A shelf of odds is what a drawer of odds becomes when it stops closing.",
  collector_bag_man_of_nouns:
    "Fifty. The bag man carried the samples; the bag was the job, and the job was knowing what was in it.",
  collector_private_collector:
    "A hundred, kept in compartments. Private means the collection is nobody’s business, not that it is worth money.",
  collector_hoarder_of_rare_speech:
    "Two hundred and fifty. A hoard is a collection whose owner has stopped explaining it.",
  collector_curator_of_forgotten_tongues:
    "Five hundred. A curator does not own the case. The job is keeping what is in it findable after the person who filled it has gone.",
  collector_barnabys_ghost:
    "A thousand. Barnaby Rudge kept a raven called Grip with a large vocabulary and no idea what any of it meant; Poe read the book and got a poem out of the bird.",
};
```

Then, in `scripts/check-gamification.ts` §14 (the tone check), fold the new
strings into the existing `copy` array so they ride the *same* banned-phrase,
exclamation, second-person, flattery and straight-apostrophe assertions:

```ts
    ...Object.values(LEVEL_GLOSS),
    ...STREAK_LEVELS.map((_, i) => levelCondition('streak', i)),
    ...COLLECTOR_LEVELS.map((_, i) => levelCondition('collector', i)),
```

and add one length assertion beside them:

```ts
check('every gloss is ≤ 320 characters', Object.values(LEVEL_GLOSS).filter((g) => g.length > 320), [])
```

**Commit:** `F22 task 2: one sentence per level tier, on the same tone rails as the badges`

**Verify:** `npm run typecheck`, `npm run stats:check`.

### Task 3 — `levels.md`, the contract

Create `.claude/skills/generate-badge-art/levels.md` with:

1. A short prose header explaining that this file is *parsed*, that markers count
   only when alone on their own line, and that everything outside the two regions
   is for humans. Mirror `style.md`'s "What the parser takes from this file"
   table — and keep the inline `<!-- SCENES -->` quotations **inside the table
   row**, which is exactly what proves the anchoring works.
2. The style block from §3.1, verbatim, between
   `<!-- STYLE BLOCK v1 -->` / `<!-- /STYLE BLOCK -->`.
3. The seventeen scene lines from §3.2, verbatim, between
   `<!-- SCENES -->` / `<!-- /SCENES -->`.
4. §3.3's collision audit and §3.4's anchor note as prose, outside both regions.
5. A closing note pointing at this plan and at `plans/F12-badge-art-skill.md`
   §1 D1–D3 for where the style came from.

**Commit:** `F22 task 3: the level deck's style contract and seventeen scenes`

**Verify:** nothing runs yet — task 4 is what proves the file parses.

### Task 4 — `gen_badge_art.py --kind level`, and the parity refusal

Two changes and no more.

**(a) A kind table.** Replace the three module constants with a per-kind tuple:

```python
KINDS = {
    "badge": {
        "contract": ROOT / ".claude" / "skills" / "generate-badge-art" / "style.md",
        "source":   ROOT / "src" / "lib" / "gamification" / "badges.ts",
        "masters":  ROOT / "assets" / "badges",
        "subject":  "SUBJECT FOR THIS BADGE",
        "noun":     "badge",
    },
    "level": {
        "contract": ROOT / ".claude" / "skills" / "generate-badge-art" / "levels.md",
        "source":   ROOT / "src" / "lib" / "gamification" / "levels.ts",
        "masters":  ROOT / "assets" / "levels",
        "subject":  "SUBJECT FOR THIS LEVEL",
        "noun":     "level",
    },
}
```

`load_style()` takes the contract path; `build_prompt()` takes the subject label;
`CANDIDATES` becomes `masters / "_candidates"`; the anchor warning points at
`masters / "_anchor.png"`.

**(b) A level-key reader, mirroring `load_catalog_keys()` exactly.** Read rather
than hardcode, for the reason that function already gives — the set is
explicitly not fixed:

```python
STREAK_RE = re.compile(r"STREAK_LEVELS\s*=\s*\[(.*?)\]\s*as const", re.S)
COLLECTOR_RE = re.compile(r"COLLECTOR_LEVELS\s*=\s*\[(.*?)\]\s*as const", re.S)

def load_level_keys():
    """Level tier keys in table order, read out of levels.ts.

    The parity guard this feeds is the only one of F22's three drift mechanisms
    that fires BEFORE money is spent. The other two are `npm run typecheck` (a
    tier with no art) and `npm run badges:check` (art with no tier).
    """
    text = LEVELS_TS.read_text(encoding="utf-8")
    keys = []
    for rx, name in ((STREAK_RE, "STREAK_LEVELS"), (COLLECTOR_RE, "COLLECTOR_LEVELS")):
        m = rx.search(text)
        if not m:
            die(f"could not find `{name} = [...] as const` in {rel(LEVELS_TS)}")
        found = KEY_RE.findall(m.group(1))
        if not found:
            die(f"{name} in {rel(LEVELS_TS)} parsed to zero keys")
        keys.extend(found)
    return keys
```

`KEY_RE` is already `key:\s*"([a-z0-9_]+)"` and matches unchanged.
`assert_parity()` is reused verbatim; only its two error strings need the noun
substituting so a level mismatch does not tell the user to edit `style.md`.

`--all` stays "only legal with `--dry-run`", for the reason already in the file:
the three-attempt cap and the look-at-it step are per image, and a loop makes
both ceremonial.

**Then run the dry run and READ IT. This spends nothing:**

```bash
python3 tools/gen_badge_art.py --dry-run --all --kind level
```

Expected: seventeen `====` banners, each `<key>  (style v1, model gpt-image-2, ~3400 chars)`,
followed by

```
dry run: 17 prompt(s) assembled. No key was read, nothing was sent, nothing was written.
```

Then read every one of the seventeen prompts against §3.1 and §3.2 — that the
style block arrived whole, that the scene line is the right scene for the right
key, that no scene smuggled in a word the style block forbids. This is the last
free moment.

Also confirm the guard bites, by temporarily renaming one key in `levels.ts` and
re-running: the script must **refuse to start** with
`levels.md and levels.ts disagree`. Put the key back.

And confirm the badge deck is untouched:

```bash
python3 tools/gen_badge_art.py --dry-run --all        # defaults to --kind badge
```

Expected: fourteen prompts, byte-identical to before this task.

**Commit:** `F22 task 4: gen_badge_art.py learns a second deck, and refuses to start on a mismatch`

### Task 5 — `make_badge_assets.py` promotes both decks

Generalise the module constants into the same per-kind shape: masters dir,
public dir, key source, manifest path, manifest type names (`BadgeArt` /
`LevelArt`, `BADGE_ART` / `LEVEL_ART`, `BadgeKey` / `LevelArtKey`), and the
import line. `emit_manifest()` takes those names as parameters; everything else —
the SHA-256, the `h8` filename, the 768/192 LANCZOS resizes, WebP `quality=90
method=6`, the orphan sweep, the mixed-version warning — is unchanged and shared.

`main()` runs both decks in one invocation and keeps its current refusal: if any
master is missing it writes **nothing for that deck** and exits non-zero, because
a partial total `Record` would not compile and refusing is what keeps the build
green while a deck is still being generated.

The level manifest's header comment must carry the same four paragraphs the badge
one does, with the level facts substituted: generated file, source art location,
why the `Record` is total, why the filename carries the hash, and that it holds
no secret and is imported by a client component.

**`plate`, and the ordering with F21.** F21 (task 2 there) grows a `plate_hex()`
in this same file — the outer-5%-frame modal sample — and emits
`plate: "#rrggbb"` per entry, because `ArtHero` paints the band in the art's own
paper and requires it. The two plans meet here, and the meeting is benign in
either order:

- **F21 first:** `plate_hex()` already exists, `emit_manifest` already takes
  `(key, sha, plate)` tuples, and F22's generalisation carries it to the second
  deck for free. `LevelArt` gains `plate: string` with no extra work.
- **F22 first:** `level-art.ts` ships without `plate`, and F21's task 2 adds it
  to **both** decks in one edit — because after this task there is one
  `emit_manifest` and one sampling call site, not two. That is the argument for
  generalising the tool rather than copying it, stated as a prediction so it can
  be checked.

Whichever order, `plate` is **generated, never hand-authored**: it is a property
of the master's bytes, and `badges:check` re-derives it from
`assets/levels/<key>.png` (task 8, §9) exactly as F21's task 3 does for badges.

**Verify, spending nothing:**

```bash
python3 tools/make_badge_assets.py --dry-run
```

Expected: the fourteen badge lines exactly as today, then

```
error: 17 of 17 masters are missing from assets/levels/:
  streak_blank_card.png
  …
```

and a non-zero exit. **That is the guard working**, and it is the state the
repository sits in until task 7 finishes.

Also add to `.gitignore`:

```
assets/levels/_candidates/
assets/levels/_controls/*.themes.png
assets/levels/_controls/*.ring.png
assets/levels/_controls/*.centre.png
```

**Commit:** `F22 task 5: make_badge_assets.py promotes both decks`

### Task 6 — `check_badge_art.py --anchor`, then the anchor image

**(a) One flag.** `ANCHOR` becomes a default rather than a constant:

```python
parser.add_argument("--anchor", type=Path, default=ANCHOR,
                    help="the deck anchor check 9 compares against "
                         "(assets/levels/_anchor.png for the level deck)")
```

Nothing else in that file changes. Its nine bands were derived from the badge
deck and **must not be re-derived, tightened or loosened here** — the file's own
standing instruction is to re-derive only from an observed distribution of at
least six approved images, and the deck this plan generates has zero. The ring
crop still frames the region where lettering hides (the frame's rules sit at the
same radius the seal's band did), so it keeps its job under a different name.

**(b) The anchor run.** Generate `collector_jam_jar_of_words` with **no**
`--reference`:

```bash
python3 tools/gen_badge_art.py collector_jam_jar_of_words --kind level
```

Expected: `no --reference and no anchor on disk: this is an ANCHOR RUN.`, then
`key source: .env.local`, then `wrote assets/levels/_candidates/collector_jam_jar_of_words.a01.png`.

Measure and look:

```bash
python3 tools/check_badge_art.py assets/levels/_candidates/collector_jam_jar_of_words.a01.png
```

**Record, in the commit message, which of the nine bands fire and by how much.**
Some may fire simply because the form changed — a rectangle distributes ink
differently from a roundel — and the correct response is to write the numbers
down, not to edit a band. The exit code is not the verdict.

Judge from the three crops against F12 §7's checklist, in its order, with two
additions for this deck:

- **Any lettering at all?** Instant reject, as ever. Read `.ring.png` all the way
  round the frame.
- **Is it a rectangle?** A circular seal here is an automatic reject — that is
  the one thing separating the two decks on screen.
- **Does it read at 56 px?** Look at the theme strip's small cell and nothing
  else for a moment.
- **Is the paper the app's paper?** F12's memory records that paper tone, not
  text, was the hard part of the badge deck. Expect to spend attempts here.
- Then the rest of §7 unchanged: two inks, vermilion as a second pass, no
  award vocabulary, is it actually good.

Iterate with `--note "…"` up to **three attempts**; if three fail, change the
scene line rather than the note. On approval:

```bash
cp assets/levels/_candidates/collector_jam_jar_of_words.a0N.png assets/levels/collector_jam_jar_of_words.png
cp assets/levels/_candidates/collector_jam_jar_of_words.a0N.txt assets/levels/collector_jam_jar_of_words.txt
cp assets/levels/collector_jam_jar_of_words.png assets/levels/_anchor.png
```

**Both files, always.** The `.txt` sidecar is what carries the style version into
the manifest; losing it records the tier as `"unknown"` and makes a mixed deck
undetectable — which is precisely what the version stamp exists to catch.

**Commit:** `F22 task 6: the level deck's anchor, and the bands it fires`

### Task 7 — The remaining sixteen, one at a time, against the anchor

For each remaining key, in table order:

```bash
python3 tools/gen_badge_art.py <key> --kind level --reference assets/levels/_anchor.png
python3 tools/check_badge_art.py assets/levels/_candidates/<key>.a01.png --anchor assets/levels/_anchor.png
```

then look at the three crops, judge against F12 §7 plus task 6's two additions,
and either approve (copy **both** files into `assets/levels/`) or retry with
`--note`, to a cap of three attempts per tier.

**Keep the running tally.** After every fourth approval, lay the approved level
masters beside the fourteen badge masters and re-read §3.3's four adjacencies.
If a pair has converged, change the level scene — never the badge — using the
prepared alternative already written down for it.

`--all` refuses without `--dry-run`, deliberately: the cap and the look-at-it
step are per tier.

**Commit:** one per four or five approvals, e.g.
`F22 task 7: the streak deck, tiers 1-5`.

### Task 8 — Promote, generate the manifest, extend `badges:check`

```bash
python3 tools/make_badge_assets.py
```

Expected: fourteen badge lines and thirty-four level lines
(`public/levels/<key>.<hash8>.webp  768²  ~120 kB` and `… .sm.webp  192²  ~8 kB`),
then `wrote src/lib/gamification/badge-art.ts  (14 entries)` and
`wrote src/lib/gamification/level-art.ts  (17 entries)`, then
`next: npm run badges:check && npm run typecheck`.

**Never edit `level-art.ts` by hand**, for the same reason as `badge-art.ts`: it
is regenerated wholesale and a hand edit is silently reverted by the next
promotion.

Then extend `scripts/check-badge-art.ts` with five sections mirroring §1–§5
against `LEVEL_ART`, `LEVEL_ART_SIZE`, `LEVEL_ART_SMALL_SIZE`, `assets/levels/`
and `public/levels/`:

- **§7** the manifest covers both tables, in table order (streak then collector)
- **§8** exactly one `styleVersion` across the level deck, and none `"unknown"`
- **§9** the shipped bytes are the approved master: recompute the SHA-256 of
  `assets/levels/<key>.png`, and assert `src`/`small` both carry its first 8 hex.
  **If F21 has landed**, this section also re-derives `plate` from the master with
  the same `plateHex()` helper F21's task 3 added, for the reason F21 gives: the
  plate is a property of the master's bytes, so a hand-edit to the generated file
  is a checkable lie rather than an unfalsifiable one
- **§10** both derivatives exist at exactly 768² and 192², read from the WebP
  header by the existing `webpSize()` — no decode
- **§11** no unreferenced `.webp` under `public/levels`

The key set comes from `[...STREAK_LEVELS, ...COLLECTOR_LEVELS].map(b => b.key)`,
imported from `levels.ts`, so the script cannot disagree with the tables.

Note that **§2's assertion stays per-deck**: badge style `v1` and level style
`v1` are independent series and asserting one version across the union would
couple them (D3).

Finally, the closing line becomes

```
All badge-art assertions passed (14 badges, style v1; 17 levels, style v1).
```

**Commit:** `F22 task 8: promote seventeen level masters, and assert them on disk`

**Verify:** `npm run badges:check`, `npm run typecheck` (both silent/green — the
red window that opened when `LevelArtKey` gained seventeen members and
`level-art.ts` did not exist closes here, exactly as it does for badge #15).

### Task 9 — The header, the matcher, and the prefix guard

`next.config.ts` — a second entry in the same `headers()` array:

```ts
{
  /**
   * Level art, cached for a year and never revalidated, and safe for exactly
   * the reason the block above gives: every file under /levels/ carries the
   * first 8 hex of its master's SHA-256, written by
   * `tools/make_badge_assets.py`. `npm run badges:check` §9 asserts that the
   * hash in each filename is still the SHA-256 of `assets/levels/<key>.png`,
   * which is what keeps the sentence true rather than merely intended.
   *
   * Do not extend this source to any path whose filenames are not
   * content-hashed.
   */
  source: "/levels/:path*",
  headers: [{ key: "cache-control", value: "public, max-age=31536000, immutable" }],
},
```

`src/middleware.ts` — `levels` joins the exclusion, with the honest note from D6
about it not being load-bearing yet and about the prefix match:

```
'/((?!api|_next/static|_next/image|favicon.ico|badges|levels|icons|manifest.webmanifest|apple-icon|icon).*)',
```

And `scripts/check-badge-art.ts` §12, which turns the prefix hazard into a
checked property:

```ts
section('§12 no route may begin with an excluded asset prefix')

// The matcher's negative lookahead is PREFIX-matched: `badges` and `levels`
// there also exempt any route whose path starts with those letters. The
// exemption is correct for two directories of committed art and wrong for a
// page. Cheap to check, so it is checked.
const appDirs = readdirSync(join(root, 'src', 'app'), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
check('no src/app route starts with an excluded prefix', appDirs.filter((d) => /^(badges|levels)/.test(d)), [])
```

**Commit:** `F22 task 9: /levels is immutable and is not a route`

**Verify** — and this is a `curl` with **no cookie jar**, on port 3200 and no
other port, because a signed-in browser renders a broken build perfectly:

```bash
npm run dev &                     # 3200; if it is busy, `ss -ltnp | grep 3200` and kill by pid
curl -sI http://localhost:3200/levels/collector_jam_jar_of_words.<hash8>.sm.webp
```

Expected: `HTTP/1.1 200 OK` and
`cache-control: public, max-age=31536000, immutable`. A **307** means the
matcher edit is wrong.

### Task 10 — `LevelMark`, and the level block that draws it

`src/components/gamification/level-mark.tsx` — mirrors `BadgeMedal`, minus the
one prop it must not have:

```tsx
import { LEVEL_ART, LEVEL_ART_SMALL_SIZE } from "@/lib/gamification/level-art";
import type { LevelArtKey } from "@/lib/gamification/levels";
import { cn } from "@/lib/ui/cn";

/**
 * The illustration for the level a user currently holds, drawn small beside the
 * pill on /profile.
 *
 * **There is no `earned` prop, and its absence is the design** (F22 D5). The key
 * this takes came out of `levelArtKey(kind, level.index)`, and a tier the user
 * does not hold has no index to produce one — so an unearned state is not
 * reachable here, unlike `BadgeMedal`, where the shelf deliberately draws every
 * unearned badge at `opacity-40`. /profile has never listed the tiers and this
 * does not start: the next tier's *name* is already in `levelCaption`, its
 * picture is not.
 *
 * **Not `next/image`**, for the reason `BadgeMedal` gives: a fixed-size,
 * content-hashed local asset already served `immutable` for a year has nothing
 * left for the optimiser, and `next/image` appears nowhere in `src`.
 *
 * `alt=""` and `aria-hidden`: the pill immediately beside it carries the title,
 * and the style contract forbids lettering inside the frame, which is exactly
 * why the title is drawn beside the picture rather than in it.
 */
export function LevelMark({
  artKey,
  className,
}: {
  artKey: LevelArtKey;
  className?: string;
}) {
  const art = LEVEL_ART[artKey];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={art.small}
      // The intrinsic size, not the drawn one — it is what stops the row
      // shifting while the image loads. The 192² asset covers a 56 css px draw
      // past 3×.
      width={LEVEL_ART_SMALL_SIZE}
      height={LEVEL_ART_SMALL_SIZE}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn("dw-level-mark block shrink-0 rounded-[var(--r-card)]", className)}
    />
  );
}
```

`src/app/globals.css`, beside the badge medal's rule:

```css
/* The level mark. A constant, not a `dvh` clamp like `.dw-badge-medal` — that
   one is clamped because it sits inside a dialog competing with a gloss for a
   fixed height budget. This sits in `/profile`'s ScreenBody, which scrolls, so
   56px is 56px on every viewport. It also clears LAYOUT.touchMin's 44 in both
   axes, which is what lets the block become a button in task 11 without
   growing. */
.dw-level-mark {
  width: 56px;
  height: 56px;
}
```

`src/app/(app)/profile/level-block.tsx` — the picture goes to the **left** of
the pill and caption, on one row:

```tsx
const artKey = level ? levelArtKey(kind, level.index) : null;
…
{level ? (
  <div className="flex items-center gap-3">
    {artKey && <LevelMark artKey={artKey} />}
    <div className="flex min-w-0 flex-col items-start gap-1.5">
      <LevelPill kind={kind} label={level.title} tier={level.index + 1} tierCount={LEVEL_TIER_COUNT[kind]} />
      <Meta>{levelCaption(level, kind)}</Meta>
    </div>
  </div>
) : (
  <Meta>no words yet</Meta>
)}
```

`min-w-0` on the text column is load-bearing: "Curator of Forgotten Tongues" is
the longest title in either table and a flex child will not shrink below its
content width without it, which is how a pill pushes a row off the right edge at
375px with nothing throwing.

Add one test to `tests/e2e/no-scroll.spec.ts`:

```ts
/**
 * F22's level illustrations. /profile scrolls vertically by design
 * (`ScreenBody scroll`), so the assertion is the other three: nothing scrolls
 * sideways, the tab bar is still on screen, and both marks drew at their
 * declared size. The sideways one is the real target — a 56px picture plus the
 * longest level title in either table is the widest thing on the page at 375px.
 */
test("the profile level marks do not push the page sideways", async ({ page }) => {
  await page.goto("/kitchen-sink/profile?state=full");
  await tabBarIsOnScreen(page);

  const overflows = await page.evaluate(() => {
    const el = document.scrollingElement!;
    return el.scrollWidth > el.clientWidth + 1;
  });
  expect(overflows, "the profile page scrolls horizontally").toBe(false);

  const marks = page.locator(".dw-level-mark");
  await expect(marks).toHaveCount(2);
  for (const box of await marks.all()) {
    const r = (await box.boundingBox())!;
    expect(r.width, "the level mark is not 56px").toBeCloseTo(56, 0);
  }
});
```

**Commit:** `F22 task 10: /profile draws the level a user holds`

**Verify:** `npm run typecheck`, `npm run lint`, `npm run test:layout`.

### Task 11 — *(gated on F21)* The level rows open the same dialog

**Do not start this task until F21 has landed.** §7.3 is what to do instead.

F21 turns the badge dialog's small square into a full-bleed hero band across the
top of the dialog and leaves a reusable component behind for exactly this — its
D5 says so in as many words, and it is **structurally incapable** of knowing
about badges. Its signature, read from `plans/F21-badge-dialog-hero.md` D5 rather
than assumed:

```ts
// src/components/gamification/art-hero.tsx
export function ArtHero(props: {
  src: string;
  intrinsic: number;   // the source's intrinsic square size
  plate: string;       // "#rrggbb" — the art's own paper, from the generated manifest
  dimmed?: boolean;
  className?: string;
}): React.JSX.Element
```

F22's caller is therefore

```tsx
<ArtHero src={LEVEL_ART[artKey].src} intrinsic={LEVEL_ART_SIZE} plate={LEVEL_ART[artKey].plate} />
```

with **no `dimmed`** — F21 anticipated that too ("F22's rows are not 'earned'"),
and D5 above is why: a tier the user does not hold has no index to produce a key.
The `plate` field is what task 5 reconciles; if `level-art.ts` shipped before F21
and has no `plate`, run `python3 tools/make_badge_assets.py` once after F21's
task 2 and both manifests gain it together.

If F21 named the component differently, or exported it from a different path,
**this is a find-and-replace in this task, not a redesign** — the same discipline
F18 §0 used for its F16 assumptions.

The work:

1. Widen `BadgeSelection` in `src/components/gamification/badge-dialog.tsx` into
   a discriminated union, **in the file that already exists**:

   ```ts
   export type DialogSelection =
     | { kind: "badge"; key: BadgeKey; title: string; earned: {…} | null }
     | { kind: "level"; artKey: LevelArtKey; title: string; tier: number;
         tierCount: number; condition: string; gloss: string };
   ```

   The badge arm renders exactly what it renders today. The level arm renders
   `ArtHero` with `LEVEL_ART[artKey].src`, an `Eyebrow` reading
   `Level ${tier} of ${tierCount}` (mono, the same information `LevelPill`
   already puts in its `title` attribute and nowhere else on screen), the title
   as the `<h2>`, `condition` as `Prose size="base"`, `gloss` as
   `Prose size="sm" tone="muted"`, and **no dates line** — a level has no award
   date, and inventing "held since" would need a query that does not exist.

   **Keep the file name.** Renaming `badge-dialog.tsx` while F21 is editing its
   internals is a merge conflict for no behaviour; the rename is a follow-up
   nicety, not a task.

   **No `autoFocus` anywhere inside the `<dialog>`**, and
   `.dw-badge-dialog[open]`, never bare — both traps are documented in
   `CLAUDE.md` and both are silent.

2. Make the two `LevelBlock`s tappable, exactly as `badge-shelf.tsx` makes its
   rows tappable: a `<button type="button" className="w-full text-left">`
   wrapping the existing markup, with
   `aria-label={`${level.title}, ${kind} level ${tier} of ${tierCount}`}`. The
   block is ≥56px tall, clearing `LAYOUT.touchMin`'s 44.

   `LevelBlock` is currently a server component. Wrapping it in a button with an
   `onClick` needs a client boundary; put it where `badge-shelf.tsx` puts its —
   one small `"use client"` component owning both blocks and the dialog, so the
   page stays a server component and the prose stays in one cacheable chunk.
   `LevelProgressPayload` must be imported as a **type**; a value import of
   `levelProgressSchema` here is the 73 kB zod mistake `CLAUDE.md` documents.

3. `src/app/kitchen-sink/profile/page.tsx` gains `?level=streak|collector`,
   opening the corresponding dialog on load — the same trick `?badge=` plays, and
   for the same reason: a dialog that only opens on a tap cannot be asserted on
   before the tap.

4. Extend the existing no-scroll dialog test to drive
   `/kitchen-sink/profile?level=collector` (which selects
   "Curator of Forgotten Tongues", the longest title in either table) through the
   same five assertions: the top layer costs the document nothing, the tab bar
   is still on screen, the panel is inside the viewport on all four edges, focus
   is trapped, and Escape closes it.

5. **`CLAUDE.md`'s "There is exactly one modal in the app" needs amending**, and
   only in its first sentence. It stays true — one `<dialog>` element, one
   component, one top-layer occupant — but it is no longer opened only by a badge
   row. Replace:

   > `src/components/gamification/badge-dialog.tsx`, on `/profile`, opened by
   > tapping a badge row.

   with:

   > `src/components/gamification/badge-dialog.tsx`, on `/profile`, opened by
   > tapping a badge row **or a level row**. F22 widened its selection into a
   > discriminated union rather than adding a second `<dialog>`: the focus trap,
   > Escape, the backdrop and focus restoration are the UA's, and there is
   > nothing to be gained from owning two of them. The file name still says
   > "badge"; the component is the app's one detail panel.

   Everything below that sentence — the top-layer exemption, the
   `[open]` trap, the `autoFocus` trap, the two-tap arm for destructive
   actions — is unchanged and still applies.

**Commit:** `F22 task 11: level rows open the one dialog`

### Task 12 — Documentation

`src/components/README.md` § "The badge asset contract (F12)" gains the level
rows in its size table and one paragraph naming the second directory, the second
generated manifest, and the fact that `LevelMark` has no unearned state by
construction. Retitle the section "The badge and level asset contract (F12, F22)".

`CLAUDE.md` § "Badge art and `OPENAI_API_KEY`":

- The opening paragraph gains a sentence: level illustrations are the second deck
  from the same pipeline, their contract is `levels.md` in the same skill
  directory, parsed the same way, and `--kind level` is what selects it.
- The command block gains
  `python3 tools/gen_badge_art.py --dry-run --all --kind level`.
- The three-row drift table's rows are reworded to read "a badge key **or a level
  tier** with no art", "art with no badge key **or no level tier**", and "a scene
  line with no key, or a key with no scene line — `gen_badge_art.py` refuses to
  start, **against `badges.ts` or `levels.ts` depending on `--kind`**".
- The `public/badges/*` paragraph gains `public/levels/*` and states that the
  matcher exclusion and the `immutable` header were extended together, and why
  `/levels` must never become a route.
- "Adding badge #15" gains a sibling: **"Adding a level tier"** — add the band
  *with its key* to `STREAK_LEVELS` or `COLLECTOR_LEVELS`, add one
  `- <key>: <scene>` line inside `<!-- SCENES -->` in `levels.md`, add its gloss
  to `level-meta.ts`, generate against `assets/levels/_anchor.png`, promote
  **both** the `.png` and its `.txt`, then `python3 tools/make_badge_assets.py`.
  Between adding the band and promoting the art, `npm run typecheck` is red on
  `level-art.ts` and `level-meta.ts` — that is both parity guards firing, not a
  mistake. **And note the extra step badges do not have:** inserting a tier in
  the middle shifts every `LevelProgress.index` above it, so
  `scripts/check-gamification.ts`'s band assertions move too, and
  `stats:recompute` should be re-read — a level is derived, so nothing needs
  replaying, but the `levelUp` comparison in `on-card-created.ts` is between two
  `resolveStreakLevel` results and a new band changes where it fires.
- The `npm run badges:check` line in § Commands becomes
  `# F12's badge-art and F22's level-art manifests, files, hashes and key scan, offline`.

**Commit:** `F22 task 12: document the second deck`

### Task 13 — The full verification pass

§8, run end to end, and the manual pass at 375px.

**Commit:** none — this task produces no diff. If it produces one, it belongs to
whichever task it fixes.

---

## 6. Cost and iteration

The user has said cost is not a concern, so the plan is for quality rather than
for the smallest number of calls.

**The loop, per tier**, unchanged from F12 §6–§7:

1. `gen_badge_art.py <key> --kind level --reference assets/levels/_anchor.png`
   — one call.
2. `check_badge_art.py <candidate> --anchor assets/levels/_anchor.png` — nine
   measurements, free, plus the three crops it writes beside the candidate.
3. **Look at the crops.** The exit code is not the verdict, and the largest
   failure mode of these models — lettering stamped around a frame — is not
   measured at all.
4. Approve, or retry with `--note "…"`, to a cap of three attempts.

**The pass bar**, in the order failures actually occur:

| Gate | Rule |
|---|---|
| Lettering | **Any** glyph, anywhere, including in the frame's rules. Instant reject. |
| Shape | A circular seal, roundel or disc. Instant reject — it is the one thing separating the decks. |
| 56 px legibility | If the small cell of the theme strip cannot be told from the tier above it without reading the title, it has failed regardless of how good it is at 220. |
| Paper | Cream `#F0EDE4`-ish. Parchment, sepia, tea-stain or a scorched edge is a different app. F12's experience: **paper tone was the hard part, not text.** |
| Two inks | Engraved line. One vermilion mark, off register, not an outline and not four marks. |
| Collision | Against §3.3's tally, across **both** decks. |
| Anatomy | The raven in `collector_barnabys_ghost` is the one animal in the deck. Trace it. Fix with pose language, never by counting. |
| Award vocabulary | Ribbons, rosettes, laurel, cups, stars, ticks. Wrong world. |

**The number of paid calls.** Seventeen tiers, one call per attempt:

- Anchor (`collector_jam_jar_of_words`): **2–4**. It has no reference to inherit
  paper tone from, which is where the badge anchor spent its attempts.
- The other sixteen, edited against the anchor: **1–3** each, historically
  closer to 1–2 once the anchor is right.

**Expect ~28–32 calls. The hard ceiling at the three-attempt cap is 3 × 17 + a
few anchor retries ≈ 55.** At `gpt-image-2`, `1024x1024`, `quality=high` that is
a small number of dollars, and the plan spends it deliberately rather than
economising into a worse deck.

**Nothing is spent before task 6.** Tasks 1–5 are types, prose, Python and two
dry runs. `python3 tools/gen_badge_art.py --dry-run --all --kind level` assembles
every prompt with no key read, nothing sent and nothing written — **run it and
read all seventeen prompts before generating anything**, because a scene line
that reads well in a plan and badly in an assembled prompt costs one free minute
to find here and three calls to find later.

---

## 7. Risks, and what to do about each

### 7.1 The two decks drift apart visually

The shared paragraphs in §3.1 are copies, and copies rot. **Mitigation:** they
are copied *once*, both files carry an independent version marker, both
manifests record which version each image was generated against, and
`badges:check` fails on a mixed deck. If `style.md`'s style block is ever
changed, the deliberate decision is whether `levels.md` follows — and the answer
is recorded by bumping, or not bumping, its own version.

### 7.2 A hard band in `check_badge_art.py` fires on every rectangle

Plausible: several bands measure ink distribution against a circular composition.
**Mitigation:** task 6 records which fire and by how much, and changes nothing.
The file's own rule — do not re-derive from fewer than six approved samples —
governs. If, after all seventeen exist, a band is wrong for this form, re-derive
from the observed distribution and record the range in the comment, exactly as
F12 did after the badge deck was complete. **Do not comment a band out**; a
threshold somebody comments out is the failure mode the file was written to
avoid.

### 7.2a `plate` is missing from `level-art.ts`

Only if F22's task 5 lands before F21's task 2. `ArtHero` requires it, so task 11
would not compile. **Fix:** re-run `python3 tools/make_badge_assets.py` — after
task 5 there is one `emit_manifest` serving both decks, so F21's edit reaches the
level manifest without anyone remembering to make it. Caught by `npm run
typecheck` the moment task 11's caller is written, which is before anything
renders.

### 7.3 F21 has not landed

**F22 ships tasks 1–10 and 12–13 and stops.** The level rows are not tappable,
no dialog file is touched, `level-meta.ts`'s glosses are written and asserted by
`stats:check` but not yet drawn, and `CLAUDE.md`'s one-modal sentence needs **no
amendment at all**. Task 11 becomes a follow-up whose only prerequisite is
F21's hero component. Nothing in tasks 1–10 anticipates the dialog, which is why
they are safe to ship alone: the illustration on the row is the feature the user
asked for, and the panel is the enlargement.

The reverse coupling is worth stating too: **F22 must not edit
`badge-dialog.tsx` before F21 lands.** Two plans rewriting the same 170-line
component in the same week is a merge, and F21's change is the structural one.

### 7.4 The repository grows by ~34 MB

Seventeen 1024² PNG masters at ~2 MB each, plus ~2.2 MB of WebP derivatives. The
existing `assets/badges/` is already ~28 MB on the same terms, so this is
consistent rather than novel — and the masters cannot be dropped, because
`badges:check` §9 recomputes their SHA-256 to prove the shipped bytes are the
approved bytes, which is the entire licence for the `immutable` header. Accepted,
and recorded here so it is a decision rather than a surprise in a clone.

### 7.5 The `as const satisfies` change to `levels.ts` breaks a consumer

`levels.ts` is imported by `profile-stats.ts`, `on-card-created.ts`,
`level-block.tsx`, `kitchen-sink/profile/page.tsx` and
`scripts/check-gamification.ts`. Removing the `: readonly LevelBand[]`
annotation narrows the exported types rather than widening them, so every
existing use still type-checks; `resolve()` continues to take
`readonly LevelBand[]`. **Caught by `npm run typecheck` at the end of task 1**,
before anything else is built on it, which is why it is task 1.

### 7.6 A scene line turns out to be un-generatable

Most likely candidates: `streak_walking_errata` (a composing stick is an obscure
object and the model may resolve it into type, which is letters) and
`streak_margin_scribbler` (the title actively suggests handwriting).
**Mitigation:** three attempts with `--note`, then rewrite the scene line and
record the rewrite in `levels.md` beside the collision audit. A scene line is
data in a contract file, not a constant in code; rewriting one costs a commit.

---

## 8. Verification

Every command, with what it must print. **Port 3200 and no other port** — a
leftover production `next start` on 3200 gets reused by Playwright and every
layout test fails with a misleading locator timeout. `ss -ltnp | grep 3200`, then
kill by **pid**, never by pattern.

```bash
npm run typecheck
#   silent. Between task 1 and task 8 this is RED on level-art.ts and
#   level-meta.ts, which is both parity guards firing on purpose.

npm run lint
#   clean. `level-mark.tsx` carries the same
#   `eslint-disable-next-line @next/next/no-img-element` as `badge-medal.tsx`.

npm run stats:check
#   All gamification assertions passed — including §N's seventeen keys, their
#   uniqueness, the levelArtKey round trip over every band, and the tone sweep
#   over seventeen glosses and seventeen conditions.

npm run badges:check
#   All badge-art assertions passed (14 badges, style v1; 17 levels, style v1).
#   §6 (no file under src/ names the offline image key) covers the three new
#   src/ files automatically — it walks the tree rather than a list.
#   §12 (no src/app route starts with `badges` or `levels`) is new.

npm run test:layout
#   18 existing assertions plus task 10's profile test, plus — only if task 11
#   ran — the level arm of the dialog test. Boots its own dev server on 3200.

python3 tools/gen_badge_art.py --dry-run --all
#   14 prompts, byte-identical to before F22.

python3 tools/gen_badge_art.py --dry-run --all --kind level
#   17 prompts. "No key was read, nothing was sent, nothing was written."

python3 tools/make_badge_assets.py --dry-run
#   14 badge derivative pairs + 17 level derivative pairs, no writes, no orphans.
```

**The `curl`, with no cookie jar.** This is the only proof of the matcher edit,
because the author testing it is signed in and a broken build renders perfectly
for them — the exact trap F16–F18 documented three times:

```bash
npm run dev    # 3200
curl -sI http://localhost:3200/levels/collector_jam_jar_of_words.<hash8>.sm.webp
#   HTTP/1.1 200 OK
#   cache-control: public, max-age=31536000, immutable
#   A 307 means `levels` is missing from the middleware matcher.

curl -sI http://localhost:3200/badges/tolkien.6f5d9027.sm.webp
#   still 200 + immutable — the badge deck is untouched.
```

**Two greps that must stay empty:**

```bash
grep -rn OPENAI_API_KEY src/         # nothing. Asserted by badges:check §6.
grep -rn EMBEDDING_API_KEY src/      # nothing. Asserted by journal:check.
```

**No database work.** `npm run db:generate` must stay **silent**: F22 adds no
column, no table and no `$type<>` widening. A migration appearing there means
something else changed.

### The manual pass — 375px, `/profile`, both colour schemes

The one thing no script can do is look at it. At 375×667, in light and dark:

1. `/kitchen-sink/profile?state=full` — a 19-day longest streak
   ("Margin Scribbler") and 86 words ("Private Collector"). Both marks drawn at
   56px, both pills on one line beside them, both `Meta` captions unwrapped, no
   horizontal scroll, the tab bar on screen.
2. `/kitchen-sink/profile?state=nowords` — the streak block has its mark; the
   collection block says **"no words yet" with no picture** ([R13], D5).
3. `/kitchen-sink/profile?state=empty` — "Blank Card" and its mark, "The pocket
   is empty", and **no** collector mark.
4. `/kitchen-sink/profile?state=lapsed` — the copy that must not scold is
   unchanged, and the mark is the one for the *longest* streak, not the current
   one. A lapse never takes a title or a picture away.
5. Hold the two marks against the badge shelf below them and confirm the thing
   D3 is for: **the rectangles read as a different kind of object from the seals,
   in the same world.** If they do not, that is a style-block problem, not a
   layout one.
6. Only if task 11 ran: tap each level row. The panel opens with the hero filling
   its top half, Escape closes it, and focus returns to the row that was tapped.

---

## 9. What this plan deliberately does not do

- **No level art on `/today`.** Not in the streak pill, not in the reward toast.
  F18 D3's measurement stands as the standing warning: a 32px control estimated
  at ~33px of slack took that header to 117px and every existing assertion
  stayed green.
- **No level art on a public share page.** F16's snapshot allowlists decide what
  a stranger sees, and a level is a fact about the sharer's own history. Adding
  it means touching `lib/share/serialize.ts`, which is "the one file that decides
  what a stranger sees", for a decoration.
- **No ladder, no locked tiers, no progress bar.** D5, and [R18] before it.
- **No `stats:recompute` change.** A level is derived; there is nothing to
  replay. `evaluateBadges` is untouched.
- **No new environment variable, no runtime model call, no migration.**
- **The skill never runs `make_badge_assets.py`** — F12 §9's rule, unchanged.
  Promotion changes what ships and belongs in its own commit beside
  `npm run badges:check`.
