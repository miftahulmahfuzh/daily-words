/**
 * Verification helper for F7. Not part of the app; not imported by anything.
 *
 *   tsx --conditions=react-server --env-file=.env.local scripts/profile-peek.ts
 *   ... show                     print every profile row
 *   ... unonboard                set onboarded_at = null       (re-enter the flow)
 *   ... onboard                  set onboarded_at = now()
 *   ... tz <zone> [manual]       force a stored zone and source
 *   ... clear                    null every answer column
 *   ... birthday <date|skip|ask>  set profiles.birthday, or stamp/clear the ask
 *   ... context                  print getProfileContext() for each user
 */
import { eq } from 'drizzle-orm'
import { db } from '../src/lib/db'
import { profiles } from '../src/lib/db/schema'
import { normalizeBirthday } from '../src/lib/profile/birthday'
import { getProfileContext } from '../src/lib/profile/context.server'
import { DEFAULT_TIMEZONE, localDateNow } from '../src/lib/time/local-date'

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
      birthday: row.birthday,
      birthdayAskedAt: row.birthdayAskedAt?.toISOString() ?? null,
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
    /**
     * The one answer that is not one of the five, and the three states it has.
     *
     *   birthday 1996-08-11   a date, and the question counts as asked
     *   birthday skip         no date, question still counts as asked
     *   birthday ask          back to never-asked, so the gate fires again
     *
     * `skip` is what a `DW_TEST_SESSION` run wants: the `(app)` gate redirects
     * every route to `/birthday` until the question has been put, and the two
     * session specs then fail on a missing element rather than on the redirect.
     * `ask` is how to see the screen a second time — the app itself never shows
     * it twice, which is the whole point of `birthday_asked_at`.
     */
    case 'birthday': {
      if (!arg) throw new Error('usage: birthday <YYYY-MM-DD|skip|ask>')
      if (arg === 'ask') {
        await db.update(profiles).set({ birthday: null, birthdayAskedAt: null })
      } else if (arg === 'skip') {
        await db.update(profiles).set({ birthday: null, birthdayAskedAt: new Date() })
      } else {
        // Validated with the app's own rule rather than a regex here — a shape is
        // not a date, and this column is compared against a `date` in Postgres.
        const parsed = normalizeBirthday(arg, localDateNow(DEFAULT_TIMEZONE))
        if (!parsed.ok) throw new Error(`refused (${parsed.reason}): ${arg}`)
        await db.update(profiles).set({ birthday: parsed.value, birthdayAskedAt: new Date() })
      }
      break
    }
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
