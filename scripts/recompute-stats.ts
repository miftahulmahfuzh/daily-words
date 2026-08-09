/**
 * Rebuild `user_stats` and replay `badges_awarded` from `daily_cards` history.
 *
 *   npm run stats:recompute -- --user=me@example.com
 *   npm run stats:recompute -- --user=<uuid> --dry-run
 *   npm run stats:recompute -- --all
 *   npm run stats:recompute -- --all --dry-run
 *   npm run stats:recompute -- --user=<uuid> --prune          # destructive
 *
 * When to run it:
 *
 *   - after changing anything in `lib/gamification/badges.ts` → `--all`
 *   - if a user reports a wrong number → `--user=<them> --dry-run`, read the
 *     diff, then run it for real
 *   - after any manual `daily_cards` edit in the Neon console
 *   - **not on a schedule.** There is no cron in v0.1.0, and a scheduled job is
 *     the first step toward the notifications the roadmap forbids.
 *
 * `--prune` is the only destructive operation in F9. It refuses to run with
 * `--all` unless `--force` is also passed: deleting badges across every user by
 * accident is the one unrecoverable mistake available here.
 *
 * Users are processed **sequentially**. Neon's free tier has a small connection
 * ceiling and this is not a job worth racing.
 */
import 'dotenv/config'
import { asc, eq } from 'drizzle-orm'
import { db } from '../src/lib/db'
import { users } from '../src/lib/db/schema'
import { recomputeUserGamification } from '../src/lib/gamification/recompute'
import type { RecomputeReport } from '../src/lib/gamification/schemas'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Options = {
  all: boolean
  user: string | null
  dryRun: boolean
  prune: boolean
  force: boolean
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { all: false, user: null, dryRun: false, prune: false, force: false }
  for (const arg of argv) {
    if (arg === '--all') opts.all = true
    else if (arg === '--dry-run') opts.dryRun = true
    else if (arg === '--prune') opts.prune = true
    else if (arg === '--force') opts.force = true
    else if (arg.startsWith('--user=')) opts.user = arg.slice('--user='.length)
    else {
      console.error(`Unknown argument: ${arg}`)
      process.exit(2)
    }
  }
  return opts
}

async function resolveUsers(opts: Options): Promise<{ id: string; email: string }[]> {
  if (opts.all) {
    return db
      .select({ id: users.id, email: users.email })
      .from(users)
      .orderBy(asc(users.email))
  }

  const identifier = opts.user!
  const rows = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(UUID.test(identifier) ? eq(users.id, identifier) : eq(users.email, identifier))
    .limit(1)

  if (rows.length === 0) {
    console.error(`No such user: ${identifier}`)
    process.exit(1)
  }
  return rows
}

function report(email: string, r: RecomputeReport) {
  const before = r.before
    ? `${r.before.currentStreak}/${r.before.longestStreak}/${r.before.totalCards}`
    : 'none'
  const after = `${r.after.currentStreak}/${r.after.longestStreak}/${r.after.totalCards}`
  // "no row, and no cards to make one from" is the resting state of a user who
  // has not started, not a change worth flagging.
  const nothingToDo = r.before === null && r.after.totalCards === 0
  const changed = before !== after && !nothingToDo ? '  ← changed' : ''

  console.log(`\n${email}  (${r.timezone})${r.dryRun ? '  [dry run]' : ''}`)
  console.log(`  stats   current/longest/total: ${before} → ${after}${changed}`)
  console.log(
    `  badges  +${r.badgesInserted.length}` +
      (r.badgesPruned.length > 0 ? `  −${r.badgesPruned.length}` : ''),
  )
  for (const b of r.badgesInserted) console.log(`            + ${b.key} ${b.awardedForDate}`)
  for (const b of r.badgesPruned) console.log(`            − ${b.key} ${b.awardedForDate}`)
  for (const w of r.warnings) console.log(`  warning ${w}`)
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))

  if (!opts.all && !opts.user) {
    console.error('Pass --all or --user=<uuid|email>.')
    process.exit(2)
  }
  if (opts.all && opts.user) {
    console.error('--all and --user are mutually exclusive.')
    process.exit(2)
  }
  if (opts.prune && opts.all && !opts.force) {
    console.error(
      '--prune with --all deletes badge rows for every user. Add --force if that is\n' +
        'genuinely what you want, and run it with --dry-run first.',
    )
    process.exit(2)
  }

  const targets = await resolveUsers(opts)
  let failed = 0

  for (const user of targets) {
    try {
      report(
        user.email,
        await recomputeUserGamification(user.id, { prune: opts.prune, dryRun: opts.dryRun }),
      )
    } catch (err) {
      // Carry on: one user's bad row must not stop the other forty-nine.
      failed++
      console.error(`\n${user.email}\n  FAILED`, err)
    }
  }

  console.log(
    `\n${targets.length} user(s) processed${failed > 0 ? `, ${failed} failed` : ''}.`,
  )
  await db.$client.end({ timeout: 5 })
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
