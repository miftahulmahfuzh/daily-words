import { requireApiUser } from "@/lib/api/guards";
import { fail, ok, readJson } from "@/lib/api/respond";
import { isUniqueViolation } from "@/lib/db/errors";
import {
  countEntriesCreatedSince,
  createLookedUpVocabEntry,
  createVocabEntry,
  findEntryByNormalizedTerm,
  listTermsForDedup,
  listVocabEntries,
  DAILY_ADD_LIMIT,
  type DedupRow,
  type VocabOrigin,
} from "@/lib/db/queries/vocab";
import { env } from "@/lib/env";
import { decodeCursor, encodeCursor } from "@/lib/vocab/cursor";
import { decodeLookupToken } from "@/lib/vocab/lookup-token";
import { findNearDuplicate } from "@/lib/vocab/near-duplicate";
import {
  normalizeContext,
  normalizeTerm,
  validateContext,
  validateTerm,
} from "@/lib/vocab/normalize";
import {
  createVocabRequestSchema,
  listVocabQuerySchema,
  type CreateVocabResponse,
  type ListVocabResponse,
} from "@/lib/vocab/schemas";
import { toListItem, toSummary } from "@/lib/vocab/serialize";

export const runtime = "nodejs";

/**
 * The fast path: auth, validate, one INSERT. **No LLM call, ever.**
 *
 * F3 §9 D1 in one sentence — the durable write is split out from the model call
 * so it cannot time out. A combined request that hits Vercel's function ceiling
 * returns a 504 the client cannot interpret: the user does not know whether
 * their word was saved, and there is no id to retry enrichment against. Here
 * the word is durable the moment this returns, and everything else is
 * recoverable from a button.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One page of the caller's collection. F4's `load more` is the only caller —
 * `/vocab` itself renders page 1 from the database server-side, per the
 * roadmap's rule that a page never fetches its own first paint.
 *
 * Junk query params degrade rather than 400: a bookmarked URL should show the
 * list. The one exception is an undecodable `cursor`, because silently ignoring
 * it would restart the scroll at page 1 forever and the user would watch the
 * same fifty words append themselves.
 */
export async function GET(req: Request): Promise<Response> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const params = new URL(req.url).searchParams;
  const query = listVocabQuerySchema.safeParse(Object.fromEntries(params));
  if (!query.success) return fail(400, "Could not read that request.", "invalid_query");
  const { q, cursor: rawCursor, limit } = query.data;

  const cursor = rawCursor ? decodeCursor(rawCursor) : null;
  if (rawCursor && !cursor) return fail(400, "Could not read that request.", "invalid_cursor");

  // limit + 1 probes for a further page without a second count query.
  const rows = await listVocabEntries(auth.user.id, { q, cursor, limit: limit + 1 });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];

  return ok<ListVocabResponse>({
    items: page.map(toListItem),
    nextCursor:
      hasMore && last ? encodeCursor({ term: last.sortKey, id: last.id }) : null,
  });
}

/** A scanned row, in the shape the wire wants. It is already a full summary. */
const rowSummary = (row: DedupRow) => ({
  id: row.id,
  term: row.term,
  status: row.status,
  enrichmentStatus: row.enrichmentStatus,
});

