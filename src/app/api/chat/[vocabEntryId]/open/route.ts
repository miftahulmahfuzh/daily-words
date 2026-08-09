import { chatContext, respondChat } from '@/lib/chat/route'
import { openSession } from '@/lib/chat/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 60 rather than F6 §6's provisional 30, for the reason F3's enrich route
 * already documented: the shared SDK client's own timeout is 55s, so a 30s
 * function would be killed while its HTTP client was still waiting and a slow
 * call would surface as an uninterpretable 500 instead of the 502 with a
 * `Try again` button this route promises.
 */
export const maxDuration = 60

/**
 * `POST /api/chat/[vocabEntryId]/open` — the proactive call. No body.
 *
 * **This is the only place a conversation starts**, and it is a POST because it
 * costs a model call. Nothing on page load fires it; the client does, once, on
 * mount, and only when the round is empty.
 *
 * Idempotent by three defences, in order of reliability: the partial unique
 * index on `(session_id, round) WHERE kind = 'opener'`, the service's
 * "does this round already have a message" check, and the client's `firedRef`.
 * Only the first is a guarantee.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ vocabEntryId: string }> },
): Promise<Response> {
  const context = await chatContext(ctx)
  if (!context.ok) return context.response
  return respondChat(await openSession(context.userId, context.vocabEntryId))
}
