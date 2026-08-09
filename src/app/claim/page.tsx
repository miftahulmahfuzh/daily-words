import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Screen, ScreenBody } from "@/components/layout/screen";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow, Prose } from "@/components/ui/text";
import { SignInButton } from "@/app/signin/sign-in-button";
import { getSessionUser } from "@/lib/auth/session";
import { getShareBySlug } from "@/lib/db/queries/shares";
import { env } from "@/lib/env";
import {
  claimAddingSentence,
  claimSignInSentence,
  claimWriteFailed,
  noIntentStop,
  type ClaimStop,
} from "@/lib/share/claim";
import { finishShareClaim, startShareClaim } from "@/lib/share/claim-actions";
import { planClaim } from "@/lib/share/claim.server";
import { decodeClaimIntent } from "@/lib/share/intent";
import { SHARE_CLAIM_COOKIE, SHARE_GONE_BODY, SHARE_GONE_TITLE } from "@/lib/share/policy";
import { sharedPayloadSchema } from "@/lib/share/schemas";
import { ClaimRunner, ClaimSubmitButton } from "./claim-runner";

/**
 * The claim interstitial: one sentence, and then the chat.
 *
 * **A sibling of the `(app)` route group, like `/onboarding` and `/signin`.**
 * Inside the group, `requireOnboardedUser()` would send a brand-new claimer to
 * `/onboarding` before the claim could set `onboarded_at` — the same mistake as
 * putting `/s/[slug]` inside the group, one screen later, and just as invisible
 * to the signed-in author testing it. `src/middleware.ts` is the second gate and
 * exempts this path through `isClaimPath`; either one missing kills the feature.
 *
 * **This page never writes.** Everything it renders comes from `planClaim`, which
 * is reads only. The mutation is `finishShareClaim`, a POST-only server action,
 * and if someone later "simplifies" this by moving the write into the page body
 * they will have converted a CSRF-protected POST into a GET mutation (F17 D5).
 *
 * `force-dynamic` because every branch below depends on a cookie and a session,
 * and because a cached render of "adding genteel to your words" would be a lie
 * the moment the row exists.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * `noindex`, for the same reason `/s/[slug]` carries it: this URL is only
 * meaningful to a browser holding a signed cookie, and a crawler that finds it
 * gets a screen saying there is nothing to add.
 */
export const metadata: Metadata = {
  title: "Adding a word — Daily Words",
  robots: { index: false, follow: false },
};

/** Every stop screen on this page draws the same way. */
function ClaimStopScreen({ stop }: { stop: ClaimStop }) {
  return (
    <Screen>
      <ScreenBody padded={false} className="dw-fade px-6">
        <Eyebrow>Daily Words</Eyebrow>
        <EmptyState
          title={stop.title}
          body={stop.body}
          action={stop.action ?? undefined}
        />
      </ScreenBody>
    </Screen>
  );
}

/**
 * The word behind the cookie, for the two screens that name it before any
 * decision has been made. Parsed rather than cast, like every other read of that
 * `jsonb` column.
 */
async function readSharedTerm(slug: string): Promise<string | null> {
  const row = await getShareBySlug(slug);
  if (!row) return null;
  const parsed = sharedPayloadSchema.safeParse(row.payload);
  return parsed.success ? parsed.data.term : null;
}

export default async function ClaimPage({
  searchParams,
}: {
  searchParams: Promise<{ failed?: string | string[] }>;
}) {
  const { failed } = await searchParams;
  const user = await getSessionUser();

  const intent = decodeClaimIntent(
    (await cookies()).get(SHARE_CLAIM_COOKIE)?.value,
    env.AUTH_SECRET,
  );

  /**
   * No cookie, or one that expired, was tampered with, or names a slug that is
   * not one. The same screen whether or not they are signed in — there is
   * genuinely nothing to add, and saying anything else would be inventing a
   * reason.
   */
  if (!intent) return <ClaimStopScreen stop={noIntentStop(Boolean(user))} />;

  /**
   * The stranger, before the Google hop. This is the audience the whole feature
   * exists for, and the sentence continues the one they tapped rather than
   * restarting on a marketing screen: the word is named, and the button is the
   * one `/signin` uses, down to "Taking you to Google…".
   */
  if (!user) {
    const term = await readSharedTerm(intent.slug);
    if (!term) {
      return (
        <ClaimStopScreen
          stop={{ title: SHARE_GONE_TITLE, body: SHARE_GONE_BODY, action: null }}
        />
      );
    }

    return (
      <Screen>
        <ScreenBody padded={false} className="dw-fade px-8">
          <div className="flex flex-1 flex-col justify-center gap-[18px]">
            <Eyebrow className="tracking-[0.22em]">Daily Words</Eyebrow>
            <h1 className="m-0 text-[32px] leading-[1.1] font-normal tracking-[-0.015em]">
              {term}
            </h1>
            <div className="h-px w-11 bg-rule" />
            <Prose className="max-w-[250px]">{claimSignInSentence(term)}</Prose>
          </div>

          <div
            className="flex shrink-0 flex-col gap-[18px]"
            style={{ paddingBottom: "calc(var(--pad-bottom) + 30px)" }}
          >
            {/* No hidden fields: the slug is in an HttpOnly cookie and the
                target is a frozen literal, so there is nothing here to tamper
                with. */}
            <form action={startShareClaim}>
              <SignInButton />
            </form>
            <p className="m-0 text-center font-mono text-mono-xs leading-[1.7] tracking-[0.04em] text-ink-3">
              The only way in. No password to forget.
            </p>
          </div>
        </ScreenBody>
      </Screen>
    );
  }

  /**
   * The insert threw twice. Rendering the interstitial again would auto-submit
   * into a retry loop, so this is the one branch that shows the button and waits
   * for a human.
   */
  const isFailed = failed === "1";
  const decision = isFailed
    ? claimWriteFailed()
    : await planClaim(user.id, intent);

  if (decision.stop && !isFailed) return <ClaimStopScreen stop={decision.stop} />;

  /**
   * Nothing to write and somewhere to go: the sharer on their own link, a word
   * the claimer already owns, or a brand-new claimer with no detected zone who is
   * owed the honest five screens. Straight there — an interstitial that says
   * "adding…" before adding nothing is a small lie.
   *
   * The cookie is left in place: a server component cannot clear one, and it is
   * `HttpOnly`, expires within ten minutes, and re-running the claim is
   * idempotent.
   */
  if (decision.href && !decision.willOnboard) redirect(decision.href);

  return (
    <Screen>
      <ScreenBody padded={false} className="dw-fade px-6">
        <Eyebrow>Daily Words</Eyebrow>

        <div className="flex flex-1 flex-col justify-center gap-4">
          {/* A sentence, not a spinner (F17 D6). The word is read before the
              write, so the screen is never blank while it happens. */}
          {decision.stop ? (
            <>
              <p className="m-0 text-lg text-ink">{decision.stop.title}</p>
              <Prose size="body" className="max-w-[260px]">
                {decision.stop.body}
              </Prose>
            </>
          ) : (
            <Prose size="body" className="max-w-[260px]">
              {claimAddingSentence(decision.term ?? "this word")}
            </Prose>
          )}
        </div>

        <form
          action={finishShareClaim}
          className="flex shrink-0 flex-col gap-3"
          style={{ paddingBottom: "var(--pad-bottom)" }}
        >
          {!isFailed && <ClaimRunner />}
          <ClaimSubmitButton />
        </form>
      </ScreenBody>
    </Screen>
  );
}
