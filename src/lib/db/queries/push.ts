import 'server-only'
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { profiles, pushDeliveries, pushSubscriptions } from '@/lib/db/schema'

/**
 * F30's two tables. The `lib/db/queries/` convention is stated in full in
 * `queries/profiles.ts`; the rules that bite here are 3 and 4 — `userId` first
 * and in every WHERE clause, and plain values out, no Response and no throwing
 * for control flow.
 *
 * **This file contains the second function in the application that reads rows
 * without a user id**, and the first that reads rows belonging to *many* users.
 * `queries/shares.ts` holds the other one and its header is the model for this
 * one. `listReminderCandidates()` is at the bottom, documented in place, and it
 * is the only exception: the other seven functions here take `userId` first and
 * put it in the WHERE clause, because subscribing, unsubscribing and recording a
 * delivery are all acts performed on behalf of one identified person.
 *
 * Every function returns a hand-named shape rather than a row. That is
 * `getShareBySlug`'s rule applied to a different table, and it is what makes the
 * cross-user read safe against a column somebody adds to `profiles` next year:
 * it is not possible for these functions to return one, which is a stronger
 * guarantee than remembering not to select it.
 */

/**
 * A device, as the sender sees it. Four fields, and there is no fifth.
 *
 * `p256dh` and `auth` are the browser's ECDH public key and the shared auth
 * secret from `PushSubscription.toJSON().keys` — RFC 8291's two inputs to
 * payload encryption. They are not credentials of the *user*; they are what
 * makes the body unreadable to Apple.
 */
export type PushTarget = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

/** What `POST /api/push/subscription` has after zod is done with the body. */
export type NewSubscriptionInput = {
  endpoint: string
  p256dh: string
  auth: string
  /**
   * Diagnostic only, and nullable. "Which of my devices is this row?" is
   * otherwise unanswerable from an opaque endpoint URL, and the answer matters
   * the first time a notification arrives twice.
   */
  userAgent: string | null
}

/**
 * Register a device, or re-register the one that is already there.
 *
 * **Conflict is on `endpoint` alone, not on `(user_id, endpoint)`, and the
 * update reassigns `user_id`.** A push endpoint names one browser install. If a
 * second account signs into the same installed PWA, the row must *move* to
 * whoever is signed in now — leaving the old one would send the previous user's
 * reminders to a phone that is somebody else's session, and neither of them
 * could see why. The unique index in the schema is what makes that mechanical
 * rather than a thing this function remembers to do.
 *
 * Idempotent, which is what lets `<PushSync />` post the same endpoint on any
 * navigation without checking first, and what makes a double-tapped switch
 * harmless.
 *
 * `lastSeenAt` is written with SQL `now()` rather than `new Date()`, the rule
 * `queries/journal.ts` records: app-to-Neon clock skew otherwise decides
 * comparisons nobody intended it to decide.
 */
