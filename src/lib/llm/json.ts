import 'server-only'
import { z } from 'zod' // value import — z.treeifyError() is used below
import { llm, LLM_MODEL } from '@/lib/llm/client'
import { llmError, type LlmError } from '@/lib/llm/errors'
import type { PromptModule } from '@/lib/llm/prompts/types'

export type LlmResult<T> =
  | { ok: true; data: T; raw: string }
  | { ok: false; error: LlmError }

/** Pull a JSON object/array out of a reply that may be fenced or padded with prose. */
export function extractJson(raw: string): string | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw)
  const body = (fenced ? fenced[1] : raw).trim()
  const start = body.search(/[{[]/)
  if (start === -1) return null
  const open = body[start]
  const close = open === '{' ? '}' : ']'
  const end = body.lastIndexOf(close)
  if (end <= start) return null
  return body.slice(start, end + 1)
}

export type GenerateJsonOptions<T> = {
  /** Short stable id for logs, e.g. 'vocab.enrich'. */
  label: string
  schema: z.ZodType<T>
  system: string
  /** The user turn. Everything variable goes here, not in `system`. */
  prompt: string
  maxTokens?: number
  temperature?: number
}

/**
 * Exactly one retry on parse/validation failure, then fail. The roadmap forbids
 * a multi-retry loop — it burns quota on a free-tier hobby project.
 */
export async function generateJson<T>(o: GenerateJsonOptions<T>): Promise<LlmResult<T>> {
  const messages: { role: 'user' | 'assistant'; content: string }[] = [
    { role: 'user', content: o.prompt },
  ]

  // attempt 0 = first try, attempt 1 = the ONE retry. No third attempt, ever.
  for (let attempt = 0; attempt <= 1; attempt++) {
    let raw: string
    try {
      const res = await llm.messages.create({
        model: LLM_MODEL,
        max_tokens: o.maxTokens ?? 1024,
        temperature: o.temperature ?? 0.3,
        system: o.system,
        messages,
      })
      raw = res.content
        .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim()
    } catch (err) {
      // Transport failures are NOT retried here — the SDK already retried once.
      console.error(`[llm:${o.label}] transport`, err)
      return { ok: false, error: llmError('transport', String(err)) }
    }

    if (!raw) return { ok: false, error: llmError('empty', 'no text blocks in reply') }

    const slice = extractJson(raw)
    let problem: string
    if (!slice) {
      problem = 'no JSON object found in the reply'
    } else {
      try {
        const parsed = o.schema.safeParse(JSON.parse(slice))
        if (parsed.success) return { ok: true, data: parsed.data, raw }
        problem = JSON.stringify(z.treeifyError(parsed.error))
      } catch (e) {
        problem = `JSON.parse failed: ${String(e)}`
      }
    }

    console.warn(`[llm:${o.label}] attempt ${attempt} bad output: ${problem}`)
    if (attempt === 1) return { ok: false, error: llmError('parse', problem) }

    // The single retry: show the model its own output and the exact complaint.
    messages.push({ role: 'assistant', content: raw })
    messages.push({
      role: 'user',
      content:
        `That reply was rejected: ${problem}\n` +
        `Reply again with the JSON only. No prose, no code fences, no explanation.`,
    })
  }

  return { ok: false, error: llmError('parse', 'unreachable') }
}

/** Run a prompt module. This is what feature code should call. */
export function runPrompt<TIn, TOut>(
  mod: PromptModule<TIn, TOut>,
  input: TIn,
): Promise<LlmResult<TOut>> {
  return generateJson({
    label: mod.label,
    schema: mod.schema,
    system: typeof mod.system === 'function' ? mod.system(input) : mod.system,
    prompt: mod.user(input),
    maxTokens: mod.maxTokens,
    temperature: mod.temperature,
  })
}
