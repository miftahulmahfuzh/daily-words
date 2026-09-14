import "server-only";
import {
  countActiveWords,
  getCardForDate,
  resolveTimezone,
} from "@/lib/db/queries/cards";
import {
  claimDelivery,
  deleteDeadSubscription,
  listDeliveredSlots,
  listReminderCandidates,
  markDeliveryFailed,
  type PushTarget,
  type ReminderCandidate,
} from "@/lib/db/queries/push";
import { reminderFor, type Reminder } from "@/lib/push/reminders";
import { dueSlot } from "@/lib/push/schedule";
import { sendPush, type PushOutcome, type PushPayload } from "@/lib/push/send";
import { localDateNow, localHour, type LocalDate } from "@/lib/time/local-date";

/**
 * The tick. **This is the scheduler `src/app/api/cards/route.ts` told you to
 * stop before writing — and it stops exactly where that instruction aimed.**
 *
 * That file's rule is "no cron, no revalidate, no creation on page load, no
 * 'make it for them if they haven't by 9pm'", because the deliberate press is
 * the exercise. Nothing here presses it. This module reads three things about a
 * user and, at most once per two-hour slot, puts a sentence on their lock screen
 * pointing at the button. It imports no card writer, no gamification hook and no
 * transaction; `npm run push:db` greps this directory to keep it that way.
 *
 * Everything about a "day" and an "hour" here goes through
 * `lib/time/local-date.ts`, in the user's own zone, exactly as `/today` and
 * `POST /api/cards` do. The server's clock decides nothing but *when the tick
 * ran*.
 *
 * One reporting note, because it looks like an oversight and is not: the summary
 * reports the run instant as epoch milliseconds rather than as a formatted
 * string. This app reserves ISO instant serialisation to eight named files and
 * `npm run share:check` asserts that list over the whole of `src/`; a formatted
 * timestamp here would turn that check red for a reason its message would not
 * explain. The consumer is a GitHub Actions log, which timestamps every line of
 * its own.
 */

/**
 * Where a tapped notification lands. A **bare path**: the service worker resolves
 * it against its own origin, which is the only origin it can be registered on.
 * An absolute URL here would be a second place for `APP_URL` to be wrong, and
 * the failure would be a notification that opens somebody else's site.
 */
export const REMINDER_URL = "/today";

/**
 * One notification on the lock screen, ever — replaced rather than stacked.
 *
 * iOS coalesces notifications sharing a `tag`, so 11:00's line takes the place
 * of 09:00's instead of building a pile the user swipes away in one gesture
 * without reading.
 *
 * **Constant, not per-day.** A `dw-card-<localDate>` tag was the first draft and
 * collapses within a day just as well; what it also does is let *yesterday's*
 * undismissed reminder survive beside today's — and yesterday's card can no
 * longer be made, so that is a notification asking for something impossible. A
 * constant collapses across the midnight boundary too.
 *
 * `public/sw.js` holds this same string as its `FALLBACK.tag` and pairs it with
 * `renotify: true`, without which a tagged replacement arrives silently and the
 * phone would buzz at 07:00 and never again.
 *
 * Not to be confused with `lib/push/send.ts`'s `topic` (`'daily-card'`), which
 * collapses messages still queued at the push service. Different layer.
 */
export const REMINDER_TAG = "daily-card-reminder";

export type TickOutcome =
  /** The profile's zone is unusable. Nothing sent, nothing written. */
  | "no_timezone"
  /** Today's card exists. The day is quiet, and no row records the silence. */
  | "quiet"
  /** Outside the window, or this slot is already recorded. */
  | "no_slot"
  /** A slot was due but no card can be made, so there is nothing honest to say. */
  | "no_active_words"
  /** Another tick claimed this slot first. */
  | "duplicate"
  | "sent"
  /** A slot was claimed and every send failed. The row says so. */
  | "failed";

/** Injectable for `npm run push:db`, which must assert the fan-out offline. */
export type PushSender = (
  target: PushTarget,
  payload: PushPayload,
) => Promise<PushOutcome>;

/**
 * `now` is injectable for the same reason `encodeClaimIntent`'s `nowSeconds` is:
 * there is no clock in this module's contract, and the catch-up assertions would
 * otherwise have to wait two hours.
 */
export type TickOptions = { now?: Date; send?: PushSender };

export type TickUserResult = {
  userId: string;
  outcome: TickOutcome;
  localDate: LocalDate | null;
  slot: number | null;
  supersededSlots: number[];
  notificationsSent: number;
  subscriptionsPruned: number;
  reason: string | null;
};

export type TickSummary = {
  /** When the tick ran, as epoch milliseconds. See the note at the top. */
  ranAtMs: number;
  durationMs: number;
  candidates: number;
  outcomes: Record<TickOutcome, number>;
  notificationsSent: number;
  subscriptionsPruned: number;
};

