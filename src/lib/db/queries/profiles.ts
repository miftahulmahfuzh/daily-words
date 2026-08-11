import 'server-only'
import { and, eq, ne, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { profiles } from '@/lib/db/schema'
import { FALLBACK_TIMEZONE } from '@/lib/profile/constants'
import type { ProfileAnswers } from '@/lib/profile/normalize'
import type { Profile, TimezoneSource } from '@/lib/db/types'

/**
 * The lib/db/queries/ convention, binding on all nine other features:
 *
 * 1. One file per resource.
 * 2. Every file starts with `import 'server-only'`.
 * 3. Every function touching user data takes `userId` as its FIRST parameter,
 *    and every WHERE clause includes it. There is no ambient current user here.
 * 4. Functions return plain rows / arrays / null. No Response, no redirect, no
 *    throwing for control flow. Callers decide the HTTP shape.
 * 5. Components and route handlers do not build Drizzle queries inline.
 * 6. Anything writing more than one table wraps in db.transaction().
 *
 * F7 owns this table. Nothing else reads or writes `profiles` except
 * `queries/cards.ts`, which selects two columns for the day boundary.
 */

export async function getProfile(userId: string): Promise<Profile | null> {
  const [row] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1)
  return row ?? null
}

/** Total by construction: every user gets a row at createUser. Never null. */
export async function getUserTimezone(userId: string): Promise<string> {
  const p = await getProfile(userId)
  return p?.timezone ?? FALLBACK_TIMEZONE
}

/**
 * Idempotent. Called from the Auth.js createUser event and from the timezone
 * route, which may be the first thing a brand-new session touches.
 *
 * `onboardedAt` is deliberately left null: creating a row must never onboard
 * anyone, or the gate would be passable by hitting an API route.
 */
export async function ensureProfile(userId: string, timezone?: string): Promise<void> {
  await db
    .insert(profiles)
    .values(timezone ? { userId, timezone } : { userId })
    .onConflictDoNothing()
}

export async function upsertProfile(
  userId: string,
  patch: Partial<Omit<Profile, 'userId' | 'createdAt'>>,
): Promise<Profile> {
  const [row] = await db
    .insert(profiles)
    .values({ userId, ...patch })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: { ...patch, updatedAt: new Date() },
    })
    .returning()
  return row
}

/* --------------------------------- Timezone --------------------------------- */

export type SetTimezoneResult = {
  timezone: string
  source: TimezoneSource
  updated: boolean
}

/**
 * Apply F7 §7's override table in one guarded UPDATE.
 *
 * | stored source | request  | action                                    |
 * |---------------|----------|-------------------------------------------|
 * | detected      | auto     | update zone, keep `detected`               |
 * | detected      | manual   | update zone, set `manual`                  |
 * | manual        | auto     | **ignore** — a human already corrected this |
 * | manual        | manual   | update zone, keep `manual`                 |
 *
 * The guard lives in the WHERE clause rather than in a read-then-write, so two
 * devices syncing at once cannot slip a detected value past a manual row. The
 * preceding SELECT is only there to report `updated` honestly.
 */
export async function setTimezone(
  userId: string,
  timezone: string,
  manual: boolean,
): Promise<SetTimezoneResult> {
  await ensureProfile(userId, timezone)

  const [before] = await db
    .select({ timezone: profiles.timezone, source: profiles.timezoneSource })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1)

  const [after] = await db
    .update(profiles)
    .set({
      timezone,
      ...(manual ? { timezoneSource: 'manual' as const } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(profiles.userId, userId),
        // An automatic sync may only touch a row that has not been corrected
        // by hand. A manual request may touch anything.
        manual ? undefined : ne(profiles.timezoneSource, 'manual'),
      ),
    )
    .returning({ timezone: profiles.timezone, source: profiles.timezoneSource })

  if (!after) {
    // Blocked by the manual guard. The stored value is the answer, and it is a
    // 200: the caller did nothing wrong and has nothing to retry.
    return {
      timezone: before?.timezone ?? timezone,
      source: before?.source ?? 'manual',
      updated: false,
    }
  }

  return {
    ...after,
    updated: before?.timezone !== after.timezone || before?.source !== after.source,
  }
}

/* ------------------------------- The five answers --------------------------- */

