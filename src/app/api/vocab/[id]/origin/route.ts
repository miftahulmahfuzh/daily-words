import { z } from "zod";
import { requireApiUser } from "@/lib/api/guards";
import { fail, ok } from "@/lib/api/respond";
import { readJson } from "@/lib/api/respond";
import { attachOrigin, getEntryForUser } from "@/lib/db/queries/vocab";
import { env } from "@/lib/env";
import { decodeLookupToken } from "@/lib/vocab/lookup-token";
import {
  normalizeContext,
  normalizeTerm,
  validateContext,
  validateTerm,
} from "@/lib/vocab/normalize";
import { toSummary } from "@/lib/vocab/serialize";
import type { CreateVocabResponse } from "@/lib/vocab/schemas";

export const runtime = "nodejs";

/**
 * The collision path. `melumuri` resolved to `smear`, and `smear` is already in
 * the collection, so there is nothing to create — but the Indonesian word that
 * sent the user looking is worth keeping on the row they already hold.
 *
 * A separate route rather than a branch in `POST /api/vocab`, because it is a
 * different act: that route creates and this one amends an existing row. Folding
 * it in would give the add path a mode in which it mutates a word the user did
 * not ask to edit — which is the failure the "attach silently" option was
 * rejected for in the first place.
 *
 * **No model call, and the language still comes from the token.** The user is
 * one tap past a resolution that already happened; asking the model again would
 * spend quota to learn something we were told a second ago.
 */

const idSchema = z.uuid();

const attachRequestSchema = z.object({
  originTerm: z.string().min(1).max(120),
  originContext: z.string().max(220).optional(),
  /** Carries the detected language, and proves a lookup actually produced it. */
  lookup: z.string().max(4096),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const userId = auth.user.id;

  const parsed = idSchema.safeParse((await ctx.params).id);
  if (!parsed.success) return fail(400, "No such word.", "bad_id");
  const id = parsed.data;

  const body = await readJson(req, attachRequestSchema);
  if (!body.ok) return body.response;

  const lookup = decodeLookupToken(body.data.lookup, env.AUTH_SECRET);
  if (!lookup) {
    return fail(400, "That lookup has expired. Look the word up again.", "lookup_expired");
  }

  const originTerm = normalizeTerm(body.data.originTerm);
  const validOrigin = validateTerm(originTerm);
  if (!validOrigin.ok) return fail(400, validOrigin.message, validOrigin.code);

  const rawContext = body.data.originContext ?? "";
  const validContext = validateContext(rawContext);
  if (!validContext.ok) return fail(400, validContext.message, validContext.code);

  const row = await attachOrigin(userId, id, {
    term: originTerm,
    language: lookup.language,
    context: normalizeContext(rawContext) || null,
  });

  if (row) {
    return ok<CreateVocabResponse>({ ...toSummary(row), outcome: "duplicate" });
  }

  /**
   * One atomic statement cannot say which of its three conditions failed, so the
   * row is read to tell them apart — `claimEnrichment`'s shape, and its reason.
   *
   * 404 and never 403: confirming the id exists would leak another user's
   * collection one guess at a time.
   */
  const entry = await getEntryForUser(userId, id);
  if (!entry) return fail(404, "That word is gone.", "not_found");

  /**
   * The row is the user's and already carries an origin. A no-op, and a `200`
   * with the row rather than an error: the user asked for the origin to be on
   * this word and it is. Overwriting was rejected in the design — one origin per
   * row, and the first one wins.
   */
  return ok<CreateVocabResponse>({ ...toSummary(entry), outcome: "duplicate" });
}
