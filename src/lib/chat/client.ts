import { request, type ApiResult } from '@/lib/api/client'
import type { ChatStateDto } from '@/lib/chat/schemas'

/**
 * The browser half of F6's five routes.
 *
 * Types only from `schemas.ts` — never the zod schemas themselves. One value
 * import of a schema pulls the whole of zod into the route's bundle to re-check
 * a payload the handler already produced from the same typed shape.
 *
 * The transport, the result-object convention and the offline case all live in
 * `@/lib/api/client`, shared with F3, F4 and F5.
 */

export type { ApiResult } from '@/lib/api/client'

const base = (vocabEntryId: string) => `/api/chat/${vocabEntryId}`

/** Re-sync after a request whose response was lost. Never called on first paint. */
export function fetchChatState(id: string): Promise<ApiResult<ChatStateDto>> {
  return request(base(id), 'GET')
}

/** The proactive call. Fired once on mount when the round is empty. */
export function openChat(id: string): Promise<ApiResult<ChatStateDto>> {
  return request(`${base(id)}/open`, 'POST')
}

export function sendChatMessage(
  id: string,
  content: string,
): Promise<ApiResult<ChatStateDto>> {
  return request(`${base(id)}/messages`, 'POST', { content })
}

/** Fired when the eighth reply lands. Idempotent server-side. */
export function closeChat(id: string): Promise<ApiResult<ChatStateDto>> {
  return request(`${base(id)}/close`, 'POST')
}

/** "Practise again" — a new round, and its opener, in one request. */
export function resetChat(id: string): Promise<ApiResult<ChatStateDto>> {
  return request(`${base(id)}/reset`, 'POST')
}