/**
 * The title and body come from Phase 1's deck; the url and tag are fixed.
 *
 * **It takes the `Reminder`, not `(localDate, slot)`.** The caller has to hold
 * the reminder anyway — `reminder.key` is what goes into
 * `push_deliveries.reminder_key`, and `push_deliveries_reminder_key_check`
 * refuses a `'sent'` row without it. Taking the slot here instead would let a
 * caller build a payload and forget the key, which is a runtime `23514` rather
 * than a type error.
 */
export function pushPayloadFor(reminder: Reminder): PushPayload {
  return {
    title: reminder.title,
    body: reminder.body,
    url: REMINDER_URL,
    tag: REMINDER_TAG,
  };
}

/**
 * One user, one decision. Never throws for a reason the caller can do anything
 * about — `runTick` catches anyway, because one user's bad row must not silence
 * everybody else's reminders.
 */
export async function tickUser(
  candidate: ReminderCandidate,
  options: TickOptions = {},
): Promise<TickUserResult> {
  const now = options.now ?? new Date();
  const send = options.send ?? sendPush;
  const userId = candidate.userId;

  const blank = {
    userId,
    localDate: null as LocalDate | null,
    slot: null as number | null,
    supersededSlots: [] as number[],
    notificationsSent: 0,
    subscriptionsPruned: 0,
    reason: null as string | null,
  };

  /**
   * 1. **Reads may fall back to a default zone; writes may not** — and a
   *    notification is a write, in the only sense that matters here. It lands
   *    on a lock screen, it cannot be recalled, and one dated by a guessed zone
   *    is the notification equivalent of the card `POST /api/cards` refuses to
   *    make with a 409. So: send nothing, write nothing, log it.
   */
  const timezone = resolveTimezone({ timezone: candidate.timezone });
  if (!timezone.ok) {
    console.warn("[push/tick] unusable timezone — sending nothing", {
      userId,
      reason: timezone.reason,
    });
    return { ...blank, outcome: "no_timezone", reason: timezone.reason };
  }
  const tz = timezone.timezone;

  /** 2. The user's day and the user's hour. Never the server's. */
  const localDate = localDateNow(tz, now);
  const hour = localHour(now, tz);

  /**
   * 3. **The card exists: return immediately, with no row of any kind.**
   *    Silence is the whole feature. A day's worth of `'skipped'` rows for a
   *    user who did the thing is noise in a table whose only job is to answer
   *    "did we bother them?".
   */
  const card = await getCardForDate(userId, localDate);
  if (card) return { ...blank, outcome: "quiet", localDate };

  /**
   * 5 (before 4 — see the plan's Step 1). A `'skipped'` row needs a slot to be
   * recorded against, so the slot is resolved first. Every status counts as
   * delivered: a `'failed'` row holds its slot rather than being retried into a
   * duplicate an hour later, which is what `markDeliveryFailed` downgrading
   * rather than deleting buys.
   */
  const delivered = await listDeliveredSlots(userId, localDate);
  const due = dueSlot({ localHour: hour, delivered });
  if (!due) return { ...blank, outcome: "no_slot", localDate };

  const { slot, superseded } = due;

  /**
   * 4. No active words means the card *cannot* be made, so "make today's card"
   *    would be a lie. Record the skip so the slot is spent and the user is not
   *    asked again two hours later about a card they still cannot make.
   */
  const activeWords = await countActiveWords(userId);
  if (activeWords === 0) {
    await claimDelivery({
      userId,
      localDate,
      slot,
      status: "skipped",
      reason: "no_active_words",
    });
    await recordSuperseded(userId, localDate, superseded);
    return {
      ...blank,
      outcome: "no_active_words",
      localDate,
      slot,
      supersededSlots: [...superseded],
      reason: "no_active_words",
    };
  }

  /**
   * The line, resolved **before** the claim, because its `key` is part of the
   * row being claimed. `push_deliveries_reminder_key_check` refuses a
   * `status = 'sent'` row whose `reminder_key` is null, so a claim that does not
   * carry it is a `23514` at 07:00 rather than a type error at build time.
   *
   * `reminderFor` is total over `REMINDER_SLOTS` and `slot` came out of
   * `dueSlot`, so the null arm is unreachable — Phase 1's `push:check` asserts
   * exactly that. It is narrowed rather than asserted away because a `null` here
   * must mean silence, never a throw on a path whose job is to be quiet.
   */
  const reminder = reminderFor(localDate, slot);
  if (!reminder) {
    console.error("[push/tick] no deck line for slot — sending nothing", { userId, slot });
    return { ...blank, outcome: "no_slot", localDate, slot };
  }

  /**
   * **D5: the row is written before the send, and it is a claim rather than a
   * receipt.** Same discipline as F6's `UPDATE … WHERE turn_count < 8` taken
   * *before* the model call, and F9's `onConflictDoNothing` badge inserts: the
   * unique index on `(user_id, local_date, slot)` is the guard, never a
   * read-then-write. Two overlapping ticks — a late scheduled run meeting a
   * manual `workflow_dispatch` — are then safe by arithmetic.
   *
   * Which way to fail is a real choice, and it is made here in favour of the
   * missed notification: a duplicate lock-screen buzz for a word the user has
   * already been asked about is the failure that teaches somebody to turn
   * reminders off, and the next slot is two hours away.
   */
  const claimed = await claimDelivery({
    userId,
    localDate,
    slot,
    status: "sent",
    reminderKey: reminder.key,
  });
  if (!claimed) return { ...blank, outcome: "duplicate", localDate, slot };

  await recordSuperseded(userId, localDate, superseded);

  const payload = pushPayloadFor(reminder);

  /**
   * The devices come **with** the candidate — `listReminderCandidates()` returns
   * them in the same object as the timezone, so there is no second query per
   * user here. That is one fewer Neon round trip per candidate in an hourly job,
   * which is the axis CLAUDE.md's `sin1` section says to count.
   */
  const targets = candidate.targets;

  let sent = 0;
  let pruned = 0;
  const errors: string[] = [];

  for (const target of targets) {
    const outcome = await send(target, payload);

    if (outcome.ok) {
      sent++;
      continue;
    }

    /**
     * iOS rotates and revokes endpoints, so a 404/410 is the normal end of a
     * subscription's life rather than a fault of this tick. Delete the row and
     * carry on — `<PushSync/>` re-subscribes the device on its next app open.
     *
     * `userId` first, like everything else in `queries/push.ts`: the caller is a
     * machine but it is holding the id, so `listReminderCandidates()` stays that
     * file's only function without one.
     */
    if (outcome.reason === "gone") {
      await deleteDeadSubscription(userId, target.endpoint);
      pruned++;
      continue;
    }

    // `PushOutcome` carries no `message` on any arm — the detail is already in
    // `send.ts`'s log line, and the endpoint is a bearer capability that must
    // not be echoed. What goes in the row is the classification and, where there
    // is one, the status.
    errors.push(
      outcome.reason === "unconfigured"
        ? "push is not configured"
        : outcome.reason === "rejected"
          ? `rejected ${outcome.status}`
          : "transport failure",
    );
  }

  if (sent === 0) {
    const reason = (
      errors[0] ??
      (pruned > 0 ? "every endpoint was gone" : "no subscriptions")
    ).slice(0, 500);
    /**
     * **Downgrade, never delete.** The row keeps the slot, so the next hourly
     * tick's `dueSlot` sees it as delivered and moves on. That is D5's stated
     * cost taken deliberately: a transient failure is one missed reminder out of
     * seven, where a released slot would retry and risk a duplicate buzz two
     * hours later — the failure that teaches somebody to turn reminders off.
     */
    await markDeliveryFailed(userId, localDate, slot, reason);
    console.error("[push/tick] nothing delivered", { userId, localDate, slot, pruned, reason });
    return {
      ...blank,
      outcome: "failed",
      localDate,
      slot,
      supersededSlots: [...superseded],
      subscriptionsPruned: pruned,
      reason,
    };
  }

  return {
    ...blank,
    outcome: "sent",
    localDate,
    slot,
    supersededSlots: [...superseded],
    notificationsSent: sent,
    subscriptionsPruned: pruned,
  };
}

