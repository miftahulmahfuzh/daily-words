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
  // ['', 's', slug] or ['', 's', slug, 'claim'] — and nothing else. A leading
  // empty string is what distinguishes `/s/x` from `/vocab/s/x`.
  if (parts.length < 3 || parts.length > 4) return false
  if (parts[0] !== '' || parts[1] !== 's') return false
  if (parts[2].length === 0) return false
  return parts.length === 3 || parts[3] === 'claim'
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

export function isShareWordIndex(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= SHARE_WORD_INDEX_MIN &&
    value <= SHARE_WORD_INDEX_MAX
  )
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
