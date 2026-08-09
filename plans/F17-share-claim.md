# F17 — Share claim: stranger → Google → the word is theirs → chat

A person who is not a user opens a shared word, taps **Practise this word**, signs
in with Google once, and arrives inside the practice chat for that word — now a
row in their own collection. The user's words:

> "in the shared page version of detailed vocab, viewers can click practice this
> word, which will bring him to sign in as google, then directly add this vocab
> to his collection (background process), and directly open the chat page for
> this new user on this vocab."

This is the only feature in v0.2.0 that crosses four subsystems each of which was
written assuming an established user: Auth.js sign-in, F7's onboarding gate, F3's
vocab write, F6's chat. Its whole job is to make those four seams explicit.

**Supersedes:** nothing outright. It *extends* three documented decisions and one
of them is a real departure, called out in §2 D4:

- `plans/F7-onboarding.md` §3 "Explicitly out of scope" — F17 introduces a second
  way for `onboarded_at` to be set that is not the five screens. F7 §13.8's rule
  that "an abandoning user restarts at question one" is untouched.
- `plans/F6-vocab-chat.md` §12.2 (the `not_ready` refusal) is untouched as code,
  but F17 arranges that a claimed word is essentially never `pending` when the
  chat page renders. See §2 D8.
- `src/lib/db/schema.ts`'s `source: text('source').$type<'manual' | 'suggested'>()`
  gains a third value. See §3.

---

> ## SHIPPED — 2026-08-09. Read this before §2; six decisions landed differently.
>
> All ten outcomes, both check scripts (`claim:check`, 93 assertions; `claim:db`,
> 59) and one end-to-end claim through the real server action against a minted
> session, with no Google hop. Where this plan and F16's shipped code disagreed,
> **F16's code won on the merits** each time, and the differences are these:
>
> | Planned | Shipped | Why |
> |---|---|---|
> | **D2/D3**: a server action on the public page sets the cookie, then `signIn()` | **F16's `/s/[slug]/claim` GET route** sets the cookie and redirects to `/claim`; `startShareClaim` still calls `signIn('google', { redirectTo: CLAIM_PATH })`, from `/claim` itself | This is **R1's own stated fallback**, and R1 called the planned version "the single riskiest unverified assumption in the plan". F16 had already built the route, and `CLAUDE.md` had already frozen it as "a GET that sets a cookie and redirects". Measured: `Set-Cookie` rides the 307 out and `cookies().delete()` rides the 303 back. |
> | `/claim` is reached **only** with a session, so §4 says `src/middleware.ts` needs no change | **`isClaimPath` is exempted in the middleware**, and `/claim` renders its own Google button for a visitor with no session | Follows from the row above. A stranger arrives at `/claim` cookie-in-hand and session-less; bounced to `/signin` they would sign in against `redirectTo: '/today'`, land in `/onboarding`, and the intent would expire unread. Exact-match, never `startsWith`. The alternative — a conditional on `/signin` that sniffs for the cookie — would also have claimed a user who abandoned at Google's consent screen, which D3 exists to prevent. |
> | `getShareTargetForClaim(slug)` joins the sharer's live `vocab_entries` row | It reads **four columns off `shares` and joins nothing** | F16 D3's snapshot already carries the four enrichment fields (§0 spotted this). The claim now reads no user-owned table at all, and the copy survives the owner deleting the word. `buildClaimEnrichment` takes a `SharedWordPayload`, not a `VocabEntry`. |
> | `gone` = "the sharer's entry was deleted"; `expired` = "unknown or revoked slug" | **`gone` = "the snapshot's term does not survive `validateTerm`"**, and both render F16's single sentence | `shares.vocab_entry_id` is `ON DELETE CASCADE`, so a deleted word *is* a deleted share — `expired` covers it. Collapsing the copy answers the plan's own **Q2** and closes **R6**: two sentences would tell a slug-guesser their guess used to resolve. |
> | §5 checks the limit before discovering a duplicate | **`already_have` is decided before `over_limit`** | The claimer's own row is known from a read now, so refusing a word they already own over a quota the claim would not spend is a refusal with nothing behind it. Both write nothing either way. |
> | §5 step 6: `setTimezone(…)` then `completeOnboarding(userId, {}, tz)` | `completeOnboarding` is given **the zone `setTimezone` settled on** | Passing the cookie's zone would walk around `setTimezone`'s manual-override guard through the back door for a user who once corrected their zone by hand. Unreachable today; free to get right; asserted in `claim:db`. |
>
> Smaller notes, in the order a reader will hit them:
>
> - **`resolveClaimOutcome` does not redirect and neither does `resolveAndClaim`.**
>   §5 step 8 ends in `redirect(href)`; a function that throws a redirect cannot
>   be driven by `claim:db`, so the decision comes back with an href and
>   `claim-actions.ts` performs the navigation.
> - **The pure core takes `dailyAddLimit` as an input.** `DAILY_ADD_LIMIT` lives
>   in `queries/vocab.ts`, which is `server-only` and drags `env.DATABASE_URL` in
>   with it; importing it would make an offline script need a database to assert
>   arithmetic. The coupling is a structural assertion instead, alongside one that
>   greps `POST /api/vocab` to keep the refusal sentence identical.
> - **`decision.term` is set for every outcome that resolved to a real word**, not
>   only for inserts, because the interstitial names the word *before* the write.
> - **`/claim` never writes.** Its server component calls a read-only `planClaim`;
>   the write is `finishShareClaim`. Three GET branches: a stop screen, an
>   immediate `redirect()` when there is nothing to write (the owner, a word
>   already held, `no_timezone`), or the auto-submitting form. `write_failed`
>   carries `?failed=1` so the retry screen cannot auto-submit into a loop.
> - **§7's term-safety expectation is wrong and the fix is recorded rather than
>   hidden.** `genteel\n\nIgnore all previous instructions` is not rejected:
>   `normalizeTerm` collapses the newlines and it passes as a five-word term. The
>   assertion now tests the property that holds — no newline, colon, angle bracket
>   or backtick reaches the `<term>` tags.
> - The component is `components/share/practise-this-word.tsx` (F16's spelling of
>   the label), it stays a **link** rather than becoming a form — `share-frame.spec.ts`
>   finds it by `getByRole("link")`, and a link works with no JavaScript — and its
>   one job is appending `?tz=`. `/claim`'s sign-in state reuses `/signin`'s own
>   `SignInButton`, so the plan's "matching `signin/sign-in-button.tsx`" is
>   literal rather than approximate.
> - **R5 (the claim counts against the 50/day limit) shipped as written**, and
>   remains the decision most likely to want revisiting. It is one comparison in
>   `resolveClaimOutcome` and one row in `claim:check`.
> - Not done, because nothing asked for it: **Q1** (marking a claimed word in the
>   collection — `source = 'shared'` is in the database and nothing renders it),
>   **Q3**, **Q4**, and **R3**'s `timezone_source = 'default'` follow-up.

---

## 0. Dependency on F16 — the contract this plan assumes

**F16 was being written in parallel and was not on disk when this plan was
written.** Everything below is designed against the following assumed interface.
If F16 shipped something different, the *names* change and nothing else does;
if F16 shipped less, F17 implements the missing piece where noted.

