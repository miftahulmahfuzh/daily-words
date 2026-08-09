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
  /**
   * F6's per-day ceiling on practice rounds. Optional, with a default, because
   * it is a quota backstop rather than configuration: it is not there to ration
   * normal use — nine calls a round at ~10.7k tokens means thirty rounds is a
   * heavy day — it is there so a stuck client cannot quietly burn the month's
   * free-tier quota overnight. Set it to 1 in .env.local to test the 429.
   */
  CHAT_MAX_NEW_ROUNDS_PER_DAY: z.coerce.number().int().positive().default(30),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  throw new Error(
    'Invalid environment variables:\n' +
      JSON.stringify(z.treeifyError(parsed.error), null, 2),
  )
}

export const env = parsed.data
