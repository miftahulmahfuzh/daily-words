import { z } from 'zod'
import { MAX_ASSISTANT_TURNS, MAX_USER_MESSAGE_CHARS } from '@/lib/chat/turn-policy'
import type { ChatStatus } from '@/lib/chat/turn-policy'
import type { ChatMessageKind, ChatRole } from '@/lib/db/types'

/**
 * The wire contract for `/api/chat/[vocabEntryId]/…`.
 *
 * **Never import this file as a value from a client component.** One value
 * import of a zod schema put the whole of zod into `/vocab/new` — 73 kB, to
 * re-check a payload the route handler produced from this same typed shape.
 * `lib/chat/client.ts` imports the *types* below and nothing else.
 *
 * zod 4 spellings throughout ([R2]): `z.uuid()`, not `z.string().uuid()`.
 */

/* --------------------------------- Requests -------------------------------- */

/** The route segment. A malformed id must never reach a `uuid` column. */
export const vocabEntryIdSchema = z.uuid()

export const sendMessageBodySchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Say something first.')
    .max(MAX_USER_MESSAGE_CHARS, 'That is too long for one turn.'),
})

export type SendMessageBody = z.infer<typeof sendMessageBodySchema>

/* -------------------------------- Responses -------------------------------- */

export type ChatMessageDto = {
  id: string
  role: ChatRole
  kind: ChatMessageKind
  round: number
  content: string
  /** ISO 8601, UTC. Rendered into the user's zone by the round divider. */
  createdAt: string
}

/**
 * The shape every one of the five routes returns on success.
 *
 * `messages` is **the current round only**. Earlier rounds are read once, by
 * the page's server component, and never travel over this API — the client
 * already holds them and re-sending a growing transcript on every turn would
 * make a send cost more the longer the word has been practised.
 *
 * `sessionId` is null in exactly one case: `GET` before a session has ever been
 * created. Creating a row to answer a read would make a page load write to the
 * database, which the roadmap's "nothing happens until the user presses it"
 * rule forbids as much for chat as for the daily card.
 */
export type ChatStateDto = {
  sessionId: string | null
  term: string
  round: number
  turnCount: number
  maxTurns: number
  status: ChatStatus
  messages: ChatMessageDto[]
}

/** What the page hands its client component. Every round, not just the current. */
export type ChatPageState = ChatStateDto & {
  vocabEntryId: string
  /**
   * False while `enrichment_status !== 'ready'` or the definition is missing.
   * The page draws an empty state and never mounts the client, so no `/open`
   * is fired — the route itself refuses one anyway.
   */
  ready: boolean
  /** IANA zone, for the round dividers. Reads may fall back; this is a read. */
  timezone: string
}

/**
 * The error codes this feature returns, as a closed set.
 *
 * The envelope is the app's standard `{ error: { code, message } }` and
 * `message` is shown to the user verbatim, so every string below is written to
 * be read on a phone: short, English, no exclamation marks, no "Oops".
 */
export const CHAT_ERROR_CODES = [
  'unauthenticated',
  'not_found',
  'not_ready',
  'invalid_body',
  'session_closed',
  'turn_limit',
  'daily_limit',
  'llm_failed',
] as const

export type ChatErrorCode = (typeof CHAT_ERROR_CODES)[number]

/** Asserted by `npm run chat:check`, so the client and the meter cannot drift. */
export const MAX_TURNS_ON_THE_WIRE: number = MAX_ASSISTANT_TURNS
