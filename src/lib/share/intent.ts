import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import {
  isShareNextDestination,
  isShareSlug,
  isShareWordIndex,
  SHARE_CLAIM_TTL_SECONDS,
  SHARE_NEXT_TTL_SECONDS,
  type ShareNextDestination,
} from '@/lib/share/policy'
import { MAX_TIMEZONE_LEN } from '@/lib/profile/constants'
import { isValidTimeZone } from '@/lib/time/local-date'

/**
 * The `dw_claim` cookie's codec — the one piece of state that has to survive the
 * Google round trip.
 *
 * **Why a cookie and not a `callbackUrl`.** `lib/auth/actions.ts` hardcodes
 * `signIn('google', { redirectTo: '/today' })`, and even threaded through, a
 * brand-new user is intercepted by `requireOnboardedUser()` and sent to
 * `/onboarding`, whose flow ends with a hardcoded `router.replace('/today')`.
 * Onboarding destroys a callback URL — and the stranger this feature exists for
 * is, by definition, usually a new user, so the only path that matters is
 * precisely the path where a redirect-based approach loses the intent.
 *
 * **Shape and ownership.** F16 §5 originally froze an unsigned `dw_share_intent`
 * holding a bare slug; the brief's [C1] replaced it with F17's signed `dw_claim`
 * and F16 implements that from the start, because retrofitting a field into a
 * signed payload is more work than carrying it. [C2] adds `w`.
 *
 *     v1.<base64url(slug|w|tz|exp)>.<base64url(hmac-sha256 over AUTH_SECRET)>
 *
 * Signing is defence in depth rather than the primary control: the slug is
 * public and the cookie is `HttpOnly`, so forging one requires the user's own
 * devtools and buys them nothing a visit to the link would not. It earns its ten
 * lines by making `exp` enforceable inside the value rather than trusting
 * `Max-Age`, and by giving `share:check` something to feed hostile inputs to.
 *
 * **The secret is a parameter, not an import.** `lib/env.ts` would drag the
 * whole required-variable schema into `npm run share:check`, which runs offline
 * with no `.env` at all. One argument keeps the codec exercisable against a
 * fixture secret and keeps the real secret's single call site visible.
 */

export type ClaimIntent = {
  /** The share being claimed. Never an entity uuid — [S3], and F17 D1. */
  slug: string
  /**
   * Which word of a shared card, `1`–`6`. Null for a vocab share, which is the
   * only kind F16 mints. Brief [C2].
   */
  w: number | null
  /**
   * The zone detected in the browser on the public page, before the OAuth hop.
   * Null when nothing valid was detected — and null must stay distinguishable
   * from a default, because F17 refuses to set `onboarded_at` without a real
   * zone rather than dating a user's first card by guesswork.
   */
  tz: string | null
  /** Unix **seconds**. Enforced here, inside the signature. */
  exp: number
}

const VERSION = 'v1'

/**
 * A cookie longer than this is not one we wrote. Bounds the HMAC's input and,
 * more usefully, bounds what a hostile value can cost before it is rejected:
 * a slug is 16 characters and the longest IANA zone is well under a hundred.
 */
const MAX_COOKIE_CHARS = 512

const b64url = (buf: Buffer) => buf.toString('base64url')

function sign(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(`${VERSION}.${payload}`).digest()
}

