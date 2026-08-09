import { NextResponse } from 'next/server'
import { getShareBySlug } from '@/lib/db/queries/shares'
import { env } from '@/lib/env'
import { encodeClaimIntent } from '@/lib/share/intent'
import {
  isShareSlug,
  isShareWordIndex,
  shareHref,
  CLAIM_PATH,
  SHARE_CLAIM_COOKIE,
  SHARE_CLAIM_COOKIE_OPTIONS,
} from '@/lib/share/policy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * **F16 shipped this as a stub; F17 kept its body and repointed it.**
 *
 * What F16 owed F17 was the seam, and the seam is three things: a path the button
 * can point at that never 404s, a cookie whose shape is already frozen, and an
 * exemption in `src/middleware.ts` — the visitor here has no session, which is
 * the entire point.
 *
 * What it does: validate the slug, confirm the share still resolves, set the
 * signed `dw_claim` cookie, and send the visitor to `/claim`. **It performs no
 * write and claims nothing.** The claim itself is a server action reached from
 * `/claim`, after the OAuth round trip.
 *
 * **This is also where F17 D2 landed differently from its own plan, and on
 * purpose.** F17 designed the cookie to be set by a server action on the public
 * page, immediately before `signIn()`, and flagged that as the single riskiest
 * unverified assumption in the plan (its R1) — the fallback it named was "set the
 * cookie from a plain route handler, then redirect", which is exactly what F16
 * had already built here. So the risk is not taken: a `Set-Cookie` on a 307 from a
 * route handler is not a thing that can silently fail. `startShareClaim` still
 * exists and still calls `signIn` with the frozen literal; it just no longer has
 * to carry a cookie across a redirect it does not control.
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

  /**
   * A slug that is not one never reaches the database, and it never reaches the
   * cookie either: `decodeClaimIntent` would reject it on the way back out, so
   * minting it would only produce a claim that silently does nothing.
   *
   * `/claim` with no cookie says "nothing to add here", which is exactly true.
   * The redirect target is a literal — the rejected slug is not interpolated into
   * anything, here or anywhere else.
   */
  if (!isShareSlug(slug)) return NextResponse.redirect(new URL(CLAIM_PATH, req.url))

  /**
   * Revoked between the render and the tap. The visitor goes back to the share
   * page, which is where the honest sentence for a link that is not available
   * already lives — and which says the same thing for a revoked slug and a slug
   * that never existed. No cookie is set, so no OAuth hop is spent on a shrug.
   */
  const share = await getShareBySlug(slug)
  if (!share) return NextResponse.redirect(new URL(shareHref(slug), req.url))

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

  const res = NextResponse.redirect(new URL(CLAIM_PATH, req.url))
  res.cookies.set(SHARE_CLAIM_COOKIE, encodeClaimIntent(intent, env.AUTH_SECRET), {
    ...SHARE_CLAIM_COOKIE_OPTIONS,
    secure: process.env.NODE_ENV === 'production',
  })
  return res
}
