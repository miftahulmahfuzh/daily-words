import { diffLocalDays, type LocalDate } from "@/lib/time/local-date";

/**
 * The reminder copy: forty-three written lines, and the arithmetic that picks
 * one.
 *
 * **A deck, not a model call.** The obvious alternative — ask GLM for a fresh
 * sentence each time — was rejected on three counts, and the third is the one
 * that settles it. It would put an unattended, billable, failure-prone network
 * call on the one path in this app whose entire job is to be quiet and
 * reliable, at seven calls a day forever. It would mean a model reading a
 * user's profile to write a lock-screen string, which is a wider disclosure
 * surface than anything else in the app for the smallest possible payoff. And a
 * deck is *assertable offline* — `npm run push:check` reads every line and
 * proves the properties below — where a model's output can only be sampled.
 *
 * **Partitioned by time of day**, because a line that reads well at 07:00 reads
 * wrong at 19:00: "while the kettle boils" is a joke after dinner, and "the day
 * is closing" is a lie at breakfast. Three bands, one sub-deck each, and the
 * pick never crosses a band.
 *
 * The register is `/profile`'s and `NoCardYet`'s, and the rules are binding:
 * British English, sentence case, no exclamation marks, no emoji, no flattery,
 * and **no streak-threat language of any kind**. `/profile` already refuses to
 * say "your streak is at risk"; a notification is a far worse place to say it.
 * Every line must also be true on a user's very first day and on their four
 * hundredth, so none of them counts anything, congratulates anything, or
 * implies a history — the machine does not know how the day has gone.
 */

/** One written reminder. `key` is what `push_deliveries.reminder_key` records. */
export type Reminder = {
  /** Stable, `[a-z0-9_]`, and the audit trail: which line went out, that slot. */
  readonly key: string;
  readonly title: string;
  readonly body: string;
};

export type ReminderBandName = "morning" | "afternoon" | "evening";

export type ReminderBand = {
  readonly name: ReminderBandName;
  /** A contiguous part of `REMINDER_SLOTS`. The three bands partition it. */
  readonly slots: readonly number[];
  readonly lines: readonly Reminder[];
};

/**
 * iOS truncates a notification title at roughly this width on an XS Max, and a
 * body at roughly the second. These are not validation — nothing accepts input
 * here — they are the ceiling `push:check` holds every written line under, so a
 * line added in a hurry cannot arrive on the phone with its point cut off.
 */
export const REMINDER_TITLE_MAX = 32;
export const REMINDER_BODY_MAX = 90;

/**
 * The day counter's origin. Arbitrary, fixed, and load-bearing only in that it
 * must never move: shifting it rotates every future day's picks, which is
 * invisible and harmless but would make a delivery row's `reminder_key`
 * disagree with what this module would pick for the same date today.
 */
export const REMINDER_EPOCH: LocalDate = "2026-01-01";

const MORNING: readonly Reminder[] = [
  { key: "morning_unmade", title: "Today’s card is unmade", body: "Six words are waiting to be written out." },
  { key: "morning_kettle", title: "While the kettle boils", body: "Six words, one press, and today has a card." },
  { key: "morning_first_light", title: "First light", body: "Nothing was generated overnight. It never is." },
  { key: "morning_asked_for", title: "Cards are asked for", body: "Today’s has not been asked for yet." },
  { key: "morning_short_read", title: "A short read", body: "Six words from your own collection, whenever you want them." },
  { key: "morning_quiet", title: "The quiet part of the day", body: "Today’s card is still sitting there unmade." },
  { key: "morning_collection", title: "Your collection is awake", body: "Six of its words are set aside for today." },
  { key: "morning_no_schedule", title: "Nothing runs on its own", body: "Today’s card exists only once you press for it." },
  { key: "morning_toast", title: "Somewhere near the toast", body: "A card for today is one press away." },
  { key: "morning_unopened", title: "Today is unopened", body: "The card for it has not been made." },
  { key: "morning_two_minutes", title: "Two minutes", body: "That is roughly what six words cost you." },
  { key: "morning_kept_words", title: "Words you chose to keep", body: "Six of them are on the list for today." },
  { key: "morning_before_the_noise", title: "Before the noise starts", body: "Today’s card takes one press and a short read." },
  { key: "morning_still_waiting", title: "Still waiting", body: "Today’s six words have not been drawn yet." },
  { key: "morning_on_the_shelf", title: "On the shelf", body: "Your words are where you left them. Today’s card is not made." },
  { key: "morning_early_enough", title: "Early enough", body: "Today’s card is unmade, and there is plenty of day left." },
];

const AFTERNOON: readonly Reminder[] = [
  { key: "afternoon_half_gone", title: "Half the day is gone", body: "Today’s card has not been made yet." },
  { key: "afternoon_after_lunch", title: "After lunch", body: "Six words are still waiting on today’s card." },
  { key: "afternoon_one_press", title: "One press, six words", body: "Today’s card is waiting for exactly that." },
  { key: "afternoon_between_things", title: "Between two things", body: "Six words fit in the gap. Today’s card is not made." },
  { key: "afternoon_desk", title: "A pause at the desk", body: "Today’s card is a short read, and it is not made yet." },
  { key: "afternoon_queue", title: "In a queue somewhere", body: "Today’s six words are still undrawn." },
  { key: "afternoon_light", title: "Afternoon light", body: "Your collection has six words set aside for today." },
  { key: "afternoon_no_hurry", title: "No hurry", body: "Today’s card will wait, because nothing makes it but you." },
  { key: "afternoon_on_the_way", title: "On the way somewhere", body: "Six words, one press, and today has its card." },
  { key: "afternoon_unread", title: "Unread so far", body: "Today’s card was not generated. It never is, on its own." },
  { key: "afternoon_second_kettle", title: "The second kettle", body: "Six words are waiting on the other side of one press." },
  { key: "afternoon_unclaimed", title: "Six words, unclaimed", body: "Today’s card has not been drawn from your collection." },
  { key: "afternoon_blank_space", title: "Somewhere in the middle", body: "The card for today is still a blank space." },
  { key: "afternoon_five_minutes", title: "Five minutes would do it", body: "Today’s card is six words and a short read." },
  { key: "afternoon_shelf_unchanged", title: "Your shelf is unchanged", body: "Nothing has been added to today. The card is unmade." },
  { key: "afternoon_later_is_fine", title: "Later is fine too", body: "Today’s card keeps. It simply has not been made." },
];

