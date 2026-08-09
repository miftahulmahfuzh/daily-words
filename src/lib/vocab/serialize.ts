import type { VocabEntry } from "@/lib/db/types";
import type { CorrectionOutcome, VocabEntryDetail, VocabListRow } from "@/lib/db/queries/vocab";
import type {
  AcceptCorrectionResponse,
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
    suggestedCorrection: entry.suggestedCorrection,
  };
}

/**
 * Every non-`not_found` correction outcome, in one shape.
 *
 * `entry` is always the **survivor**, which for `merged` and `kept_both` is not
 * the row the request named. That is the whole reason F14 D2 moved `kept_both`
 * out of the error envelope: `{error:{code,message}}` had nowhere to put an id,
 * so the client could not offer a way to the word the user actually meant.
 */
export function toCorrectionResponse(
  result: Extract<CorrectionOutcome, { entry: VocabEntry }>,
): AcceptCorrectionResponse {
  return {
    outcome: result.outcome,
    id: result.entry.id,
    term: result.entry.term,
    status: result.entry.status,
    practiceLost: result.practiceLost,
  };
}
