import "server-only";
import { listAllUserTerms } from "@/lib/db/queries/vocab-suggestions";
import { runPrompt } from "@/lib/llm/json";
import {
  PART_OF_SPEECH,
  SUGGESTION_COUNT,
  suggestWordsPrompt,
  type SuggestedPartOfSpeech,
  type SuggestWordsResponse,
} from "@/lib/llm/prompts/suggest-words";
import { getProfileContext } from "@/lib/profile/context.server";
import type { ProfileContext } from "@/lib/profile/context";
import {
  buildKnownKeySet,
  isKnown,
  isSingleWord,
  normalizeForDedup,
  remember,
} from "@/lib/vocab/dedup";

/**
 * The Discover service: known terms in, a deduplicated batch of candidates out.
 *
 * Layers 2–5 of F8 §8's dedup strategy are enforced here and in the accept
 * route. Layer 1 — the AVOID list in the prompt — is persuasion, and this file
 * assumes the model ignores it some of the time.
 */

export type Suggestion = {
  /** Already normalised: lowercase, single word, `[a-z]{2,32}`. */
  term: string;
  partOfSpeech: SuggestedPartOfSpeech;
  /** ≤ 80 characters. **A preview. Never persisted.** */
  gloss: string;
};

export type SuggestOutcome =
  | { ok: true; suggestions: Suggestion[]; exhausted: boolean }
  | { ok: false };

/** Longer than this is a formatting slip, not a wrong word — truncate, keep. */
const MAX_GLOSS = 80;

const POS_VALUES = new Set<string>(PART_OF_SPEECH);

/**
 * Cut at a word boundary, and only if the boundary is late enough to leave a
 * readable phrase. A gloss chopped mid-word reads as broken software; a gloss
 * cut to two words reads as a bug in the prompt.
 */
function truncateGloss(gloss: string): string {
  if (gloss.length <= MAX_GLOSS) return gloss;
  const cut = gloss.slice(0, MAX_GLOSS);
  const space = cut.lastIndexOf(" ");
  return (space > MAX_GLOSS / 2 ? cut.slice(0, space) : cut).trimEnd().replace(/[,;:]$/, "");
}

/**
 * The strict per-item rules zod is deliberately not carrying (§7.6).
 *
 * A bad item is dropped and the batch survives. `"adj."`, `"Noun"` and
 * `" verb "` all normalise onto the enum; anything else drops the item, because
 * a proposal card with no part of speech has a hole in it.
 */
function shapeFilter(raw: SuggestWordsResponse["suggestions"]): Suggestion[] {
  const kept: Suggestion[] = [];

  for (const item of raw) {
    // `isSingleWord` and not the normalised form: `New York`, `web3` and
    // `self-evident` must be dropped, never quietly repaired into `new york`,
    // `web` and `selfevident`.
    if (!isSingleWord(item.term)) continue;
    const term = normalizeForDedup(item.term);

    const pos = item.partOfSpeech.trim().toLowerCase().replace(/\.+$/, "");
    if (!POS_VALUES.has(pos)) continue;

    const gloss = truncateGloss(item.gloss.trim());
    if (gloss.length < 3) continue;

    kept.push({ term, partOfSpeech: pos as SuggestedPartOfSpeech, gloss });
  }

  return kept;
}

/**
 * Layer 4. Both the plain normalised form and the folded form are consulted, and
 * both are written back for the within-batch check: the plain form catches case
 * differences on words too short to fold, the folded form catches everything
 * morphological.
 */
function dedupFilter(
  candidates: Suggestion[],
  known: ReadonlySet<string>,
): { kept: Suggestion[]; collided: string[] } {
  const batch = new Set<string>();
  const kept: Suggestion[] = [];
  const collided: string[] = [];

  for (const candidate of candidates) {
    if (isKnown(known, candidate.term) || isKnown(batch, candidate.term)) {
      collided.push(candidate.term);
      continue;
    }
    remember(batch, candidate.term);
    kept.push(candidate);
  }

  return { kept, collided };
}

/**
 * A profile failure must never block discovery. F7's loader is total for a
 * missing row, so reaching the catch means the database itself is unhappy — and
 * the right answer to that is a general-register word, not an error screen.
 */
async function loadProfile(userId: string): Promise<ProfileContext | null> {
  try {
    return await getProfileContext(userId);
  } catch (err) {
    console.error("[vocab.suggest] profile context failed", err);
    return null;
  }
}

export type SuggestInput = {
  userId: string;
  /** Terms declined earlier in this browser session. Client-held, best-effort. */
  exclude: readonly string[];
};

/**
 * Cost, stated honestly.
 *
 * One `runPrompt` is one model call, or two if its reply failed to parse and
 * F1's single repair retry fired. This function calls `runPrompt` twice at most:
 * once, and once more only when dedup consumed the entire batch. So the ceiling
 * is four model calls in the pathological case where the model returns unusable
 * JSON *and* a fully colliding batch; the realistic case is one, and a batch of
 * five covers a whole sitting. F8 §12 claimed a flat maximum of two on the
 * reasoning that the two retries are mutually exclusive — they usually are, but
 * nothing enforces it, so the number above is the one to trust.
 *
 * There is no loop here and there must never be one.
 */
export async function suggestWords(input: SuggestInput): Promise<SuggestOutcome> {
  const [terms, profile] = await Promise.all([
    listAllUserTerms(input.userId),
    loadProfile(input.userId),
  ]);

  // The session's declines are the most recent evidence of what the user does
  // not want, so they lead the AVOID list and are the last thing the cap drops.
  const avoid = [...input.exclude, ...terms];
  const known = buildKnownKeySet(terms, input.exclude);

  const first = await runPrompt(suggestWordsPrompt, {
    profile,
    avoid,
    count: SUGGESTION_COUNT,
  });
  if (!first.ok) {
    console.error("[vocab.suggest] model call failed", first.error);
    return { ok: false };
  }

  const firstPass = dedupFilter(shapeFilter(first.data.suggestions), known);
  if (firstPass.kept.length > 0) {
    return { ok: true, suggestions: firstPass.kept, exhausted: false };
  }

  // Everything collided. One more call, with what collided named explicitly at
  // the head of the AVOID list — the model is being told what it just got wrong.
  const second = await runPrompt(suggestWordsPrompt, {
    profile,
    avoid: [...firstPass.collided, ...avoid],
    count: SUGGESTION_COUNT,
  });
  if (!second.ok) {
    console.error("[vocab.suggest] retry call failed", second.error);
    return { ok: false };
  }

  const secondPass = dedupFilter(shapeFilter(second.data.suggestions), known);

  // An empty batch is a **success**, not an error: the model ran and everything
  // it offered was already in the collection. The UI says something different
  // from what it says about a 502, and it must be able to tell them apart.
  return {
    ok: true,
    suggestions: secondPass.kept,
    exhausted: secondPass.kept.length === 0,
  };
}
