import type { VocabEntry } from "@/lib/db/types";
import type { EnrichResponse, VocabEntrySummary } from "@/lib/vocab/schemas";

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
