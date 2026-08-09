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

/**
 * Declared first because three later schemas reference it. A `const` referenced
 * above its own declaration is a TDZ ReferenceError at import time, not a
 * compile error — and the first thing to see it would be a route handler.
 */
export const vocabStatusSchema = z.enum(["active", "mastered"]);

/* --------------------------------- Create --------------------------------- */

export const createVocabRequestSchema = z.object({
  // 120 pre-normalization: a paste carries quotes and spaces that normalizeTerm
  // strips. The real cap is MAX_TERM_CHARS, enforced after normalizing.
  term: z.string().min(1, "Type a word.").max(120, "Too long."),
  /**
   * F14 D5. The user was shown "that looks like `study`, which you already
   * have" and asked for it anyway.
   *
   * Named for exactly what it does. It is **not** "bypass the unique index":
   * the `23505` catch runs regardless, so a forced add of an exact duplicate
   * still comes back as `outcome: 'duplicate'` with the row the user already
   * holds. The only thing it skips is the morphological fold.
   */
  allowNearDuplicate: z.boolean().default(false),
});

export const vocabEntrySummarySchema = z.object({
  id: z.uuid(),
  term: z.string(),
  status: z.enum(["active", "mastered"]),
  enrichmentStatus: z.enum(["pending", "ready", "failed"]),
});

/**
 * F14 D6: a discriminant, not two booleans.
 *
 * `created` is the only outcome whose `id` is a row this request wrote.
 * `duplicate` and `near_duplicate` both point at a row that already existed —
 * and getting that wrong means the client enriches, chips and links somebody
 * else's word as though it were new. `duplicate: boolean` alongside a second
 * flag would have been two booleans where one of them changes what the `id`
 * refers to, which is a trap; one word is not.
 *
 * Supersedes F3 §6.1's `duplicate: boolean`. `201` for `created`, `200` for the
 * other two, unchanged for the two cases that existed before F14.
 */
