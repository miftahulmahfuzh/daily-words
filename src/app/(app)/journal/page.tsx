import { Screen } from "@/components/layout/screen";
import { requireUser } from "@/lib/auth/session";
import { listEntries } from "@/lib/db/queries/journal";
import { getUserTimezone } from "@/lib/db/queries/profiles";
import { cursorFor, encodeCursor } from "@/lib/journal/cursor";
import { JOURNAL_PAGE_SIZE } from "@/lib/journal/limits";
import { searchNeedle } from "@/lib/journal/search";
import { toJournalEntryDtos } from "@/lib/journal/serialize";
import { localDateNow } from "@/lib/time/local-date";
import { JournalFeed } from "./journal-feed";

/**
 * The journal list. Page one is rendered from the database, never fetched —
 * every screen in this app paints its own first page server-side, and that holds
 * under a search: `?q=` is filtered here, not in the browser.
 *
 * `force-dynamic` because the grouping is relative to *today*: a cached render
 * would still say "Today" over yesterday's lines. Nothing here calls the model;
 * an insight costs a deliberate tap on the entry page.
 *
 * **The search is server-side, and that is the one place this screen diverges
 * from `/vocab`.** The Collection ships its whole collection to the browser
 * below `VOCAB_CLIENT_INDEX_MAX` because a `VocabListItem` is ~220 bytes; a
 * journal entry carries up to a thousand characters of text and an insight on
 * top, so the same ceiling would be megabytes. `lib/journal/search.ts` records
 * the arithmetic. What follows from it is that `q` *does* change this render,
 * which is why `JournalFeed` navigates rather than calling `replaceState` the
 * way `MineClient` does in its local mode.
 */
export const dynamic = "force-dynamic";

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  const { q } = await searchParams;

  // Sliced rather than rejected: a pasted paragraph in the search box should
  // degrade to a search, not to an error page.
  const query = typeof q === "string" ? searchNeedle(q) : "";

  const timezone = await getUserTimezone(user.id);
  const rows = await listEntries(user.id, {
    limit: JOURNAL_PAGE_SIZE + 1,
    q: query || undefined,
  });
  const hasMore = rows.length > JOURNAL_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, JOURNAL_PAGE_SIZE) : rows;
  const last = page[page.length - 1];

  return (
    <Screen tabs>
      <JournalFeed
        initialEntries={toJournalEntryDtos(page, timezone)}
        initialCursor={
          hasMore && last ? encodeCursor(cursorFor(last)) : null
        }
        today={localDateNow(timezone)}
        serverQ={query}
      />
    </Screen>
  );
}
