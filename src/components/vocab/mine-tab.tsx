import { MineClient } from "@/components/vocab/mine-client";
import { countVocabEntries, listVocabEntries } from "@/lib/db/queries/vocab";
import { encodeCursor } from "@/lib/vocab/cursor";
import { VOCAB_PAGE_SIZE } from "@/lib/vocab/format";
import { VOCAB_CLIENT_INDEX_MAX } from "@/lib/vocab/search";
import { toListItem } from "@/lib/vocab/serialize";

/**
 * The Mine tab: the user's whole collection, A–Z.
 *
 * Rendered here, on the server, from the database — never fetched by the client
 * on mount. That is what keeps the first paint a complete list on a cold 3G
 * connection instead of a spinner followed by a reflow.
 *
 * Ordered alphabetically and nothing else. The design ([R18], the visual source
 * of truth) draws a search field and A–Z groups with no status chips and no sort
 * menu; F4 §7.1's toolbar was written before that design existed. One order
 * means one cursor, one index, and no way for page 2 to arrive under a different
 * ordering than page 1.
 *
 * **Which mode, and why the probe.** One unfiltered statement asks for one row
 * past `VOCAB_CLIENT_INDEX_MAX`. If it comes back short, the whole collection is
 * in hand: `probe.length` *is* the total, so this branch runs **one** statement
 * where the pre-F19 version ran two, and the browser can filter without asking
 * the database anything ever again. If it fills, the collection is too large to
 * ship and the pre-F19 path takes over — a count, one filtered page and a
 * cursor, three statements, only above the ceiling.
 *
 * **`q` is not passed to the query in the local branch, and must not be.** The
 * whole safety of `MineClient`'s `history.replaceState` rests on the RSC tree
 * for `/vocab` and for `/vocab?q=gen` being the same tree. `npm run vocab:check`
 * §6 asserts that this file contains exactly one `q:` in a query argument.
 */
export async function MineTab({ userId, q }: { userId: string; q: string }) {
  const probe = await listVocabEntries(userId, { limit: VOCAB_CLIENT_INDEX_MAX + 1 });

  if (probe.length <= VOCAB_CLIENT_INDEX_MAX) {
    return (
      <MineClient
        items={probe.map(toListItem)}
        total={probe.length}
        serverQ={null}
        initialCursor={null}
      />
    );
  }

  const [total, rows] = await Promise.all([
    countVocabEntries(userId),
    listVocabEntries(userId, { q: q || undefined, limit: VOCAB_PAGE_SIZE + 1 }),
  ]);

  const hasMore = rows.length > VOCAB_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, VOCAB_PAGE_SIZE) : rows;
  const last = page[page.length - 1];

  return (
    <MineClient
      items={page.map(toListItem)}
      total={total}
      serverQ={q}
      initialCursor={
        hasMore && last ? encodeCursor({ term: last.sortKey, id: last.id }) : null
      }
    />
  );
}
