import { z } from "zod";
import { requireApiUser } from "@/lib/api/guards";
import { fail, ok, readJson } from "@/lib/api/respond";
import { deleteEntry, getEntry, updateEntry } from "@/lib/db/queries/journal";
import { getUserTimezone } from "@/lib/db/queries/profiles";
import { patchEntrySchema, type JournalEntryResponse } from "@/lib/journal/schemas";
import { toJournalEntryDto } from "@/lib/journal/serialize";

export const runtime = "nodejs";

/**
 * One entry: read it, edit it, delete it.
 *
 * Every handler here answers `404` for an id that belongs to somebody else,
 * never `403` — a 403 confirms the id exists.
 */

/**
 * A malformed id must never reach the database: compared against a `uuid` column
 * it is a cast error and a 500, where the honest answer is a 404.
 */
async function entryId(ctx: { params: Promise<{ id: string }> }): Promise<string | null> {
  const { id } = await ctx.params;
  const parsed = z.uuid().safeParse(id);
  return parsed.success ? parsed.data : null;
}

const NOT_FOUND = () => fail(404, "That entry is gone.", "not_found");

/** Used by the client to re-read one row after a `409` — never by the pages. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const id = await entryId(ctx);
  if (!id) return NOT_FOUND();

  const row = await getEntry(auth.user.id, id);
  if (!row) return NOT_FOUND();

  const timezone = await getUserTimezone(auth.user.id);
  return ok<JournalEntryResponse>({ entry: toJournalEntryDto(row, timezone) });
}

/**
 * Edit the text, the source note, or both.
 *
 * Whether the stored insight survives is decided in SQL, in one statement —
 * see `updateEntry`. Changing the text clears it; changing only the note keeps
 * it.
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const id = await entryId(ctx);
  if (!id) return NOT_FOUND();

  const body = await readJson(req, patchEntrySchema);
  if (!body.ok) return body.response;

  const row = await updateEntry(auth.user.id, id, body.data);
  if (!row) return NOT_FOUND();

  const timezone = await getUserTimezone(auth.user.id);
  return ok<JournalEntryResponse>({ entry: toJournalEntryDto(row, timezone) });
}

/**
 * Hard delete. Nothing references a journal entry.
 *
 * A second `DELETE` of the same id is a `404`: the row is gone either way, and
 * the client treats both answers as success — it has already navigated.
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const id = await entryId(ctx);
  if (!id) return NOT_FOUND();

  const deleted = await deleteEntry(auth.user.id, id);
  if (!deleted) return NOT_FOUND();

  return new Response(null, { status: 204 });
}