> **F16 HAS NOW SHIPPED. Read this before the table below, which is a guess and
> is wrong in four places.**
>
> | Assumed here | What is actually on disk |
> |---|---|
> | `src/app/(public)/s/[slug]/page.tsx` | `src/app/s/[slug]/page.tsx` — a plain sibling of `(app)`, no route group. The `src/middleware.ts` exemption exists and is `isPublicSharePath()` from `lib/share/policy.ts`; do not touch the matcher. |
> | `src/lib/share/links.ts` with `shareHref(slug)` | `src/lib/share/policy.ts` — `shareHref`, `shareClaimHref`, the slug alphabet, `isPublicSharePath`, and the cookie name and options. It imports nothing at all, on purpose (Edge + client bundle + offline tsx), so put `CLAIM_PATH` there rather than in a new file. |
> | a share row with `owner_user_id`, `kind`, `entity_id` | `shares` with `user_id`, `entity_type`, and **three nullable FK columns** (`vocab_entry_id`, `daily_card_id`, `journal_entry_id`) under one CHECK. F18's two types need no migration. |
> | `≥128 bits` of slug entropy | **80 bits** — 16 Crockford-base32 characters. F16 D6 does the arithmetic; R7's "under 128 bits of entropy" sentence should be read against 80. |
>
> Three things F16 built that this plan expected to build itself:
>
> - **The claim cookie is already implemented**, as `dw_claim` with F17's own
>   signed shape (brief [C1]) *and* [C2]'s `w` field, in
>   `src/lib/share/intent.ts`: `encodeClaimIntent(intent, secret)` /
>   `decodeClaimIntent(raw, secret)`, HMAC-SHA256, `timingSafeEqual`, `exp`
>   enforced inside the signature, 10-minute TTL, `SameSite=Lax`. The secret is a
>   parameter, not an import, so `claim:check` can drive it with no `.env`.
>   `npm run share:check` already feeds it the hostile-input list from §7. **What
>   is missing is `claim-cookie.ts`'s job of reading and clearing the jar**, and
>   the fact that nothing consumes the cookie yet.
> - **`/s/[slug]/claim` exists as a stub**: it validates the slug, confirms the
>   share resolves, sets `dw_claim`, and redirects to `/signin`. It performs no
>   write. It reads optional `?tz=` and `?w=` and validates both. F17 replaces its
>   body — or supersedes it entirely with D2's `redirectTo: '/claim'` shape, in
>   which case delete the route and repoint `shareClaimHref`; **either way that
>   href is the one thing F16's public page links to.**
> - **`getShareBySlug(slug)` returns a snapshot, not the entry.** F16 D3 chose
>   snapshot-not-live for all three entity types, so `payload` carries
>   `{ kind, term, pronunciation, partOfSpeech, definition, examples }` and **no
>   entity uuid at all**. That is the "strictly better" option D8's last paragraph
>   hoped for: the four enrichment fields are on the share row already, so a claim
>   can copy them without reading the sharer's live entry, and they survive the
>   owner deleting the word. `getShareTargetForClaim` still needs writing if F17
>   wants the sharer's *live* row for anything — but D8's copy no longer needs it.

| Assumed from F16 | Used by F17 for | If F16 did not ship it |
|---|---|---|
| `shares` table with an opaque high-entropy `slug` (≥128 bits, [S3]), `owner_user_id`, `kind` (`'vocab' \| 'card' \| 'journal'`), `entity_id`, and revoke-by-delete | resolving a claim | F17 cannot proceed. Stop and report. |
| `src/lib/db/queries/shares.ts` — the **named public-read departure** from the "`userId` is the first parameter of every query function" rule, documented in that file | reading a share row with no session | F17 creates the file with the same comment. |
| A public route group that is a **sibling** of `(app)`, e.g. `src/app/(public)/s/[slug]/page.tsx`, and a `src/middleware.ts` matcher exemption for it | rendering the shared word page the button lives on | F17 does **not** create this. Stop and report — see the brief: "Public share routes must also be siblings … the single most likely mistake across F16–F18." |
| `src/lib/share/links.ts` with `shareHref(slug)` | nothing directly | F17 puts `CLAIM_PATH` in `src/lib/share/claim.ts`; move it to `links.ts` if F16 made that file. |

**F17 adds exactly one function to F16's query file** (see §4):
`getShareTargetForClaim(slug)`, returning the share row joined to the *sharer's
own* `vocab_entries` row. It is the second sanctioned no-`userId` read and it
carries its own comment saying why.

**Dependency on F14 (duplicates), also parallel.** F17 depends on exactly one
behaviour, which is already in `src/app/api/vocab/route.ts` today and which the
brief says F14 "extends; it does not invent": *an insert that collides with
`UNIQUE (user_id, lower(term))` is caught as 23505, the existing row is re-read,
and the caller is handed that row with `duplicate: true` rather than an error.*
F17 reuses that shape by calling the same query-layer functions
(`createVocabEntry` / `findEntryByNormalizedTerm`) and translating the result
into a redirect. **F17 does not fork the duplicate logic and does not add a
second `lower(term)` lookup path.** If F14 moves this into a shared
`addTermForUser()` helper, F17's `resolveAndClaim` calls that helper instead —
one call site, one line.

---

## 1. The central problem, and the answer

`src/app/(app)/layout.tsx` is four lines of guard:

```ts
const { profile } = await requireOnboardedUser()
```

