/**
 * The fallback scenario bank, and the picker that chooses from it.
 *
 * Used when the profile is empty — and offered as an escape hatch when it is
 * full but none of its details will carry the word. Every one is concrete,
 * universal, mildly irritating, and contains a natural opening for judgement or
 * description, which is the shape most target words need. A pleasant scenario
 * gives the learner nothing to have an opinion about.
 *
 * Pure text, like `prompts/shared.ts`: no `server-only`, so
 * `npm run chat:check` can assert the picker offline. There is no API key
 * anywhere in this file to leak.
 */

// Typed `readonly string[]` rather than a literal tuple: nothing branches on
// which scenario came out, and the literal union would only make every caller
// that holds one carry eight string literals in its type.
export const SCENARIOS: readonly string[] = [
  'the two of you are stuck at the back of a slow queue in a shop that has one till open',
  'you are waiting for a train that has just been delayed a second time, on the same platform',
  'you are both at a wedding reception, sitting at the table nobody wanted',
  'you have just come out of a film neither of you liked, and you are walking to the car',
  'you are a neighbour who has knocked on their door about a parcel that went to the wrong flat',
  'you are sitting in a waiting room that has run forty minutes late, with one magazine between you',
  'you are the friend who has just been shown around a flat they are thinking of renting',
  'you are eating lunch with them on the one bench outside the building, in bad weather',
] as const

/**
 * FNV-1a, 32-bit. Small, dependency-free, and — the only property that matters
 * here — deterministic across processes, which `Math.random()` is not.
 */
function hash(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Keyed on the entry id **and** the round.
 *
 * The entry id means two different words get two different scenarios, so a user
 * practising three words in an evening does not have the same conversation
 * three times. The round means practising the *same* word again lands somewhere
 * new. And because it is a hash rather than a draw, a retried or re-rendered
 * opener regenerates the scene it was already in.
 */
export function pickScenario(vocabEntryId: string, round: number): string {
  return SCENARIOS[hash(`${vocabEntryId}:${round}`) % SCENARIOS.length]
}
