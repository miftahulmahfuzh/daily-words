import "server-only";
import { runPrompt } from "@/lib/llm/json";
import { journalInsightPrompt, type InsightInput } from "@/lib/llm/prompts/journal-insight";
import type { Insight } from "@/lib/journal/schemas";

/**
 * The insight runner: the prompt, F1's transport, and nothing in between.
 *
 * Separate from the prompt module so the prompt itself imports nothing that
 * reaches `lib/env.ts` — see the note at the top of
 * `lib/llm/prompts/journal-insight.ts`.
 */

export type InsightOutcome =
  | { ok: true; insight: Insight }
  /** Logged server-side only. The user sees one sentence, never this. */
  | { ok: false; detail: string };

/**
 * One saved line in, one insight out.
 *
 * At worst two model calls: the first attempt and `generateJson`'s single repair
 * retry. There is no loop here and there must never be one — the roadmap forbids
 * it because it burns quota on a free-tier hobby project.
 *
 * There is deliberately no error taxonomy of the kind F3 built for enrichment.
 * F3 needed one because the copy differs sharply between "not a word" and "the
 * model was unreachable". Here every failure has the same remedy and the same
 * sentence: `Insight failed.` and a `Try again` button.
 */
export async function generateInsight(input: InsightInput): Promise<InsightOutcome> {
  const result = await runPrompt(journalInsightPrompt, input);
  if (result.ok) return { ok: true, insight: result.data };
  return { ok: false, detail: `${result.error.kind}: ${result.error.detail}` };
}
