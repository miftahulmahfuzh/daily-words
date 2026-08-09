import { readJson } from '@/lib/api/respond'
import { chatContext, respondChat } from '@/lib/chat/route'
import { sendMessageBodySchema } from '@/lib/chat/schemas'
import { sendMessage } from '@/lib/chat/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * `POST /api/chat/[vocabEntryId]/messages` — one user turn, one reply.
 *
 * The turn is reserved inside the service **before** the model is called, so
 * two racing sends cannot both get one. A 409 `turn_limit` here means the cap
 * is reached, the round moved on, or the session closed; the client re-syncs
 * with `GET` rather than trying to tell them apart.
 *
 * On a 502 the client restores its own draft into the composer. F6 §6.4 had the
 * server echo the text back as `error.draft`; it does not need to. The client
 * still holds what the user typed, restoring it locally also covers the
 * offline case where no response comes back at all, and it keeps the error
 * envelope the same shape as every other route in the app.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ vocabEntryId: string }> },
): Promise<Response> {
  const context = await chatContext(ctx)
  if (!context.ok) return context.response

  const body = await readJson(req, sendMessageBodySchema)
  if (!body.ok) return body.response

  return respondChat(
    await sendMessage(context.userId, context.vocabEntryId, body.data.content),
  )
}