export async function POST(req: Request): Promise<Response> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const userId = auth.user.id;

  const body = await readJson(req, createVocabRequestSchema);
  if (!body.ok) return body.response;

  /**
   * The non-English path, and the one branch in this route that is not the
   * typed add. Its presence is decided by the token alone: a body carrying
   * `originTerm` without a valid `lookup` is an ordinary typed add, because the
   * origin columns must never be reachable without a resolution that produced
   * them.
   *
   * **Still no model call here.** The entry was produced by
   * `POST /api/vocab/lookup` and travelled through the browser under an HMAC, so
   * this route remains "auth, validate, one INSERT" exactly as F3 D1 requires.
   * What the signature buys is that `enrichment_status: 'ready'` continues to
   * mean "these four fields were written by the model" — the property F17's
   * claim path copies into a stranger's collection.
   */
  const lookup = body.data.lookup
    ? decodeLookupToken(body.data.lookup, env.AUTH_SECRET)
    : null;
  if (body.data.lookup && !lookup) {
    return fail(400, "That lookup has expired. Look the word up again.", "lookup_expired");
  }

  /**
   * With a lookup, the term is the model's resolved English word — never
   * `body.term`, which the client could disagree with. Re-normalised and
   * re-validated regardless: the token proves we minted the value, not that the
   * value is still one this route would accept.
   */
  const term = normalizeTerm(lookup ? lookup.term : body.data.term);
  const valid = validateTerm(term);
  if (!valid.ok) return fail(400, valid.message, valid.code);

  /**
   * The origin is the user's own typing and is deliberately outside the
   * signature, so it is validated here exactly as it was on the way out. The
   * language is taken from the token instead, because that half *is* model
   * output.
   */
  let origin: VocabOrigin | null = null;
  if (lookup) {
    const originTerm = normalizeTerm(body.data.originTerm ?? "");
    const validOrigin = validateTerm(originTerm);
    if (!validOrigin.ok) return fail(400, validOrigin.message, validOrigin.code);

    const rawContext = body.data.originContext ?? "";
    const validContext = validateContext(rawContext);
    if (!validContext.ok) return fail(400, validContext.message, validContext.code);

    origin = {
      term: originTerm,
      language: lookup.language,
      context: normalizeContext(rawContext) || null,
    };
  }

  /**
   * One name for "write the row", so the `23505` retry below stays a single line
   * and cannot drift out of step with the first attempt — which is exactly how a
   * looked-up word would come back from a lost race as a bare `pending` row with
   * its origin silently dropped.
   */
  const insert = () =>
    lookup && origin
      ? createLookedUpVocabEntry(
          userId,
          term,
          {
            partOfSpeech: lookup.partOfSpeech,
            pronunciation: lookup.pronunciation,
            definition: lookup.definition,
            examples: lookup.examples,
          },
          origin,
        )
      : createVocabEntry(userId, term);

  const recent = await countEntriesCreatedSince(userId, new Date(Date.now() - DAY_MS));
  if (recent >= DAILY_ADD_LIMIT) {
    return fail(429, "That's 50 words in a day. Come back tomorrow.", "daily_limit");
  }

  /**
   * F14 D5's duplicate layer, between validation and the insert. No row is
   * written and no model call is made for either non-`created` outcome.
   *
   * **No status filter on the read** — a mastered word must still be found, for
   * the same reason it still blocks a suggestion.
   *
   * The exact test is `toLowerCase()` here rather than Postgres `lower()`, and
   * the two can disagree (Turkish dotted I, final sigma). That is safe *because*
   * of the `23505` catch below: where JS says "new" and the index says
   * "duplicate", the insert throws, the row is re-read, and the answer is still
   * `duplicate`. The scan is an optimisation on the message, never the gate.
   */
  const held = await listTermsForDedup(userId);
  const lowered = term.toLowerCase();

  const exact = held.find((row) => row.term.toLowerCase() === lowered);
  if (exact) {
    return ok<CreateVocabResponse>({ ...rowSummary(exact), outcome: "duplicate" });
  }

  if (!body.data.allowNearDuplicate) {
    const near = findNearDuplicate(held, term);
    if (near) {
      return ok<CreateVocabResponse>({ ...rowSummary(near), outcome: "near_duplicate" });
    }
  }

  try {
    const entry = await insert();
    return ok<CreateVocabResponse>({ ...toSummary(entry), outcome: "created" }, 201);
  } catch (err) {
    if (!isUniqueViolation(err)) {
      console.error("[api/vocab] insert failed", err);
      return fail(500, "Could not save that. Try again.", "insert_failed");
    }

    const existing = await findEntryByNormalizedTerm(userId, term);
    if (existing) {
      return ok<CreateVocabResponse>({ ...toSummary(existing), outcome: "duplicate" });
    }

    // The row that collided is not there any more — the only way to reach this
    // is a delete landing between the two statements. One retry, then give up;
    // a loop here would be a spin against a live writer.
    try {
      const entry = await insert();
      return ok<CreateVocabResponse>({ ...toSummary(entry), outcome: "created" }, 201);
    } catch (retryErr) {
      console.error("[api/vocab] insert failed after 23505 retry", retryErr);
      return fail(500, "Could not save that. Try again.", "insert_failed");
    }
  }
}
