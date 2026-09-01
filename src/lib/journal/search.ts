/**
 * The journal's search rule, and the reason it is smaller than the Collection's.
 *
 * Client-safe by construction: no `server-only`, no zod, no `next/*`, and no
 * imports at all. `journal/page.tsx` (server), `JournalFeed` (browser) and
 * `scripts/check-journal.ts` (offline) all read it, and the point of the file is
 * that the three cannot disagree.
 *
 * **`lib/vocab/search.ts` is the precedent, and this file deliberately does not
 * copy half of it.** That module ships the whole collection to the browser below
 * `VOCAB_CLIENT_INDEX_MAX` and filters it there, so it owns a ceiling, a
 * `matchesSearch` and a `filterBySearch`. The arithmetic behind its 1,500 does
 * not transfer: a `VocabListItem` is ~220 bytes on the wire, while a
 * `JournalEntryDto` carries up to `JOURNAL_TEXT_MAX` (1,000) characters of text
 * plus an insight of ~600 more. The same ceiling here would be ~1.5 MB against
 * the ~330 kB that number was sized for.
 *
 * So the journal takes only the *server* half of F19's design: the database
 * filters, the cursor paginates, and typing is a debounced `router.replace`.
 * Nothing filters in the browser, so there is nothing here to keep in step with
 * the SQL by transcription — which is why this module has no row test and no
 * `vocab:check` §5 twin.
 *
 * What the SQL does, recorded here because this is where a reader will look for
 * it — `matchesEntryQuery` in `lib/db/queries/journal.ts`:
 *
 *     position(lower($q) in lower(text)) > 0
 *     or position(lower($q) in lower(coalesce(source_note, ''))) > 0
 *
 * Case-insensitive substring over the two fields the user wrote, with no
 * diacritic folding, no word splitting, no ranking and no metacharacters —
 * `position` has none, so neither side needs an escape rule. **The insight is
 * not searched**: it is the machine's paragraph about the line, not the line,
 * and a search for a word the user never wrote returning their own journal
 * would be the wrong answer to "where did I keep that?".
 */

/**
 * The longest search the field accepts, and the longest the query string will
 * carry. `MAX_SEARCH_CHARS` in `lib/vocab/format.ts` is the sibling constant and
 * holds the same 64 — kept separate rather than imported because the two fields
 * search different things and one may move without the other.
 */
export const JOURNAL_SEARCH_MAX_CHARS = 64;

/**
 * What the search box holds, reduced to the needle the query is built from.
 *
 * Trim, then slice — **in that order**, and lowercasing is left to SQL, which is
 * the whole difference from the vocab twin. That module lowercases in JS because
 * it also filters in JS; here the only consumer is a parameter handed to
 * Postgres, and lowercasing it first would make the needle disagree with
 * `lower()` on exactly the inputs nobody tests (the Turkish dotted I, final
 * sigma).
 *
 * Returns `""` for "no search", never `undefined`, so no caller can forget the
 * branch.
 */
export function searchNeedle(raw: string): string {
  return raw.trim().slice(0, JOURNAL_SEARCH_MAX_CHARS);
}
