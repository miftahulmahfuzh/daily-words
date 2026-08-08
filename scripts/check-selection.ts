/**
 * Does the selection algorithm actually sample the way §7 claims?
 *
 * Run with:  npm run selection:check
 *
 * Seeds F5 §7's worked example — eight active words with known `last_shown_on`
 * values — draws a card several hundred times, and tallies. Everything happens
 * inside a transaction that is deliberately rolled back, so it is safe to run
 * against the live database and leaves nothing behind.
 *
 * F5's plan specified this as `scripts/check-selection.sql`. It is TypeScript
 * instead so that it exercises `selectCardCandidates` — the function the route
 * actually calls — rather than a second copy of the SQL that could drift from it.
 *
 * What is being checked is a *distribution*, so it is stated as inequalities
 * with wide margins rather than exact counts. A run that fails these has a
 * genuinely different algorithm, not bad luck.
 */
import 'dotenv/config'
import { db } from '../src/lib/db'
import { users, vocabEntries } from '../src/lib/db/schema'
import { selectCardCandidates } from '../src/lib/cards/selection'

const CARD_DATE = '2026-08-09'
const DRAWS = 300

/** §7's worked example. `null` means never shown. */
const FIXTURE: [string, string | null][] = [
  ['aplomb', null],
  ['bucolic', null],
  ['obviate', '2026-08-09'], // staleness 0 → weight 1,  the rarest
  ['genteel', '2026-08-08'], // staleness 1 → weight 2
  ['louche', '2026-08-08'], // staleness 1 → weight 2
  ['maunder', '2026-08-02'], // staleness 7 → weight 8
  ['natter', '2026-07-10'], // staleness 30 → weight 31
  ['pellucid', '2026-06-01'], // staleness 69 → weight 70, the commonest
]

class Rollback extends Error {}

let failures = 0

function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${label}`)
  else {
    failures++
    console.error(`  FAIL ${label}${detail ? `\n         ${detail}` : ''}`)
  }
}

async function main() {
  const tally = new Map<string, number>(FIXTURE.map(([term]) => [term, 0]))
  const firstTwo = new Map<string, number>(FIXTURE.map(([term]) => [term, 0]))
  /**
   * Position 3 — the first slot the weighting actually decides, since 1 and 2
   * are taken by the never-shown words. This is where the algorithm's claim is
   * testable: an item's probability of being drawn *first* is w / Σw, and §7's
   * worked example puts that at pellucid 61%, natter 27%, maunder 7%,
   * genteel 1.8%, louche 1.8%, obviate 0.9%.
   *
   * Inclusion counts cannot test it. Four slots are filled from six candidates,
   * so pellucid and natter are both included ~99% of the time and their tallies
   * sit one apart — an ordering assertion on those would be a coin toss.
   */
  const firstTierOne = new Map<string, number>(FIXTURE.map(([term]) => [term, 0]))
  let shortDraws = 0
  let dupDraws = 0

  try {
    await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ email: `f5-selection-check-${process.pid}@example.invalid` })
        .returning({ id: users.id })

      await tx.insert(vocabEntries).values(
        FIXTURE.map(([term, lastShownOn]) => ({
          userId: user.id,
          term,
          source: 'manual' as const,
          lastShownOn,
        })),
      )

      const started = Date.now()
      for (let i = 0; i < DRAWS; i++) {
        const picked = await selectCardCandidates(tx, user.id, CARD_DATE)
        if (picked.length !== 6) shortDraws++
        if (new Set(picked.map((p) => p.id)).size !== picked.length) dupDraws++
        for (const [index, candidate] of picked.entries()) {
          tally.set(candidate.term, (tally.get(candidate.term) ?? 0) + 1)
          if (index < 2) firstTwo.set(candidate.term, (firstTwo.get(candidate.term) ?? 0) + 1)
          if (index === 2)
            firstTierOne.set(candidate.term, (firstTierOne.get(candidate.term) ?? 0) + 1)
        }
      }
      console.log(`\n${DRAWS} draws in ${Date.now() - started}ms\n`)

      const width = Math.max(...FIXTURE.map(([t]) => t.length))
      console.log(`  ${'word'.padEnd(width)}    on card    drawn first`)
      for (const [term] of FIXTURE) {
        const onCard = tally.get(term) ?? 0
        const first = firstTierOne.get(term) ?? 0
        const bar = '█'.repeat(Math.round((onCard / DRAWS) * 24))
        console.log(
          `  ${term.padEnd(width)}  ${String(onCard).padStart(4)}/${DRAWS}` +
            `  ${String(first).padStart(4)}  ${bar}`,
        )
      }
      console.log('')

      const n = (term: string) => tally.get(term) ?? 0
      const drawnFirst = (term: string) => firstTierOne.get(term) ?? 0

      check('every draw returns six words', shortDraws === 0, `${shortDraws} short draws`)
      check('no word appears twice on one card', dupDraws === 0, `${dupDraws} draws with a repeat`)

      // Tier 0 is not a preference, it is a rule: a word never shown goes on the
      // card, every time, and takes one of the first two slots.
      check('aplomb is on every card', n('aplomb') === DRAWS, `${n('aplomb')}/${DRAWS}`)
      check('bucolic is on every card', n('bucolic') === DRAWS, `${n('bucolic')}/${DRAWS}`)
      check(
        'the never-shown words take positions 1 and 2',
        (firstTwo.get('aplomb') ?? 0) === DRAWS && (firstTwo.get('bucolic') ?? 0) === DRAWS,
      )

      // Staleness orders the draw. Expected shares of position 3 are 61% / 27%
      // / 7% / 0.9%, so at 300 draws these are separated by many times the noise.
      check(
        'pellucid (69 days stale) is drawn first more often than natter (30)',
        drawnFirst('pellucid') > drawnFirst('natter'),
        `${drawnFirst('pellucid')} vs ${drawnFirst('natter')}`,
      )
      check(
        'natter (30) more often than maunder (7)',
        drawnFirst('natter') > drawnFirst('maunder'),
        `${drawnFirst('natter')} vs ${drawnFirst('maunder')}`,
      )
      check(
        'maunder (7) more often than obviate (shown today)',
        drawnFirst('maunder') > drawnFirst('obviate'),
        `${drawnFirst('maunder')} vs ${drawnFirst('obviate')}`,
      )
      // Staleness raises the odds of a place on the card too, though inclusion
      // saturates: with four slots and six tier-1 candidates, the two stalest
      // are on almost every card and their tallies sit within noise of each
      // other. Compared here only where the gap is real.
      check(
        'maunder (7 days) makes the card more often than genteel (1)',
        n('maunder') > n('genteel'),
        `${n('maunder')} vs ${n('genteel')}`,
      )
      check(
        'obviate (shown today) is the rarest',
        FIXTURE.filter(([t]) => t !== 'obviate').every(([t]) => n(t) >= n('obviate')),
      )
      // Rare, never excluded. The pressure toward variety is probabilistic; a
      // word shown today is not banned from tomorrow's card.
      check('obviate still appears sometimes', n('obviate') > 0, `${n('obviate')} times`)

      throw new Rollback()
    })
  } catch (err) {
    if (!(err instanceof Rollback)) throw err
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`)
    process.exit(1)
  }
  console.log('\nSelection behaves as §7 describes. Fixture rolled back.')
  process.exit(0)
}

main()
