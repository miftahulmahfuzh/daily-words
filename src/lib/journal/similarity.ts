import { createHash } from "node:crypto";

/**
 * F15's fold: "is this the same line as one I already kept?"
 *
 * Pure and synchronous, and the reason the whole feature is testable offline —
 * `npm run journal:check` runs every row of §6.1's tables through the functions
 * below without a database, a network or a key. This is `lib/vocab/dedup.ts`'s
 * role for the journal, and it is deliberately the same shape.
 *
 * **No `server-only`, and no client may import it either.** The server route,
 * the backfill and the check script are the only callers; `node:crypto` would
 * not survive a client bundle, which is the mechanism rather than the promise.
 * The composer imports nothing from here — its numbers and its copy come from
 * `limits.ts`, which is zod-free and crypto-free for exactly that reason.
 *
 * **Under-warning is the correct failure mode**, and every constant below is
 * sized for it. `lib/vocab/dedup.ts` states the same asymmetry for words; the
 * journal's runs the same way and harder. A missed duplicate costs the user a
 * duplicate row, which is visible and one swipe to delete, and F10 already
 * decided that keeping the same saying twice is acceptable. A *false* warning
 * interrupts the single most frictionless action in the application, in front of
 * two lines the user can see are not the same — and the second time it happens
 * they stop reading the warning, at which point the feature has negative value.
 */

/* --------------------------------- Layer 1 -------------------------------- */

/**
 * The glyph folds NFKD does not do.
 *
 * U+2019 (’), U+201C/D (“ ”) and U+2011 (non-breaking hyphen) have no
 * compatibility decomposition to their ASCII cousins — U+2011 decomposes to
 * U+2010, which is still not `-`. Checked, not assumed. Without these three
 * rows the commonest real re-paste of all, the same Kindle highlight copied
 * twice with smart quotes in one copy, would not fold.
 */
