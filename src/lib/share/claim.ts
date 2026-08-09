/**
 * The claim, as one pure total function.
 *
 * A stranger opens a shared word, taps **Practise this word**, signs in with
 * Google once, and arrives inside the practice chat for that word — now a row in
 * their own collection. Everything about that which is a *decision* rather than
 * a query or a write is decided here, so that `npm run claim:check` can drive
 * all ten outcomes offline with no database, no session and no network.
 *
 * **No I/O, no `server-only`, no clock.** The three reads the decision needs
 * (the share, whether the claimer already holds the word, how many words they
 * added today) are performed by `claim.server.ts` and handed in. That is what
 * makes the ordering property in F17 §5 testable: the outcomes that write
 * nothing are decided by *precedence in this function*, not by the sequence of
 * statements in the caller.
 *
 * Two things this module deliberately does not import:
 *
 * - **`DAILY_ADD_LIMIT`**, which lives in `lib/db/queries/vocab.ts` beside the
 *   query that counts against it. Importing it here would drag `server-only`,
 *   drizzle and `env.DATABASE_URL` into an offline check script. It arrives as
 *   `dailyAddLimit` instead, and `claim:check` asserts structurally that
 *   `claim.server.ts` passes the real constant rather than a literal.
 * - **anything that builds a URL by hand.** Every href below comes out of
 *   `lib/vocab/links.ts` applied to a uuid the server just read or wrote. There
 *   is no code path from the cookie or the form to a `Location` header, which is
 *   what makes the open-redirect class structurally absent rather than mitigated
 *   (F17 D2, §9).
 */

import type { ShareEntityType } from '@/lib/db/types'
import type { SharedPayload, SharedWordPayload } from '@/lib/share/schemas'
import { SHARE_GONE_BODY, SHARE_GONE_TITLE } from '@/lib/share/policy'
import { vocabChatHref, vocabDetailHref, vocabListHref } from '@/lib/vocab/links'
import { normalizeTerm, validateTerm } from '@/lib/vocab/normalize'

/* --------------------------------- Outcomes -------------------------------- */

/**
 * F17 §5's closed set. Every input, including nonsense, produces exactly one of
 * these.
 *
 * `expired` and `gone` no longer read differently, which answers the plan's open
 * question Q2 and closes R6's one-bit enumeration oracle: both render F16's
 * single "this link is not available" sentence, because telling a slug-guesser
 * that their guess *used to be right* is worth more to them than honest copy is
 * to the user holding a stale link. The two names survive because `claim:db`
 * asserts different *behaviour* for them, and because F18 will want to tell them
 * apart in a log.
 */
export type ClaimOutcome =
  | 'claim_new'
  | 'claim_pending'
  | 'already_have'
  | 'owner'
  | 'expired'
  | 'gone'
  | 'over_limit'
  | 'no_timezone'
  | 'no_intent'
  | 'write_failed'

/** Whether the caller inserts a `vocab_entries` row. Nothing else writes. */
export type ClaimWrites = 'insert' | 'none'

/** Where an inserted row sends the claimer. Resolved to an href once it has an id. */
export type ClaimLanding = 'chat' | 'detail'

/**
 * The four enrichment fields a claim copies, and nothing else. See
 * `buildClaimEnrichment`.
 */
export type ClaimEnrichment = {
  partOfSpeech: string | null
  pronunciation: string | null
  definition: string
  examples: string[]
}

/** A screen the claimer stops on, in the app's voice. `EmptyState`'s contract. */
export type ClaimStop = {
  /** ≤ 40 characters, sentence case, no full stop. */
  title: string
  /** One sentence, ≤ 90 characters. */
  body: string
  /** Null means "the form's own button" — only `write_failed`, which retries. */
  action: { label: string; href: string } | null
}

export type ClaimDecision = {
  outcome: ClaimOutcome
  writes: ClaimWrites
  /**
   * Does the caller complete onboarding with five nulls (F17 D4)?
   *
   * **False for every outcome when the claimer is already onboarded.** That is
   * the single assertion stopping a future edit from re-onboarding an
   * established user, which would wipe nothing and confuse everything.
   */
  willOnboard: boolean
  /**
   * The word this claim is about, normalised — whenever the share resolved to a
   * usable one. Null for the three outcomes where there is no word to name:
   * `no_intent`, `expired`, `gone`.
   *
   * It is what the interstitial reads to say "Adding *genteel* to your words…"
   * before the write happens, which is the difference between a sentence and a
   * spinner (F17 D6). `writes === 'insert'` always implies it is non-null.
   */
  term: string | null
  /** Null when there is nothing to copy — which is what makes `claim_pending`. */
  enrichment: ClaimEnrichment | null
  /** Null unless `writes === 'insert'`; resolved by `claimLandingHref`. */
  landing: ClaimLanding | null
  /** Where the claimer goes. Null when they stop on `/claim`. */
  href: string | null
  /** The screen shown when `href` is null. */
  stop: ClaimStop | null
}

