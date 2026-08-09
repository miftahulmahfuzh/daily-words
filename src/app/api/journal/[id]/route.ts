import { z } from "zod";
import { requireApiUser } from "@/lib/api/guards";
import { fail, ok, readJson } from "@/lib/api/respond";
import { deleteEntry, getEntry, updateEntry } from "@/lib/db/queries/journal";
import { deleteSharesForEntity } from "@/lib/db/queries/shares";
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
 *
 * **F18 gave the share the same rule, and it is deliberately decided here rather
 * than in that statement.** A share is a snapshot of the text as it was when it
 * was shared, so an edited line leaves a public URL quoting something the owner
 * has replaced — and unlike a stale word definition that matters, because this is
 * the one entity whose derived text is *destroyed* by an edit. Editing the text
 * therefore revokes the share; editing only the source note revokes nothing,
 * mirroring the insight rule exactly.
 *
 * Why not fold it into `updateEntry`'s single statement: that comparison is
 * evaluated against the *old* row inside `SET`, and `RETURNING` sees the new
 * one, so the fact is not available to the caller without a self-join that would
 * make a load-bearing statement harder to read for a secondary concern. The
 * pre-read below costs one indexed lookup and is safe under the race the
 * statement's comment worries about: two concurrent editors both see the old
 * text and both revoke, which is idempotent, and a source-note edit racing a
 * text edit still leaves the text editor to revoke.
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

  const before = await getEntry(auth.user.id, id);
  if (!before) return NOT_FOUND();

  const row = await updateEntry(auth.user.id, id, body.data);
  if (!row) return NOT_FOUND();

  // `!== undefined` first: the client sends both fields on every save, so
  // "was text supplied" is not the question — "is it different" is.
  if (body.data.text !== undefined && body.data.text !== before.text) {
    await deleteSharesForEntity(auth.user.id, "journal", id);
  }

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
