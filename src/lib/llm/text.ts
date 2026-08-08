import 'server-only'
import { llm, LLM_MODEL } from '@/lib/llm/client'
import { llmError, type LlmError } from '@/lib/llm/errors'

export type LlmMessage = { role: 'user' | 'assistant'; content: string }

export type GenerateTextOptions = {
  label: string
  system: string
  /** Must start with 'user' and alternate. */
  messages: LlmMessage[]
  maxTokens?: number // default 512 — chat turns are short by design
  temperature?: number // default 0.7
}

/** Plain text, multi-turn. No JSON to parse, and therefore no retry. */
export async function generateText(
  o: GenerateTextOptions,
): Promise<{ ok: true; text: string } | { ok: false; error: LlmError }> {
  try {
    const res = await llm.messages.create({
      model: LLM_MODEL,
      max_tokens: o.maxTokens ?? 512,
      temperature: o.temperature ?? 0.7,
      system: o.system,
      messages: o.messages,
    })
    const text = res.content
      .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
    if (!text) return { ok: false, error: llmError('empty', 'no text blocks') }
    return { ok: true, text }
  } catch (err) {
    console.error(`[llm:${o.label}] transport`, err)
    return { ok: false, error: llmError('transport', String(err)) }
  }
}