and `requireOnboardedUser()` in `src/lib/auth/guards.ts` does
`if (!profile || !profile.onboardedAt) redirect('/onboarding')`. `/vocab/[id]/chat`
is inside that group. A brand-new user arriving from a share has `onboarded_at
IS NULL` — `ensureProfile` is called from the Auth.js `createUser` event and
deliberately leaves it null ("creating a row must never onboard anyone, or the
gate would be passable by hitting an API route"). So the destination the whole
feature exists to reach bounces to `/onboarding`.

### The options

**(a) Run the full onboarding, then continue to the chat.**
Honest, zero new state, and cheaper than it sounds: F7 shipped a **`Skip all`**
button on screen one, so the floor is two taps. But it is still a five-screen
questionnaire wedged between a curious stranger and the one thing they tapped,
and it arrives *after* an OAuth hop they have already paid for. It also needs
`/onboarding` to learn a `?next=` parameter, which means the onboarding flow
gains a redirect target — a new, attacker-adjacent surface on the one screen
that currently has none. Rejected as the primary path. **Kept as the fallback**
(see D3).

**(b) Skip/defer onboarding and let the chat run on a null profile.**
The tempting one, and it *technically works*: I read
`src/lib/profile/context.server.ts` and `src/lib/profile/context.ts`.
`buildProfileContext(null)` is documented as "Pure, synchronous, **total**.
`null`, `undefined` and an all-null row all produce the same documented empty
block", and it emits:

```
<user_profile>
unknown: the user skipped these questions
tone: patient
</user_profile>
```

`src/lib/llm/prompts/chat-system.ts` then adds `EMPTY_PROFILE_NOTE` — "You know
nothing at all about them… Put them instead in a situation any adult anywhere
would recognise" — and `PROFILE_CONTEXT_GUARD` stops the model opening by asking
the user to fill in a profile. **So the chat prompt is genuinely fine with a null
profile.** That is not the problem.

The problem is the *gate*, and F7's promise behind it. F7 §2 lists F6 and F8 as
**hard blocks** on the profile contract, and `src/app/(app)/layout.tsx` says in
so many words: "`requireOnboardedUser()` is what makes F7's guarantee to F5 and
F9 true: a user cannot reach any authed page without a profile row carrying a
valid IANA timezone, **so neither feature carries a null branch**." Option (b)
means either weakening that guard for one arrival path — a conditional inside
the app's strongest invariant, which is exactly the shape CLAUDE.md warns turns
into an infinite redirect — or moving the chat out of `(app)`, which would fork
the chat page. Rejected.

**(c) A minimal onboarding: timezone only, detected not asked, the rest
deferred.** Chosen. See below.

**(d) Something else** — a `/practice/[slug]` public chat that does not require
an account at all was considered and rejected: it needs an anonymous
`vocab_entries` row (impossible, `user_id` is `NOT NULL` with an FK), and the
user's ask is explicitly "add this vocab to **his** collection".

### The answer: (c), and it introduces no new state

**The claim runs the equivalent of pressing `Skip all`, server-side, with a real
detected timezone.** Concretely, `resolveAndClaim` calls the *same*
`completeOnboarding(userId, EMPTY_ANSWERS, detectedZone)` that
`POST /api/profile/complete` calls when the user presses `Skip all`, with all
five answer columns `null`.

Three things make this the right call rather than a cheat:

1. **The resulting row is byte-identical to a `Skip all` row.** F7 designed for
   that user deliberately and at length — the `unknown:` line, the guard
   sentence, `EMPTY_PROFILE_NOTE`, the "worked example — empty profile" section
   of F7 §9. F17 adds **no state the app did not already fully support**, which
   is the strongest argument available for any option here. F7 already accepted
   that "the user skipped this" and "the user cleared this" are the same state
   (§5); "the system skipped this on their behalf" joins them.
2. **`onboarded_at`'s meaning is unchanged and stays true.** Read the three
   places that consume it — `lib/auth/guards.ts` (the gate),
   `app/onboarding/page.tsx` (the inverse gate), and `app/api/profile/route.ts`
   (409 for a not-yet-onboarded PATCH). Its meaning has never been "answered the
   questions"; it is "**this user has been through first-run and carries a
   timezone we did not guess**". A claimed user satisfies that exactly. F5's
   `resolveTimezone(profile)` and F9's day-boundary maths get a real zone, not a
   default. Nothing that reads `onboarded_at` reads it to mean "has a
   personality on file".
3. **The timezone is detected, never asked** — CLAUDE.md's rule, honoured
   literally. It is read in the browser on the *public share page*, before the
   OAuth hop, by `detectTimeZone()` from `src/lib/profile/timezone.ts` (the same
   function `components/profile/timezone-capture.tsx` uses), and it rides in the
   intent cookie. On the server it goes through `resolveRequestTimezone()` and
   `isValidTimeZone()` before it is written.

### On "writes may not fall back to a default timezone"

CLAUDE.md: "Reads may fall back to a default timezone; **writes may not**.
`POST /api/cards` refuses with 409 rather than date a card by guesswork."
`completeOnboarding` is a write and it *does* fall back
(`requestedTimezone ?? existing?.timezone ?? FALLBACK_TIMEZONE`) — because the
column is `NOT NULL`. F17 refuses to lean on that:

> **If the intent cookie carries no valid zone, F17 does not set `onboarded_at`.**
> It renders the claim outcome and sends the user to `/onboarding` — option (a),
> as a degradation rather than as the happy path. `/onboarding` mounts
> `timezone-capture.tsx`, which is the app's designated way to get a real zone.

This is the one place the plan spends a screen rather than guess a zone, and it
is the correct trade: the failure mode of a guessed zone is a daily card dated a
day wrong, forever, silently.

**A gap worth naming (Risks R3):** `profiles.timezone` defaults to
`'Asia/Jakarta'` and `timezone_source` defaults to `'detected'`, so a row that
has *never* been detected is today indistinguishable from one detected in
Jakarta. F17 does not fix this and does not rely on it — it checks the cookie's
zone, not the row's.

### Is the user ever prompted to finish?

**No, and deliberately.** F7 §3 explicitly rules out "push notifications,
reminders, or a **'finish your profile' nag anywhere in the app**". F17 adds no
nag, no banner, no badge on the tab bar. The surface already exists and is
already on `/profile`: F7's `<EditProfileLink />` — "Your answers →" — which F9
mounts. A claimed user who wants a better chat finds it there, on the screen
where a person goes looking for their own settings. That is the whole of the
deferral.

---

## 2. Decisions

**D1 — The payload that crosses the OAuth round trip is the share slug, never
the entity id.**
The slug is opaque, high-entropy, server-resolved, and revocable by deleting one
row ([S3]). The entity id is a `vocab_entries.id` uuid, and carrying it would
mean the claim endpoint accepts "add the word with this id to my collection" —
which is a general-purpose read oracle over every user's collection, gated only
on uuid unguessability, and it puts an entity uuid one step from a public URL,
which [S3] forbids outright. **Disqualifying.** The slug also gives revocation
for free: an id has no revoked state.

**D2 — The round trip is a fixed `redirectTo` plus a signed HttpOnly cookie.
The cookie is authoritative; `redirectTo` carries no data at all.**

```
signIn('google', { redirectTo: CLAIM_PATH })     // CLAIM_PATH === '/claim', a frozen literal
```

Auth.js v5 supports `redirectTo` (it becomes the `callbackUrl`) and it is
validated by the default `redirect` callback. F17 does not rely on that
validation, because the default callback's relative-URL branch (`url.startsWith('/')`)
has a documented bypass class — `/\evil.com` and `//evil.com` both start with
`/`, and browsers normalise `\` to `/` in the authority position. **F17 removes
the class structurally: no user-derived string is ever concatenated into
`redirectTo`, anywhere.** `claim:check` asserts `CLAIM_PATH` is exactly `'/claim'`
and that no code path builds a redirect target from cookie or form input other
than by calling `vocabDetailHref` / `vocabChatHref` / `vocabListHref` on a uuid
the server itself just read or wrote.

The payload lives in `dw_claim`:

| Attribute | Value | Why |
|---|---|---|
| `HttpOnly` | yes | no script, first- or third-party, can read or forge it |
| `SameSite` | **`Lax`** | **load-bearing.** The return from `accounts.google.com` is a cross-site **top-level GET navigation**; `Lax` sends the cookie, `Strict` does not. `Strict` here is a silent, 100%-reproducible feature failure that looks like "the claim just doesn't happen". |
| `Secure` | `process.env.NODE_ENV === 'production'` | mirrors how Auth.js names its own cookie (`__Secure-authjs.session-token` in prod) |
| `Path` | `/` | must survive `/s/[slug]` → `/api/auth/*` → `/claim` |
| `Max-Age` | `600` | ten minutes is a generous OAuth hop and a short replay window |
| value | `v1.<base64url(slug|tz|exp)>.<hmac-sha256 over AUTH_SECRET>` | tamper-evident and self-expiring |

Signing is defence in depth rather than the primary control — the slug is public
and the cookie is HttpOnly, so forging it requires the user's own devtools and
buys them nothing they could not get by visiting the link. It earns its ten
lines by making `exp` enforceable and by giving `claim:check` something to feed
hostile inputs to.

**Rejected alternatives:** the `redirect` callback in `src/auth.ts` (global,
untyped, and it would have to sniff the target — a conditional inside the auth
config is the last place a share feature should live); a `?slug=` query param on
`redirectTo` (data in an open-redirect-shaped position, for no gain); Auth.js's
own `authjs.callback-url` cookie (not ours to overload).

**D3 — Sign-in is started by a *new* server action, not by changing
`signInWithGoogle`.**
`src/lib/auth/actions.ts` keeps `redirectTo: '/today'` and is not touched. F17
adds `startShareClaim` in `src/lib/share/claim-actions.ts`. One reason: a user
who abandons at the Google consent screen and later signs in from `/signin` must
**not** be silently claimed. Because `/signin`'s action still targets `/today`
and the claim only ever runs at `/claim`, an abandoned intent quietly expires.
No surprise writes.

**D4 — The claim silently completes onboarding by calling `completeOnboarding`
with five nulls.** The full argument is §1. The departure being recorded: F7's
`app/api/profile/complete/route.ts` says "**The only thing that sets
`onboarded_at`**". After F17 that sentence is false, and the fix is to amend
that comment in the same commit — the brief's rule ("must record this reversal
in that route's comment rather than silently deleting it", [S4], applied by
analogy). The amended comment should read: *the only HTTP route that sets it;
`lib/share/claim.server.ts` sets it too, by calling the same query function with
five nulls, for a user who arrived from a share.* `completeOnboarding`'s
`coalesce(onboarded_at, now())` makes both paths idempotent against each other.

**D5 — The claim runs in a Next server action, invoked from a form on `/claim`.
Not the Auth.js `signIn` event, not a GET render.**

- *The `signIn` event callback* — rejected on two independent counts. It has no
  access to the request (Auth.js v5 events receive `{ user, account, profile,
  isNewUser }`, not the cookie jar), so it cannot see the intent. And a throw
  inside it surfaces as a `CallbackRouteError` and bounces the user to
  `/signin?error=…` — **a failed word-add would break sign-in itself**, which is
  the worst possible coupling. The rule this encodes: nothing in the auth flow
  may depend on a feature succeeding.
- *A server-component `/claim/page.tsx` that mutates during render* — rejected.
  It is a GET that writes: prefetchable by `<Link>`, replayed on refresh,
  triggerable by any page that links to it, and invisible to Next's action CSRF
  machinery.
- *A `POST /api/share/[slug]/claim` route handler* — workable, but it needs the
  client to hold the slug (it is in an HttpOnly cookie), or the slug in the URL
  (back to D1), and it needs its own CSRF story.
- **Server action, chosen.** POST-only, `Origin`/`Host`-checked by Next 15, bound
  to an encrypted action id, and it can `redirect()` to the chat itself. It reads
  the cookie directly, so the form carries **no** claim data — nothing
  submittable can change what gets claimed.

**D6 — The interstitial auto-submits but is a real, visible, tappable form.**
`/claim/page.tsx` renders a one-line screen ("Adding *genteel* to your words…")
and a `<form action={finishShareClaim}>` with a real button. A small client
component calls `form.requestSubmit()` once on mount. With JS the user sees the
sentence and then the chat; without JS, or on a slow client, they see a working
button instead of a dead screen. It also means the mutation is never a bare
navigation. The word in the sentence comes from a server-side read of the share,
so the screen is not blank while the write happens.

**D7 — `source = 'shared'`. A third value, added to the TypeScript union only.**
See §3 for why this needs no migration. The three candidate choices:

- `'manual'` — **wrong, and quietly so.** `src/lib/gamification/levels.ts` says
  the collector level is "by count of **manually added** words — `source = 'manual'`",
  and `src/lib/db/queries/stats.ts:95` implements it. Reusing `'manual'` means
  eight badge titles from "Word Picker" to "Barnaby's Ghost" start counting words
  the user never typed. A stranger who claims one word is a "Word Picker". The
  badge's meaning changes with no code change anywhere near it.
- `'suggested'` — wrong for a different reason: `listKeptFromDiscover` in
  `src/lib/db/queries/vocab-suggestions.ts` renders exactly these rows as the
  design's "**Kept from Discover**" strip. A claimed word would appear under a
  heading naming a feature the user has not opened.
- `'shared'` — correct. `stats.ts`'s `eq(source, 'manual')` and
  `vocab-suggestions.ts`'s `eq(source, 'suggested')` both keep working unchanged,
  and both keep *meaning* what they say. **The traced consequence of adding a
  third value is therefore: none, for either consumer.** The consequence of not
  adding it is a silently redefined badge. The `vocab_entries_user_source_idx`
  index on `(user_id, source)` serves all three equally.

**D8 — The claimed row copies the sharer's enrichment and starts `ready`. Zero
model calls.** This is the best idea in the plan and it is worth the paragraph.

`src/app/(app)/vocab/[id]/chat/page.tsx` gates hard on readiness:

```ts
if (!state.ready) { /* "Still looking this word up" / "Practice needs the meaning first." */ }
```

and `loadEntry(..., requireReady: true)` in `src/lib/chat/service.ts` refuses
with `NOT_READY` independently. Meanwhile `POST /api/vocab` "**No LLM call,
ever**" — the durable write is split from the model call precisely so it cannot
time out. So the naive claim (insert → `pending` → redirect) lands a brand-new
user, five seconds after their first ever sign-in, on a screen that says *come
back later*. That is the whole first impression of the product, spent.

The fix: at claim time, read the sharer's own row and copy
`part_of_speech`, `pronunciation`, `definition`, `examples` into the new row in
the same INSERT, with `enrichment_status = 'ready'`.

*Is copying another user's definition correct?* Yes, and provably so: I read
`src/lib/llm/prompts/vocab-enrich.ts` and it takes **only the term**. There is no
profile input, no `userId`, no personalisation — unlike `chat-system.ts` and
`suggest-words.ts`, which do take `ProfileContext`. The four copied fields are a
deterministic-ish function of the term alone, so the copy is the same string the
claimer's own enrichment call would have produced, minus one model call, minus
55 seconds of latency budget, minus one unit of free-tier quota. It is a cache
hit, not a disclosure.

What is **not** copied, and why:

| Field | Copied? | Why |
|---|---|---|
| `part_of_speech`, `pronunciation`, `definition`, `examples` | yes | term-derived, model-generated, not personal |
| `enrichment_status` | forced `'ready'` | the point |
| `enrichment_attempts` | **no**, starts `0` | the claimer keeps all three of their own retries |
| `suggested_correction` | **no**, `null` | it is a suggestion about the *sharer's* typo; a share should carry the word, not the sharer's spelling doubt |
| `enrichment_error` | **no**, `null` | |
| `status`, `mastered_at`, `last_shown_on` | **no** | the sharer's practice history is theirs |
| `source` | forced `'shared'` | D7 |

*If the sharer's row was never enriched* (`pending` or `failed` — reachable:
a share created before enrichment landed, or the owner later pressing "no, I
meant that spelling", which `clearCorrection` turns into
`enrichment_status = 'failed'` with the fields nulled): the copy is skipped, the
new row is inserted `pending`, **and the user is redirected to
`/vocab/<id>` — the detail page — not to the chat.** The detail page already
owns the pending/failed state and the retry affordance (F3/F4); the chat page
owns only a dead end. One line of routing turns the bad first five seconds into
an ordinary one. `buildClaimEnrichment()` returning `null` is what makes this
decision, and it is pure and offline-testable.

**Recommendation to F16 (coordination point, not a blocker):** *only allow a
share to be created from a `ready` entry* — "You can share a word once we've
looked it up." That makes the fallback path above nearly unreachable. F17 keeps
the fallback regardless, because a row can go `ready → failed` after the share
exists. A second F16 option — snapshotting the four fields onto the `shares` row
at creation — is strictly better still (it also survives the owner deleting the
word) and F17 will use it if F16 provides it; §4 marks the one function that
changes.

**D9 — The claim is subject to `DAILY_ADD_LIMIT`.**
`DAILY_ADD_LIMIT = 50` is a rolling 24h window (`lib/db/queries/vocab.ts`:
"Rolling window, not a calendar day: needs no timezone and no profile"). The
argument for exempting a claim is that it costs no model call. It loses: nothing
stops one account claiming a thousand shares, and an exempt path is a limit that
is not a limit. So the claim counts, and is refused at 50 with the **same
message the API already returns verbatim** — "That's 50 words in a day. Come back
tomorrow." — rendered on `/claim` with a link to `/vocab`. A user reaching this
is by construction an established user (a brand-new account cannot have 50 rows),
so `/vocab` is a real destination for them. Noted in Risks as the one decision
most likely to want revisiting.

**D10 — Three arrival states, three traces.** See §5 for the full table. The
short form:

| Who taps | Onboarding | Insert | Lands on |
|---|---|---|---|
| Brand-new user | `completeOnboarding(id, {}, tz)` | new row, `source='shared'`, `ready` | `/vocab/<newId>/chat` |
| Signed-in established user | untouched | new row, or the existing row on 23505 | `/vocab/<id>/chat` |
| The sharer, on their own link | untouched (already onboarded) | **none** | `/vocab/<theirOwnId>/chat` |
| Signed-in but never onboarded (abandoned the flow, then tapped a share) | treated as brand-new | new row | `/vocab/<newId>/chat` |

The owner case is a genuine no-op: `share.ownerUserId === session.user.id`, so
`share.entityId` **is** their entry id and there is nothing to add. They are sent
to its chat, because "practise this word" is what they tapped. Zero writes, and
`claim:db` asserts the row count is unchanged.

---

## 3. Schema changes

### `vocab_entries.source` — a third value, and **no migration**

```ts
// src/lib/db/schema.ts
source: text('source').$type<'manual' | 'suggested' | 'shared'>().notNull(),
```

The column is plain `text`. There is **no** pgEnum, no `CHECK`, no domain — the
union is a TypeScript-level refinement over `text`, exactly like
`enrichment_status` and `timezone_source`. Widening a `$type<>` union produces no
DDL. **`npm run db:generate` must emit no new migration file; if it does,
something else changed and the run should be discarded rather than committed.**
This is asserted as a manual verification step in §7, not by a script.

The existing index needs no change:

```ts
index('vocab_entries_user_source_idx').on(t.userId, t.source)
```

It already serves `WHERE user_id = $1 AND source = $2` for any value of `$2`;
F9's `= 'manual'` count and Discovery's `= 'suggested'` list both keep their
index scan and both keep returning exactly what they returned before.

Three TypeScript sites must widen with it, and **all three are compile errors if
missed** — which is the whole reason this is safe:

1. `src/lib/db/types.ts:30` — `VocabSource` derives from the schema; only the
   trailing comment `// 'manual' | 'suggested'` needs editing.
