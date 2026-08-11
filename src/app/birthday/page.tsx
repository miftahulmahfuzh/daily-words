import { redirect } from "next/navigation";
import { Screen, ScreenBody } from "@/components/layout/screen";
import { BirthdayPrompt } from "@/components/profile/birthday-prompt";
import { requireUser } from "@/lib/auth/session";
import { resolveTimezone } from "@/lib/db/queries/cards";
import { getProfile } from "@/lib/db/queries/profiles";
import { needsBirthdayPrompt } from "@/lib/profile/birthday";
import { localDateNow } from "@/lib/time/local-date";

/**
 * The one question that is not one of the five.
 *
 * **Outside the `(app)` route group, for `/onboarding`'s reason exactly.** That
 * group's layout redirects here; inside it, the guard would be part of this
 * page's own layout chain and every visit would be an infinite redirect. Living
 * as a sibling makes the loop structurally impossible rather than merely avoided.
 *
 * Two gates, in this order, and the order matters:
 *
 *  1. Not onboarded → `/onboarding`. A user who has not finished the five
 *     questions must not be asked a sixth thing first, and the `(app)` gate would
 *     have sent them there anyway.
 *  2. Already asked → `/today`. The inverse of the gate that sends people here,
 *     built on the same predicate, so at most one of the two can fire for a given
 *     row. A user who wants to *change* the answer goes to `/profile/edit`; this
 *     screen exists for the one time it has never been given.
 *
 * No tab bar, because `Screen` only draws one when asked.
 */
export const dynamic = "force-dynamic";

export default async function BirthdayPage() {
  const user = await requireUser();
  const profile = await getProfile(user.id);

  if (!profile?.onboardedAt) redirect("/onboarding");
  if (!needsBirthdayPrompt(profile)) redirect("/today");

  return (
    <Screen>
      {/* The wider gutter of the onboarding flow rather than the app's 22px: this
          screen is a question on its own, and it is not a tab. */}
      <ScreenBody padded={false} className="px-6.5">
        <BirthdayPrompt today={localDateNow(resolveTimezone(profile).timezone)} />
      </ScreenBody>
    </Screen>
  );
}
