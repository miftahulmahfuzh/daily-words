import { VocabList } from "@/components/vocab/vocab-list";
import { VocabSearch } from "@/components/vocab/vocab-search";
import { countVocabEntries, listVocabEntries } from "@/lib/db/queries/vocab";
import { encodeCursor } from "@/lib/vocab/cursor";
import { VOCAB_PAGE_SIZE } from "@/lib/vocab/format";
import { toListItem } from "@/lib/vocab/serialize";

/**
 * The Mine tab: the user's whole collection, A–Z.
 *
 * Page 1 is rendered here, on the server, from the database — never fetched by
 * the client on mount. That is what keeps the first paint a complete list on a
 * cold 3G connection instead of a spinner followed by a reflow.
 *
 * Ordered alphabetically and nothing else. The design ([R18], the visual source
 * of truth) draws a search field and A–Z groups with no status chips and no
 * sort menu; F4 §7.1's toolbar was written before that design existed. One
 * order means one cursor, one index, and no way for page 2 to arrive under a
 * different ordering than page 1.
 */
export async function MineTab({ userId, q }: { userId: string; q: string }) {
  const [total, rows] = await Promise.all([
    countVocabEntries(userId),
    listVocabEntries(userId, { q: q || undefined, limit: VOCAB_PAGE_SIZE + 1 }),
  ]);

  const hasMore = rows.length > VOCAB_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, VOCAB_PAGE_SIZE) : rows;
  const last = page[page.length - 1];

  return (
    <>
      <div className="sticky top-0 z-2 bg-paper pt-3 pb-2.5">
        <VocabSearch initialQ={q} total={total} />
      </div>

      {/* Keyed on the search: a new query resets the accumulated pages rather
          than reconciling a cursor against a filter that has moved. */}
      <VocabList
        key={q}
        initialItems={page.map(toListItem)}
        initialCursor={
          hasMore && last ? encodeCursor({ term: last.sortKey, id: last.id }) : null
        }
        q={q}
        total={total}
      />
    </>
  );
}
