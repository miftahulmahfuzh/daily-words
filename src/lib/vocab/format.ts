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
 * Where each tab's scroll offset lives between mounts, and where the Mine tab's
 * render window lives beside it.
 *
 * Same store and the same argument as `JOURNAL_SCROLL_KEY` in
 * `lib/journal/limits.ts`, one screen along: coming back from a word must land
 * where the reader was, and a week-old offset restored into a collection that
 * has grown twenty words is not a kindness. The keys are here rather than in the
 * component so the screen and its kitchen-sink fixture cannot drift apart — see
 * `components/layout/pane-scroll-memory.tsx`.
 *
 * **Two keys, because one `ScreenBody` serves both tabs.** `/vocab` draws a
 * single scrolling pane and swaps its child on `?tab=`, so a single key would
 * restore Discover's offset into Mine's list and back. The page already knows
 * which tab it is drawing; the split costs a ternary.
 *
 * **Not scoped to the query, deliberately.** Back-swipe restores the whole URL,
 * `?q=` included, so the list under the restored offset is the list the offset
 * was taken from and the flat key is exact. A key computed from `searchParams`
 * *and* the query would be strictly worse: in local mode `history.replaceState`
 * never re-renders this server component, so the key would freeze at the
 * mount-time query while the pane's contents follow the typed one, and the save
 * and the restore would land in different slots. See F29 §2b, which also records
 * what this costs — the detail page's back arrow pushes a query-less `/vocab`,
 * so a filtered offset is restored into the unfiltered list. Bounded rather than
 * wrong: a filtered list is a subsequence of the unfiltered one and therefore
 * never taller, so the worst case is a few rows down, never past the end.
 */
export const VOCAB_MINE_SCROLL_KEY = "vocab:mine";

/** The Discover tab's own slot in the same pane. See above. */
export const VOCAB_DISCOVER_SCROLL_KEY = "vocab:discover";

/**
 * How many rows `MineClient` was drawing, so a restored offset has floor to land
 * on.
 *
 * The window starts at `VOCAB_PAGE_SIZE` and grows by tapping "More", so without
 * this an offset past row 50 clamps to the bottom of row 50 — the scroll memory
 * restores a number the list is too short to honour.
 *
 * F24 §4 accepted exactly that clamp for `/journal`, on the grounds that
 * replaying its pages means one round trip each, an extend-and-jump while they
 * land, and a race with the composer's optimistic rows. **None of that applies
 * below `VOCAB_CLIENT_INDEX_MAX`**, where the whole collection is already in the
 * browser and `shown` is a pure render window over an array that is already
 * there. Above the ceiling it is the journal's situation again, and `MineClient`
 * neither reads nor writes this key in that mode.
 */
export const VOCAB_SHOWN_KEY = "vocab:mine:shown";

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
