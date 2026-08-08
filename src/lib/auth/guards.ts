import 'server-only'
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/db/queries/profiles'
import { requireUser, type SessionUser } from '@/lib/auth/session'
import type { Profile } from '@/lib/db/types'

/**
 * The onboarding gate, for server components only.
 *
 * `requireSession` is F1's `requireUser` under the name F7's contract published;
 * one implementation, two spellings, because `lib/auth/session` is where the
 * session primitive belongs and `lib/auth/guards` is what F9 was told to import.
 */
export { requireUser as requireSession }

export type OnboardedUser = { user: SessionUser; profile: Profile }

/**
 * Signed in **and** onboarded, or a redirect to `/onboarding`.
 *
 * Called once, from the authed shell layout. Not middleware: Auth.js v5 here is
 * configured with database sessions, so an edge gate would need a Neon round
 * trip on every request including static assets, and matcher-based path
 * exclusions are the classic source of redirect loops.
 *
 * "No profile row" and "row with a null `onboarded_at`" are treated identically.
 * The complementary check lives in `app/onboarding/page.tsx`, which redirects
 * when `onboarded_at IS NOT NULL` — strict complements, so at most one of the
 * two can fire for any row. The real defence is structural, though: `/onboarding`
 * sits outside the `(app)` route group, so this function is not in its layout
 * chain and physically cannot run on it.
 */
export async function requireOnboardedUser(): Promise<OnboardedUser> {
  const user = await requireUser()
  const profile = await getProfile(user.id)
  if (!profile || !profile.onboardedAt) redirect('/onboarding')
  return { user, profile }
}
