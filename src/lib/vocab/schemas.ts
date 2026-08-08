import { z } from "zod";

/**
 * Request and response shapes for F3's three routes, in one file so the two
 * halves of each contract cannot drift.
 *
 * `z.uuid()` rather than `z.string().uuid()` — ROADMAP [R2] pins zod 4 and the
 * v3 spelling is deprecated there.
 *
 * The schemas are used by route handlers; the browser imports only the inferred
 * **types**, which erase at compile time. Import a schema as a value from a
 * client component and the whole of zod lands in that route's bundle.
 */

/* --------------------------------- Create --------------------------------- */

export const createVocabRequestSchema = z.object({
  // 120 pre-normalization: a paste carries quotes and spaces that normalizeTerm
  // strips. The real cap is MAX_TERM_CHARS, enforced after normalizing.
  term: z.string().min(1, "Type a word.").max(120, "Too long."),
});

export const vocabEntrySummarySchema = z.object({
  id: z.uuid(),
  term: z.string(),
  status: z.enum(["active", "mastered"]),
  enrichmentStatus: z.enum(["pending", "ready", "failed"]),
});

export const createVocabResponseSchema = vocabEntrySummarySchema.extend({
  duplicate: z.boolean(),
});

/* --------------------------------- Enrich --------------------------------- */

/**
 * What `enrichment_error` may hold. Kept as a machine code because the copy the
 * user sees differs sharply by cause and the detail page must pick it without a
 * second LLM call — which the roadmap forbids.
 */
export const ENRICHMENT_ERROR_CODES = [
  "llm_timeout",
  "llm_unreachable",
  "llm_rate_limited",
  "bad_response",
  "not_english",
  "unverified_spelling",
] as const;

export type EnrichmentErrorCode = (typeof ENRICHMENT_ERROR_CODES)[number];

export const enrichResponseSchema = z.object({
  id: z.uuid(),
  term: z.string(),
  enrichmentStatus: z.enum(["pending", "ready", "failed"]),
  partOfSpeech: z.string().nullable(),
  pronunciation: z.string().nullable(),
  definition: z.string().nullable(),
  examples: z.array(z.string()),
  suggestedCorrection: z.string().nullable(),
  enrichmentError: z.string().nullable(),
  attempts: z.number().int(),
});

/* ------------------------------- Correction -------------------------------- */

export const acceptCorrectionResponseSchema = z.object({
  /** `merged` means this entry is gone and `id` points at the survivor. */
  outcome: z.enum(["renamed", "merged", "noop"]),
  id: z.uuid(),
  term: z.string(),
});

export const dismissCorrectionResponseSchema = z.object({
  id: z.uuid(),
  enrichmentStatus: z.enum(["pending", "ready", "failed"]),
  enrichmentError: z.string().nullable(),
});

/* ---------------------------------- Types ---------------------------------- */

export type CreateVocabRequest = z.infer<typeof createVocabRequestSchema>;
export type VocabEntrySummary = z.infer<typeof vocabEntrySummarySchema>;
export type CreateVocabResponse = z.infer<typeof createVocabResponseSchema>;
export type EnrichResponse = z.infer<typeof enrichResponseSchema>;
export type AcceptCorrectionResponse = z.infer<typeof acceptCorrectionResponseSchema>;
export type DismissCorrectionResponse = z.infer<typeof dismissCorrectionResponseSchema>;
