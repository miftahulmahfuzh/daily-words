/**
 * F9's database-shaped guarantees, against a real Postgres.
 *
 * Run with:  npm run stats:db
 *
 * Four things in this feature can only be wrong in the database, and every one
 * of them is silent when it is:
 *
 *   1. **`date` columns must come back as 'YYYY-MM-DD' strings.** If the driver
 *      ever hands back JS `Date`s, every number in this feature shifts by a
 *      timezone offset and nothing throws. This is the highest-risk failure in
 *      F9 (§13.14) and it is the first assertion below.
 *   2. **Badge awarding must be idempotent**, and `RETURNING` must yield only
 *      genuinely new rows — that is what makes a re-delivered event silent
 *      rather than a duplicate toast.
 *   3. **The collector count must ignore `status` and honour `source`.** A
 *      `status` filter there would demote a user for mastering their words; a
 *      missing `source` filter would credit them for Discover's suggestions.
 *   4. **Recompute must be a fixed point.** Run it twice and the second run
 *      inserts nothing.
 *
 * Seeds a throwaway user and deletes it in a `finally`; deletion cascades. A
 * crashed run leaves at most one row set behind, findable by `@example.invalid`.
 * No LLM calls, no HTTP.
 */
import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { db } from '../src/lib/db'
import { badgesAwarded, dailyCards, profiles, users, vocabEntries } from '../src/lib/db/schema'
import {
  awardBadges,
  getBadgeCounts,
  listBadgeAwards,
  pruneBadges,
} from '../src/lib/db/queries/badges'
import {
  countManualWords,
  getCardDates,
  getCardHistory,
  readUserStats,
} from '../src/lib/db/queries/stats'
import { applyCardCreated } from '../src/lib/gamification/on-card-created'
import { recomputeUserGamification } from '../src/lib/gamification/recompute'
import type { CardCreatedEvent } from '../src/lib/cards/hooks'
import {
  addLocalDays,
  localDateNow,
  localDayOfWeek,
  localHour,
  type LocalDate,
} from '../src/lib/time/local-date'

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

const TZ = 'Asia/Jakarta'

/** A card, inserted straight in. F5's own creation path needs vocab and selection;
 *  what is under test here is F9's arithmetic over rows that already exist. */
async function seedCard(userId: string, cardDate: LocalDate, localTime: string) {
  // Jakarta is UTC+7 with no DST, so the instant is exact.
  const createdAt = new Date(`${cardDate}T${localTime}:00+07:00`)
  const [row] = await db
    .insert(dailyCards)
    .values({ userId, cardDate, timezone: TZ, createdAt })
    .returning({ id: dailyCards.id, createdAt: dailyCards.createdAt })
  return row
}

function eventFor(
  userId: string,
  card: { id: string; createdAt: Date },
  cardDate: LocalDate,
  isFirstCardEver: boolean,
): CardCreatedEvent {
  return {
    userId,
    cardId: card.id,
    cardDate,
    timezone: TZ,
    createdAt: card.createdAt.toISOString(),
    localCreatedAtHour: localHour(card.createdAt, TZ),
    localWeekday: localDayOfWeek(cardDate),
    itemCount: 6,
    vocabEntryIds: [],
    isFirstCardEver,
  }
}