export const createVocabResponseSchema = vocabEntrySummarySchema.extend({
  outcome: z.enum(["created", "duplicate", "near_duplicate"]),
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

/**
 * Every outcome carries the surviving entry, and every outcome is a `200`.
 *
 * Supersedes F3 §6.3's `409 in_use` row, which read:
 *
 * > "| Merge blocked | `409` | `error: "in_use"`. The misspelled entry is
 * > referenced by `daily_card_items` and cannot be deleted. Clear the
 * > suggestion and leave both entries. |"
 *
 * F14 D2: nothing failed there. The user asked to merge, [R1] says a past card
 * is a record of a day that happened, so we kept both **on purpose** and can say
 * so in a sentence. Filing it as an error envelope is what forced the survivor's
 * id to be thrown away — `{error:{code,message}}` has nowhere to put one — and
 * the client then could not offer a way to the word the user actually meant.
 */
export const acceptCorrectionResponseSchema = z.object({
  /**
   * `merged` — the typo is gone and `id` points at the spelling that survived.
   * `kept_both` — [R1] refused the delete; both rows exist and `id` is the
   * survivor, not the entry that was posted.
   * `renamed` / `noop` — `id` is the entry that was posted.
   */
  outcome: z.enum(["renamed", "merged", "kept_both", "noop"]),
  id: z.uuid(),
  term: z.string(),
  /**
   * The survivor's status. F14 Gap 1e: merging into a *mastered* word produces
   * nothing any future card can show, and "You already had genteel." does not
   * say that. The notice offers "Put it back in rotation" off this field.
   */
  status: vocabStatusSchema,
  /**
   * F14 D4. `chat_sessions.vocab_entry_id` is `ON DELETE CASCADE` ([R5]: days
   * are permanent, practice is not), so a merge can silently destroy eight turns
   * of practice on the misspelling. The loss is roadmap policy; being quiet
   * about it is not.
   */
  practiceLost: z.boolean(),
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
  /** `'shared'` is F17's — a word claimed from a share link. */
  source: z.enum(["manual", "suggested", "shared"]),
  enrichmentError: z.string().nullable(),
  /**
   * [R1]: a word that has ever appeared on a daily card cannot be deleted. The
   * detail page reads this to decide whether to draw Delete or the sentence
   * that explains its absence.
   */
  carded: z.boolean(),
  /**
   * F14 D1, and the point of the plan. F3 §5 already said the suggestion "must
   * survive an app close, a reload, and a navigation to the detail page" —
   * only the last clause was never built, because `toDetail` did not carry the
   * column and this schema had no field for it.
   *
   * Without it a stranded `genteell` keeps genteel's definition forever, is
   * fully eligible for tomorrow's card (`selectCardCandidates` filters on
   * `status = 'active'` and nothing else), and once carded can never be deleted
   * or merged. Supersedes F4 §7.3, whose height budget is untouched in the
   * default case: this is `null` for every word that was spelled correctly.
   */
  suggestedCorrection: z.string().nullable(),
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

/* -------------------------------- Discovery -------------------------------- */

/**
 * F8's two routes.
 *
 * Both are POST: one costs LLM quota, the other writes a row, and neither is
 * idempotent.
 */

export const suggestRequestSchema = z.object({
  /**
   * Terms declined earlier in this browser session. Client-held and
   * best-effort — a reload loses them by design ([R1] left no table for this
   * and F8 §9 D2 rejected adding one).
   */
  exclude: z.array(z.string().min(1).max(64)).max(50).default([]),
});

export const suggestionSchema = z.object({
  term: z.string(),
  partOfSpeech: z.enum(["noun", "verb", "adjective", "adverb"]),
  /** ≤ 80 characters. **A preview to decide by. Never persisted.** */
  gloss: z.string(),
});

export const suggestResponseSchema = z.object({
  suggestions: z.array(suggestionSchema),
  /** True when the model ran and everything it offered was already held. */
  exhausted: z.boolean(),
});

/**
 * `z.strictObject`, and that is the point of this schema.
 *
 * Note what is absent: no `source`, no `definition`, no `gloss`, no
 * `partOfSpeech`. `source` is forced to `'suggested'` in the route, and
 * everything descriptive comes from F3's enrichment. A client that posts
 * `{"term":"winnow","source":"manual"}` gets a 400 rather than a row it
 * authored the provenance of.
 */
export const acceptSuggestionRequestSchema = z.strictObject({
  term: z.string().min(2).max(64),
});

export const acceptSuggestionResponseSchema = z.object({
  id: z.uuid(),
  term: z.string(),
  enrichmentStatus: z.enum(["pending", "ready", "failed"]),
  /** A **success**: the term arrived between the suggestion and the tap. */
  alreadyExisted: z.boolean(),
  /**
   * F14 D7. The route's logic is unchanged — its re-check stays **exact only**,
   * because the fold has already run against the whole collection in
   * `lib/vocab/suggest.ts` and a collision here can therefore only be a race,
   * which is an exact match. What changes is that the panel can now tell a
   * mastered pre-existing row from an active one instead of adding a "Kept"
   * chip for a word no card will ever show.
   */
  status: vocabStatusSchema,
});

/* ---------------------------------- Types ---------------------------------- */

export type VocabStatus = z.infer<typeof vocabStatusSchema>;
export type ListVocabQuery = z.infer<typeof listVocabQuerySchema>;
export type VocabListItem = z.infer<typeof vocabListItemSchema>;
export type ListVocabResponse = z.infer<typeof listVocabResponseSchema>;
export type VocabDetailResponse = z.infer<typeof vocabDetailResponseSchema>;
export type PatchVocabBody = z.infer<typeof patchVocabBodySchema>;
export type DeleteVocabResponse = z.infer<typeof deleteVocabResponseSchema>;

export type SuggestRequest = z.infer<typeof suggestRequestSchema>;
export type Suggestion = z.infer<typeof suggestionSchema>;
export type SuggestResponse = z.infer<typeof suggestResponseSchema>;
export type AcceptSuggestionRequest = z.infer<typeof acceptSuggestionRequestSchema>;
export type AcceptSuggestionResponse = z.infer<typeof acceptSuggestionResponseSchema>;

export type CreateVocabRequest = z.infer<typeof createVocabRequestSchema>;
export type VocabEntrySummary = z.infer<typeof vocabEntrySummarySchema>;
export type CreateVocabResponse = z.infer<typeof createVocabResponseSchema>;
export type EnrichResponse = z.infer<typeof enrichResponseSchema>;
export type AcceptCorrectionResponse = z.infer<typeof acceptCorrectionResponseSchema>;
export type DismissCorrectionResponse = z.infer<typeof dismissCorrectionResponseSchema>;
