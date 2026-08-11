import { Screen } from "@/components/layout/screen";
import { ProfileEditForm } from "@/components/profile/profile-edit-form";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { resolveTimezone } from "@/lib/db/queries/cards";
import { toProfileResponse } from "@/lib/profile/serialize";
import { localDateNow } from "@/lib/time/local-date";

/**
 * The five answers, editable.
 *
 * Inside the `(app)` group, so the shell's `requireOnboardedUser()` has already
 * run — which is why the row below cannot be missing and why this surface is not
 * a way around onboarding. `PATCH /api/profile` enforces the same rule again with
 * a 409, because a route handler sits outside every layout.
 *
 * Works standalone: F9 has not built `/profile` in its final form yet, and this
 * page is reachable by URL and by `<EditProfileLink />` regardless.
 */
export const dynamic = "force-dynamic";

export default async function ProfileEditPage() {
  const { profile } = await requireOnboardedUser();

  return (
    <Screen>
      {/* `today` in the profile's own zone, not the browser's: it bounds the
          birthday field, and this app keeps exactly one answer to "what day is
          it". */}
      <ProfileEditForm
        profile={toProfileResponse(profile)}
        today={localDateNow(resolveTimezone(profile).timezone)}
      />
    </Screen>
  );
}
