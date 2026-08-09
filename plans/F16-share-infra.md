# F16 — Share infrastructure and the shared word page

Sharing lets a user hand one word to a stranger. The user's words: *"we should also create a share page: for vocab, we can click share button in the detailed vocab page. in the shared page version of detailed vocab, viewers can click practice this word…"*. This plan owns the infrastructure — the `shares` table, the slug, the public route group, the public read query, the Share affordance on `/vocab/[id]` — plus the one consumer that proves it works, the shared **word** page at `/s/[slug]`. **F17** owns everything after the stranger taps "Practise this word". **F18** owns shared daily cards and shared journal entries. Design for all three; build one.

Supersedes nothing. It is the first plan to touch `shares`, `src/app/s/`, `src/lib/share/` and `src/lib/db/queries/shares.ts`. It **modifies** `src/middleware.ts`, `src/lib/env.ts`, `src/app/layout.tsx` and `src/app/(app)/vocab/[id]/page.tsx`, and it explicitly **does not** modify `src/lib/vocab/links.ts` (see Decision 12).

Binding context: `plans/F11-F18-BRIEF.md` **[S3]** — *"Sharing is opt-in and token-addressed. A `shares` row with an opaque random slug is created only when the user taps Share. No entity uuid ever appears in a public URL, and revoking is deleting the row. Guessing a slug must be infeasible."*

---

## 1. Decisions

### D1 — Three nullable FK columns with one CHECK constraint. Not a polymorphic pair, not three tables.

The reference from a share to the thing shared has to survive two facts: a polymorphic `(entity_type, entity_id)` pair **cannot carry a real foreign key**, and F18 must add two more entity types **without a migration**.

| Option | Real FK? | F18 needs a migration? | Verdict |
|---|---|---|---|
| A. `(entity_type, entity_id uuid)` | No | No | Rejected |
| B. Three nullable FK columns + CHECK | Yes | No (columns already exist) | **Chosen** |
| C. `vocab_shares` / `card_shares` / `journal_shares` | Yes | Yes — two new tables | Rejected |

**A is rejected because of the orphan.** With no FK, `deleteVocabEntry()` succeeds and leaves a `shares` row pointing at a uuid that no longer resolves. Nothing throws at delete time; the failure surfaces later, in front of a stranger, as a null dereference in a page the sharer cannot see. That is precisely the case the ask names: *a shared word the sharer later deletes must not 500 a stranger.*

**C is rejected on the F18 clause alone**, and secondarily because it triples the public read path — three tables means `getShareBySlug` becomes three queries or a UNION, and the slug's uniqueness stops being enforceable by the database (three separate unique indexes cannot see each other, so two entity types could mint the same slug).

**B keeps a real FK per type**, and one CHECK constraint makes the three columns behave as a discriminated union at the database level rather than only in TypeScript. The columns for `daily_card_id` and `journal_entry_id` are created **now, in F16's migration, unused**. F18 writes rows into them and adds nothing. That is the whole point of paying for the CHECK.

`entity_type` is kept even though it is derivable from which column is non-null. It is one indexed read that tells the page renderer and the payload parser which shape to expect, and the single CHECK below ties it to the columns so it cannot drift.

### D2 — Every entity FK is `ON DELETE CASCADE`. This is a deliberate departure from the `daily_card_items` precedent.

`src/lib/db/schema.ts:200-209` says, of `daily_card_items.vocab_entry_id`:

> *"RESTRICT is deliberate and is roadmap policy [R1]. A past card is a record of a day that happened; deleting a word must never punch a hole in it. A word with zero card items may still be hard deleted — the FK is what enforces the distinction."*

That reasoning does not transfer, and applying it here would be a bug. RESTRICT on `shares.vocab_entry_id` would mean **sharing a word makes it permanently undeletable** — `deleteVocabEntry()` performs its `daily_card_items` check, finds none, issues the DELETE, and gets a raw 23503 out of Postgres that no caller catches. The user's typo-recovery path ([R1]) would 500 because they once tapped Share. The share is not a record of a day that happened; it is a link the user chose to hand out, and deleting the thing it points at is a strictly stronger act than revoking it.

CASCADE gives the right semantics in one line: **deleting the word revokes the share.** A user who deletes a word and finds the link still live has lost control of their own data. `users.id` cascades too, matching every other table in the schema.

Note what CASCADE does *not* mean here: it does not mean the shared page needs the word to render. See D3.

### D3 — Snapshot, not live. For all three entity types, decided once, here.

**A share stores what was shared, at the moment it was shared, in a `payload jsonb` column.** The public read joins nothing.

Five reasons, in order of weight:

1. **A live share is structurally unsafe and the failure is silent.** A live read is a join against `vocab_entries` / `journal_entries` — user-owned tables that will keep gaining columns. The day someone adds a private column and a `select()` picks it up, a stranger sees it, and nothing in the type system or the test suite notices. With a snapshot, the public read is `select payload from shares where slug = $1`: it **cannot** return a column that is not in the payload, because the payload was built by one serializer that enumerates its fields by hand. What a stranger can see is decided once, at write time, in one file. This argument alone would decide it.

2. **F10's insight rule makes a live journal share incoherent.** `CLAUDE.md` states that both the insight completion and failure writes *"match on `text = <the text at claim time>`, so an insight can never describe a line the user has since edited. Editing the text clears the insight."* A **live** shared journal page has no such protection: the owner edits the text, the insight is cleared, and the stranger's reload finds a page that has lost half its content — or races the clear and shows an insight describing text nobody can see. The invariant the app already enforces internally is exactly the one a live share would break. A snapshot extends it rather than contradicting it.

3. **The same failure exists for vocab, smaller but real.** `clearCorrection()` (`queries/vocab.ts:252`) sets `definition: null, examples: [], enrichmentStatus: 'failed'`; `applyCorrection()` can rename the term outright or delete the row in a merge. A live shared word can therefore go from a full definition to a blank page because the owner dismissed a spelling suggestion — an edit they have no reason to associate with a link they sent a friend last week.

4. **Honesty.** A share is an act with a time. "Here is the word I saved" is a statement about what it said then.

5. **Deletion.** Secondary, given D2's cascade, but it means the read path carries no null branch and no join against a table that might have lost the row.

**The cost, stated plainly:** the shared page goes stale, and F16 ships no "update the shared copy" control (D9). Storage is a few hundred bytes per row.