/* ----------------------------------- Copy ---------------------------------- */

/**
 * The interstitial's one line. A sentence, not a spinner — F17 D6, and the
 * reason the term is read server-side before the write rather than after it.
 */
export function claimAddingSentence(term: string): string {
  return `Adding ${term} to your words…`
}

/** The stranger's screen, before the Google hop. Names the word, never the sharer. */
export function claimSignInSentence(term: string): string {
  return `Sign in and ${term} joins your collection.`
}

/** The interstitial's real, tappable button. It exists for the no-JS case. */
export const CLAIM_SUBMIT_LABEL = 'Add the word'

export const CLAIM_NO_INTENT_TITLE = 'Nothing to add here'
export const CLAIM_NO_INTENT_BODY = 'Open a shared word and tap practise.'
export const CLAIM_FAILED_TITLE = "Couldn't add that word"
export const CLAIM_FAILED_BODY = 'Try again.'
/** Body half of the limit refusal. The title carries the number. */
export const CLAIM_LIMIT_BODY = 'Come back tomorrow.'

/**
 * `That's 50 words in a day` — built from the limit rather than typed, so the
 * number cannot drift from `DAILY_ADD_LIMIT`.
 *
 * Joined with `CLAIM_LIMIT_BODY` this is byte-identical to the sentence
 * `POST /api/vocab` already returns verbatim (F17 D9), and `claim:check` greps
 * that route to keep it that way. A user refused here is by construction an
 * established user — a brand-new account cannot hold fifty rows — so `/vocab` is
 * a real destination for them.
 */
export function claimLimitTitle(dailyAddLimit: number): string {
  return `That's ${dailyAddLimit} words in a day`
}

/**
 * Where a stopped claimer is offered to go instead.
 *
 * Onboarding-aware, because "Start your own list" is the right offer to a
 * stranger whose link went stale and the wrong one to an established user who
 * has a list already. Both hrefs are literals from a closed set.
 */
function elsewhere(claimerOnboarded: boolean): { label: string; href: string } {
  return claimerOnboarded
    ? { label: 'Today', href: '/today' }
    : { label: 'Start your own list', href: '/onboarding' }
}

/* ------------------------------- The enrichment ----------------------------- */

/**
 * The sharer's four enrichment fields, copied onto the claimed row — or `null`,
 * which is what turns `claim_new` into `claim_pending`.
 *
 * **Zero model calls, and that is the point.** `/vocab/[id]/chat` refuses to
 * render without a definition ("Still looking this word up"), and
 * `POST /api/vocab` makes **no LLM call, ever** — the durable write is split from
 * the model call so it cannot time out. So the naive claim (insert → `pending` →
 * redirect) lands a brand-new user, five seconds after their first ever sign-in,
 * on a screen that says come back later. That is the whole first impression of
 * the product, spent.
 *
 * *Is copying another user's definition correct?* Yes, and provably:
 * **`src/lib/llm/prompts/vocab-enrich.ts` takes only the term.** No profile, no
 * `userId`, no personalisation — unlike `chat-system.ts` and `suggest-words.ts`,
 * which both take a `ProfileContext`. The copied strings are what the claimer's
 * own enrichment call would have produced, minus one model call and minus 55
 * seconds of latency budget. It is a cache hit, not a disclosure.
 *
 * **R4 — this is the dependency that would invalidate the argument.** If
 * enrichment is ever personalised ("define this the way a software engineer
 * would hear it") then this copy becomes a disclosure of one user's context to
 * another and F17 D8 must be revisited. The file to check is named above.
 *
 * The source is F16's `shares.payload` snapshot rather than the sharer's live
 * row, which is strictly better than F17 §4 planned: the four fields are already
 * on the share, so the claim reads no user-owned table at all, and the copy
 * survives the owner deleting their word.
 *
 * What is **not** copied: `enrichment_attempts` (the claimer keeps all three of
 * their own retries), `suggested_correction` (it is a suggestion about the
 * *sharer's* typo — a share should carry the word, not the sharer's spelling
 * doubt), `enrichment_error`, and every column describing the sharer's practice
 * history. None of them are on the snapshot to copy, which is the mechanism
 * rather than the intention.
 */
