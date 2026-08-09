'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { signIn } from '@/auth'
import { requireUser } from '@/lib/auth/session'
import { env } from '@/lib/env'
import { resolveAndClaim } from '@/lib/share/claim.server'
import { decodeClaimIntent } from '@/lib/share/intent'
import { CLAIM_PATH, SHARE_CLAIM_COOKIE } from '@/lib/share/policy'

/**
 * The two POSTs the claim needs, and nothing else.
 *
 * **Server actions rather than route handlers, on purpose (F17 D5).** They are
 * POST-only, `Origin`/`Host`-checked by Next 15, and callable only with the
 * encrypted action id Next embedded in the page it served. The alternatives were
 * each rejected for a reason worth keeping written down:
 *
 * - *The Auth.js `signIn` event.* It receives `{ user, account, profile,
 *   isNewUser }` and not the request, so it cannot see the intent cookie at all.
 *   And a throw inside it surfaces as a `CallbackRouteError` and bounces the user
 *   to `/signin?error=…` — **a failed word-add would break sign-in itself.**
 *   Nothing in the auth flow may depend on a feature succeeding.
 * - *A server component that mutates during render.* A GET that writes is
 *   prefetchable by `<Link>`, replayed on refresh, triggerable by any page that
 *   links to it, and invisible to Next's action CSRF machinery.
 * - *`POST /api/share/[slug]/claim`.* Workable, but it needs the slug either in
 *   the client's hands (it is in an `HttpOnly` cookie, deliberately) or in the
 *   URL, and it brings its own CSRF story.
 *
 * The corollary constraint, stated so the next reader does not undo it:
 * **`app/claim/page.tsx` must stay side-effect-free.** Moving the write into the
 * page body converts a CSRF-protected POST into a GET mutation.
 */

/**
 * Start the Google hop, aimed at a **frozen literal**.
 *
 * The intent is already in the cookie — `/s/[slug]/claim` set it before anything
 * here ran — so this function takes no arguments and the form carries no data.
 * Nothing submittable can change what gets claimed.
 *
 * `signInWithGoogle` in `lib/auth/actions.ts` is untouched and still targets
 * `/today` (F17 D3). That is what makes an abandoned intent harmless: a user who
 * presses Cancel at Google's consent screen and signs in from `/signin` ten
 * seconds later is **not** silently claimed, because the claim only ever runs at
 * `/claim`, and the cookie simply expires unread.
 */
export async function startShareClaim(): Promise<void> {
  await signIn('google', { redirectTo: CLAIM_PATH })
}

/**
 * Read the cookie, claim, go.
 *
 * The cookie is authoritative and the form is empty, so `userId` comes from a
 * database session and the word comes from a signed cookie — there is no third
 * input to confuse them with.
 *
 * **The cookie is cleared only on success.** On a stop outcome it is left in
 * place and the redirect goes back to `/claim`, whose server component re-derives
 * the *same* decision and renders the real reason. Clearing it first would replace
 * "that link is not available" with "nothing to add here", which is a different
 * and less true sentence. `write_failed` carries `?failed=1` so the page offers a
 * retry button instead of auto-submitting into a loop.
 */
export async function finishShareClaim(): Promise<void> {
  const user = await requireUser()

  const jar = await cookies()
  const intent = decodeClaimIntent(
    jar.get(SHARE_CLAIM_COOKIE)?.value,
    env.AUTH_SECRET,
  )

  const decision = await resolveAndClaim(user.id, intent)

  if (decision.href) {
    jar.delete(SHARE_CLAIM_COOKIE)
    redirect(decision.href)
  }

  redirect(
    decision.outcome === 'write_failed' ? `${CLAIM_PATH}?failed=1` : CLAIM_PATH,
  )
}
