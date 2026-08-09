import {
  addLocalDays,
  formatLocalDateShort,
  type LocalDate,
} from "@/lib/time/local-date";
import {
  DUPLICATE_EXCERPT_MAX,
  JOURNAL_COUNTER_FROM,
  JOURNAL_TEXT_MAX,
} from "@/lib/journal/limits";
import type { DuplicateMatchDto, JournalEntryDto } from "@/lib/journal/schemas";

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

/* ------------------------------ F15: duplicates ---------------------------- */

/**
 * How far back from the cut a space still counts as the right place to break.
 *
 * Beyond this the excerpt cuts mid-word rather than losing a visible chunk of
 * the line — a break that swallows thirty characters to avoid splitting one word
 * is worse at answering "is this the one you mean?" than a split word is.
 */
const WORD_BOUNDARY_WINDOW = 20;

/**
 * The matched line, shortened to something that fits under the composer.
 *
 * Returned whole when it already fits, and with no ellipsis — an ellipsis on a
 * complete proverb would say the line goes on when it does not.
 */
export function excerptFor(text: string): string {
  if (text.length <= DUPLICATE_EXCERPT_MAX) return text;

  const slice = text.slice(0, DUPLICATE_EXCERPT_MAX);
  const space = slice.lastIndexOf(" ");
  const cut = space >= DUPLICATE_EXCERPT_MAX - WORD_BOUNDARY_WINDOW ? space : DUPLICATE_EXCERPT_MAX;
  return `${slice.slice(0, cut).trimEnd()}…`;
}

/**
 * The meta line under the warning's excerpt.
 *
 * `entryMeta`'s shape, with "Saved" in front of the date because the question
 * this block answers is *when did I keep this*, and without it the date reads as
 * part of the quotation. `edited` is not drawn — it is a fact about an entry,
 * and this is a line.
 */
export function duplicateMatchMeta(match: DuplicateMatchDto): string {
  const parts = [`Saved ${formatLocalDateShort(match.localDate)}`];
  if (match.sourceNote) parts.unshift(match.sourceNote);
  return parts.join(" · ");
}