/** Constant-time, and length-safe: `timingSafeEqual` throws on a length mismatch. */
function signatureMatches(expected: Buffer, actual: Buffer): boolean {
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

/**
 * `exp` is stamped here rather than taken from the caller, so no call site can
 * mint a cookie that outlives the window.
 *
 * `nowSeconds` is injectable for the check script alone — there is no clock in
 * this module's contract, and the expiry assertions would otherwise have to
 * sleep.
 */
export function encodeClaimIntent(
  intent: Omit<ClaimIntent, 'exp'>,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const exp = nowSeconds + SHARE_CLAIM_TTL_SECONDS
  /**
   * The producer validates too, so no oversize or nonsense cookie is ever
   * minted. Without this a hostile `?tz=` of five hundred characters would push
   * the encoded value past `MAX_COOKIE_CHARS` and the whole claim would be
   * dropped on the way back — a much worse failure than the honest "no zone"
   * this degrades to, which F17 turns into the `/onboarding` fallback.
   */
  const tz = usableZone(intent.tz)
  // `|` is safe as a separator because every field is charset-bounded on both
  // sides: a slug is base32, `w` is one digit, a zone is IANA, `exp` is digits.
  // Nothing here can contain the separator, so there is no escaping to get wrong.
  const fields = [intent.slug, intent.w ?? '', tz ?? '', exp].join('|')
  const payload = b64url(Buffer.from(fields, 'utf8'))
  return `${VERSION}.${payload}.${b64url(sign(payload, secret))}`
}

/**
 * Total: every input, including nonsense, yields an intent or `null`.
 *
 * Order matters. The cheap structural rejections come first, the HMAC second,
 * and the field validation only after the signature has proven we wrote the
 * value — so a hostile cookie never reaches `Intl.DateTimeFormat`.
 */
export function decodeClaimIntent(
  raw: unknown,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): ClaimIntent | null {
  if (typeof raw !== 'string') return null
  if (raw.length === 0 || raw.length > MAX_COOKIE_CHARS) return null

  const parts = raw.split('.')
  if (parts.length !== 3) return null
  const [version, payload, signature] = parts
  if (version !== VERSION) return null

  let actual: Buffer
  try {
    actual = Buffer.from(signature, 'base64url')
  } catch {
    return null
  }
  if (!signatureMatches(sign(payload, secret), actual)) return null

  const fields = Buffer.from(payload, 'base64url').toString('utf8').split('|')
  if (fields.length !== 4) return null
  const [slug, rawW, rawTz, rawExp] = fields

  if (!isShareSlug(slug)) return null

  const exp = Number(rawExp)
  // `Number('')` is 0 and `Number('1e9')` is a number; requiring digits and an
  // integer is what stops both from reading as a live expiry.
  if (!/^\d+$/.test(rawExp) || !Number.isSafeInteger(exp)) return null
  if (exp <= nowSeconds) return null

  let w: number | null = null
  if (rawW !== '') {
    const parsed = Number(rawW)
    if (!isShareWordIndex(parsed)) return null
    w = parsed
  }

  // A zone that no longer resolves degrades to "no zone", which F17 turns into
  // the honest `/onboarding` fallback. It is never a reason to drop the claim.
  return { slug, w, tz: usableZone(rawTz), exp }
}

/* ------------------------ F18's `dw_next` destination ----------------------- */

/**
 * The same signing, for a payload that is one symbol wide.
 *
 * `v1.<base64url(destination|exp)>.<hmac>` — the same version prefix, the same
 * `exp`-inside-the-signature discipline, the same injectable clock. It shares
 * this module rather than starting a second cookie codec next door, because two
 * cookie disciplines in one feature is how one of them ends up unsigned.
 *
 * What it is **not**: a claim. Nothing is written when it is consumed; it only
 * decides which of two hard-coded screens onboarding ends on. See
 * `SHARE_NEXT_COOKIE` in `policy.ts` for why that distinction is load-bearing,
 * and `nextDestinationHref` for the literal `switch` that is the whole point.
 */
export function encodeNextDestination(
  destination: ShareNextDestination,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const exp = nowSeconds + SHARE_NEXT_TTL_SECONDS
  const payload = b64url(Buffer.from(`${destination}|${exp}`, 'utf8'))
  return `${VERSION}.${payload}.${b64url(sign(payload, secret))}`
}

/**
 * Total, like `decodeClaimIntent`, and in the same order: structure, then the
 * HMAC, then the fields. A value that is not one of ours never reaches the
 * `switch` that turns a symbol into an href.
 */
export function decodeNextDestination(
  raw: unknown,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): ShareNextDestination | null {
  if (typeof raw !== 'string') return null
  if (raw.length === 0 || raw.length > MAX_COOKIE_CHARS) return null

  const parts = raw.split('.')
  if (parts.length !== 3) return null
  const [version, payload, signature] = parts
  if (version !== VERSION) return null

  let actual: Buffer
  try {
    actual = Buffer.from(signature, 'base64url')
  } catch {
    return null
  }
  if (!signatureMatches(sign(payload, secret), actual)) return null

  const fields = Buffer.from(payload, 'base64url').toString('utf8').split('|')
  if (fields.length !== 2) return null
  const [destination, rawExp] = fields

  const exp = Number(rawExp)
  if (!/^\d+$/.test(rawExp) || !Number.isSafeInteger(exp)) return null
  if (exp <= nowSeconds) return null

  return isShareNextDestination(destination) ? destination : null
}

/** Length-capped before `Intl` sees it, so a pasted essay is cheap to reject. */
function usableZone(tz: unknown): string | null {
  if (typeof tz !== 'string') return null
  const trimmed = tz.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_TIMEZONE_LEN) return null
  return isValidTimeZone(trimmed) ? trimmed : null
}
