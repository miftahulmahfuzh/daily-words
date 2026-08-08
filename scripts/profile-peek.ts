/**
 * Verification helper for F7. Not part of the app; not imported by anything.
 *
 *   tsx --conditions=react-server --env-file=.env.local scripts/profile-peek.ts
 *   ... show                     print every profile row
 *   ... unonboard                set onboarded_at = null       (re-enter the flow)
 *   ... onboard                  set onboarded_at = now()
 *   ... tz <zone> [manual]       force a stored zone and source
 *   ... clear                    null every answer column
 *   ... context                  print getProfileContext() for each user
 */
import { eq } from 'drizzle-orm'
import { db } from '../src/lib/db'
import { profiles } from '../src/lib/db/schema'
import { getProfileContext } from '../src/lib/profile/context.server'

const [command = 'show', arg, flag] = process.argv.slice(2)

async function show() {
  const rows = await db.select().from(profiles)
  for (const row of rows) {
    console.log({
      userId: row.userId,
      timezone: row.timezone,
      timezoneSource: row.timezoneSource,
      occupation: row.occupation,
      interests: row.interests,
      currentlyConsuming: row.currentlyConsuming,
      englishContexts: row.englishContexts,
      chatTone: row.chatTone,
      onboardedAt: row.onboardedAt?.toISOString() ?? null,
    })
  }
  if (rows.length === 0) console.log('(no profile rows)')
}

async function main() {
  switch (command) {
    case 'show':
      break
    case 'unonboard':
      await db.update(profiles).set({ onboardedAt: null })
      break
    case 'onboard':
      await db.update(profiles).set({ onboardedAt: new Date() })
      break
    case 'tz':
      if (!arg) throw new Error('usage: tz <zone> [manual]')
      await db
        .update(profiles)
        .set({ timezone: arg, timezoneSource: flag === 'manual' ? 'manual' : 'detected' })
      break
    case 'delete':
      await db.delete(profiles)
      break
    case 'clear':
      await db.update(profiles).set({
        occupation: null,
        interests: null,
        currentlyConsuming: null,
        englishContexts: null,
        chatTone: null,
      })
      break
    case 'context': {
      const rows = await db.select({ userId: profiles.userId }).from(profiles)
      for (const row of rows) {
        const ctx = await getProfileContext(row.userId)
        console.log(`\n--- ${row.userId} (filled ${ctx.filledCount}, empty ${ctx.isEmpty})`)
        console.log(ctx.text)
        console.log(ctx.toneDirective)
      }
      return
    }
    default:
      throw new Error(`unknown command: ${command}`)
  }
  await show()
}

void main().then(
  () => process.exit(0),
  (err) => {
    console.error(err)
    process.exit(1)
  },
)

// Referenced so `eq` stays available for ad-hoc single-user edits during
// verification without a lint error when it is not in use.
void eq