export function buildClaimEnrichment(
  payload: SharedWordPayload,
): ClaimEnrichment | null {
  // `enrichment_status = 'ready'` with no definition is unreachable through
  // `writeEnrichmentSuccess`, but a snapshot written by an older serializer is
  // not something to trust. No definition means nothing to practise against, so
  // the row lands `pending` and the claimer goes to the detail page instead.
  if (!payload.definition) return null

  return {
    partOfSpeech: payload.partOfSpeech,
    pronunciation: payload.pronunciation,
    definition: payload.definition,
    examples: payload.examples.filter((e) => typeof e === 'string'),
  }
}

/* ------------------------- Which word is being claimed ---------------------- */

/**
 * Snapshot + word index → the one word this claim is about, or null.
 *
 * **F18's whole ask on F17, and it turned out to be four lines.** F17's contract
 * was slug-only because F16's shared page is one slug and one word; a card share
 * breaks that — the slug identifies a *card*, and there are six candidate rows
 * behind it. F18's plan expected to widen `getShareTargetForClaim(slug)` into
 * `(slug, w)` with a join through `daily_card_items`. F16 shipped a snapshot
 * instead, so there is no join to widen: `w` is an index into a payload the
 * claim already had in its hand, and the query is untouched.
 *
 * The three ways this returns null are every way F18 asks for **no new outcome**
 * (F18 D11 part 5), and each lands on F17's existing zero-write `expired`:
 *
 *   - `w` missing on a card share — a claim link built without a position;
 *   - `w` present on a vocab share — harmless, and ignored rather than refused;
 *   - `w` naming a position a short card does not have.
 *
 * A **journal** share is never claimable and returns null here rather than
 * anywhere later. Nothing is copied by F18's journal CTA — it is a sign-up
 * funnel with no pending write — so there is no `journal` arm to write and
 * `ClaimIntent` deliberately never gained a variant for one.
 *
 * `gone` is in practice unreachable for a card share:
 * `daily_card_items.vocab_entry_id` is `ON DELETE RESTRICT` per [R1], so the
 * sharer cannot delete a word that is on a card. A card share is the most
 * durable share in the app.
 *
 * Pure and total, so `claim:check` drives every combination offline.
 */
export function resolveClaimWord(
  payload: SharedPayload | null,
  w: number | null,
): SharedWordPayload | null {
  if (!payload) return null
  if (payload.kind === 'vocab') return payload
  if (payload.kind !== 'card' || w === null) return null

  // By the word's own `position`, never by array index. They agree today only
  // because `daily_card_items.position` is contiguous by contract.
  const word = payload.words.find((candidate) => candidate.position === w)
  if (!word) return null

  /**
   * Narrowed by hand into the vocab payload's shape, with **no spread**. The
   * card word carries `position`, which is meaningless to a claim and must not
   * ride along into `buildClaimEnrichment`'s output or the inserted row.
   */
  return {
    kind: 'vocab',
    term: word.term,
    pronunciation: word.pronunciation,
    partOfSpeech: word.partOfSpeech,
    definition: word.definition,
    examples: word.examples,
  }
}

/* -------------------------------- The resolver ------------------------------ */

/** The signed cookie's fields, as the resolver needs them. `lib/share/intent.ts`. */
export type ClaimIntentFields = {
  slug: string
  /** Which word of a shared card, `1`–`6`. Null for a vocab share ([C2]). */
  w: number | null
  /** The zone detected in the browser before the OAuth hop, or null. */
  tz: string | null
}

/** What `getShareTargetForClaim` returns, narrowed to what the decision uses. */
export type ClaimShare = {
  /** The sharer. Used for exactly one thing: the owner short-circuit. */
  userId: string
  entityType: ShareEntityType
  /**
   * The sharer's own entry, for the owner short-circuit's destination. **Null
   * for a card share**, where the snapshot carries no uuid by design — an owner
   * on their own card link falls through to `already_have` instead, which lands
   * them in exactly the same chat by way of their own collection.
   */
  vocabEntryId: string | null
  /**
   * The word this claim is about, already resolved by `resolveClaimWord` — for
   * a vocab share the whole snapshot, for a card share the one word `intent.w`
   * named. Null when the share did not resolve to a claimable word at all.
   */
  payload: SharedWordPayload | null
}

