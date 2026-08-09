import 'server-only'
import { env } from '@/lib/env'
import { generateText, type LlmMessage } from '@/lib/llm/text'
import { getEntryForUser } from '@/lib/db/queries/vocab'
import { getProfile } from '@/lib/db/queries/profiles'
import {
  bumpRound,
  closeRoundWithVerdict,
  countRoundsStartedSince,
  createSessionIfAbsent,
  deleteMessage,
  getSessionByEntry,
  insertMessage,
  listAllMessages,
  listRoundMessages,
  releaseTurn,
  reserveTurn,
} from '@/lib/db/queries/chat'
import { buildProfileContext, type ProfileContext } from '@/lib/profile/context'
import { FALLBACK_TIMEZONE } from '@/lib/profile/constants'
import { localDateNow, startOfLocalDayUtc } from '@/lib/time/local-date'
import { sanitizeReply, sanitizeVerdict } from '@/lib/chat/sanitize'
import { toChatMessageDtos } from '@/lib/chat/serialize'
import { buildConversation, renderTranscript } from '@/lib/chat/transcript'
import {
  deriveStatus,
  MAX_ASSISTANT_TURNS,
  MAX_REPLY_TOKENS,
  MAX_VERDICT_TOKENS,
} from '@/lib/chat/turn-policy'
import {
  chatSystemPrompt,
  SCENARIO_BLOCK_OPENING,
  SCENARIO_BLOCK_UNDERWAY,
} from '@/lib/llm/prompts/chat-system'
import { chatOpenerPrompt } from '@/lib/llm/prompts/chat-opener'
import { pickScenario } from '@/lib/llm/prompts/chat-scenarios'
import {
  fallbackVerdict,
  verdictPrompt,
  VERDICT_SYSTEM_PROMPT,
} from '@/lib/llm/prompts/chat-verdict'
import type { ChatErrorCode, ChatPageState, ChatStateDto } from '@/lib/chat/schemas'
import type { ChatSession, VocabEntry } from '@/lib/db/types'

/**
 * Every decision this feature makes. The five route handlers are thin wrappers
 * around the five exported functions here, and the page's server component
 * calls `getPageState`.
 *
 * Two rules run through all of it:
 *
 * 1. **The turn is reserved before the model is called, never after.** The cap
 *    is the spine of the feature; a client-side counter is not a cap.
 * 2. **Nothing is persisted that was not sanitised**, because the roadmap
 *    requires that what is displayed is what is stored, and the verdict call
 *    reads the stored transcript back.
 */

/* ---------------------------------- Result ---------------------------------- */

export type ChatFailure = {
  ok: false
  status: number
  code: ChatErrorCode
  /** Shown to the user verbatim. Terse, English, no exclamation marks. */
  message: string
}

export type ChatSuccess = { ok: true; state: ChatStateDto }
export type ChatResult = ChatSuccess | ChatFailure

const fail = (
  status: number,
  code: ChatErrorCode,
  message: string,
): ChatFailure => ({ ok: false, status, code, message })

const NOT_FOUND = fail(404, 'not_found', 'That word is gone.')
const NOT_READY = fail(409, 'not_ready', 'Still looking this word up.')
const TURN_LIMIT = fail(409, 'turn_limit', 'That round is finished.')
const LLM_FAILED = fail(502, 'llm_failed', "Couldn't reach the other side. Try again.")

/* ------------------------------- Shared loads ------------------------------- */

/**
 * The profile, read once and used twice: the prompt block and the day boundary
 * both come out of the same row.
 *
 * `getProfileContext()` in `context.server.ts` is the sanctioned entry point and
 * would be the obvious call — but it discards the row, and `getUserTimezone()`
 * would then read it a second time on the one path that needs both. The pure
 * builder is the same contract with the row kept.
 */
async function loadProfile(
  userId: string,
): Promise<{ context: ProfileContext; timezone: string }> {
  const row = await getProfile(userId)
  return {
    context: buildProfileContext(row),
    // A read, so the fallback is allowed. Only writes refuse to guess a zone,
    // and nothing here dates a record.
    timezone: row?.timezone ?? FALLBACK_TIMEZONE,
  }
}

/**
 * 404 and never 403 for a word that is not this user's. Confirming the id
 * exists would leak another user's collection one guess at a time.
 */
