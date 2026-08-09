import { requireApiUser } from "@/lib/api/guards";
import { fail, ok, readJson } from "@/lib/api/respond";
import { createEntry, listEntries } from "@/lib/db/queries/journal";
import { getUserTimezone } from "@/lib/db/queries/profiles";
import { cursorFor, decodeCursor, encodeCursor } from "@/lib/journal/cursor";
import {
  createEntrySchema,
  listJournalQuerySchema,
  type JournalEntryResponse,
  type ListJournalResponse,
} from "@/lib/journal/schemas";
import { toJournalEntryDto, toJournalEntryDtos } from "@/lib/journal/serialize";

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
 * Save a line. Auth, validate, one INSERT.
 *
 * No uniqueness on `(user_id, text)` and none wanted: the same saying may be
 * met twice and kept twice, and a rejection at the exact moment the screen
 * promises frictionless saving would be the worst possible trade.
 */
export async function POST(req: Request): Promise<Response> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const body = await readJson(req, createEntrySchema);
  if (!body.ok) return body.response;

  const timezone = await getUserTimezone(auth.user.id);
  const row = await createEntry(
    auth.user.id,
    body.data.text,
    body.data.sourceNote ?? null,
  );

  return ok<JournalEntryResponse>({ entry: toJournalEntryDto(row, timezone) }, 201);
}
