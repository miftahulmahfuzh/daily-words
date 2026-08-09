import { notFound } from "next/navigation";
import { z } from "zod";
import { Screen, ScreenBody } from "@/components/layout/screen";
import { BackLink } from "@/components/layout/back-link";
import { requireUser } from "@/lib/auth/session";
import { getEntry } from "@/lib/db/queries/journal";
import { getUserTimezone } from "@/lib/db/queries/profiles";
import { toJournalEntryDto } from "@/lib/journal/serialize";
import { EntryView } from "./entry-view";

/**
 * A real route, not a modal — the roadmap's app-wide decision. Edge-swipe back
 * works, reload survives, and the URL is shareable with oneself.
 *
 * Everything on the page is read from the database. **No model call is issued on
 * load**, however many times the entry is opened; the one thing that can spend
 * quota here is the Insight button.
 */
export default async function JournalEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  // A malformed id must never reach the database: compared against a `uuid`
  // column it is a cast error and a 500, where the honest answer is a 404.
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) notFound();

  // Scoped to the session user, and 404 rather than 403 for anyone else's row —
  // a 403 confirms the id exists.
  const row = await getEntry(user.id, parsed.data);
  if (!row) notFound();

  const timezone = await getUserTimezone(user.id);

  return (
    <Screen>
      <ScreenBody scroll padded={false} className="px-6 pb-7">
        <BackLink href="/journal" label="Journal" />
        <EntryView initial={toJournalEntryDto(row, timezone)} />
      </ScreenBody>
    </Screen>
  );
}
