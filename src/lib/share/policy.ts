/**
 * Everything about a share that is a decision rather than a query.
 *
 * **Pure, and it imports nothing.** That is the point: the middleware (Edge
 * runtime), the client-side Share button (a phone bundle) and
 * `npm run share:check` (a bare tsx process) all read the same module, so what
 * is asserted offline is literally the code that runs on the request. A single
 * import of `node:crypto`, `server-only` or zod here would break at least one of
 * those three. Slug *generation* lives in `slug.ts` for exactly that reason.
 *
 * Share URLs live here rather than in `lib/vocab/links.ts` (F16 D12). That file
 * is "every URL into the **vocab** surface"; `/s/[slug]` is polymorphic by
 * design, and putting it there would make F18 import the vocab links module to
 * build a *journal* share URL.
 */

/* ---------------------------------- Slug ----------------------------------- */

/**
 * Crockford-style base32: ten digits, and a–z less `i`, `l`, `o`, `u`.
 *
 * Excluding those four removes every glyph pair a human confuses reading a link
 * off a screen, and removes the only English four-letter word the generator
 * could otherwise produce by accident. Lowercase only, not base62: several link
 * handlers and email clients normalise case, and a case-sensitive slug silently
 * lowercased in transit is a link that dies for no visible reason.
 *
 * 32 symbols is exactly 5 bits per character, which is what makes the entropy
 * claim below exact rather than approximate.
 */
export const SHARE_SLUG_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'

/**
 * 16 × 5 = 80 bits, and 80 bits is exactly 10 bytes — so generation is
 * `randomBytes(10)` → base32 with **no modulo step and therefore no modulo
 * bias**.
 *
 * Why 16 and not 10: at 10 characters (50 bits) a thousand live shares need
 * ~1.1 × 10^12 blind guesses for one expected hit, which is 3.5 years at
 * 10,000 req/s — inside the reach of a botnet with a grudge. At 16 the same
 * calculation gives ~1.2 × 10^21 guesses, twenty orders of magnitude further
 * away. See F16 §1 D6 for the arithmetic written out.
 */
export const SHARE_SLUG_LENGTH = 16
export const SHARE_SLUG_BITS = SHARE_SLUG_LENGTH * 5

/** The bytes `newShareSlug()` draws. Exact, so the encoding loses nothing. */
export const SHARE_SLUG_BYTES = SHARE_SLUG_BITS / 8

const SLUG_PATTERN = new RegExp(`^[${SHARE_SLUG_ALPHABET}]{${SHARE_SLUG_LENGTH}}$`)

/** Exactly the shape `newShareSlug()` produces, and nothing else. */
export function isShareSlug(value: unknown): value is string {
  return typeof value === 'string' && SLUG_PATTERN.test(value)
}

/* ---------------------------------- URLs ----------------------------------- */

/**
 * `/s/<slug>` — one segment, no entity type in the path.
 *
 * The slug is already unique across all three entity types, so a type in the
 * path is redundant data the database would then have to agree with, and a
 * mismatch is a code path nobody writes a test for. One route file serves all
 * three; F18 adds a branch in the renderer, not a route. It is also short, which
 * matters for something pasted into WhatsApp: `/s/` + 16 characters.
 */
export function shareHref(slug: string): string {
  return `/s/${slug}`
}

/**
 * `/s/<slug>/claim` — the "Practise this word" target.
 *
 * Nested under the share so the slug is in the path and no query string can be
 * dropped, and under `/s/` so `isPublicSharePath` already exempts it from the
 * auth middleware — which it must, because the whole point is a visitor with no
 * cookie. F16 ships the route as a stub; **F17 replaces its body, not its URL.**
 */
export function shareClaimHref(slug: string): string {
  return `${shareHref(slug)}/claim`
}

