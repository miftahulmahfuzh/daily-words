/**
 * The opener instruction — the single user-role message on the opener call.
 *
 * **Never persisted and never shown.** It is a control message: the user's
 * transcript starts with the model's first spoken line, and storing the
 * instruction that produced it would put it in the history of every later reply
 * call, costing ~185 tokens a turn to tell the model something it can already
 * see it did.
 *
 * Pure text. No `server-only` — see `chat-system.ts`.
 */

export type ChatOpenerInput = {
  term: string
  /** True when the user skipped all four profile questions. */
  profileIsEmpty: boolean
  /** From `pickScenario()`. Always supplied, even when the profile is full. */
  fallbackScenario: string
}

export function chatOpenerPrompt(input: ChatOpenerInput): string {
  /**
   * Two spellings of one bullet. With a profile, the scenario bank is the
   * escape hatch rather than the instruction — "software engineer, football,
   * Bleak House" will not carry every word, and a model forced to build from a
   * detail that does not fit produces a scene about the detail instead of about
   * the word. Without a profile it is the only source there is, and naming it
   * outright is what stops the model inventing a life for them.
   */
  const sourceLine = input.profileIsEmpty
    ? `- use this situation, because you know nothing about them: ${input.fallbackScenario}`
    : `- come out of one detail from what you know about them: their job, one interest, or what
  they are reading or watching. Pick exactly one and build the whole situation from it.
  Do not list their details back at them. If none of them will carry this word, use this
  situation instead: ${input.fallbackScenario}`

  return `Open the scene now. They have just picked up their phone. They have said nothing yet and
they are not expecting a greeting.

Write your first line — you speak first, always.

It must:

- drop both of you into somewhere specific, in the first clause. A place, a moment, a thing
  already half gone wrong. Never "hi", never "hello", never "how can I help", never a
  question about how they are.
${sourceLine}
- hand them the floor with something they cannot answer in one word. Ask them to describe
  something, judge something, or complain about something.
- make "${input.term}" the obvious word for their answer without asking for it, and without
  using it more than once yourself. Never end on "what's the word for…", "how would you
  describe that in one word", or anything else that asks them to name a word. Ask about
  the situation, not about vocabulary.

Two or three sentences. Nothing else. No labels, no narration, no quotation marks around
the whole line.`
}