export type ClaimInput = {
  /** From a **database** session, never a form field and never the share row. */
  sessionUserId: string
  intent: ClaimIntentFields | null
  share: ClaimShare | null
  claimerOnboarded: boolean
  /** `findEntryByNormalizedTerm` on the claimer's own collection, or null. */
  existingEntryId: string | null
  addsInLast24h: number
  /** `DAILY_ADD_LIMIT`, passed in. See this file's header. */
  dailyAddLimit: number
}

const stop = (
  outcome: ClaimOutcome,
  stopScreen: ClaimStop,
): ClaimDecision => ({
  outcome,
  writes: 'none',
  willOnboard: false,
  term: null,
  enrichment: null,
  landing: null,
  href: null,
  stop: stopScreen,
})

/**
 * No cookie, or one that did not decode.
 *
 * Exported because `/claim` reaches it before it has a session to resolve
 * anything with: a visitor who typed the URL, or came back to it an hour later,
 * gets this screen whether or not they are signed in.
 */
export function noIntentStop(claimerOnboarded: boolean): ClaimStop {
  return {
    title: CLAIM_NO_INTENT_TITLE,
    body: CLAIM_NO_INTENT_BODY,
    action: elsewhere(claimerOnboarded),
  }
}

export function noIntentDecision(claimerOnboarded: boolean): ClaimDecision {
  return stop('no_intent', noIntentStop(claimerOnboarded))
}

/**
 * The whole state machine. Total: every input yields exactly one outcome.
 *
 * **Precedence is the safety property, and it is deliberate.** Steps 1–4 below
 * are every way a claim can fail before anything is written, and they are
 * decided before `willOnboard` can ever become true — so a failed claim always
 * leaves a brand-new account un-onboarded and therefore able to walk into the
 * honest `/onboarding` flow from the button on the failure screen. Onboarding is
 * only made permanent once the claim is known to be about to succeed.
 *
 * The order departs from F17 §5 in one place, in the user's favour:
 * `already_have` is decided **before** `over_limit`. §5 discovered a duplicate
 * only from the insert's `23505`, so the limit was necessarily checked first;
 * here the claimer's own row is already known, and refusing to hand somebody a
 * link to a word they *already own* because of a quota that would not be spent
 * is a refusal with nothing behind it. Both outcomes write nothing either way.
 */