/**
 * `/s/<slug>/<1..6>` — one word of a shared **card** (F18 D1).
 *
 * The position, never a vocab uuid. That is the whole decision: one tap on Share
 * mints one `shares` row and exposes seven URLs, and the capability the slug
 * hands out is bounded to *that card's* six words by arithmetic rather than by a
 * join somebody could later widen. A slug plus a uuid would turn a card share
 * into a capability to **name** a word, and the only thing between that and
 * reading arbitrary words would be a check the next refactor drops.
 *
 * `position` is typed `number` and every producer takes it from
 * `daily_card_items.position`; a string out of the URL bar reaches the database
 * only through `parseSharePosition`.
 */
export function sharedCardWordHref(slug: string, position: number): string {
  return `${shareHref(slug)}/${position}`
}

/* --------------------------------- Hand-off -------------------------------- */

/**
 * What leaves the app when the user taps Share, as one pure record.
 *
 * **`sheet` has a `title` and a `url` and deliberately no `text`.** F16 passed
 * `text: title` as well, and on iOS that is the whole of a reported bug: a
 * `navigator.share` payload carrying both a `text` and a `url` is handed to the
 * sheet as a single item, so every plain-text target — *Copy*, Notes, the
 * Messages compose field — receives them concatenated. The clipboard then held
 * `"genteel https://…/s/…"`, which is not a URL and does not "paste and go" in
 * Safari's address bar. `title` alone does not do this: Safari draws it as the
 * sheet's heading and treats `url` as the item, which is why the heading is kept
 * rather than the whole payload going bare.
 *
 * `text` here is the plain-text hand-off — the bare URL — and it is what both
 * the clipboard and the always-drawn selectable field use. One string for both,
 * so "what you copy is what you can select" is arithmetic rather than a
 * convention two call sites happen to share. Nothing is trimmed or decorated on
 * the way out: `url` arrives from `shareHref` behind `APP_URL` and any
 * whitespace in it would already be a bug upstream.
 *
 * It lives here, with the other pure share decisions, because `share:check`
 * drives it offline and this module imports nothing.
 */
export function shareHandoff(
  title: string,
  url: string,
): { sheet: { title: string; url: string }; text: string } {
  return { sheet: { title, url }, text: url }
}

/**
 * The middleware's exemption, as a predicate rather than as a regex edit.
 *
 * **Do not add `s` to the matcher's negative lookahead instead.** That
 * alternation is prefix-matched: `(?!api|s|…)` also excludes `/signin`, and it
 * would silently exempt every future route beginning with `s` — `/settings`,
 * `/stats`, `/search`. Exempting here, from a function `share:check` drives
 * offline, is what makes the rule testable.
 *
 * Deliberately **structural, not `isShareSlug`-gated**. A hand-typed wrong slug
 * must reach `/s/[slug]`'s one-sentence 404 (F16 D13); bouncing it to `/signin`
 * instead would say something different about a slug that does not exist than
 * about one that does. Nothing but the share page is mounted under `/s/`, and
 * that page reads a snapshot by slug or renders `notFound()`.
 */
