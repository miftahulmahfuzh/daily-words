# F18 — Shared daily card, shared journal entry

Two more public pages on top of F16's share infrastructure. A user taps **Share**
on a daily card and gets a link that shows a stranger the six words of that day;
each row opens the word, and the word offers **Practise this word**, which is
F17's claim flow. A user taps **Share** on a journal entry and gets a link that
shows the line and its insight, ending in **Start your own journal** — a sign-up
funnel, not a claim.

The user's own words:

> "we should also support sharing a daily card. in the shared page version of
> daily card, viewers can also click the row to show the detailed vocab and click
> practise this word like [the share-vocab] flow."
>
> "we should also support sharing journal detailed page, the one which shows
> insight. maybe in the shared page version of it, viewers can click 'add your
> own journal' to bring him as a new user in our app"

**Supersedes:** `plans/F5-daily-card.md` §9's route map only, which lists no
owner-side view of a past card (§9's "Do not add anything else to `/today` that
consumes fixed vertical space" is **not** superseded and this plan obeys it —
see D3). Nothing in `plans/F10-journal.md` is superseded; §8.2's entry page gains
one control in its existing action row. `src/components/README.md`'s kit table
gains one additive prop and four new component rows (D9).

---

## 0. What this plan assumes from F16 and F17

**`plans/F16-share-infra.md` did not exist when this was written**; F15 and F16
were still being planned in parallel. **`plans/F17-share-claim.md` landed while
this plan was being written and §0's F17 block below is reconciled against the
real file, not against a guess.** Every remaining assumption is a place where a
different F16 decision should be a *find-and-replace in this plan*, not a
redesign. They are restated in §6 as risks with an owner.

### Assumed F16 surface

| Symbol | Assumed shape | If F16 differs |
|---|---|---|
| `shares` table | `id`, `slug` (unique, opaque, ≥128 bits of entropy), `user_id`, `kind`, target reference, `created_at`. Revoking is `DELETE`. | This plan adds **no columns**; see §2. |
| `shares.kind` | `'vocab' \| 'card' \| 'journal'` — F17 §0 states this union, so `'card'` and `'journal'` are already in F16's contract and F18 adds no value to it. **F18 uses `'vocab'`, never `'word'`.** | If F16 modelled kind as separate tables, F18's dispatch in D6 becomes three routes instead of one switch. |
| `src/app/(public)/s/[slug]/page.tsx` | The public route, a **sibling of `(app)`** inside a `(public)` route group. This is the path F17 §0 assumes; F18 matches it exactly so the two plans cannot disagree. | If F16 chose a bare `src/app/s/[slug]/`, every path in §3 loses one segment and nothing else changes. |
| A `src/middleware.ts` matcher exemption for the public prefix | `src/middleware.ts` today redirects **every** session-less request other than `/signin` to `/signin`. Without the exemption every share page in F16, F17 and F18 bounces to sign-in and none of the three features exists. F17 §4 flags this as F16's to own and says "verify before starting"; F18 repeats it. | Stop and report. |
| `src/lib/db/queries/shares.ts` → `resolveShare(slug)` | The sanctioned `userId`-less read, commented as such. F17 adds `getShareTargetForClaim` beside it as the second. | F18 adds three more sibling functions to the same file, under the same comment. |
| `src/lib/share/links.ts` → `shareUrl(slug)` | Absolute URL builder for a slug. | F18 extends this file; it does not create a second one. |
| `src/lib/share/metadata.ts` → a `generateMetadata` helper | Title/description/OG/`robots: noindex` in one place. | If F16 ships none, F18 creates it **at that path** and F16 adopts it. There must not be two conventions (D14). |
| `shares.owner_user_id` / `shares.entity_id` | F17 §5 names these columns. For `kind='card'`, `entity_id` is a `daily_cards.id`; for `kind='journal'`, a `journal_entries.id`. | — |
| `POST /api/shares` | `requireApiUser()` + `ok()`; body names a target; returns `{ slug, url }`; idempotent per `(owner_user_id, kind, entity_id)`. | Idempotency is load-bearing for D5 and D12; if F16 mints a new row per tap, see R4. |
| `npm run share:check` / `npm run share:db` | Offline and fixture-seeding check scripts. | F18 **extends both** rather than adding a third pair (§5). |
| Snapshot vs live | Unknown. F18 works either way; §1 D12 states what each costs and what F18 needs. | — |

### F17's real surface — read from `plans/F17-share-claim.md`, not assumed

F17 turned out to be shaped differently from the obvious guess, and the
difference matters to D11. The parts F18 touches:

| Symbol | What F17 actually built |
|---|---|
| `CLAIM_PATH` | The frozen literal `'/claim'`. **No parameters, ever.** F17 D2 removes an open-redirect class structurally by never concatenating a user-derived string into `redirectTo`, so a `?w=` on the claim URL is not available to F18 and asking for one would undo that decision. |
| `dw_claim` cookie | `HttpOnly`, `SameSite=Lax` (load-bearing across the Google return), `Path=/`, `Max-Age=600`, value `v1.<base64url(slug\|tz\|exp)>.<hmac-sha256 over AUTH_SECRET>`. **This is the payload carrier, and it is where F18's `position` has to go.** |
| `startShareClaim(slug, formData)` | `'use server'` in `src/lib/share/claim-actions.ts`. Sets the cookie, then either claims inline or `signIn('google', { redirectTo: CLAIM_PATH })`. |
| `finishShareClaim()` | Reads the cookie, calls `resolveAndClaim`, clears the cookie, redirects. |
| `resolveClaimOutcome(input)` | A **pure** total function in `src/lib/share/claim.ts`. Its input takes `sharerEntry` **already resolved**, which is the single property that makes D11 a small change. |
| `getShareTargetForClaim(slug)` | Added by F17 to F16's `queries/shares.ts`; returns the share row joined to the sharer's `vocab_entries` row, `null` for unknown/revoked, `entry: null` when the share resolves but the entry is gone. |
| `<PracticeThisWord slug term />` | `'use client'`, `src/components/share/practice-this-word.tsx`. Already carries a hidden `tz` input filled by `detectTimeZone()` on mount. |
| `vocab_entries.source` | Gains a third value `'shared'`, no migration. A word claimed from a **card** share is `'shared'` too — F18 introduces no fourth value. |
| Onboarding | F17 D4: the claim silently completes onboarding with five nulls, so a claimer never sees `/onboarding`. **This does not apply to F18's journal CTA**, which writes nothing — see D13. |
| Scripts | F17 added its own `claim:check` / `claim:db`. F18 still extends F16's `share:check` / `share:db` per the brief; it adds no third pair of its own. |

**F18 needs one change from F17.** It is stated plainly in **D11** and repeated in
§6 R1: the claim payload must carry `slug + position`, not `slug` alone.

---

## 1. Decisions

### D1 — A shared card is addressed by one slug; its six words are addressed by **position**, never by id

This is the plan's central decision.

`/s/<slug>` renders the card. Each row links to `/s/<slug>/<position>` where
`position ∈ 1..6` — a nested public route **under the same share row**. One tap
on Share mints exactly one `shares` row and exposes seven URLs.

What the slug authorises, exactly:

> The `daily_cards` row the share points at; its `card_date` and its `timezone`;
> and the `term`, `part_of_speech`, `pronunciation`, `definition` and `examples`
> of the at-most-six `vocab_entries` reachable by `daily_card_items.card_id =
> <that card> AND daily_card_items.position = <1..6>`.

It authorises nothing else: not the sharer's other words, not their other cards,
not their journal, not their profile, not their identity. The authorisation is
enforced structurally, not by a check that could be forgotten:

- **`position` is parsed before it reaches the database.** `src/lib/share/position.ts`
  exports `parseSharePosition(raw: string): number | null`, accepting exactly the
  strings `"1"`..`"6"` and rejecting `"0"`, `"7"`, `"-1"`, `"1.5"`, `"01"`,
  `"1e0"`, `""`, and anything uuid-shaped. A rejected position is `notFound()`,
  the same discipline as `/journal/[id]`'s `z.uuid().safeParse(id)` guard, which
  exists so "a malformed id must never reach the database".
- **The resolver takes `(slug, position)` and nothing else.** There is no function
  signature in the public path that can express a vocab uuid, so no caller can
  pass one by mistake.
- **No vocab uuid crosses the DTO boundary.** See D8, which is where this is
  actually at risk, and §5, where it is asserted mechanically.

Why not the alternatives:

- *In-place expansion (accordion) on one page.* Loses deep-linking, which the
  roadmap's "a real route, not a modal" rule exists to protect, loses per-word OG
  previews when a viewer forwards one word, and makes "practise this word" an
  ambiguous address. It would also put all six words' full enrichment payloads in
  the first paint whether or not anyone taps a row.
- *Six share rows, one per word.* Seven tokens to revoke instead of one, and it
  breaks [S3]'s "revoking is deleting the row" into "revoking is deleting seven
  rows and hoping".
- *A share slug plus a raw vocab uuid in the URL.* Rejected outright: it turns a
  card share into a capability to *name* a word, and the only thing standing
  between that and reading arbitrary words is a join the next refactor can drop.
  A bounded index into a specific card cannot be pointed anywhere.

### D2 — Past cards are shareable, and this plan gives the app its first past-card view

`/calendar` today has no destination for a past card. `month-view.tsx` says so
in a comment:

> "The only cell that is ever a link. There is no /calendar/[date] route in the
> roadmap's route map, so every other day is a mark rather than a destination."

A past card is the more interesting thing to share — it is a record of a day that
happened, which is exactly what [R1] protects — and the app currently cannot
display one. F18 adds `src/app/(app)/card/[date]/page.tsx`: a `Screen` with no
tabs, a `BackLink` to `/calendar`, the same `DailyCard` component, the date, and a
full-size **Share** `Button`.

It is deliberately a **scrolling** screen (`ScreenBody scroll`). That puts it
outside the no-scroll budget entirely, so it needs no new layout assertions and
cannot regress the 18 that exist, and its Share control can be a proper 44px
`Button` rather than the compressed pill `/today` requires (D3).

`month-view.tsx` changes by one expression: `today_card` keeps its existing
`/today` href (no regression), and a past `card` day gets
`cardPermalinkHref(day.date)`. `CalendarCell` already refuses `href` unless
`mark === "made"`, so nothing else needs guarding.

The `[date]` param is validated with a `/^\d{4}-\d{2}-\d{2}$/` test **before**
anything calls `parseLocalDate`, which throws `Not a LocalDate` and would turn a
typo in the URL bar into a 500 where the honest answer is a 404. A well-formed
date with no card is also `notFound()`.

### D3 — On `/today`, Share goes in the header's `trailing` slot, at the streak pill's height, costing zero vertical pixels

F5 §9 is explicit: *"Do not add anything else to `/today` that consumes fixed
vertical space."* `ScreenHeader` is `flex items-baseline justify-between gap-3`
and its `trailing` slot already holds F9's 32px streak pill inside a measured
70.4px header. F18 passes a fragment holding both:

```
trailing={<div className="flex items-baseline gap-2">{streakPill}<ShareCardButton …/></div>}
```

The Share control is a `Pill`-shaped `<button>` with `min-h-[32px]` and
`text-mono-xs` — **the same height as the streak pill beside it**. Vertical cost:
zero. The 70.4px header stays 70.4px, the card keeps its 402.8px and the rows
keep their 65.6px.

Two honest caveats, both of which become assertions in §5:

1. **32px is below `LAYOUT.touchMin` (44).** This is not a new deviation: F9's
   streak pill on this exact row already ships at `min-h-[32px]`. F18 follows the
   established precedent on the established row rather than making the header
   taller, and widens the tap area horizontally (`px-3.5`) instead. Recorded here
   so it is a decision rather than an oversight.
2. **The header must not wrap.** At 375px the content box is 331px: the h1
   "Today's card" at `text-2xl`, plus `gap-3`, plus "365 day run", plus "Share".
   This is a measurement, not a guarantee, and the existing spec would *not*
   catch a wrap — a two-line header costs each row ~4.8px and 60.8px still clears
   the 52px floor, so all 18 assertions would stay green while the screen got
   visibly worse. §5 adds an explicit single-row assertion for this reason.

**If the single-row assertion cannot be met** at 375px with a three-digit streak,
the fallback is one line and costs nothing: drop `/today`'s control and make the
existing date `Eyebrow` a `Link` to `cardPermalinkHref(today)`, where D2's
full-size Share button already lives. Take the fallback rather than shrinking the
title or truncating the streak.

### D4 — The Share control is a two-state copy button, not a sheet and not a route

There is no modal anywhere in this app — `src/components/README.md` records that
as the user's own ruling on the roadmap's open question #1, and `ConfirmSheet`
was deleted from scope because of it. So the Share affordance cannot open a
sheet.

`ShareButton` (client) is one tap: `POST /api/shares` → `navigator.clipboard.writeText(url)`
→ the label flips to `Link copied` for 5s and back, with the same self-disarming
`setTimeout` shape as `DeleteButton` in `journal/[id]/entry-view.tsx`. Where
`navigator.share` exists it is preferred and the clipboard is the fallback; where
neither exists the URL is rendered inline in a `Meta` line so it can be selected
by hand. Failure is one muted line, never a thrown error.

### D5 — Tapping Share twice returns the same link

`POST /api/shares` is assumed idempotent per `(user_id, kind, target)` (§0). This
matters more here than for a word: a user who shares the same card to two chats
must not create two revocation problems, and D12's snapshot case depends on a
second tap **updating** rather than minting.

### D6 — `/s/[slug]/page.tsx` dispatches on `kind`; F18 does not add a second public entry route

F16 owns that file and renders the shared *word*. F18's edit is a switch:

```
vocab   → F16's SharedWordView   (untouched; it is where F17's <PracticeThisWord> lives)
card    → SharedCardView         (F18)
journal → SharedJournalView      (F18)
```

One route, one resolver, one `generateMetadata`, one 404 path, one revocation
path. The nested `/s/[slug]/[position]` route is the only new public segment, and
it `notFound()`s unless `share.kind === 'card'`.

### D7 — The date on a shared card is the sharer's day, rendered without a timezone conversion; `daily_cards.timezone` is used for the *freshness* line only

`daily_cards.card_date` is already a `LocalDate` — a `'YYYY-MM-DD'` string
computed in the sharer's zone at creation, per `POST /api/cards`, which refuses
with 409 rather than date a card by guesswork. It is not an instant and it has no
offset. So the correct rendering for a viewer anywhere on earth is
`formatLocalDateLong(card.cardDate)` from `lib/time/local-date.ts`, which
formats through `Intl` **pinned to UTC on purpose** so that "the weekday and month
are properties of the local calendar date, not of the machine reading it".

A viewer in Los Angeles and a viewer in Jakarta therefore see the same string:
`9 August 2026`. There is no conversion, no `Date` constructed from the card, and
**no new `toISOString` hit** — `grep -rn toISOString src/` currently returns eight
files and F18 adds none.