2. `src/lib/vocab/schemas.ts:131` — `source: z.enum(["manual", "suggested"])` in
   `vocabDetailResponseSchema`. Used only via `z.infer` (never as a runtime
   parser), so the failure mode is `src/lib/vocab/serialize.ts` failing to
   typecheck when it assigns `entry.source`. Widen the enum.
3. `src/lib/db/schema.ts:159` — the index's comment says F9 counts
   `source = 'manual'`. Extend it to say that a third value `'shared'` exists and
   that this is *why* claimed words do not inflate the collector level.

### `shares` — nothing

F17 adds no column to F16's table. If F16 chose to snapshot enrichment onto the
share row, F17 reads it; if not, F17 reads the sharer's live entry. Either way
the difference is confined to `getShareTargetForClaim`.

### `profiles` — nothing

The claim writes through `setTimezone` and `completeOnboarding`, both of which
exist.

---

## 4. Files

### Created

| Path | Why |
|---|---|
| `src/lib/share/claim.ts` | **Pure, no I/O, no `server-only`.** `CLAIM_PATH`, `CLAIM_COOKIE`, the `ClaimIntent` type, `buildClaimEnrichment(sharerEntry)`, and `resolveClaimOutcome(input)` — the whole state machine as one total function over a plain object. This is what `npm run claim:check` drives. Everything decidable is decided here. |
| `src/lib/share/claim-cookie.ts` | `server-only`. `encodeClaimCookie(intent)` / `decodeClaimCookie(raw)`: HMAC-SHA256 over `AUTH_SECRET` via `node:crypto`, `exp` enforcement, length cap, slug charset check, `isValidTimeZone` on the zone. Constant-time compare (`crypto.timingSafeEqual`). |
| `src/lib/share/claim.server.ts` | `server-only`. `resolveAndClaim(userId, intent)`: reads the share, calls `resolveClaimOutcome`, performs the writes in order (onboard, then insert), returns an outcome plus an `href`. The only file that both reads a share and writes a vocab row. |
| `src/lib/share/claim-actions.ts` | `'use server'`. `startShareClaim(slug, formData)` — sets the cookie, then either claims inline (already signed in) or `signIn('google', { redirectTo: CLAIM_PATH })`. `finishShareClaim()` — reads the cookie, calls `resolveAndClaim`, clears the cookie, `redirect()`s. |
| `src/app/claim/page.tsx` | The interstitial. **A sibling of `(app)`, like `/onboarding` and `/signin`** — it must run for a user whose `onboarded_at` is still null, and putting it inside the group would make it redirect to `/onboarding` before it could set `onboarded_at`. `export const dynamic = 'force-dynamic'` and `export const maxDuration = 60` (the rare inline-enrich fallback). |
| `src/app/claim/claim-runner.tsx` | `'use client'`. `useEffect` → `form.requestSubmit()`, once, guarded by a ref (the same discipline as F6's `firedRef`). Renders nothing. |
| `src/components/share/practice-this-word.tsx` | `'use client'`. The button F16's public page renders. Holds a hidden `tz` input filled from `detectTimeZone()` on mount, and a `useFormStatus` pending label — "Taking you to Google…", matching `signin/sign-in-button.tsx` so the two screens speak the same sentence. |
| `scripts/check-claim.ts` | `npm run claim:check`. |
| `scripts/check-claim-db.ts` | `npm run claim:db`. |

### Modified

| Path | Change |
|---|---|
| `src/lib/db/schema.ts` | `source` union gains `'shared'`; the index comment explains the F9 consequence. |
| `src/lib/db/types.ts` | Comment on `VocabSource`. |
| `src/lib/vocab/schemas.ts` | `vocabDetailResponseSchema.source` enum gains `"shared"`. |
| `src/lib/db/queries/vocab.ts` | Add `createClaimedVocabEntry(userId, term, enrichment)` — one INSERT that writes the term, `source: 'shared'`, and the four copied fields together. Not an insert-then-update: the row must never be observable in a state the chat page would refuse. |
| `src/lib/db/queries/shares.ts` (F16's) | Add `getShareTargetForClaim(slug)` — the share row joined to the sharer's `vocab_entries` row, with the **second** copy of F16's "no `userId` first parameter, and here is why" comment. Returns `null` for unknown/revoked, and a row with `entry: null` when the share resolves but the entry is gone. |
| `src/app/api/profile/complete/route.ts` | Amend the "**The only thing that sets `onboarded_at`**" comment per D4. No code change. |
| `package.json` | `"claim:check"` and `"claim:db"`. |
| `CLAUDE.md` | Two command lines in the block; one convention line: that `onboarded_at` may now be set by the share-claim path with five null answers, and that this is a state identical to `Skip all`. |
| F16's `src/app/(public)/s/[slug]/page.tsx` | Render `<PracticeThisWord slug={slug} term={term} />`. One import and one element. |

### Explicitly NOT modified

- **`src/app/(app)/layout.tsx`.** No conditional, no exception, no `?from=share`
  branch. The gate stays four lines. This is the plan's single most important
  restraint.
- `src/lib/auth/guards.ts`, `src/lib/auth/session.ts`, `src/auth.ts` — the auth
  config gains no callback and no event.
- `src/lib/auth/actions.ts` — `signInWithGoogle` keeps `redirectTo: '/today'`.
- `src/app/onboarding/page.tsx` and `components/onboarding/*` — no `?next=`.
- `src/middleware.ts` — `/claim` is only ever reached *with* a session cookie, so
  the existing rule passes it. (F16 owns the public-path exemption; if `/s/[slug]`
  is not exempt, the shared page redirects to `/signin` and the feature does not
  exist. Verify before starting.)

---

## 5. The state machine, in full

`resolveClaimOutcome` is a pure function. Input:

```
{ sessionUserId, share: { ownerUserId, kind, entityId } | null,
  sharerEntry: VocabEntry | null,
  claimerOnboarded: boolean, intentTimezone: string | null,
  existingEntry: VocabEntry | null, addsInLast24h: number }
```

Output is one of a closed set, each with a `href` and, where the user stops, a
`title`/`body` pair in the app's voice — terse, sentence case, no exclamation
mark, matching `EmptyState`'s ≤40 / ≤90 character contract:

| Outcome | When | Writes | Where they land | What they read |
|---|---|---|---|---|
| `claim_new` | share ok, entry ready, no existing row | onboard (if needed) + insert | `/vocab/<newId>/chat` | — (they are in the chat) |
| `claim_pending` | share ok, sharer's entry **not** ready | onboard (if needed) + insert `pending` | `/vocab/<newId>` | the detail page's own pending state |
| `already_have` | 23505, or `findEntryByNormalizedTerm` hit | onboard (if needed) only | `/vocab/<existingId>/chat` | — |
| `owner` | `share.ownerUserId === sessionUserId` | **none** | `/vocab/<entityId>/chat` | — |
| `expired` | slug unknown, or share row deleted | **none** | stays on `/claim` | "That link has expired" / "The word behind it isn't shared any more." → **Start your own list** → `/onboarding` |
| `gone` | share resolves, sharer's entry deleted | **none** | stays on `/claim` | "That word is gone" / "Its owner removed it from their collection." → **Start your own list** → `/onboarding` |
| `over_limit` | `addsInLast24h >= DAILY_ADD_LIMIT` | **none** | stays on `/claim` | "That's 50 words in a day" / "Come back tomorrow." → **Your words** → `/vocab` |
| `no_timezone` | intent carries no valid zone | **none** | `/onboarding` | (option (a), the honest fallback) |
| `no_intent` | cookie absent or expired | **none** | stays on `/claim` | "Nothing to add here" / "Open a shared word and tap practise." → **Today** → `/today` |
| `write_failed` | insert threw twice | none that stuck | stays on `/claim` | "Couldn't add that word" / "Try again." → the form's own button, re-submits |

Two properties `claim:check` asserts about this table and not about the code
under it:

1. Every `href` starts with a single `/` and never `//` or `/\`, and matches one
   of five literal shapes.
2. `expired` and `gone` are the only outcomes reachable from a bad slug, they
   share a wording register, and **neither reveals whether the slug ever
   existed** except through the word "expired" vs "gone" — which is itself an
   enumeration signal. *(Open question, §8 Q2: collapse them into one screen?)*

### Ordering inside `resolveAndClaim`

1. `requireUser()` — a session must exist. (It always does; `/claim` is only
   reached after the Auth.js callback.)
2. Decode the cookie. No cookie → `no_intent`, **zero writes**.
3. `getShareTargetForClaim(slug)`. Unknown/revoked → `expired`, **zero writes**.
   Entry missing → `gone`, **zero writes**.
4. Owner short-circuit → `owner`, **zero writes**.
5. Limit check → `over_limit`, **zero writes**.
6. **Then, and only then**, `completeOnboarding(userId, EMPTY_ANSWERS, tz)` —
   preceded by `setTimezone(userId, tz, /* manual */ false)` so `timezone_source`
   stays `'detected'` and F7's manual-override guard is respected for a returning
   user who once corrected their zone. Skipped entirely when
   `profile.onboardedAt` is already set.
7. Insert. On 23505: `findEntryByNormalizedTerm` → `already_have`. (F14's shape,
   reused. One retry on a vanished collision, matching `POST /api/vocab`; never a
   loop.)
8. `redirect(href)`.

Steps 2–5 write nothing, which is what makes every failure path leave a
brand-new account un-onboarded and therefore able to enter the honest
`/onboarding` flow from the button on the failure screen. Onboarding is only
made permanent once we know the claim will succeed.

Steps 6 and 7 are **not** wrapped in one transaction. `completeOnboarding` opens
its own; nesting would be a savepoint held across an insert that can legitimately
raise 23505 as control flow. Both operations are independently idempotent, and
the worst interleaving — onboarded, insert failed — leaves a user who can press
the button again or walk into `/today`. That is a strictly better failure than a
rolled-back onboarding with a live session.

---

## 6. Implementation order

Each step ends with `npm run typecheck && npm run build` passing.

1. **Widen `source`.** `schema.ts`, `types.ts` comment, `vocab/schemas.ts` enum,
   the index comment. Run `npm run db:generate` and confirm **no new file
   appears** in `drizzle/`. Nothing else changes; the app behaves identically.
2. **The pure core.** `src/lib/share/claim.ts` — `CLAIM_PATH`, `CLAIM_COOKIE`,
   `ClaimIntent`, `buildClaimEnrichment`, `resolveClaimOutcome`. Write
   `scripts/check-claim.ts` alongside it and add `claim:check`. This step ships
   no UI and no writes, and the check script is green before anything can call it.
3. **The cookie.** `claim-cookie.ts` + its assertions in `check-claim.ts`
   (round-trip, tamper, expiry, oversize, bad slug charset, bad zone). Still no
   UI.
4. **The query.** `createClaimedVocabEntry` in `queries/vocab.ts`;
   `getShareTargetForClaim` in F16's `queries/shares.ts`. Write
   `scripts/check-claim-db.ts` and add `claim:db`. **The whole feature is now
   verifiable without a browser or an OAuth hop** — this is the step that makes
   the rest cheap.
5. **`resolveAndClaim`** in `claim.server.ts`, wired to steps 2–4. Re-run
   `claim:db`; every row in §5's table is now exercised.
6. **The actions and the interstitial.** `claim-actions.ts`, `app/claim/page.tsx`,
   `claim-runner.tsx`. At the end of this step `/claim` works if you set the
   cookie by hand — testable with one `curl` and a browser devtools cookie edit,
   no share page required.
7. **The button.** `components/share/practice-this-word.tsx`, mounted on F16's
   public page. First end-to-end run against a real Google account. Amend
   `api/profile/complete/route.ts`'s comment and `CLAUDE.md` in the same commit.

---

## 7. Verification

### `npm run claim:check` — offline, no database, no network

`scripts/check-claim.ts`, following `scripts/check-chat.ts`'s `check(label,
actual, expected)` shape and exiting non-zero on any failure.

**Callback-URL validation, including hostile inputs.** The property under test is
*no reachable code path produces an off-origin redirect*:

- `CLAIM_PATH === '/claim'` exactly, and it is a `const` with no interpolation.
- Every `href` from every outcome in §5 matches
  `/^\/(today|vocab|onboarding)(\/[0-9a-f-]{36}(\/chat)?)?$/`.
- Feed `resolveClaimOutcome` slugs of: `//evil.com`, `/\evil.com`,
  `https://evil.com`, `http:/\/\evil.com`, `javascript:alert(1)`,
  `%2f%2fevil.com`, `\r\nLocation: https://evil.com`, a 10 kB string, an empty
  string, and a valid-looking slug for a share that does not exist. **Every one
  must produce `expired` with `href === '/claim'`-class output**, and none may
  ever reach a share lookup shaped like a redirect target.
- Feed `decodeClaimCookie` the same list plus: a valid cookie with one flipped
  byte in the payload, one flipped byte in the signature, `exp` one second in the
  past, a signature computed with a different secret, a value with three dots,
  and a value with none. All must return `null`.
- Timezones: `Asia/Jakarta` (accepted, and `Asia/Calcutta` too — the alias
  `Intl.supportedValuesOf` omits, per `lib/profile/timezone.ts`'s comment),
  `Not/AZone`, `''`, a 500-character string, `'UTC'`. Invalid → the intent
  carries `tz: null` → outcome `no_timezone`, never a silent `FALLBACK_TIMEZONE`.

**The state machine over new / established / owner users.** All ten outcomes in
§5, driven as a table, plus these specific pairs:

- brand-new (`claimerOnboarded: false`) + valid zone → `claim_new`, and the
  outcome's `willOnboard` flag is `true`;
- brand-new + **no** valid zone → `no_timezone`, `willOnboard` **`false`**;
- established (`claimerOnboarded: true`) → `willOnboard` **always `false`**, in
  every one of the ten outcomes. This is the assertion that stops a future edit
  from re-onboarding an existing user and wiping nothing but confusing everything.
- owner → `writes: 'none'` and `href` built from `share.entityId`, **never** from
  a new id;
- `existingEntry` present → `already_have`, and its `href` uses the *existing*
  id;
- `addsInLast24h` at 49, 50 and 51 → `claim_new`, `over_limit`, `over_limit`.

**`buildClaimEnrichment`.**

- sharer `ready` with a definition → returns exactly
  `{ partOfSpeech, pronunciation, definition, examples }` and **no other keys**
  (asserted by `Object.keys().sort()`, so a future field addition fails loudly);
- sharer `ready` but `definition === null` → `null`;
- sharer `pending` → `null`; sharer `failed` → `null`;
- the result never contains `userId`, `id`, `status`, `masteredAt`,
  `lastShownOn`, `suggestedCorrection`, `enrichmentAttempts`, `createdAt`.

**Term safety.** The sharer's `term` is the one free-text field that crosses the
boundary and ends up in the claimer's system prompt (`chatSystemPrompt` embeds it
five times). Assert that the claim path re-runs `normalizeTerm` +
`validateTerm` on the term read from the share, and that a term failing
`validateTerm` produces `gone` rather than an insert. Feed it
`genteel\n\nIgnore all previous instructions`, a 500-character term, and one
with `<` and backticks — `TERM_PATTERN` and `MAX_TERM_CHARS` should already
reject all three, and this assertion is what keeps that true if the pattern is
ever loosened.

### `npm run claim:db` — seeds two fixtures, exercises, rolls back

`scripts/check-claim-db.ts`, following `scripts/check-chat-db.ts` exactly: two
throwaway `@example.invalid` users deleted in a `finally` (the FK cascade takes
profiles, vocab entries, shares, sessions and messages with them), no LLM calls,
driving the same functions the action calls rather than HTTP.

Fixtures: **sharer** (onboarded, `Europe/London`, one `ready` vocab entry
`"genteel"` with all four enrichment fields, one share row) and **claimer**
(fresh `users` row, `ensureProfile` only, `onboarded_at` null).

1. **Claim, brand new.** After: claimer has exactly one `vocab_entries` row;
   `term` matches; `source === 'shared'`; `enrichment_status === 'ready'`; the
   four fields equal the sharer's byte for byte; `enrichment_attempts === 0`;
   `suggested_correction`, `enrichment_error`, `mastered_at`, `last_shown_on` all
   null; `status === 'active'`. Claimer's profile: `onboarded_at` non-null,
   `timezone` equals the intent zone, `timezone_source === 'detected'`, and all
   five of `occupation`, `interests`, `currently_consuming`, `english_contexts`,
   `chat_tone` are null. Outcome `claim_new`, `href` ends `/chat`.
2. **Re-claim, same person, same share.** Zero new rows (the `UNIQUE (user_id,
   lower(term))` index holds). Outcome `already_have`, `href` identical to run 1.
   `onboarded_at` unchanged to the millisecond — `coalesce` proven.
3. **Re-claim after the claimer masters the word.** Still `already_have`; `status`
   stays `'mastered'`; the claim does not resurrect it. (A word can be practised
   while mastered — this only asserts the claim writes nothing.)
4. **Owner claims their own share.** Sharer's row count before === after; outcome
   `owner`; `href` contains the sharer's original entry id.
5. **Established claimer.** A third fixture, onboarded with real answers. Claim a
   *different* word: new row appears, and every one of the five answer columns
   plus `onboarded_at` is unchanged. This is the regression that matters most.
6. **Revoked.** Delete the share row, claim: outcome `expired`, zero rows written
   anywhere, claimer's `onboarded_at` **still null** for a fresh fixture.
7. **Deleted word.** Recreate the share, delete the sharer's entry (or, if the FK
   forbids it, null it out per F16's cascade choice): outcome `gone`, zero writes.
8. **Sharer not ready.** Set the sharer's entry to `pending`: the claimed row is
   inserted `pending` with null enrichment fields, and the outcome is
   `claim_pending` with an `href` that does **not** end in `/chat`.
9. **Limit.** Seed 50 rows for a fixture inside the 24h window, claim: outcome
   `over_limit`, zero new rows.
10. **Concurrency.** Two `resolveAndClaim` calls for the same user and share,
    `Promise.all`'d. Exactly one row exists afterwards, both calls return an
    `href` pointing at the same id, and neither throws. This is the assertion
    that proves the 23505 path is reached rather than merely present.

### Manual passes no script can cover

1. **A real Google hop on a real phone.** Open a share in Safari on iOS from a
   Google account with no Daily Words user, tap through, and time it. The
   acceptance bar is that the definition on the chat's preceding screen is the
   same text that was on the shared page.
2. **`SameSite=Lax` survival.** The only way to prove the cookie comes back from
   `accounts.google.com` is to do it. If the claim silently no-ops with a clean
   sign-in, this is the cause; check for `dw_claim` in devtools *after* the
   callback.
3. **Abandon at the consent screen.** Press Cancel on Google. Expect: back at
   `/signin`, no account created, no row anywhere. Then sign in normally within
   ten minutes and confirm you land on `/today` (via `/onboarding`) and that
   **no word was claimed**.
4. **The five-second look.** Watch `/claim` at 375×667. It should read as a
   sentence, not a spinner, and it must not flash the tab bar (it is outside
   `(app)`, so it structurally cannot — confirm anyway).
5. **`npm run stats:recompute -- --user=<claimer> --dry-run`** after a claim.
   Confirm the collector level is unchanged by the claimed word — the D7
   consequence, observed rather than argued.
6. **`npm run db:generate` emits nothing** after step 1.

---

## 8. Risks and open questions

**R1 — Setting a cookie in a server action immediately before `signIn()` is
unverified.** `signIn` throws a `redirect()`, and Next flushes cookie mutations
onto the redirect response — this is the documented behaviour and it is how
Auth.js's own `callbackUrl` cookie is set, but **I did not run it**. If
`Set-Cookie` is lost, the fallback is to set the cookie from a plain route
handler (`GET /api/share/claim/start?slug=…` → set cookie → 302 to Auth.js's
sign-in URL), which costs one extra hop and no design change. Test this first in
step 6; it is the single riskiest unverified assumption in the plan.

**R2 — `SameSite=Lax` and the Google return.** Reasoned from the spec (top-level
cross-site GET navigations carry `Lax` cookies) and from the fact that Auth.js
ships its own state cookie as `Lax` for exactly this reason. Not measured.
`Strict` would fail silently and completely; the manual pass above exists solely
to catch this.

**R3 — `profiles.timezone`'s default makes "never detected" invisible.** The
column defaults to `'Asia/Jakarta'` with `timezone_source = 'detected'`, so
nothing in the database distinguishes a real Jakarta detection from a row that
was never touched. F17 sidesteps it by trusting the cookie's zone rather than the
row's, but the ambiguity is pre-existing and worth a follow-up: a
`timezone_source = 'default'` value would make it legible. Out of scope here.

**R4 — Copying enrichment assumes `enrichTerm` stays profile-free.** Verified
today by reading `src/lib/llm/prompts/vocab-enrich.ts`: it imports no profile
module and takes only the term, unlike `chat-system.ts` and `suggest-words.ts`
which both take `ProfileContext`. If a future change personalises enrichment —
"define this the way a software engineer would hear it" — then D8 becomes a
disclosure of one user's context to another and must be revisited. Leave a
comment at the top of `buildClaimEnrichment` naming this dependency by file.

**R5 — D9 (the claim counts against the 50/day limit) may be wrong.** A user who
adds 48 words then receives two shared links gets refused on the second, having
already signed in for it. The counter-argument is that exempting claims makes the
limit trivially bypassable by minting shares. I chose enforcement because a
bypassable limit is worse than a rare refusal with a clear sentence, but this is
a product call and the user may prefer the other. Changing it is one boolean in
`resolveClaimOutcome` and one row in `claim:check`'s table.

**R6 — `expired` vs `gone` is a one-bit enumeration oracle.** They read
differently, which tells a slug-guesser whether a slug ever existed. Given [S3]'s
entropy requirement this is not a practical attack, and honest copy is worth
something to the user who was legitimately sent a stale link. Open question Q2
below.

**R7 — There is no rate limiter in v0.1.0.** The claim path is
session-authenticated and bounded by `DAILY_ADD_LIMIT`, so a slug-enumeration
attempt costs an authenticated request per guess with no reward under 128 bits of
entropy. But nothing throttles the guesses themselves, here or anywhere else in
the app. Naming it rather than fixing it.

**R8 — F16's public route may not be exempt from `src/middleware.ts`.** The
current matcher redirects every non-`/api`, non-`/signin` path to `/signin` when
no session cookie is present. If F16 did not add the share prefix, the shared
page is unreachable for exactly the audience it exists for, and F17's button will
never render. **Check this before step 7.**

**R9 — Next 15 server-action CSRF is assumed, not audited.** Server actions are
POST-only, `Origin`/`Host`-verified and bound to an encrypted action id. I did
not verify the deployment's behaviour behind a proxy that rewrites `Host`. The
blast radius if it fails is bounded by construction: the worst a forged claim can
do is add one word to the victim's *own* collection, because `userId` comes from
the session and from nowhere else.

**Q1 — Should a claimed word be visibly marked in the collection?** `source =
'shared'` is now in the database and nothing renders it. "From a friend" under
the definition would be nice; F4 owns that surface and it is out of scope here.

**Q2 — Collapse `expired` and `gone` into one screen?** One less oracle bit, one
less honest sentence. Deferred to whoever writes the copy pass.

**Q3 — Should the claimer see who shared it?** No, in v0.2.0: `users.name` comes
from Google and putting it on a stranger's screen is a disclosure decision F16
should make about the share page, not one F17 should make about the claim.

**Q4 — What if the sharer's term is a typo the sharer never corrected?** The
claimer inherits it, with `suggested_correction` deliberately not copied — so
their own row will never offer the correction unless they re-enrich. Arguably
`suggested_correction` *should* be copied. I left it out because it reads as the
sharer's doubt rather than a fact about the word; F14 may disagree, and F14 owns
that column's semantics.

## 9. Security, written as an attacker

**"Claim on behalf of someone else."** I want a word in *your* collection.
Every write in this feature goes through `createClaimedVocabEntry(userId, …)` or
`completeOnboarding(userId, …)` where `userId` is `(await requireUser()).id`,
read from a **database** session (`session: { strategy: 'database' }` in
`src/auth.ts`) — not from a JWT I could tamper with, not from a form field, not
from the share row. `share.ownerUserId` is read and used for exactly one thing:
the owner short-circuit comparison. It is never passed as an insert's `userId`.
**That is the one line to review**, and `claim:db` asserts the sharer's row count
is unchanged across every claim. To make you claim something I would need to set
a cookie on your browser for our origin, which requires XSS on our origin — at
which point the claim path is not the interesting problem.

**Open redirect.** The classic version of this feature is `?next=` on a sign-in
button, and it is a hole. Here: `redirectTo` is the frozen literal `'/claim'`
with nothing concatenated, so the Auth.js `redirect` callback's
`url.startsWith('/')` branch — the one with the `/\evil.com` bypass class — is
never handed anything I control. Post-claim, `redirect()` is called with
`vocabChatHref(id)` / `vocabDetailHref(id)` / `'/vocab'` / `'/onboarding'` /
`'/today'`, where `id` is a uuid the server just read or wrote. `claim:check`
feeds nine hostile strings through the resolver and asserts every output href
matches a five-shape regex. There is no code path from cookie or form to a
`Location` header.

**CSRF on the claim endpoint.** The claim is a server action: POST-only, `Origin`
and `Host` checked by Next 15, and callable only with the encrypted action id
that Next embeds in the page it served me. It is *not* a GET page render (which
would be prefetchable and replayable) and not a bare route handler (which would
need its own token). And even if the check failed, the write is bounded to the
requester's own collection — see the first paragraph. The corollary constraint:
`/claim`'s server component must remain side-effect-free. If someone later
"simplifies" it by moving the write into the page body, they have converted a
CSRF-protected POST into a GET mutation. Say so in that file's comment.

**Share-slug enumeration.** [S3] requires an infeasible-to-guess slug and F16
owns the entropy. F17's contribution is not to become an easier oracle than the
share page already is: unknown and revoked slugs take the same code path (one
indexed lookup returning nothing) and, apart from the copy difference noted in
R6, produce the same screen. The claim is not cheaper to probe than the public
page — it is strictly more expensive, since it requires a session.

**Writing into another user's collection via the claim path.** Covered above,
but stated as its own item because it is the thing this feature would be famous
for getting wrong. The share tells us *what* to copy. The session tells us *who*
to copy it to. Those two facts come from different places and are never allowed
to swap. The single-INSERT `createClaimedVocabEntry` takes `userId` as its first
parameter, per the `lib/db/queries/` convention, precisely so this cannot be
written any other way.

**Prompt injection through the shared word.** The claimed row's `definition`
lands in `chatSystemPrompt` as "meaning, for your reference only", and the `term`
lands in it five times. The definition is model-generated by F3 and is never
user-typed — there is no edit-definition surface in the app — so a hostile
sharer cannot author it. The `term` **is** user-typed, and this is the one new
exposure: my word becomes a string in your system prompt. It is bounded by
`TERM_PATTERN` and `MAX_TERM_CHARS` in `src/lib/vocab/normalize.ts`, which
already reject newlines, angle brackets and backticks, and F17 re-runs
`normalizeTerm` + `validateTerm` on the term *read out of the share* rather than
trusting that it was validated on the way in. `claim:check` asserts this with
three hostile terms. If `TERM_PATTERN` is ever loosened, that assertion is what
fails.

**Quota.** Claiming copies enrichment, so a claim costs zero model calls — which
removes the obvious denial-of-wallet angle. What remains is row growth, bounded
by `DAILY_ADD_LIMIT` per D9.
