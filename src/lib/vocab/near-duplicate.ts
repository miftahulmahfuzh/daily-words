/**
 * F14's add-path fold: "does the user already hold something that *is* this
 * word, spelled differently?"
 *
 * Pure and offline — `npm run vocab:check` drives every row of F14 §7's table
 * through it. It imports `dedup.ts` and deliberately does not live inside it:
 * `dedup.ts` is the import-free fold that `npm run discover:check` calibrates,
 * and F14 D5 forbids editing it. **Same fold, different response** — Discovery
 * drops a colliding candidate silently, the add path shows the collision and
 * lets the user overrule it.
 *
 * Exact `lower(term)` equality is **not** this function's business. The caller
 * checks that first, because the database's `UNIQUE (user_id, lower(term))` is
 * the authority on it and the two answers mean different things to the user:
 * "you already have this word" versus "you may already have this word".
 *
 * On the flipped asymmetry (F14 D5): `dedup.ts`'s header argues that
 * under-folding is the correct failure mode, because a false collision hides a
 * good word forever with no visible cause. On the add path both halves invert —
 * a false collision here is shown to the user with the colliding word named, and
 * costs one tap to refuse, while an accepted near-duplicate is a durable row
 * that can be carded (and then never deleted, [R1]), gets its own chat session,
 * and poisons the next suggestion's AVOID list. So this side over-folds, made
 * harmless by refusability.
 */
import { dedupKey, isSingleWord, normalizeForDedup } from "@/lib/vocab/dedup";

/** The least a row needs to be a candidate. Callers pass wider rows. */
export type DedupRow = { term: string };

/**
 * The first row the typed term collides with, or `null`.
 *
 * Two passes rather than one, and the order is the point: a term that matches
 * on the plain normalised form (`naive` / `naïve`) is a better thing to show the
 * user than one that only matches after morphology (`study` / `studying`), and
 * with one pass whichever came first in the collection would win.
 *
 * **The morphological pass runs only when both sides are single words.**
 * Verified reason, not caution: `applyDerivation`'s `MIN_DERIVED_STEM` floor
 * measures the *whole string*, so on a phrase the five-character guard is
 * meaningless — `dedupKey('so formal')` is `so form`, while `dedupKey('formal')`
 * is protected and stays `formal`. Phrases therefore compare on
 * `normalizeForDedup` equality only.
 */
export function findNearDuplicate<T extends DedupRow>(
  rows: readonly T[],
  term: string,
): T | null {
  const typed = normalizeForDedup(term);
  // A term that normalises to nothing matches nothing — the shape validation in
  // `validateTerm` has already refused it by the time this runs.
  if (!typed) return null;

  for (const row of rows) {
    if (normalizeForDedup(row.term) === typed) return row;
  }

  if (!isSingleWord(term)) return null;
  const key = dedupKey(term);

  for (const row of rows) {
    if (!isSingleWord(row.term)) continue;
    if (dedupKey(row.term) === key) return row;
  }

  return null;
}