export async function upsertSubscription(
  userId: string,
  input: NewSubscriptionInput,
): Promise<PushTarget> {
  const [row] = await db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent,
        lastSeenAt: sql`now()`,
      },
    })
    .returning({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
  return row
}

/**
 * Turning reminders off on one device. Scoped by `userId`, so an endpoint that
 * belongs to somebody else's row is a no-op rather than a deletion.
 *
 * Returns the number of rows removed, which is 1 or 0 and which the route
 * deliberately does not translate into a 404 — see the route's comment. Other
 * devices are untouched: the switch is per-device because the permission is.
 */
export async function deleteSubscription(userId: string, endpoint: string): Promise<number> {
  const rows = await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
    .returning({ id: pushSubscriptions.id })
  return rows.length
}

/**
 * This user's devices. Written for `npm run push:send` (Phase 4) and for any
 * future "you have reminders on 2 devices" line; nothing in this phase renders
 * it.
 *
 * Ordered oldest first so two runs of a diagnostic script list them the same way.
 */
export async function listSubscriptions(userId: string): Promise<PushTarget[]> {
  return db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .orderBy(asc(pushSubscriptions.createdAt))
}

/**
 * The 404/410 sweep. **iOS rotates and revokes push endpoints**, so a
 * subscription that worked last week answers `410 Gone` and will answer it
 * forever; the correct response is to delete the row, never to retry.
 *
 * `userId` first, like everything else here, even though the caller is a machine
 * — the plan index called this `deleteSubscriptionByEndpoint(endpoint)` and a
 * second no-user-id function is a thing worth not having. The caller is holding
 * the id already: `listReminderCandidates()` handed the endpoint and the user id
 * over in the same object.
 *
 * The narrow window where that matters is real rather than theoretical: if the
 * row was reassigned to another account between the listing and the send, this
 * deletes nothing instead of deleting a stranger's row. That endpoint is dead
 * either way and their own next send collects it.
 */
export async function deleteDeadSubscription(userId: string, endpoint: string): Promise<boolean> {
  const rows = await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
    .returning({ id: pushSubscriptions.id })
  return rows.length > 0
}

/* ------------------------------ Delivery records ---------------------------- */

/**
 * Take the slot, **before sending anything**.
 *
 * This is the chat's turn-cap discipline, which CLAUDE.md states as a rule: the
 * conditional write is taken *before* the expensive call, never after. There it
 * is `UPDATE … WHERE turn_count < 8`; here it is an INSERT against
 * `push_deliveries_user_date_slot_uniq`, and in both cases the database is what
 * refuses the second one, not application code.
 *
 * Returns true if this caller now owns `(user, local date, slot)` and should
 * send; false if somebody already did. Two ticks racing — an hourly schedule
 * that fired twice, a retried webhook, two instances — produce one notification
 * between them, and neither of them had to read first.
 *
 * `localDate` is a `LocalDate` ('YYYY-MM-DD') computed in **the user's** zone by
 * the caller. This file does no date arithmetic and constructs no
 * `Intl.DateTimeFormat`; all of that lives in `lib/time/local-date.ts`.
 */
export type DeliveryStatus = 'sent' | 'skipped' | 'failed'

export type ClaimDeliveryInput = {
  userId: string
  localDate: string
  slot: number
  status: DeliveryStatus
  /**
   * Which line of the deck went out. **Mandatory for `status: 'sent'`** —
   * `push_deliveries_reminder_key_check` refuses the row without it, and that is
   * a `23514` at 07:00 rather than a type error at build time. Null for a
   * `'skipped'` row, because nothing was chosen.
   */
  reminderKey?: string | null
  /** `'superseded'`, `'no_active_words'`, or a transport detail. Never rendered. */
  reason?: string | null
}

export async function claimDelivery(input: ClaimDeliveryInput): Promise<boolean> {
  const rows = await db
    .insert(pushDeliveries)
    .values({
      userId: input.userId,
      localDate: input.localDate,
      slot: input.slot,
      status: input.status,
      reminderKey: input.reminderKey ?? null,
      reason: input.reason ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: pushDeliveries.id })
  return rows.length > 0
}

/**
 * Downgrade a claimed row to `'failed'` after not one device accepted the push.
 *
 * **The row stays, and that is the decision.** An earlier draft of this file
 * deleted it instead, so the next hourly tick would find the slot outstanding
 * and try again through the catch-up path. That loses to Phase 1's schema and to
 * Phase 4's D5: `'failed'` is a first-class status in `push_deliveries` with a
 * CHECK constraint contemplating it, the slot is *spent*, and the cost is stated
 * plainly rather than hidden — a transient failure is **one missed reminder**,
 * never a duplicate buzz two hours later. With seven slots in a day, missing one
 * is the cheap mistake; a duplicate is the one that teaches somebody to turn
 * reminders off.
 *
 * Matches on the unique key, so it cannot touch another slot or another day.
 * `reason` is truncated by the caller; nothing here renders it.
 */
export async function markDeliveryFailed(
  userId: string,
  localDate: string,
  slot: number,
  reason: string,
): Promise<void> {
  await db
    .update(pushDeliveries)
    .set({ status: 'failed', reason })
    .where(
      and(
        eq(pushDeliveries.userId, userId),
        eq(pushDeliveries.localDate, localDate),
        eq(pushDeliveries.slot, slot),
      ),
    )
}

/**
 * Which slots this user has already been sent today, as plain hours.
 *
 * The input to Phase 1's `dueSlot({ localHour, delivered })`, which is what makes
 * a late or missed tick catch up to the right slot instead of firing the whole
 * backlog. Sorted, because a resolver that is order-sensitive should not have to
 * discover that at 07:00.
 */
export async function listDeliveredSlots(userId: string, localDate: string): Promise<number[]> {
  const rows = await db
    .select({ slot: pushDeliveries.slot })
    .from(pushDeliveries)
    .where(and(eq(pushDeliveries.userId, userId), eq(pushDeliveries.localDate, localDate)))
    .orderBy(asc(pushDeliveries.slot))
  return rows.map((r) => r.slot)
}

/* ------------------------- The one cross-user read -------------------------- */

/**
 * A user who might be owed a reminder, and the devices to send it to.
 *
 * Three fields. There is no name, no email, no answer, no birthday and no
 * timestamp, and that is the point — see the function below.
 */
export type ReminderCandidate = {
  userId: string
  /**
   * The raw `profiles.timezone` string, **unresolved and unvalidated**.
   *
   * This function does not call `resolveTimezone` and must not: "reads may fall
   * back, writes may not" is a decision about what the *caller* is doing, and
   * the caller here is about to put something on a lock screen. The tick
   * validates, and a zone it cannot resolve is a user it does not send to.
   */
  timezone: string
  targets: PushTarget[]
}

/**
 * **The second function in this application that reads rows without a user id,
 * and the first that crosses users.** Read `queries/shares.ts`'s header before
 * this one; the shape of the argument is the same and the safety property is
 * not.
 *
 * There, what replaces `userId` is the slug: 80 bits of capability that exists
 * only because the owner tapped Share. There is no slug here. What replaces
 * `userId` is that **the caller is not a request-bound user at all** — it is
 * `POST /api/push/tick`, an endpoint with no session, reached by an hourly
 * machine holding `CRON_SECRET`, whose entire job is to ask a question about
 * every subscribed person at once. A per-user API cannot express that question,
 * and faking one by looping over a list of user ids obtained some other way just
 * moves the same read somewhere with less documentation.
 *
 * The second half of the safety property is the return shape, and it is the half
 * that has to be defended in review: **this returns three fields, hand-named,
 * and can never return a fourth.** No `select()`, no join that reaches past
 * `profiles.timezone`, no row type imported from `db/types.ts` that would grow a
 * column when somebody adds one. It cannot become a general user dump by
 * accident; making it one takes an edit to this function, in this file, under
 * this comment.
 *
 * What it deliberately does **not** answer, because those answers are the tick's
 * and need the user's own local date: whether today's card already exists,
 * whether the user has any active words, which slot is due, and whether the zone
 * is usable. This function's whole question is "who has a device and what is
 * their zone".
 *
 * `INNER JOIN profiles` and `onboarded_at IS NOT NULL` are belt-and-braces: a
 * subscription can only be created from `/profile/edit`, which is inside the
 * `(app)` group and therefore already past `requireOnboardedUser()`. It costs
 * one indexed predicate and it means a half-finished account can never be
 * notified, whatever a future route does.
 *
 * The fold is in JS rather than in SQL (`array_agg`, `json_agg`) because the
 * result set is one row per device — single digits per user, and this is A5's
 * scale, one subscribed user. The ceiling is named in Phase 4; when it is
 * reached the fix is paging this query, not hiding it in Postgres.
 */
export async function listReminderCandidates(): Promise<ReminderCandidate[]> {
  const rows = await db
    .select({
      userId: pushSubscriptions.userId,
      timezone: profiles.timezone,
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .innerJoin(profiles, eq(profiles.userId, pushSubscriptions.userId))
    .where(isNotNull(profiles.onboardedAt))
    .orderBy(asc(pushSubscriptions.userId), asc(pushSubscriptions.createdAt))

  const byUser = new Map<string, ReminderCandidate>()
  for (const row of rows) {
    const existing = byUser.get(row.userId)
    const target: PushTarget = {
      id: row.id,
      endpoint: row.endpoint,
      p256dh: row.p256dh,
      auth: row.auth,
    }
    if (existing) {
      existing.targets.push(target)
    } else {
      byUser.set(row.userId, {
        userId: row.userId,
        timezone: row.timezone,
        targets: [target],
      })
    }
  }
  return [...byUser.values()]
}
