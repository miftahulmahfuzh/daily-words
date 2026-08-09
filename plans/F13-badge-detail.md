# F13 — Badge detail: a clickable badge, a modal, and the fourteenth badge

Badges and achievements on `/profile` become tappable. Tapping one opens a centred
dialog carrying the medal art, the badge's title, the condition that earns it, a
short gloss on what the title is referring to, and — when it has been earned —
the dates it was earned on and how many times. The user's own words: *"we should
be able to make each badge and achievements clickable. if we click it, it will
pop up a big modal, showing a picture of the medal, and what this badge means,
(e.g: you create a daily card on the mother's day)"*. The same request added a
fourteenth badge: *"sauron's favorite: draw daily card on the death day of jrr
tolkien"*. J.R.R. Tolkien died on **2 September 1973** (a Sunday), aged 81, at
Bournemouth — verified against the Tolkien Society, Britannica and Wikipedia
before the rule below was written.

**Supersedes:**

- `plans/F9-gamification.md` §10.3, final line — *"Tapping a chip does nothing in
  v0.1.0. No detail sheet, no route."* That sentence is void. The rest of §10.3
  (no completion counter, no padlock, no `???`, no blur, no filter, no sort)
  survives intact and this plan strengthens it.
- `plans/F9-gamification.md` §8.1 — *"Thirteen badges, all thirteen from the
  roadmap, no additions."* Now fourteen. §8.2's purity contract is untouched and
  is the hardest constraint in this plan.
- `src/app/(app)/profile/badge-shelf.tsx` docstring, final line — *"Tapping a row
  does nothing in v0.1.0."* Must be replaced, not deleted, with a line saying
  what it does now and that the three deliberate absences above still hold.
- `src/components/README.md` § "Where this differs from `plans/F2-design-system.md`",
  the `ConfirmSheet` row — *"The user's call on the roadmap's open question #1.
  **No modal anywhere in the app.**"* This plan puts exactly one modal in the app.
  §2 D6 argues why that is not a reversal of the decision that row records, and
  the row must be amended rather than removed.
- Nothing in `ROADMAP_v0.1.0.md` is superseded. Its badge table remains
  authoritative for the thirteen badges it lists; see D8 and Risk R6.

**Depends on:** `plans/F12-badge-art-skill.md` for the art. §7 states the interface
F13 requires of it and §6 designs a placeholder so F13 can ship, be reviewed and
be tested before F12's assets land.

---

## 1. Decisions

### D1 — Badge metadata lives in a new sibling module, `src/lib/gamification/badge-meta.ts`, not in `BADGE_CATALOG`

`src/lib/gamification/reveal.ts` carries a load-bearing comment:

> **No `server-only` here, and no zod value import** — this ships to the phone.
> `BADGE_CATALOG` is a pure array of strings and comes along harmlessly; the
> schemas stay on the server and only their inferred types cross.

`reveal.ts` is imported by `src/components/gamification/reward-toast.tsx`, which
`/today` mounts unconditionally. So **everything in `badges.ts` is in `/today`'s
first-load JS on every visit**, for every user, whether or not they ever open
`/profile`. `BADGE_CATALOG` today is fourteen keys and fourteen titles: roughly
600 bytes raw, and it earns its place because `reveal.ts` genuinely needs catalog
order and `on-card-created.ts` genuinely needs `badgeTitle`.

The metadata is a different shape of thing. Estimated size, from the strings
drafted in §3:

| Field | avg chars × 14 |
|---|---|
| `condition` | ~70 → 980 |
| `gloss` | ~180 → 2 520 |
| `art` path | ~26 → 364 |
| keys + object syntax | ~55 → 770 |
| **total, raw** | **≈ 4.6 kB** |

Minification does not touch string literals, so the minified figure is
essentially the same; Brotli on English prose compresses around 3:1, so
**≈ 1.4–1.6 kB over the wire**. That is small in absolute terms and it is
*entirely wasted* on `/today`, which will never render a word of it. Adding it to
`BADGE_CATALOG` would also falsify the comment quoted above — a paragraph of
prose and a set of asset paths is not "a pure array of strings", and the next
person to read that comment would be misled about what is safe to add.

So:

- `badges.ts` keeps `key` and `title` and nothing else. Its header comment gains
  one line pointing at `badge-meta.ts` and saying why the split exists.
- `badge-meta.ts` is a **peer, not a wrapper**. No `import 'server-only'` (it must
  reach the browser), no zod value import, no React, no clock, no database. It
  imports `type BadgeKey` from `badges.ts` — a *type-only* import, so it adds no
  runtime edge and cannot create a cycle.
- It is imported by `badge-shelf.tsx` (client, `/profile` only), by
  `scripts/check-gamification.ts`, and by nothing else. In particular
  `reveal.ts`, `on-card-created.ts` and `recompute.ts` must not import it, and
  the check script asserts nothing under `lib/gamification/` other than the shelf
  path does.

### D2 — Every badge's condition is shown, earned or not. Nothing is hidden or teased.

The alternative positions were considered and rejected:

- **Hide the condition until earned.** This contradicts a decision already made
  and already documented. `badge-shelf.tsx` says: *"**No padlock, no `???`, no
  blur** on the unearned rows. They are empty places on a shelf, not locked
  content — a user should be able to read 'Leap Year Lexicographer' and work out
  that a leap day will do it."* Six of the fourteen titles already state their
  condition outright. Showing the title and hiding the sentence under it is a
  half-secret: it conceals nothing from anyone who reads, and it makes the modal
  useless for exactly the badges whose titles are oblique — which are the ones a
  user opens the modal to understand.
- **Tease it** ("earned on a particular day in September"). Worse than either
  option. It is coy, it is not the app's voice anywhere else, and it converts a
  reference screen into a puzzle the app then refuses to answer.

The concern that motivated the question is real: *"revealing 'draw a card on 2
September' turns a discovery into a checklist."* The answer is that a checklist
is not made by information, it is made by **pressure**, and this feature ships
none:

- No "N / 14" counter (F9 §10.3, kept).
- No "next badge", no "closest badge", no progress bar on any badge.
- No sort by proximity, no filter for unearned, no ordering by how close the date is.
- No notification, no reminder, no calendar marker, no badge dot on the Profile
  tab — the roadmap forbids all of it and `reward-toast.tsx` already documents
  why.
- The unearned modal has **no call to action**. No "come back on 2 September", no
  countdown, no link to `/today`. It states the rule in the present tense and stops.

A shelf you have to walk over to and read is not a checklist. A list that comes
and finds you is. The difference is the pressure, and F9 already removed it.

The one honest cost: dated badges become farmable by anyone with a calendar. They
already were — half the titles give the date away — and the app has no
leaderboard, no sharing of badges, no economy, and nothing to win. There is
nobody to farm them from.

**How the two states differ:**

| | Earned | Not yet earned |
|---|---|---|
| eyebrow | `EARNED` | `NOT YET EARNED` |
| medal art | full opacity | same asset at `opacity-40`, no blur, no lock, no greyscale filter (a `filter: grayscale()` reads as damage in dark mode) |
| title | ink | ink — **not** muted; the title is legible either way, per F9 §10.3 |
| condition | same sentence, both states | same sentence, both states |
| gloss | same, both states | same, both states |
| dates line | present (D3) | absent — not "—", not "never", just absent |
| anything else | — | — |

### D3 — The earned-on date is `awarded_for_date`, never `created_at`

`badges_awarded` has both. They answer different questions:

- `awarded_for_date` is a `date` column holding the **card's user-local calendar
  date** — the day the badge is *about*. It is written from `event.cardDate` by
  `on-card-created.ts` and from `card.cardDate` by `recompute.ts`, both of which
  got it from `lib/time/local-date.ts`.
- `created_at` is a `timestamptz` holding the instant the **row** was written.
  For a badge awarded live these are the same day; for a badge awarded by
  `npm run stats:recompute` they are not. After §5's backfill, every historical
  `tolkien` row will have a `created_at` of the day the developer ran the script.
  Rendering it would tell a user they earned "Ghost of Christmas Vocab" in
  August.

So: **`awarded_for_date`, always.** This is not a new query. `getBadgeCounts` in
`src/lib/db/queries/badges.ts` already selects
`min(awarded_for_date)::text` and `max(awarded_for_date)::text`, `getProfileStats`
already maps them to `firstAwardedOn` / `lastAwardedOn`, and `earnedBadgeSchema`
already types them as `isoDateSchema`. **It does not select `created_at` at all**,
which is itself the argument: the correct column is the only one that is
reachable, and it stays that way.

Formatting goes through the existing `formatLocalDateLong` from
`lib/time/local-date.ts` — "2 September 2027". No new formatter, no `Intl` in a
component, no `toISOString`, no `Date` constructed anywhere in the modal.

**The dates line, exactly:**

- `count === 1` → `Earned 25 December 2026`
- `count > 1` → `×4 · first 3 May 2026 · latest 13 September 2026`

Both in `Meta` (mono, sentence case, `text-ink-3`) — this is bookkeeping, which
is what the mono voice means per `text.tsx`.

The modal does **not** list every occurrence. `sunday` on a two-year user is 104
rows; that is a log, not a record, it would need a new query and a new schema
field, and no question a user has is answered by the middle 102 of them.

### D4 — The count is shown, and it comes from `count(*)` over the unique index

`UNIQUE (user_id, badge_key, awarded_for_date)` is what makes the count
meaningful. It guarantees **at most one row per (user, badge, day)**, so
`count(*) GROUP BY badge_key` is exactly "the number of distinct local days on
which this badge was earned" — and cannot be inflated by a retried request, a
re-delivered `CardCreatedEvent`, or the tenth run of `stats:recompute`.
`awardBadges`' `ON CONFLICT DO NOTHING` is the other half of that guarantee.

Consequences worth stating, because they are the two badges the question is
about:

- `full_week` fires at run lengths 7, 14, 21… Each firing is on a **different**
  `card_date`, so each is a distinct row and the count is the number of completed
  weeks. Correct.
- `sunday` fires on every Sunday, each a distinct `card_date`. Correct.
- A badge cannot be earned twice on the same day even if the rules changed to
  allow it, because the index says so. That is the intended ceiling.

`BadgeRow` already renders `×N` on the shelf and needs no change. The modal
repeats it in the dates line because the modal is read in isolation once it is
open.

### D5 — The modal is a native `<dialog>` opened with `showModal()`, driven by client state. No route, no intercepting route, no portal.

**Why not a real route (`/profile/badge/[key]`).** The roadmap's Locked Decision
reads:

> A full-page modal on iOS Safari loses the edge-swipe back gesture, requires
> hand-rolled scroll locking, and breaks fixed-height layout math when the URL bar
> collapses. A route gets back-button semantics, reload survival, and a sane place
> to hang the nested chat view. Every feature plan must assume routes.

Four reasons, and this plan takes each one seriously:

1. *Loses the edge-swipe back gesture.* That harm exists when a modal **replaces
   a screen the user navigated to**, so the gesture they reach for does nothing.
   Here the user has not navigated: they are on `/profile`, they tapped a row,
   and the shelf is visible behind the dialog. There is no back to lose because
   there was no forward. A stray edge-swipe on iOS with the dialog open
   navigates away from `/profile` entirely — which is exactly what the same
   gesture does today with no dialog, so nothing regressed.
2. *Requires hand-rolled scroll locking.* This is the reason to use a native
   `<dialog>` rather than the reason to use a route. `showModal()` blocks the
   document behind it in the UA, not in application code. §4 pins the one
   residual case.
3. *Breaks fixed-height layout math when the URL bar collapses.* This is the
   strongest reason and it is the one that **inverts** here. `showModal()` puts
   the element in the **top layer**: outside `.dw-screen`'s flex column, outside
   its `overflow: hidden`, outside `100dvh` arithmetic, sized by its own content
   against the viewport. It contributes **zero** height to the budget. That is
   precisely the property `src/components/README.md` already accepted for
   `RewardToast` — *"it contributes zero layout height, which is the property the
   rule protects"*.  A route would put a second `Screen` into the height budget
   and would have to defend it.
4. *A sane place to hang the nested chat view.* `/vocab/[id]` has `/vocab/[id]/chat`
   under it. A badge has nothing under it and never will.

**Why not an intercepting route** (`/profile/@modal/(.)badge/[key]`). It would
buy a URL and reload survival at the cost of: a parallel-route slot in the
`(app)` group with a `default.tsx`, a hard-navigation fallback page that must
also be designed and tested, an interaction with `export const dynamic =
"force-dynamic"` that this repo has never exercised, and a routing shape that
appears nowhere else in the app. What it buys is worth nothing here — there is
nothing to deep-link to, no share target (F16–F18 share words, cards and journal
entries, not badges), and the thing a reload would lose is one tap away.

**Why client state is not the mistake it usually is.** The usual argument for a
URL is that state a user can get into should be state a user can get out of and
back to. A badge modal is read for four seconds and dismissed. Nothing is
entered, nothing is lost, nothing is addressable.

**Landing:** one modal, in one place, opened from one component, on one screen.
`src/components/README.md`'s "No modal anywhere in the app" row is amended to
"One modal, and it is a native `<dialog>` in the top layer" with a pointer at
this section. That row recorded a decision about `ConfirmSheet` — a modal that
**interrupts a destructive action**, which is the kind that earns its bad
reputation. This one interrupts nothing.

### D6 — `BadgeRow` does not change. The shelf wraps it in a `<button>`.

`src/components/README.md` is frozen and the only kit change on record is
`TextArea` gaining a `ref` declaration — additive, and justified in the README.
`BadgeRow` could take `onClick`, but then the kitchen sink, the loading skeleton
and the README table all have to absorb a prop that exactly one caller uses.

Instead `badge-shelf.tsx` renders `<button className="w-full text-left">` around
the existing `<BadgeRow>`. `BadgeRow` is a flex row with `border-b` and `py-3.5`
and survives inside a full-width block-level button unchanged. Measured height is
~52px, comfortably over `LAYOUT.touchMin` (44). `globals.css` already applies
`user-select: none` and the focus ring to `button`.

The `aria-label`s that `badge-shelf.tsx` puts on the `<li>` move to the `<button>`,
because that is now the thing with a role.

### D7 — `BadgeShelf` becomes a client component; `/profile` stays a server component

The shelf owns the open/close state and the dialog. It is the smallest unit that
can: making the rows client components and keeping the shelf on the server would
push the same prose through the RSC payload on every request instead of into one
cacheable JS chunk, which is worse, not better.

`/profile/page.tsx` keeps `export const dynamic = "force-dynamic"`, keeps
`getProfileStats`, and passes the same `badges: EarnedBadge[]` prop it passes
today. The prop is already plain JSON. **No zod schema crosses as a value** — the
shelf imports `type EarnedBadge` and always has.

### D8 — The fourteenth badge is `key: "tolkien"`, `title: "Sauron’s Favourite"`

Three separate calls:

**The key.** Keys in this catalog name the *trigger*, factually and in ASCII:
`christmas`, `leap_day`, `world_book_day`, `ibu`, `indonesia_independence`.
`sauron` names a joke and describes nothing; a `badges_awarded` row reading
`sauron` would be unreadable in the Neon console and in a recompute diff.
`tolkien` is the key.

**The title.** The user asked for "sauron's favorite". Two things are wrong with
it as typed and one thing is right:

- *Spelling.* The catalog is en-GB. `formatLocalDateLong` and every other
  formatter in `local-date.ts` use `en-GB`; `lib/llm/prompts/vocab-enrich.ts`
  explicitly rules that `"colour" is "ok"` and `"realise" is "ok"`; the codebase
  writes "colour" and "recognised" throughout. **"Favourite".**
- *Apostrophe.* `levels.ts` documents the rule at the top of the file — every
  string the app draws uses the typographic apostrophe, and *"a straight quote
  beside them in the same serif reads as a typo"*. **`Sauron’s`**, U+2019.
- *The joke is right, and it is in convention.* The catalog's humour is dry and
  oblique: "Ghost of Christmas Vocab", "The Uncle's Trick". "Sauron's Favourite"
  is a flat, dark, unexplained line about the day the author died being somebody's
  good news. That is the register. It also does the thing "The Bard's Regard"
  does — the World Book Day badge, also pinned to an author's recorded death
  date, which names neither the author nor the date.

**Recommended: `{ key: "tolkien", title: "Sauron’s Favourite" }`.**

Alternatives, if the user wants it drier: "The Professor’s Long Defeat" (Tolkien
was universally "the Professor"; "the long defeat" is Galadriel's phrase and his
own about history). "Namárië" was rejected — a badge title the shelf cannot
render in the app's serif is not a badge title. **This is the user's joke and the
title is theirs to confirm — see Risk R5.**

**Catalog position: appended, index 13, last.** `BADGE_CATALOG` order is shelf
order, toast order and evaluator return order, and
`scripts/check-gamification.ts` asserts a specific index tuple:

```
check('returned in BADGE_CATALOG order', … , [0, 1, 3, 10])
```

Appending preserves every existing index, so that assertion and the toast
ordering of all thirteen existing badges are untouched. The catalog is not
chronological already — `leap_day` (29 February) sits last, after `year_end`
(31 December) — so appending breaks no ordering the catalog claims to have.

---

## 2. Schema changes

**None. No migration.**

- `badges_awarded.badge_key` is `text` with no enum, no check constraint and no
  foreign key. A new key is data, not schema.
- `badgeKeySchema` in `src/lib/gamification/schemas.ts` is
  `z.enum(BADGE_KEYS as …)` — derived from the catalog, so it picks up `tolkien`
  with no edit.
- `earnedBadgeSchema` already carries `count`, `firstAwardedOn`, `lastAwardedOn`.
  Everything the modal renders is already in `ProfileStats`.
- No query changes. `getBadgeCounts`, `listBadgeAwards`, `awardBadges` and
  `pruneBadges` are all key-agnostic.

Do **not** run `npm run db:generate`. If it produces a diff, something else
changed and that is a separate investigation.

---

## 3. Badge metadata — the copy, authored here for the first time

Two fields per badge. Both are shown in both states (D2).

- **`condition`** — the rule. One sentence, present tense, impersonal, no second
  person. This is the sentence the user asked for.
- **`gloss`** — one to three sentences on what the title refers to and why the
  day matters. This is the "what this badge means".

**Register.** Checked against `reward-toast.tsx` ("Restraint is the spec"),
`levels.ts` ("there is no deadline anywhere in this feature, and 'until' invents
one"), `stats-grid.tsx` ("its whole job is to be *not* a warning"), F10 §7's
rubric as quoted in `CLAUDE.md` ("no flattery, no second person, no exclamation,
concrete situations"), and the design HTML's own copy ("Nothing is generated
until you press it", "The only way in. No password to forget.").

The app **does** use the second person, but only mechanically and only about the
machine's behaviour — "Pronunciation and meaning are fetched for you", "You
already have {term}", "Nothing is generated until you press it". It never uses it
to congratulate. So: **no second person in `condition` or `gloss` at all.** The
conditions are stated as facts about cards, not as things the reader did. That
also makes one string correct in both the earned and unearned state, which is
what D2 requires.

Hard rules, asserted by `stats:check` (§8):

- No `!`.
- No second person: no `you`, `your`, `yours`, `you're`.
- No flattery: no `congratulations`, `well done`, `amazing`, `nice work`, `proud
  of`, `impressive`.
- No loss aversion: the existing banned-phrase list in `check-gamification.ts`
  applies to these strings too.
- Typographic apostrophes only. No `'` (U+0027) anywhere in a rendered string.
- `condition` ≤ 140 characters; `gloss` ≤ 320.

### The fourteen

| key | title | condition | gloss |
|---|---|---|---|
| `first_card` | The Uncle’s Trick | The first card ever made. | The trick was never knowing the words. It was having six of them in a pocket at the moment somebody asked. |
| `full_week` | Full Week Ration | Seven cards on seven consecutive days. Awarded again at fourteen, twenty-one, and every seventh day after that. | A ration is a week’s worth, issued once and not topped up. A missed day takes nothing back; it restarts the count. |
| `sunday` | No Weekend Without Ration Card | A card made on a Sunday. | Ration books were stamped by the week, and the week ended on a Sunday whether or not anyone felt like queuing. |
| `midnight_oil` | Burning the Midnight Oil | A card made between midnight and 03:59 local time. Four o’clock is morning. | The oil in the phrase was real, and burning it was a complaint rather than a boast. The hour is read from the clock where the card was made, not from the server’s. |
| `new_year` | Resolution, Documented | A card made on 1 January. | Most resolutions are announced. This one has a timestamp. |
| `womens_day` | Words for Her | A card made on 8 March, International Women’s Day. | Marked since 1911, before most of the people it was marked for could vote. The card is the observance. |
| `world_book_day` | The Bard’s Regard | A card made on 23 April, World Book and Copyright Day. | UNESCO chose 23 April because Shakespeare and Cervantes are both recorded as dying on it in 1616 — on two different calendars, ten days apart, which is a small lesson in how records work. |
| `fathers_day` | For the Old Man | A card made on the third Sunday of June. | Always a Sunday, so it always arrives with the Sunday badge attached. |
| `indonesia_independence` | National Speaker | A card made on 17 August, Indonesian Independence Day. | Proclaimed in 1945 in a borrowed house on a Friday morning. A day for speeches, and this is a shop that sells the words for them. |
| `ibu` | Ibu Would Be Proud | A card made on 22 December, Hari Ibu. | Indonesian Mother’s Day, dated to the first Indonesian Women’s Congress in 1928 rather than to a greetings-card season. |
| `christmas` | Ghost of Christmas Vocab | A card made on 25 December. | Dickens sent three ghosts and each of them had a speech. This one shows six words and leaves. |
| `year_end` | Last Word of the Year | A card made on 31 December. | The final entry before the book is closed. Whatever the sixth word turned out to be, it stands. |
| `leap_day` | Leap Year Lexicographer | A card made on 29 February. | Available on about one day in every one thousand four hundred and sixty-one. The rarest thing on this shelf, and nothing about it is difficult. |
| `tolkien` | Sauron’s Favourite | A card made on 2 September, the day J.R.R. Tolkien died. | Tolkien died on 2 September 1973, a Sunday, at eighty-one. He was a philologist first and a novelist second: the languages came before the story, and the story was built to give them somewhere to be spoken. Somebody in Mordor presumably marked the date. |

Every factual claim in the `gloss` column is checkable and several are worth
checking before merge. See Risk R4.

### Module shape

`src/lib/gamification/badge-meta.ts` exports one frozen record keyed by
`BadgeKey`, plus one accessor mirroring `badgeTitle`'s contract:

- `BADGE_META: Record<BadgeKey, BadgeMeta>` where
  `BadgeMeta = { condition: string; gloss: string; art: string | null }`.
- `badgeMeta(key: string): BadgeMeta | null` — **null for an unknown key**, for
  exactly the reason `badgeTitle` returns null: *"a `undefined` interpolated into
  a badge list is a worse outcome than a skipped row."* The shelf already drops
  unknown keys upstream in `getProfileStats`, so this is belt and braces, but the
  two functions must behave the same way or the next reader will assume they do
  and be wrong.

Typing it as `Record<BadgeKey, …>` rather than a `Partial` is deliberate: adding
a fifteenth badge to `BADGE_CATALOG` without adding metadata becomes a
**TypeScript error**, not a runtime hole. `npm run typecheck` catches it before
`npm run stats:check` does. Both guards are kept; the type is the fast one and
the assertion is the one that also checks the asset exists on disk.

---

## 4. The modal

### 4.1 Component and composition

`src/components/gamification/badge-dialog.tsx` — `"use client"`.

Composed from existing primitives only. **No new colour, type size or radius**
(`src/components/README.md`, and it is the first rule in the file):

| Part | Primitive |
|---|---|
| eyebrow (`EARNED` / `NOT YET EARNED`) | `Eyebrow` from `@/components/ui/text`, `size="sm"`, `tone="accent"` when earned, default muted when not |
| title | `<h2>` with the same classes `ScreenHeader` gives its `<h1>` — `text-2xl font-normal tracking-title` — not a new size |
| condition | `Prose` `size="base"` `tone="ink"` |
| gloss | `Prose` `size="sm"` `tone="muted"` |
| dates line | `Meta` from `@/components/ui/text` |
| close | `Button` `variant="outline"` `size="sm"` `fullWidth={false}`, label `Close` |
| panel surface | `bg-card`, `border border-rule`, `rounded-[var(--r-card)]` — the same tokens `Card` uses |
| medal | `BadgeMedal`, §4.4 |

**The panel is not a `Card`.** `card.tsx` says *"a card never nests inside another
card, and a card never scrolls internally"*, and §4.5 gives the dialog body a
documented `overflow-y` escape below a viewport floor. Using the same tokens
without claiming the component keeps that contract honest. One comment in
`badge-dialog.tsx` says so.

Props:

```
{ badge: { key: BadgeKey; title: string } ,
  earned: { count: number; firstAwardedOn: LocalDate; lastAwardedOn: LocalDate } | null,
  onClose: () => void }
```

`earned === null` is the unearned state. The dialog looks up `condition`, `gloss`
and `art` from `BADGE_META` itself — the caller passes a key, not prose.

### 4.2 Mechanism: native `<dialog>` + `showModal()`

**The app ships no modal machinery of any kind.** Verified: `grep -rn
"createPortal|<dialog|aria-modal|inert" src` returns two hits, both of them
comments. There is nothing to reuse and nothing to conflict with.

What `showModal()` gives, from the UA, with no application code:

| Requirement | Mechanism |
|---|---|
| focus trap | Built in. Tab is confined to the dialog's focusable descendants for as long as it is open. |
| initial focus | The first focusable descendant. Put `autoFocus` on the close `Button` so focus lands somewhere named rather than on the medal. |
| Escape | Fires a `cancel` event then closes. Handle `onCancel` to call `onClose` so React state and DOM state cannot diverge. |
| `aria-modal` | Implied by the modal state. Do **not** write `role="dialog" aria-modal="true"` by hand — a redundant explicit role on a `<dialog>` is a known screen-reader hazard. |
| accessible name | `aria-labelledby` pointing at the `<h2>`'s `id`. Build the id with React's `useId()`. |
| top layer | The element is painted above everything, immune to `z-index` and, critically, **immune to `.dw-screen`'s `overflow: hidden`**. This is why no portal is needed and no `createPortal` import appears. |
| backdrop | `::backdrop`, §4.3. |
| focus restore | On close, focus returns to the element that had it. React must not re-order the shelf between open and close, and it does not. |

Baseline: `<dialog>` `showModal()` and `::backdrop` are Safari 15.4+ (March 2022),
Chrome 37+, Firefox 98+. That is comfortably inside the app's target.

**Backdrop dismissal** is not free and must be written. A click on the backdrop
targets the `<dialog>` element itself (the panel is a child), so:

```
onClick: if (event.target === dialogRef.current) onClose()
```

This is the standard, robust form. Do not compare bounding boxes against pointer
coordinates — that variant breaks when the user drags a text selection out of the
panel and releases over the backdrop.

**Open/close discipline.** `showModal()` and `close()` are imperative and the
component is declarative, so exactly one `useEffect` reconciles them:

```
if (open && !el.open) el.showModal()
if (!open && el.open) el.close()
```

Guarding on `el.open` matters: calling `showModal()` on an already-open dialog
throws `InvalidStateError`, and React 19 Strict Mode double-invokes effects in
development.

The `<dialog>` element is rendered by `BadgeShelf` as a **single instance**, with
its content driven by the selected key — not fourteen dialogs, one per badge.
Fourteen would put fourteen `<img>` elements in `/profile`'s DOM whose fetch
behaviour under `display: none` differs by engine.

### 4.3 Backdrop, scroll lock and CSS placement

Two rules go into `src/app/globals.css`.

**Backdrop.** `::backdrop` cannot inherit from the page and does not see CSS
custom properties defined on `:root` in every engine's older versions, so it is
written with a literal `color-mix` against `--paper`, or with a plain
`rgb(… / .55)` pair under `prefers-color-scheme`. The design's rule is that
elevation is carried by surfaces and hairlines, never by shadow, so the backdrop
is a flat scrim and there is no drop shadow on the panel.

**Scroll lock.** `showModal()` blocks interaction with the document behind it, but
whether a touch-drag over an inner `overflow-y: auto` pane is blocked is
engine-dependent, and `/profile`'s `ScreenBody` has `scroll`. The deterministic
belt:

```
body:has(dialog[open]) .dw-pane-scroll { overflow: hidden; }
```

**Placement is load-bearing.** `.dw-pane-scroll` is defined **unlayered** in
`globals.css` (line ~251), deliberately, so it beats utility classes. The new rule
must sit **immediately after it, in the same unlayered block**, so equal
specificity is resolved by source order in the obvious direction. It must **not**
go in `@layer base` — a layered rule loses to the unlayered `.dw-pane-scroll`
above it and would silently do nothing. This is the inverse of the trap
`CLAUDE.md` documents, and it is the same trap.

`:has()` is Safari 15.4+, the same floor as `<dialog>`. In an engine without it
the rule is dropped and the behaviour is whatever `showModal()` gives, which is
the current status quo everywhere else.

Entry animation: reuse `.dw-in` (the existing 0.3s fade-and-rise). No new
keyframes. `globals.css` already collapses it under `prefers-reduced-motion`.

### 4.4 The medal, and the F12 interface

`src/components/gamification/badge-medal.tsx` — a plain function component, not a
client component of its own.

```
<BadgeMedal badgeKey={key} earned={boolean} />
```

- If `BADGE_META[key].art` is a path: a plain `<img src={art} width={160}
  height={160} alt="" aria-hidden="true" />`. `alt=""` because the art is
  decorative in the strict sense — the `<h2>` immediately below names the badge
  and the `condition` states what it is for, so alt text would repeat the
  heading. `next/image` is **not** used: it is not currently imported anywhere in
  `src`, `next.config.ts` has no `images` block, and a fixed-size local PNG in
  `public/` gains nothing from it.
- If `art` is `null`: the placeholder — a 160×160 `border border-rule
  rounded-[var(--r-card)]` square holding a 40×40 `bg-accent` block, which is
  `BadgeRow`'s own 7px accent square scaled up. No new token, no new colour, and
  it is visibly a placeholder rather than a failed image.
- Unearned in both cases: `opacity-40`. No `grayscale()`, no `blur()`.

**What F13 requires of F12** (these are requirements F12 must satisfy; where F12's
own plan already decides otherwise, F12 wins and this section is reconciled
against it — see Risk R7):

1. **Path convention:** a stable path per badge under `public/badges/`, keyed by
   the exact `BadgeKey`. Fourteen entries, one per key.
2. **Dimensions:** square, delivered at least 480 px so that a 160 CSS px draw
   covers 3× DPR. A larger master may exist in the skill's working directory; it
   must not be committed to `public/`.
3. **Transparency or a self-carried plate.** The medal sits directly on `--card`,
   which differs between the two colour schemes. Either an alpha channel, or art
   that carries its own background plate and has been measured against both
   `--paper` values. What must not happen is a baked-in white rectangle that was
   never checked in dark mode.
4. **Theme handling:** **one asset that reads on both schemes.** No `-dark`
   variant, no CSS filter applied by the app. If F12 concludes it genuinely
   cannot be met, `BadgeMeta.art` becomes `{ light: string; dark: string }` — a
   one-line type change here and a `<picture>` with
   `media="(prefers-color-scheme: dark)"` in `BadgeMedal`. Flag it; do not
   silently ship a filter.
5. **Weight:** ≤ 60 kB per asset, ≤ 850 kB for the set.
6. **Style:** conforms to the app's existing visual language. Explicitly **not**
   the dark, bloody tarot style named in the F11–F18 brief.
7. **Registration:** F12's generator writes nothing to `badge-meta.ts`. Landing
   the art is a manual, reviewable edit flipping fourteen `art: null` values to
   fourteen paths, in one commit, with the images.

Until then all fourteen are `art: null` and every screen, script and test in this
plan works.

### 4.5 The layout budget

**The dialog is outside the budget, and `npm run test:layout` gains one case that
proves it.**

Outside, because the top layer is not in `.dw-screen`'s flex column: it adds zero
height to the document, exactly as `RewardToast` does with `position: fixed`, and
the README already accepts that argument in those words.

But "outside the budget" is not "unconstrained" — the dialog itself must fit the
viewport or its own content will need scrolling. Sizing:

```
width:      calc(100vw - 2 * var(--gutter))   with a max of 340px
max-height: calc(100dvh - var(--pad-top) - var(--pad-bottom) - 2 * var(--gutter))
position:   centred, via the UA default plus margin: auto
```

Estimated content height at 375×667: medal 160 + gap 16 + eyebrow 12 + title 28 +
condition ~2 lines 44 + gloss ~4 lines 76 + meta 14 + close button 44 + panel
padding 40 ≈ **434px** against ~600px available. Comfortable.

The `tolkien` gloss is the longest string in §3 and is the one that must be
measured; if it overruns, the escape hatch below carries it rather than the copy
being cut.

**The escape hatch**, mirroring the pattern `globals.css` already documents for
`.dw-pane-fixed` at `@media (max-height: 545px)`: the dialog **body** (everything
below the medal) gets `overflow-y: auto; overscroll-behavior: contain` under
`max-height`, so at 320×568 and in landscape the panel scrolls internally rather
than clipping the gloss. The medal and title stay put. This is the documented
degradation, and a comment in `badge-dialog.tsx` should point at
`LAYOUT.designFloorDvh` and the existing rule the way `globals.css` does.

**New spec case.** `tests/e2e/no-scroll.spec.ts` currently covers `/today` and
`/journal` across two viewports and two schemes. Add one describe block, run at
both viewports and both schemes, against `/kitchen-sink/profile?badge=leap_day`
(§6):

1. `pageDoesNotScroll(page)` with the dialog open — the shelf behind must not
   have grown.
2. `tabBarIsOnScreen(page)` — unchanged, and it proves the dialog did not push
   the frame.
3. The dialog's bounding rect is fully inside the viewport on all four edges.
4. The dialog is `open` and `document.activeElement` is inside it — the focus trap
   is doing its job.
5. `Escape` closes it and the shelf is still there.

That is five assertions × the existing project matrix. The spec's header comment,
which currently says *"One job: prove the daily card never scrolls"*, gets one
sentence about the dialog case.

---

## 5. The new rule, and the backfill

### 5.1 The code change

`src/lib/gamification/badges.ts`, two edits and a comment:

1. Append to `BADGE_CATALOG`: `{ key: "tolkien", title: "Sauron’s Favourite" }`.
2. Append to `evaluateBadges`, **after** the `leap_day` check so return order
   matches catalog order:

   ```
   // 2 September. J.R.R. Tolkien died on 2 September 1973, aged 81. No year
   // test: the anniversary is the trigger, and 1973 itself qualifies.
   if (month === 9 && day === 2) earned.push("tolkien");
   ```
3. Header comment: "thirteen badges" → "fourteen badges", and one line recording
   that the fourteenth is not in `ROADMAP_v0.1.0.md`'s table and why (D8, R6).

**Purity is unchanged.** The rule reads `month` and `day` off the already-parsed
`cardDate`, exactly as the nine other date badges do. No clock, no `new Date()`,
no `Intl`, no database, no year comparison. `CLAUDE.md`:

> `evaluateBadges` is pure for one reason: the live award path and
> `npm run stats:recompute` call it, and a replay that disagreed with what was
> awarded on the day would be unfixable.

Every hour of every 2 September in every timezone produces the same answer for
the same `cardDate` string. That is what makes §5.2 safe.

Also update the "thirteen" wording in: `src/app/(app)/profile/page.tsx` (the
comment "still shows all thirteen names"), `src/app/(app)/profile/loading.tsx`
("renders all thirteen names"), `src/lib/gamification/recompute.ts` ("thirteen
pure evaluations each"), `src/components/README.md` ("shows all thirteen"), and
`scripts/check-gamification.ts` (`check('thirteen badges, no more', …, 13)`).
`grep -rn "thirteen" src scripts` is the checklist.

### 5.2 What happens to users who already drew a card on a past 2 September

Nothing, until the backfill is run. Then they get the badge, silently.

`recomputeUserGamification` reads the user's whole `daily_cards` history and
replays `evaluateBadges` over it. Because the rule is pure and date-driven, every
past card dated `*-09-02` now evaluates to `tolkien`, the award lands in
`expected`, and `awardBadges` inserts it. `recompute.ts` states the design
directly:

> **Silent by construction.** A backfill produces no toast, marks nothing as new,
> and never announces "you earned 14 badges while we weren't looking". The user
> simply finds the shelf correct next time they open /profile.

`ON CONFLICT DO NOTHING` against `UNIQUE (user_id, badge_key, awarded_for_date)`
makes it idempotent, so re-running is free and a partially-completed run is
resumable. One transaction per user, so a half-applied recompute is impossible.

Cost: 14 pure evaluations per card. `recompute.ts` measures three years of daily
cards at ~1,095 rows and calls it "well under a second". The fourteenth rule is
one integer comparison.

The awarded date is the card's `awarded_for_date`, i.e. the historic 2 September
— which is why D3's choice of column matters and why `created_at` must never
reach the screen.

### 5.3 The procedure

Run in this order, on production, by hand, once:

```bash
npm run typecheck
npm run stats:check                          # §8. Must be green before anything below.
npm run stats:db                             # §8. Seeds and deletes a fixture user.
npm run stats:recompute -- --all --dry-run   # READ THIS OUTPUT. Do not skim it.
npm run stats:recompute -- --all             # no --prune. Ever.
```

**Reading the dry run is the actual safety mechanism.** `report()` in
`recompute-stats.ts` prints every insert as `+ <key> <date>`. The only lines that
may appear are `+ tolkien <a date ending -09-02>`.

**Stop and investigate if you see anything else:**

- a `+ full_week`, `+ sunday`, `+ midnight_oil` or any other key — that means the
  live award path had already drifted from the replay, which is a pre-existing
  bug this change did not cause and must not be buried inside it;
- any `− <key>` line — impossible without `--prune`, so if one appears the flag
  parsing is wrong;
- a `← changed` on the stats line — a badge addition cannot change a streak;
- a `warning card <date> has an unusable timezone` — note the user and read §5.4
  before running for real.

Verify afterwards: run `--all --dry-run` a second time and confirm it now inserts
nothing. That is `stats:db`'s "recompute must be a fixed point" assertion, run
against real data.

Then open `/profile` as a user who has a past 2 September card and confirm the
row is on the shelf with the right date in the modal.

### 5.4 Why `--prune` is dangerous here, specifically

`--prune` is not "remove the rows this change made stale". It is **a whole-history
diff**: `recompute.ts` computes `expected` from scratch and deletes every existing
award not in it.

```
const stale = prune ? existing.filter((a) => !expectedSet.has(keyOf(a))) : []
```

For an additive change the correct `stale` set is empty by construction. So
`--prune` has **zero upside on this change** and at least three ways to destroy
data:

1. **An award whose card no longer exists.** `expected` is derived from
   `daily_cards`. If a row was deleted — by hand in the Neon console, which
   `recompute.ts`'s own header lists as a reason the script exists — every badge
   earned on that day is "unexpected" and is deleted. The badge is the durable
   record of what happened; the card is six words that will be shown again
   tomorrow.
2. **`midnight_oil` re-judged under the wrong zone.** `recompute.ts` uses the
   card's own timezone, *falling back to the profile's* when the card's is null or
   unusable:

   ```
   const cardTz = isValidTimeZone(card.timezone) ? card.timezone : profileTz
   ```

   A user who has since moved from Jakarta to London, with any card carrying a
   null zone, has that card's local hour recomputed under London. A 01:30 Jakarta
   card becomes 18:30 the previous day; `midnight_oil` no longer evaluates, and
   `--prune` deletes an award the user genuinely earned. The script emits a
   warning for exactly this case and then, with `--prune`, deletes anyway.
3. **`badges_awarded` has no undo.** No soft delete, no `deleted_at`, no audit
   column, and the awards are not derivable from anything but the cards that just
   failed to justify them. `recompute-stats.ts` says it plainly: *"`--prune` is
   the only destructive operation in F9… deleting badges across every user by
   accident is the one unrecoverable mistake available here."* That is why
   `--prune --all` refuses without `--force`.

**Ruling: `--prune` is not part of this feature's procedure and must not appear
in any command in this plan, in a commit message, or in a runbook derived from
it.** If a future change genuinely invalidates awards, it needs its own plan, its
own dry run read line by line, and a database snapshot taken first.

---

## 6. Files

| File | New/Mod | Why |
|---|---|---|
| `src/lib/gamification/badge-meta.ts` | **new** | The fourteen `condition` / `gloss` / `art` records and `badgeMeta()`. Browser-safe: no `server-only`, no zod value, type-only import from `badges.ts`. D1. |
| `src/components/gamification/badge-dialog.tsx` | **new** | The `"use client"` native `<dialog>`. Composes `Eyebrow`, `Prose`, `Meta`, `Button`, `BadgeMedal`. D5, §4.1. |
| `src/components/gamification/badge-medal.tsx` | **new** | The 160px art slot, with the `art: null` placeholder. §4.4. |
| `src/lib/gamification/badges.ts` | mod | The `tolkien` entry and rule; "thirteen" → "fourteen"; a pointer to `badge-meta.ts`. §5.1. |
| `src/app/(app)/profile/badge-shelf.tsx` | mod | `"use client"`; rows wrapped in `<button>`; owns the selected key and mounts one `BadgeDialog`. Docstring's "Tapping a row does nothing" replaced, not deleted. D6, D7. |
| `src/app/(app)/profile/page.tsx` | mod | Comment only: "all thirteen names" → fourteen. No structural change; still a server component, still `force-dynamic`. |
| `src/app/(app)/profile/loading.tsx` | mod | Comment only: "renders all thirteen names". It already iterates `BADGE_CATALOG`, so the fourteenth ghost row appears for free. |
| `src/lib/gamification/recompute.ts` | mod | Comment only: "thirteen pure evaluations each". |
| `src/app/globals.css` | mod | `dialog::backdrop` and the `body:has(dialog[open]) .dw-pane-scroll` lock, placed **unlayered, immediately after `.dw-pane-scroll`**. §4.3 — placement is the whole point. |
| `src/app/kitchen-sink/profile/page.tsx` | mod | `?badge=<key>` opens the dialog on load, so it is reviewable at 375px in both schemes without a session, and so Playwright has a target. Add a `tolkien` award to the `full` fixture. |
| `scripts/check-gamification.ts` | mod | §8.1. The new rule, the catalog/metadata/asset cross-check, the extended tone check. |
| `scripts/check-gamification-db.ts` | mod | §8.2. A 2 September card, its backfill, and the fixed point. |
| `tests/e2e/no-scroll.spec.ts` | mod | §4.5's five assertions. |
| `src/components/README.md` | mod | `BadgeDialog` and `BadgeMedal` in the components table; the `ConfirmSheet` row amended; an F13 bullet in the obligations list recording the top-layer exception, in the same terms as `RewardToast`'s `position: fixed` exception. |
| `CLAUDE.md` | mod | One line under Conventions: there is exactly one modal, it is a native `<dialog>`, and it is on `/profile`. |
| `package.json` | **not modified** | `stats:check` and `stats:db` already exist and are extended in place. F13 adds no script. |
| `public/badges/*` | **not created here** | F12 owns them. §4.4. |
| `drizzle/*` | **not modified** | No migration. §2. |

---

## 7. Implementation order

Each step ends with the app building and `npm run typecheck` clean.

**1 — The rule.** Edit `badges.ts` only: append the catalog entry, append the
evaluator line, fix the "thirteen" comment. Update the `BADGE_CATALOG.length`
assertion in `check-gamification.ts` to 14. `npm run stats:check` green. Nothing
renders differently yet except a fourteenth grey row on the shelf, which is
correct.

**2 — The rule's tests.** Add §8.1's badge assertions. `npm run stats:check`
green. This is the point at which the pure logic is finished and provable.

**3 — The metadata.** Create `badge-meta.ts` with all fourteen records and
`art: null` throughout. Add §8.1's catalog/metadata cross-check and tone check.
`npm run typecheck` and `npm run stats:check` green. Still nothing renders.

**4 — The medal.** `badge-medal.tsx` with the placeholder branch only. Not wired
in yet.

**5 — The dialog.** `badge-dialog.tsx`, plus the two CSS rules. Not wired in yet —
render it once from `/kitchen-sink/profile?badge=leap_day` with the shelf still
inert, and look at it at 375×667 in both schemes. This is the step to get the
sizing and the backdrop right, before the shelf's interaction complicates it.

**6 — Wire the shelf.** `badge-shelf.tsx` becomes `"use client"`, rows become
buttons, one `BadgeDialog` is mounted. `/profile` and `/kitchen-sink/profile` now
both work. Manual pass: §9.

**7 — The layout spec.** Add the Playwright block. `npm run test:layout` green at
both viewports and both schemes. **Check that 3200 is free first, and kill by pid
— `reuseExistingServer: true` will otherwise reuse a leftover production server,
`/kitchen-sink` is gated off in production, and every assertion fails with a
misleading locator timeout.**

**8 — The database check.** Extend `check-gamification-db.ts`. `npm run stats:db`
green.

**9 — The docs.** `src/components/README.md`, `CLAUDE.md`, and the remaining
"thirteen" hits from `grep -rn thirteen src scripts`.

**10 — The backfill.** §5.3, on production, after everything above is merged and
deployed. Not before: a backfill against a deployed app that does not yet award
`tolkien` live would leave a window where a 2 September card gets no badge and the
next recompute quietly repairs it — recoverable, but it makes the dry-run output
in §5.3 unreadable, and reading it is the safety mechanism.

**11 — F12's art.** When F12 lands: flip fourteen `art: null` values to paths in
one commit with the fourteen assets. `npm run stats:check` now asserts each file
exists. No other file changes.

---

## 8. Verification

### 8.1 `npm run stats:check` (offline, no database, no network)

Follows the existing file's `check(label, actual, expected)` / `section(title)`
shape.

**The new rule** — added to the `§8.3 badges` section, using the existing
`on({...})` helper over the `ordinary` context:

```
tolkien   + 2026-09-02 (a Wednesday)   →  ['tolkien']
tolkien   − 2026-09-01                 →  []
tolkien   − 2026-09-03                 →  []
tolkien   − 2026-08-02                 →  []          # right day, wrong month
tolkien   − 2026-09-22                 →  []          # right month, wrong day
tolkien   + 1973-09-02 (a Sunday)      →  ['sunday','tolkien']   # the day itself
tolkien   + 2029-09-02 (a Sunday)      →  ['sunday','tolkien']
tolkien   + 2026-09-02 @ localHour 2   →  ['midnight_oil','tolkien']
```

Weekdays verified with `localDayOfWeek`, not guessed: 1973-09-02 and 2029-09-02
are Sundays; 2026-09-02 is a Wednesday; 2028-09-02 is a Saturday.

**2 September and 29 February in the same run**, which is the specific
cross-contamination this asks for:

```
leap_day  + 2028-02-29 (a Tuesday)     →  ['leap_day']
tolkien   + 2028-09-02 (a Saturday)    →  ['tolkien']
both      2028-02-29 then 2028-09-02, evaluated in sequence, produce
          exactly ['leap_day'] and exactly ['tolkien'] — neither leaks.
```

The point being made: `evaluateBadges` holds no state between calls and the day
number `2` in month `9` must not collide with the day number `29` in month `2`.
A transposed comparison (`month === 2 && day === 9`, or `day === 29 && month === 2`
written as `month === 29`) passes a single-date test and fails this pair.

**Order preserved** — the existing assertion must still hold and should be joined
by one that names the new badge's position:

```
'returned in BADGE_CATALOG order'  →  [0, 1, 3, 10]         # unchanged
'tolkien is last in the catalog'   →  BADGE_CATALOG.at(-1).key === 'tolkien'
'a Sunday 2 September first card'  →  ['first_card','sunday','tolkien']
```

**The catalog / metadata / asset cross-check** — a new `§F13 the badge metadata`
section:

```
fourteen badges, no more                  BADGE_CATALOG.length === 14
keys are unique                           14
titles are unique                         14
every catalog key has metadata            BADGE_CATALOG.filter(b => !BADGE_META[b.key]) === []
no metadata key is absent from the catalog Object.keys(BADGE_META).filter(k => !BADGE_KEYS.includes(k)) === []
every condition is non-empty and ≤ 140    []  (list of offenders)
every gloss is non-empty and ≤ 320        []
badgeMeta('six_before_noon') === null     mirrors badgeTitle's contract
every art path is null, or a file that exists on disk
    → for each non-null art, existsSync(join('public', art))   === []
```

The art assertion uses `node:fs` — still offline, still no database, still CI-safe.
It is a no-op while F12 is pending and becomes a real guard the moment the paths
land, which is exactly when a typo'd filename would otherwise ship as a broken
image.

**The tone check** — extend the existing `§14 the tone check` array with every
`condition` and every `gloss`, and add three banned patterns to the existing
list:

```
no exclamation marks       (existing check, now covering 28 new strings)
no nagging phrases         (existing list)
no second person           /\byou\b|\byour\b|\byours\b|\byou['’]re\b/i
no flattery                /congratulations|well done|amazing|nice work|proud of|impressive/i
no straight apostrophes    c.includes("'")
```

The last one catches the exact class of bug `levels.ts` documents at length, and
would have caught `Sauron's Favorite` as typed.

### 8.2 `npm run stats:db` (real Postgres, seeds and deletes a fixture user)

Extending the existing script, whose four stated concerns already cover the
mechanism; these add the new rule's path through it.

1. **Seed a card dated `2026-09-02` at 14:00 Jakarta** for the fixture user, via
   the existing `seedCard` helper. Drive `applyCardCreated` with the matching
   `CardCreatedEvent`. Assert the returned `awardedBadges` contains
   `{ key: 'tolkien', title: 'Sauron’s Favourite', awardedForDate: '2026-09-02' }`
   — this proves the live path awards it, and that `badgeTitle` resolves.
2. **Backfill from history.** Seed a *second* fixture user with a `2025-09-02`
   card and **no** badge rows (simulating a user who drew a card before the rule
   existed), run `recomputeUserGamification(userId)`, and assert
   `badgesInserted` contains `tolkien@2025-09-02`. This is the §5.2 claim, tested.
3. **Idempotence / fixed point.** Run the recompute a second time and assert
   `badgesInserted` is empty. The script already asserts this generally; assert it
   specifically after the new insert.
4. **The count and the dates the modal reads.** `getBadgeCounts` for a user with
   `2025-09-02` and `2026-09-02` cards returns
   `{ badgeKey: 'tolkien', count: 2, firstAwardedOn: '2025-09-02',
   lastAwardedOn: '2026-09-02' }`, **as `'YYYY-MM-DD'` strings, not `Date`s**.
   The script's own header calls the string-vs-Date failure *"the highest-risk
   failure in F9 (§13.14)"*, and D3 puts those two values on screen for the first
   time, so it now has a user-visible consequence.
5. **`--prune` is not exercised.** Deliberately. The existing prune coverage
   stays; nothing is added that would make pruning look like part of this
   feature's happy path.

### 8.3 `npm run test:layout`

§4.5's five assertions, at both viewports and both schemes. Kill anything on 3200
by pid first.

### 8.4 Manual passes no script can cover

1. **`/kitchen-sink/profile?state=full` at 375px, light and dark.** Tap every one
   of the fourteen rows. Every dialog opens, every one is legible, none overflows.
   The unearned art at `opacity-40` must still be visible in dark mode — this is
   the check that catches a medal that only reads on paper.
2. **Read the fourteen glosses out loud.** No exclamations is a script's job;
   whether "Somebody in Mordor presumably marked the date" is funny or smug is
   not. Read them against `reward-toast.tsx`'s "restraint is the spec" and
   `stats-grid.tsx`'s "its whole job is to be *not* a warning".
3. **iOS Safari, on a real phone.** Backdrop tap dismisses. Escape (external
   keyboard) dismisses. The shelf behind does not scroll under a touch-drag. The
   dialog does not jump when the URL bar collapses. This is the one claim in §4.2
   that is a reading of the spec rather than a measurement.
4. **VoiceOver.** Opening the dialog announces the badge title; swiping does not
   escape into the shelf behind; closing returns focus to the row that was tapped.
5. **Keyboard on desktop.** Tab reaches every badge row in shelf order. Enter
   opens. Tab inside the dialog cycles between the close button and nothing else.
   Escape closes. Focus is on the row again.
6. **Read `stats:recompute -- --all --dry-run` on production before running it
   for real.** §5.3. No script can do this and the whole safety of the backfill
   is in it.

---

## 9. Risks and open questions

**R1 — The bundle figures in D1 are an estimate, not a measurement.** ≈4.6 kB raw
and ≈1.4–1.6 kB Brotli were derived from character counts, not from a build. Run
`npm run build` and read the First Load JS for `/profile` before and after step 3,
and record both numbers in the commit. If `/today`'s figure moves at all,
something imported `badge-meta.ts` that should not have — that is the specific
regression D1 exists to prevent, and it is invisible without the reading.

**R2 — Scroll-lock behaviour behind a modal `<dialog>` was not tested on a real
device.** The HTML spec blocks the document behind a modal dialog, but whether a
touch-drag over an inner `overflow-y: auto` pane is blocked differs by engine and
version. The `:has()` rule in §4.3 is the deterministic belt; whether the braces
were needed at all is unverified. Manual pass §8.4.3 settles it.

**R3 — The estimated dialog height (≈434px at 375×667) is arithmetic, not a
measurement.** The `tolkien` gloss is the longest string in the set and is the one
that will overrun if anything does. The escape hatch handles it, but the escape
hatch is not the intended state on the design target. Measure at step 5, before
the shelf is wired.

**R4 — Facts in the `gloss` column need checking.** Tolkien's death date is
verified (2 September 1973, a Sunday, aged 81, Bournemouth — the Tolkien Society,
Britannica and Wikipedia agree). The others were written from memory and are
plausible but unverified: UNESCO's stated reasoning for 23 April and the
Julian/Gregorian gap between Shakespeare's and Cervantes' deaths; International
Women's Day's 1911 origin; Hari Ibu's link to the 1928 Indonesian Women's
Congress; the 1461-day figure for leap-day frequency (correct as 4×365+1, but it
elides the century rule and a pedant could object). Check them, or cut the
sentence. A wrong fact in an app about words is worse than a short gloss.

**R5 — "Sauron’s Favourite" is a recommendation on the user's own joke.** D8
changes their spelling ("Favorite" → "Favourite", for en-GB consistency), their
apostrophe (typographic, per `levels.ts`) and their key (`sauron` → `tolkien`).
Confirm before merge. The alternative title on offer is "The Professor’s Long
Defeat".

**R6 — The roadmap's badge table now has thirteen rows and the catalog has
fourteen.** `CLAUDE.md`'s authority order puts `ROADMAP_v0.1.0.md` above the
plans, and its Reconciliation Decisions say *"The level and badge tables in this
roadmap remain authoritative."* This plan does not contradict that table — it adds
to it, on a direct user request recorded in `plans/F11-F18-BRIEF.md` § "Where
these features came from", item 6. But leaving the roadmap at thirteen means the
next agent to read it will find the catalog "wrong" and may delete the badge.
**Recommendation: append the `tolkien` row to the roadmap's badge table and one
`[R22]` note recording that the fourteenth badge post-dates v0.1.0 and where it
came from.** Editing the roadmap needs the user's sign-off; do not do it silently.

**R7 — F12's art decisions may not match §4.4's requirements.** §4.4 was written
before F12's plan was read. Where the two disagree — dimensions, transparency
versus a self-carried paper plate, file format, exact path convention — **F12
wins**, and §4.4 is reconciled against it at step 11 rather than the other way
round. The one requirement worth defending is #4, one asset for both schemes: if
F12 concludes per-scheme versions are needed, the type and the component both
change. Everything else in this plan is independent of that outcome.

**R8 — `BadgeShelf` becoming a client component changes what `/profile` ships.**
It is used by both `src/app/(app)/profile/page.tsx` and
`src/app/kitchen-sink/profile/page.tsx`; both are server components and both pass
plain-JSON props, so neither needs restructuring. But the `"use client"`
boundary now sits above `BadgeRow`, `Eyebrow` and the metadata. Confirm with R1's
build reading that nothing else was dragged across, and confirm `import type` is
used for `EarnedBadge` — a value import of `earnedBadgeSchema` from a client
component is the 73 kB mistake `CLAUDE.md` documents.

**R9 — The backfill has not been run and its output has not been read.** Every
claim in §5.2 follows from reading `recompute.ts`, not from running it against
production data. The dry run in §5.3 is where that becomes knowledge, and it is a
gate, not a formality.

**R10 — Making rows tappable is itself a change to a screen whose restraint is
documented.** `/profile`'s docstring lists what is deliberately absent and the
shelf's lists three more. Nothing in this plan adds a counter, a nudge or a
progress indicator, and §8.4.2's read-aloud pass is the guard against one arriving
later disguised as copy.

---

Sources for the Tolkien date: the Tolkien Society, Britannica, Wikipedia, and
UPI's "On This Day" — all four agree on 2 September 1973, aged 81.
