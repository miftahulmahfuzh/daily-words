import type { VocabListItem } from "@/lib/vocab/schemas";

/**
 * How the collection is drawn. Client-safe and zod-free — the list and the
 * search field are client islands and import these as *values*.
 *
 * That is why the two size constants live here rather than beside the schema
 * that enforces them: one value import from `schemas.ts` puts the whole of zod
 * in the /vocab bundle. Only the inferred **type** crosses that line.
 */

/** One server-rendered page. Roughly three phone screens of rows. */
export const VOCAB_PAGE_SIZE = 50;

/** Past this a search box holds a paragraph, not a query. */
export const MAX_SEARCH_CHARS = 64;

/**
 * The A–Z bucket a term sorts into. Anything not starting A–Z goes to `#`.
 *
 * Diacritics are deliberately **not** folded, even though `épée` reads as an E
 * word. The heading has to agree with the order the database returned, and
 * `lower(term)` under the deployment's collation sorts `épée` after `zymurgy` —
 * so filing it under E puts a second "E" heading at the bottom of the list,
 * below Z. `#` is the truthful label for "sorts outside the alphabet", and
 * under byte ordering every such term lands in one contiguous run at the end.
 *
 * `TERM_PATTERN` in `normalize.ts` requires a Latin letter first, so `#` only
 * ever holds accented and non-ASCII initials — never digits or punctuation.
 */
export function letterOf(term: string): string {
  const first = term.trim().charAt(0).toUpperCase();
  return /^[A-Z]$/.test(first) ? first : "#";
}

export type LetterGroup = { letter: string; items: VocabListItem[] };

/**
 * Split an already-sorted page into its letter runs.
 *
 * Order-preserving and streaming: it never sorts, because the database already
 * did, and it must not — re-sorting here would silently disagree with the
 * cursor's ordering and make the seam between two pages wrong.
 *
 * Call it on the *whole* accumulated list, not per page, or a letter straddling
 * a page boundary gets two headings.
 */
export function groupByLetter(items: VocabListItem[]): LetterGroup[] {
  const groups: LetterGroup[] = [];
  for (const item of items) {
    const letter = letterOf(item.term);
    const last = groups[groups.length - 1];
    if (last && last.letter === letter) last.items.push(item);
    else groups.push({ letter, items: [item] });
  }
  return groups;
}

/**
 * The one-line gloss under a term in the list.
 *
 * A row whose second line is empty collapses, and a list of unevenly tall rows
 * is the thing the design's fixed 46px minimum exists to prevent — so every
 * state has a sentence, including the states that have no definition.
 */
export function listGloss(item: VocabListItem): string {
  if (item.definition) return item.definition;
  if (item.enrichmentStatus === "pending") return "Preparing…";
  return "No definition";
}

/**
 * The short part-of-speech tag beside a term on the daily card.
 *
 * F3 persists the full word — the LLM is asked for one of a fixed list — and the
 * detail page prints it in full, which is right for a page with room. The card
 * row has none: the tag sits on the term's line and every character it takes is
 * a character the term loses before it ellipsises. `adjective` at 9 mono
 * characters would cost roughly a fifth of the line on every row.
 *
 * `other` returns null rather than a tag: a label that says nothing is worse
 * than no label, and the row is built to draw no tag at all.
 */
const POS_TAGS: Record<string, string> = {
  noun: "n",
  verb: "v",
  adjective: "adj",
  adverb: "adv",
  pronoun: "pron",
  preposition: "prep",
  conjunction: "conj",
  interjection: "interj",
  determiner: "det",
  phrase: "phr",
  idiom: "idiom",
  "phrasal verb": "phr v",
  abbreviation: "abbr",
};

export function partOfSpeechTag(partOfSpeech: string | null): string | null {
  if (!partOfSpeech) return null;
  return POS_TAGS[partOfSpeech.toLowerCase()] ?? null;
}

/**
 * The detail page's term size, by length. Pure buckets — no measurement, no
 * layout thrash, and nothing that can disagree between server and client render.
 *
 * The design sets the term at 38px, which is right for `genteel` and overflows
 * 375px at `intellectualisation`. Every step below is a size the design already
 * uses elsewhere; none was invented to round out a ramp.
 */
export function termSizeClass(term: string): string {
  if (term.length <= 14) return "text-[38px] leading-none tracking-display";
  if (term.length <= 22) return "text-[26px] leading-tight tracking-title";
  return "text-xl leading-tight tracking-title line-clamp-2";
}