The payload is re-validated with zod on **read** as well as being allowlisted on **write**. The `jsonb` column has no shape guarantee from the database, and a row written by an older serializer must degrade rather than crash a page a stranger is looking at. `payload_version` exists so the read side can tell an old shape from a corrupt one.

### D4 — `/s/[slug]`, one segment, no type in the URL. It sits as a **sibling of the `(app)` route group**.

**This is the decision most likely to be got wrong, and it fails in the one way a developer cannot see.** `CLAUDE.md`, verbatim:

> *"`app/(app)/layout.tsx` calls `requireOnboardedUser()`, so **every** route inside that group is gated on `profiles.onboarded_at`. `/onboarding` is a sibling of the group, not a member: putting it inside makes the guard part of its own layout chain and every visit an infinite redirect."*

And `src/app/(app)/layout.tsx:12-15`:

> *"`requireOnboardedUser()` is what makes F7's guarantee to F5 and F9 true… `/onboarding` is a sibling of this group precisely so the guard cannot run on it."*

A share page inside `(app)` is invisible to the stranger it exists for: `requireOnboardedUser()` → `requireUser()` → `redirect('/signin')`. The trap is that **the author testing it is signed in and onboarded, so the page renders perfectly for them.** The feature ships broken and looks fine.

The file therefore lives at `src/app/s/[slug]/page.tsx` — a sibling of `src/app/(app)/`, `src/app/signin/` and `src/app/onboarding/`, inheriting only the root layout.

Path shape: **`/s/[slug]`**, not `/share/[type]/[slug]`.
- The slug is already unique across all three types, so the type in the path is redundant data that the database must then agree with. A mismatch is a code path nobody writes a test for.
- One route file serves all three types. F18 adds a branch in the renderer, not a route — the same "no migration" property extended to the URL space.
- It is short, which matters for something pasted into WhatsApp. `/s/` + 16 characters = a 19-character path.

### D5 — `src/middleware.ts` is the second gate, and it must be exempted **inside the function**, never in the matcher.

`src/middleware.ts:38` redirects *any* cookie-less request to `/signin`:

```
if (!hasCookie && pathname !== '/signin') {
  return NextResponse.redirect(new URL('/signin', req.url))
}
```

The matcher `'/((?!api|_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|apple-icon|icon).*)'` includes `/s/…`. **Without an exemption, the public route group achieves nothing** — the stranger is bounced before the page ever renders, and again, the signed-in author never sees it.

**Do not add `s` to the matcher's negative lookahead.** The alternation is prefix-matched: `(?!api|s|…)` also excludes `/signin`, and it would silently exempt every future route beginning with `s` — `/settings`, `/stats`, `/search`. The regex is already dense enough that a mistake there disables the gate for more than intended.

Instead, an early return in the function body, mirroring the existing `DEV_ONLY_PREFIX` idiom, using a **pure predicate exported from `src/lib/share/policy.ts`** so that what `share:check` asserts offline is the same function that runs in the middleware:

```
isPublicSharePath(pathname)   // true for '/s', '/s/<slug>', '/s/<slug>/claim'
                              // false for '/signin', '/settings', '/s-omething', '/vocab/s/1'
```

`/s` with no slug is exempted too: Next 404s it, and a 404 is a better answer to a truncated link than a redirect to a sign-in page.

A **signed-in** viewer is not redirected either — everyone gets the same page. F17 decides what the CTA says for a viewer who already has a session.

### D6 — The slug: 16 characters of Crockford-style base32 = **80 bits**.

**Alphabet** — `0123456789abcdefghjkmnpqrstvwxyz` (32 symbols: ten digits, and a–z less `i`, `l`, `o`, `u`). Lowercase only. Rationale:
- Excluding `i/l/o/u` removes every glyph pair a human confuses when reading a link off a screen, and removes the only English four-letter word the generator could otherwise produce by accident.
- Lowercase-only, not base62: several link handlers and email clients normalise case. A case-sensitive slug that is silently lowercased in transit is a link that dies for no visible reason.
- 32 symbols = exactly 5 bits per character, so the encoding is lossless and the entropy claim is exact rather than approximate.

**Length — 16.** 16 × 5 = 80 bits, and 80 bits is exactly 10 bytes, so generation is `randomBytes(10)` → base32 → 16 characters with **no modulo step and therefore no modulo bias**.

**The guessing argument.** An attacker guessing blind hits a live share with probability `N / 32^L` per request, where `N` is the number of live rows. `32^16 = 2^80 ≈ 1.21 × 10^24`. This is a hobby app with one user; take `N = 1,000` shares, three orders of magnitude more than plausible. One *expected* hit then requires `G = 2^80 / 1000 ≈ 1.2 × 10^21` requests. At a sustained 1,000 requests/second — far beyond what Vercel's free tier would serve before cutting off — that is `1.2 × 10^18` seconds, about **3.8 × 10^10 years**.

The comparison that makes 16 a decision rather than a number: at **10** characters (50 bits, `1.13 × 10^15`), the same `N = 1,000` needs `1.1 × 10^12` guesses — 35 years at 1,000 req/s, **3.5 years at 10,000 req/s**. That is inside the reach of a botnet with a grudge. At 16 it is not, by twenty orders of magnitude.

**And what does a hit buy?** One word, its pronunciation, part of speech, a one-line definition and up to three example sentences — content the sharer chose to publish. No name, no email, no other word, no statistics, no identifier usable anywhere else (D8). The prize is close to zero; 80 bits makes the cost enormous anyway, which is the right ratio.

**Generation rules:** `crypto.randomBytes(10)` from `node:crypto`. Never `Math.random()`. No timestamp prefix, no user-derived component, no checksum — anything structured shrinks the search space and leaks metadata about when or by whom the share was made. Collision is handled by the `UNIQUE` index: catch 23505 and retry, **at most twice, then fail** — the same one-retry-never-a-loop discipline `POST /api/vocab` already uses for its duplicate race and the roadmap requires of LLM parses.

### D7 — `src/lib/db/queries/shares.ts` is a **named, commented departure** from the `userId`-first convention.

`CLAUDE.md`: *"All Drizzle access goes through `lib/db/queries/<resource>.ts`. `userId` is the first parameter of every function there and appears in every WHERE clause."* `queries/vocab.ts:9-14` states the reason: *"There is no ambient current user at this layer."*

