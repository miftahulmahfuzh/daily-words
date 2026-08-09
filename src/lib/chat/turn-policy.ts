/**
 * The cap, and everything derived from it. Pure — no I/O, no `server-only`.
 *
 * [R6] settles what "a hard cap of 8 assistant turns" means: **one opener plus
 * seven replies**. The opener counts. So a full round is nine model calls —
 * eight conversational turns and a verdict, which is not a turn — and that is
 * the number the cost budget is built on.
 *
 * `MAX_ASSISTANT_TURNS` appears in exactly one place in the codebase. The
 * reservation SQL, the zod response schema, the turn meter and the client all
 * read it from here; a second literal `8` anywhere is a bug waiting for someone
 * to change one of them.
 */

export const MAX_ASSISTANT_TURNS = 8

/** The verdict is a ninth call but never a turn. Cost only; nothing branches on it. */
export const MAX_LLM_CALLS_PER_ROUND = MAX_ASSISTANT_TURNS + 1

/** Hard ceiling on one user message. Mirrored by `maxLength` on the textarea. */
export const MAX_USER_MESSAGE_CHARS = 500

/** Output ceiling per call. Two or three sentences fit in far less. */
export const MAX_REPLY_TOKENS = 200
export const MAX_VERDICT_TOKENS = 300

/**
 * Derived, never stored. A `status` column would be a fourth thing to keep in
 * step with `turn_count`, `closed_at` and the message rows, and it would be the
 * one that goes stale.
 */
export type ChatStatus = 'empty' | 'open' | 'closing' | 'closed'

export type StatusInput = {
  /** Null while the round is live. */
  closedAt: Date | null
  /** Assistant conversational turns used in the CURRENT round. Verdict excluded. */
  turnCount: number
  /** Messages in the current round, of any kind. */
  messageCount: number
}

export function deriveStatus(input: StatusInput): ChatStatus {
  if (input.closedAt) return 'closed'
  // Order matters: a round at the cap is `closing` even though it also has
  // messages, because the only legal next request is /close.
  if (input.turnCount >= MAX_ASSISTANT_TURNS) return 'closing'
  if (input.messageCount > 0) return 'open'
  return 'empty'
}

/** May the user type? Advisory — the server reservation is the real gate. */
export function canSend(status: ChatStatus): boolean {
  return status === 'open'
}

/** The client's signal to fire POST /close. */
export function isClosing(status: ChatStatus): boolean {
  return status === 'closing'
}

/** Does this round still need an opener? */
export function needsOpener(status: ChatStatus): boolean {
  return status === 'empty'
}

/** Turn meter pips: how many of the eight are spent. */
export function turnsRemaining(turnCount: number): number {
  return Math.max(0, MAX_ASSISTANT_TURNS - turnCount)
}
