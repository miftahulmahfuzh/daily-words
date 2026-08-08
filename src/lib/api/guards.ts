import 'server-only'
import { getSessionUser, type SessionUser } from '@/lib/auth/session'
import { fail } from '@/lib/api/respond'

/**
 * The authoritative check for route handlers. Middleware only looks at cookie
 * presence; a stale or forged cookie is rejected here.
 */
export async function requireApiUser(): Promise<
  { ok: true; user: SessionUser } | { ok: false; response: Response }
> {
  const user = await getSessionUser()
  if (!user) return { ok: false, response: fail(401, 'Not signed in', 'unauthenticated') }
  return { ok: true, user }
}