`getShareBySlug(slug)` cannot honour it. The caller is a stranger with no session and no id. The file's header must say so, in these terms:

> **This file contains the one function in the application that reads a row without a user id.** Every other file in this directory takes `userId` first and puts it in every WHERE clause, because the user id is the entire authorisation story there. Here there is no user. What replaces `userId` as the safety property is the slug: **the slug is the capability.** It is 80 bits of CSPRNG output ([D6]), it exists only because the owner tapped Share ([S3]), and deleting the row revokes it. The read is therefore `WHERE slug = $1` and nothing else — adding a second predicate would not make it safer, it would only hide that the slug is doing all the work.
>
> The second half of the safety property is that this function returns a **snapshot column, not a join** ([D3]). It must never reference `users`, `profiles`, `vocab_entries`, `daily_cards`, `journal_entries` or `user_stats`. `grep` for those table names in this file finding a hit is a bug, not a refactor.

Every other function in the file — `createShare`, `deleteShare`, `getShareForEntity`, `listShares` — keeps `userId` first and in the WHERE clause, because creating and revoking are authenticated acts. The exception is one function wide.

### D8 — The public DTO is a deliberate allowlist. Here is what it must never contain.

| Excluded | Why |
|---|---|
| `users.email`, `users.name`, `users.image` | The share is a link that will be forwarded beyond the sharer's intent. A name attached to a URL that ends up in a public paste is a leak the sharer never consented to. The display name is Google's, not something they curated. **The public query never joins `users` at all** — an absolute rule is greppable; a careful one is not. |
| `shares.user_id` | The sharer's uuid appears in no other public surface and would correlate two shares to one person. |
| `vocab_entries.id` (and every other entity uuid) | [S3] bans entity uuids from the URL; the same reasoning bans them from the body. A leaked uuid is a permanent identifier that **outlives revocation** and is exactly what an attacker would need if any future endpoint ever takes an id. |
| `status`, `source`, `mastered_at`, `last_shown_on` | The owner's study behaviour. None of it is about the word. |
| `enrichment_status`, `enrichment_error`, `enrichment_attempts`, `suggested_correction` | Internal machinery, plus "the model failed three times on this" is not something to publish. |
| `created_at` (of the entry, and of the share) | A timestamp tells a stranger what hours the owner keeps. The share's `created_at` stays in the table for the owner's own use; it does not go in the payload. |
| Anything about other words, counts, streaks, badges | Obvious, and worth writing down so the F18 author does not think a "3 of 6 on this card" line is free. |

The allowlist itself:

```
SharedWordPayload = {
  kind:          'vocab'
  term:          string
  pronunciation: string | null
  partOfSpeech:  string | null
  definition:    string | null
  examples:      string[]      // at most 3, every element a string
}
```

Built by `toSharedWordPayload(entry)` in `src/lib/share/serialize.ts`, which **contains no object spread anywhere**. A spread is how a private column joins the payload on the day it is added; naming six fields by hand is how it does not. `examples` is filtered with the same `typeof e === 'string'` guard `toDetail` already uses (`lib/vocab/serialize.ts:62`), because `jsonb` guarantees nothing.

The read path parses the stored payload through `sharedPayloadSchema` before rendering. zod's default object behaviour **strips unknown keys**, which is a second, independent net: a payload written by a buggy build with an extra field cannot render it.

### D9 — The Share affordance: a quiet text control at the bottom of `/vocab/[id]`, one tap to create, two taps to revoke, no refresh.

**Where.** `/vocab/[id]` has no `ScreenHeader` — it has a `BackLink`, an `<h1>`, and a stack of controls at the foot of a scrolling pane. Share joins that stack:

```
Practise this word        (filled Button — existing)
MasteredToggle            (existing)
Share this word           (NEW — quiet mono text control)
Delete this word / "This word is on past cards…"   (existing, stays last)
```

Drawn exactly like `DeleteWordButton`: `min-h-[44px]`, `font-mono text-mono-sm tracking-nav uppercase`, `text-ink-3`. **Text, never an icon** — [R18] removed the icon set and `delete-word-button.tsx` already records the reasoning: *"an unlabelled destroy button is exactly the ambiguity Product Principle 1 rejects."* No new colour, size or radius; `components/README.md`'s frozen contract holds.

**Only when `enrichmentStatus === 'ready'`.** Sharing a word that says "finding it…" hands a stranger a blank page. The page already prints one `Available once the word is ready` line under the disabled Practise button; a second would be noise, so the Share control simply does not render until ready.

**First tap (not yet shared):** `POST /api/shares` → server mints slug and snapshot → returns `{ slug, url }`. The client then runs the share chain below. The control re-renders into its shared state without a round trip.

**Already shared:** the server component knows, because the page issues one extra indexed read (`getShareForEntity(user.id, 'vocab', id)`) alongside `getVocabEntryDetail`. It renders:
- a read-only, selectable `TextInput` holding the URL — the state that always works;
- `Copy link` (no write; reuses the existing slug);
- `Stop sharing` — two taps, armed and self-disarming after 4s, the exact pattern `DeleteWordButton` and `ToggleRow` already use. `DELETE /api/shares/[slug]`.

**Web Share API, and the iOS trap.** `navigator.share` is supported in iOS Safari and in standalone PWAs (`public/manifest.webmanifest` sets `display: "standalone"`, so both matter), but it requires a secure context **and transient user activation** — it must run inside the click handler. Awaiting a `fetch` first may consume the activation and make the call reject with `NotAllowedError`. So the chain is, in order, with every step a real fallback rather than a hope:

1. `navigator.share({ title, text, url })`. If it rejects with **`AbortError`, stop** — the user dismissed the sheet, which is a success, and falling through to the clipboard would silently copy something they declined to send.
2. Any other rejection, or no `navigator.share`: `navigator.clipboard.writeText(url)` → show a `Link copied` line. (`clipboard` carries the same activation and secure-context constraints, hence step 3.)
3. Always, regardless: the URL is rendered in the selectable read-only field. **The terminal state is never "nothing happened."**

**No "update the shared copy" control.** The snapshot is what was shared (D3). To publish an edit, the owner stops sharing and shares again — which mints a **new slug and kills the old link**, which is the honest outcome: the person you sent the old text to keeps seeing what you actually sent them until you revoke it. A third control on the page loses to Product Principle 1. Risk R8 names the remedy if this bites.

