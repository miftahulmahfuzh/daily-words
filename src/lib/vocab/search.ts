import { MAX_SEARCH_CHARS } from "@/lib/vocab/format";

/**
 * The Collection's search rule, and the ceiling on the client-side index.
 *
 * Client-safe by construction: no `server-only`, no zod, no `next/*`, and the
 * one thing it imports is a number. `MineTab` (server), `MineClient` (browser)
 * and `scripts/check-vocab.ts` (offline) all read it, and the point of the file
 * is that the three cannot disagree.
 *
 * **This is neither `dedup.ts` nor `normalize.ts`, and the difference is the
 * reason it is a third file.** CLAUDE.md states that those two "disagree about
 * case, diacritics and punctuation on purpose"; this one disagrees with both,
 * also on purpose.
 *
 * - `lib/vocab/dedup.ts` answers *"are these two strings the same word?"* — it
 *   strips diacritics and folds morphology. Used here, `cafe` would find `café`
 *   (pleasant) and — fatally — the browser would disagree with the SQL in
 *   `listVocabEntries`, so the same query would return different rows above and
 *   below VOCAB_CLIENT_INDEX_MAX. Its fold is calibrated for a suggestion
 *   filter, where under-folding is the correct failure mode. A search box is
 *   not that.
 * - `lib/vocab/normalize.ts` answers *"what did the user type, as a term?"* — it
 *   straightens quotes and strips edge punctuation, so a search for `"i.e."`
 *   would silently become a search for `i.e`. A search box is not a term field.
 *
 * What this module answers is a third question: *"does this row match what is in
 * the search box, exactly as Postgres would have answered it?"* It is a
 * transcription of `matchesQuery` in `lib/db/queries/vocab.ts`:
 *
 *     position(lower($q) in lower(term)) > 0
 *     or position(lower($q) in lower(coalesce(definition, ''))) > 0
 *
 * Case-insensitive substring, over two fields, with no diacritic folding, no
 * word splitting, no ranking and no metacharacters — `position` has none, and
 * `includes` has none, which is why neither side needs an escape rule. Both
 * halves must stay a transcription of the other; `npm run vocab:check` §5 drives
 * one table through a JS re-reading of the SQL and through this file and
 * requires the same answer.
 *
 * The one known divergence is Postgres `lower()` versus JS `toLowerCase()` on
 * the Turkish dotted I and final sigma — the same divergence
 * `queries/vocab.ts` documents beside `sameTerm`. Its worst consequence here is
 * that one row's membership differs between the two modes. Recorded, not fixed.
 */

/**
 * The largest collection that is shipped to the browser whole.
 *
 * A `VocabListItem` is ~220 bytes on the wire once the uuid, a definition and
 * the RSC framing are counted, so 1,500 rows is ~330 kB raw and ~60 kB brotli —
 * about one of the app's two webfonts, paid once per visit to /vocab, in
 * exchange for deleting a server round trip from every keystroke. At 5,000 it is
 * not, which is also where F4 §"Deliberately NOT added" said to revisit search.
 *
 * Crossing it is not a failure: `MineTab` falls back to server-side filtering,
 * which is the path `GET /api/vocab`'s cursor still serves. It is a documented
 * ceiling, and `npm run vocab:check` asserts the arithmetic behind the number so
 * that raising it has to face the payload size rather than just the constant.
 *
 * The DOM cost does not scale with this: the list renders a window of
 * VOCAB_PAGE_SIZE rows however many match.
 */
export const VOCAB_CLIENT_INDEX_MAX = 1500;

/** True when the whole collection may be held and filtered in the browser. */
export function canIndexLocally(total: number): boolean {
  return total <= VOCAB_CLIENT_INDEX_MAX;
}

/**
 * What the search box holds, reduced to the needle the row test uses.
 *
 * Trim, then slice, then lowercase — **in that order**, because that is the
 * order the server does it: `listVocabQuerySchema` trims and slices to
 * MAX_SEARCH_CHARS, and SQL lowercases afterwards. Lowercasing first can change
 * the length (`"İ".toLowerCase()` is two code units) and the two would drift on
 * exactly the inputs nobody tests.
 *
 * `toLowerCase`, never `toLocaleLowerCase`: the former is the locale-independent
 * Unicode default mapping and is the same on every device.
 *
 * Returns `""` for "no search", never `undefined`, so no caller can forget the
 * branch.
 */
export function searchNeedle(raw: string): string {
  return raw.trim().slice(0, MAX_SEARCH_CHARS).toLowerCase();
}

/** One row against one needle. `needle` must have come from `searchNeedle`. */
export function matchesSearch(
  item: { term: string; definition: string | null },
  needle: string,
): boolean {
  if (!needle) return true;
  return (
    item.term.toLowerCase().includes(needle) ||
    (item.definition ?? "").toLowerCase().includes(needle)
  );
}

/**
 * Order-preserving, and it must be.
 *
 * The rows arrive sorted by Postgres `lower(term)`; `groupByLetter` in
 * `format.ts` depends on that order and says so ("it never sorts, because the
 * database already did, and it must not"). `Array.prototype.filter` preserves
 * it. Nothing here sorts, and nothing here may.
 *
 * Returns the input array unchanged when there is no needle, so an empty search
 * costs nothing and the reference stays stable for `useMemo`.
 */
export function filterBySearch<T extends { term: string; definition: string | null }>(
  items: T[],
  needle: string,
): T[] {
  if (!needle) return items;
  return items.filter((item) => matchesSearch(item, needle));
}
