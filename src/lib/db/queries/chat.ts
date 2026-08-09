import 'server-only'
import { and, asc, count, eq, gte, isNull, lt, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { chatMessages, chatSessions } from '@/lib/db/schema'
import { MAX_ASSISTANT_TURNS } from '@/lib/chat/turn-policy'
import type { ChatMessage, ChatMessageKind, ChatRole, ChatSession } from '@/lib/db/types'

/**
 * Every Drizzle statement F6 issues. Route handlers and components build no
 * queries inline — the convention set in `queries/profiles.ts`.
 *
 * `userId` is the first parameter and appears in the WHERE clause of everything
 * that touches `chat_sessions`. `chat_messages` has no `user_id` column, so the
 * functions below take a `sessionId` instead — one that the caller obtained
 * from `getSessionByEntry` or `createSessionIfAbsent`, both of which are scoped
 * by user. That resolution is the ownership check; nothing here may be called
 * with a session id that came off the wire.
 */

/* --------------------------------- Sessions -------------------------------- */

export async function getSessionByEntry(
  userId: string,
  vocabEntryId: string,
): Promise<ChatSession | null> {
  const [row] = await db
    .select()
    .from(chatSessions)
    .where(
      and(eq(chatSessions.userId, userId), eq(chatSessions.vocabEntryId, vocabEntryId)),
    )
    .limit(1)
  return row ?? null
}

/**
 * Get-or-create, in one round trip that cannot race.
 *
 * `ON CONFLICT DO NOTHING` against `UNIQUE (user_id, vocab_entry_id)` returns no
 * row when someone else won, so the select afterwards is what makes the
 * function total. A read-then-insert would let two tabs opening the same word
 * both see "no session" and one of them take a unique violation to the user.
 */
export async function createSessionIfAbsent(
  userId: string,
  vocabEntryId: string,
): Promise<ChatSession> {
  const [inserted] = await db
    .insert(chatSessions)
    .values({ userId, vocabEntryId })
    .onConflictDoNothing()
    .returning()

  if (inserted) return inserted

  const existing = await getSessionByEntry(userId, vocabEntryId)
  // Unreachable: the insert either created the row or lost to one that exists.
  if (!existing) throw new Error('chat session vanished between insert and select')
  return existing
}

/**
 * Take a turn. **This is the cap**, and it is one statement on purpose.
 *
 * Never read-then-write. Two racing requests both read `turn_count = 7`, both
 * write 8, and the round quietly gets a ninth assistant turn — which is a free
 * LLM call the budget did not plan for and a verdict that closes a conversation
 * one turn past where it was supposed to. A conditional UPDATE is atomic on a
 * single Postgres row and needs no explicit transaction.
 *
 * Returns the new count, or null when nothing was updated: the session closed,
 * the round moved on, or the cap is reached. All three are a 409 and the caller
 * does not need to tell them apart.
 *
 * **Called before every LLM call, never after.** Reserving afterwards would let
 * both racers through and only then discover the collision.
 */
export async function reserveTurn(
  userId: string,
  sessionId: string,
  round: number,
): Promise<number | null> {
  const [row] = await db
    .update(chatSessions)
    .set({
      turnCount: sql`${chatSessions.turnCount} + 1`,
      lastMessageAt: new Date(),
    })
    .where(
      and(
        eq(chatSessions.id, sessionId),
        eq(chatSessions.userId, userId),
        isNull(chatSessions.closedAt),
        eq(chatSessions.round, round),
        lt(chatSessions.turnCount, MAX_ASSISTANT_TURNS),
      ),
    )
    .returning({ turnCount: chatSessions.turnCount })
  return row?.turnCount ?? null
}

/**
 * Give the turn back when the model failed us.
 *
 * The user must not lose one of their eight turns to a transport error, so this
 * is the compensating half of `reserveTurn`. Guarded on `round` so a reset that
 * landed in between cannot be decremented into a negative count, and on
 * `turn_count > 0` for the same reason.
 */
export async function releaseTurn(sessionId: string, round: number): Promise<void> {
  await db
    .update(chatSessions)
    .set({ turnCount: sql`${chatSessions.turnCount} - 1` })
    .where(
      and(
        eq(chatSessions.id, sessionId),
        eq(chatSessions.round, round),
        sql`${chatSessions.turnCount} > 0`,
      ),
    )
}

/**
 * Close the round: the verdict row and `closed_at`, together or not at all.
 *
 * In a transaction because a verdict with no `closed_at` leaves a session that
 * renders as finished and accepts no further messages, and a `closed_at` with
 * no verdict leaves a closed round with nothing to show for it. The Postgres
 * driver here is postgres-js, so transactions are available (F6 §14.4 asked;
 * this is the answer).
 *
 * Idempotent: a second call finds `closed_at` already set, writes nothing, and
 * returns null. The caller then re-reads and returns the existing state.
 */
export async function closeRoundWithVerdict(
  userId: string,
  sessionId: string,
  round: number,
  verdict: string,
): Promise<ChatSession | null> {
  return db.transaction(async (tx) => {
    const [closed] = await tx
      .update(chatSessions)
      .set({ closedAt: new Date(), lastMessageAt: new Date() })
      .where(
        and(
          eq(chatSessions.id, sessionId),
          eq(chatSessions.userId, userId),
          eq(chatSessions.round, round),
          isNull(chatSessions.closedAt),
        ),
      )
      .returning()

    if (!closed) return null

    await tx.insert(chatMessages).values({
      sessionId,
      round,
      kind: 'verdict',
      role: 'assistant',
      content: verdict,
    })

    return closed
  })
}

/**
 * Start a new round on the same row. The transcript is untouched.
 *
 * [R6]'s whole purpose: the word can be practised again without destroying the
 * record of what the user themselves wrote the first time. `round + 1` in SQL
 * rather than in TypeScript so two taps on "Practise again" cannot both write
 * round 2.
 *
 * Guarded on `closed_at IS NOT NULL` — a live round can never be reset out from
 * under the model, which is what stops the cap from being shruggable.
 */
export async function bumpRound(
  userId: string,
  sessionId: string,
): Promise<ChatSession | null> {
  const [row] = await db
    .update(chatSessions)
    .set({
      round: sql`${chatSessions.round} + 1`,
      turnCount: 0,
      closedAt: null,
      lastMessageAt: new Date(),
    })
    .where(
      and(
        eq(chatSessions.id, sessionId),
        eq(chatSessions.userId, userId),
        sql`${chatSessions.closedAt} is not null`,
      ),
    )
    .returning()
  return row ?? null
}

/* --------------------------------- Messages -------------------------------- */

export type NewChatMessage = {
  sessionId: string
  round: number
  kind: ChatMessageKind
  role: ChatRole
  content: string
}

/**
 * Insert one message. **Returns null when an opener already exists.**
 *
 * `onConflictDoNothing()` catches the partial unique index
 * `(session_id, round) WHERE kind = 'opener'`, which is the database-level
 * defence against a double-fired opener — React strict mode, a double tap, a
 * retried request. The application check in the service is the fast path; this
 * is the guarantee. A null here is not an error, it is "someone else opened the
 * scene first", and the caller releases its reservation and returns their state.
 */
export async function insertMessage(msg: NewChatMessage): Promise<ChatMessage | null> {
  const [row] = await db.insert(chatMessages).values(msg).onConflictDoNothing().returning()
  return row ?? null
}

/** Undo a user message whose reply never arrived. See F6 §12.5. */
export async function deleteMessage(id: string): Promise<void> {
  await db.delete(chatMessages).where(eq(chatMessages.id, id))
}

/** One round, chronological. What the model sees, and nothing else. */
export async function listRoundMessages(
  sessionId: string,
  round: number,
): Promise<ChatMessage[]> {
  return db
    .select()
    .from(chatMessages)
    .where(and(eq(chatMessages.sessionId, sessionId), eq(chatMessages.round, round)))
    .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id))
}