**No "things I've shared" list.** The roadmap's route map has no such route, and adding one costs either a fifth tab (forbidden — the tab bar is exactly four items) or a nested `/profile` segment. At this app's scale a user has a handful of shares and the revoke path lives on the entity, where their mental model already is. `listShares(userId)` **is written anyway** and exercised by `share:db`, so that a later `Shared` block on `/profile` costs a component and not a query. The gap — a user cannot enumerate what they have shared — is real and recorded as R9.

### D10 — Metadata: text-only unfurl, `noindex`, no OG image.

`generateMetadata` in `src/app/s/[slug]/page.tsx`, reading through the same `getShareBySlug` wrapped in React's `cache()` so the page and the metadata function share one query per request.

- `title`: `` `${term} — Daily Words` ``. Missing or revoked: `Link not available — Daily Words`.
- `description`: the definition, else `A word from someone's Daily Words collection.` **Never the sharer's name** (D8).
- `openGraph`: `{ title, description, type: 'article', url }`, absolute. `twitter: { card: 'summary' }` — `summary`, not `summary_large_image`, because there is no image.
- `metadataBase` is set **once, in `src/app/layout.tsx`**, from a new `APP_URL` in `src/lib/env.ts`. Without it Next emits a relative `og:url` and warns; WhatsApp will not follow a relative URL.

**No OG image, and this is a decision rather than an omission.** Generating one means `next/og`'s `ImageResponse` — a satori render plus an embedded font, per request, on a free tier, for a link that will be opened a handful of times. A static image would be the same picture for every word and therefore says nothing. And there is nothing to draw: [R18] is *"No icons anywhere"* and the design has no imagery at all — the app's entire visual vocabulary is two typefaces and a hairline rule. A text unfurl of a term plus a one-line definition **is** the design, and F2's obligation on F3 caps a definition at 60 characters, which is exactly a preview subtitle. Revisit only if F12's badge art establishes a raster style, which would give a share card something to be made of.

**`robots: { index: false, follow: false }`, googleBot the same.** The URL *is* the secret. Indexing converts an 80-bit capability into a public one the moment a crawler finds the link in a public Slack export, a forwarded newsletter, or a link shortener's preview page — and it defeats revocation, because a de-indexed page lingers in caches long after the row is gone. There is no SEO upside: the app is invite-by-link with no acquisition funnel. **`noindex` does not stop WhatsApp, Slack or iMessage unfurling** — those read `og:` tags directly and ignore `robots` — so the feature works exactly as intended. That sentence is what makes the decision safe rather than merely cautious.

`export const dynamic = 'force-dynamic'` on the page, with a one-line comment: *revocation must be immediate; a cached render outlives the row.*

### D11 — No rate limit on either side, and the reasoning is not laziness.

`src/lib/vocab/suggestion-rate-limit.ts` is the house idiom — in-memory, no table, honest in its header about multi-instance leakage, and closing with *"A Postgres-backed counter would be exact at the price of a table and a write on every suggestion, for a hobby project with one user. Revisit only if quota is actually exhausted."* That last sentence is the precedent, and applied here it argues **against** adding one.

- **Share creation** is already bounded structurally, which beats any best-effort counter: it is authenticated, it is idempotent per entity (the unique index refuses a second row), and the number of entities is itself capped by `DAILY_ADD_LIMIT = 50` words/day. It burns no LLM quota and calls no external service. A limiter would add a moving part that protects nothing.
- **The public read** is the guessing surface, and a limiter is the wrong tool for it. Per-IP counters in an in-memory map across ephemeral Vercel instances are close to useless, and D6 already makes guessing infeasible by twenty orders of magnitude — a limiter cannot improve on that. What it *would* nominally buy is cost-DoS protection, and Vercel's own free-tier ceiling is that backstop; we cannot beat it from inside a function.

**Shares never expire, and `expires_at` is deliberately not added.** There is no cron in this app and none is coming — [R11]: *"No cron job — a scheduled job is the first step toward the notifications this roadmap forbids."* A TTL column with nothing to enforce it is a lie in the schema; a TTL checked on read is a different feature with a different UX ("your link expired") that nobody asked for. Revocation is manual, explicit and immediate.

### D12 — Share URLs live in `src/lib/share/policy.ts`, not `src/lib/vocab/links.ts`. Departure, called out.

The brief says: *"`vocabDetailHref` / `vocabChatHref` / `vocabListHref` live in `src/lib/vocab/links.ts`… That file is the correct place to add origin or share URLs; a template literal in an eighth file is how it drifts."* And the file's own header says: *"Every URL into the **vocab** surface, in one place."*

The drift the brief is guarding against — a hand-built path in an eighth file — is fully prevented by having exactly one home for share URLs. But `lib/vocab/links.ts` is the wrong home: `/s/[slug]` is **polymorphic by design**, and putting it there would make F18 import `@/lib/vocab/links` to build a *journal* share URL. `src/lib/share/policy.ts` is one place, it is the right place, and it is where F18 and F17 will both look first. `lib/vocab/links.ts` is left untouched.

### D13 — A missing slug and a revoked slug are the same page, the same status, and the same sentence.

`src/app/(app)/vocab/[id]/not-found.tsx` already carries the reasoning for the private case: *"All three say the same thing on purpose — telling the third case apart would confirm that somebody else's id exists."* The public case is stronger: distinguishing "revoked" from "never existed" tells an attacker their guess *used to be right*, which is a live oracle on the slug space.

One page, one sentence — `This link isn't available.` — at a real **404 status** (via `notFound()` and `src/app/s/[slug]/not-found.tsx`), so unfurlers and crawlers drop it rather than caching a soft-200. Both cases take the identical code path — one indexed lookup that misses — so there is no timing channel either.

---

## 2. Schema changes

A migration **is** needed. One new table, no changes to any existing table.

`src/lib/db/schema.ts`, appended after the gamification block:

