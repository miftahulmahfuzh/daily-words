import 'server-only'
import { z } from 'zod'

/**
 * Server-only, fail-fast environment access.
 *
 * `import 'server-only'` is the mechanism that satisfies the roadmap's "the API
 * key must never reach the client": any client component that imports this file,
 * directly or transitively, becomes a build error rather than a leak.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(1),
  AUTH_GOOGLE_ID: z.string().min(1),
  AUTH_GOOGLE_SECRET: z.string().min(1),
  LLM_BASE_URL: z.url(),
  LLM_MODEL: z.string().min(1),
  LLM_API_KEY: z.string().min(1),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  throw new Error(
    'Invalid environment variables:\n' +
      JSON.stringify(z.treeifyError(parsed.error), null, 2),
  )
}

export const env = parsed.data
