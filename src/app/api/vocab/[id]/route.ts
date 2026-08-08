import { z } from "zod";
import { requireApiUser } from "@/lib/api/guards";
import { fail, ok, readJson } from "@/lib/api/respond";
import {
  deleteVocabEntry,
  getVocabEntryDetail,
  setVocabStatus,
} from "@/lib/db/queries/vocab";
import {
  patchVocabBodySchema,
  type DeleteVocabResponse,
  type VocabDetailResponse,
} from "@/lib/vocab/schemas";
import { toDetail } from "@/lib/vocab/serialize";

export const runtime = "nodejs";

/**
 * One word: read it, retire it, remove it.
 *
 * Every handler answers **404 and never 403** for an id belonging to another
 * user. A 403 confirms the row exists, which turns the id space into an oracle
 * somebody can walk one guess at a time.
 */

const idSchema = z.uuid();

const NOT_FOUND = "That word is gone.";

/** [R1], verbatim. The one sentence that explains a refused delete. */
const IN_USE = "This word is on past cards. Mark it mastered to retire it.";

async function readId(
  ctx: { params: Promise<{ id: string }> },
): Promise<{ ok: true; id: string } | { ok: false; response: Response }> {
  const parsed = idSchema.safeParse((await ctx.params).id);
  // A malformed id never reaches the database — `/vocab/discover` typed by hand
  // would otherwise be a cast error rather than a 404.
  if (!parsed.success) return { ok: false, response: fail(404, NOT_FOUND, "not_found") };
  return { ok: true, id: parsed.data };
}

/**
 * Present for the client components' reconciliation after a mutation. The
 * detail page itself reads the database server-side and never calls this.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const parsed = await readId(ctx);
  if (!parsed.ok) return parsed.response;

  const entry = await getVocabEntryDetail(auth.user.id, parsed.id);
  if (!entry) return fail(404, NOT_FOUND, "not_found");
  return ok<VocabDetailResponse>(toDetail(entry));
}

/**
 * `{ op: 'set_status', status }` — an absolute target, not a toggle verb, so a
 * double tap and a retried request both land on the state the user asked for
 * rather than the opposite of wherever the row happened to be.
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const parsed = await readId(ctx);
  if (!parsed.ok) return parsed.response;

  const body = await readJson(req, patchVocabBodySchema);
  if (!body.ok) return body.response;

  const updated = await setVocabStatus(auth.user.id, parsed.id, body.data.status);
  if (!updated) return fail(404, NOT_FOUND, "not_found");

  // Re-read for `carded`, which the UPDATE cannot return. One extra indexed
  // lookup on an action the user takes a handful of times a week.
  const entry = await getVocabEntryDetail(auth.user.id, parsed.id);
  if (!entry) return fail(404, NOT_FOUND, "not_found");
  return ok<VocabDetailResponse>(toDetail(entry));
}

/**
 * Hard delete, or a refusal with a sentence. [R1]: there are no tombstones.
 *
 * The refusal is a 409 rather than a 403 because nothing about permission is
 * wrong — the word simply has history, and `message` is shown to the user
 * verbatim, so the client needs no copy of its own.
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const parsed = await readId(ctx);
  if (!parsed.ok) return parsed.response;

  const outcome = await deleteVocabEntry(auth.user.id, parsed.id);

  if (outcome === "not_found") return fail(404, NOT_FOUND, "not_found");
  if (outcome === "in_use") return fail(409, IN_USE, "in_use");
  return ok<DeleteVocabResponse>({ id: parsed.id, deleted: true });
}