```ts
/* ---------------------------------- Shares ---------------------------------- */

/**
 * Opt-in, token-addressed sharing. [S3]: a row exists only because the user
 * tapped Share; the slug is the capability; revoking is deleting the row.
 *
 * Three nullable FK columns rather than a polymorphic (entity_type, entity_id)
 * pair, because a polymorphic pair cannot carry a real foreign key and a share
 * whose target was deleted would 500 in front of a stranger. F18's two extra
 * types write into columns that already exist here — no second migration.
 *
 * CASCADE, not the RESTRICT of daily_card_items: that rule protects a record of
 * a day that happened, and a share is not one. RESTRICT here would make a
 * shared word permanently undeletable and break [R1]'s typo-recovery path.
 */
export const shares = pgTable(
  'shares',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** 16 chars of Crockford-style base32 = 80 bits. See F16 §1 D6. */
    slug: text('slug').notNull(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    entityType: text('entity_type')
      .$type<'vocab' | 'card' | 'journal'>()
      .notNull(),

    vocabEntryId: uuid('vocab_entry_id').references(() => vocabEntries.id, {
      onDelete: 'cascade',
    }),
    /** F18. Created now, unused in F16. */
    dailyCardId: uuid('daily_card_id').references(() => dailyCards.id, {
      onDelete: 'cascade',
    }),
    /** F18. Created now, unused in F16. */
    journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id, {
      onDelete: 'cascade',
    }),

    /**
     * The snapshot. What was shared, as it was when it was shared.
     *
     * Not a join: a live read against a user-owned table leaks any private
     * column added to it later, silently. This column is written by one
     * allowlisting serializer, so "what a stranger can see" is decided in one
     * file rather than by every future migration. See F16 §1 D3.
     */
    payload: jsonb('payload').notNull(),
    payloadVersion: integer('payload_version').notNull().default(1),

    createdAt: tsz('created_at').notNull().defaultNow(),
    // No expires_at. There is no cron in this app ([R11]); a TTL with nothing
    // to enforce it is a lie in the schema. Revocation is manual and immediate.
  },
  (t) => [
    /** The public read path, and the only one that takes no user id. */
    uniqueIndex('shares_slug_uniq').on(t.slug),

    /**
     * One live share per entity, which is what makes the Share button
     * idempotent and revoke unambiguous. Partial because Postgres treats NULLs
     * as distinct — a plain unique index on a nullable column would also work,
     * but the partial one is smaller and says what it means.
     */
    uniqueIndex('shares_vocab_entry_uniq')
      .on(t.vocabEntryId)
      .where(sql`${t.vocabEntryId} is not null`),
    uniqueIndex('shares_daily_card_uniq')
      .on(t.dailyCardId)
      .where(sql`${t.dailyCardId} is not null`),
    uniqueIndex('shares_journal_entry_uniq')
      .on(t.journalEntryId)
      .where(sql`${t.journalEntryId} is not null`),

    /**
     * The only non-slug access path: listShares(userId), and the cascade from
     * users.id, which without this is a sequential scan (Postgres does not
     * index the referencing side of an FK).
     */
    index('shares_user_created_idx').on(t.userId, t.createdAt.desc()),

    /**
     * Exactly one entity id, and it agrees with entity_type. One constraint
     * rather than three: `$type<>()` is a compile-time claim and this is the
     * runtime one, and it is what makes the three columns behave as a
     * discriminated union rather than as three independent nullable columns.
     */
    check(
      'shares_entity_check',
      sql`(
        (${t.entityType} = 'vocab'
           and ${t.vocabEntryId} is not null
           and ${t.dailyCardId} is null and ${t.journalEntryId} is null)
     or (${t.entityType} = 'card'
           and ${t.dailyCardId} is not null
           and ${t.vocabEntryId} is null and ${t.journalEntryId} is null)
     or (${t.entityType} = 'journal'
           and ${t.journalEntryId} is not null
           and ${t.vocabEntryId} is null and ${t.dailyCardId} is null)
      )`,
    ),
  ],
)
```

`src/lib/db/types.ts` gains:

```ts
export type Share = typeof shares.$inferSelect
export type NewShare = typeof shares.$inferInsert
export type ShareEntityType = Share['entityType']   // 'vocab' | 'card' | 'journal'
```

Generated with `npm run db:generate && npm run db:migrate` → `drizzle/0004_*.sql`. **Never hand-edit `drizzle/`.**

`src/lib/env.ts` gains one key:

```ts
/**
 * The origin share links are built against, for metadataBase and for the
 * absolute URL returned by POST /api/shares. Falls back to the Vercel-provided
 * host, then to the only port this project uses.
 */
APP_URL: z.url().default(
  process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3200',
),
```

---

## 3. Files

