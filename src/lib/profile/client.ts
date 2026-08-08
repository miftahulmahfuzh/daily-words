import { request, type ApiResult } from "@/lib/api/client";
import type {
  CompleteOnboardingRequest,
  CompleteOnboardingResponse,
  ProfileAnswersRequest,
  ProfileResponse,
  SetTimezoneResponse,
} from "@/lib/profile/schemas";

/**
 * The browser half of F7's three routes. Types only — the zod schemas stay on
 * the server; see the note in `@/lib/api/client`.
 *
 * There is no `getProfile` here and there must not be one. Server components
 * read through `lib/db/queries/profiles.ts` (the locked convention: a page never
 * fetches its own first paint), and a GET route would be a second read path free
 * to diverge from it.
 */

export type { ApiResult } from "@/lib/api/client";

/**
 * Fire-and-forget. Called by `<TimezoneCapture />` during onboarding, by
 * `<TimezoneSync />` on a mismatch, and by the edit form with `manual: true`.
 *
 * Never throws — `request()` returns a result object — and both automatic
 * callers discard it. A failed timezone POST must not be visible, let alone
 * blocking: the completion request carries the zone as a second chance, and the
 * next page load carries it as a third.
 */
export function postTimezone(
  timezone: string,
  manual = false,
): Promise<ApiResult<SetTimezoneResponse>> {
  return request("/api/profile/timezone", "POST", { timezone, manual });
}

/** The single write that ends onboarding. One request, one transaction. */
export function completeOnboarding(
  answers: CompleteOnboardingRequest,
): Promise<ApiResult<CompleteOnboardingResponse>> {
  return request("/api/profile/complete", "POST", answers);
}

/** Partial update from /profile/edit. `null` clears a field. */
export function patchProfile(
  answers: ProfileAnswersRequest,
): Promise<ApiResult<ProfileResponse>> {
  return request("/api/profile", "PATCH", answers);
}