export function isPublicSharePath(pathname: string): boolean {
  // Next answers `/s/<slug>/` with a 308 to the canonical path, but middleware
  // runs first, so the trailing-slash form has to be recognised here or a
  // cookie-less visitor is redirected to /signin before the 308 is ever issued.
  const path = pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname

  if (path === '/s') return true

  const parts = path.split('/')
  // ['', 's', slug], ['', 's', slug, 'claim'] or ['', 's', slug, '1'..'6'] — and
  // nothing else. A leading empty string is what distinguishes `/s/x` from
  // `/vocab/s/x`.
  if (parts.length < 3 || parts.length > 4) return false
  if (parts[0] !== '' || parts[1] !== 's') return false
  if (parts[2].length === 0) return false
  if (parts.length === 3) return true

  /**
   * **F18 widened this, and forgetting to would have been invisible.** The
   * nested word route is a fourth path a stranger has to reach, and a middleware
   * that still recognised only `claim` would bounce every row of a shared card
   * to `/signin` — while the signed-in author tapping the same row got a perfect
   * page.
   *
   * It admits a position-*shaped* segment rather than a valid one, and the
   * distinction is this function's existing rule applied one level down. The
   * comment above says why a wrong **slug** is exempted: it "must reach
   * `/s/[slug]`'s one-sentence 404; bouncing it to `/signin` instead would say
   * something different about a slug that does not exist than about one that
   * does." A wrong **position** is the same problem — `/s/<slug>/5` on a
   * four-word card is a URL a real person will follow — so both reach the same
   * 404, and `parseSharePosition` in the route is what decides which of the
   * digit-shaped ones name a word.
   *
   * The enumeration is still closed: `/s/<slug>/practise`, `/s/<slug>/1.5` and
   * `/s/<slug>/<uuid>` remain gated. The alternative — a `startsWith`, or a bare
   * "any fourth segment" — is how the exemption stops meaning anything.
   */
  return parts[3] === 'claim' || POSITION_SHAPED.test(parts[3])
}

/** One or two digits. Not the bound — that is `parseSharePosition`'s, in the route. */
const POSITION_SHAPED = /^\d{1,2}$/

/* ---------------------------- The claim interstitial ------------------------- */

/**
 * `/claim` — where the visitor lands after the OAuth round trip, and the only
 * screen that performs the claim.
 *
 * **A frozen literal with nothing concatenated onto it, ever.** It is what
 * `signIn('google', { redirectTo: CLAIM_PATH })` is handed, and the classic
 * version of this feature puts the share in a `?next=` on that call — which is
 * an open redirect wearing a feature's clothes. Auth.js's default `redirect`
 * callback would validate it, but its relative-URL branch (`startsWith('/')`)
 * accepts `//evil.com` and `/\evil.com`, and browsers normalise `\` to `/` in
 * the authority position. F17 D2 removes the class structurally instead: the
 * payload rides in the signed `dw_claim` cookie, and no user-derived string is
 * concatenated into a redirect target anywhere in the feature.
 *
 * It lives here, beside `shareHref`, because the middleware needs it (`/claim`
 * is reached by a visitor who may not have signed in yet) and this is the module
 * the Edge runtime can import.
 */
export const CLAIM_PATH = '/claim'

/**
 * The middleware's second exemption, and **exact-match on purpose**.
 *
 * `startsWith(CLAIM_PATH)` would exempt `/claims`, `/claim-anything` and every
 * future route beginning with those five letters — the same prefix-matching
 * mistake `isPublicSharePath`'s comment warns about for `/s`. There is exactly
 * one page under this path and it decides for itself what to show a visitor with
 * no session: the sign-in CTA. Nothing privileged is read without
 * `getSessionUser()`, and the claim write itself is behind `requireUser()` in a
 * server action, so exempting the *render* costs nothing.
 *
 * Why it needs exempting at all: a stranger arrives here with the intent cookie
 * and no session. Bounced to `/signin`, they would sign in against
 * `signInWithGoogle`'s hardcoded `redirectTo: '/today'`, land in `/onboarding`,
 * and the intent would expire unread — the failure is silent and looks like
 * "the claim just doesn't happen".
 */
export function isClaimPath(pathname: string): boolean {
  return pathname === CLAIM_PATH || pathname === `${CLAIM_PATH}/`
}

/* --------------------------------- Payload --------------------------------- */

/**
 * At most three example sentences on a shared word, matching what F3's
 * enrichment produces and what `/vocab/[id]` draws.
 */
export const SHARE_EXAMPLES_MAX = 3

/* ------------------------ The F17 claim-cookie contract --------------------- */