const GLYPH_FOLDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/[‘’‚‛′´`]/gu, "'"],
  [/[“”„‟″«»]/gu, '"'],
  [/[‐‑‒–—―−]/gu, "-"],
  [/…/gu, "..."],
];

/**
 * Punctuation, symbols and whitespace at either end of the line.
 *
 * Only at the ends. A trailing full stop is the difference between two copies of
 * one highlight; an *interior* comma is the difference between two sentences,
 * and stripping it would fold lines that are genuinely different.
 *
 * Unicode classes rather than `[^a-zA-Z]` — `lib/vocab/dedup.ts` can assume its
 * input is an English word and this cannot. A line of Indonesian, or one that
 * opens with `—`, must fold on the same rule as an English one.
 */
const EDGE_NOISE_LEADING = /^[\p{P}\p{S}\s]+/u;
const EDGE_NOISE_TRAILING = /[\p{P}\p{S}\s]+$/u;

/**
 * The key two copies of one line share.
 *
 * `"  Nothing   to be\ndone. "` and `"nothing to be done"` land here; so do
 * `one’s` and `one's`, `“…”` and `"…"`, `lama‑lama` and `lama-lama`, `Naïve.`
 * and `Naive`.
 *
 * What it deliberately does **not** do: stemming, synonyms, or any fuzziness at
 * all. Layer 1 is exact-after-normalisation and nothing else, so
 * `Nothing to be done.` and `Nothing to be gained.` are two different lines, as
 * are `Time heals all wounds.` and `Time wounds all heels.` Meaning is Layer 2's
 * job and it is the job that costs a network call.
 */
export function normalizeForCompare(raw: string): string {
  let out = raw;
  for (const [pattern, replacement] of GLYPH_FOLDS) out = out.replace(pattern, replacement);

  return (
    out
      // NFKD splits `ï` into `i` + U+0308 so the mark can be dropped. NFC would
      // leave it welded on and `naïve` would never meet `naive`.
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .replace(/\s+/gu, " ")
      .replace(EDGE_NOISE_LEADING, "")
      .replace(EDGE_NOISE_TRAILING, "")
      .toLowerCase()
  );
}

/** Lowercase hex, to match `encode(sha256(...), 'hex')` in Postgres. */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Layer 1's stored key. The column is `norm_sha`. */
export function normShaFor(text: string): string {
  return sha256Hex(normalizeForCompare(text));
}

/** Layer 2's staleness key. Must agree with SQL's `encode(sha256(j.text::bytea),'hex')`. */
export function textShaFor(text: string): string {
  return sha256Hex(text);
}

/* --------------------------------- Layer 2 -------------------------------- */

/**
 * `text-embedding-3-small`'s native width, **measured** on 2026-08-09 — one call
 * to OpenAI's embeddings endpoint returned exactly 1536 floats. §7.3 required it
 * before the `vector(N)` migration was generated, because on an empty table a
 * wrong N is one migration and after a backfill it is a re-embed of everything.
 *
 * A code constant rather than configuration, and that is the point: `vector(N)`
 * fixes N in DDL, so a configurable dimension is a value that can silently
 * disagree with the database and the failure is a bind error at the worst
 * moment. `npm run journal:check` asserts this equals the width declared on the
 * column, so a provider swap fails in CI rather than in production.
 */
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * Cosine distance below which two lines are called the same.
 *
 * **Measured, not guessed.** `npm run journal:similarity`, 2026-08-09,
 * `text-embedding-3-small`, 20 pairs over 28 distinct strings:
 *
 *   maxA = 0.2320   minC = 0.3502 (pair 14, "the unexamined life is not worth
 *                                  living" vs "the examined life is painful" —
 *                                  same topic, opposed claim)
 *   §6.4's arithmetic: minC × 0.8 = 0.2802, floored to 0.28, **clamped to 0.25**.
 *
 * So this number comes from the clamp rather than from the corpus, which is
 * worth knowing: the corpus would have allowed more and the clamp exists because
 * beyond 0.25 the warning is guessing whatever the corpus said. The margin that
 * actually protects the user is the 0.10 between here and `minC`.
 *
 * Two things the run found that constrain any future change:
 *
 *   - **The floor is not zero.** Pair 3 — one line against itself with different
 *     whitespace and a newline — measured **0.2320**, not ~0.02. Short strings
 *     are noisy on this model. §6.4 says a threshold any Group A pair exceeds is
 *     wrong, so 0.2320 is a hard floor and the usable window is only
 *     [0.24, 0.25]. Layer 1 catches all four Group A pairs for free regardless,
 *     which is why that noise costs nothing in practice.
 *   - **Paraphrase is barely detectable here.** Group B scored 2/6 at this
 *     threshold, and one of the two is a colon-vs-semicolon difference. §6.4
 *     step 5 anticipated this and calls it an acceptable outcome rather than a
 *     failure: Layer 1 still catches the re-paste, which is the duplicate users
 *     actually create, and [D5] says a quiet feature beats a crying-wolf one.
 *     Cross-lingual pairs (6, 7) landed at 0.46 and 0.73 — out of reach, as
 *     §7.4 predicted. It also predicted an *inversion* (pair 16 below pair 6);
 *     that did not happen — 0.7703 vs 0.4610 — so the model does rank meaning
 *     above language, just not sharply enough to use.
 *
 * **`text-embedding-3-large` was measured and rejected**, 2026-08-09, so nobody
 * has to "upgrade" into it to find out:
 *
 *   | model            | width | maxA   | minC   | gate |
 *   |------------------|-------|--------|--------|------|
 *   | 3-small          | 1536  | 0.2319 | 0.3502 | pass |
 *   | 3-large          | 1536  | 0.2328 | 0.2021 | FAIL |
 *   | 3-large (native) | 3072  | 0.2399 | 0.2118 | FAIL |
 *
 * It fails §6.4's sanity gate at both widths, so it is the model and not the
 * truncation. The culprit is pair 12 — "Time heals all wounds." against "Time
 * wounds all heels." — which 3-large places at 0.20, *nearer* than one line
 * against a whitespace variant of itself. It weights lexical overlap more
 * heavily, which is precisely backwards here: every dangerous false positive in
 * Group C is lexically similar with a different or opposite claim. A bigger
 * embedder is not a better one for this question.
 *
 * The comparison is strict — `distance < T` warns, `distance === T` does not —
 * per the asymmetry at the top of this file. Re-run the corpus before changing
 * the model (`npm run journal:similarity -- --model=… --dimensions=…`) and
 * record the new numbers here rather than editing the digits.
 */
export const NEAR_DUPLICATE_MAX_DISTANCE = 0.25;

/**
 * Total over every distance a caller can produce, including the ones it should
 * not.
 *
 * `null` is "no comparable row", `NaN` is a distance that came back unusable.
 * Both are false: an absent answer is never a duplicate, which is the property
 * the whole feature rests on.
 */
export function isNearDuplicate(distance: number | null | undefined): boolean {
  if (distance == null || !Number.isFinite(distance)) return false;
  return distance < NEAR_DUPLICATE_MAX_DISTANCE;
}

/* -------------------------------- The verdict ------------------------------ */

/**
 * What Layer 2 managed, which is not the same question as what it found.
 *
 * `empty` is not `ok` with a large distance. "We have nothing to compare
 * against" and "we compared and it was unlike everything" are different facts,
 * and only the second one licenses the word *unique* — see [D3], which is the
 * same reason no verdict is ever stored in the database.
 */
export type Layer2Outcome =
  /** A nearest row was found and its distance is usable. */
  | { kind: "ok"; distance: number }
  /** The user has no `ready`, non-stale rows to compare against. */
  | { kind: "empty" }
  /** Provider down, unconfigured, timed out, or the vector was malformed. */
  | { kind: "error" }
  /** Not attempted: Layer 1 already answered, or the save was forced. */
  | { kind: "skipped" };

export type DuplicateVerdict = "duplicate" | "unique" | "unchecked" | "forced";

export type VerdictInput = {
  /** The user asked to save anyway. Nothing is checked and nothing is called. */
  forced: boolean;
  /** The normalised hash matched a row this user already has. */
  layer1Hit: boolean;
  layer2: Layer2Outcome;
};

/**
 * The one function that decides, and it is total.
 *
 * Every row of §6.1's degradation table is a call into this, and the property
 * asserted directly there is the one that must never be traded away:
 * **`verdict !== "duplicate"` for every input in which the provider did not
 * answer.** A provider outage can never prevent a save — Product Principle 5,
 * and the reason `POST /api/journal`'s comment says the check is advisory.
 */
export function duplicateVerdict(input: VerdictInput): DuplicateVerdict {
  if (input.forced) return "forced";
  if (input.layer1Hit) return "duplicate";

  switch (input.layer2.kind) {
    case "ok":
      return isNearDuplicate(input.layer2.distance) ? "duplicate" : "unique";
    case "empty":
    case "error":
    case "skipped":
      // Not "unique". Nothing was compared, and saying unique here would be the
      // stored-verdict mistake [D3] exists to prevent, one layer up.
      return "unchecked";
  }
}

/** The other half of the table: does a row get written? */
export function verdictWritesRow(verdict: DuplicateVerdict): boolean {
  return verdict !== "duplicate";
}
