/**
 * The turn cap, the opener index and the round mechanics, against a real
 * Postgres.
 *
 * Run with:  npm run chat:db
 *
 * This is F6 §13.1–13.5 minus the model. Those checks are written in the plan as
 * `curl` against a signed-in browser session, which cannot be automated here —
 * but the interesting half of them is not the HTTP, it is whether a conditional
 * `UPDATE` really is a cap and whether a partial unique index really refuses a
 * second opener. Both are properties of the database, and both are asserted
 * below by driving the same functions the route handlers call.
 *
 * **No LLM calls.** The prompts are exercised by `npm run chat:dry-run`; this
 * file is about everything that has to be right when the model is not the
 * problem, and it is cheap enough to run on every change.
 *
 * It seeds a throwaway user and deletes it in a `finally`. Deletion cascades
 * through profiles, vocab entries, sessions and messages, so a crashed run
 * leaves at most one row set behind, findable by the `@example.invalid` email.
 * A rolled-back transaction would have been tidier, but the query layer uses
 * the shared `db` handle and the pool is `max: 1` — a held transaction would
 * deadlock against its own callers.
 */
import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { db } from '../src/lib/db'
import { chatMessages, chatSessions, profiles, users, vocabEntries } from '../src/lib/db/schema'
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
} from '../src/lib/db/queries/chat'
import { getState } from '../src/lib/chat/service'
import { MAX_ASSISTANT_TURNS } from '../src/lib/chat/turn-policy'
import { startOfLocalDayUtc, localDateNow } from '../src/lib/time/local-date'

const TZ = 'Asia/Jakarta'

let failures = 0

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    console.log(`  ok   ${label}`)
  } else {
    failures++
    console.error(`  FAIL ${label}\n         expected ${e}\n         actual   ${a}`)
  }
}

function section(title: string) {
  console.log(`\n${title}`)
}

