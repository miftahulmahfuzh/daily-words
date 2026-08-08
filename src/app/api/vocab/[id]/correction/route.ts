import { z } from "zod";
import { requireApiUser } from "@/lib/api/guards";
import { fail, ok } from "@/lib/api/respond";
import { applyCorrection, clearCorrection } from "@/lib/db/queries/vocab";
import type {
  AcceptCorrectionResponse,
  DismissCorrectionResponse,
} from "@/lib/vocab/schemas";

export const runtime = "nodejs";

const idSchema = z.uuid();

/**
 * Accepting or dismissing "did you mean genteel?".
 *
 * Neither verb takes a body. The corrected word is read from the row, never from
 * the request, so a tab left open for a week cannot rename an entry to something
 * the user never saw. Both are idempotent: the second tap finds no suggestion
 * and says so rather than doing something.
 */

async function readId(ctx: { params: Promise<{ id: string }> }) {
  return idSchema.safeParse((await ctx.params).id);
}

/** Accept — rename, or merge into the spelling the user already had. */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const parsed = await readId(ctx);
  if (!parsed.success) return fail(400, "No such word.", "bad_id");

  const result = await applyCorrection(auth.user.id, parsed.data);

  switch (result.outcome) {
    case "not_found":
      return fail(404, "That word is gone.", "not_found");

    case "in_use":
      // [R1]: a word that has ever been carded cannot be deleted, so the merge
      // is refused and both spellings survive. Unreachable for a word added a
      // second ago; reachable from F4's retry path on an older one.
      return fail(409, "Kept both — this one is already on a card.", "in_use");

    default:
      return ok<AcceptCorrectionResponse>({
        outcome: result.outcome,
        id: result.entry.id,
        term: result.entry.term,
      });
  }
}

/**
 * Dismiss — the user asserts the spelling they typed was meant.
 *
 * This clears the definition, pronunciation, part of speech and examples along
 * with the suggestion, because all of them described the *corrected* word. The
 * entry lands in `failed` / `unverified_spelling`, which is the honest state:
 * the word is kept, and the app has nothing true to say about it.
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const parsed = await readId(ctx);
  if (!parsed.success) return fail(400, "No such word.", "bad_id");

  const row = await clearCorrection(auth.user.id, parsed.data);
  if (!row) return fail(404, "That word is gone.", "not_found");

  return ok<DismissCorrectionResponse>({
    id: row.id,
    enrichmentStatus: row.enrichmentStatus,
    enrichmentError: row.enrichmentError,
  });
}
