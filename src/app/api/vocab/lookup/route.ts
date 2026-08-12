import { requireApiUser } from "@/lib/api/guards";
import { fail, ok, readJson } from "@/lib/api/respond";
import { env } from "@/lib/env";
import { translateTerm } from "@/lib/llm/prompts/vocab-translate";
import { checkLookupRate } from "@/lib/vocab/lookup-rate-limit";
import { encodeLookupToken } from "@/lib/vocab/lookup-token";
import {
  normalizeContext,
  normalizeTerm,
  validateContext,
  validateTerm,
} from "@/lib/vocab/normalize";
import {
  lookupVocabRequestSchema,
  type LookupVocabResponse,
} from "@/lib/vocab/schemas";

export const runtime = "nodejs";

/**
 * `/vocab/new`'s Non-English half: resolve a foreign term to an English word and
 * enrich that word, in one model call.
 *
 * **This route writes nothing.** That is the whole reason it exists separately
 * from `POST /api/vocab`, and it inverts F3 D1's split rather than breaking it.
 * There, the durable write comes first so a slow model call cannot cost the user
 * their word. Here the term itself is what the model returns and
 * `vocab_entries_user_term_uniq` is on `lower(term)`, so there is no row to
 * write first — a row inserted as `melumuri` could not be renamed to `smear`.
 * The user's typing is still never at risk, because nothing they typed has been
 * consumed: a failure here leaves the form exactly as it was.
 *
 * The result comes back **signed**. See `lib/vocab/lookup-token.ts` for why: the
 * four enrichment fields are what a stranger copies when they claim a shared
 * word, so `POST /api/vocab` must not take them from the client on trust.
 */

/** `vocab-enrich`'s reason: the model call needs room under Vercel's ceiling. */
export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const userId = auth.user.id;

  const body = await readJson(req, lookupVocabRequestSchema);
  if (!body.ok) return body.response;

  const term = normalizeTerm(body.data.term);
  const validTerm = validateTerm(term);
  if (!validTerm.ok) return fail(400, validTerm.message, validTerm.code);

  /**
   * Validated on the **raw** input, before normalizing, so the cap is visible to
   * the person who tripped it rather than silently truncating their sentence.
   */
  const rawContext = body.data.context ?? "";
  const validContext = validateContext(rawContext);
  if (!validContext.ok) return fail(400, validContext.message, validContext.code);
  const context = normalizeContext(rawContext) || null;

  /**
   * Before the model call, never after — the same discipline as the chat's turn
   * cap and F8's limiter. A cap checked afterwards has already spent the thing
   * it was protecting.
   */
  if (!checkLookupRate(userId).ok) {
    return fail(429, "That's a lot of lookups. Try again shortly.", "lookup_rate_limited");
  }

  const result = await translateTerm({ term, context });

  if (!result.ok) {
    // A 200 with an outcome, not a 5xx: nothing is broken and nothing was lost,
    // and the client owes the user a retry affordance rather than an error page.
    return ok<LookupVocabResponse>({ outcome: "failed", code: result.code });
  }

  const data = result.data;

  if (data.status === "already_english") {
    return ok<LookupVocabResponse>({ outcome: "already_english", term });
  }
  if (data.status === "not_a_word") {
    return ok<LookupVocabResponse>({ outcome: "not_a_word" });
  }

  /**
   * The resolved English word is re-normalised and re-validated here, on the way
   * out of the model, for the reason `claim:check` established about a sharer's
   * term: a string that crossed a trust boundary is checked where it is used,
   * not where it was produced. The schema already caps its length and word
   * count; this catches the shapes `TERM_PATTERN` exists for, and keeps the
   * signed payload's `term` a value the typed add path would also have accepted.
   */
  const english = normalizeTerm(data.english);
  const validEnglish = validateTerm(english);
  if (!validEnglish.ok) {
    return ok<LookupVocabResponse>({ outcome: "failed", code: "bad_response" });
  }

  const payload = {
    term: english,
    language: data.language,
    fit: data.fit,
    partOfSpeech: data.part_of_speech,
    pronunciation: data.pronunciation,
    definition: data.definition,
    examples: data.examples,
  };

  return ok<LookupVocabResponse>({
    outcome: "resolved",
    ...payload,
    lookup: encodeLookupToken(payload, env.AUTH_SECRET),
  });
}
