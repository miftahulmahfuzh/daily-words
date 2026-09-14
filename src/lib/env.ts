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
   *
   * Wrapped like the optional block below, and for a sharper reason: `z.coerce`
   * turns `""` into **0**, not into an error, and `0` then fails `.positive()`.
   * So `CHAT_MAX_NEW_ROUNDS_PER_DAY=` — a variable someone meant to leave at its
   * default — refused to boot the application, and the message blamed a number
   * nobody wrote.
   */
  CHAT_MAX_NEW_ROUNDS_PER_DAY: blankIsAbsent(
    z.coerce.number().int().positive().default(30),
  ),

  /**
   * F16. The origin share links are built against: `metadataBase` for the root
   * layout, and the absolute URL `POST /api/shares` hands the phone to put in a
   * WhatsApp message.
   *
   * It has to be absolute and it has to be *right*, which is why it is here
   * rather than derived per-request from a `Host` header — a header a proxy can
   * rewrite is not something to build a link out of. Without `metadataBase` Next
   * emits a relative `og:url` and warns, and WhatsApp will not follow one.
   *
   * The default reads Vercel's own production host so a deploy needs no
   * configuration; `VERCEL_PROJECT_PRODUCTION_URL` carries no scheme, hence the
   * template. Falls back to the only port this project uses. Wrapped like the
   * optional block below because `APP_URL=` in a `.env` file is an empty string,
   * and `z.url()` rejects `""` rather than treating it as absent.
   */
  APP_URL: blankIsAbsent(
    z.url().default(
      process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : 'http://localhost:3200',
    ),
  ),

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
  /**
   * F30's Web Push credentials. **All four are optional, and that is the whole
   * design**: with none of them set the application boots, builds and serves,
   * `GET /api/push/key` answers `{ publicKey: null }`, and the switch on
   * /profile/edit says "reminders aren't available" rather than throwing behind
   * it. A missing key is "reminders are off", never a boot failure.
   *
   * That is the `EMBEDDING_API_KEY` precedent one entry above, and it exists for
   * the same measured reason: `.env.example` ships these blank, `FOO=` is an
   * empty string rather than an absent variable, and an unwrapped
   * `z.string().min(1)` would refuse `""` and take the whole app down for a
   * developer who copied the example and filled in nothing. CI and
   * `npm run build` have no keys at all.
   *
   * The pair is generated once, by hand, and never rotated casually — rotating
   * the public key invalidates every subscription every device has already
   * registered, and the only symptom is silence:
   *
   *     npx web-push generate-vapid-keys
   */
  VAPID_PUBLIC_KEY: blankIsAbsent(z.string().min(1).optional()),
  /**
   * The private half. **Never reaches a browser**, which is what
   * `import 'server-only'` at the top of this file mechanically guarantees: a
   * client component that imports `env`, directly or transitively, is a build
   * error rather than a leak. Exactly two files under `src/` name this variable
   * — this one and `lib/push/send.ts` — and `npm run push:check` asserts that
   * both of them carry that import.
   */
  VAPID_PRIVATE_KEY: blankIsAbsent(z.string().min(1).optional()),
  /**
   * Who to contact about a misbehaving sender. RFC 8292 requires the VAPID JWT's
   * `sub` claim to be a `mailto:` or `https:` URI, and Apple's push service
   * rejects a request whose subject is neither — a 400 with a body nobody reads,
   * which presents as "notifications just don't arrive".
   *
   * Refined rather than left free-form, and this is the one entry in the
   * optional block where a *present* value can fail the boot. The argument is
   * the same one `setTimezoneSchema` makes for a bogus zone: it has a default,
   * so a blank deploy never reaches the refinement, and a value that is present
   * and malformed is a typo somebody made on purpose. Failing at boot names it;
   * the alternative is a deploy that looks healthy and delivers nothing at 07:00
   * on a Sunday.
   *
   * The default is an `https:` URL rather than a `mailto:` so that no personal
   * address is committed to the repository. Set a real mailbox in `.env.local`.
   */
  VAPID_SUBJECT: blankIsAbsent(
    z
      .string()
      .min(1)
      .refine((v) => v.startsWith('mailto:') || v.startsWith('https://'), {
        message: 'VAPID_SUBJECT must be a mailto: address or an https:// URL (RFC 8292).',
      })
      .default('https://dword.site'),
  ),
  /**
   * The shared secret the hourly tick presents. **Declared here, consumed
   * nowhere in this phase** — `app/api/push/tick/route.ts` compares it with
   * `timingSafeEqual` and is the only reader.
   *
   * It lives here rather than beside its consumer because this file is one file:
   * two features editing the same zod object is a merge conflict with no upside,
   * and an environment variable that appears in `.env.example` but not in the
   * validator is exactly the drift this module exists to prevent.
   *
   * Optional, like the three above and for the same reason — but note the shape
   * of the failure it implies: **unset means the tick endpoint refuses every
   * request**, because the comparison is written to fail closed. An unset secret
   * is never an open door.
   */
  CRON_SECRET: blankIsAbsent(z.string().min(1).optional()),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  throw new Error(
    'Invalid environment variables:\n' +
      JSON.stringify(z.treeifyError(parsed.error), null, 2),
  )
}

export const env = parsed.data
