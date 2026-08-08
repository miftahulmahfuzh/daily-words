import { redirect } from "next/navigation";
import { Screen, ScreenBody } from "@/components/layout/screen";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { requireUser } from "@/lib/auth/session";
import { getProfile } from "@/lib/db/queries/profiles";

/**
 * The first-run questions.
 *
 * **Outside the `(app)` route group on purpose.** That group's layout calls
 * `requireOnboardedUser()`, which redirects here; if this page were inside it,
 * the guard would be in its own layout chain and every visit would be an
 * infinite redirect. Living as a sibling makes the loop structurally impossible
 * rather than merely avoided — see `lib/auth/guards.ts`.
 *
 * The inverse gate below is the second, independent defence: the shell redirects
 * on `onboarded_at IS NULL`, this redirects on `onboarded_at IS NOT NULL`. Strict
 * complements, so at most one can fire for a given row.
 *
 * No tab bar, because `Screen` only draws one when asked.
 */
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  if (profile?.onboardedAt) redirect("/today");

  return (
    <Screen>
      {/* 26px gutter rather than the app's 22px — the design gives this flow its
          own wider margin, and it is the only screen that is not a tab. */}
      <ScreenBody padded={false} className="px-6.5">
        <OnboardingFlow />
      </ScreenBody>
    </Screen>
  );
}
