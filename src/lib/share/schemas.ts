import { z } from 'zod'
import { SHARE_EXAMPLES_MAX } from '@/lib/share/policy'

/**
 * Request and response shapes for F16's two routes, plus the shape of what is
 * stored in `shares.payload`.
 *
 * zod 4 spelling: `z.uuid()`, not `z.string().uuid()` ([R2]).
 *
 * The browser imports only the inferred **types** from here. Importing a schema
 * as a value from a client component pulls the whole of zod into that route's
 * bundle — 73 kB in `/vocab/new` before F3 caught it.
 */

/* --------------------------------- Requests -------------------------------- */

/**
 * What the Share button posts.
 *
 * A discriminated union with one member today. F18 adds `'card'` and
 * `'journal'` arms **here**, and the route's switch stops compiling until it
 * handles them — which is the whole reason the discriminant is not just a
 * `z.enum` beside a bare uuid.
 */
export const createShareSchema = z.discriminatedUnion('entityType', [
  z.object({ entityType: z.literal('vocab'), id: z.uuid() }),
])

export type CreateShareRequest = z.infer<typeof createShareSchema>

/* --------------------------------- Payload --------------------------------- */

/**
 * The public DTO. **A deliberate allowlist**, and the list of what it must never
 * contain is as much a part of the design as the list of what it does — see F16
 * §1 D8. In short: no email, no display name, no `user_id`, no entity uuid, no
 * study state (`status`, `mastered_at`, `last_shown_on`), no enrichment
 * machinery, no timestamps.
 *
 * The whole point of storing a snapshot rather than joining is that this shape
 * — six fields, named by hand in `serialize.ts` — is the only thing a stranger
 * can ever see, regardless of what columns `vocab_entries` gains later.
 */
export const sharedWordPayloadSchema = z.object({
  kind: z.literal('vocab'),
  term: z.string(),
  pronunciation: z.string().nullable(),
  partOfSpeech: z.string().nullable(),
  definition: z.string().nullable(),
  examples: z.array(z.string()).max(SHARE_EXAMPLES_MAX),
})

export type SharedWordPayload = z.infer<typeof sharedWordPayloadSchema>

/**
 * What `getShareBySlug` hands the renderer, after parsing.
 *
 * **F18 adds its two arms to this array** — `sharedCardPayloadSchema` and
 * `sharedJournalPayloadSchema` — and adds the matching branches to
 * `components/share/shared-word.tsx`'s caller. Nowhere else.
 *
 * The stored column is `jsonb` and the database guarantees it nothing, so the
 * read side parses rather than casts. zod's default object behaviour **strips
 * unknown keys**, which makes this a second, independent net under the
 * write-side allowlist: a payload written by a buggy build with an extra field
 * cannot render it.
 */
export const sharedPayloadSchema = z.discriminatedUnion('kind', [
  sharedWordPayloadSchema,
])

export type SharedPayload = z.infer<typeof sharedPayloadSchema>

/* -------------------------------- Responses -------------------------------- */

export type CreateShareResponse = {
  slug: string
  /** Absolute, built from `env.APP_URL`. The client shares this verbatim. */
  url: string
}

export type DeleteShareResponse = { deleted: true }
