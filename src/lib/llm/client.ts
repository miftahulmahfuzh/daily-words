import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { env } from '@/lib/env'

/**
 * The ONE SDK instance. No feature may construct its own.
 *
 * The endpoint is Anthropic Messages-API compatible. The SDK appends
 * `/v1/messages` to baseURL and sends `x-api-key` + `anthropic-version`
 * automatically, so LLM_BASE_URL must NOT include `/v1` — that is the
 * number-one way to get a 404 here.
 *
 * **`lib/llm/embed.ts` is the second, and last, deliberate transport.** It is
 * not an exception to the sentence above, which forbids a *feature* from
 * building its own: `lib/llm/` is where transports live, and an embeddings call
 * cannot go through this client because the Anthropic Messages API has no
 * embeddings endpoint. It is a different provider on a different key
 * (`EMBEDDING_API_KEY`), and it has no prompt, so nothing was added under
 * `prompts/`. See F15 [D6].
 */
export const llm = new Anthropic({
  apiKey: env.LLM_API_KEY,
  baseURL: env.LLM_BASE_URL,
  maxRetries: 1, // transport-level only (429/5xx/network). NOT the parse retry.
  timeout: 55_000, // under Vercel's 60s function ceiling
})

export const LLM_MODEL = env.LLM_MODEL

/**
 * Only portable Messages-API fields may be sent by any call site:
 * model, max_tokens, system, messages, temperature, stop_sequences.
 *
 * Do NOT send thinking, output_config, effort, cache_control, betas, speed,
 * fallbacks or container — those are Anthropic-model features that this
 * compatible endpoint does not implement.
 */
