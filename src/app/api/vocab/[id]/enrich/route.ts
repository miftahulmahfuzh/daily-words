import { z } from "zod";
import { requireApiUser } from "@/lib/api/guards";
import { fail, ok } from "@/lib/api/respond";
import {
  claimEnrichment,
  getEntryForUser,
  writeEnrichmentFailure,
  writeEnrichmentSuccess,
} from "@/lib/db/queries/vocab";
import { enrichTerm } from "@/lib/llm/prompts/vocab-enrich";
import { toEnrichResponse } from "@/lib/vocab/serialize";

export const runtime = "nodejs";

/**
 * 60 rather than F3 §6.2's provisional 30. F1 already set the shared SDK client's
 * timeout to 55s "under Vercel's 60s function ceiling", so the project is
 * committed to Fluid compute; a 30s function would be killed while its own HTTP
 * client was still waiting, turning a slow call into an uninterpretable 500
 * instead of the `failed` row with a retry button that this route promises.
 * On classic serverless (10s cap) this whole design still degrades correctly —
 * the word is already saved by the time anything gets here.
 */
export const maxDuration = 60;

const idSchema = z.uuid();

/**
 * The single enrichment entry point for the whole app. F8's suggested words come
 * through here too; there is no second prompt and no second transport.
 *
 * The status codes are worth reading carefully: a *failed* enrichment returns
 * **200**, not 5xx. The write succeeded and the row is correct — the client owes
 * the user a retry affordance, not a transport error. Only auth, ownership and
 * the attempt cap are non-2xx.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const userId = auth.user.id;

  const parsed = idSchema.safeParse((await ctx.params).id);
  if (!parsed.success) return fail(400, "No such word.", "bad_id");
  const id = parsed.data;

  const claimed = await claimEnrichment(userId, id);

  if (!claimed) {
    // The claim is one atomic statement, so it cannot say *why* it matched
    // nothing. Read the row to tell the three cases apart.
    const entry = await getEntryForUser(userId, id);

    // 404 and never 403: confirming the id exists would leak another user's
    // collection one guess at a time.
    if (!entry) return fail(404, "That word is gone.", "not_found");

    // D4 — enriching a ready entry is a no-op. This is what makes the roadmap's
    // "detail pages never trigger a live LLM call" rule structurally true rather
    // than something F4 has to remember.
    if (entry.enrichmentStatus === "ready") return ok(toEnrichResponse(entry));

    return fail(
      409,
      "Tried three times. Delete it and add it again.",
      "retry_exhausted",
    );
  }

  const result = await enrichTerm(claimed.term);

  if (!result.ok) {
    const row = await writeEnrichmentFailure(userId, id, result.code);
    return ok(toEnrichResponse(row ?? { ...claimed, enrichmentStatus: "failed" }));
  }

  const entry = result.data;

  // Not a transport failure — the model answered, and the answer was "that is
  // not English". The roadmap locks enrichment_status to three values, so it is
  // filed under `failed` with a code that carries the distinction. Flagged in
  // F3 §13.3; the alternative was a fourth status the roadmap forbids.
  if (entry.status === "unknown") {
    const row = await writeEnrichmentFailure(userId, id, "not_english");
    return ok(toEnrichResponse(row ?? claimed));
  }

  const row = await writeEnrichmentSuccess(userId, id, {
    partOfSpeech: entry.part_of_speech,
    pronunciation: entry.pronunciation,
    definition: entry.definition,
    examples: entry.examples,
    // D3 — when the model corrected the spelling, every other field describes
    // the CORRECTED word. That is what makes accepting the suggestion cost zero
    // further model calls.
    suggestedCorrection: entry.correction,
  });

  if (!row) return fail(404, "That word is gone.", "not_found");
  return ok(toEnrichResponse(row));
}
