import { z } from "zod";
import { MAX_SEARCH_CHARS, VOCAB_PAGE_SIZE } from "@/lib/vocab/format";

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

/* -------------------------------- Collection ------------------------------- */

/**
 * F4's shapes. The collection is ordered alphabetically and nothing else — the
 * design ([R18], the visual source of truth) draws a search field and A–Z
 * groups, with no status chips and no sort menu, so there is no `sort` or
 * `status` parameter to validate.
 */

export const vocabStatusSchema = z.enum(["active", "mastered"]);

/**
 * `GET /api/vocab` query string.
 *
 * Deliberately total: every field either has a `.catch()` or is optional, so a
 * bookmarked URL carrying junk shows the list rather than an error page. The
 * one thing that can 400 is an undecodable cursor, which is checked in the
 * route — a bad cursor would silently return page 1 forever.
 *
 * `q` slices rather than `.max()`: a pasted paragraph should degrade to a
 * search, not a rejection.
 */
export const listVocabQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .transform((s) => s.slice(0, MAX_SEARCH_CHARS))
    .optional(),
  cursor: z.string().max(256).optional(),
  limit: z.coerce.number().int().min(1).max(100).catch(VOCAB_PAGE_SIZE),
});

export const vocabListItemSchema = z.object({
  id: z.uuid(),
  term: z.string(),
  definition: z.string().nullable(),
  status: vocabStatusSchema,
  enrichmentStatus: z.enum(["pending", "ready", "failed"]),
});

export const listVocabResponseSchema = z.object({
  items: z.array(vocabListItemSchema),
  /** Opaque. Null at the end of the collection. */
  nextCursor: z.string().nullable(),
});

export const vocabDetailResponseSchema = vocabListItemSchema.extend({
  partOfSpeech: z.string().nullable(),
  pronunciation: z.string().nullable(),
  examples: z.array(z.string()),
  source: z.enum(["manual", "suggested"]),
  enrichmentError: z.string().nullable(),
  /**
   * [R1]: a word that has ever appeared on a daily card cannot be deleted. The
   * detail page reads this to decide whether to draw Delete or the sentence
   * that explains its absence.
   */
  carded: z.boolean(),
});

/**
 * `PATCH /api/vocab/[id]` body.
 *
 * `op` is carried even though there is exactly one operation: it keeps the
 * route extensible without a second endpoint, and it makes a malformed body
 * loud. Status is an **absolute target, not a toggle verb** — two phones, a
 * double tap and a retried request all converge on the same state.
 */
export const patchVocabBodySchema = z.object({
  op: z.literal("set_status"),
  status: vocabStatusSchema,
});

export const deleteVocabResponseSchema = z.object({
  id: z.uuid(),
  deleted: z.literal(true),
});

/* ---------------------------------- Types ---------------------------------- */

export type VocabStatus = z.infer<typeof vocabStatusSchema>;
export type ListVocabQuery = z.infer<typeof listVocabQuerySchema>;
export type VocabListItem = z.infer<typeof vocabListItemSchema>;
export type ListVocabResponse = z.infer<typeof listVocabResponseSchema>;
export type VocabDetailResponse = z.infer<typeof vocabDetailResponseSchema>;
export type PatchVocabBody = z.infer<typeof patchVocabBodySchema>;
export type DeleteVocabResponse = z.infer<typeof deleteVocabResponseSchema>;

export type CreateVocabRequest = z.infer<typeof createVocabRequestSchema>;
export type VocabEntrySummary = z.infer<typeof vocabEntrySummarySchema>;
export type CreateVocabResponse = z.infer<typeof createVocabResponseSchema>;
export type EnrichResponse = z.infer<typeof enrichResponseSchema>;
export type AcceptCorrectionResponse = z.infer<typeof acceptCorrectionResponseSchema>;
export type DismissCorrectionResponse = z.infer<typeof dismissCorrectionResponseSchema>;