async function main() {
  const email = `f9-stats-check-${process.pid}@example.invalid`
  let userId: string | null = null
  let liveUserId: string | null = null

  try {
    const [user] = await db.insert(users).values({ email }).returning({ id: users.id })
    userId = user.id
    await db.insert(profiles).values({ userId, timezone: TZ })

    /* ------------------------------------------------------------------ 1 */

    section('§13.14 — date columns are strings, not JS Dates')

    const first = await seedCard(userId, '2026-01-01', '09:00')
    const dates = await getCardDates(userId)
    check('getCardDates returns one row', dates.length, 1)
    check('and it is a string', typeof dates[0], 'string')
    check('shaped YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(dates[0]), true)
    // Through `unknown` on purpose: the column is *typed* as a string by
    // `{ mode: 'string' }`, so `dates[0] instanceof Date` will not even compile.
    // The type is a claim; this is the runtime evidence for it.
    check('not a Date instance', (dates[0] as unknown) instanceof Date, false)

    const history = await getCardHistory(userId)
    check('getCardHistory cardDate is a string too', typeof history[0].cardDate, 'string')
    check('and created_at IS a Date', history[0].createdAt instanceof Date, true)
    check('the card records the zone it was made in', history[0].timezone, TZ)

    /* ------------------------------------------------------------------ 2 */

    section('§9.4 — the card-created hook')

    const rewards = await applyCardCreated(eventFor(userId, first, '2026-01-01', true))
    check('the hook returned a payload', rewards !== null, true)
    // 0, not 1, and that is the feature: this card is dated 1 January 2026 and
    // "today" is whenever this script runs. A run that ended months ago is over.
    // The streak that counts a card made *today* is asserted at the end.
    check('a card from a finished run does not start a streak', rewards?.currentStreak, 0)
    check('first_card and new_year, in catalog order', rewards?.awardedBadges.map((b) => b.key), [
      'first_card',
      'new_year',
    ])
    check('level-up into Blank Card is not a level-up', rewards?.levelUp, null)

    const cached = await readUserStats(userId)
    check('user_stats was written', cached?.totalCards, 1)
    check('first_card_on', cached?.firstCardOn, '2026-01-01')
    check('[R11] last_card_on', cached?.lastCardOn, '2026-01-01')

    section('§13.5 — the hook is idempotent per card')

    const again = await applyCardCreated(eventFor(userId, first, '2026-01-01', true))
    check('a re-delivered event awards nothing new', again?.awardedBadges, [])
    check('and the numbers are unchanged', again?.totalCards, 1)
    check(
      'so the row count did not double',
      (await listBadgeAwards(userId)).length,
      2,
    )

    /* ------------------------------------------------------------------ 3 */

    section('§8 — full_week and the level-up, over a real run')

    // 2026-04-01 … 2026-04-07: seven consecutive days containing exactly one
    // Sunday (the 5th) and no date-matched badge. Deliberately far from "today"
    // in either direction, so this fixture can never merge with the live-streak
    // run seeded further down.
    for (let d = 1; d <= 7; d++) {
      const date = `2026-04-0${d}` as LocalDate
      const card = await seedCard(userId, date, d === 7 ? '02:30' : '10:00')
      await applyCardCreated(eventFor(userId, card, date, false))
    }

    const afterRun = await readUserStats(userId)
    check('longest streak is the seven-day run', afterRun?.longestStreak, 7)
    check('total cards', afterRun?.totalCards, 8)

    const counts = new Map(
      (await getBadgeCounts(userId)).map((c) => [c.badgeKey, c.count]),
    )
    check('full_week fired once, on day 7', counts.get('full_week'), 1)
    check('sunday fired once (2026-04-05)', counts.get('sunday'), 1)
    check('midnight_oil fired once (02:30 on the 7th)', counts.get('midnight_oil'), 1)
    check('first_card still exactly once', counts.get('first_card'), 1)

    /* ------------------------------------------------------------------ 4 */

    section('§5.2 — the collector count')

    await db.insert(vocabEntries).values([
      { userId, term: 'genteel', source: 'manual', status: 'active' },
      { userId, term: 'winnow', source: 'manual', status: 'mastered' },
      { userId, term: 'pellucid', source: 'suggested', status: 'active' },
    ])
    check('mastered words still count; suggested ones do not', await countManualWords(userId), 2)

    /* ------------------------------------------------------------------ 5 */

    section('§11 — recompute restores exactly what was there')

    const before = (await listBadgeAwards(userId))
      .map((a) => `${a.badgeKey}@${a.awardedForDate}`)
      .sort()

    await db.delete(badgesAwarded).where(eq(badgesAwarded.userId, userId))
    const restored = await recomputeUserGamification(userId)
    check('every badge came back', restored.badgesInserted.length, before.length)
    check(
      'and the same ones',
      (await listBadgeAwards(userId)).map((a) => `${a.badgeKey}@${a.awardedForDate}`).sort(),
      before,
    )
    check('no warnings', restored.warnings, [])
    check('stats agree with the live path', restored.after.longestStreak, 7)

    const secondRun = await recomputeUserGamification(userId)
    check('a second run is a fixed point', secondRun.badgesInserted, [])

    section('§11.2 — dry run writes nothing')

    await db.delete(badgesAwarded).where(eq(badgesAwarded.userId, userId))
    const dry = await recomputeUserGamification(userId, { dryRun: true })
    check('it reports what it would insert', dry.badgesInserted.length, before.length)
    check('and inserts none of it', (await listBadgeAwards(userId)).length, 0)
    await recomputeUserGamification(userId)

    section('§11.1 — prune removes only what no longer qualifies')

    await awardBadges(userId, [
      { badgeKey: 'six_before_noon', awardedForDate: '2026-08-03' },
    ])
    check('a stale key is insertable', (await listBadgeAwards(userId)).length, before.length + 1)
    const pruned = await recomputeUserGamification(userId, { prune: true })
    check('prune reports it', pruned.badgesPruned.map((p) => p.key), ['six_before_noon'])
    check(
      'and only it',
      (await listBadgeAwards(userId)).map((a) => `${a.badgeKey}@${a.awardedForDate}`).sort(),
      before,
    )
    check('pruning nothing is a no-op', await pruneBadges(userId, []), 0)

    /* ------------------------------------------------------------------ 6 */

    section('§6.2 — a live streak, against the clock this script is running under')

    // A second user, so the assertion below is about two cards and nothing else.
    // On the first user it would have to reason about whether today happens to
    // sit beside a fixture date, which is a test that fails one day a year.
    const [live] = await db
      .insert(users)
      .values({ email: `f9-live-check-${process.pid}@example.invalid` })
      .returning({ id: users.id })
    liveUserId = live.id
    await db.insert(profiles).values({ userId: live.id, timezone: TZ })

    const today = localDateNow(TZ)
    const yesterday = addLocalDays(today, -1)

    const yesterdayCard = await seedCard(live.id, yesterday, '10:00')
    check(
      'a card made yesterday is a streak of one, not a lapse',
      (await applyCardCreated(eventFor(live.id, yesterdayCard, yesterday, true)))
        ?.currentStreak,
      1,
    )

    const todayCard = await seedCard(live.id, today, '10:00')
    check(
      'and today extends it to two',
      (await applyCardCreated(eventFor(live.id, todayCard, today, false)))?.currentStreak,
      2,
    )
    check(
      'recompute agrees with what the live path wrote',
      (await recomputeUserGamification(live.id)).after.currentStreak,
      2,
    )
  } finally {
    if (userId) await db.delete(users).where(eq(users.id, userId))
    if (liveUserId) await db.delete(users).where(eq(users.id, liveUserId))
    await db.$client.end({ timeout: 5 })
  }
}

main()
  .then(() => {
    console.log(
      failures === 0 ? '\nAll database checks passed.' : `\n${failures} check(s) failed.`,
    )
    process.exit(failures === 0 ? 0 : 1)
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
