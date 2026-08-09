import { cookies } from "next/headers";
import { requireApiUser } from "@/lib/api/guards";
import { fail, noStore, ok, readJson } from "@/lib/api/respond";
import { completeOnboarding, getProfile } from "@/lib/db/queries/profiles";
import { completeProfileAnswers } from "@/lib/profile/normalize";
import {
  completeOnboardingSchema,
  type CompleteOnboardingResponse,
} from "@/lib/profile/schemas";
import { TIMEZONE_HEADER, resolveRequestTimezone } from "@/lib/profile/timezone";
import { env } from "@/lib/env";
import { decodeNextDestination } from "@/lib/share/intent";
import {
  nextDestinationHref,
  ONBOARDING_DEFAULT_HREF,
  SHARE_NEXT_COOKIE,
} from "@/lib/share/policy";

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

    /**
     * **F18 D13 step 2, and it is the whole of the onboarding change.**
     *
     * `app/(app)/layout.tsx` sends anyone with a null `onboarded_at` to
     * `/onboarding`, so a stranger who tapped "Start your own journal" on a
     * shared entry would otherwise finish five screens and land on `/today` —
     * the home screen of an app they came to for journalling, showing "No words
     * yet."
     *
     * Read and cleared here rather than in the flow component, because the
     * cookie is `HttpOnly` (no script may read it) and this is the one request
     * that ends onboarding. `decodeNextDestination` returns a symbol or null, and
     * `nextDestinationHref` maps that symbol through a literal `switch` — so
     * this route hands back a destination it chose, not one it was handed.
     *
     * Cleared unconditionally, including when it did not decode: a cookie that
     * survived this request would redirect the *next* onboarding on the same
     * browser.
     */
    const jar = await cookies();
    const destination = decodeNextDestination(
      jar.get(SHARE_NEXT_COOKIE)?.value,
      env.AUTH_SECRET,
    );
    jar.delete(SHARE_NEXT_COOKIE);

    return noStore(
      ok<CompleteOnboardingResponse>({
        onboardedAt: result.onboardedAt.toISOString(),
        alreadyOnboarded: result.alreadyOnboarded,
        next: destination ? nextDestinationHref(destination) : ONBOARDING_DEFAULT_HREF,
      }),
    );
  } catch (err) {
    console.error("[api/profile/complete] write failed", { userId, err });
    return noStore(fail(500, "Couldn't save. Try again.", "internal"));
  }
}
