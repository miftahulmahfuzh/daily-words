import "server-only";
import { getProfile } from "@/lib/db/queries/profiles";
import { buildProfileContext, type ProfileContext } from "@/lib/profile/context";

/**
 * The server half of the prompt-context contract.
 *
 * Split from `context.ts` because that module must stay pure: `queries/profiles`
 * is `server-only`, and one combined module would make the builder unimportable
 * from a client bundle and untestable offline. F7 §9 sanctioned exactly this
 * split — "start unsplit; split only if a bundling error appears". It appeared.
 *
 * F6 and F8 import `getProfileContext` from here and everything else
 * (`PROFILE_CONTEXT_GUARD`, `TONE_DIRECTIVES`, `ChatTone`) from `context.ts`.
 */

export type { ProfileContext } from "@/lib/profile/context";

/**
 * Loads the row and builds the context. Returns the documented empty-profile
 * block for a user with no row at all, so no caller carries a null branch.
 */
export async function getProfileContext(userId: string): Promise<ProfileContext> {
  return buildProfileContext(await getProfile(userId));
}