/**
 * Spend the slots this tick caught up past, so a run that is four hours late
 * delivers the *current* line once rather than a burst of four.
 */
async function recordSuperseded(
  userId: string,
  localDate: LocalDate,
  slots: readonly number[],
): Promise<void> {
  for (const slot of slots) {
    await claimDelivery({
      userId,
      localDate,
      slot,
      status: "skipped",
      reason: "superseded",
    });
  }
}

/**
 * The fan-out. Sequential on purpose — see the plan's D8 for the ceiling this
 * has and what to do past it. Neon's free tier has a small connection ceiling
 * and this is not a job worth racing.
 *
 * The run instant is reported as epoch milliseconds. See the note at the top of
 * the file: this app reserves ISO instant serialisation to eight named files and
 * `npm run share:check` asserts that list over the whole of `src/` reading raw
 * text, comments included.
 */
export async function runTick(options: TickOptions = {}): Promise<TickSummary> {
  const startedAt = Date.now();
  const now = options.now ?? new Date();

  const outcomes: Record<TickOutcome, number> = {
    no_timezone: 0,
    quiet: 0,
    no_slot: 0,
    no_active_words: 0,
    duplicate: 0,
    sent: 0,
    failed: 0,
  };
  let notificationsSent = 0;
  let subscriptionsPruned = 0;

  const candidates = await listReminderCandidates();

  for (const candidate of candidates) {
    try {
      const result = await tickUser(candidate, { now, send: options.send });
      outcomes[result.outcome]++;
      notificationsSent += result.notificationsSent;
      subscriptionsPruned += result.subscriptionsPruned;
    } catch (err) {
      // One user's bad row must never silence everybody else's reminders.
      console.error("[push/tick] user failed", { userId: candidate.userId, err });
      outcomes.failed++;
    }
  }

  return {
    ranAtMs: now.getTime(),
    durationMs: Date.now() - startedAt,
    candidates: candidates.length,
    outcomes,
    notificationsSent,
    subscriptionsPruned,
  };
}