/**
 * Every round, oldest first. The page renders this; the API never returns it.
 *
 * Ordered by `(round, created_at)` rather than `created_at` alone: rounds only
 * ever increase, so the two orders agree, and this one is the index order.
 * `id` breaks the tie because two rows inserted in the same transaction can
 * share a `now()`.
 */
export async function listAllMessages(sessionId: string): Promise<ChatMessage[]> {
  return db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(asc(chatMessages.round), asc(chatMessages.createdAt), asc(chatMessages.id))
}

/* ------------------------------- The cost guard ----------------------------- */

/**
 * How many practice rounds this user has started since an instant.
 *
 * Counts **openers**, not sessions. F6 §11.3 wrote the guard as a count of
 * `chat_sessions` rows created or touched today, which is a proxy: it counts a
 * session the user merely resumed, and it counts a word practised three times
 * once. The constant is named `CHAT_MAX_NEW_ROUNDS_PER_DAY` and the thing being
 * rationed is model calls, so counting the row that marks the start of a round
 * is both cheaper to reason about and exactly what the name says.
 *
 * `since` is midnight in the user's timezone, converted to UTC by
 * `startOfLocalDayUtc`. The roadmap's day-boundary rule applies here as
 * everywhere else; nothing computes it inline.
 */
export async function countRoundsStartedSince(
  userId: string,
  since: Date,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(chatMessages)
    .innerJoin(chatSessions, eq(chatMessages.sessionId, chatSessions.id))
    .where(
      and(
        eq(chatSessions.userId, userId),
        eq(chatMessages.kind, 'opener'),
        gte(chatMessages.createdAt, since),
      ),
    )
  return row?.n ?? 0
}
