import { z } from 'zod'
import { insightSchema } from '@/lib/journal/schemas'
import {
  SHARE_EXAMPLES_MAX,
  SHARE_WORD_INDEX_MAX,
  SHARE_WORD_INDEX_MIN,
} from '@/lib/share/policy'

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
  /**
   * F18's two arms. `id` is the **owner's own** `daily_cards.id` or
   * `journal_entries.id`, sent from the owner's own screen and re-verified
   * against the session in the route — it never appears in a public URL and
   * never crosses into a payload.
   */
  z.object({ entityType: z.literal('card'), id: z.uuid() }),
  z.object({ entityType: z.literal('journal'), id: z.uuid() }),
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

/* ------------------------------ The card payload ---------------------------- */

/**
 * One word of a shared card, addressed by **position** and by nothing else.
 *
 * There is no `id` field and there must never be one (F18 D1, D8). The slug
 * authorises *this card's* six words; a uuid in here would turn that into a
 * capability to name a word, and `SharedCard` keys its rows on `position` so
 * nothing in the renderer wants one either.
 *
 * The enrichment fields are the same five `sharedWordPayloadSchema` carries,
 * because `/s/<slug>/<n>` is the same page as `/s/<slug>` for a vocab share and
 * must not have to read anything live to draw it. `definition` is null while the
 * sharer's word was still being looked up — the row draws F5's skeleton, which
 * is what makes a card shareable on the day it was made.
 */
export const sharedCardWordSchema = z.object({
  position: z.number().int().min(SHARE_WORD_INDEX_MIN).max(SHARE_WORD_INDEX_MAX),
  term: z.string(),
  pronunciation: z.string().nullable(),
  partOfSpeech: z.string().nullable(),
  definition: z.string().nullable(),
  examples: z.array(z.string()).max(SHARE_EXAMPLES_MAX),
})

export type SharedCardWord = z.infer<typeof sharedCardWordSchema>

/**
 * A day, as a stranger sees it.
 *
 * `cardDate` is a `LocalDate` — `'YYYY-MM-DD'`, computed in the sharer's zone at
 * creation, with no offset and no instant behind it. `dateLabel` is that same
 * date already formatted, so the public page does no date work at all and the
 * viewer's own machine cannot shift it (F18 D7).
 *
 * **The sharer's timezone is deliberately absent.** D8's allowlist excludes it —
 * it is a location signal about a person a stranger is not owed — and nothing on
 * the page needs it: the date needs no zone, and the freshness line is a read,
 * which may fall back where a write may not.
 */
export const sharedCardPayloadSchema = z.object({
  kind: z.literal('card'),
  cardDate: z.string(),
  dateLabel: z.string(),
  words: z.array(sharedCardWordSchema).max(SHARE_WORD_INDEX_MAX),
})

export type SharedCardPayload = z.infer<typeof sharedCardPayloadSchema>

/* ----------------------------- The journal payload -------------------------- */

/**
 * A line, and what the machine made of it.
 *
 * Three fields, and the two absences are the design (F18 D8, D10):
 *
 *   - **No `sourceNote`.** It is a note about the *user's life* — "in Ibu's
 *     kitchen", "the letter from R." — not about the line, and it is the field
 *     most likely to name a third party. F10's own edit rule already draws this
 *     split: changing the text clears the insight, changing only the note does
 *     not, "because the note is not part of what was explained". If it is not
 *     part of what was explained, it is not part of what is shared.
 *   - **No `id`, no `createdAt`, no `updatedAt`, no `edited`, no
 *     `insightStatus`.** A stranger gets a line and a paragraph, not an entry.
 *
 * `insight` is present and that is a decision the user asked for in as many
 * words — "sharing journal detailed page, **the one which shows insight**". The
 * attribution problem it raises was solved before this feature existed:
 * `InsightPanel` ends with "Written by the machine. Keep or discard.", and
 * `SharedJournal` reuses that component unchanged precisely so a public-page
 * rewrite cannot drop the line.
 */
export const sharedJournalPayloadSchema = z.object({
  kind: z.literal('journal'),
  text: z.string(),
  dateLabel: z.string(),
  /** Null unless the entry's wire status was `ready` when it was shared. */
  insight: insightSchema.nullable(),
})

export type SharedJournalPayload = z.infer<typeof sharedJournalPayloadSchema>

/**
 * What `getShareBySlug` hands the renderer, after parsing. **All three arms, as
 * of F18** — the dispatch lives in `app/s/[slug]/page.tsx` and nowhere else,
 * which is what keeps `/s/[slug]` carrying no entity type in its path.
 *
 * The stored column is `jsonb` and the database guarantees it nothing, so the
 * read side parses rather than casts. zod's default object behaviour **strips
 * unknown keys**, which makes this a second, independent net under the
 * write-side allowlist: a payload written by a buggy build with an extra field
 * cannot render it.
 */
export const sharedPayloadSchema = z.discriminatedUnion('kind', [
  sharedWordPayloadSchema,
  sharedCardPayloadSchema,
  sharedJournalPayloadSchema,
])

export type SharedPayload = z.infer<typeof sharedPayloadSchema>

/* -------------------------------- Responses -------------------------------- */

export type CreateShareResponse = {
  slug: string
  /** Absolute, built from `env.APP_URL`. The client shares this verbatim. */
  url: string
}

export type DeleteShareResponse = { deleted: true }