/**
 * The cookie that carries a share across the Google round trip.
 *
 * Named and shaped by **F17**, not by F16's own §5, on the brief's ruling [C1]:
 * F16 had frozen a `dw_share_intent` cookie holding a bare slug, and F17's
 * signed `dw_claim` won on the merits — it cannot be aimed at an arbitrary share
 * by hand-editing devtools, it carries its own expiry rather than trusting
 * `Max-Age`, and it carries the detected timezone, which the claim needs because
 * **writes may not fall back to a default zone** and the claim performs a write.
 *
 * The value's shape is `v1.<base64url(slug|w|tz|exp)>.<hmac-sha256>`; the reader
 * and writer are `lib/share/intent.ts`, which needs `node:crypto` and therefore
 * cannot live in this file.
 */
export const SHARE_CLAIM_COOKIE = 'dw_claim'

/** Ten minutes: a generous OAuth hop, and a short replay window. */
export const SHARE_CLAIM_TTL_SECONDS = 600

/**
 * Exported as an object rather than spelled out at the one call site, so
 * `share:check` can assert the two attributes that silently break the feature.
 *
 * `sameSite: 'lax'` is **load-bearing and must never become `'strict'`.** The
 * return from `accounts.google.com` is a cross-site top-level GET navigation;
 * `Lax` sends the cookie on it, `Strict` does not. A `Strict` cookie here is a
 * 100%-reproducible failure that looks like "the claim just doesn't happen".
 *
 * `path: '/'` because it is read after onboarding, from a different subtree.
 * `httpOnly` because no script has any business reading it.
 */
export const SHARE_CLAIM_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  maxAge: SHARE_CLAIM_TTL_SECONDS,
} as const

/**
 * Which word of a shared **card** the claimer tapped — an index, `1`–`6`, never
 * a vocab uuid.
 *
 * Brief [C2]: F18 shares a card, so one slug identifies six words and "practise
 * this word" has to say which. The index rides inside the signed cookie rather
 * than as a `?w=` query param, because a literal path with no user data in it is
 * what structurally kills the open-redirect class. Null for a vocab share, which
 * is the only kind F16 mints — but the field exists from the start, because
 * retrofitting it into a signed payload is strictly more work than carrying it.
 */
export const SHARE_WORD_INDEX_MIN = 1
export const SHARE_WORD_INDEX_MAX = 6

/* ------------------ Where a brand-new signer-up lands (F18 D13) ------------- */

/**
 * `dw_next` — the second cookie in the feature, and it is **not** a claim.
 *
 * F17's `dw_claim` exists to carry a *pending write* across a redirect, and its
 * whole state machine is about deciding whether that write may happen. F18's
 * "Start your own journal" copies nothing into anybody's collection, so it does
 * not belong in that cookie and F18 adds **no `journal_compose` variant to
 * `ClaimIntent`** — two intents in one cookie would mean `/claim` has to branch
 * on a kind that never claims anything.
 *
 * What it carries is a **destination, and only a destination**, and its value
 * space is exactly one symbol. `app/(app)/layout.tsx` sends anyone with a null
 * `onboarded_at` to `/onboarding`, so without this a first-time signer-up would
 * finish the five screens and land on `/today` — the home screen of an app they
 * came to for journalling, showing "No words yet."
 *
 * **No path is ever taken from this cookie.** It selects between hard-coded
 * destinations through a literal `switch` in `nextDestinationHref`, which is the
 * difference between this and the `?next=` parameter F17 D2 rejected outright.
 * It is signed anyway — the codec lives beside `dw_claim`'s in
 * `lib/share/intent.ts` — not because a forged value is dangerous today (it can
 * only ask to land on `/journal`) but because a signed closed union is what keeps
 * "no path is ever read from it" true after the next edit.
 */
export const SHARE_NEXT_COOKIE = 'dw_next'

/**
 * An hour, where the claim gets ten minutes.
 *
 * The claim's window covers one OAuth hop. This one has to survive the hop **and
 * five onboarding screens** typed on a phone, and the failure it protects against
 * is a landing page rather than a lost write — so it can afford to be generous
 * where `dw_claim` cannot.
 */
export const SHARE_NEXT_TTL_SECONDS = 3600