| File | New/Mod | Why |
|---|---|---|
| `src/lib/db/schema.ts` | Mod | The `shares` table, §2. |
| `drizzle/0004_*.sql` | New (generated) | The migration. Do not hand-edit. |
| `src/lib/db/types.ts` | Mod | `Share`, `NewShare`, `ShareEntityType`. |
| `src/lib/db/queries/shares.ts` | New | The named departure (D7). `createShare`, `getShareBySlug` (**no userId**), `getShareForEntity`, `deleteShare`, `listShares`. |
| `src/lib/share/policy.ts` | New | Pure, no imports, no `server-only`: alphabet, length, `isShareSlug`, `isPublicSharePath`, `shareHref`, `shareClaimHref`, `SHARE_EXAMPLES_MAX`, the intent-cookie name and options. Imported by the middleware, the client button and `share:check` alike — which is why it must stay dependency-free. |
| `src/lib/share/slug.ts` | New | `server-only`. `newShareSlug()` over `node:crypto`. Separate from `policy.ts` because `node:crypto` must never reach a client bundle. |
| `src/lib/share/schemas.ts` | New | zod 4 (`z.uuid()`, not `z.string().uuid()` — [R2]): `createShareSchema`, `sharedWordPayloadSchema`, `sharedPayloadSchema` (discriminated union on `kind`, one member today, with a comment naming exactly where F18 adds two). |
| `src/lib/share/serialize.ts` | New | `toSharedWordPayload(entry)` — the allowlist (D8). **No object spread in this file.** |
| `src/lib/share/intent.ts` | New | `server-only`. `setShareIntent`/`readShareIntent`/`clearShareIntent` over `next/headers`. **The F17 contract surface** (§5). |
| `src/app/s/[slug]/page.tsx` | New | The public page. `generateMetadata`, `robots`, `dynamic = 'force-dynamic'`. Sibling of `(app)`. |
| `src/app/s/[slug]/not-found.tsx` | New | One sentence, 404, no distinction between revoked and never-existed (D13). |
| `src/app/s/[slug]/claim/route.ts` | New (F16 stub, F17 owns) | Sets the intent cookie, redirects to `/signin`. F17 replaces the body. |
| `src/components/share/shared-word.tsx` | New | Presentational body of the shared page, server-safe, shared with the kitchen-sink fixture so the layout spec can drive it without a database. |
| `src/components/share/share-word-button.tsx` | New | `"use client"`. The affordance: create, the three-step share chain, the selectable URL field, two-tap Stop sharing. |
| `src/app/api/shares/route.ts` | New | `POST` — `requireApiUser()` + `ok()`/`fail()`. Verifies ownership of the entity, snapshots, mints, returns `{ slug, url }`. |
| `src/app/api/shares/[slug]/route.ts` | New | `DELETE` — `requireApiUser()`, scoped by `userId`. |
| `src/middleware.ts` | **Mod** | The `/s/` exemption via `isPublicSharePath`. **The single highest-risk edit in this plan** (D5). |
| `src/app/(app)/vocab/[id]/page.tsx` | Mod | One extra read (`getShareForEntity`) and the Share control in the foot stack. |
| `src/lib/env.ts` | Mod | `APP_URL`. |
| `src/app/layout.tsx` | Mod | `metadataBase`. |
| `src/app/kitchen-sink/share/page.tsx` | New | `?state=short|long|noexamples`. The pattern every shipped feature follows ("Reviewable without a session at /kitchen-sink/…"). |
| `scripts/check-share.ts` | New | `npm run share:check`. |
| `scripts/check-share-db.ts` | New | `npm run share:db`. |
| `tests/e2e/share-frame.spec.ts` | New | The public page's frame, at both viewports and both schemes. |
| `package.json` | Mod | Two script entries. |
| `CLAUDE.md` | Mod | Two command lines; one conventions bullet recording the `queries/shares.ts` exception and the middleware exemption. |
| `src/components/README.md` | Mod | An F16 obligations line beside F3–F10's. |
| `src/lib/vocab/links.ts` | **Unmodified** | Deliberate — D12. |
| `src/lib/db/queries/vocab.ts` | **Unmodified** | The share lookup is a third page-level read, not a second feature's concern inside `getVocabEntryDetail`. |

---

## 4. Implementation order

Each step ends somewhere the app still builds.

1. **Schema.** Add `shares` to `schema.ts`, the types to `types.ts`, `npm run db:generate && npm run db:migrate`. `npm run typecheck`. Nothing else changes.
2. **Pure modules + the offline check.** `policy.ts`, `slug.ts`, `schemas.ts`, `serialize.ts`, `scripts/check-share.ts`, the `share:check` entry in `package.json`. `npm run share:check` green. Still nothing wired to anything.
3. **The query file + the database check.** `queries/shares.ts` with the header from D7, `scripts/check-share-db.ts`, the `share:db` entry. `npm run share:db` green. Give the script a `--keep` flag that leaves one fixture row behind and prints its URL — that is how step 4 gets something to look at.
4. **The public route.** The middleware exemption, `src/app/s/[slug]/page.tsx`, `not-found.tsx`, `components/share/shared-word.tsx`, the kitchen-sink fixture. Verify with `share:db -- --keep`, then **curl the URL with no cookie jar** and confirm a 200 and not a 307. This step is the one that either works or silently does not.
5. **The API routes.** `POST /api/shares`, `DELETE /api/shares/[slug]`.
6. **The affordance.** `share-word-button.tsx`, wired into `/vocab/[id]/page.tsx` with the `getShareForEntity` read.
7. **Metadata.** `env.APP_URL`, `metadataBase` in the root layout, `generateMetadata`, `robots`, `force-dynamic`.
8. **The F17 seam.** `lib/share/intent.ts`, the claim stub route, the "Practise this word" CTA on the shared page pointing at `shareClaimHref(slug)`.
9. **Layout.** `tests/e2e/share-frame.spec.ts`; `npm run test:layout`; then `typecheck`, `lint`, `build`.
10. **Docs.** `CLAUDE.md` and `src/components/README.md`.

---

## 5. The F17 interface — frozen here, so F17 builds against it

F16 ships the href, the CTA, the cookie contract and a claim route that does exactly one thing. F17 owns everything after the OAuth round trip.

**The URL the button points at:** `shareClaimHref(slug)` → **`/s/<slug>/claim`**. Nested under the share, so the slug is in the path and no query string can be dropped. It is under `/s/`, so `isPublicSharePath` already exempts it from the middleware — which it must, because the whole point is that the visitor has no cookie. F16 ships this route as a stub (set cookie, `redirect('/signin')`) so the button never 404s; **F17 replaces its body, not its URL.**

**The state that must survive the OAuth round trip — and the one thing F17 must not get wrong.**

A `callbackUrl` **will not survive**, for two independent reasons, and the second is the fatal one:

1. `src/lib/auth/actions.ts` hardcodes `await signIn('google', { redirectTo: '/today' })`. F17 must thread a destination through it.
2. Even threaded, a **brand-new** user is intercepted by `requireOnboardedUser()` → `/onboarding`, and `src/components/onboarding/onboarding-flow.tsx:128` ends with a hardcoded `router.replace("/today")`. **Onboarding destroys the callback URL.** And the stranger this entire feature exists for is, by definition, usually a new user — so *the only path that matters is precisely the path where a redirect-based approach loses the intent.*

Therefore the intent lives in a **cookie**, and F16 fixes its shape so F17 is not inventing it:

| Property | Value | Why |
|---|---|---|
| name | `dw_share_intent` | — |
| value | the slug, 16 opaque chars | No PII, nothing to encode, nothing to sign. |
| `httpOnly` | `true` | No script reads it. |
| `secure` | `true` in production | — |
| `sameSite` | **`'lax'`** | **Not `strict`.** A `strict` cookie is not sent on the top-level navigation *back* from Google, so the intent would be invisible at exactly the moment it is needed. This is the second thing F17 must not get wrong. |
| `path` | `/` | It is read after onboarding, from a different subtree. |
| `maxAge` | 30 minutes | Long enough for an OAuth round trip and five onboarding questions; short enough that a stale intent cannot hijack a later sign-in. |
| lifecycle | deleted the moment it is consumed | One redirect, once. |

**Where F17 consumes it:** after onboarding completes, which means the natural reader is `/today`'s render or the `(app)` layout — check the cookie, clear it, `redirect('/s/<slug>/claim')` once. The two files F17 must touch are `src/lib/auth/actions.ts` and `src/components/onboarding/onboarding-flow.tsx:128`.

