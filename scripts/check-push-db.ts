/**
 * The push feature's database-shaped guarantees, against a real Postgres.
 *
 * Run with:  npm run push:db
 *
 * Seven things here can only be wrong in the database or in the composition, and
 * every one of them is silent when it is:
 *
 *   1. **The unique index.** `(user_id, local_date, slot)` refusing a second row
 *      is what makes delivery idempotent. Written as a read-then-write it passes
 *      every offline check and buzzes the phone twice from two overlapping ticks.
 *   2. **The claim before the send.** Two ticks in the same slot must produce one
 *      notification. This is the assertion that catches an implementation which
 *      records after sending.
 *   3. **Silence costs nothing.** A user with today's card gets no notification
 *      *and no row*. A `'skipped'` row here would be noise in the one table that
 *      answers "did we bother them?".
 *   4. **No words, no lie.** A user with zero active words cannot make a card, so
 *      "make today's card" is a sentence the app must not send. One `'skipped'`
 *      row, nothing delivered.
 *   5. **The 410 sweep.** iOS rotates endpoints; a dead one must delete its row
 *      rather than be retried forever.
 *   6. **The cascade.** Deleting a user takes both new tables with them, or the
 *      app grows an orphaned lock-screen.
 *   7. **Nothing here creates a card.** Invariant 2, asserted as a grep over the
 *      whole of `src/lib/push/` and `src/app/api/push/` rather than trusted.
 *
 * **No network and no push provider.** The sender is injected: `tickUser` takes a
 * `send` for exactly this, the way `encodeClaimIntent` takes a `nowSeconds`. The
 * clock is injected for the same reason — the catch-up assertions would otherwise
 * have to wait two hours.
 *
 * A crashed run leaves at most three row sets behind, findable by the fixture
 * domain. Clean up with:
 *
 *     delete from users where email like 'f30-push-%@example.invalid';
 */
import 'dotenv/config'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { and, asc, count, eq } from 'drizzle-orm'
import { db } from '../src/lib/db'
import {
  profiles,
  pushDeliveries,
  pushSubscriptions,
  users,
  vocabEntries,
} from '../src/lib/db/schema'
import {
  listReminderCandidates,
  upsertSubscription,
  type PushTarget,
  type ReminderCandidate,
} from '../src/lib/db/queries/push'
import { reminderByKey } from '../src/lib/push/reminders'
import { REMINDER_TAG, runTick, tickUser, type PushSender } from '../src/lib/push/tick'
import type { PushOutcome, PushPayload } from '../src/lib/push/send'
import { startOfLocalDayUtc } from '../src/lib/time/local-date'

const TZ = 'Asia/Jakarta'
const DAY = '2026-09-14'

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

/** A local wall-clock hour on `DAY`, as an absolute instant. Jakarta has no DST. */
function at(hour: number, date = DAY): Date {
  return new Date(startOfLocalDayUtc(date, TZ).getTime() + hour * 3_600_000)
}

type SendLog = { endpoint: string; payload: PushPayload }

/** A sender that answers from a table and records everything it was asked to do. */
function fakeSender(log: SendLog[], outcomes: Record<string, PushOutcome> = {}): PushSender {
  return async (target, payload) => {
    log.push({ endpoint: target.endpoint, payload })
    return outcomes[target.endpoint] ?? { ok: true }
  }
}

/**
 * A `ReminderCandidate` for one seeded user, built the way the tick receives
 * one: **the devices ride on the candidate**, so `tickUser` makes no second
 * query for them. Read back through `listReminderCandidates()` rather than
 * hand-assembled, so this check exercises the fold in `queries/push.ts` too.
 */
async function candidateFor(userId: string): Promise<ReminderCandidate> {
  const found = (await listReminderCandidates()).find((c) => c.userId === userId)
  if (!found) throw new Error(`no candidate for ${userId} — is the profile onboarded?`)
  return found
}

async function seedUser(role: string): Promise<string> {
  const email = `f30-push-${role}-${process.pid}@example.invalid`
  const [user] = await db.insert(users).values({ email }).returning({ id: users.id })
  await db.insert(profiles).values({ userId: user.id, timezone: TZ, onboardedAt: new Date() })
  return user.id
}

async function seedWord(userId: string, term: string): Promise<void> {
  await db.insert(vocabEntries).values({
    userId,
    term,
    source: 'manual',
    status: 'active',
    enrichmentStatus: 'ready',
    definition: 'a fixture',
  })
}

