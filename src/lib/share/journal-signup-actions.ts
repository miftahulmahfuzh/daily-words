'use server'

import { cookies } from 'next/headers'
import { signIn } from '@/auth'
import { env } from '@/lib/env'
import { encodeNextDestination } from '@/lib/share/intent'
import { SHARE_NEXT_COOKIE, SHARE_NEXT_COOKIE_OPTIONS } from '@/lib/share/policy'

/**
 * "Start your own journal" — a sign-up funnel, not a claim.
 *
 * **Deliberately not in `claim-actions.ts`, because nothing here claims
 * anything** (F18 D13). The differences that make it a different thing:
 *
 * | | F17's claim | this |
 * |---|---|---|
 * | Server effect after auth | a `vocab_entries` row | **none** |
 * | Failure modes | six | none |
 * | Onboarding | silently completed with five nulls | **run in full** |
 * | Payload across OAuth | a signed slug + word index | a destination |
 *
 * Onboarding runs in full precisely *because* there is no pending write to lose.
 * F17 skips it to stop a curious stranger meeting a questionnaire between them
 * and the word they tapped; here the person has asked to start a journal, and
 * the five screens are what make their first insight worth reading.
 *
 * `redirectTo` is the **frozen literal** `/journal`, so F17 D2's structural rule
 * holds: no user-derived string is concatenated into a redirect target anywhere
 * in this feature. That one line fully solves the case of an existing Daily Words
 * user tapping the CTA — they land on their own journal.
 *
 * The cookie is for the *other* case, and only that one: a brand-new account,
 * whom `(app)/layout.tsx` sends to `/onboarding` before `/journal` is ever
 * reached. See `SHARE_NEXT_COOKIE`.
 */
export async function startJournalSignup(): Promise<void> {
  const jar = await cookies()

  /**
   * Set **before** `signIn`, which throws a redirect. Next stages cookie writes
   * onto whatever response the action produces, including a redirect — the same
   * mechanism F17 measured on 2026-08-09 when `cookies().delete()` rode the 303
   * back out of `finishShareClaim`.
   *
   * If it were ever to be dropped the feature degrades exactly one step: a
   * brand-new user finishes onboarding and lands on `/today` instead of
   * `/journal`. Nothing breaks and nothing is lost, which is why this is allowed
   * to be the less-proven half.
   */
  jar.set(SHARE_NEXT_COOKIE, encodeNextDestination('journal', env.AUTH_SECRET), {
    ...SHARE_NEXT_COOKIE_OPTIONS,
    secure: process.env.NODE_ENV === 'production',
  })

  /**
   * The literal, spelled out rather than called for.
   *
   * `nextDestinationHref('journal')` returns exactly this string and would read
   * better — but `claim:check` greps every `redirectTo:` in the application and
   * requires a literal, which is F17 D2's open-redirect defence expressed as a
   * property rather than as a habit. Weakening that grep to allow one helper
   * call would weaken it for every future one. `share:check` asserts instead
   * that this literal and `nextDestinationHref` agree, so the duplication cannot
   * drift.
   */
  await signIn('google', { redirectTo: '/journal' })
}