type LoadedEntry = { ok: true; entry: VocabEntry } | ChatFailure

async function loadEntry(
  userId: string,
  vocabEntryId: string,
  requireReady: boolean,
): Promise<LoadedEntry> {
  const entry = await getEntryForUser(userId, vocabEntryId)
  if (!entry) return NOT_FOUND

  // The system prompt needs the meaning and the part of speech. Without them
  // the model has nothing to build a gap around, so the scene is blocked rather
  // than opened badly. F6 §12.2.
  if (requireReady && (entry.enrichmentStatus !== 'ready' || !entry.definition)) {
    return NOT_READY
  }
  return { ok: true, entry }
}

async function buildState(
  entry: VocabEntry,
  session: ChatSession | null,
): Promise<ChatStateDto> {
  if (!session) {
    return {
      sessionId: null,
      term: entry.term,
      round: 1,
      turnCount: 0,
      maxTurns: MAX_ASSISTANT_TURNS,
      status: 'empty',
      messages: [],
    }
  }

  const rows = await listRoundMessages(session.id, session.round)
  return {
    sessionId: session.id,
    term: entry.term,
    round: session.round,
    turnCount: session.turnCount,
    maxTurns: MAX_ASSISTANT_TURNS,
    status: deriveStatus({
      closedAt: session.closedAt,
      turnCount: session.turnCount,
      messageCount: rows.length,
    }),
    messages: toChatMessageDtos(rows),
  }
}

/** Re-read the row after a write, so the returned state is the committed one. */
async function stateFromDb(
  userId: string,
  entry: VocabEntry,
): Promise<ChatStateDto> {
  return buildState(entry, await getSessionByEntry(userId, entry.id))
}

/* -------------------------------- Cost guard -------------------------------- */

/**
 * The per-day ceiling on new rounds. Checked in `/open` and `/reset` — the two
 * places that can start one — and never on a resume, which costs nothing.
 */
async function overDailyLimit(userId: string, timezone: string): Promise<boolean> {
  const since = startOfLocalDayUtc(localDateNow(timezone), timezone)
  const started = await countRoundsStartedSince(userId, since)
  return started >= env.CHAT_MAX_NEW_ROUNDS_PER_DAY
}

const DAILY_LIMIT = fail(
  429,
  'daily_limit',
  'That is enough practice for one day. Come back tomorrow.',
)

/* ---------------------------------- The LLM --------------------------------- */

/**
 * One retry, on an empty reply only — the same rule `generateJson` follows and
 * for the same reason. The SDK is configured with `maxRetries: 1`, so a
 * transport failure has already been retried once by the time it reaches here;
 * retrying again would make a dead endpoint cost four requests per turn on a
 * free-tier quota. An empty completion is the text-mode analogue of a parse
 * failure: the model answered, and the answer was nothing.
 */
async function speak(o: {
  label: string
  system: string
  messages: LlmMessage[]
  maxTokens: number
  temperature: number
}): Promise<string | null> {
  for (let attempt = 0; attempt <= 1; attempt++) {
    const result = await generateText(o)
    if (!result.ok) {
      if (result.error.kind !== 'empty') return null
      continue
    }
    // Sanitising can empty a reply that was nothing but an emoji or a label.
    // That is an empty reply, and it gets the same one retry.
    const text = sanitizeReply(result.text)
    if (text) return text
    console.warn(`[llm:${o.label}] attempt ${attempt} sanitised to nothing`)
  }
  return null
}

function systemFor(
  entry: VocabEntry,
  profile: ProfileContext,
  scenarioBlock: string,
): string {
  return chatSystemPrompt({
    term: entry.term,
    partOfSpeech: entry.partOfSpeech,
    definition: entry.definition ?? '',
    profileBlock: profile.text,
    toneDirective: profile.toneDirective,
    profileIsEmpty: profile.isEmpty,
    scenarioBlock,
  })
}

/**
 * Reserve, speak, persist — the opener half, shared by `/open` and `/reset`.
 *
 * The three failure modes are all recoverable and none of them costs the user a
 * turn: the model failed (release, 502), someone else opened the scene first
 * (release, return their opener), or the round moved on under us (409).
 */
