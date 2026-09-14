/**
 * When a reminder is due, and the one rule that turns a tick into at most one
 * notification.
 *
 * **Pure, and it imports nothing at all.** That is the same property
 * `lib/share/policy.ts` keeps, for the same reason: three very different
 * processes read this module — the tick (a Node route handler), the scheduler's
 * own reasoning, and `npm run push:check` (a bare tsx process with no
 * environment and no network) — and a single import of `server-only`, zod or
 * `node:crypto` would break at least one of them. What is asserted offline is
 * then literally the code that runs on the request.
 *
 * **There is no clock here.** `localHour` arrives as an argument, computed by
 * `lib/time/local-date.ts` in the *user's* zone, because that module is the only
 * place in this app allowed to construct an `Intl.DateTimeFormat`. A
 * `new Date()` in this file would compute 07:00 in Vercel's UTC, which is 14:00
 * in Jakarta — the exact failure the day-boundary contract exists to prevent,
 * and one that nothing would throw on.
 */

/**
 * The user's sentence, in three numbers:
 *
 *   > "start from 7 am in the morning, then send a new one every 2 hours until 8 pm"
 *
 * Written as constants rather than as a hand-typed `[7, 9, 11, …]` so that the
 * sentence is what the code says, and so that changing one number changes the
 * schedule rather than requiring someone to re-derive an array by hand.
 */
export const REMINDER_FIRST_HOUR = 7;
export const REMINDER_EVERY_HOURS = 2;

/**
 * **A bound on the window, not a slot.** "Until 8 pm" closes the day at 20:00;
 * the last two-hour step that lands inside it is 19:00.
 *
 * The bound is exclusive by choice — and with these three numbers the choice is
 * not observable, because no step from 07:00 lands on 20:00 at all. `<` and
 * `<=` would produce the same seven slots here, which is precisely why
 * `push:check` asserts `deriveReminderSlots` against *other* triples as well.
 * A derivation that is only ever tested on the one input it was written for is
 * not tested.
 */
export const REMINDER_UNTIL_HOUR = 20;

/**
 * The slots for an arbitrary triple, exported so the derivation can be asserted
 * independently of the three numbers above.
 *
 * Defensive rather than clever: a non-positive step would loop forever, and an
 * hour outside 0–23 is not an hour. Both answer with an empty schedule, which
 * is "send nothing" — the only safe failure for a feature whose output lands on
 * a stranger's lock screen.
 */
export function deriveReminderSlots(
  firstHour: number,
  everyHours: number,
  untilHour: number,
): number[] {
  if (!Number.isInteger(firstHour) || firstHour < 0 || firstHour > 23) return [];
  if (!Number.isInteger(everyHours) || everyHours < 1) return [];
  if (!Number.isInteger(untilHour)) return [];
  const slots: number[] = [];
  for (let h = firstHour; h < untilHour && h <= 23; h += everyHours) slots.push(h);
  return slots;
}

/** `[7, 9, 11, 13, 15, 17, 19]` — seven of them, derived, never typed out. */
export const REMINDER_SLOTS: readonly number[] = Object.freeze(
  deriveReminderSlots(REMINDER_FIRST_HOUR, REMINDER_EVERY_HOURS, REMINDER_UNTIL_HOUR),
);

/** Exactly a member of `REMINDER_SLOTS`, and nothing else shaped like one. */
export function isReminderSlot(value: unknown): value is number {
  return typeof value === "number" && REMINDER_SLOTS.includes(value);
}

/**
 * One slot to send, and the slots that sending it passes over.
 *
 * `superseded` is never empty by accident: it is what `push_deliveries` records
 * as `'skipped'`, so that a slot that was missed is *closed* rather than left
 * looking outstanding for the rest of the day.
 */
export type DueSlot = {
  readonly slot: number;
  readonly superseded: readonly number[];
};

/**
 * The catch-up rule: **the greatest slot the user's local clock has reached that
 * has not been delivered**, plus every earlier undelivered slot, which is
 * thereby passed over.
 *
 * This is the decision that makes the choice of scheduler not load-bearing. A
 * tick that runs late, or a tick that never ran at all between 09:00 and 15:00,
 * delivers the 15:00 line once — not a burst of four notifications at 15:01,
 * which is how a naive "send every slot you owe" resolver behaves after any
 * outage and is the single most likely way this feature becomes something the
 * user turns off. A scheduler that fires twice in the same hour is likewise
 * harmless, because the second call finds the slot already delivered and
 * answers null.
 *
 * Returns `null` when nothing is due: before the first slot of the day, and
 * after every reached slot has a delivery row. `delivered` may contain
 * duplicates, values that are not slots at all, and slots from a different day —
 * all of them are simply not in the reached set, or already handled by the Set.
 *
 * A `localHour` that is NaN, negative, fractional or out of range answers null,
 * because no slot compares less than or equal to it. That is deliberate: the
 * failure mode of a bad hour is silence, never a 03:00 notification.
 */
export function dueSlot({
  localHour,
  delivered,
}: {
  localHour: number;
  delivered: Iterable<number>;
}): DueSlot | null {
  const done = new Set(delivered);
  const outstanding = REMINDER_SLOTS.filter((s) => s <= localHour && !done.has(s));
  if (outstanding.length === 0) return null;
  return {
    slot: outstanding[outstanding.length - 1],
    superseded: outstanding.slice(0, -1),
  };
}
