import { redirect } from 'next/navigation'
import { TimezoneSync } from '@/components/profile/timezone-sync'
import { requireOnboardedUser } from '@/lib/auth/guards'
import { BIRTHDAY_PROMPT_HREF, needsBirthdayPrompt } from '@/lib/profile/birthday'

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
 *
 * **The second redirect is the birthday question, and it fires exactly once per
 * user, ever.** It is here rather than on `/today` because "the first time they
 * open the app" is not a screen — a returning user's first open lands wherever
 * they left off, on any of the tabs. A layout cannot see the pathname, so this is
 * all-or-nothing by construction, which is the same shape (and the same
 * acceptable cost) as the onboarding gate above it.
 *
 * It is safe against the loop the gate above documents for one structural reason
 * and one arithmetic one: `/birthday` is a sibling of this group, so this function
 * physically cannot run on it; and `needsBirthdayPrompt` is false the moment the
 * screen's write lands, whether the user answered or skipped.
 *
 * It is also blind to *how* a user got onboarded, which is the property to keep:
 * no other path writes a birthday, so a brand-new arrival meets this screen once
 * on the way in and gets exactly the treatment everybody else gets. This gate
 * holds no exception for any feature, and a check script greps this file to keep
 * it that way.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireOnboardedUser()
  if (needsBirthdayPrompt(profile)) redirect(BIRTHDAY_PROMPT_HREF)
  return (
    <>
      {children}
      <TimezoneSync stored={profile.timezone} source={profile.timezoneSource} />
    </>
  )
}
