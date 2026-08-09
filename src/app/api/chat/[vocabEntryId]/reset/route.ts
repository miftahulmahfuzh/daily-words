import { chatContext, respondChat } from '@/lib/chat/route'
import { resetRound } from '@/lib/chat/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * `POST /api/chat/[vocabEntryId]/reset` — a new round on the same row. No body.
 *
 * The transcript survives: [R6]'s round column exists precisely so a word can
 * be practised again without destroying the record of what the user themselves
 * wrote. The model, however, only ever sees the current round — round three
 * does not know what happened in round one, which keeps the token budget flat
 * however many times a word has been practised and means every round opens on a
 * fresh scene.
 *
 * The opener for the new round is generated in this same request. One tap, one
 * screen change; the user never lands on an empty screen being asked to type.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ vocabEntryId: string }> },
): Promise<Response> {
  const context = await chatContext(ctx)
  if (!context.ok) return context.response
  return respondChat(await resetRound(context.userId, context.vocabEntryId))
}
