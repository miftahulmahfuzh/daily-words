import 'server-only'
import { z } from 'zod'

/**
 * Server-only, fail-fast environment access.
 *
 * `import 'server-only'` is the mechanism that satisfies the roadmap's "the API
 * key must never reach the client": any client component that imports this file,
 * directly or transitively, becomes a build error rather than a leak.
 */
/**
 * `FOO=` in a `.env` file is an **empty string**, not an absent variable.
 *
 * This matters only for the optional block below, and it matters a lot there:
 * `.env.example` ships those keys with empty values, so without this a developer
 * who copies the example and does not fill them in gets `z.string().min(1)`
 * rejecting `""` and the whole application refusing to boot — the exact opposite
 * of "optional". Measured, not theorised: it is how the F15 provider-down pass
 * first failed.
 *
 * Required variables are deliberately *not* wrapped. There, an empty value is a
 * misconfiguration and failing loudly at startup is the right answer.
 */
function blankIsAbsent<T extends z.ZodType>(inner: T) {
  return z.preprocess((v) => (v === '' ? undefined : v), inner)
}

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

  /**
   * F15's embedding provider, read by `lib/llm/embed.ts` and nothing else.
   *
   * **This is deliberately not the badge-art key.** [S1] reserves that other
   * variable for F12's `/generate-badge-art` tooling, which runs offline on a
   * developer's machine, and no application code may read it — `journal:check`
   * asserts its name appears nowhere under `src/`. That assertion is a plain
   * grep and it is only worth anything while this is a *different variable*
   * holding a *different OpenAI project key*, which is why the name is not
   * spelled out even in this comment. `.env.example` carries the long version.
   * Two keys, independently revocable: the badge-art one has been through a chat
   * transcript, and rotating it must not take the journal down with it.
   *
   * `.optional()`, and the application must boot, build and serve without it.
   * Phase A does exactly that — the normalised-hash layer needs no provider —
   * and CI has no key at all. A missing key is a `config` error inside `embed()`
   * that degrades to "not checked", never a startup failure.
   */
  EMBEDDING_BASE_URL: blankIsAbsent(z.url().default('https://api.openai.com/v1')),
  EMBEDDING_MODEL: blankIsAbsent(z.string().min(1).default('text-embedding-3-small')),
  EMBEDDING_API_KEY: blankIsAbsent(z.string().min(1).optional()),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  throw new Error(
    'Invalid environment variables:\n' +
      JSON.stringify(z.treeifyError(parsed.error), null, 2),
  )
}

export const env = parsed.data
