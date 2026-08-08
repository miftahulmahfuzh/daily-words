/**
 * The two multi-select rules, as pure functions of the previous selection.
 *
 * They take `previous` rather than reading it from props for a reason found by
 * clicking six chips as fast as Playwright can: a handler that computes the next
 * array from the value it was rendered with loses every tap that lands before
 * React has flushed the one before it — six taps produced three selections.
 * Passed to a functional `setState`, these are race-free, and the rules stay in
 * one place instead of being restated by the flow and the edit form.
 *
 * No `server-only` — both callers are client components. `normalizeProfileAnswers`
 * enforces the same rules again on the server, where they are the real gate.
 */

/**
 * Add or remove, refusing silently at the cap.
 *
 * No error message: a limit the user cannot see on screen does not deserve a
 * sentence, and the chip visibly not taking is the feedback.
 */
export function toggleCapped(
  previous: readonly string[],
  value: string,
  max: number,
): string[] {
  if (previous.includes(value)) return previous.filter((v) => v !== value);
  if (previous.length >= max) return [...previous];
  return [...previous, value];
}

/**
 * Add or remove, with one member that cannot coexist with the others.
 *
 * Picking "Not much yet" clears the rest; picking anything else clears it. It is
 * not a sixth place English gets used, it is the absence of the other five.
 */
export function toggleExclusive(
  previous: readonly string[],
  value: string,
  exclusive: string,
): string[] {
  if (previous.includes(value)) return previous.filter((v) => v !== value);
  if (value === exclusive) return [exclusive];
  return [...previous.filter((v) => v !== exclusive), value];
}