/**
 * Partial update from /profile/edit. Only the keys present are written.
 *
 * An UPDATE and not an upsert, deliberately: the only caller is the edit route,
 * which has already established the user is onboarded and therefore has a row.
 * Returning null rather than creating one keeps the edit surface from being a
 * way to bring a profile into existence — that is `ensureProfile`'s job.
 *
 * **Never touches `onboarded_at`.** A user editing their answers is already
 * onboarded, and clearing the column would throw them back into the flow.
 */
export async function updateProfileAnswers(
  userId: string,
  answers: Partial<ProfileAnswers>,
): Promise<Profile | null> {
  const [row] = await db
    .update(profiles)
    .set({ ...answers, updatedAt: new Date() })
    .where(eq(profiles.userId, userId))
    .returning()
  return row ?? null
}

/* --------------------------------- Birthday --------------------------------- */

/**
 * Record the answer to the one question that is not one of the five — or record
 * that it was put and declined.
 *
 * **`birthday_asked_at` is written on every call, including `null`.** That is the
 * whole point: the timestamp is what turns "asked and declined" into a distinct
 * state from "never asked", and without it the gate re-asks a skipping user for
 * ever. `now()` in SQL rather than a JS `Date`, on the F10 precedent — the app's
 * clock and Neon's are not the same clock, and every timestamp this schema writes
 * comes from the database.
 *
 * An UPDATE and not an upsert, like `updateProfileAnswers`: both callers are past
 * the onboarding gate and therefore have a row, and this must not become a second
 * way to bring a profile into existence.
 *
 * **Never touches `badges_awarded`.** A birthday moved from date A to date B
 * leaves every award already made standing, and a card on date B later inserts a
 * second row and takes the count to two. That rule is a property of doing nothing
 * here, and `evaluateBadges` documents the one path — `--prune` — that could
 * undo it.
 */
export async function setBirthday(
  userId: string,
  birthday: string | null,
): Promise<Profile | null> {
  const [row] = await db
    .update(profiles)
    .set({ birthday, birthdayAskedAt: sql`now()`, updatedAt: new Date() })
    .where(eq(profiles.userId, userId))
    .returning()
  return row ?? null
}

/**
 * The birthday alone, for the two badge paths.
 *
 * A column read rather than `getProfile`, because both callers are counting rows
 * in a loop and neither wants the interests array. `null` covers three cases the
 * badge treats identically: no profile, no answer, and declined.
 */
export async function getBirthday(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ birthday: profiles.birthday })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1)
  return row?.birthday ?? null
}

export type CompleteOnboardingResult = {
  onboardedAt: Date
  alreadyOnboarded: boolean
}

/**
 * The single write that ends onboarding: all five answers, the timezone, and
 * `onboarded_at`, in one transaction.
 *
 * `COALESCE(onboarded_at, now())` is what makes a double-submit idempotent and
 * preserves the original completion time — the response reports
 * `alreadyOnboarded` from the row that was there before.
 *
 * The timezone is resolved in TypeScript rather than with a SQL `COALESCE`
 * because the insert path needs a non-null value for a NOT NULL column, and
 * `COALESCE(EXCLUDED.timezone, profiles.timezone)` would then always pick the
 * fallback and clobber a good stored zone on the update path.
 */
export async function completeOnboarding(
  userId: string,
  answers: ProfileAnswers,
  requestedTimezone: string | undefined,
): Promise<CompleteOnboardingResult> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ timezone: profiles.timezone, onboardedAt: profiles.onboardedAt })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1)

    const timezone = requestedTimezone ?? existing?.timezone ?? FALLBACK_TIMEZONE
    const now = new Date()

    const [row] = await tx
      .insert(profiles)
      .values({ userId, timezone, ...answers, onboardedAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: profiles.userId,
        set: {
          ...answers,
          timezone,
          // First write wins on the timestamp; last write wins on the answers.
          //
          // `now()` and not the JS `now` above: interpolating a `Date` into a
          // `sql` template hands postgres.js an unmapped parameter and the query
          // fails with ERR_INVALID_ARG_TYPE. Only a column reference or a SQL
          // function belongs inside this template.
          onboardedAt: sql`coalesce(${profiles.onboardedAt}, now())`,
          updatedAt: now,
        },
      })
      .returning({ onboardedAt: profiles.onboardedAt })

    return {
      onboardedAt: row?.onboardedAt ?? existing?.onboardedAt ?? now,
      alreadyOnboarded: existing?.onboardedAt != null,
    }
  })
}
