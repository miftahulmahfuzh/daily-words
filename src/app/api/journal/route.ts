import { requireApiUser } from "@/lib/api/guards";
import { fail, ok, readJson } from "@/lib/api/respond";
import { createEntry, listEntries } from "@/lib/db/queries/journal";
import { upsertEmbedding } from "@/lib/db/queries/journal-embeddings";
import { getUserTimezone } from "@/lib/db/queries/profiles";
import { cursorFor, decodeCursor, encodeCursor } from "@/lib/journal/cursor";
import { checkForDuplicate, logDuplicateCheck } from "@/lib/journal/duplicate-check";
import { NEAR_DUPLICATE_MAX_DISTANCE } from "@/lib/journal/similarity";
import {
  createEntrySchema,
  listJournalQuerySchema,
  type CreateEntryResult,
  type ListJournalResponse,
} from "@/lib/journal/schemas";
import {
  toDuplicateMatchDto,
  toJournalEntryDto,
  toJournalEntryDtos,
} from "@/lib/journal/serialize";

export const runtime = "nodejs";

/**
 * The journal's list and its save. **Neither calls the model.**
 *
 * Insight is opt-in, per entry, from a button on the entry page — keeping a line
 * must cost nothing, which is Product Principle 5 in the one place a user is
 * most likely to be in a hurry.
 */

/**
 * One page of the caller's journal, newest first.
 *
 * `/journal` itself renders page 1 from the database in the server component;
 * this route serves `Load more` and nothing else, per the app's rule that a page
 * never fetches its own first paint.
 */
export async function GET(req: Request): Promise<Response> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const params = new URL(req.url).searchParams;
  const query = listJournalQuerySchema.safeParse(Object.fromEntries(params));
  if (!query.success) return fail(400, "Could not read that request.", "invalid_query");
  const { cursor: rawCursor, limit } = query.data;

  const cursor = rawCursor ? decodeCursor(rawCursor) : null;
  if (rawCursor && !cursor) {
    return fail(400, "Could not read that request.", "invalid_cursor");
  }

  const timezone = await getUserTimezone(auth.user.id);
  // limit + 1 probes for a further page without a second count query.
  const rows = await listEntries(auth.user.id, { cursor, limit: limit + 1 });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];

  return ok<ListJournalResponse>({
    entries: toJournalEntryDtos(page, timezone),
    nextCursor:
      hasMore && last ? encodeCursor(cursorFor(last)) : null,
  });
}

/**
 * Save a line. Auth, validate, a duplicate check, one INSERT.
 *
 * No uniqueness on `(user_id, text)` and none wanted: the same saying may be
 * met twice and kept twice, and a rejection at the exact moment the screen
 * promises frictionless saving would be the worst possible trade.
 *
 * **Amended by F15 [S4].** The route now looks for a near-duplicate before it
 * inserts — but the sentence above is why it *warns* instead of refusing. A
 * near-duplicate comes back as `{ status: "duplicate", match }` with the entry
 * the user already has and no row written; the composer offers "Keep it
 * anyway", which re-POSTs with `force: true` and skips the check. Three things
 * follow from the paragraph above and none of them may be traded away later:
 *   1. There is still no database constraint. The check is advisory.
 *   2. Any failure of the check — provider down, unconfigured, slow, an entry
 *      never embedded — falls through to the INSERT. Product Principle 5: the
 *      save must work.
 *   3. `force: true` is unconditional. It never re-checks, never rate-limits,
 *      and never asks twice.
 */
export async function POST(req: Request): Promise<Response> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const body = await readJson(req, createEntrySchema);
  if (!body.ok) return body.response;

  const timezone = await getUserTimezone(auth.user.id);
  const check = await checkForDuplicate(auth.user.id, body.data.text, {
    force: body.data.force,
  });
  logDuplicateCheck(auth.user.id, check, NEAR_DUPLICATE_MAX_DISTANCE);

  if (check.verdict === "duplicate" && check.match) {
    // 200, not a 4xx. Nothing went wrong: the user is being shown a line and
    // offered a choice, and `lib/api/client` would render a 4xx as a problem.
    return ok<CreateEntryResult>({
      status: "duplicate",
      match: toDuplicateMatchDto(check.match, timezone),
    });
  }

  const row = await createEntry(
    auth.user.id,
    body.data.text,
    body.data.sourceNote ?? null,
  );

  // The sibling row, after the insert and never before it — the FK is on
  // `entry_id`. This is what records `norm_sha`, so the *next* save can be
  // checked by Layer 1 even where no provider was ever configured. A failure
  // here must not lose a row the user has already been shown, so it is caught
  // and logged rather than thrown.
  try {
    await upsertEmbedding(auth.user.id, row.id, check.sibling);
  } catch (err) {
    console.error(`[journal.dedup] sibling write failed for ${row.id}`, err);
  }

  return ok<CreateEntryResult>(
    { status: "saved", entry: toJournalEntryDto(row, timezone) },
    201,
  );
}
