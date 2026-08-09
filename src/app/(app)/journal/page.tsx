import { Screen } from "@/components/layout/screen";
import { requireUser } from "@/lib/auth/session";
import { listEntries } from "@/lib/db/queries/journal";
import { getUserTimezone } from "@/lib/db/queries/profiles";
import { cursorFor, encodeCursor } from "@/lib/journal/cursor";
import { JOURNAL_PAGE_SIZE } from "@/lib/journal/limits";
import { toJournalEntryDtos } from "@/lib/journal/serialize";
import { localDateNow } from "@/lib/time/local-date";
import { JournalFeed } from "./journal-feed";

/**
 * The journal list. Page one is rendered from the database, never fetched —
 * every screen in this app paints its own first page server-side.
 *
 * `force-dynamic` because the grouping is relative to *today*: a cached render
 * would still say "Today" over yesterday's lines. Nothing here calls the model;
 * an insight costs a deliberate tap on the entry page.
 */
export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const user = await requireUser();

  const timezone = await getUserTimezone(user.id);
  const rows = await listEntries(user.id, { limit: JOURNAL_PAGE_SIZE + 1 });
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
      />
    </Screen>
  );
}
