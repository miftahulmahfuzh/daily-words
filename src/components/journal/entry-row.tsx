import { ListRow } from "@/components/ui/list-row";
import { entryMeta } from "@/lib/journal/format";
import type { JournalEntryDto } from "@/lib/journal/schemas";

/**
 * One line in the journal.
 *
 * `ListRow` in its `stacked` layout, which exists for this screen: the text
 * *is* the entry, so it gets up to three clamped lines with the metadata
 * beneath. A 1000-character paste therefore occupies exactly as much of the
 * list as a six-word proverb, and the list stays scannable whatever was pasted.
 * There is no inline "read more" — the whole row is the tap target and the
 * entry page holds the full text.
 *
 * The trailing dot means "this one has been explained", and it is drawn for
 * `ready` only. `pending` and `failed` are states with an action attached, and
 * the action lives on the entry page; marking them in the list would be a
 * notification the user cannot act on from where they are standing.
 */
export function EntryRow({
  entry,
  href,
}: {
  entry: JournalEntryDto;
  /** Omitted while a row is optimistic — there is nothing at the URL yet. */
  href?: string;
}) {
  return (
    <ListRow
      href={href}
      layout="stacked"
      title={entry.text}
      subtitle={entryMeta(entry)}
      trailing={
        entry.insightStatus === "ready" ? (
          <>
            <span className="mt-1.5 size-[5px] shrink-0 self-start rounded-full bg-accent" />
            <span className="sr-only">Has an insight</span>
          </>
        ) : undefined
      }
    />
  );
}