**What F16 guarantees F17:** `getShareBySlug(slug)` returns `{ kind: 'vocab', payload: { term, … } }`. **F17 must add the word by `term`, not by id.** The payload contains no entity uuid by design (D8), and adding by id would mean a stranger writing against a row they do not own. Adding by term routes through the existing `POST /api/vocab`, whose 23505-catch already returns `{ duplicate: true }` with the existing row — so "the viewer already has this word" is handled by code that exists.

---

## 6. The shared page itself

No session, no tab bar, and a viewer who may never sign in.

```
<Screen>                                   // tabs={false}: four tabs that all
                                           // bounce to /signin is a trap, not
                                           // navigation.
  <ScreenBody scroll padded={false} className="px-6 pb-7">
    <Eyebrow>Daily Words</Eyebrow>         // the only branding, and the only
                                           // answer to "what is this?"
    <h1 className={termSizeClass(term)}>   // identical to /vocab/[id]
    [pronunciation in font-mono] [partOfSpeech italic]
    <div className="h-px bg-rule" />
    <p>{definition}</p>
    <Eyebrow>Usage</Eyebrow>               // omitted entirely when empty —
    [examples, border-l border-rule pl-3.5] // never a heading over nothing
    <Button variant="filled" href={shareClaimHref(slug)}>
      Practise this word
    </Button>                              // the user's own words, and the
                                           // same label the private page uses
  </ScreenBody>
</Screen>
```

**No `BackLink`.** The viewer arrived from WhatsApp; there is nowhere to go back to, and a link to `/vocab` would bounce them to sign-in.

**The no-scroll budget.** `npm run test:layout` enforces three things (`tests/e2e/no-scroll.spec.ts`): the page does not scroll, `/today`'s rows clear [R19]'s 52px floor, and the tab bar's bottom edge is inside the viewport. Only the first applies to a detail-shaped screen — this page has no rows and no tab bar. The invariant it must hold is the one `chat-frame.spec.ts` states: **`document.scrollingElement.scrollHeight <= clientHeight + 1`; the *pane* scrolls, the page never does.** That is what `ScreenBody scroll` (`.dw-pane-scroll` inside `Screen`'s fixed-height flex column) delivers, and it is why nothing on this page may set `height: 100vh`, `position: fixed` or `overflow` on `<body>` — `components/README.md`: *"those belong to `Screen`, and duplicating them is how the height budget breaks."*

`tests/e2e/share-frame.spec.ts` drives `/kitchen-sink/share?state=short|long|noexamples` at 375×667 and 320×568 in both colour schemes and asserts: the page does not scroll; the pane does; the CTA's bottom edge is inside the viewport (the `viewport-fit=cover` failure, [R16]); there is **no** `nav[aria-label='Primary']`. The `long` fixture carries a 21-character unbreakable term and three 134-character examples, because the claim under test is that no string can make the page scroll.

---

## 7. Verification

### `npm run share:check` — offline, no database, no network

`tsx --conditions=react-server scripts/check-share.ts`, in the shape of `check-journal.ts`: plain assertions, non-zero exit, a `check(label, actual, expected)` helper.

**Slug generation and entropy**
- `newShareSlug()` matches `/^[0-9abcdefghjkmnpqrstvwxyz]{16}$/`.
- 10,000 draws yield 10,000 distinct values.
- The alphabet has exactly 32 symbols and contains none of `i`, `l`, `o`, `u`; `SHARE_SLUG_LENGTH === 16`; `SHARE_SLUG_BITS === 80`.
- Over 10,000 × 16 characters, **every one of the 32 symbols appears** — the assertion that catches a truncated alphabet or a stray `% 31`, which no eyeball catches.
- `isShareSlug()` rejects: wrong length, uppercase, `i`/`l`/`o`/`u`, a uuid, the empty string, `../../etc/passwd`, and a trailing slash.

**The DTO allowlist, field by field**
- Build a `VocabEntry` fixture in which **every** column carries a poison marker: `id: 'LEAK-id'`, `userId: 'LEAK-user'`, `lastShownOn: 'LEAK-date'`, `enrichmentError: 'LEAK-err'`, `suggestedCorrection: 'LEAK-corr'`, `source`, `status`, `createdAt`, `masteredAt`, `enrichmentAttempts`.
- Run `toSharedWordPayload`, then assert **two independent ways**:
  - `Object.keys(payload).sort()` deep-equals the exact expected key list — so **a new key is a failure, not a pass**. An omission-based test would let the next added field through.
  - `JSON.stringify(payload)` contains no occurrence of `'LEAK'` — which also catches a leak nested inside `examples`.
- Assert the six allowed keys carry the right values.
- Parse a poisoned payload with an extra `email` key through `sharedPayloadSchema` and assert `email` is **absent** from the result — the second, independent net at read time.
- `examples` is capped at `SHARE_EXAMPLES_MAX = 3`; a `jsonb` array containing a number yields an array of strings only.

**Route-path resolution**
- `shareHref(s) === '/s/' + s`; `shareClaimHref(s) === '/s/' + s + '/claim'`; the href has exactly two path segments.
- `isPublicSharePath` — **the highest-value assertions in the file**, because this is the function the middleware calls:
  - true: `/s`, `/s/abc…`, `/s/abc…/claim`
  - **false: `/signin`, `/settings`, `/stats`, `/search`, `/s-omething`, `/today`, `/vocab/s/1`** — the `startsWith('/s')` prefix bug, caught offline, before it disables the auth gate for a route that does not exist yet.

**The intent cookie contract**
- `SHARE_INTENT_COOKIE === 'dw_share_intent'`; `sameSite === 'lax'` (with the comment explaining that `strict` breaks the OAuth return); `httpOnly === true`; `maxAge === 30 * 60`. Assertable because the options object is exported from `policy.ts` rather than constructed inline.

### `npm run share:db` — against real Postgres

`tsx --conditions=react-server --env-file=.env.local scripts/check-share-db.ts`, in the shape of `check-journal-db.ts`: seeds throwaway users at `@example.invalid`, deletes them in a `finally`, deletion cascades.

