import { z } from "zod";
import { requireApiUser } from "@/lib/api/guards";
import { fail, ok } from "@/lib/api/respond";
import { isUniqueViolation } from "@/lib/db/errors";
import { applyCorrection, clearCorrection } from "@/lib/db/queries/vocab";
import type { CorrectionOutcome } from "@/lib/db/queries/vocab";
import type {
  AcceptCorrectionResponse,
  DismissCorrectionResponse,
} from "@/lib/vocab/schemas";
import { toCorrectionResponse } from "@/lib/vocab/serialize";

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

/**
 * Accept — rename, or merge into the spelling the user already had.
 *
 * **Every outcome but `not_found` is a `200`**, including `kept_both`. F14 D2
 * supersedes F3 §6.3's `409 in_use` row:
 *
 * > "| Merge blocked | `409` | `error: "in_use"`. The misspelled entry is
 * > referenced by `daily_card_items` and cannot be deleted. …"
 *
 * Nothing failed there. The user asked to merge, [R1] says a past card is a
 * record of a day that happened, so both spellings were kept **on purpose**.
 * Filing a deliberate, successful, fully explained outcome as an error is what
 * forced the survivor's id onto the floor — `{error:{code,message}}` has nowhere
 * to put one — and left the client unable to offer a way to the word the user
 * actually meant.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const parsed = await readId(ctx);
  if (!parsed.success) return fail(400, "No such word.", "bad_id");

  /**
   * F14 D3, and the same one-retry discipline `POST /api/vocab` already
   * carries. `applyCorrection`'s "does the corrected spelling already exist"
   * SELECT takes no lock on that term — there is no row to lock when the
   * collision is an *insert* — so a concurrent add in a second tab, or
   * Discover's accept, can land `genteel` between it and the rename and raise
   * `23505` inside the transaction. Uncaught, Next returns a bodyless 500 that
   * `lib/api/client.ts` reports as GARBLED: "Something went wrong. Try again."
   *
   * The second run finds the row that raced in and takes the merge branch. One
   * retry, never a loop — a loop here would be a spin against a live writer.
   */
  let result: CorrectionOutcome;
  try {
    result = await applyCorrection(auth.user.id, parsed.data);
  } catch (err) {
    if (!isUniqueViolation(err)) {
      console.error("[api/vocab/correction] apply failed", err);
      return fail(500, "Could not save that. Try again.", "correction_failed");
    }
    try {
      result = await applyCorrection(auth.user.id, parsed.data);
    } catch (retryErr) {
      console.error("[api/vocab/correction] apply failed after 23505 retry", retryErr);
      return fail(500, "Could not save that. Try again.", "correction_failed");
    }
  }

  if (result.outcome === "not_found") return fail(404, "That word is gone.", "not_found");

  return ok<AcceptCorrectionResponse>(toCorrectionResponse(result));
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