export function resolveClaimOutcome(input: ClaimInput): ClaimDecision {
  const { intent, share, claimerOnboarded } = input

  /* 1. No cookie, or an expired one. Zero writes, and the honest sentence. */
  if (!intent) return noIntentDecision(claimerOnboarded)

  const gone = (outcome: 'expired' | 'gone') =>
    stop(outcome, {
      title: SHARE_GONE_TITLE,
      body: SHARE_GONE_BODY,
      action: elsewhere(claimerOnboarded),
    })

  /**
   * 2. The slug resolves to nothing — never existed, or the row was deleted.
   *
   * `shares.vocab_entry_id` is `ON DELETE CASCADE` (F16 D2), so the owner
   * deleting their word revokes the share, and "the sharer's entry is gone" is
   * this branch rather than a separate one.
   *
   * A share of a kind this build cannot claim takes the same path, and **so does
   * a card share whose `w` named nothing** — `resolveClaimWord` folds all of it
   * into `payload: null` before the resolver sees it, which is how F18 added a
   * whole entity kind without adding an outcome to the ten below.
   *
   * The `entityType !== 'vocab'` test that used to be on this line went with it:
   * a card share is claimable now, and the question the resolver actually needs
   * answered is "is there a word", not "what kind of row was it read from".
   */
  if (!share || !share.payload) return gone('expired')

  /**
   * 3. The term is the one free-text field that crosses from one user to
   * another, and it ends up in the claimer's system prompt — `chatSystemPrompt`
   * embeds it five times. So it is normalised and validated **again**, here,
   * against the term read out of the snapshot rather than trusting that it was
   * validated on the way in. `TERM_PATTERN` already rejects newlines, angle
   * brackets and backticks; this is what keeps that true if it is ever loosened,
   * and `claim:check` feeds it three hostile terms.
   */
  const term = normalizeTerm(share.payload.term)
  if (!validateTerm(term).ok) return gone('gone')

  /**
   * 4. The sharer, on their own link. A genuine no-op: the share's
   * `vocab_entry_id` **is** their entry id, so there is nothing to add, and they
   * are sent to its chat because "practise this word" is what they tapped.
   *
   * `share.userId` is read for this comparison and for nothing else. It is never
   * passed as an insert's `userId` — the share tells us *what* to copy, the
   * session tells us *who* to copy it to, and those two facts come from
   * different places and are never allowed to swap (§9).
   *
   * **The `vocabEntryId` guard is F18's, and the fall-through is the point.** A
   * card share carries no entry uuid — the snapshot has none, deliberately — so
   * the owner of a card tapping their own row drops past this branch and is
   * caught by `already_have` at step 6, which finds the row in *their own*
   * collection by term and sends them to the same chat. Same destination, no
   * uuid in the snapshot, and no fourth outcome.
   */
  if (share.userId === input.sessionUserId && share.vocabEntryId) {
    return {
      outcome: 'owner',
      writes: 'none',
      willOnboard: false,
      term,
      enrichment: null,
      landing: null,
      href: vocabChatHref(share.vocabEntryId),
      stop: null,
    }
  }

  /**
   * 5. A brand-new claimer with no detected zone.
   *
   * CLAUDE.md: "Reads may fall back to a default timezone; **writes may not**."
   * `completeOnboarding` is a write and it *does* fall back, because the column
   * is `NOT NULL` — so F17 refuses to lean on that and spends a screen instead:
   * `/onboarding` mounts `timezone-capture.tsx`, the app's designated way to get
   * a real zone. The failure mode of a guessed zone is a daily card dated a day
   * wrong, forever, silently; the failure mode of this branch is five screens
   * with a `Skip all` button on the first.
   */
  const willOnboard = !claimerOnboarded
  if (willOnboard && !intent.tz) {
    return {
      outcome: 'no_timezone',
      writes: 'none',
      willOnboard: false,
      term,
      enrichment: null,
      landing: null,
      href: '/onboarding',
      stop: null,
    }
  }

  /** 6. They already hold this word. One `UNIQUE (user_id, lower(term))` away. */
  if (input.existingEntryId) {
    return {
      outcome: 'already_have',
      writes: 'none',
      willOnboard,
      term,
      enrichment: null,
      landing: null,
      href: vocabChatHref(input.existingEntryId),
      stop: null,
    }
  }

  /**
   * 7. The rolling 24-hour add limit applies to a claim too (F17 D9). The
   * argument for exempting it is that a claim costs no model call; it loses,
   * because nothing stops one account claiming a thousand shares and an exempt
   * path is a limit that is not a limit.
   */
  if (input.addsInLast24h >= input.dailyAddLimit) {
    return {
      ...stop('over_limit', {
        title: claimLimitTitle(input.dailyAddLimit),
        body: CLAIM_LIMIT_BODY,
        action: { label: 'Your words', href: vocabListHref() },
      }),
      term,
    }
  }

  /**
   * 8. The claim. `claim_pending` is the same insert with nothing to copy, and
   * it lands the claimer on the **detail** page rather than the chat: the detail
   * page owns the pending state and the retry affordance, and the chat page owns
   * only a dead end.
   */
  const enrichment = buildClaimEnrichment(share.payload)
  return {
    outcome: enrichment ? 'claim_new' : 'claim_pending',
    writes: 'insert',
    willOnboard,
    term,
    enrichment,
    landing: enrichment ? 'chat' : 'detail',
    href: null,
    stop: null,
  }
}

/**
 * The insert's landing href, once the row has an id.
 *
 * Split out because the id does not exist when the decision is made. Both arms
 * go through `lib/vocab/links.ts` with **no origin**: the claimer did not arrive
 * from Today, the Collection, Discover or the add form, so naming one of the four
 * would be a lie — and F11's default resolves the absence to the Collection,
 * which is where a word they now own actually lives.
 */
export function claimLandingHref(landing: ClaimLanding, entryId: string): string {
  return landing === 'chat' ? vocabChatHref(entryId) : vocabDetailHref(entryId)
}

/** The `write_failed` screen. Retried by the form's own button, so no href. */
export function claimWriteFailed(): ClaimDecision {
  return stop('write_failed', {
    title: CLAIM_FAILED_TITLE,
    body: CLAIM_FAILED_BODY,
    action: null,
  })
}
