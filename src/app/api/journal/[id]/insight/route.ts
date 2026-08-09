import { z } from "zod";
import { requireApiUser } from "@/lib/api/guards";
import { fail, ok } from "@/lib/api/respond";
import {
  claimInsight,
  completeInsight,
  failInsight,
  getEntry,
} from "@/lib/db/queries/journal";
import { getUserTimezone } from "@/lib/db/queries/profiles";
import { generateInsight } from "@/lib/journal/insight";
import type { JournalEntryResponse } from "@/lib/journal/schemas";
import { toJournalEntryDto } from "@/lib/journal/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 60s, matching every other model-calling route in the app: the shared SDK
 * client's own timeout is 55s, so a shorter function would be killed while its
 * HTTP client was still waiting and a slow call would surface as an
 * uninterpretable 500 instead of the 502 with a `Try again` button this route
 * promises.
 */
export const maxDuration = 60;

/**
 * `POST /api/journal/[id]/insight` — the one model call F10 makes. No body.
 *
 * The roadmap's persistence rule in full: an insight is generated exactly once,
 * by an explicit tap, and every later read comes from the database. An entry
 * that is already `ready` is refused rather than re-explained — there is no
 * regenerate in v0.1.0.
 *
 * The order below is deliberate. The claim is a conditional UPDATE taken
 * **before** the model call, never after, which is the same discipline F6 uses
 * for its turn cap: two taps cannot both proceed, because the second one changes
 * no rows.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const userId = auth.user.id;

  const { id: rawId } = await ctx.params;
  const parsedId = z.uuid().safeParse(rawId);
  if (!parsedId.success) return fail(404, "That entry is gone.", "not_found");
  const id = parsedId.data;

  const entry = await getEntry(userId, id);
  if (!entry) return fail(404, "That entry is gone.", "not_found");
  if (entry.insightStatus === "ready") {
    return fail(409, "That one already has an insight.", "insight_exists");
  }

  const claim = await claimInsight(userId, id);
  if (!claim) {
    // Somebody else holds the slot. Which sentence is right depends on what they
    // did with it, so the row is re-read rather than guessed at.
    const current = await getEntry(userId, id);
    if (current?.insightStatus === "ready") {
      return fail(409, "That one already has an insight.", "insight_exists");
    }
    return fail(409, "Already thinking.", "insight_running");
  }

  const result = await generateInsight({
    text: claim.text,
    sourceNote: claim.sourceNote,
  });

  const timezone = await getUserTimezone(userId);

  if (!result.ok) {
    console.error(`[api/journal/insight] ${id} failed — ${result.detail}`);
    // Matches on the claimed text, so an entry edited mid-flight is left in the
    // `none` state the PATCH put it in rather than being marked failed.
    await failInsight(userId, id, claim.text);
    return fail(502, "Insight failed. Try again.", "insight_failed");
  }

  const row = await completeInsight(userId, id, claim.text, result.insight);

  if (!row) {
    // Nothing matched: either the text changed while the model was thinking, or
    // a re-claim after a stale window raced us and landed first.
    const current = await getEntry(userId, id);
    if (current?.insightStatus === "ready") {
      return ok<JournalEntryResponse>({ entry: toJournalEntryDto(current, timezone) });
    }
    // The insight is discarded, deliberately. It describes a line that is no
    // longer stored, and an explanation of text the user cannot see is worse
    // than no explanation at all.
    return fail(409, "The text changed. Try Insight again.", "insight_running");
  }

  return ok<JournalEntryResponse>({ entry: toJournalEntryDto(row, timezone) });
}
