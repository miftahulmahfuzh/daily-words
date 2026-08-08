import { TimezoneSync } from '@/components/profile/timezone-sync'
import { requireOnboardedUser } from '@/lib/auth/guards'

/**
 * The authoritative auth **and** onboarding guard for every signed-in route.
 *
 * It deliberately renders no chrome. Each screen owns its own frame through the
 * `Screen` primitive (which is what holds the no-scroll vertical budget and the
 * tab bar), so wrapping them in a second header/main/footer here would break
 * the layout maths the design depends on.
 *
 * `requireOnboardedUser()` is what makes F7's guarantee to F5 and F9 true: a
 * user cannot reach any authed page without a profile row carrying a valid IANA
 * timezone, so neither feature carries a null branch. `/onboarding` is a sibling
 * of this group precisely so the guard cannot run on it.
 *
 * `<TimezoneSync />` renders nothing and, in the steady state, issues no
 * requests — it compares the browser's zone against the one this render used and
 * only posts on a mismatch.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireOnboardedUser()
  return (
    <>
      {children}
      <TimezoneSync stored={profile.timezone} source={profile.timezoneSource} />
    </>
  )
}
