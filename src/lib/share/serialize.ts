import type { VocabEntry } from '@/lib/db/types'
import { SHARE_EXAMPLES_MAX } from '@/lib/share/policy'
import type { SharedWordPayload } from '@/lib/share/schemas'

/**
 * Row → what a stranger sees. The one file that decides that question.
 *
 * **There is no object spread anywhere in this file, and there must never be.**
 * A spread is how a private column joins the payload on the day it is added;
 * naming six fields by hand is how it does not. The same discipline as
 * `lib/vocab/serialize.ts`, with a sharper consequence: that file's output goes
 * to the row's owner, this one's goes to whoever the link reaches.
 *
 * Deliberately excluded, and each for its own reason (F16 §1 D8):
 *
 *   - `id`, `userId` — [S3] keeps entity uuids out of public URLs; the same
 *     argument keeps them out of the body. A leaked uuid outlives revocation.
 *   - `status`, `source`, `masteredAt`, `lastShownOn` — the owner's study
 *     behaviour. None of it is about the word.
 *   - `enrichmentStatus`, `enrichmentError`, `enrichmentAttempts`,
 *     `suggestedCorrection` — internal machinery, and "the model failed three
 *     times on this" is not something to publish.
 *   - `createdAt` — a timestamp tells a stranger what hours the owner keeps.
 *   - anything about `users` — the public query never joins that table at all.
 */
export function toSharedWordPayload(entry: VocabEntry): SharedWordPayload {
  return {
    kind: 'vocab',
    term: entry.term,
    pronunciation: entry.pronunciation,
    partOfSpeech: entry.partOfSpeech,
    definition: entry.definition,
    /**
     * `examples` is `jsonb` and nothing at the database level guarantees it
     * holds strings — a bad model response persisted before F3's schema
     * tightened would still be in there. Filtered with the same guard `toDetail`
     * uses, then capped, because the cap is what the shared page's layout was
     * measured against.
     */
    examples: Array.isArray(entry.examples)
      ? entry.examples
          .filter((e): e is string => typeof e === 'string')
          .slice(0, SHARE_EXAMPLES_MAX)
      : [],
  }
}
