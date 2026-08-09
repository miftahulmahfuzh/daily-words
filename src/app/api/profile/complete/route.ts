import { requireApiUser } from "@/lib/api/guards";
import { fail, noStore, ok, readJson } from "@/lib/api/respond";
import { completeOnboarding, getProfile } from "@/lib/db/queries/profiles";
import { completeProfileAnswers } from "@/lib/profile/normalize";
import {
  completeOnboardingSchema,
  type CompleteOnboardingResponse,
} from "@/lib/profile/schemas";
import { TIMEZONE_HEADER, resolveRequestTimezone } from "@/lib/profile/timezone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The single write that ends onboarding. **The only HTTP route that sets
 * `onboarded_at`.**
 *
 * That sentence used to read "the only thing that sets `onboarded_at`", and F17
 * made it false rather than deleting it. `lib/share/claim.server.ts` sets it too,
 * by calling the same `completeOnboarding` with **five null answers** and a zone
 * detected in the browser before the OAuth hop — for a stranger who tapped
 * "Practise this word" on a shared word and would otherwise meet a five-screen
 * questionnaire between them and the one thing they asked for. The row that
 * produces is byte-identical to the one this route writes when the user presses
 * `Skip all`, which is the whole argument for F17 D4: it adds no state the app did
 * not already fully support. `coalesce(onboarded_at, now())` makes the two paths
 * idempotent against each other, and F17's `claim:db` asserts that an established
 * user's answers and timestamp survive a claim untouched.
 *
 * One request rather than a PATCH per screen. Five requests on a phone are five
 * chances to fail on a bad connection, and a partial save would leave
 * `onboarded_at` null anyway — so nothing is recovered by splitting it, and the
 * user would be walked back to question one having "saved" three answers.
 *
 * This route is outside the `(app)` route group and therefore outside the
 * onboarding gate. A gate that intercepted this request would be a guaranteed
 * deadlock: the only way out of onboarding would itself be redirected to
 * onboarding.
 */
export async function POST(req: Request): Promise<Response> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const userId = auth.user.id;

  const body = await readJson(req, completeOnboardingSchema);
  if (!body.ok) return body.response;

  const { timezone: requested, ...rawAnswers } = body.data;
  const answers = completeProfileAnswers(rawAnswers);

  const existing = await getProfile(userId);

  // Only used when the row does not exist yet or has nothing better. Onboarding
  // has already POSTed the detected zone through /api/profile/timezone by the
  // time the user reaches screen five; this is the second chance for the case
  // where that POST was swallowed.
  const timezone = requested
    ? resolveRequestTimezone({
        requested,
        header: req.headers.get(TIMEZONE_HEADER),
        stored: existing?.timezone,
      })
    : undefined;

  try {
    const result = await completeOnboarding(userId, answers, timezone);
    return noStore(
      ok<CompleteOnboardingResponse>({
        onboardedAt: result.onboardedAt.toISOString(),
        alreadyOnboarded: result.alreadyOnboarded,
      }),
    );
  } catch (err) {
    console.error("[api/profile/complete] write failed", { userId, err });
    return noStore(fail(500, "Couldn't save. Try again.", "internal"));
  }
}