async function generateOpener(
  userId: string,
  entry: VocabEntry,
  session: ChatSession,
  profile: ProfileContext,
): Promise<ChatResult> {
  const reserved = await reserveTurn(userId, session.id, session.round)
  if (reserved === null) return TURN_LIMIT

  const text = await speak({
    label: 'chat.opener',
    system: systemFor(entry, profile, SCENARIO_BLOCK_OPENING),
    messages: [
      {
        role: 'user',
        content: chatOpenerPrompt({
          term: entry.term,
          profileIsEmpty: profile.isEmpty,
          fallbackScenario: pickScenario(entry.id, session.round),
        }),
      },
    ],
    maxTokens: MAX_REPLY_TOKENS,
    temperature: 0.9,
  })

  if (!text) {
    // Back to zero, so the next attempt is a clean first one rather than a
    // broken second. F6 §12.4.
    await releaseTurn(session.id, session.round)
    return LLM_FAILED
  }

  const row = await insertMessage({
    sessionId: session.id,
    round: session.round,
    kind: 'opener',
    role: 'assistant',
    content: text,
  })

  if (!row) {
    // The partial unique index refused: a concurrent request won the race. The
    // user gets one opener, not two, and `turn_count` stays at 1.
    await releaseTurn(session.id, session.round)
  }

  return { ok: true, state: await stateFromDb(userId, entry) }
}

/* ------------------------------- The five verbs ------------------------------ */

/** Read-only. Creates nothing, calls no model. */
export async function getState(
  userId: string,
  vocabEntryId: string,
): Promise<ChatResult> {
  const loaded = await loadEntry(userId, vocabEntryId, false)
  if (!loaded.ok) return loaded
  const { entry } = loaded
  return { ok: true, state: await stateFromDb(userId, entry) }
}

/**
 * The page's first paint. Every round, not just the current one — this is the
 * only read in the feature that returns the whole transcript, and it happens
 * once per navigation rather than once per turn.
 */
export async function getPageState(
  userId: string,
  vocabEntryId: string,
): Promise<{ ok: true; state: ChatPageState } | ChatFailure> {
  const loaded = await loadEntry(userId, vocabEntryId, false)
  if (!loaded.ok) return loaded
  const { entry } = loaded

  const [{ timezone }, session] = await Promise.all([
    loadProfile(userId),
    getSessionByEntry(userId, entry.id),
  ])

  const state = await buildState(entry, session)
  const messages = session
    ? toChatMessageDtos(await listAllMessages(session.id))
    : state.messages

  return {
    ok: true,
    state: {
      ...state,
      messages,
      vocabEntryId: entry.id,
      ready: entry.enrichmentStatus === 'ready' && Boolean(entry.definition),
      timezone,
    },
  }
}

/**
 * The proactive call. Idempotent: a round that already has a message gets its
 * state back and no model call, which is what makes React strict mode's double
 * invoke, a double tap and a retried request all harmless.
 */
export async function openSession(
  userId: string,
  vocabEntryId: string,
): Promise<ChatResult> {
  const loaded = await loadEntry(userId, vocabEntryId, true)
  if (!loaded.ok) return loaded
  const { entry } = loaded

  const session = await createSessionIfAbsent(userId, entry.id)

  if (session.closedAt) {
    return fail(
      409,
      'session_closed',
      'That round is finished. Practise again to start a new one.',
    )
  }

  const existing = await listRoundMessages(session.id, session.round)
  if (existing.length > 0) return { ok: true, state: await buildState(entry, session) }

  const profile = await loadProfile(userId)
  if (await overDailyLimit(userId, profile.timezone)) return DAILY_LIMIT

  return generateOpener(userId, entry, session, profile.context)
}

