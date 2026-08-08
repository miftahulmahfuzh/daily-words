import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { profiles } from '@/lib/db/schema'
import { DEFAULT_TIMEZONE } from '@/lib/time/local-date'
import type { Profile } from '@/lib/db/types'

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
 */

export async function getProfile(userId: string): Promise<Profile | null> {
  const [row] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1)
  return row ?? null
}

/** Total by construction: every user gets a row at createUser. Never null. */
export async function getUserTimezone(userId: string): Promise<string> {
  const p = await getProfile(userId)
  return p?.timezone ?? DEFAULT_TIMEZONE
}

/** Idempotent. Called from the Auth.js createUser event. */
export async function ensureProfile(userId: string): Promise<void> {
  await db.insert(profiles).values({ userId }).onConflictDoNothing()
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