const EVENING: readonly Reminder[] = [
  { key: "evening_day_closing", title: "The day is closing", body: "Today’s card has not been made." },
  { key: "evening_last_light", title: "Last light", body: "The day’s six words are still in the collection." },
  { key: "evening_after_dinner", title: "After dinner", body: "A short read: six words from your own collection." },
  { key: "evening_quiet_again", title: "Quiet again", body: "Today’s card is unmade, and it takes one press." },
  { key: "evening_put_away", title: "Before the day is put away", body: "Six words have not been drawn for today." },
  { key: "evening_nothing_generated", title: "Nothing was generated today", body: "It never is. Today’s card waits for a press." },
  { key: "evening_lamp", title: "Under the lamp", body: "Six words would fit the evening. Today’s card is not made." },
  { key: "evening_no_pressure", title: "No pressure in it", body: "Today’s card is unmade. That is all this is saying." },
  { key: "evening_long_enough", title: "The evening is long enough", body: "Six words from your collection are waiting to be drawn." },
  { key: "evening_end_of_day", title: "End of the day", body: "Today’s card has not been asked for." },
  { key: "evening_one_more", title: "One more quiet thing", body: "Today’s card is unmade. Six words, a short read." },
];

/**
 * **The sub-deck sizes are coprime with their band's slot count, and that is the
 * whole design.**
 *
 * The index is `dayIndex * slots.length + slotIndexWithinBand`, taken modulo
 * `lines.length`. Read across a single day that is three consecutive residues,
 * so the band's three lines are always distinct. Read across days it advances
 * by three, and `gcd(3, 16) = 1` is exactly the condition for a step of three
 * to walk every residue modulo sixteen — so all sixteen morning lines are used,
 * and the morning triple does not repeat for sixteen days. Pick a sub-deck of
 * twelve instead and `gcd(3, 12) = 3`: twelve of the lines become four, the
 * other twelve are never sent, and nothing anywhere fails.
 *
 * **This file deliberately does not import `schedule.ts`.** The three slot
 * arrays below are written out, and `push:check` asserts that concatenating
 * them gives `REMINDER_SLOTS` exactly, in order. That is a stronger link than
 * an import would be: change `REMINDER_EVERY_HOURS` to 3 and the slots become
 * `[7, 10, 13, 16, 19]`, which an import would silently accept and the
 * assertion catches on the spot.
 *
 * The evening band has one slot, so any size cycles; eleven is chosen because
 * `lcm(16, 16, 11) = 176`, which makes a *whole day's* seven lines repeat only
 * twice a year. `push:check` asserts the coprimality as a property of each
 * band, not the three numbers, so a new line added to a sub-deck fails loudly
 * if it lands on a size that collapses the cycle.
 */
export const REMINDER_BANDS: readonly ReminderBand[] = Object.freeze([
  { name: "morning", slots: Object.freeze([7, 9, 11]), lines: MORNING },
  { name: "afternoon", slots: Object.freeze([13, 15, 17]), lines: AFTERNOON },
  { name: "evening", slots: Object.freeze([19]), lines: EVENING },
]);

/** Every line, flattened. The audit list `push:check` and `push:db` read. */
export const REMINDER_LINES: readonly Reminder[] = Object.freeze(
  REMINDER_BANDS.flatMap((band) => [...band.lines]),
);

/** Null for an hour that is not a slot. The three bands partition `REMINDER_SLOTS`. */
export function bandForSlot(slot: number): ReminderBand | null {
  return REMINDER_BANDS.find((band) => band.slots.includes(slot)) ?? null;
}

/**
 * The line for one `(local date, slot)`. **A pure function of its two
 * arguments** — no clock, no user, no randomness, no state — which is what
 * makes a delivery row replayable and what lets `push:check` prove that no two
 * of a day's seven reminders read alike, for four hundred consecutive days,
 * offline.
 *
 * `dayIndex` may be negative for a date before the epoch, so the modulo is the
 * two-step form. A plain `%` returns a negative remainder in JavaScript and
 * would index off the front of the array — `undefined`, a `TypeError` in the
 * tick, and a silence nobody would connect to a date.
 *
 * Returns null for a slot no band owns. That branch cannot fire in the tick,
 * because the slot it passes comes from `dueSlot` and therefore from
 * `REMINDER_SLOTS`, and `push:check` asserts totality over exactly that set —
 * but a null is a better answer than a throw on a path whose only job is to
 * stay quiet.
 */
export function reminderFor(date: LocalDate, slot: number): Reminder | null {
  const band = bandForSlot(slot);
  if (!band) return null;
  const dayIndex = diffLocalDays(REMINDER_EPOCH, date);
  const raw = dayIndex * band.slots.length + band.slots.indexOf(slot);
  const n = band.lines.length;
  return band.lines[((raw % n) + n) % n];
}

/** A delivery row's `reminder_key`, read back as the line it named. */
export function reminderByKey(key: string): Reminder | null {
  return REMINDER_LINES.find((line) => line.key === key) ?? null;
}
