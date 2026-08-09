import { z } from "zod";
import { PROFILE_CONTEXT_GUARD, type ProfileContext } from "@/lib/profile/context";
import type { PromptModule } from "@/lib/llm/prompts/types";

/**
 * The one prompt F8 owns. Instructions and a schema, nothing else — transport,
 * the single parse retry and the SDK client all belong to F1's `lib/llm/`.
 *
 * **No `server-only`.** Every function here is a pure string builder, and
 * `npm run discover:check` asserts the rendered prompt offline. The SDK is never
 * imported from this file.
 *
 * It asks for `term`, `partOfSpeech` and `gloss` and nothing else. There is no
 * pronunciation, no definition, no examples: those are F3's, they come from
 * F3's prompt, and a second prompt producing a second version of them is the
 * exact defect F8 §3 exists to prevent. The design's Discover card shows an IPA
 * ([R18]); that is sample content, not layout ([R20]), and buying it here would
 * cost a divergent pronunciation on every proposal the user throws away.
 */

/** How many candidates one call returns. See F8 §9 Decision 3. */
export const SUGGESTION_COUNT = 5;

/** At ~2 tokens a word this is ~600 tokens: cheap, bounded, and enough. */
export const AVOID_CAP = 300;

export const PART_OF_SPEECH = ["noun", "verb", "adjective", "adverb"] as const;
export type SuggestedPartOfSpeech = (typeof PART_OF_SPEECH)[number];

/* --------------------------------- Schema --------------------------------- */

/**
 * Deliberately loose — this is an envelope check, not a content check.
 *
 * A zod failure discards the whole batch and spends the one retry the roadmap
 * allows, so one malformed item would cost four good ones. The strict per-item
 * rules (single word, the four-value part-of-speech enum, an 80-character
 * gloss) live in `shapeFilter` in `lib/vocab/suggest.ts`, which drops the bad
 * item and keeps the rest.
 */
export const suggestWordsResponseSchema = z.object({
  suggestions: z
    .array(
      z.object({
        term: z.string().min(1).max(64),
        partOfSpeech: z.string().min(3).max(16),
        gloss: z.string().min(3).max(160),
      }),
    )
    .min(1)
    .max(8),
});

export type SuggestWordsResponse = z.infer<typeof suggestWordsResponseSchema>;

/* --------------------------------- Prompt --------------------------------- */

const SYSTEM = `You are a lexicographer building a personal vocabulary list for one adult learner of English.

Your only job is to propose English words the learner does not yet know, chosen to be useful
to that specific learner. You return JSON and nothing else.

Rules:
- Propose SINGLE English words only. No phrases, no hyphenated compounds, no proper nouns,
  no abbreviations, and no foreign borrowings that are not fully naturalised in English.
- Give the base form of the word: the singular for a noun, the plain infinitive without
  "to" for a verb. "machination", not "machinations". "gainsay", not "gainsaid".
- Propose words a well-read adult would plausibly meet in a quality newspaper, a literary
  novel, or a serious conversation. Not technical jargon. Not archaic curiosities that no
  living writer uses. Not words so common that any intermediate speaker already knows them.
- Every word you return must be genuinely different from every word on the AVOID list, and
  from every other word you return. "Different" means a different root, not merely a
  different ending. If "obfuscate" is on the AVOID list, do not return "obfuscation",
  "obfuscated", "obfuscatory", or "obfuscator".
- Vary the parts of speech across your answer. Do not return five adjectives.
- The gloss is a definition of at most eight words, plain and unfussy, in the register of a
  dictionary. It is a preview to help the learner decide, not the final definition.

${PROFILE_CONTEXT_GUARD}

Return exactly this JSON shape and nothing else. No prose, no explanation, no markdown fence:

{"suggestions":[{"term":"...","partOfSpeech":"...","gloss":"..."}]}

partOfSpeech must be exactly one of: ${PART_OF_SPEECH.join(", ")}.`;

/**
 * What to tell the model when it knows nothing about the reader.
 *
 * Emitted for a missing `profiles` row and for a row whose four content fields
 * are all null — F7 permits skipping every question, and the two cases must read
 * identically. Without this the LEARNER section would be an empty heading, and a
 * model handed an empty heading invents a learner.
 */
export const DEFAULT_REGISTER = `No profile on file. Assume an adult non-native speaker of English at upper-intermediate
level, who reads general news and fiction, and who wants words that make everyday writing
and speech more precise. Favour words that are useful in a wide range of situations over
words tied to any one field.`;

export const NO_AVOID_LIST = "(none yet — this is a new collection)";

/**
 * The single point of coupling to F7, and it is three lines long.
 *
 * F8 §7.3 planned to render `Occupation:` / `Interests:` lines itself; F7 landed
 * a pre-rendered, sanitised, length-capped `<user_profile>` block instead, and
 * §15.2 anticipated exactly that — "if it returns a pre-rendered string, drop
 * the field logic and keep only the empty-case branch". Re-rendering the fields
 * here would mean a second sanitiser for the prompt-injection layer F7 already
 * owns, and two of those is one too many.
 *
 * The block carries a `tone:` line F8 has no use for. It stays: one line of
 * tokens is cheaper than parsing a frozen contract apart, and `PROFILE_CONTEXT_GUARD`
 * in the system prompt is only truthful while the tags are actually there.
 */
export function renderProfileBlock(profile: ProfileContext | null): string {
  if (!profile) return DEFAULT_REGISTER;
  return profile.isEmpty ? `${profile.text}\n\n${DEFAULT_REGISTER}` : profile.text;
}

/**
 * One term per line, lowercase, no bullets. Most recent first, capped.
 *
 * Deduped on the normalised form so the same word arriving from both the
 * collection and the client's `exclude` array does not eat two lines of the cap.
 */
export function renderAvoidList(terms: readonly string[]): string {
  const seen = new Set<string>();
  const lines: string[] = [];

  for (const raw of terms) {
    const term = raw.trim().toLowerCase();
    if (!term || seen.has(term)) continue;
    seen.add(term);
    lines.push(term);
    if (lines.length === AVOID_CAP) break;
  }

  return lines.length > 0 ? lines.join("\n") : NO_AVOID_LIST;
}

export type SuggestWordsInput = {
  /** Null only when F7's loader threw — discovery never blocks on a profile. */
  profile: ProfileContext | null;
  /** The user's terms and the session's declines, most recent first. */
  avoid: readonly string[];
  count: number;
};

export function buildSuggestWordsPrompt(input: SuggestWordsInput): string {
  return `LEARNER
${renderProfileBlock(input.profile)}

AVOID
The learner already has these words in their collection, or has just declined them. Do not
return any of them, and do not return any word that shares a root with one of them.
${renderAvoidList(input.avoid)}

Return exactly ${input.count} suggestions.`;
}

/**
 * `temperature: 0.9` is deliberate and is the one call parameter worth
 * defending. At a low temperature repeated taps converge on the same handful of
 * "safe" words — `ubiquitous`, `perspicacious`, `ephemeral` — which reads as a
 * broken button rather than as determinism. Variety is the product here.
 */
export const suggestWordsPrompt: PromptModule<SuggestWordsInput, SuggestWordsResponse> = {
  label: "vocab.suggest",
  schema: suggestWordsResponseSchema,
  system: SYSTEM,
  user: buildSuggestWordsPrompt,
  maxTokens: 700,
  temperature: 0.9,
};

/** Exported for the check script, which asserts the guard is present verbatim. */
export const SUGGEST_WORDS_SYSTEM = SYSTEM;
