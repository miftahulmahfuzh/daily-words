import 'server-only'
import { isUniqueViolation } from '@/lib/db/errors'
import { getShareTargetForClaim } from '@/lib/db/queries/shares'
import {
  completeOnboarding,
  getProfile,
  setTimezone,
} from '@/lib/db/queries/profiles'
import {
  countEntriesCreatedSince,
  createClaimedVocabEntry,
  findEntryByNormalizedTerm,
  DAILY_ADD_LIMIT,
} from '@/lib/db/queries/vocab'
import { completeProfileAnswers } from '@/lib/profile/normalize'
import {
  claimLandingHref,
  claimWriteFailed,
  resolveClaimOutcome,
  type ClaimDecision,
  type ClaimInput,
  type ClaimIntentFields,
  type ClaimShare,
} from '@/lib/share/claim'
import { isShareSlug } from '@/lib/share/policy'
import { sharedPayloadSchema } from '@/lib/share/schemas'
import { normalizeTerm, validateTerm } from '@/lib/vocab/normalize'

/**
 * The claim's I/O half: the reads that feed `resolveClaimOutcome`, and the two
 * writes it authorises.
 *
 * **The only file that both reads a share and writes a vocab row.** Everything
 * decidable is decided next door in `claim.ts`; what is left here is the order
 * of statements, and the order is the design:
 *
 *   1. Read. Every failure — no cookie, no share, an unusable term, the owner's
 *      own link, the daily limit — is decided from reads alone.
 *   2. Onboard, **only once the claim is known to be about to succeed.** A
 *      failed claim leaves a brand-new account un-onboarded and therefore able
 *      to walk into the honest five-screen flow from the button on the failure
 *      screen. Making onboarding permanent first would strand them in a signed-in
 *      account with nothing in it.
 *   3. Insert, in one statement.
 *
 * Steps 2 and 3 are **not** wrapped in one transaction. `completeOnboarding`
 * opens its own, and nesting would hold a savepoint across an insert that raises
 * `23505` as ordinary control flow. Both are independently idempotent, and the
 * worst interleaving — onboarded, insert failed — leaves a user who can press the
 * button again or walk into `/today`. That is a strictly better failure than a
 * rolled-back onboarding under a live session.
 *
 * **Nothing here redirects.** `redirect()` throws, and a function that throws a
 * redirect cannot be driven by `npm run claim:db`. The decision comes back with
 * an href and `claim-actions.ts` performs the navigation.
 */

/** Rolling window, not a calendar day: needs no timezone and no profile. */
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * All five answer columns explicitly null — the row a user who presses F7's
 * `Skip all` gets, byte for byte.
 *
 * F17 D4: the claim completes onboarding on the claimer's behalf rather than
 * wedging a five-screen questionnaire between a curious stranger and the one
 * thing they tapped. This adds **no state the app did not already fully support**
 * — `buildProfileContext(null)` is documented as total, and
 * `lib/llm/prompts/chat-system.ts` already has an `EMPTY_PROFILE_NOTE` for
 * exactly this person. F7 accepted that "the user skipped this" and "the user
 * cleared this" are one state; "the system skipped this on their behalf" joins
 * them.
 *
 * `onboarded_at` keeps its meaning. Read the three places that consume it —
 * `lib/auth/guards.ts`, `app/onboarding/page.tsx`, `app/api/profile/route.ts` —
 * and none of them reads it as "answered the questions". It means "has been
 * through first-run and carries a timezone we did not guess", which a claimed
 * user satisfies exactly. Nobody is ever nagged to finish: F7 §3 rules that out,
 * and `<EditProfileLink />` on `/profile` is the whole of the deferral.
 */
const EMPTY_ANSWERS = completeProfileAnswers({})

/**
 * The share row, parsed into what the decision needs.
 *
 * Parsed, not cast: `payload` is `jsonb` and the database guarantees it nothing,
 * so a row written by an older serializer degrades to "no payload" — which the
 * resolver turns into the same screen as a revoked link — rather than crashing a
 * claim. The second net under `lib/share/serialize.ts`'s write-side allowlist.
 */
async function readShare(slug: string): Promise<ClaimShare | null> {
  const row = await getShareTargetForClaim(slug)
  if (!row) return null

  const parsed = sharedPayloadSchema.safeParse(row.payload)
  if (!parsed.success) {
    console.error(`[claim] slug ${slug} holds an unreadable payload`)
  }

  return {
    userId: row.userId,
    entityType: row.entityType,
    vocabEntryId: row.vocabEntryId,
    // F18's `card` and `journal` arms land in `sharedPayloadSchema`, and the
    // resolver's step 2 is where they become claimable.
    payload: parsed.success && parsed.data.kind === 'vocab' ? parsed.data : null,
  }
}

/**
 * Every fact the decision is made from. Three or five reads, no writes.
 *
 * The last two are issued only when there is a share with a usable term — and
 * then unconditionally, including for the sharer looking at their own link, who
 * needs neither. They are side-effect-free single-index lookups, and paying for
 * them buys one code path and a resolver that is total over its whole input
 * rather than one whose correctness depends on which reads the caller skipped.
 */
