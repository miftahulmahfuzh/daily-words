import type { LlmMessage } from '@/lib/llm/text'
import type { ChatMessageKind, ChatRole } from '@/lib/db/types'

/**
 * Two renderings of one round: the array the model continues, and the plain
 * text the verdict call reads.
 *
 * Pure. No `server-only`, no database types beyond the two string unions, so
 * `npm run chat:check` can assert the shapes offline.
 */

/** The minimum a message must be to appear in either rendering. */
export type TranscriptRow = {
  role: ChatRole
  kind: ChatMessageKind
  content: string
}

/**
 * The first element of every reply call.
 *
 * It exists for two reasons. The Messages API requires the array to begin with
 * a `user` turn, and our first stored message is the assistant's opener. And
 * re-sending the ~185-token opener instruction on every turn would cost roughly
 * 1,300 tokens across a round for no behavioural gain — the opener itself is in
 * the history, which is all the model needs to know what scene it invented.
 *
 * Byte-identical on every call, deliberately: if the endpoint ever supports
 * prompt caching, the prefix is already stable.
 */
export const SCENE_ANCHOR = '(The scene begins. You speak first.)'

/**
 * One round's messages as an Anthropic-shaped array.
 *
 * Verdicts are filtered out. They only exist in closed rounds, which never get
 * another reply call — but a round repaired by hand could carry one, and the
 * model must never see its own out-of-character assessment as a conversational
 * turn. Filtering here rather than relying on the caller is one line against a
 * whole class of confusion.
 *
 * The result always starts with a `user` turn and always alternates, because
 * the anchor goes first and the stored rows are opener / user / assistant / …
 * by construction of the reservation.
 */
export function buildConversation(rows: TranscriptRow[]): LlmMessage[] {
  const turns = rows
    .filter((row) => row.kind !== 'verdict')
    .map((row) => ({ role: row.role, content: row.content }))

  return [{ role: 'user' as const, content: SCENE_ANCHOR }, ...turns]
}

/**
 * The round as plain text, for the verdict call.
 *
 * `You:` for the assistant and `Them:` for the learner, because the verdict
 * prompt takes the model *out* of role and then hands it a transcript it was a
 * participant in. Labelling its own lines `Assistant:` invites it to write
 * about "the assistant"; `You:` keeps the second person pointed at the learner,
 * which is who the three lines are addressed to.
 */
export function renderTranscript(rows: TranscriptRow[]): string {
  return rows
    .filter((row) => row.kind !== 'verdict')
    .map((row) => `${row.role === 'assistant' ? 'You' : 'Them'}: ${row.content}`)
    .join('\n')
}

/** Did the learner say anything at all? The verdict prompt's line 1 hinges on it. */
export function hasUserTurns(rows: TranscriptRow[]): boolean {
  return rows.some((row) => row.role === 'user')
}
