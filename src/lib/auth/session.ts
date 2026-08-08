import 'server-only'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'

export type SessionUser = {
  id: string
  name: string | null
  email: string
  image: string | null
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth()
  if (!session?.user?.id || !session.user.email) return null
  return {
    id: session.user.id,
    name: session.user.name ?? null,
    email: session.user.email,
    image: session.user.image ?? null,
  }
}

/**
 * For server components and server actions. Redirects when unauthenticated.
 * This — not middleware — is the authoritative check.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) redirect('/signin')
  return user
}
