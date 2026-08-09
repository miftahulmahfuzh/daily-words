/**
 * F8's dedup fold: "are these two strings the same word?"
 *
 * Pure, synchronous, no imports. No `server-only` — the suggest service and the
 * accept route run it on the server, and `npm run discover:check` runs every
 * worked example in F8 §8 through it offline. That is the whole reason it is a
 * module of its own.
 *
 * **Not to be confused with `normalizeTerm` in `lib/vocab/normalize.ts`.** That
 * one answers "what did the user type, tidied?" and deliberately *preserves*
 * case, diacritics and interior punctuation, because the stored term is the
 * user's own spelling. This one answers a different question and destroys all
 * three. Two jobs, two names — calling both `normalizeTerm` in one directory is
 * how a later reader reaches for the wrong one and silently loses the fold.
 *
 * The database's `UNIQUE (user_id, lower(term))` is the backstop, not the
 * strategy: it fires only at insert time, catches nothing morphological, and
 * turns a silent filter into a user-facing error.
 *
 * **Under-folding is the correct failure mode.** A near-duplicate reaching the
 * user costs one tap on "Another". A false collision hides a perfectly good word
 * from them forever, with no visible cause and no way to ask for it. Every guard
 * below is sized for that asymmetry, which is why `sober` does not fold to `sob`
 * and `formal` does not fold to `form`.
 */

/** A candidate the model returned must look like this after normalisation. */
export const SINGLE_WORD = /^[a-z]{2,32}$/;

/**
 * Is this string a bare English word — no digits, no spaces, no punctuation
 * *anywhere*, not merely none left after tidying?
 *
 * Deliberately not `SINGLE_WORD.test(normalizeForDedup(raw))`. That path strips
 * the edges before testing, so `web3` would pass as `web` and the user would be
 * offered a word the model never proposed. Repairing edges is right when the
 * question is "which key does this term hash to"; it is wrong when the question
 * is "should this candidate exist at all", and this is that question.
 */
export function isSingleWord(raw: string): boolean {
  const bare = raw.normalize("NFKD").replace(/\p{M}/gu, "").trim().toLowerCase();
  return SINGLE_WORD.test(bare);
}

/** Everything that is not an ASCII letter, at one end of the string. */
const EDGE_JUNK_LEADING = /^[^a-zA-Z]+/;
const EDGE_JUNK_TRAILING = /[^a-zA-Z]+$/;

/**
 * Case, diacritics and stray punctuation folded away.
 *
 * `"  Naïve. "` → `naive`, `"Genteel"` → `genteel`, `"New York"` → `new york`
 * (kept as two words on purpose — the shape filter is what rejects it, and it
 * should reject it visibly rather than have this function quietly join it up).
 */
