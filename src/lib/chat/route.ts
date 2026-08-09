import 'server-only'
import { requireApiUser } from '@/lib/api/guards'
import { fail, noStore, ok } from '@/lib/api/respond'
import { vocabEntryIdSchema } from '@/lib/chat/schemas'
import type { ChatResult } from '@/lib/chat/service'

/**
 * The two lines every chat route handler shares: who is asking, about which
 * word, and how a service result becomes a Response.
 *
 * Factored out so the five handlers are genuinely thin. A handler that repeats
 * the auth guard is a handler that can forget it.
 */

export type ChatContext =
  | { ok: true; userId: string; vocabEntryId: string }
  | { ok: false; response: Response }

/**
 * `requireApiUser()` is the authoritative check — middleware only looks at
 * cookie presence. The id is validated before it can reach a `uuid` column,
 * where a malformed value is a cast error and a 500 rather than the 404 that is
 * the honest answer.
 */
export async function chatContext(ctx: {
  params: Promise<{ vocabEntryId: string }>
}): Promise<ChatContext> {
  const auth = await requireApiUser()
  if (!auth.ok) return { ok: false, response: auth.response }

  const parsed = vocabEntryIdSchema.safeParse((await ctx.params).vocabEntryId)
  if (!parsed.success) {
    return { ok: false, response: fail(404, 'That word is gone.', 'not_found') }
  }

  return { ok: true, userId: auth.user.id, vocabEntryId: parsed.data }
}

/**
 * `no-store` on every response. What the state is depends on when it is asked —
 * whether the opener has landed, how many turns are left — and a cached 200
 * from two turns ago would render a screen the database does not agree with.
 */
export function respondChat(result: ChatResult): Response {
  return noStore(
    result.ok ? ok(result.state) : fail(result.status, result.message, result.code),
  )
}
