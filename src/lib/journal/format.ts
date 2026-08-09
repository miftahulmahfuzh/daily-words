import {
  addLocalDays,
  formatLocalDateShort,
  type LocalDate,
} from "@/lib/time/local-date";
import { JOURNAL_COUNTER_FROM, JOURNAL_TEXT_MAX } from "@/lib/journal/limits";
import type { JournalEntryDto } from "@/lib/journal/schemas";

/**
 * Display helpers for the journal. Pure, and shared by the server render and
 * the client's appended pages so both draw a page the same way.
 *
 * No `Intl.DateTimeFormat` is constructed here: every date this file touches is
 * already a `LocalDate` computed in the user's zone by the serialiser, and the
 * one formatter it needs lives in `lib/time/local-date.ts`, which is the only
 * file allowed to build one.
 */

/** What `/journal` calls a day. `Today`, `Yesterday`, then `3 Aug 2026`. */
export function dateGroupLabel(date: LocalDate, today: LocalDate): string {
  if (date === today) return "Today";
  if (date === addLocalDays(today, -1)) return "Yesterday";
  return formatLocalDateShort(date);
}

export type JournalGroup = {
  date: LocalDate;
  label: string;
  entries: JournalEntryDto[];
};

/**
 * Split a page of entries into date groups, preserving order.
 *
 * The list is already newest-first, so a group boundary is simply "this row's
 * date differs from the previous row's". No sorting, no map keyed by date —
 * either would silently reorder a list the cursor depends on being stable.
 */
export function groupByDate(
  entries: JournalEntryDto[],
  today: LocalDate,
): JournalGroup[] {
  const groups: JournalGroup[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.date === entry.localDate) {
      last.entries.push(entry);
      continue;
    }
    groups.push({
      date: entry.localDate,
      label: dateGroupLabel(entry.localDate, today),
      entries: [entry],
    });
  }
  return groups;
}

/**
 * The composer's counter, or null while there is nothing worth counting.
 *
 * Hidden below 800 characters: a proverb with a live character count beside it
 * looks like a form to be filled in rather than a place to drop a line.
 */
export function counterFor(text: string): { label: string; over: boolean } | null {
  const length = text.trim().length;
  if (length < JOURNAL_COUNTER_FROM) return null;
  return {
    label: `${length} / ${JOURNAL_TEXT_MAX}`,
    over: length > JOURNAL_TEXT_MAX,
  };
}

/** The meta line under an entry: source note, date, and whether it was edited. */
export function entryMeta(entry: JournalEntryDto): string {
  const parts = [formatLocalDateShort(entry.localDate)];
  if (entry.sourceNote) parts.unshift(entry.sourceNote);
  if (entry.edited) parts.push("edited");
  return parts.join(" · ");
}
