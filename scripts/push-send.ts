/**
 * Put one real reminder on the phone, and print the copy that went with it.
 *
 *   npm run push:send -- --user=me@example.com
 *   npm run push:send -- --user=<uuid> --slot=13
 *   npm run push:send -- --user=<uuid> --slot=19 --date=2026-12-25
 *
 * **Writes nothing.** No `push_deliveries` row, no claim, no schedule — so
 * running it does not spend a slot and does not stop the real 09:00 reminder
 * arriving. It does not prune a dead endpoint either: a dry run must not mutate,
 * so a 410 here is reported and left alone for the tick to sweep.
 *
 * This is the only way to check R2 by eye. Every one of the seven slots has its
 * own line, and the thing that matters is whether they read like seven different
 * sentences from one voice rather than one sentence seven times. Run it for each
 * slot, read them on the lock screen, and fix `src/lib/push/reminders.ts` — not
 * this script — until they do.
 *
 * The exit code reports transport and nothing else. A `0` means Apple accepted
 * the request; it does not mean the notification was any good.
 *
 * `--conditions=react-server` in the npm script is required: everything under
 * `lib/db/` and `lib/push/` imports `server-only`, whose default export throws
 * outside a server bundle.
 */
import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { db } from '../src/lib/db'
import { users } from '../src/lib/db/schema'
import { resolveTimezone } from '../src/lib/db/queries/cards'
import { getProfile } from '../src/lib/db/queries/profiles'
import { listSubscriptions } from '../src/lib/db/queries/push'
import { reminderFor } from '../src/lib/push/reminders'
import { REMINDER_SLOTS } from '../src/lib/push/schedule'
import { pushPayloadFor } from '../src/lib/push/tick'
import { sendPush } from '../src/lib/push/send'
import { isLocalDate, localDateNow } from '../src/lib/time/local-date'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const USAGE = `usage: npm run push:send -- --user=<uuid|email> [--slot=${REMINDER_SLOTS.join('|')}] [--date=YYYY-MM-DD]`

type Options = { user: string | null; slot: number | null; date: string | null }

function parseArgs(argv: string[]): Options {
  const opts: Options = { user: null, slot: null, date: null }
  for (const arg of argv) {
    if (arg.startsWith('--user=')) opts.user = arg.slice('--user='.length)
    else if (arg.startsWith('--slot=')) opts.slot = Number(arg.slice('--slot='.length))
    else if (arg.startsWith('--date=')) opts.date = arg.slice('--date='.length)
    else {
      console.error(`Unknown argument: ${arg}`)
      console.error(USAGE)
      process.exit(2)
    }
  }
  return opts
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))

  if (!opts.user) {
    console.error(USAGE)
    process.exit(2)
  }

  const slot = opts.slot ?? REMINDER_SLOTS[0]
  if (!REMINDER_SLOTS.includes(slot)) {
    console.error(`--slot must be one of: ${REMINDER_SLOTS.join(', ')}`)
    process.exit(2)
  }
  if (opts.date !== null && !isLocalDate(opts.date)) {
    console.error(`--date must be a real calendar date as YYYY-MM-DD, not merely shaped like one`)
    process.exit(2)
  }

  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(UUID.test(opts.user) ? eq(users.id, opts.user) : eq(users.email, opts.user))
    .limit(1)

  if (!user) {
    console.error(`No such user: ${opts.user}`)
    process.exit(1)
  }

  const timezone = resolveTimezone(await getProfile(user.id))
  if (!timezone.ok && opts.date === null) {
    console.error(
      `${user.email} has no usable timezone (${timezone.reason}). ` +
        `The tick would send nothing; pass --date=YYYY-MM-DD to force a line out of it anyway.`,
    )
    process.exit(1)
  }

  const date = opts.date ?? localDateNow(timezone.timezone)
  const reminder = reminderFor(date, slot)
  if (!reminder) {
    console.error(`No deck line for slot ${slot}. That should be impossible; check REMINDER_BANDS.`)
    process.exit(1)
  }
  const payload = pushPayloadFor(reminder)

  console.log(`\n${user.email}  ·  ${timezone.timezone}  ·  ${date}  ·  slot ${slot}:00\n`)
  console.log(`  title  ${payload.title}`)
  console.log(`  body   ${payload.body}`)
  console.log(`  url    ${payload.url}`)
  console.log(`  tag    ${payload.tag}`)
  console.log(`  key    ${reminder.key}\n`)

  const subs = await listSubscriptions(user.id)
  if (subs.length === 0) {
    console.error(
      'No subscriptions. Turn reminders on in /profile/edit, from the Home Screen app — ' +
        'iOS grants Web Push nowhere else.',
    )
    process.exit(1)
  }

  let delivered = 0
  for (const sub of subs) {
    const short = `${sub.endpoint.slice(0, 48)}…`
    const outcome = await sendPush(sub, payload)
    if (outcome.ok) {
      delivered++
      console.log(`  sent   ${short}`)
    } else if (outcome.reason === 'gone') {
      console.log(`  gone   ${short}   (404/410 — the tick will sweep it; this run does not)`)
    } else if (outcome.reason === 'unconfigured') {
      console.log(`  config ${short}   (no VAPID keys in .env.local)`)
    } else if (outcome.reason === 'rejected') {
      console.log(`  error  ${short}   (refused, status ${outcome.status})`)
    } else {
      console.log(`  error  ${short}   (transport — no answer from the push service)`)
    }
  }

  console.log(`\n${delivered}/${subs.length} accepted. Now read it on the phone.\n`)
  process.exit(delivered > 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
