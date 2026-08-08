/** Register shared by every prompt in the app. Terse on purpose — LLM text sprawls. */
export const BASE_STYLE = [
  'You write in English, in the register of a dictionary: plain, precise, unfussy.',
  'No preamble. No apologies. No meta-commentary about being an AI.',
  'Short is correct. One line means one line.',
].join(' ')

/** Append to any system prompt whose reply must be machine-read. */
export function jsonOnly(shape: string): string {
  return [
    'Reply with a single JSON object and nothing else.',
    'No code fences. No prose before or after.',
    `Shape: ${shape}`,
  ].join(' ')
}
