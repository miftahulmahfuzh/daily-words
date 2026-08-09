import { requireApiUser } from "@/lib/api/guards";
import { fail, ok, readJson } from "@/lib/api/respond";
import { isUniqueViolation } from "@/lib/db/errors";
import {
  countEntriesCreatedSince,
  createVocabEntry,
  findEntryByNormalizedTerm,
  DAILY_ADD_LIMIT,
} from "@/lib/db/queries/vocab";
import { isSingleWord, normalizeForDedup } from "@/lib/vocab/dedup";
import {
  acceptSuggestionRequestSchema,
  type AcceptSuggestionResponse,
} from "@/lib/vocab/schemas";

export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Keep a proposed word. **No LLM call, ever.**
 *
 * Why F8 owns a route at all instead of posting to F3's `POST /api/vocab`: this
 * one has three jobs that endpoint has no reason to do — force
 * `source='suggested'` whatever the client sends, re-check the collection
 * against fresh state, and return `alreadyExisted` so the client can show the
 * user their word instead of an error. Reuse happens at the service and query
 * layer, not over HTTP.
 *
 * Enrichment is deliberately *not* here. The client fires `POST
 * /api/vocab/[id]/enrich` next — F3's single enrichment entry point for the
 * whole app — which is what keeps the word durable the moment this returns and
 * makes a dropped connection cost a retry button rather than an uninterpretable
 * 504. There is no second enrichment prompt anywhere in F8.
 *
 * The preview gloss the user just read is not accepted, not stored, and not
 * referenced below. The definition that lands is F3's.
 */
export async function POST(req: Request): Promise<Response> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const userId = auth.user.id;

  const body = await readJson(req, acceptSuggestionRequestSchema);
  if (!body.ok) return body.response;

  /**
   * The lowercase single-word form is what gets stored. Stricter than F3's
   * `validateTerm`, which permits phrases: F8 only ever proposes single words,
   * so anything else on this route came from a hand-rolled request.
   */
  if (!isSingleWord(body.data.term)) return fail(400, "That is not a word.", "bad_term");
  const term = normalizeForDedup(body.data.term);

  /**
   * Layer 5, and it checks the **exact** normalised form rather than the
   * morphological fold.
   *
   * The fold's job is to stop near-duplicates being *proposed*; once the user
   * has looked at a word and chosen to keep it, refusing them because it shares
   * a root with something they own would be a rejection with no visible cause.
   * What this guards is the case layer 5 was written for — the word arriving in
   * another tab between the suggestion and the tap — and that is an exact match,
   * which is also precisely what `UNIQUE (user_id, lower(term))` enforces.
   */
  const existing = await findEntryByNormalizedTerm(userId, term);
  if (existing) {
    return ok<AcceptSuggestionResponse>({
      id: existing.id,
      term: existing.term,
      enrichmentStatus: existing.enrichmentStatus,
      alreadyExisted: true,
    });
  }

  // The same rolling-window cap F3's add path carries. One collection, one
  // limit — Discover must not be the way around it.
  const recent = await countEntriesCreatedSince(userId, new Date(Date.now() - DAY_MS));
  if (recent >= DAILY_ADD_LIMIT) {
    return fail(429, "That's 50 words in a day. Come back tomorrow.", "daily_limit");
  }

  try {
    // `'suggested'` is a literal here and is never read from the body. F9 counts
    // manually added words for the collector level, so a client that could set
    // this could inflate its own level.
    const entry = await createVocabEntry(userId, term, "suggested");
    return ok<AcceptSuggestionResponse>(
      {
        id: entry.id,
        term: entry.term,
        enrichmentStatus: entry.enrichmentStatus,
        alreadyExisted: false,
      },
      201,
    );
  } catch (err) {
    if (!isUniqueViolation(err)) {
      console.error("[api/vocab/suggestions/accept] insert failed", err);
      return fail(502, "Could not save that one. Try again.", "create_failed");
    }

    // Two tabs accepted the same term at once. One row exists; both clients get
    // its id, and neither sees a unique violation.
    const raced = await findEntryByNormalizedTerm(userId, term);
    if (raced) {
      return ok<AcceptSuggestionResponse>({
        id: raced.id,
        term: raced.term,
        enrichmentStatus: raced.enrichmentStatus,
        alreadyExisted: true,
      });
    }

    // The row that collided is already gone — a delete landed between the two
    // statements. No retry loop: that would be a spin against a live writer.
    console.error("[api/vocab/suggestions/accept] 23505 with no surviving row");
    return fail(502, "Could not save that one. Try again.", "create_failed");
  }
}
