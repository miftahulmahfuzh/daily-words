import { chatContext, respondChat } from '@/lib/chat/route'
import { closeSession } from '@/lib/chat/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * `POST /api/chat/[vocabEntryId]/close` — the verdict. No body.
 *
 * Fired by the client the moment the eighth reply lands, and idempotent so a
 * reload during the call cannot produce two verdicts. It returns 200 even when
 * the model fails: a session that cannot leave `closing` is a dead screen with
 * no composer and no way forward, so the round closes with fixed text rather
 * than hanging.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ vocabEntryId: string }> },
): Promise<Response> {
  const context = await chatContext(ctx)
  if (!context.ok) return context.response
  return respondChat(await closeSession(context.userId, context.vocabEntryId))
}