The public card page never says "Today". "Today" is the viewer's word for the
viewer's day, and the card is the sharer's day.

Where `daily_cards.timezone` earns its keep is the one question that genuinely
needs the sharer's clock: *how old is this card?* The optional freshness line is

```
diffLocalDays(card.cardDate, localDateNow(card.timezone ?? DEFAULT_TIMEZONE))
```

→ `today` / `yesterday` / `N days ago`, both helpers from `lib/time/local-date.ts`.
`timezone` is nullable — "Null on any row written before F5" — so the fallback is
`DEFAULT_TIMEZONE`, matching `resolveTimezone()`'s rule that **reads may fall
back and writes may not**. The fallback applies to the freshness word only; the
date itself needs no zone and never falls back to anything.

The journal entry has no such column: `journal_entries` stores only `created_at`,
and `toJournalEntryDto` takes the *reader's* profile timezone. On a public page
the reader is a stranger, so the day must come from the **owner's** zone. See D10.

### D8 — Neither `toDailyCardItemView` nor `toJournalEntryDto` may be reused on a public page

This is the concrete leak, and it is one import away in both cases.

- `toDailyCardItemView` returns `{ id: item.entryId, … }` — its own comment says
  `id` "is the **vocab entry** id, because that is what the row links to". Ship
  that DTO to a stranger and the share slug has just handed out six real vocab
  uuids.
- `toJournalEntryDto` returns `id` (the entry uuid), `sourceNote`, `createdAt`,
  `updatedAt` and `edited`. Ship that and the share leaks the private note (D10)
  and the row id.

F18 therefore writes two public serialisers with **closed** output shapes, in
`src/lib/share/card-dto.ts` and `src/lib/share/journal-dto.ts`. The allowlist,
per F16's rule — every field that crosses, and nothing else can:

**`PublicCardDto`**

| Field | Source | Why it may cross |
|---|---|---|
| `cardDate` | `daily_cards.card_date` | The day being shared. A `LocalDate` string, no offset. |
| `dateLabel` | `formatLocalDateLong(cardDate)` | Precomputed on the server so the client does no date work at all. |
| `freshness` | D7 | `'today' \| 'yesterday' \| { daysAgo: number }` — a bounded shape, never a raw timestamp. |
| `words[]` | `daily_card_items` ⋈ `vocab_entries` | The six rows. |
| `words[].position` | `daily_card_items.position` | 1..6. The **only** address a word has on a public page. |
| `words[].term` | `vocab_entries.term` | The word. |
| `words[].tag` | `partOfSpeechTag(part_of_speech)` | The existing display tag, not the raw column. |
| `words[].definition` | `vocab_entries.definition` when `enrichment_status = 'ready'`, else `null` | Same rule `toDailyCardItemView` applies; a pending word draws the skeleton. |

**`PublicCardWordDto`** (the `/s/<slug>/<position>` page) adds `pronunciation`
and `examples` and nothing else.

**`PublicJournalDto`**

| Field | Source | Why it may cross |
|---|---|---|
| `text` | `journal_entries.text` | The line. It is the thing being shared. |
| `dateLabel` | `formatLocalDateShort(toLocalDate(created_at, ownerTz))` | The day it was kept, in the owner's zone (D10). |
| `insight` | `journal_entries.insight`, only when the wire status is `ready` | D9. |

Explicitly **not** crossing, in either DTO: every uuid (`vocab_entries.id`,
`daily_cards.id`, `daily_card_items.id`, `journal_entries.id`, `user_id`), the
owner's name, email, avatar or profile, `source_note`, `created_at`,
`updated_at`, `edited`, `insight_status`, `insight_requested_at`,
`enrichment_status`, `enrichment_error`, `suggested_correction`,
`last_shown_on`, `status`/`mastered_at`, `source`, and the sharer's timezone
string. `words[].id` does not exist; `SharedCardView` keys its rows on
`position`.

§5 asserts this mechanically rather than by review: the check script deep-walks
each DTO and fails on any uuid-shaped string and on any key not in the allowlist.

### D9 — The insight **is** shared, and the viewer is told a machine wrote it

The case against sharing it is real and worth stating. The insight is
model-generated prose about a line the user found meaningful; it is the most
personal-adjacent thing in the app, it is not the user's own voice, and a stranger
who reads a shared page naturally attributes everything on it to the person who
sent the link. If the model got the line wrong, the sharer wears it.

The case for wins on three counts:

1. **The user asked for exactly this**: "sharing journal detailed page, **the one
   which shows insight**". The insight is the thing they want to show.
2. Without it the page is a bare quotation with nothing to explain why anyone
   should sign up, and D13's whole funnel has no reason to exist.
3. **The attribution problem is already solved and already shipped.**
   `InsightPanel` ends with a line the design specified verbatim and the component
   comment defends: *"Written by the machine. Keep or discard."*, described in
   that file as "the app being honest about where the paragraph came from, which
   matters more here than anywhere else in the app: everything else on this screen
   is the user's own." That sentence was written for the owner's screen; it is
   even more true on a stranger's.

So: `SharedJournalView` **reuses `InsightPanel` unchanged**, and reuses it
specifically so the honesty line cannot be dropped by a public-page rewrite. No
prop is added to it, no copy is changed, and the frozen kit contract is untouched
for this component.

The insight renders only when the wire status is `ready` and the stored JSON
parses — the same `parseStoredInsight` / `wireStatus` defensiveness
`lib/journal/serialize.ts` already applies, which also means a `pending` or
`failed` entry shares cleanly as a bare line rather than showing a stranger a
"Try again" button they cannot press. The public page renders **no** insight
controls at all: no ask button, no retry, no failure copy.

### D10 — `source_note` is private and does not cross

Default no, and the argument for yes did not win.

`source_note` is the user's own note about where they met the line — "in Ibu's
kitchen", "the letter from R.", "Pak Anwar said it at the funeral". It is a note
about the *user's life*, not about the line, and it is the field most likely to
name a third party or a place. F10's own edit rule is evidence of the split:
`updateEntry` clears the insight when the text changes but **preserves it when
only the source note changes**, on the reasoning that "the note is not part of
what was explained". If the note is not part of what was explained, it is not
part of what is shared either.

The argument for including it — attribution, so that sharing "It was the best of
times" without "Dickens, *A Tale of Two Cities*" reads as plagiarism — is a good
one. It loses because the same field carries both citations and confidences, and
nothing in the schema tells them apart. The escape hatch already exists and costs
the user one gesture: `text` is the field the design gives the whole screen to,
it is `whitespace-pre-wrap`, and a citation typed into it is shared.

Recorded as an open question in §6 (Q1) with the sharer-facing consequence
stated, because it is the decision most likely to be revisited.

### D11 — "Practise this word" hands F17 `slug + position` — **a change F17 must accept**

F17's contract is slug-only, because F16's shared page is one slug and one word:
`getShareTargetForClaim(slug)` joins "the share row … to the sharer's own
`vocab_entries` row". A card share breaks that assumption — **the slug identifies
a card, not a word** — and there are six candidate rows behind it.

The obvious fix is not available. F17 D2 froze `CLAIM_PATH` to the literal
`'/claim'` and states that "no user-derived string is ever concatenated into
`redirectTo`, anywhere", explicitly rejecting "a `?slug=` query param on
`redirectTo` (data in an open-redirect-shaped position, for no gain)". A `?w=`
would be the same thing wearing a different name. **The position must ride in the
`dw_claim` cookie, where the slug already rides.**

The exact ask, in six parts, all inside files F17 already owns:

1. **`ClaimIntent`** in `src/lib/share/claim.ts` gains `w: number | null`,
   validated by `parseSharePosition` from `src/lib/share/position.ts` (F18 §3).
2. **The cookie payload** becomes `v1.<base64url(slug|w|tz|exp)>.<hmac>`, with
   `w` empty for `kind='vocab'`. `decodeClaimCookie` rejects a `w` that is not
   `''` or `"1".."6"` with the same finality it rejects a bad slug charset.
   `CLAIM_PATH`, `redirectTo`, the HMAC, `SameSite=Lax` and `Max-Age` are all
   **unchanged**; F17 D2's structural anti-open-redirect argument is untouched
   and in fact reinforced, because the position never appears in a URL either.
3. **`startShareClaim(slug, formData)`** reads a hidden `w` input from the same
   form that already carries the hidden `tz` — no signature change if it prefers,
   since `formData` is already a parameter.
4. **`getShareTargetForClaim(slug)`** becomes `getShareTargetForClaim(slug, w)`.
   For `kind='vocab'` it behaves exactly as it does today. For `kind='card'` it
   joins `daily_card_items ON (card_id = shares.entity_id AND position = $2)`
   then `vocab_entries` — an index-only step on
   `daily_card_items_card_position_uniq`. **The return shape does not change.**
5. **`resolveClaimOutcome` does not change at all.** Its input already takes
   `sharerEntry` pre-resolved, so every row of F17 §5's outcome table survives
   verbatim. Two consequences worth writing down:
   - `w` missing on a `card` share, `w` present on a `vocab` share, and `w`
     naming a position a short card does not have all resolve to `entry: null`
     and therefore to F17's existing **zero-write** `expired` / `gone` outcomes.
     F18 asks for **no new outcome**.
   - `gone` is effectively unreachable for a card share: `daily_card_items.vocab_entry_id`
     is `ON DELETE RESTRICT` per [R1], so the sharer cannot delete a word that is
     on a card. A card share is the *most* durable share in the app.
6. **`<PracticeThisWord>`** gains `position?: number`, rendered as a second hidden
   input beside `tz`. F16's word page passes nothing and is unchanged.

**No vocab uuid ever crosses the wire**, which is the same principle F17 D1
already argues for the slug: an id "would mean the claim endpoint accepts 'add
the word with this id to my collection' — which is a general-purpose read oracle
over every user's collection". A bounded index into a named card is strictly
safer than a uuid, and it is safer than the slug alone is for a word, because it
cannot be pointed anywhere the slug does not already reach.

