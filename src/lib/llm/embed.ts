import 'server-only'
import { env } from '@/lib/env'
import { llmError, type LlmError } from '@/lib/llm/errors'

/**
 * The embeddings transport. **The second, and last, deliberate one.**
 *
 * `client.ts` says "The ONE SDK instance. No feature may construct its own." That
 * rule forbids a *feature* from building a transport; `lib/llm/` is where
 * transports are allowed to live, and this is one. It cannot reuse the SDK
 * instance for a plain reason: that is an `@anthropic-ai/sdk` client pointed at
 * `/api/anthropic`, and the Anthropic Messages API has no embeddings endpoint at
 * all. So this is a bare `fetch` against an OpenAI-compatible
 * `POST {base}/embeddings`.
 *
 * **Nothing is added under `lib/llm/prompts/`.** An embedding call has no prompt,
 * no system message, no temperature and no repair retry; an empty prompt module
 * to satisfy the pattern would be worse than not having one.
 *
 * This is the only file in the repository allowed to name an embeddings URL, and
 * `npm run journal:check` asserts that by grepping `src/` rather than trusting
 * it. `import 'server-only'` is what turns a client import of the key into a
 * build error instead of a leak.
 *
 * Two things this does *not* do, both on purpose:
 *
 *   - **No retry.** The SDK's one transport retry has no equivalent here, and a
 *     retry inside a 2.5 s budget is a way to spend the budget twice.
 *   - **No throwing.** Every failure is a value, because every caller's correct
 *     response to one is to carry on and save the row.
 */

export type EmbedResult =
  | { ok: true; vectors: number[][]; model: string }
  | { ok: false; error: LlmError }

/** OpenAI returns `data` with an `index` per row. Order is not promised. */
type EmbeddingsResponse = {
  model?: unknown
  data?: unknown
}

export type EmbedOptions = {
  /**
   * The whole budget, enforced with `AbortSignal.timeout`.
   *
   * The caller owns this number rather than this file, because what it is worth
   * depends entirely on what is waiting: 2.5 s on the save path (where a row is
   * already on screen), and far more in a backfill nobody is watching.
   */
  timeoutMs: number
  /**
   * Expected width, asserted before the vectors are handed back.
   *
   * Passed in rather than imported, so `lib/llm/` does not depend on a feature
   * module — `EMBEDDING_DIMENSIONS` lives in `lib/journal/similarity.ts` beside
   * the threshold it belongs with. Getting a wrong-width array *here* is a
   * `config` error; getting one into Postgres is a bind failure on a `vector(N)`
   * column at the worst possible moment.
   */
  dimensions: number
}

export async function embed(
  inputs: string[],
  opts: EmbedOptions,
): Promise<EmbedResult> {
  if (!env.EMBEDDING_API_KEY) {
    return { ok: false, error: llmError('config', 'EMBEDDING_API_KEY is not set') }
  }
  if (inputs.length === 0) {
    return { ok: true, vectors: [], model: env.EMBEDDING_MODEL }
  }

  let res: Response
  try {
    res = await fetch(`${env.EMBEDDING_BASE_URL}/embeddings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.EMBEDDING_API_KEY}`,
      },
      body: JSON.stringify({ model: env.EMBEDDING_MODEL, input: inputs }),
      signal: AbortSignal.timeout(opts.timeoutMs),
    })
  } catch (err) {
    // A timeout arrives here as an AbortError, and it is a transport failure
    // like any other: the caller's job is to stop waiting and save the row.
    return { ok: false, error: llmError('transport', String(err)) }
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    return {
      ok: false,
      error: llmError('transport', `HTTP ${res.status}: ${detail.slice(0, 500)}`),
    }
  }

  let payload: EmbeddingsResponse
  try {
    payload = (await res.json()) as EmbeddingsResponse
  } catch (err) {
    return { ok: false, error: llmError('parse', String(err)) }
  }

  if (!Array.isArray(payload.data) || payload.data.length === 0) {
    return { ok: false, error: llmError('empty', 'no data array in the response') }
  }

  // Sorted by the provider's own `index`, never trusted to arrive in order.
  // Silently mis-pairing a vector with a line would attach one entry's meaning
  // to another's text, and nothing downstream could notice.
  const rows = [...payload.data] as Array<{ index?: unknown; embedding?: unknown }>
  rows.sort((a, b) => Number(a.index ?? 0) - Number(b.index ?? 0))

  if (rows.length !== inputs.length) {
    return {
      ok: false,
      error: llmError('parse', `asked for ${inputs.length} vectors, got ${rows.length}`),
    }
  }

  const vectors: number[][] = []
  for (const row of rows) {
    const vector = row.embedding
    if (!Array.isArray(vector) || !vector.every((n) => typeof n === 'number')) {
      return { ok: false, error: llmError('parse', 'an embedding was not an array of numbers') }
    }
    if (vector.length !== opts.dimensions) {
      return {
        ok: false,
        error: llmError(
          'config',
          `expected ${opts.dimensions} dimensions, got ${vector.length} — the vector(N) column and the model disagree`,
        ),
      }
    }
    vectors.push(vector as number[])
  }

  return {
    ok: true,
    vectors,
    model: typeof payload.model === 'string' ? payload.model : env.EMBEDDING_MODEL,
  }
}