1. **Create.** `createShare` returns a row; slug matches; `entity_type = 'vocab'`; **the other two id columns are null.**
2. **Create is idempotent under concurrency.** Two `createShare` calls in a `Promise.all` produce **one** slug and **one** row. This is the assertion that catches a read-then-insert implementation — the same class of bug `check-journal-db.ts` catches for the insight claim, and it passes every offline check.
3. **Read as an anonymous caller.** `getShareBySlug(slug)` with no user id returns the payload, and `JSON.stringify(result)` contains **none of**: the fixture user's email, their user id, the vocab entry's id, or any poison value written into the entry's private columns. This is the one assertion that proves D7's departure is safe rather than merely documented.
4. **The CHECK constraint holds.** A direct insert with two entity ids set, and a second with `entity_type = 'card'` but `vocab_entry_id` populated, are both **rejected by Postgres**. Constraints are the thing that is only ever true in the database.
5. **Revoke, and revoke by the wrong user.** `deleteShare(ownerId, slug)` → `'deleted'`. `deleteShare(strangerId, slug)` → `'not_found'` **and the row survives** — the single authenticated authorisation decision this feature makes.
6. **Read after revoke.** `getShareBySlug(slug)` is `null`.
7. **Read after entity delete.** Share a second, un-carded entry; `deleteVocabEntry(userId, id)` returns `'deleted'` **and does not throw** (the RESTRICT-would-500 case, D2); then `getShareBySlug(slug)` is `null` and the read does not throw.
8. **A carded word is unaffected.** A shared word that is on a daily card still returns `'in_use'` from `deleteVocabEntry` and keeps its share. F16 changed nothing about [R1].
9. **User delete cascades.** After the fixture user is deleted, `count(shares) = 0`.
10. **Slug uniqueness.** A hand-inserted duplicate slug is rejected by `shares_slug_uniq`.
11. **`--keep`.** Leaves one row and prints its URL, for the manual passes below.

### `npm run test:layout`

`tests/e2e/share-frame.spec.ts` as described in §6, plus the existing eighteen must still pass.

### Manual passes no script can cover

- **The middleware.** `curl -i` the share URL with **no cookie jar**. Expect `200`, not `307 → /signin`. Then repeat in a signed-out desktop browser, and again signed-in — both must see the page. *This is the one check that, if skipped, ships a dead feature that looks alive to its author.*
- **iOS.** On a real iPhone, in Safari **and** in the installed PWA: tap Share and confirm the system share sheet opens on the first tap *after* the `POST` completes. If it does not, confirm the clipboard fallback fires and the `Link copied` line appears; if that fails too, confirm the selectable URL field is present and selectable. See R1.
- **Unfurl.** Paste the link into WhatsApp and into Slack. Expect term + one-line definition, no broken image placeholder.
- **Revocation is immediate.** With the stranger's tab still open, revoke, then reload: the 404 page on the first reload. Confirms `force-dynamic`.
- **A wrong slug** hand-typed gives the one-sentence 404, not a stack trace, and says nothing different from a revoked one.
- **Dark mode** at 375px, both the shared page and the Share control.

---

## 8. Risks and open questions

1. **iOS transient user activation across an `await` — unverified.** Whether `navigator.share()` still has activation after `await fetch('/api/shares')` is the single behavioural unknown in this plan, and it could not be tested during planning. The three-step chain (D9) is designed so that every failure mode lands somewhere usable, and the selectable URL field is the floor. If step 1 turns out to reject reliably on iOS, the fix is a two-tap shape — first tap creates and re-renders, second tap (a fresh gesture) shares — which is a change to one component and no change to the API.
2. **`navigator.clipboard` needs a secure context.** `localhost:3200` qualifies; `http://192.168.x.x:3200` does not. A developer testing from a phone against a LAN IP will see the fallback fire and may read it as a bug. Stated, not fixed.
3. **Whether Next 15.5 would statically render `/s/[slug]` without `force-dynamic`** — not tested. `force-dynamic` is belt-and-braces and costs nothing at this traffic.
4. **CDN caching of a `force-dynamic` HTML response on Vercel** — believed not cached; verify with `curl -I` for `cache-control` after the first deploy. If it is cached, a revoked link could survive for the TTL, which would be a real correctness bug.
5. **`APP_URL` on preview deployments.** A statically-set `APP_URL` makes a preview emit production OG URLs. The default reads `VERCEL_PROJECT_PRODUCTION_URL`, but **which Vercel env vars are populated on this project's tier is unverified** — the roadmap already carries an open question of exactly this kind about `x-vercel-ip-timezone`. Check on a preview deploy.
6. **`robots: noindex` does not stop unfurlers** — believed true (WhatsApp, Slack, iMessage and Twitter read `og:` tags directly and ignore `robots`), verified against documentation rather than against WhatsApp itself. If an unfurler does honour it, the link still works; only the preview is lost.
7. **The middleware edit is the highest-risk single line in this batch.** `isPublicSharePath` is asserted offline, but that the middleware actually calls it *before* the redirect is only provable by curl with no cookies. Named as the first manual pass for that reason.
8. **Snapshot staleness has no in-app remedy.** Revoke-and-reshare mints a new slug and silently kills the old link. Deliberate (D9). If it bites, the remedy is `PATCH /api/shares/[slug]` that re-snapshots and keeps the slug — one route handler, no schema change.
9. **Shares are not enumerable by the user.** A word shared and then forgotten can only be found by opening it. Deliberate (D9). `listShares(userId)` exists and is tested so the remedy — a `Shared` block on `/profile` beneath the badge shelf — is a component and not a query.
10. **`daily_cards` has no delete path in v0.1.0**, so the `ON DELETE CASCADE` on `shares.daily_card_id` is exercised by nothing that exists. F18 inherits an untested constraint and should assert it in its own `:db` script.
11. **F11 (back-nav origin) adds a `?from=` param to detail URLs.** The share page has no back link and consumes no origin, so the two features do not interact — but F11's own plan should be read to confirm it does not expect a `share` origin.
12. **The entropy arithmetic in D6 is done by hand** (`32^16 = 2^80 ≈ 1.21 × 10^24`; `G ≈ 1.2 × 10^21` guesses for one expected hit at `N = 1,000`). It is written out so it can be checked rather than trusted.
13. **`payload_version` is speculative.** Nothing reads it in F16. It is one `integer` column and it is the only thing that will tell an F18-era reader an old payload shape from a corrupt one, but if F18 finds no use for it, deleting it is cheaper than adding it later.
