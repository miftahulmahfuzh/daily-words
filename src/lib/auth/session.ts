import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'

export type SessionUser = {
  id: string
  name: string | null
  email: string
  image: string | null
}

/**
 * The session, read at most once per request.
 *
 * `cache()` here is not an optimisation looking for a problem: Auth.js is
 * configured `session: { strategy: 'database' }`, so `auth()` is a Neon round
 * trip rather than a cookie parse — and **every** authed page pays for two of
 * them, serially. `app/(app)/layout.tsx` calls `requireOnboardedUser()`, and then
 * the page inside it calls `requireUser()`, and the two read the same session row.
 *
 * It wraps the plain read rather than `requireUser`, which throws via
 * `redirect()`. React's cache is per-request, so there is no staleness surface
 * and no eviction to reason about: a second request sees a second read.
 */
export const getSessionUser = cache(async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth()
  if (!session?.user?.id || !session.user.email) return null
  return {
    id: session.user.id,
    name: session.user.name ?? null,
    email: session.user.email,
    image: session.user.image ?? null,
  }
})

/**
 * For server components and server actions. Redirects when unauthenticated.
 * This — not middleware — is the authoritative check.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) redirect('/signin')
  return user
}
