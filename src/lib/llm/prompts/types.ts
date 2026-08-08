import type { z } from 'zod'

/**
 * Every feature adds ONE file under lib/llm/prompts/ exporting one of these.
 * Nothing else about LLM access is a feature's business.
 */
export type PromptModule<TInput, TOutput> = {
  /** Stable log id: '<feature>.<action>', e.g. 'vocab.enrich', 'journal.insight'. */
  label: string
  /** Zod schema the reply must satisfy. Keep it flat and small. */
  schema: z.ZodType<TOutput>
  /** Constant instructions. Must not interpolate per-request data. */
  system: string | ((input: TInput) => string)
  /** The user turn. All per-request data goes here. */
  user: (input: TInput) => string
  maxTokens: number
  temperature?: number
}