async function main() {
  const email = `f6-chat-check-${process.pid}@example.invalid`
  let userId: string | null = null

  try {
    const [user] = await db.insert(users).values({ email }).returning({ id: users.id })
    userId = user.id
    await db.insert(profiles).values({ userId, timezone: TZ, onboardedAt: new Date() })

    const [entry] = await db
      .insert(vocabEntries)
      .values({
        userId,
        term: 'genteel',
        source: 'manual',
        partOfSpeech: 'adjective',
        definition: 'polite and refined, in a slightly forced way',
        enrichmentStatus: 'ready',
      })
      .returning({ id: vocabEntries.id })

    /* ------------------------------ Get or create ---------------------------- */

    section('one durable session per user per word')

    const session = await createSessionIfAbsent(userId, entry.id)
    const again = await createSessionIfAbsent(userId, entry.id)
    check('the second call returns the same row', again.id, session.id)
    check('a fresh session starts at round 1', session.round, 1)
    check('and zero turns', session.turnCount, 0)

    /* -------------------------------- The opener ----------------------------- */

    section('[R6] exactly one opener per round — the partial unique index')

    const opener = await insertMessage({
      sessionId: session.id,
      round: 1,
      kind: 'opener',
      role: 'assistant',
      content: 'So the queue has not moved in ten minutes.',
    })
    check('the first opener lands', opener !== null, true)

    const second = await insertMessage({
      sessionId: session.id,
      round: 1,
      kind: 'opener',
      role: 'assistant',
      content: 'A second scene, which must never exist.',
    })
    // This is the guarantee. The application check in the service is the fast
    // path; the database is what makes a double-fired opener impossible.
    check('the second is refused by the index', second, null)

    // The index is partial, so ordinary replies are unaffected.
    const reply = await insertMessage({
      sessionId: session.id,
      round: 1,
      kind: 'reply',
      role: 'assistant',
      content: 'Still nothing.',
    })
    check('replies are not covered by it', reply !== null, true)
    if (reply) await deleteMessage(reply.id)

    section('the kind CHECK constraint')

    let rejected = false
    try {
      await db.insert(chatMessages).values({
        sessionId: session.id,
        round: 1,
        // A fourth value would be a silent display bug: the transcript decides
        // what is a bubble and what is a card by reading this column.
        kind: 'monologue' as 'reply',
        role: 'assistant',
        content: 'x',
      })
    } catch {
      rejected = true
    }
    check("'monologue' is refused", rejected, true)

    /* ------------------------------ The turn cap ----------------------------- */

    section('the cap is a conditional UPDATE, not a client-side counter')

    const counts: (number | null)[] = []
    for (let i = 0; i < MAX_ASSISTANT_TURNS + 2; i++) {
      counts.push(await reserveTurn(userId, session.id, 1))
    }
    check(
      'eight reservations succeed, then nothing',
      counts,
      [1, 2, 3, 4, 5, 6, 7, 8, null, null],
    )

    const [atCap] = await db
      .select({ turnCount: chatSessions.turnCount })
      .from(chatSessions)
      .where(eq(chatSessions.id, session.id))
    check('turn_count stopped at eight', atCap.turnCount, MAX_ASSISTANT_TURNS)

    section('the compensating release')

    await releaseTurn(session.id, 1)
    check('one back', (await getSessionByEntry(userId, entry.id))?.turnCount, 7)
    // A reservation released against a round that has moved on would corrupt
    // the count, so the guard is on the round as well as the id.
    await releaseTurn(session.id, 99)
    check('a stale round releases nothing', (await getSessionByEntry(userId, entry.id))?.turnCount, 7)
    check('and the freed turn is reusable', await reserveTurn(userId, session.id, 1), 8)

    section('a reservation cannot cross a round or a closed session')

    check('the wrong round is refused', await reserveTurn(userId, session.id, 2), null)
    // Another user's id must never move this row, whatever session id they hold.
    check(
      "another user's id is refused",
      await reserveTurn('00000000-0000-4000-8000-000000000000', session.id, 1),
      null,
    )

    /* --------------------------------- Closing ------------------------------- */

    section('the verdict and closed_at land together, or not at all')

    const closed = await closeRoundWithVerdict(userId, session.id, 1, 'You landed it.')
    check('the round closes', closed?.closedAt !== null, true)

    const round1 = await listRoundMessages(session.id, 1)
    check('one verdict row', round1.filter((m) => m.kind === 'verdict').length, 1)

    const twice = await closeRoundWithVerdict(userId, session.id, 1, 'A second verdict.')
    check('closing twice is a no-op', twice, null)
    check(
      'and writes no second verdict',
      (await listRoundMessages(session.id, 1)).filter((m) => m.kind === 'verdict').length,
      1,
    )

    check('a closed session refuses a turn', await reserveTurn(userId, session.id, 1), null)

    /* --------------------------------- Rounds -------------------------------- */

    section('[R6] a new round keeps the transcript')

    const round1Count = round1.length

    const bumped = await bumpRound(userId, session.id)
    check('round 2', bumped?.round, 2)
    check('turns reset', bumped?.turnCount, 0)
    check('and it is live again', bumped?.closedAt, null)

    check('round 1 is untouched', (await listRoundMessages(session.id, 1)).length, round1Count)
    check('round 2 is empty', (await listRoundMessages(session.id, 2)).length, 0)

    // A live round must never be resettable, or the cap is shruggable by
    // pressing a button rather than by waiting for a verdict.
    check('a live round cannot be reset', await bumpRound(userId, session.id), null)

    await insertMessage({
      sessionId: session.id,
      round: 2,
      kind: 'opener',
      role: 'assistant',
      content: 'A different platform, a different delay.',
    })
    // The index is per (session, round), so round 2 gets its own opener.
    check('round 2 may have its own opener', (await listRoundMessages(session.id, 2)).length, 1)

    const all = await listAllMessages(session.id)
    check('every round, oldest first', all[0].round, 1)
    check('and the newest last', all[all.length - 1].round, 2)
    check('nothing was lost', all.length, round1Count + 1)

    /* ------------------------------- The service ----------------------------- */

    section('the state the API returns')

    const state = await getState(userId, entry.id)
    check('a live round with one message reads open', state.ok && state.state.status, 'open')
    check('the current round only', state.ok && state.state.messages.length, 1)
    check('and it reports the cap', state.ok && state.state.maxTurns, MAX_ASSISTANT_TURNS)

    const foreign = await getState('00000000-0000-4000-8000-000000000000', entry.id)
    // 404 and never 403: a 403 confirms the id exists.
    check("another user's word is not found", !foreign.ok && foreign.status, 404)

    /* ------------------------------- The cost guard --------------------------- */

    section('the day guard counts openers, in the user’s timezone')

    const since = startOfLocalDayUtc(localDateNow(TZ), TZ)
    check('two rounds started today', await countRoundsStartedSince(userId, since), 2)
    check(
      'and none before today',
      await countRoundsStartedSince(userId, new Date(Date.now() + 86_400_000)),
      0,
    )
  } finally {
    if (userId) await db.delete(users).where(eq(users.id, userId))
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`)
    process.exit(1)
  }
  console.log('\nAll chat database assertions passed. Fixture removed.')
  process.exit(0)
}

void main()