export const SHARE_NEXT_COOKIE_OPTIONS = {
  httpOnly: true,
  // Same reason as `dw_claim`, and the same 100%-reproducible silent failure if
  // it is ever changed: the return from accounts.google.com is a cross-site
  // top-level GET, and `Strict` is not sent on one.
  sameSite: 'lax',
  path: '/',
  maxAge: SHARE_NEXT_TTL_SECONDS,
} as const

/** The closed set. One member, and adding a second means adding a `case` below. */
export type ShareNextDestination = 'journal'

export function isShareNextDestination(value: unknown): value is ShareNextDestination {
  return value === 'journal'
}

/**
 * Destination symbol → href. **A literal `switch`, never a lookup into the
 * cookie's own value**, which is the whole safety property.
 */
export function nextDestinationHref(destination: ShareNextDestination): string {
  switch (destination) {
    case 'journal':
      return '/journal'
  }
}

/** Where onboarding has always ended, and still ends without a `dw_next`. */
export const ONBOARDING_DEFAULT_HREF = '/today'

export function isShareWordIndex(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= SHARE_WORD_INDEX_MIN &&
    value <= SHARE_WORD_INDEX_MAX
  )
}

/**
 * The same bound, on the way in from a URL segment. **F18 D1's structural
 * boundary**, and the security-relevant line in the feature.
 *
 * It lives here rather than in F18 §3's proposed `lib/share/position.ts` for one
 * reason that outranks the plan: `isPublicSharePath` needs it, and `policy.ts`
 * **imports nothing at all** — the Edge middleware, a client bundle and a bare
 * `tsx` process all read this module, and `share:check` asserts the absence of
 * any import. A separate file would have to be imported from here, so the 1..6
 * boundary and the middleware that enforces it would sit on opposite sides of
 * the one property that keeps them testable together. One home for the bound,
 * beside `isShareWordIndex`, which is the same number arriving from the cookie.
 *
 * Deliberately strict, and each rejection is a real input somebody will send:
 * `"01"` and `" 1"` because `Number()` accepts both and a database that agreed
 * would make two URLs for one word; `"1e0"` and `"1.5"` because `Number()`
 * accepts those too; `"0"` and `"7"` because `daily_card_items.position` is
 * 1-based and capped at six; a uuid because that is the shape this whole
 * decision exists to keep out of a public URL.
 */
export function parseSharePosition(raw: unknown): number | null {
  // The regex, not `Number()`, is the gate. It rejects leading zeroes, signs,
  // whitespace, exponents and decimal points before any coercion happens, so
  // the only strings that survive are the six the card actually has.
  if (typeof raw !== 'string' || !/^[1-9][0-9]*$/.test(raw)) return null
  const n = Number(raw)
  return isShareWordIndex(n) ? n : null
}

/* ----------------------------------- Copy ----------------------------------- */

/**
 * Every user-visible string this feature owns, in one place, so `share:check`
 * can assert the register: sentence case, no exclamation, nothing that reads as
 * a telling-off, and nothing that names the sharer.
 *
 * `SHARE_GONE_*` is deliberately one sentence for **both** a revoked slug and a
 * slug that never existed. `/vocab/[id]/not-found.tsx` already carries the
 * private version of this reasoning; the public case is stronger, because
 * telling the two apart tells a slug-guesser their guess *used to be right*.
 */
export const SHARE_ACTION_LABEL = 'Share this word'
/** F18. The same control, on the two entities that are not a word. */
export const SHARE_CARD_ACTION_LABEL = 'Share this card'
export const SHARE_JOURNAL_ACTION_LABEL = 'Share this line'
export const SHARE_COPY_LABEL = 'Copy link'
export const SHARE_REVOKE_LABEL = 'Stop sharing'
export const SHARE_REVOKE_ARMED_LABEL = 'Tap again to stop sharing'
export const SHARE_COPIED_NOTICE = 'Link copied'
export const SHARE_FIELD_LABEL = 'Link to this word'
export const SHARE_PRACTISE_LABEL = 'Practise this word'
export const SHARE_GONE_TITLE = 'This link is not available'
export const SHARE_GONE_BODY = 'It has been turned off, or it was never here.'
/** The unfurl subtitle when the snapshot carries no definition. */
export const SHARE_META_FALLBACK = "A word from someone's Daily Words collection."

