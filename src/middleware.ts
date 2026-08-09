import { NextResponse, type NextRequest } from 'next/server'
import { isClaimPath, isPublicSharePath } from '@/lib/share/policy'

/**
 * Layer 1 of two: an optimistic, cookie-presence-only redirect.
 *
 * Database sessions cannot be validated here — validating means a DB round-trip
 * through the adapter, and postgres.js does not run on Edge. So this is a UX
 * shortcut and NOT a security boundary. The real checks are `requireUser()` in
 * app/(app)/layout.tsx and `requireApiUser()` in every route handler.
 *
 * Locally the cookie is `authjs.session-token`; in production, served over
 * HTTPS, it is `__Secure-authjs.session-token`. Both must be listed.
 */
const SESSION_COOKIES = ['authjs.session-token', '__Secure-authjs.session-token']

/**
 * The dev-only component gallery. It renders the UI kit against fixtures and
 * touches no user data, so it must be reachable without a session — the
 * Playwright layout spec drives it and there is no session to give it.
 *
 * Gated on NODE_ENV here and `notFound()` inside the route itself. Two locks,
 * because a component gallery reachable in production is how an unfinished
 * screen ends up indexed.
 */
const DEV_ONLY_PREFIX = '/kitchen-sink'

export function middleware(req: NextRequest) {
  const hasCookie = SESSION_COOKIES.some((n) => req.cookies.has(n))
  const { pathname } = req.nextUrl

  if (
    process.env.NODE_ENV !== 'production' &&
    pathname.startsWith(DEV_ONLY_PREFIX)
  ) {
    return NextResponse.next()
  }

  /**
   * F16's public share pages, exempted **here and not in the matcher**.
   *
   * This is the single highest-risk line in the feature, and it fails in the one
   * way its author cannot see: without the exemption the stranger the whole
   * feature exists for is bounced to /signin before the page renders, while the
   * signed-in developer testing it gets a perfect render every time. The
   * middleware is also the *second* gate — the first is that `src/app/s/` is a
   * sibling of the `(app)` route group rather than a member of it.
   *
   * `isPublicSharePath` is a pure predicate in `lib/share/policy.ts` so that
   * what `npm run share:check` asserts offline is literally the function that
   * runs on the request. **Do not "simplify" it into the matcher's negative
   * lookahead.** That alternation is prefix-matched, so `(?!api|s|…)` would also
   * exempt `/signin` — and every future route beginning with `s`.
   *
   * Signed-in viewers fall through to the same page: everybody sees the share.
   */
  if (isPublicSharePath(pathname)) {
    return NextResponse.next()
  }

  /**
   * F17's claim interstitial, and the second half of the same problem.
   *
   * A stranger arrives at `/claim` holding the signed intent cookie and **no
   * session** — that is the entire audience for the feature. Bounced to `/signin`
   * they would sign in against `signInWithGoogle`'s hardcoded
   * `redirectTo: '/today'`, land in `/onboarding`, and the intent would expire
   * unread: a silent failure that looks like "the claim just doesn't happen".
   * So `/claim` renders its own Google button, aimed at itself.
   *
   * Exempting the render costs nothing. The page reads nothing privileged without
   * `getSessionUser()`, and the claim's writes are behind `requireUser()` inside
   * a server action. `isClaimPath` is **exact-match** — see its comment for why a
   * `startsWith` would quietly exempt every future route beginning with those
   * five letters.
   */
  if (isClaimPath(pathname)) {
    return NextResponse.next()
  }

  if (!hasCookie && pathname !== '/signin') {
    return NextResponse.redirect(new URL('/signin', req.url))
  }

  /**
   * The reverse direction — signed-in user lands on /signin, send them to
   * /today — is deliberately NOT done here, though F1 §6 step 11 wrote it that
   * way. Cookie presence cannot distinguish a live session from a dead one, so
   * that branch loops: /signin --(cookie present)--> /today --(requireUser
   * rejects)--> /signin, forever, and the user cannot reach the page that would
   * fix it. Verified with curl: ERR_TOO_MANY_REDIRECTS.
   *
   * /signin does the real session check itself, where a dead cookie is visible.
   */
  return NextResponse.next()
}

export const config = {
  matcher: [
    /**
     * Everything except Next internals, static assets, and `/api`.
     *
     * All of `/api` is excluded, not just `/api/auth` as F1 §6 step 11 wrote it:
     * an unauthenticated fetch to a route handler must get the 401 JSON that
     * `requireApiUser()` produces, not a 307 to an HTML sign-in page.
     *
     * `badges` joined the list with F12. Badge art is generated, content-hashed,
     * committed art — it is not user data, and a signed-out request for one
     * should get the picture rather than a 307 to /signin. Measured, not
     * assumed: before this was added, `curl -I /badges/<key>.<hash>.webp`
     * answered 307. It matters beyond the wasted middleware invocation, because
     * F16–F18 serve public share pages to strangers with no session at all, and
     * a medal that redirects to a sign-in page is the same mistake as putting a
     * public route inside the `(app)` group, one layer down.
     *
     * `levels` joined it with F22, on the same terms and for the same class of
     * failure. Two honest notes about it:
     *
     *  - **It is not load-bearing today.** No signed-out page draws level art;
     *    /profile is inside the `(app)` group. It is added now because the
     *    failure is invisible on the day it becomes load-bearing, and F18 found
     *    the identical class of bug in `isPublicSharePath`, where every row of a
     *    shared card bounced a stranger to /signin while rendering perfectly for
     *    the signed-in author.
     *  - **This alternation is PREFIX-matched.** `badges` and `levels` here also
     *    exempt any future route whose path merely begins with those letters —
     *    the same latent hazard `icons` already carries, and the reason CLAUDE.md
     *    forbids moving the share exemption into this lookahead. It is not left
     *    to memory: `npm run badges:check` §12 fails if any directory under
     *    `src/app` starts with either word.
     */
    '/((?!api|_next/static|_next/image|favicon.ico|badges|levels|icons|manifest.webmanifest|apple-icon|icon).*)',
  ],
}