async function seedDevice(userId: string, name: string): Promise<PushTarget> {
  return upsertSubscription(userId, {
    endpoint: `https://web.push.apple.invalid/${name}-${process.pid}`,
    p256dh: 'BFixtureP256dhKeyThatIsNotUsedBecauseTheSenderIsInjected',
    auth: 'fixtureAuthSecret',
    // Required by `NewSubscriptionInput`, and null is what the route stores when
    // the browser sends no user-agent header.
    userAgent: null,
  })
}

async function deliveryRows(userId: string) {
  return db
    .select({
      localDate: pushDeliveries.localDate,
      slot: pushDeliveries.slot,
      status: pushDeliveries.status,
      reason: pushDeliveries.reason,
    })
    .from(pushDeliveries)
    .where(eq(pushDeliveries.userId, userId))
    .orderBy(asc(pushDeliveries.slot))
}

async function subscriptionCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
  return row?.n ?? 0
}

/** Did this statement raise? Constraints are asserted, never described. */
async function rejected(run: () => Promise<unknown>): Promise<boolean> {
  try {
    await run()
    return false
  } catch {
    return true
  }
}

async function main() {
  const ids: string[] = []

  try {
    /* ------------------------------ 1. the index ---------------------------- */

    section('the unique index is the idempotence guarantee')

    const indexed = await seedUser('index')
    ids.push(indexed)

    await db.insert(pushDeliveries).values({
      userId: indexed,
      localDate: DAY,
      slot: 7,
      status: 'sent',
      // `push_deliveries_reminder_key_check` refuses a 'sent' row without one.
      reminderKey: 'morning_unmade',
    })
    check(
      'a second row for the same (user, date, slot) is refused',
      await rejected(() =>
        db.insert(pushDeliveries).values({
          userId: indexed,
          localDate: DAY,
          slot: 7,
          status: 'skipped',
        }),
      ),
      true,
    )
    check(
      'a different slot on the same day is fine',
      await rejected(() =>
        db.insert(pushDeliveries).values({
          userId: indexed,
          localDate: DAY,
          slot: 9,
          status: 'sent',
          reminderKey: 'morning_kettle',
        }),
      ),
      false,
    )

    /**
     * The CHECK that turns "the tick forgot to pass the deck line's key" from a
     * silently wrong audit trail into a refused INSERT. This is the assertion
     * that would have caught the shape reconciliation found: a `pushPayloadFor`
     * destructuring only `{ title, body }` and a `claimDelivery` with no
     * `reminderKey` typechecks perfectly and fails here, at 07:00, in production.
     */
    check(
      "a 'sent' row with no reminder_key is refused",
      await rejected(() =>
        db.insert(pushDeliveries).values({
          userId: indexed,
          localDate: DAY,
          slot: 11,
          status: 'sent',
        }),
      ),
      true,
    )
    check(
      "but a 'skipped' row needs none",
      await rejected(() =>
        db.insert(pushDeliveries).values({
          userId: indexed,
          localDate: DAY,
          slot: 13,
          status: 'skipped',
          reason: 'superseded',
        }),
      ),
      false,
    )

    /* ---------------------------- 2. send-once ------------------------------ */

    section('a tick run twice in the same slot sends once')

    const twice = await seedUser('twice')
    ids.push(twice)
    await seedWord(twice, 'genteel')
    const device = await seedDevice(twice, 'twice')

    const log: SendLog[] = []
    const twiceCandidate = await candidateFor(twice)
    const first = await tickUser(twiceCandidate, { now: at(9), send: fakeSender(log) })
    check('the first tick sends', first.outcome, 'sent')
    check('at the 09:00 slot', first.slot, 9)
    check('and supersedes the 07:00 one', first.supersededSlots, [7])
    check('one notification went out', log.length, 1)
    check('to the registered device', log[0]?.endpoint, device.endpoint)
    check('the payload names /today', log[0]?.payload.url, '/today')
    check('and collapses on one constant tag', log[0]?.payload.tag, REMINDER_TAG)
    check('which is the literal public/sw.js also holds', REMINDER_TAG, 'daily-card-reminder')
    check('the title is not empty', (log[0]?.payload.title ?? '').length > 0, true)
    check('nor is the body', (log[0]?.payload.body ?? '').length > 0, true)

    const second = await tickUser(twiceCandidate, { now: at(9), send: fakeSender(log) })
    check('the second tick in the same slot is a no-op', second.outcome, 'no_slot')
    check('and sent nothing more', log.length, 1)
    check(
      'two rows exist — the delivery and the slot it caught up past',
      await deliveryRows(twice),
      [
        { localDate: DAY, slot: 7, status: 'skipped', reason: 'superseded' },
        { localDate: DAY, slot: 9, status: 'sent', reason: null },
      ],
    )

    section('a late tick delivers the current slot, never a burst')

    const late = await tickUser(twiceCandidate, { now: at(19), send: fakeSender(log) })
    check('one send, at the current slot', [late.outcome, late.slot], ['sent', 19])
    check('exactly one more notification', log.length, 2)
    check(
      'and the four slots in between are spent, not replayed',
      (await deliveryRows(twice)).map((r) => `${r.slot}:${r.status}`),
      ['7:skipped', '9:sent', '11:skipped', '13:skipped', '15:skipped', '17:skipped', '19:sent'],
    )
    check('the deck gave the two slots different copy', log[0]?.payload.body !== log[1]?.payload.body, true)

    /**
     * **R2, end to end.** The offline check proves the deck's lines are
     * pairwise distinct; this proves the line that was chosen is the line that
     * went on the wire *and* the line recorded in the row. A `reminder_key` that
     * disagrees with the body it was sent with is an audit trail that lies, and
     * nothing else in the app would ever notice.
     */
    const sentKeys = await db
      .select({ slot: pushDeliveries.slot, key: pushDeliveries.reminderKey })
      .from(pushDeliveries)
      .where(and(eq(pushDeliveries.userId, twice), eq(pushDeliveries.status, 'sent')))
      .orderBy(asc(pushDeliveries.slot))
    check(
      "every 'sent' row carries the key of the line it sent",
      sentKeys.map((r) => reminderByKey(r.key ?? '')?.body ?? null),
      [log[0]?.payload.body ?? null, log[1]?.payload.body ?? null],
    )
    check('and the two keys differ', sentKeys[0]?.key !== sentKeys[1]?.key, true)

    /* --------------------------- 3. the quiet day --------------------------- */

    section('a user with today’s card gets nothing, and no row')

    const carded = await seedUser('carded')
    ids.push(carded)
    await seedWord(carded, 'candid')
    await seedDevice(carded, 'carded')
    await db.insert(pushDeliveries).values({
      userId: carded,
      localDate: '2026-09-13',
      slot: 7,
      status: 'sent',
      reminderKey: 'morning_unmade',
    }) // yesterday's row must not confuse today
    const { createCard } = await import('../src/lib/db/queries/cards')
    await createCard(carded, DAY, TZ)

    const quietLog: SendLog[] = []
    const quiet = await tickUser(await candidateFor(carded), {
      now: at(9),
      send: fakeSender(quietLog),
    })
    check('the outcome is silence', quiet.outcome, 'quiet')
    check('nothing was sent', quietLog.length, 0)
    check(
      'and today wrote no row at all',
      (await deliveryRows(carded)).filter((r) => r.localDate === DAY),
      [],
    )

    /* -------------------------- 4. nothing to say --------------------------- */

    section('a user with no active words is skipped, not lied to')

    const wordless = await seedUser('wordless')
    ids.push(wordless)
    await seedDevice(wordless, 'wordless')

    const wordlessLog: SendLog[] = []
    const nothing = await tickUser(await candidateFor(wordless), {
      now: at(7),
      send: fakeSender(wordlessLog),
    })
    check('the outcome names the reason', nothing.outcome, 'no_active_words')
    check('nothing was sent', wordlessLog.length, 0)
    check(
      'one skipped row spends the slot',
      await deliveryRows(wordless),
      [{ localDate: DAY, slot: 7, status: 'skipped', reason: 'no_active_words' }],
    )

    /* ---------------------------- 5. the 410 sweep -------------------------- */

    section('a dead endpoint deletes its row rather than being retried')

    const rotated = await seedUser('rotated')
    ids.push(rotated)
    await seedWord(rotated, 'melumuri')
    const deadDevice = await seedDevice(rotated, 'dead')
    const liveDevice = await seedDevice(rotated, 'live')
    check('two devices are registered', await subscriptionCount(rotated), 2)

    const sweepLog: SendLog[] = []
    const swept = await tickUser(await candidateFor(rotated), {
      now: at(11),
      send: fakeSender(sweepLog, {
        [deadDevice.endpoint]: { ok: false, reason: 'gone' },
      }),
    })
    check('the live device still got it', swept.outcome, 'sent')
    check('one delivered, one pruned', [swept.notificationsSent, swept.subscriptionsPruned], [1, 1])
    check('only the live row survives', await subscriptionCount(rotated), 1)
    const [survivor] = await db
      .select({ endpoint: pushSubscriptions.endpoint })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, rotated))
    check('and it is the right one', survivor?.endpoint, liveDevice.endpoint)

    section('a slot where every send fails is recorded failed, never retried')

    const doomedLog: SendLog[] = []
    // The dead row is gone from the database now, but the candidate this tick is
    // handed still has to be re-read for the same reason the tick re-reads it:
    // `targets` is a snapshot taken when the candidate was listed.
    const doomed = await tickUser(await candidateFor(rotated), {
      now: at(13),
      send: fakeSender(doomedLog, {
        [liveDevice.endpoint]: { ok: false, reason: 'rejected', status: 500 },
      }),
    })
    check('the outcome is failure', doomed.outcome, 'failed')
    check(
      'and the row holds its slot',
      (await deliveryRows(rotated)).find((r) => r.slot === 13)?.status,
      'failed',
    )

    /* ---------------------- 6. the whole-fleet fan-out ---------------------- */

    section('runTick walks every candidate and reports counts, not identities')

    const summary = await runTick({ now: at(15), send: fakeSender([]) })
    check('it found candidates', summary.candidates > 0, true)
    check('the outcome tally has all seven keys', Object.keys(summary.outcomes).sort(), [
      'duplicate',
      'failed',
      'no_active_words',
      'no_slot',
      'no_timezone',
      'quiet',
      'sent',
    ])
    check(
      'and the summary carries no user id',
      JSON.stringify(summary).includes(twice),
      false,
    )

    section('an unusable timezone sends nothing and writes nothing')

    const zoneless = await seedUser('zoneless')
    ids.push(zoneless)
    await seedWord(zoneless, 'gezellig')
    await seedDevice(zoneless, 'zoneless')
    await db
      .update(profiles)
      .set({ timezone: 'Not/AZone' })
      .where(eq(profiles.userId, zoneless))

    const zoneLog: SendLog[] = []
    const zoneResult = await tickUser(
      { userId: zoneless, timezone: 'Not/AZone', targets: [] },
      { now: at(9), send: fakeSender(zoneLog) },
    )
    check('the outcome names the zone', zoneResult.outcome, 'no_timezone')
    check('nothing was sent', zoneLog.length, 0)
    check('and nothing was written', await deliveryRows(zoneless), [])

    /* ------------------------------ 7. the cascade -------------------------- */

    section('deleting a user takes both new tables with them')

    const doomedUser = twice
    await db.delete(users).where(eq(users.id, doomedUser))
    ids.splice(ids.indexOf(doomedUser), 1)
    check('no deliveries remain', (await deliveryRows(doomedUser)).length, 0)
    check('no subscriptions remain', await subscriptionCount(doomedUser), 0)
  } finally {
    for (const id of ids) await db.delete(users).where(eq(users.id, id))
  }

  /* --------------- 8. invariant 2, as a grep rather than a habit ------------ */

  section('nothing in this feature can create a card')

  const ROOTS = ['src/lib/push', 'src/app/api/push']
  const FORBIDDEN = ['createCard', 'onCardCreated', 'dailyCards', 'dailyCardItems', 'db.transaction']

  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = join(dir, e.name)
      if (e.isDirectory()) return sourceFiles(full)
      return /\.tsx?$/.test(e.name) ? [full] : []
    })

  const stripComments = (text: string): string =>
    text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

  for (const root of ROOTS) {
    const files = sourceFiles(root)
    check(`${root} has files to scan`, files.length > 0, true)
    for (const symbol of FORBIDDEN) {
      check(
        `${root} never names ${symbol}`,
        files
          .filter((f) => new RegExp(`\\b${symbol.replace('.', '\\.')}\\b`).test(stripComments(readFileSync(f, 'utf8'))))
          .map((f) => relative(process.cwd(), f).split(sep).join('/')),
        [],
      )
    }
  }

  /**
   * Comments **are** stripped, deliberately. The prose in `tick.ts` explaining
   * why it must never create a card is the most valuable text in this feature,
   * and a grep that forbade naming the thing being forbidden would delete it.
   * This is the opposite call to `journal:check`'s key grep, which reads prose on
   * purpose because there the literal string itself is the hazard.
   */

  console.log()
  if (failures > 0) {
    console.error(`${failures} check(s) failed`)
    process.exit(1)
  }
  console.log('all push database checks passed')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
