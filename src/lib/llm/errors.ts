export type LlmErrorKind = 'transport' | 'parse' | 'empty' | 'config'

export type LlmError = {
  kind: LlmErrorKind
  /** For the server log. May contain raw model output. Never render this. */
  detail: string
  /** Short, terse, dictionary-register. Safe to render. */
  message: string
}

export const USER_MESSAGES: Record<LlmErrorKind, string> = {
  transport: 'The word service is unreachable. Try again.',
  parse: 'The reply came back malformed. Try again.',
  empty: 'No reply came back. Try again.',
  config: 'The word service is misconfigured.',
}

export function llmError(kind: LlmErrorKind, detail: string): LlmError {
  return { kind, detail, message: USER_MESSAGES[kind] }
}