export async function sendMessage(
  userId: string,
  vocabEntryId: string,
  content: string,
): Promise<ChatResult> {
  const loaded = await loadEntry(userId, vocabEntryId, true)
  if (!loaded.ok) return loaded
  const { entry } = loaded

  const session = await getSessionByEntry(userId, entry.id)
  if (!session) {
    return fail(409, 'session_closed', 'Start the conversation first.')
  }
  if (session.closedAt) {
    return fail(409, 'session_closed', 'That round is finished.')
  }

  const history = await listRoundMessages(session.id, session.round)
  if (!history.some((m) => m.kind === 'opener')) {
    return fail(409, 'session_closed', 'Start the conversation first.')
  }

  // Before the model call, and before the user's row exists: two racing sends
  // must not both get a turn.
  const reserved = await reserveTurn(userId, session.id, session.round)
  if (reserved === null) return TURN_LIMIT

  const userRow = await insertMessage({
    sessionId: session.id,
    round: session.round,
    kind: 'reply',
    role: 'user',
    content,
  })
  if (!userRow) {
    await releaseTurn(session.id, session.round)
    return LLM_FAILED
  }

  const profile = await loadProfile(userId)

  const text = await speak({
    label: 'chat.reply',
    system: systemFor(entry, profile.context, SCENARIO_BLOCK_UNDERWAY),
    messages: buildConversation([...history, userRow]),
    maxTokens: MAX_REPLY_TOKENS,
    temperature: 0.9,
  })

  if (!text) {
    // The user must not lose a turn — or their sentence — to our failure. The
    // composer restores the draft on its side; here the row goes away so the
    // transcript does not show a question nobody answered. F6 §12.5.
    await deleteMessage(userRow.id)
    await releaseTurn(session.id, session.round)
    return LLM_FAILED
  }

  await insertMessage({
    sessionId: session.id,
    round: session.round,
    kind: 'reply',
    role: 'assistant',
    content: text,
  })

  return { ok: true, state: await stateFromDb(userId, entry) }
}

/**
 * The verdict, and the end of the round.
 *
 * **The session closes whether or not the model answers.** A round stuck in
 * `closing` has no composer and no "practise again" — it is a dead screen — so
 * a failed verdict call falls back to fixed text rather than leaving the state
 * machine hanging. F6 §12.7.
 */
export async function closeSession(
  userId: string,
  vocabEntryId: string,
): Promise<ChatResult> {
  // Readiness is not required: a round that reached eight turns is finished
  // regardless of what has happened to the entry since.
  const loaded = await loadEntry(userId, vocabEntryId, false)
  if (!loaded.ok) return loaded
  const { entry } = loaded

  const session = await getSessionByEntry(userId, entry.id)
  if (!session) return fail(409, 'session_closed', 'Nothing to finish yet.')

  // Idempotent no-op. The client fires this the moment the eighth reply lands,
  // and a reload can fire it again.
  if (session.closedAt) return { ok: true, state: await buildState(entry, session) }

  if (session.turnCount < MAX_ASSISTANT_TURNS) {
    return fail(409, 'turn_limit', 'Not finished yet.')
  }

  const history = await listRoundMessages(session.id, session.round)

  const raw = await generateText({
    label: 'chat.verdict',
    system: VERDICT_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: verdictPrompt({
          term: entry.term,
          partOfSpeech: entry.partOfSpeech,
          definition: entry.definition ?? '',
          transcript: renderTranscript(history),
        }),
      },
    ],
    maxTokens: MAX_VERDICT_TOKENS,
    temperature: 0.3,
  })

  const lines = raw.ok ? sanitizeVerdict(raw.text) : []
  const verdict = lines.length > 0 ? lines.join('\n') : fallbackVerdict(entry.term)

  await closeRoundWithVerdict(userId, session.id, session.round, verdict)
  return { ok: true, state: await stateFromDb(userId, entry) }
}

/**
 * Practise again. One tap, one screen change — the new opener is generated in
 * the same request, so the user never lands on an empty screen being asked to
 * type first.
 */
export async function resetRound(
  userId: string,
  vocabEntryId: string,
): Promise<ChatResult> {
  const loaded = await loadEntry(userId, vocabEntryId, true)
  if (!loaded.ok) return loaded
  const { entry } = loaded

  const session = await getSessionByEntry(userId, entry.id)
  if (!session) return fail(409, 'session_closed', 'Nothing to practise again yet.')
  if (!session.closedAt) return fail(409, 'session_closed', 'This round is still going.')

  const profile = await loadProfile(userId)
  if (await overDailyLimit(userId, profile.timezone)) return DAILY_LIMIT

  const bumped = await bumpRound(userId, session.id)
  // Someone else already reset it. Their round is the one that exists.
  if (!bumped) return { ok: true, state: await stateFromDb(userId, entry) }

  return generateOpener(userId, entry, bumped, profile.context)
}
