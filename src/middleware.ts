import { NextResponse, type NextRequest } from 'next/server'

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
     */
    '/((?!api|_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|apple-icon|icon).*)',
  ],
}
