import { chatContext, respondChat } from '@/lib/chat/route'
import { getState } from '@/lib/chat/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET /api/chat/[vocabEntryId]` — the current state, read-only.
 *
 * Creates nothing and calls no model. The page's first paint comes from its own
 * server component, not from here; this exists so the client can re-sync after
 * a request it could not interpret — two devices in the same round, a POST
 * whose response was lost on mobile data.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ vocabEntryId: string }> },
): Promise<Response> {
  const context = await chatContext(ctx)
  if (!context.ok) return context.response
  return respondChat(await getState(context.userId, context.vocabEntryId))
}
