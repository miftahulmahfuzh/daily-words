import type { CardForShare, ShareCardItemRow } from '@/lib/db/queries/cards'
import type { JournalEntry, VocabEntry } from '@/lib/db/types'
import { parseStoredInsight } from '@/lib/journal/serialize'
import { SHARE_EXAMPLES_MAX, SHARE_WORD_INDEX_MAX } from '@/lib/share/policy'
import { formatLocalDateLong, formatLocalDateShort, toLocalDate } from '@/lib/time/local-date'
import type {
  SharedCardPayload,
  SharedCardWord,
  SharedJournalPayload,
  SharedWordPayload,
} from '@/lib/share/schemas'

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
 *   - `originTerm`, `originLanguage`, `originContext` — the non-English
 *     lookup's trail. `originContext` is the "as in" sentence, a line from the
 *     owner's own life, and it is excluded for the same reason a journal
 *     entry's `sourceNote` is: it is about the person, not about the word. The
 *     other two follow it rather than being weighed separately — which language
 *     the owner reads in, and which of its words they did not know, is a
 *     profile of the reader.
 *   - anything about `users` — the public query never joins that table at all.
 *
 * **The four enrichment fields below are the known limit of that rule.** On a
 * row created through the non-English lookup they were produced by a prompt that
 * had read the owner's context sentence, and they do cross — here, and again
 * into a stranger's own collection through F17's claim. What holds them apart is
 * a rule in `vocab-translate.ts` (the context disambiguates and is never
 * translated into the examples), not a structure. Named here rather than left
 * for someone to rediscover.
 *
 * **F18 added the card and journal serialisers below rather than the two new
 * `lib/share/*-dto.ts` files its plan proposed.** The plan was written before
 * F16 existed and assumed public pages would read live rows, which would have
 * made a second serialising module a different job. Against the snapshot F16
 * actually shipped it would be the *same* job in a second file, and the sentence
 * at the top of this comment is the property worth keeping: one file decides
 * what a stranger sees, and `share:check` reads its exported key lists.
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
    examples: cleanExamples(entry.examples),
  }
}

/**
 * `examples` is `jsonb` and nothing at the database level guarantees it holds
 * strings — a bad model response persisted before F3's schema tightened would
 * still be in there. Filtered with the same guard `toDetail` uses, then capped,
 * because the cap is what the shared page's layout was measured against.
 *
 * Extracted when F18 arrived, so the card's six words and the single word cannot
 * disagree about what an example is.
 */
function cleanExamples(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((e): e is string => typeof e === 'string').slice(0, SHARE_EXAMPLES_MAX)
    : []
}

/* ----------------------------------- Cards ---------------------------------- */

/**
 * A day → what a stranger sees. **F18 D1: the words are addressed by position.**
 *
 * `entryId` is read off the row and then deliberately dropped on the floor. That
 * is the leak this function exists to prevent: `toDailyCardItemView` — the
 * serialiser `/today` uses, one import away — returns `{ id: item.entryId, … }`,
 * and its own comment says `id` "is the **vocab entry** id, because that is what
 * the row links to". Reuse it here and one tap on Share hands a stranger six
 * real vocab uuids that outlive revocation.
 *
 * **No object spread, exactly as above.** Six fields named by hand is how a
 * column added to `vocab_entries` next year does not join the payload.
 *
 * `definition` is null unless enrichment landed — the same rule
 * `toDailyCardItemView` applies, so a word still being looked up draws F5's
 * skeleton on the public row rather than an empty line or the string "null".
 * That is what makes a card shareable on the day it was made.
 *
 * The slice to six is defensive rather than expected:
 * `daily_card_items_card_position_uniq` plus F5's contiguous 1-based insert make
 * a seventh row unreachable, and `DailyCard` **throws in development** when given
 * more than six items. A public page is the worst place in the app to discover
 * that the impossible happened.
 */
export function toSharedCardPayload(card: CardForShare): SharedCardPayload {
  return {
    kind: 'card',
    cardDate: card.cardDate,
    /**
     * Formatted once, here, at share time. `formatLocalDateLong` pins `Intl` to
     * UTC on purpose, so "9 August 2026" is a property of the calendar date
     * rather than of the machine reading it — a viewer in Los Angeles and a
     * viewer in Jakarta see the same string, and the public page does no date
     * work at all (F18 D7).
     */
    dateLabel: formatLocalDateLong(card.cardDate),
    words: card.items.slice(0, SHARE_WORD_INDEX_MAX).map(toSharedCardWord),
  }
}

function toSharedCardWord(item: ShareCardItemRow): SharedCardWord {
  return {
    position: item.position,
    term: item.term,
    pronunciation: item.pronunciation,
    partOfSpeech: item.partOfSpeech,
    definition: item.enrichmentStatus === 'ready' ? item.definition : null,
    examples: item.enrichmentStatus === 'ready' ? cleanExamples(item.examples) : [],
  }
}

/* ---------------------------------- Journal --------------------------------- */

/**
 * A line → what a stranger sees. Three fields, and the absences are the design.
 *
 * **`sourceNote` does not cross** (F18 D10). It is a note about the user's life
 * rather than about the line, and it is the field most likely to name a third
 * party — "in Ibu's kitchen", "the letter from R.". The escape hatch costs the
 * user one gesture: `text` is the field the design gives the whole screen to, and
 * a citation typed into it is shared.
 *
 * **`id`, `createdAt`, `updatedAt`, `edited` and `insightStatus` do not cross**
 * either, which is why this is not `toJournalEntryDto` — that function returns
 * all five, and it also takes the *reader's* timezone. On a public page the
 * reader is a stranger, so the day has to come from the **owner's** zone, passed
 * in by the route that already read the owner's profile.
 *
 * The insight is read with `parseStoredInsight` and only when the column says
 * `ready`, which is the same defensiveness `lib/journal/serialize.ts` applies:
 * a `pending` or `failed` entry shares cleanly as a bare line rather than showing
 * a stranger a "Try again" button they cannot press.
 */
export function toSharedJournalPayload(
  entry: JournalEntry,
  ownerTimezone: string,
): SharedJournalPayload {
  return {
    kind: 'journal',
    text: entry.text,
    dateLabel: formatLocalDateShort(toLocalDate(entry.createdAt, ownerTimezone)),
    insight:
      entry.insightStatus === 'ready' ? parseStoredInsight(entry.insight, entry.id) : null,
  }
}
