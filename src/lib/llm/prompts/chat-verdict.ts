/**
 * The closing note. A separate call with its own system prompt, deliberately.
 *
 * The model is taken **out** of role for this. Asking a character in a scene to
 * also produce a three-line assessment reliably produces a character producing a
 * three-line assessment — the neighbour with the parcel, writing school reports.
 * A fresh system prompt and a rendered transcript gets a note instead.
 *
 * Temperature drops too (0.3 against the scene's 0.9): the scene wants
 * invention, the verdict wants accuracy about what was actually said.
 *
 * Pure text. No `server-only` — see `chat-system.ts`.
 */

export const VERDICT_SYSTEM_PROMPT = `You have just finished a short practice scene with someone learning English. The scene is
over and you are out of character now. You are writing three plain lines for them to read
once and then close the app. You are dry, specific and unsentimental. You do not flatter,
you do not encourage in the abstract, and you never explain grammar in general terms. When
you quote them, you quote them exactly.`

export type VerdictInput = {
  term: string
  partOfSpeech: string | null
  definition: string
  /** From `renderTranscript()` — `Them:` / `You:` lines, chronological. */
  transcript: string
}

export function verdictPrompt(input: VerdictInput): string {
  const pos = input.partOfSpeech ?? 'unknown'

  return `The scene below has ended. You were the other person in it.

Target word: "${input.term}" (${pos}) — ${input.definition}

Transcript:
${input.transcript}

Write the closing note. Exactly three lines, in this order:

Line 1. One sentence: did they get "${input.term}" out in a sentence of their own, and did it
land? Quote the exact phrase they used, in their words, inside single quotation marks. If
they never used the word at all, say that plainly and do not soften it.

Line 2. One sentence: the single thing to fix, or — if there is nothing to fix — the single
thing worth keeping. Concrete, about this word in their sentence, never about their English
in general.

Line 3. One short sentence they could actually say tomorrow using "${input.term}", built out of
something they themselves mentioned in the scene. Give the sentence, not advice about it.

Three lines. No heading, no numbering, no bullets, no emoji, no sign-off, no praise. Plain
and dry, like a note written in a margin.`
}

/**
 * The only canned model-shaped text in the feature, used when the verdict call
 * fails twice (F6 §12.7).
 *
 * It is written to be honest about being a fallback rather than to pass as an
 * assessment. A generic "well done, keep practising" would be worse than
 * nothing: it claims to have read a conversation it never saw, and the one
 * thing the verdict is for is specificity.
 *
 * A session must never be able to hang in `closing`, so this row goes in and
 * `closed_at` is set even though the model gave us nothing.
 */
export function fallbackVerdict(term: string): string {
  return `That round is finished. The transcript is above — read back your own sentences with "${term}" in them.`
}
