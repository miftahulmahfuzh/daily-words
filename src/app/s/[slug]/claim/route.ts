import { NextResponse } from 'next/server'
import { getShareBySlug } from '@/lib/db/queries/shares'
import { env } from '@/lib/env'
import { encodeClaimIntent } from '@/lib/share/intent'
import {
  isShareSlug,
  isShareWordIndex,
  SHARE_CLAIM_COOKIE,
  SHARE_CLAIM_COOKIE_OPTIONS,
} from '@/lib/share/policy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * **F16 ships this as a stub. F17 replaces its body, not its URL.**
 *
 * What F16 owes F17 is the seam, and the seam is three things: a path the button
 * can point at that never 404s, a cookie whose shape is already frozen, and an
 * exemption in `src/middleware.ts` — the visitor here has no session, which is
 * the entire point.
 *
 * What it does today: validate the slug, confirm the share still resolves, set
 * the signed `dw_claim` cookie, and send the visitor to `/signin`. **It performs
 * no write and claims nothing** — F17 owns everything after the OAuth round
 * trip, and until it lands the cookie simply expires unused, because
 * `signInWithGoogle` still targets `/today`.
 *
 * The cookie's shape is F17's `dw_claim` rather than F16 §5's own
 * `dw_share_intent`, on the brief's ruling [C1]: signed, so a hand-forged cookie
 * cannot aim the claim at an arbitrary share; carrying its own `exp` rather than
 * trusting `Max-Age`; and carrying a timezone, which F17 needs because **writes
 * may not fall back to a default zone** and the claim performs a write. [C2]
 * adds the word index `w`, which F18's shared card needs and which is cheaper to
 * carry from the start than to retrofit into a signed payload.
 *
 * **A GET that sets a cookie, and nothing else.** It is deliberately not a GET
 * that mutates: F17 D5 puts the claim itself in a server action, because a GET
 * render that writes is prefetchable by `<Link>`, replayed on refresh and
 * invisible to Next's action CSRF machinery. If someone later "simplifies" this
 * by moving a write in here, they have converted a CSRF-protected POST into a
 * GET mutation.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params

  // A slug that is not one never reaches the database, and it never reaches the
  // cookie either: `decodeClaimIntent` would reject it on the way back out, so
  // minting it would only produce a claim that silently does nothing.
  if (!isShareSlug(slug)) return NextResponse.redirect(new URL('/signin', req.url))

  // Revoked between the render and the tap. Nothing to aim a claim at, so the
  // visitor is sent to sign-in without a cookie rather than through an OAuth hop
  // that ends in a shrug.
  const share = await getShareBySlug(slug)
  if (!share) return NextResponse.redirect(new URL('/signin', req.url))

  /**
   * `tz` and `w` are read from the query string, validated, and discarded when
   * they are not what they claim to be.
   *
   * Neither is used to build a redirect target — the only `Location` this route
   * can emit is the literal `/signin` — so there is no open-redirect surface
   * here to mitigate; there is simply nowhere for a hostile string to go.
   * `w` is an index into a card, `1`–`6`, never a vocab uuid ([C2]); F16 mints
   * only vocab shares, so today it is always absent.
   *
   * The timezone is *detected*, never asked — CLAUDE.md's rule — and F17's
   * client button is what will fill it in on mount. Absent, it stays null, and
   * F17 degrades to the honest `/onboarding` fallback rather than dating a
   * brand-new user's first card by guesswork.
   */
  const query = new URL(req.url).searchParams
  const rawW = Number(query.get('w'))
  const intent = {
    slug,
    w: isShareWordIndex(rawW) ? rawW : null,
    tz: query.get('tz'),
  }

  const res = NextResponse.redirect(new URL('/signin', req.url))
  res.cookies.set(SHARE_CLAIM_COOKIE, encodeClaimIntent(intent, env.AUTH_SECRET), {
    ...SHARE_CLAIM_COOKIE_OPTIONS,
    secure: process.env.NODE_ENV === 'production',
  })
  return res
}