What F17 does with the resolved word is F17's and this plan does not redesign it.
F18 depends on exactly two properties: the claimer gets **their own**
`vocab_entries` row with `source: 'shared'` (so `UNIQUE (user_id, lower(term))`
and F14's duplicate shape both apply normally), and the sharer's row is not
mutated by a stranger's tap.

### D12 — Journal shares must read **live**, whatever F16 chose for words

Trace the hazard the user asked about.

Under a **live** read there is no hazard. `updateEntry` nulls `insight`,
`insight_status` and `insight_requested_at` in the *same UPDATE* that writes the
new text, "so two devices editing at once cannot both decide the text was
unchanged and leave a stale insight behind". The row can therefore never hold text
A with an insight about text A′, and a live public read inherits that atomicity
for free. `completeInsight` and `failInsight` both match on `text = $textAtRequest`,
so an edit landing mid-flight discards the insight rather than attaching it. The
only remaining exposure is *caching*, and the fix is the one `/today` already
uses: `export const dynamic = "force-dynamic"` on the public routes, plus
`noStore()` on any route handler that serves share data. Stale-but-consistent is
tolerable; contradictory is not, and force-dynamic removes even the first.

Under a **snapshot** the hazard is real: a snapshot taken at T1 holds text A and
its insight; the owner replaces the text at T2; the live row is clean but a public
URL still serves a paragraph about a line the owner deleted. That is worse than a
stale word definition, because the journal is the one entity in the app with a
documented rule that editing the text *destroys* the derived text.

So F18's position, stated as an ask on F16:

- **Journal shares are live.** If F16 chose live for everything, nothing to do.
- If F16 chose snapshots for everything, then `PATCH /api/journal/[id]` must
  **delete the entry's `shares` rows whenever the text actually changed** —
  revoke-on-edit, in the same statement that already computes `textChanged`. That
  hook is F18's to write and F16's `shares` table to be deleted from. A source-note
  edit revokes nothing, mirroring the insight rule exactly.
- If F16 chose snapshots and F18 must snapshot too, the journal snapshot captures
  `{ text, insight, dateLabel }` and **not** `sourceNote`, and a second Share tap
  **refreshes the existing row in place** (D5) rather than minting a second slug.
- For cards under snapshot: the snapshot must capture `card_date`, `timezone`,
  and per position `{ term, partOfSpeech, definition, pronunciation, examples }`
  — the *word-detail* fields too, or `/s/<slug>/<position>` has to read live
  anyway and the snapshot has bought nothing.

### D13 — "Start your own journal" is a sign-up funnel, not a claim, and deliberately does **not** enter F17's claim machinery

Nothing is copied into anyone's collection, so this is not F17's flow. The
differences worth naming:

| | F17's claim | F18's journal CTA |
|---|---|---|
| Server effect after auth | Creates a `vocab_entries` row | **None** |
| Failure modes | `expired`, `gone`, `over_limit`, `already_have`, `write_failed`, `no_timezone` | None |
| Onboarding | Silently completed with five nulls (F17 D4), because a pending write would otherwise be lost | **Run in full.** There is no pending write to lose. |
| Payload across OAuth | Signed `dw_claim` cookie carrying a slug | A destination, and only a destination |
| Lands on | `vocabChatHref(newEntryId)` | `/journal` |

The important negative: **F18 does not add a `journal_compose` variant to
`ClaimIntent`.** F17's cookie exists to carry a *pending write* across a redirect
and its whole state machine is about deciding whether that write may happen; a
destination with no write does not belong in it, and F17 D3's own reasoning —
"a user who abandons at the Google consent screen and later signs in from
`/signin` must **not** be silently claimed" — argues the same way from the other
side. Two intents in one cookie would mean `/claim` has to branch on a kind that
never claims anything.

What F18 builds instead, in ascending order of what it touches:

1. **`startJournalSignup()`** — `'use server'`, one line:
   `signIn('google', { redirectTo: '/journal' })`. `'/journal'` is a **frozen
   literal**, not a user-derived string, so F17 D2's structural rule holds. This
   alone fully solves the case of an existing Daily Words user who taps the CTA:
   they land on their own journal.
2. **`dw_next`, for the brand-new user only.** `(app)/layout.tsx` sends anyone
   with a null `onboarded_at` to `/onboarding`, so a first-time signer-up would
   otherwise finish onboarding and land on `/today` — the home screen of an app
   they came to for journalling, showing "No words yet." So F18 sets a second
   cookie whose value space is **one symbol**: `dw_next=journal`. It is read in
   exactly one place, the redirect that ends onboarding, and mapped through a
   literal `switch` to `/journal`. No path is ever taken from the cookie; the
   cookie selects between hard-coded destinations. It reuses F17's
   `claim-cookie.ts` primitives (`HttpOnly`, `SameSite=Lax`, `Path=/`,
   `Max-Age`, HMAC over `AUTH_SECRET`) rather than inventing a second cookie
   discipline, and is cleared when consumed.

**If touching the end of onboarding is contested** — F17 §4 lists
`src/app/onboarding/page.tsx` under "Explicitly NOT modified", though its
objection is specifically to a `?next=` parameter, which this is not — then ship
step 1 alone and accept `/today` as the new user's landing. The feature
degrades; it does not break. Say so rather than negotiating a `?next=`.

**The composer is not prefilled with the shared line**, and there is no
`?compose=1`. Prefilling would put somebody else's sentence into a new user's
journal as the default action, which is wrong on its own terms and would
manufacture the exact collision D15 discusses. The composer is already a
permanent field at the top of `/journal` that re-focuses itself after a save, so
landing there *is* the call to action. The CTA reads *Start your own journal*,
and it means it.

### D14 — `generateMetadata` follows F16's convention; F18 invents nothing

A card link pasted into WhatsApp must not preview as "Daily Words" — that is the
`metadata` export in `src/app/layout.tsx`, and every route in this app currently
inherits it because **no `generateMetadata` exists anywhere in `src/app`**. F16
establishes the convention; F18 calls the same helper from three routes.

What F18 supplies to it:

| Route | Title | Description | Image |
|---|---|---|---|
| `(public)/s/<slug>` (card) | `Six words — 9 August 2026` | The first three terms, comma-separated | F16's |
| `(public)/s/<slug>/<n>` | `<term> — Daily Words` | The `definition` when ready, else the app's default | F16's |
| `(public)/s/<slug>` (journal) | The line, clipped to ~60 chars on a word boundary | The line, clipped to ~160 chars | F16's |

Three rules F18 adds to whatever F16 built:

1. **The journal OG description is the line, never the insight.** A machine-written
   paragraph in a preview card, under a person's link, with no room for the
   "Written by the machine" line, is precisely the misattribution D9 spent its
   argument avoiding.
2. **`source_note` never appears in metadata** (D10 applies to `<meta>` tags too).
3. **`robots: { index: false, follow: false }` on every share route.** [S3] makes
   slugs unguessable, but a link pasted somewhere public is crawlable, and an
   indexed share page is a share the user cannot revoke by deleting a row.

A revoked or unknown slug returns `notFound()` from `generateMetadata` as well as
from the page, so a dead link previews as nothing rather than as the app.

### D15 — F15 interaction: the near-duplicate warning must be scoped to the signer-up's own collection

A stranger reads a shared line, signs up through D13, and immediately saves that
same line. That is F15's exact warned-about case, and the behaviour splits:

- **Correct:** they save it, and later save it *again* themselves — F15 warns,
  because both rows are theirs. Nice touch, working as designed.
- **Bug:** F15 warns on the very first save because it found the *sharer's*
  entry. That would (a) be nonsense to the new user, (b) tell them a stranger has
  the same line, and (c) be a cross-user read of journal content from a code path
  that has no business doing one.

**I cannot confirm F15's check is scoped, because `plans/F15-journal-dedup.md`
did not exist when this was written.** What I can say is that the whole existing
convention points the right way — every function in `lib/db/queries/*.ts` takes
`userId` as its first parameter and puts it in the WHERE clause, and
`lib/db/queries/journal.ts` opens by explaining that this is so "an ownership
check cannot be forgotten in one place and remembered in another" — and that a
pgvector nearest-neighbour query is the single most tempting shape in the codebase
to write unscoped, because `ORDER BY embedding <=> $1 LIMIT 5` is a complete,
working, wrong query.

So F18 asserts it from the outside instead of asking. §5's `share:db` seeds two
users, shares user A's entry, has user B save the identical text, and asserts
**no** near-duplicate warning. If F15 has not landed, the assertion prints
`skipped: F15 not present` and exits 0. This is stated as R2 in §6 with F15 named
as the owner.

### D16 — Public pages get a different vertical budget from `/today`, and say so structurally

`/today`'s six rows are `flex: 1 1 0` inside a `flex-1` card inside a
non-scrolling pane; that is [R19]'s structural no-scroll guarantee and it only
works because the pane has a bounded height. A public page has **no tab bar**
(+61px), **no day strip** (+91.8px), a `BackLink` or nothing instead of the
70.4px header, and a CTA block at the bottom — and it is allowed to scroll.

So `SharedCardView`:

- is `Screen` (**no** `tabs` — `TabBar` is for the four app tabs and a stranger has
  no session) wrapping `ScreenBody scroll`;
- renders `DailyCard` with `className="min-h-[396px] flex-none"`. `flex-none` and
  `flex-1` are the same `tailwind-merge` group, so this genuinely replaces the
  card's `flex-1` rather than sitting beside it — inside a scroll container
  `flex-1` against `min-h-0` gives rows their content height, which is
  unpredictable, and `min-h-[396px]` restores a deterministic ~65px per row;
- puts the CTA **below** the card in normal flow. Never `position: fixed`: the
  README allows exactly one fixed element in the app (`RewardToast`) and only
  because it contributes zero layout height.

`SharedJournalView` reuses `/journal/[id]`'s exact shape — `ScreenBody scroll
padded={false} className="px-6 pb-7"`, the `text-2xl` `whitespace-pre-wrap`
paragraph, the `Eyebrow` meta line, the hairline, `InsightPanel` — minus Edit,
Delete and the insight controls, plus the CTA. It introduces no new colour, type
size or radius, per the kit contract.

`src/components/README.md` gains the four new components and the one additive
prop (D17), following the precedent set when "`TextArea` gained a `ref` prop
declaration — the only change to a kit component, additive".

### D17 — `DailyCard` gains one optional prop rather than the public page forking the row

`DailyCardRow` hardcodes `href={vocabDetailHref(item.id)}`. The public card
cannot use that — the id is the sharer's and the route is inside `(app)`.

Three options: fork the row (two components that will drift, and the layout spec
measures `data-testid="daily-card-row"` on only one of them); put `href` on
`DailyCardItemView` (touches `@/lib/ui/types` and every caller); or add one
optional prop. F18 takes the third:

```
DailyCard  { …, hrefFor?: (item, index) => string }
DailyCardRow { …, href?: string }   // defaults to vocabDetailHref(item.id)
```

Additive, defaulted, and it keeps one row component so `/today` and the public
card cannot drift visually and the existing spec keeps covering both.

Belt and braces, because a default that reads `item.id` is exactly how a uuid
escapes: the public page passes `items` whose `id` is the **synthetic string
`"p1"`..`"p6"`**, used only as the React key. Even if `hrefFor` were dropped in a
refactor, the worst outcome is a broken link to `/vocab/p3`, not a leaked uuid.
§5 asserts that no uuid-shaped string appears anywhere in the public card page's
serialised props.

### D18 — Ownership and revocation are visible to the owner

`/card/[date]` and `/journal/[id]`, once shared, show a `Meta` line —
`Shared · Copy link · Stop sharing` — where *Stop sharing* is a two-tap armed
control (the `DeleteButton` / `ToggleRow` pattern) that `DELETE`s the share row.
[S3] says revoking is deleting the row; a user who cannot find the row cannot
revoke. This is small and it is the difference between "sharing is opt-in" and
"sharing is opt-in and reversible".

---

## 2. Schema changes

**None. No migration.**

Everything F18 renders already exists:

- `daily_cards.card_date` is the shared day, and `daily_cards.timezone` — added by
  F5 as "additive, nullable, and worth its keep" — is what makes the freshness
  line in D7 answerable without guessing.
- `daily_card_items.position` is "1-based and contiguous, by contract" (asserted
  by `daily_card_items_card_position_uniq`), which is what makes D1's positional
  addressing safe rather than approximate.
- `daily_card_items.vocab_entry_id` is `ON DELETE RESTRICT` per [R1], so a shared
  card can never develop a hole. `readCardItems`'s inner join degrades to a
  five-row card rather than a 500 if the impossible happens.
- `journal_entries` already holds `text`, `insight` and `insight_status`.

The `shares` table is **F16's**, and F18 adds no column to it. The one place that
tempts a column is the journal's owner timezone (D10/§3 `getSharedJournalEntry`),
solved by joining `profiles` inside the sanctioned resolver instead. If F16
objects to that join, the alternative is a single nullable `shares.timezone`
written at creation — stated as R5, and it is F16's call, not F18's.

No index is needed. `daily_card_items_card_position_uniq` already serves
`(card_id, position)` exactly, which is D1's lookup.

---

## 3. Files

Paths marked † assume F16's layout from §0.

### Created

| File | Why |
|---|---|
| `src/lib/share/position.ts` | `parseSharePosition()` — the 1..6 boundary that makes D1 structural. Pure, no imports, testable offline. |
| `src/lib/share/card-dto.ts` | `toPublicCardDto()` / `toPublicCardWordDto()` and their exported key allowlists. The closed shapes D8 requires; **must not import `lib/cards/serialize.ts`**. |
| `src/lib/share/journal-dto.ts` | `toPublicJournalDto()` and its allowlist. **Must not import `lib/journal/serialize.ts`** — `toJournalEntryDto` returns `id` and `sourceNote`. |
| `src/components/share/shared-card-view.tsx` | The public card: date, freshness, `DailyCard` with `hrefFor`, CTA. Server component. |
| `src/components/share/shared-card-word-view.tsx` | One word of a shared card, plus the F17 CTA. Shares its shape with F16's `SharedWordView`; if F16 exports that component with a CTA slot, use it instead of this file. |
| `src/components/share/shared-journal-view.tsx` | The line, the meta date, `InsightPanel` unchanged, the D13 CTA. |
| `src/components/share/share-button.tsx` | `'use client'`. D4's one-tap copy control, in the two sizes D3 and D2 need (`pill` for `/today`'s header, `md` `Button` elsewhere). Also renders D18's *Stop sharing*. Sits beside F17's `practice-this-word.tsx` in the same directory. |
| `src/components/share/start-your-own-journal.tsx` | `'use client'`. D13's CTA: a form posting to `startJournalSignup`, with `useFormStatus` pending copy matching `signin/sign-in-button.tsx` and F17's `PracticeThisWord`, so all three screens speak the same sentence. |
| `src/lib/share/journal-signup-actions.ts` | `'use server'`. `startJournalSignup()` — D13 step 1, plus the `dw_next` set. Deliberately **not** in F17's `claim-actions.ts`: nothing here claims anything. |
| `src/app/(public)/s/[slug]/[position]/page.tsx` † | The nested public word route. `notFound()` unless `kind === 'card'` and `parseSharePosition` succeeds. `generateMetadata` per D14. Renders F17's `<PracticeThisWord slug position term />`. |
| `src/app/(app)/card/[date]/page.tsx` | D2's owner-side past-card view. Validates the date with a regex before `parseLocalDate`. |
| `src/app/kitchen-sink/share/page.tsx` | Session-free fixtures for the three public views, so §5's layout assertions can run and so the pages are reviewable at 375px in both schemes, matching `/kitchen-sink/today` and `/kitchen-sink/journal`. |

### Modified

| File | Change |
|---|---|
| `src/app/(public)/s/[slug]/page.tsx` † | D6's `switch (share.kind)`. F16's `vocab` branch, and the `<PracticeThisWord>` F17 puts in it, untouched. |
| `src/lib/db/queries/shares.ts` † | Add `getSharedCard(slug)`, `getSharedCardWord(slug, position)`, `getSharedJournalEntry(slug)` under F16's existing "sanctioned `userId`-less read" comment — the third, fourth and fifth such reads after F16's `resolveShare` and F17's `getShareTargetForClaim`. Also **widen `getShareTargetForClaim(slug)` to `(slug, w)`** per D11. `getSharedJournalEntry` joins `profiles` for the owner's zone (§2). |
| `src/lib/share/claim.ts` (F17's) | D11 parts 1–2: `ClaimIntent.w`, and `parseSharePosition` in the decode path. Pure, and covered by F17's `claim:check`. |
| `src/lib/share/claim-cookie.ts` (F17's) | D11 part 2: `slug\|w\|tz\|exp`. The HMAC, `exp`, charset cap and constant-time compare are unchanged. |
| `src/lib/share/claim-actions.ts` (F17's) | D11 part 3: read the hidden `w` from `formData`. |
| `src/components/share/practice-this-word.tsx` (F17's) | D11 part 6: optional `position`, one hidden input. |
| `src/lib/share/links.ts` † | Add `sharedCardWordHref(slug, position)` and `cardPermalinkHref(date)`. **No `claimHref`** — F17 D2 froze `CLAIM_PATH` and the claim carries no URL data. No template literal for a share URL is written anywhere else, the same rule `lib/vocab/links.ts` states for `/vocab/[id]`. |
| `src/lib/share/metadata.ts` † | Add the three title/description builders of D14. If F16 shipped no such file, create it here and tell F16. |
| `src/components/daily/daily-card.tsx` | D17's optional `hrefFor`. |
| `src/components/daily/daily-card-row.tsx` | D17's optional `href`, defaulting to `vocabDetailHref(item.id)`. |
| `src/app/(app)/today/page.tsx` | D3: wrap the streak pill and `ShareButton` in one `trailing` fragment. Needs today's `card.id`/`cardDate`, both already in scope. |
| `src/app/(app)/calendar/month-view.tsx` | D2: past `card` days get `cardPermalinkHref(day.date)`; `today_card` keeps `/today`. Update the comment that says no such route exists. |
| `src/app/(app)/journal/[id]/entry-view.tsx` | Add `ShareButton` to the existing Edit / Delete action row, and D18's *Stop sharing* beside it. |
| `src/app/api/journal/[id]/route.ts` | **Only if F16 chose snapshots** — D12's revoke-on-edit hook, in the branch that already knows the text changed. |
| `src/app/onboarding/…`'s completion redirect | **Only for D13 step 2** — read and clear `dw_next`, map it through a literal `switch`. If this is contested, drop it and take D13's stated degradation. |
| `src/app/kitchen-sink/today/page.tsx` | Render the Share control by default so the existing 18 assertions measure the real header, plus a `streak=` param so §5 can drive the three-digit worst case. |
| `tests/e2e/no-scroll.spec.ts` | Two new cases (§5). |
| `scripts/check-share.ts` † | The offline assertions of §5. |
| `scripts/check-share-db.ts` † | The fixture assertions of §5. |
| `src/components/README.md` | Record `hrefFor` as the second additive kit change, and add the four `components/share/*` rows. |
| `CLAUDE.md` | One line under Conventions: the public DTO rule (D8) — public pages never reuse `lib/cards/serialize.ts` or `lib/journal/serialize.ts`. |

**No new `package.json` scripts.** F16 owns `share:check` and `share:db`; F18
extends both, per the brief's "extend rather than adding a third pair".

---

## 4. Implementation order

Each step ends with `npm run typecheck && npm run lint && npm run build` passing.
Steps 1–3 are pure and can land before F16 does.

**Step 1 — the boundary, alone.**
`src/lib/share/position.ts`. Add its cases to `scripts/check-share.ts` (or, if
F16 has not landed, to a temporary block that moves into that file in step 4).
This is the smallest possible commit and it is the security-relevant one.

**Step 2 — the public DTOs.**
`card-dto.ts` and `journal-dto.ts`, with exported `PUBLIC_CARD_KEYS`,
`PUBLIC_CARD_WORD_KEYS`, `PUBLIC_JOURNAL_KEYS` arrays so the allowlist is a value
the check script reads rather than a comment. Timezone rendering (D7) lands here
and is asserted offline before any page exists. Nothing imports
`lib/cards/serialize.ts` or `lib/journal/serialize.ts`.

**Step 3 — `DailyCard hrefFor`.**
D17. `npm run test:layout` must still be 18/18 green *before* anything else
touches `/today`, so a later failure is unambiguously attributable.

**Step 4 — the resolvers.** *(needs F16)*
Three functions in `lib/db/queries/shares.ts`. Each returns `null` for an unknown
slug, a revoked slug, or a kind mismatch — never throws, never 403s (a 403
confirms the id exists; `/journal/[id]` and `/vocab/[id]` both already 404 for
this reason).

**Step 5 — the public pages.** *(needs F16)*
`SharedCardView`, `SharedCardWordView`, `SharedJournalView`, the `kind` dispatch
in `(public)/s/[slug]/page.tsx`, the nested `[position]` route,
`generateMetadata` on both, `export const dynamic = "force-dynamic"` on both
(D12). Add `/kitchen-sink/share`. Before starting, **verify F16 exempted the
public prefix in `src/middleware.ts`** — it currently redirects every
session-less request other than `/signin` to `/signin`, so without the exemption
nothing on this page is reachable and the failure looks like a routing bug.

**Step 6 — the owner-side entry points.**
`ShareButton`; `/card/[date]`; the `month-view.tsx` one-liner; `/today`'s header;
`/journal/[id]`'s action row; D18's *Stop sharing*. Then update
`/kitchen-sink/today` and run `npm run test:layout`. **This is the step that can
break the 18 assertions**; if the new single-row header assertion fails, take
D3's stated fallback rather than adjusting the type scale.

**Step 7 — verification and docs.**
Fold everything into `share:check` / `share:db`, including D15's cross-user
assertion. Update `src/components/README.md` and `CLAUDE.md`. Run the full
manual pass in §5.

**Step 8 — F17 integration.** *(needs F17)*
Land D11's six edits, run F17's `npm run claim:check` and `npm run claim:db`
unchanged plus their new `w` cases, then walk the whole funnel manually. Do this
**after** F17 has shipped and is green; a card claim is a widening of a working
path, and widening a path that has never run is how both features get blamed for
one bug.

---

## 5. Verification

### `npm run share:check` — offline, no database, no network

F18's additions to F16's script.

**Position boundary (D1).**
`parseSharePosition` accepts exactly `"1"`,`"2"`,`"3"`,`"4"`,`"5"`,`"6"` and
rejects `"0"`, `"7"`, `"-1"`, `"1.5"`, `"01"`, `"+1"`, `" 1"`, `"1e0"`, `""`,
`"1;--"`, and a real uuid string. Asserted as a table with the input printed on
failure, because a silent widening here is the whole risk.

**Card DTO allowlist (D8).**
Against a fixture card row: `Object.keys(dto).sort()` equals `PUBLIC_CARD_KEYS`
exactly — an equality, not a subset, so a *added* field fails too. Then a deep
walk of the serialised DTO asserting that **no string anywhere matches
`/^[0-9a-f]{8}-[0-9a-f]{4}-/i`**, which catches a uuid arriving in any nested
position under any name. Same two assertions for `PUBLIC_CARD_WORD_KEYS`.

**Journal DTO allowlist (D8, D10).**
Same equality check, plus three named negatives: the output has no `sourceNote`,
no `id`, no `updatedAt` — asserted by key even though the equality check subsumes
them, because these three are the ones a future edit would add back "just for
the date line".

**Timezone rendering (D7).**
The same card — `cardDate: '2026-08-09'`, `timezone: 'Asia/Jakarta'` — serialised
with `process.env.TZ` forced to `'UTC'`, `'America/Los_Angeles'` and
`'Pacific/Kiritimati'`, asserting `dateLabel === '9 August 2026'` in all three.
This is the viewer-in-a-different-timezone claim, tested from the viewer's side.
Then, with a fixed `now`: a card made on the sharer's *today* reads `today` for a
Los Angeles viewer whose own local date is already the day before; and a card row
with `timezone: null` falls back to `DEFAULT_TIMEZONE` for the freshness word
while `dateLabel` is byte-identical to the non-null case. Finally, a grep-style
assertion in the script itself: the two DTO modules contain no `toISOString`, no
`new Intl.DateTimeFormat` and no `getFullYear`/`getMonth`/`getDate`.

**Metadata (D14).**
The journal OG description equals a clip of `text` and is not the insight's
`meaning`; no builder's output contains `sourceNote`; every builder sets
`robots.index === false`.

**Repo-level greps**, run by the script and failing loudly:
- `grep -rn toISOString src/` yields no file outside the eight it yields today.
- Nothing under `src/app/(public)/`, `src/components/share/` or `src/lib/share/`
  imports `@/lib/cards/serialize`, `@/lib/journal/serialize`, or
  `@/lib/vocab/links`.
- Nothing under `src/app/(public)/` imports `@/lib/auth/session` or
  `requireUser`.
- `CLAIM_PATH` is still exactly `'/claim'` and `claimHref` does not exist —
  F17's `claim:check` asserts the first; F18 asserts the second so a later
  session cannot reintroduce a parameterised claim URL.

### `npm run share:db` — seeds a fixture and rolls back

**Slug authorises what (D1).**
Seed user A with two cards and eight words. Share card 1. Assert:
`getSharedCardWord(slug, 1..6)` returns the six words of card 1 in position
order; `getSharedCardWord(slug, 7)` is null; the seventh and eighth words are
unreachable through the slug by any call; a second card's slug does not resolve
card 1's positions; and `resolveShare(<random slug>)` is null. Then delete the
share row and assert all seven lookups become null — one revocation, seven dead
URLs.

**Journal insight / edit interaction (D12).**
Create an entry, write a `ready` insight directly, share it. Assert the public
DTO carries the insight and carries no `sourceNote`. Then `updateEntry` with new
text and re-read: the public DTO's insight is `null` and its status is not
`ready`. Then `updateEntry` with only a new `sourceNote` and re-read: the insight
is present again and `sourceNote` still does not appear. Under a snapshot design
this test is what proves the revoke-on-edit hook fired.

**F15 cross-scope (D15).**
Seed users A and B. A keeps a line and shares it. B saves the byte-identical
text through the same path `POST /api/journal` uses. Assert **no** near-duplicate
warning. Then B saves it a second time and assert a warning **is** produced. If
F15's module is absent, print `skipped: F15 not present` and pass.

**Card claim resolution (D11).**
`getShareTargetForClaim(cardSlug, 3)` returns the sharer's third word;
`(cardSlug, null)`, `(cardSlug, 7)` and `(vocabSlug, 2)` all return no entry and
therefore one of F17's existing zero-write outcomes; `(cardSlug, 6)` against a
four-word card likewise. Assert **zero rows written** in every one of those
cases, because F17 §5's ordering guarantees it and a widened resolver is exactly
where that guarantee could be lost.

**Ownership of the entry points.**
`getCardForDate(userB, <A's card date>)` is null, so `/card/[date]` cannot show
one user another's card. `POST /api/shares` for an entity the caller does not own
fails.

### `npm run test:layout`

The 18 existing assertions **must stay green**, now measuring a `/kitchen-sink/today`
fixture that includes the Share control by default (D3) — that is the real guard,
and it is why the fixture changes rather than gaining an opt-in flag.

Two new cases:

1. **`/today`'s header is one row.** At 375×667, with `?n=6&streak=365`: the
   `<header>`'s `offsetHeight` is ≤ 72px, and the trailing block's top is above
   the h1's bottom (they share a baseline row). This exists because the existing
   spec cannot catch a wrap — a two-line header leaves rows at ~60.8px, still
   above the 52px floor, so everything would pass while the screen degraded. Both
   colour schemes.
2. **The shared card's rows clear the floor.** `/kitchen-sink/share?kind=card&n=6`
   at 375px: six `daily-card-row`s, each ≥ `LAYOUT.rowMinH`, the page does not
   scroll **sideways**, and there is no `nav[aria-label='Primary']` in the DOM —
   the public page has no tab bar and a stranger must not be shown one. Vertical
   scrolling is expected and is not asserted against (D16).

### Manual passes no script covers

1. Share today's card from `/today`, open the link in a **private window** (no
   session) — the single most likely mistake in this batch is a public route that
   silently works because the developer is signed in.
2. Open the same link on a device set to a timezone a day away from the sharer's
   and confirm the date reads identically.
3. Paste a card link into WhatsApp and a journal link into Slack; confirm neither
   previews as "Daily Words", and that the journal preview shows the **line**, not
   the insight (D14).
4. Tap a row, tap **Practise this word**, complete Google sign-in as a genuinely
   new account, and confirm you land in that word's chat with the word in **your**
   collection — through onboarding, which is the redirect most likely to eat the
   intent (D13).
5. Tap **Start your own journal** as a **new** Google account and confirm you
   land on `/journal` with an **empty** composer after onboarding (D13 step 2),
   and as an **existing** account and confirm you land there directly (step 1).
   Then abandon at Google's consent screen, sign in later from `/signin`, and
   confirm nothing surprising happens — the same property F17 D3 protects.
6. Revoke both shares from `/card/[date]` and `/journal/[id]` and confirm every URL
   404s, including a previously-loaded `/s/<slug>/3`.
7. Share a card whose sixth word is still enriching, and confirm the public row
   draws the skeleton rather than an empty line or "null".
8. `/kitchen-sink/share` at 375px in both colour schemes.

---

## 6. Risks and open questions

### Cross-plan — the owner is named

**R1 — F17 must accept `slug + position` in the `dw_claim` cookie. (Owner:
F17.)** D11. This is the one change F18 requires of another plan, and F17 is
already written, so it is a widening of shipped code rather than a note on a
draft. It touches five F17 files and changes no outcome in F17 §5's table. If it
is refused, card shares get six tappable words and a CTA that claims the wrong
word or nothing — the correct degradation in that case is to **drop the CTA from
`/s/<slug>/<position>` entirely** and leave the row as a read-only word, not to
guess a position server-side and not to fall back to a uuid.

**R2 — F15's dedup scope is unverified. (Owner: F15.)** D15. I could not read
F15's plan; the claim that its check is scoped to the user's own collection is
an *assumption*, not a verification. A pgvector query is the most natural place
in this codebase to omit `user_id`. F18 asserts it from the outside in `share:db`
and that assertion is the only thing standing behind this paragraph.

**R3 — Snapshot vs live is F16's, and the journal case is not neutral. (Owner:
F16.)** D12. If F16 chose snapshots and does not accept revoke-on-edit for
journal shares, a public URL can outlive the text it quotes. Escalate rather than
implement a third behaviour.

**R4 — Share creation must be idempotent. (Owner: F16.)** D5. If each tap mints a
slug, D18's *Stop sharing* revokes one link while others stay live, and the user
believes they have unshared something they have not. This is a correctness bug in
a privacy feature, not a tidiness issue.

**R5 — The owner's timezone for a shared journal entry. (Owner: F16.)** §2. F18's
resolver joins `profiles` for it. If F16's public query is deliberately
single-table, the alternative is a nullable `shares.timezone` written at creation
— which is also strictly more correct, because it records the zone at share time
rather than the zone the owner happens to be in when a stranger loads the page.
F16 decides.

**R6 — F16's public route path *and its middleware exemption*. (Owner: F16.)**
`src/app/(public)/s/…` follows F17 §0's assumption so the two plans agree; if F16
chose differently the paths shift and nothing else does. Two ways this is fatal
rather than cosmetic: F16 putting the public routes **inside `(app)`**, which the
brief calls "the single most likely mistake across F16–F18"; and F16 not
exempting the public prefix in `src/middleware.ts`, which today redirects every
session-less request other than `/signin` to `/signin`. Verify both before
step 5.

**R12 — D13's `dw_next` cookie touches the end of onboarding, which F17 fenced
off. (Owner: shared, F7/F17/F18.)** F17 §4 lists `src/app/onboarding/*` under
"Explicitly NOT modified", though its objection is to a `?next=` parameter and
`dw_next` is not one — the cookie selects between hard-coded destinations and no
path is ever read from it. If the fence is read strictly, take D13's stated
degradation and land the new user on `/today`.

### F18's own, unverified

**R7 — `/today`'s header width at 375px is estimated, not measured.** D3. The
title, `gap-3`, a three-digit streak pill and a "Share" pill in 331px is roughly
33px of slack by calculation. If the new single-row assertion fails, take D3's
one-line fallback (the date eyebrow becomes a permalink) rather than shrinking
type — `cn()` and the type scale are a documented trap and this is not the place
to test it.

**R8 — `min-h-[396px] flex-none` on the public card is arithmetic, not
structure.** D16. It follows F9's precedent of a fixed pixel value in a scrolling
page, but [R19] replaced arithmetic with structure on `/today` for good reasons.
If the public card looks wrong on a tall device, the fix is a `min-h`/`max-h`
pair, not a return to `flex-1` inside a scroll container.

**R9 — `DailyCard`'s dev-mode `throw` on >6 items now runs on a public page.**
The component throws in development when given more than `LAYOUT.cardSize` items.
`daily_card_items_card_position_uniq` plus F5's contiguous 1-based insert make
that unreachable, but a public page is the worst place to discover otherwise.
The DTO slices to six defensively before the component sees them.

**R10 — Clipboard access needs a secure context.** D4. `navigator.clipboard` is
undefined on plain HTTP, which includes `http://<lan-ip>:3200` during device
testing. The inline-URL fallback exists for this and must be tested on a real
phone, not assumed.

**R11 — The nested route's `generateMetadata` runs a second resolve.** Next.js
calls `generateMetadata` and the page separately; for `/s/<slug>/<n>` that is two
lookups per request. Correct but wasteful. `React.cache` around the resolver is
the fix if it shows up; not worth pre-optimising.

### Open questions

**Q1 — Should `source_note` be shareable, opt-in?** D10 says no by default and
offers no toggle. The counter-argument is attribution: a shared quotation with
its citation stripped can read as passing off. A future answer might be a
per-share checkbox — but there is no modal in this app to put one in, and a
permanently visible toggle on `/journal/[id]` is a lot of chrome for a rare
choice. Revisit with a real user, not in this plan.

**Q2 — Should a shared card show *who* shared it?** F18 renders no name, no
avatar and no handle: nothing about the sharer's identity crosses (D8). That is
the conservative default and it makes the page feel slightly anonymous. The
sharer's name is in the message they sent alongside the link, which is probably
enough.

**Q3 — Does `/card/[date]` want the streak pill, the day strip, or a Delete?**
No, no, and no — it is a record of a day that happened ([R1]) and the only write
it offers is Share/Unshare. Stated so a later session does not "complete" it into
a second `/today`.
