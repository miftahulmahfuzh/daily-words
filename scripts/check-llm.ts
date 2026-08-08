/**
 * One-shot smoke test against z.ai through the shared client.
 *
 * Run with:  npm run llm:check
 *
 * The `--conditions=react-server` flag in that script is required: `lib/llm/*`
 * imports `server-only`, whose default export throws outside a server bundle.
 */
import 'dotenv/config'
import { z } from 'zod'
import { generateJson } from '../src/lib/llm/json'
import { LLM_MODEL } from '../src/lib/llm/client'

const schema = z.object({ word: z.string(), definition: z.string() })

async function main() {
  console.log(`model: ${LLM_MODEL}`)
  const r = await generateJson({
    label: 'smoke',
    schema,
    system: 'You are a dictionary.',
    prompt:
      'Return JSON: {"word":"genteel","definition":"one short line"}. JSON only.',
    maxTokens: 200,
  })
  console.log(r.ok ? r.data : r.error)
  process.exit(r.ok ? 0 : 1)
}

void main()
