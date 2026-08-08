import { requireApiUser } from "@/lib/api/guards";
import { fail, ok, readJson } from "@/lib/api/respond";
import {
  countEntriesCreatedSince,
  createVocabEntry,
  findEntryByNormalizedTerm,
  listVocabEntries,
  DAILY_ADD_LIMIT,
} from "@/lib/db/queries/vocab";
import { decodeCursor, encodeCursor } from "@/lib/vocab/cursor";
import { normalizeTerm, validateTerm } from "@/lib/vocab/normalize";
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
 * `UNIQUE (user_id, lower(term))` is caught rather than pre-checked: a
 * pre-check is a race, and two devices adding the same word at once is a real
 * case (§11 E17). Drizzle wraps driver errors, so the code may be one level down.
 */
function isUniqueViolation(err: unknown): boolean {
  const code = (e: unknown) =>
    typeof e === "object" && e !== null && "code" in e
      ? (e as { code?: unknown }).code
      : undefined;
  if (code(err) === "23505") return true;
  const cause = typeof err === "object" && err !== null ? (err as { cause?: unknown }).cause : undefined;
  return code(cause) === "23505";
}

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

export async function POST(req: Request): Promise<Response> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const userId = auth.user.id;

  const body = await readJson(req, createVocabRequestSchema);
  if (!body.ok) return body.response;

  const term = normalizeTerm(body.data.term);
  const valid = validateTerm(term);
  if (!valid.ok) return fail(400, valid.message, valid.code);

  const recent = await countEntriesCreatedSince(userId, new Date(Date.now() - DAY_MS));
  if (recent >= DAILY_ADD_LIMIT) {
    return fail(429, "That's 50 words in a day. Come back tomorrow.", "daily_limit");
  }

  try {
    const entry = await createVocabEntry(userId, term);
    return ok<CreateVocabResponse>({ ...toSummary(entry), duplicate: false }, 201);
  } catch (err) {
    if (!isUniqueViolation(err)) {
      console.error("[api/vocab] insert failed", err);
      return fail(500, "Could not save that. Try again.", "insert_failed");
    }

    const existing = await findEntryByNormalizedTerm(userId, term);
    if (existing) {
      return ok<CreateVocabResponse>({ ...toSummary(existing), duplicate: true });
    }

    // The row that collided is not there any more — the only way to reach this
    // is a delete landing between the two statements. One retry, then give up;
    // a loop here would be a spin against a live writer.
    try {
      const entry = await createVocabEntry(userId, term);
      return ok<CreateVocabResponse>({ ...toSummary(entry), duplicate: false }, 201);
    } catch (retryErr) {
      console.error("[api/vocab] insert failed after 23505 retry", retryErr);
      return fail(500, "Could not save that. Try again.", "insert_failed");
    }
  }
}