async function buildInput(
  userId: string,
  intent: ClaimIntentFields | null,
): Promise<ClaimInput> {
  const profile = await getProfile(userId)

  const base: ClaimInput = {
    sessionUserId: userId,
    intent,
    share: null,
    claimerOnboarded: Boolean(profile?.onboardedAt),
    existingEntryId: null,
    addsInLast24h: 0,
    dailyAddLimit: DAILY_ADD_LIMIT,
  }

  // A slug that is not one never reaches the database. `decodeClaimIntent`
  // already refuses to hand out a malformed one; this is the second net, so that
  // a hand-built intent in a script cannot turn into a query either.
  if (!intent || !isShareSlug(intent.slug)) return base

  const share = await readShare(intent.slug)

  /**
   * The term is normalised here *and* again inside the resolver. That is
   * deliberate, not an oversight: the resolver must be total over raw input for
   * `claim:check` to drive it offline, and this side needs the same string to
   * look the claimer's own collection up by. One function, called twice, cannot
   * disagree with itself.
   */
  const term = share?.payload ? normalizeTerm(share.payload.term) : ''
  if (!term || !validateTerm(term).ok) return { ...base, share }

  const [existing, addsInLast24h] = await Promise.all([
    findEntryByNormalizedTerm(userId, term),
    countEntriesCreatedSince(userId, new Date(Date.now() - DAY_MS)),
  ])

  return { ...base, share, existingEntryId: existing?.id ?? null, addsInLast24h }
}

/**
 * What would happen, without doing any of it.
 *
 * `/claim`'s server component calls this to decide between the stop screen, an
 * immediate redirect and the interstitial — so **the GET render never writes**,
 * which is what keeps the mutation inside a POST-only server action where Next's
 * CSRF machinery can see it (F17 D5). The action then re-derives the decision
 * authoritatively, because a share can be revoked between the render and the tap.
 */
export async function planClaim(
  userId: string,
  intent: ClaimIntentFields | null,
): Promise<ClaimDecision> {
  return resolveClaimOutcome(await buildInput(userId, intent))
}

/**
 * The claim itself. Reads, then at most two writes, then an href.
 *
 * `userId` comes from `(await requireUser()).id` — a **database** session, not a
 * JWT, not a form field, and never `share.userId`. Every write below is scoped by
 * it, which is what bounds the blast radius of everything else in this feature to
 * the requester's own collection.
 */
export async function resolveAndClaim(
  userId: string,
  intent: ClaimIntentFields | null,
): Promise<ClaimDecision> {
  const input = await buildInput(userId, intent)
  const decision = resolveClaimOutcome(input)

  if (decision.willOnboard) {
    /**
     * The zone is the one detected in the browser on the public share page,
     * before the OAuth hop, and it rode inside the signed cookie. `willOnboard`
     * is only true when it decoded to a real IANA zone, so there is nothing to
     * guess here — and `no_timezone` is the outcome when there was.
     *
     * `setTimezone` first, and **`completeOnboarding` is then given the zone
     * `setTimezone` actually settled on**, not the requested one. That matters
     * for one user: somebody who once corrected their zone by hand has
     * `timezone_source = 'manual'`, `setTimezone`'s guard refuses to overwrite
     * it, and passing the cookie's zone straight to `completeOnboarding` would
     * walk around that guard through the back door. Unreachable today — the edit
     * form is behind the onboarding gate — and free to get right.
     */
    const tz = input.intent?.tz
    if (!tz) return claimWriteFailed()

    const settled = await setTimezone(userId, tz, false)
    await completeOnboarding(userId, EMPTY_ANSWERS, settled.timezone)
  }

  if (decision.writes !== 'insert' || !decision.term || !decision.landing) {
    return decision
  }

  const { term, landing } = decision

  try {
    const row = await createClaimedVocabEntry(userId, term, decision.enrichment)
    return { ...decision, href: claimLandingHref(landing, row.id) }
  } catch (err) {
    if (!isUniqueViolation(err)) {
      console.error('[claim] insert failed', { userId, err })
      return claimWriteFailed()
    }

    /**
     * `UNIQUE (user_id, lower(term))`. Reached by two tabs, a double tap, or a
     * `toLowerCase()`/`lower()` disagreement (Turkish dotted I, final sigma) — so
     * the pre-read in `buildInput` is an optimisation on the message and this is
     * the gate. F17 does not fork the duplicate logic: it re-runs the same
     * resolver with the row that raced in, and gets `already_have` out of it.
     */
    const existing = await findEntryByNormalizedTerm(userId, term)
    if (existing) {
      return resolveClaimOutcome({
        ...input,
        existingEntryId: existing.id,
        // Whatever it was a moment ago, onboarding has run by now.
        claimerOnboarded: true,
      })
    }

    // The row that collided is not there any more — the only way here is a delete
    // landing between the two statements. One retry, then give up; a loop would
    // be a spin against a live writer. The same shape `POST /api/vocab` uses.
    try {
      const row = await createClaimedVocabEntry(userId, term, decision.enrichment)
      return { ...decision, href: claimLandingHref(landing, row.id) }
    } catch (retryErr) {
      console.error('[claim] insert failed after 23505 retry', { userId, retryErr })
      return claimWriteFailed()
    }
  }
}
