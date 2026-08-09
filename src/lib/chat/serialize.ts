import type { ChatMessage } from '@/lib/db/types'
import type { ChatMessageDto } from '@/lib/chat/schemas'

/**
 * Row → wire. The client never sees `session_id`.
 *
 * `toISOString()` here is one of the two sanctioned uses in the app: it
 * serialises an **instant**, not a day. A "day" is a `LocalDate` string
 * computed in the user's zone and never comes from this call. The round divider
 * converts the instant back with `toLocalDate(…, timezone)`.
 */
export function toChatMessageDto(row: ChatMessage): ChatMessageDto {
  return {
    id: row.id,
    role: row.role,
    kind: row.kind,
    round: row.round,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
  }
}

export function toChatMessageDtos(rows: ChatMessage[]): ChatMessageDto[] {
  return rows.map(toChatMessageDto)
}