export function normalizeForDedup(raw: string): string {
  return raw
    // NFKD splits `ï` into `i` + U+0308 so the mark can be dropped; NFC would
    // leave it welded on and `naïve` would never match `naive`.
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(EDGE_JUNK_LEADING, "")
    .replace(EDGE_JUNK_TRAILING, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

/**
 * Inflection, longest match first, applied at most once.
 *
 * `ying`/`iest`/`ier`/`ies`/`ied` sit above their shorter cousins so `studying`
 * folds through `stud` + `y` rather than through `stud` + `ing`.
 */
const INFLECTIONS: ReadonlyArray<readonly [string, string]> = [
  ["ying", "y"],
  ["iest", "y"],
  ["ier", "y"],
  ["ies", "y"],
  ["ied", "y"],
  ["ing", ""],
  ["es", ""],
  ["ed", ""],
  ["s", ""],
];

/** `glass`, `genius`, `crisis`, `bias` are not plurals. */
const NOT_A_PLURAL = /(?:ss|us|is|as)$/;

/** `-es` is only a plural after a sibilant: `buses`, `boxes`, `wishes`. */
const TAKES_ES = /(?:s|x|z|ch|sh)$/;

/**
 * `runn` → `run`, `stopp` → `stop`. Applied after `-ing`/`-ed` and nowhere else.
 *
 * `s` is excluded from the class deliberately: a stem ending `ss` after `-ing`
 * comes off a genuine double-s root (`pass`, `press`, `guess`), and dropping one
 * would fold `passing` to `pas` — a key that belongs to no word at all.
 */
const DOUBLED_CONSONANT = /([bcdfgklmnprtvz])\1$/;

function dedouble(stem: string): string {
  return DOUBLED_CONSONANT.test(stem) ? stem.slice(0, -1) : stem;
}

function applyInflection(word: string): string {
  for (const [suffix, replacement] of INFLECTIONS) {
    if (!word.endsWith(suffix)) continue;

    const stem = word.slice(0, word.length - suffix.length);
    // Three characters is the floor for a stem that still means something.
    if (stem.length < 3) continue;
    if (suffix === "s" && NOT_A_PLURAL.test(word)) continue;
    if (suffix === "es" && !TAKES_ES.test(stem)) continue;

    const folded = stem + replacement;
    return suffix === "ing" || suffix === "ed" ? dedouble(folded) : folded;
  }
  return word;
}

/**
 * Derivation, longest match first, applied at most twice.
 *
 * The replacements that are not empty (`ication` → `icate`, `ation` → `ate`,
 * `tion` → `t`) exist so the derived form lands on the *base* form's key rather
 * than on a shorter one of its own: `obfuscation` → `obfuscate`, which the tail
 * cleanup then takes to `obfuscat` — exactly where `obfuscate` itself lands.
 */
const DERIVATIONS: ReadonlyArray<readonly [string, string]> = [
  ["ication", "icate"],
  ["ation", "ate"],
  ["ously", "ous"],
  ["ness", ""],
  ["ment", ""],
  ["tion", "t"],
  ["sion", "s"],
  ["able", ""],
  ["ible", ""],
  ["ity", ""],
  ["ive", ""],
  ["ous", ""],
  ["ism", ""],
  ["ist", ""],
  ["est", ""],
  ["al", ""],
  ["er", ""],
  ["ic", ""],
  ["ly", ""],
];

/**
 * The safety valve, and the most important number in this file.
 *
 * Without it: `sober` → `sob`, `formal` → `form`, `cover` → `cov`,
 * `letter` → `lett`. Every one of those is a false collision that would hide a
 * good word from the user permanently. Five characters is what buys `lucidity` →
 * `lucid` and `creative` → `creat` while refusing all four.
 */
const MIN_DERIVED_STEM = 5;

function applyDerivation(word: string): string {
  for (const [suffix, replacement] of DERIVATIONS) {
    if (!word.endsWith(suffix)) continue;
    const stem = word.slice(0, word.length - suffix.length);
    if (stem.length < MIN_DERIVED_STEM) continue;
    return stem + replacement;
  }
  return word;
}

/**
 * Applied identically to the user's known terms and to every candidate, so what
 * matters is that it is *consistent*, not that it is linguistically right.
 *
 * Input must already be through `normalizeForDedup` and be a single word.
 *
 * Known limitation, accepted: folding is one pass per rule class, so chains like
 * `laconically` → `laconical` → `laconic` stop short of `lacon`. The prompt
 * discourages adverbial derivatives and the AVOID list makes them unlikely; the
 * residue is one near-duplicate the user declines with a tap. Tightening the
 * guards to catch it would buy false collisions, which is the worse trade.
 */
export function foldMorphology(word: string): string {
  // Four characters or fewer is too short to fold without collateral damage:
  // `bus`, `run`, `sob`, `form` all stay exactly as they are.
  if (word.length <= 4) return word;

  let out = applyInflection(word);

  for (let pass = 0; pass < 2; pass++) {
    const next = applyDerivation(out);
    if (next === out) break;
    out = next;
  }

  // Tail cleanup. `peruse` → `perus` so that `perusing` (via `-ing`) meets it,
  // and `create` → `creat` so that `creative` (via `-ive`) does.
  return out.length >= 5 && out.endsWith("e") ? out.slice(0, -1) : out;
}

/** The one key two spellings of the same word share. */
export function dedupKey(raw: string): string {
  return foldMorphology(normalizeForDedup(raw));
}

/**
 * Both forms of every term, in one set.
 *
 * The plain normalised form is carried alongside the folded one because folding
 * is skipped below five characters: without it `Bus` and `bus` would be treated
 * as different words. The folded form catches everything longer. Empty keys are
 * dropped — a term that normalises to nothing matches nothing.
 */
export function buildKnownKeySet(...groups: Iterable<string>[]): Set<string> {
  const set = new Set<string>();
  for (const group of groups) {
    for (const term of group) {
      const normalized = normalizeForDedup(term);
      if (!normalized) continue;
      set.add(normalized);
      set.add(foldMorphology(normalized));
    }
  }
  return set;
}

/** True when `term` is, or folds onto, something already in `set`. */
export function isKnown(set: ReadonlySet<string>, term: string): boolean {
  const normalized = normalizeForDedup(term);
  if (!normalized) return true;
  return set.has(normalized) || set.has(foldMorphology(normalized));
}

/** Record a term as taken, in both forms. Mirrors `buildKnownKeySet`. */
export function remember(set: Set<string>, term: string): void {
  const normalized = normalizeForDedup(term);
  if (!normalized) return;
  set.add(normalized);
  set.add(foldMorphology(normalized));
}
