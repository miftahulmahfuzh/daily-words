import { requireApiUser } from "@/lib/api/guards";
import { fail, noStore, ok, readJson } from "@/lib/api/respond";
import { suggestWords } from "@/lib/vocab/suggest";
import { checkSuggestionRate } from "@/lib/vocab/suggestion-rate-limit";
import {
  suggestRequestSchema,
  type SuggestResponse,
} from "@/lib/vocab/schemas";

export const runtime = "nodejs";

/**
 * 60s, matching F3's enrich route: F1 set the shared SDK client's timeout to 55s
 * under Vercel's 60s ceiling, so a shorter function would be killed while its
 * own HTTP client was still waiting.
 */
export const maxDuration = 60;

/**
 * Auth → rate limit → validate → service → respond. Every decision worth making
 * is in `lib/vocab/suggest.ts`; this file is plumbing.
 *
 * `no-store`: a batch is generated for one tap at one moment and must never be
 * replayed from a proxy. Nothing about it is cacheable.
 */
export async function POST(req: Request): Promise<Response> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  // Before the body is even read: a refused call must cost nothing, least of
  // all the LLM quota this limit exists to protect.
  if (!checkSuggestionRate(auth.user.id).ok) {
    return fail(429, "That's plenty of new words for now.", "rate_limited");
  }

  const body = await readJson(req, suggestRequestSchema);
  if (!body.ok) return body.response;

  const result = await suggestWords({
    userId: auth.user.id,
    exclude: body.data.exclude,
  });

  if (!result.ok) return fail(502, "Could not fetch a word. Try again.", "llm_failed");

  return noStore(
    ok<SuggestResponse>({
      suggestions: result.suggestions,
      exhausted: result.exhausted,
    }),
  );
}
