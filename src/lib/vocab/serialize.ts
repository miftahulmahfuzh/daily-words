import type { VocabEntry } from "@/lib/db/types";
import type { VocabEntryDetail, VocabListRow } from "@/lib/db/queries/vocab";
import type {
  EnrichResponse,
  VocabDetailResponse,
  VocabEntrySummary,
  VocabListItem,
} from "@/lib/vocab/schemas";

/** Row → wire. The client never sees `user_id`, `last_shown_on` or timestamps. */

export function toSummary(entry: VocabEntry): VocabEntrySummary {
  return {
    id: entry.id,
    term: entry.term,
    status: entry.status,
    enrichmentStatus: entry.enrichmentStatus,
  };
}

export function toEnrichResponse(entry: VocabEntry): EnrichResponse {
  return {
    id: entry.id,
    term: entry.term,
    enrichmentStatus: entry.enrichmentStatus,
    partOfSpeech: entry.partOfSpeech,
    pronunciation: entry.pronunciation,
    definition: entry.definition,
    examples: entry.examples ?? [],
    suggestedCorrection: entry.suggestedCorrection,
    enrichmentError: entry.enrichmentError,
    attempts: entry.enrichmentAttempts,
  };
}

/** `sortKey` stays server-side: it is the cursor's business, not the list's. */
export function toListItem(row: VocabListRow): VocabListItem {
  return {
    id: row.id,
    term: row.term,
    definition: row.definition,
    status: row.status,
    enrichmentStatus: row.enrichmentStatus,
  };
}

/**
 * `examples` is `jsonb` and nothing at the database level guarantees it holds
 * strings — a bad model response persisted before F3's schema tightened would
 * still be in there. Filtered rather than trusted, because the alternative is
 * `.map()` over unvalidated JSON in a render.
 */
export function toDetail(entry: VocabEntryDetail): VocabDetailResponse {
  return {
    id: entry.id,
    term: entry.term,
    definition: entry.definition,
    status: entry.status,
    enrichmentStatus: entry.enrichmentStatus,
    partOfSpeech: entry.partOfSpeech,
    pronunciation: entry.pronunciation,
    examples: Array.isArray(entry.examples)
      ? entry.examples.filter((e): e is string => typeof e === "string")
      : [],
    source: entry.source,
    enrichmentError: entry.enrichmentError,
    carded: entry.carded,
  };
}