/**
 * F18 D13's CTA, and it means what it says: nothing is copied into anybody's
 * collection, so this is a sign-up funnel and **not** F17's claim. The composer
 * it lands on is not prefilled — putting somebody else's sentence into a new
 * user's journal as the default action would be wrong on its own terms.
 */
export const SHARE_JOURNAL_CTA_LABEL = 'Start your own journal'

/** The one line of branding a stranger gets, on all three public pages. */
export const SHARE_BRAND_EYEBROW = 'Daily Words'

/** F18. The unfurl subtitle when a shared card's words are still enriching. */
export const SHARE_CARD_META_FALLBACK = "A day from someone's Daily Words."
/** F18. The unfurl subtitle for a journal share is always the line itself (D14). */
export const SHARE_JOURNAL_META_FALLBACK = "A line from someone's Daily Words journal."

/* --------------------------------- Metadata --------------------------------- */

/**
 * The three unfurl builders F18 needs, as pure string functions so
 * `share:check` drives them with no `Metadata` object and no route.
 *
 * F16 froze the rules these obey and F18 adds none of its own beyond D14's
 * three: the journal description is **the line, never the insight** (a
 * machine-written paragraph under a person's link, with no room for the "Written
 * by the machine" line, is exactly the misattribution D9 argued around);
 * `source_note` never appears in a `<meta>` tag (D10 applies here too); and
 * every share route sets `robots: noindex`, because an indexed share page is a
 * share the user cannot revoke by deleting a row.
 */

/** `one` … `six`. Spelled out because "6 words — 9 August 2026" reads as a stat. */
const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six'] as const

export function shareCardMetaTitle(dateLabel: string, wordCount: number): string {
  const n = COUNT_WORDS[wordCount] ?? String(wordCount)
  const noun = wordCount === 1 ? 'word' : 'words'
  // Sentence case with the count leading, so a truncating preview still shows
  // what the link is before it shows when it was.
  return `${n[0].toUpperCase()}${n.slice(1)} ${noun} — ${dateLabel}`
}

/**
 * The first three terms. Not all six: a preview subtitle is clipped by every
 * client at a different width, and three terms is what fits everywhere.
 */
export function shareCardMetaDescription(terms: string[]): string {
  const named = terms.filter((t) => t.length > 0).slice(0, 3)
  return named.length > 0 ? named.join(', ') : SHARE_CARD_META_FALLBACK
}

/**
 * Clip on a word boundary, never mid-word, and only add the ellipsis when
 * something was actually removed.
 *
 * Newlines collapse to spaces first: a journal line is `whitespace-pre-wrap` on
 * the page, but a `<meta>` tag with a raw newline in it is at best ignored.
 */
export function clipForMeta(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  // A single unbroken token longer than `max` has no boundary to cut on, so it
  // is hard-clipped rather than returned whole.
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

export const SHARE_JOURNAL_META_TITLE_MAX = 60
export const SHARE_JOURNAL_META_DESCRIPTION_MAX = 160

export function shareJournalMetaTitle(text: string): string {
  const clipped = clipForMeta(text, SHARE_JOURNAL_META_TITLE_MAX)
  return clipped.length > 0 ? clipped : SHARE_JOURNAL_META_FALLBACK
}

export function shareJournalMetaDescription(text: string): string {
  const clipped = clipForMeta(text, SHARE_JOURNAL_META_DESCRIPTION_MAX)
  return clipped.length > 0 ? clipped : SHARE_JOURNAL_META_FALLBACK
}
