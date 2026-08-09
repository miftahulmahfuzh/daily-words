"use client";

import { useRef, useState } from "react";
import { ScreenBody } from "@/components/layout/screen";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow, Meta } from "@/components/ui/text";
import { Composer, type SaveResult } from "@/components/journal/composer";
import { EntryRow } from "@/components/journal/entry-row";
import { listEntries, saveEntry } from "@/lib/journal/client";
import { groupByDate } from "@/lib/journal/format";
import { journalEntryHref } from "@/lib/journal/links";
import type { JournalEntryDto } from "@/lib/journal/schemas";
import type { LocalDate } from "@/lib/time/local-date";

/**
 * The composer and the list, in one component because they share one array.
 *
 * A saved line appears at the top of the list before the request returns. The
 * screen promises "paste, tap, done", and a spinner where the row should be
 * would break that promise on exactly the connection where it matters — a phone
 * on a train.
 */
export function JournalFeed({
  initialEntries,
  initialCursor,
  today,
}: {
  initialEntries: JournalEntryDto[];
  initialCursor: string | null;
  /** The user's local date, computed server-side. Drives Today / Yesterday. */
  today: LocalDate;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  /** Only ever used to key optimistic rows; never sent anywhere. */
  const optimisticId = useRef(0);

  async function handleSave(
    text: string,
    sourceNote: string | null,
    opts: { force: boolean },
  ): Promise<SaveResult> {
    const tempId = `optimistic-${++optimisticId.current}`;
    const now = new Date().toISOString();
    const pending: JournalEntryDto = {
      id: tempId,
      text,
      sourceNote,
      insightStatus: "none",
      insight: null,
      // Created now, so today's group is the right one by construction — no
      // date arithmetic on the client, which is the roadmap's rule and also
      // what keeps this row from jumping groups when the real one replaces it.
      localDate: today,
      createdAt: now,
      updatedAt: now,
      edited: false,
    };

    setEntries((prev) => [pending, ...prev]);

    const result = await saveEntry(text, sourceNote, opts);

    if (!result.ok) {
      setEntries((prev) => prev.filter((e) => e.id !== tempId));
      return { status: "failed", message: result.message };
    }

    // A duplicate is a 2xx, so it arrives here rather than above. No row was
    // written, so the optimistic one has to be withdrawn — and only that one:
    // the matched entry is somewhere in the list already and must not be
    // touched, or the list flickers a second copy of a line the user kept
    // weeks ago.
    if (result.data.status === "duplicate") {
      setEntries((prev) => prev.filter((e) => e.id !== tempId));
      return { status: "duplicate", match: result.data.match };
    }

    const saved = result.data.entry;
    setEntries((prev) => prev.map((e) => (e.id === tempId ? saved : e)));
    return { status: "saved" };
  }

  async function loadMore() {
    if (loading || !cursor) return;
    setLoading(true);
    setProblem(null);

    const result = await listEntries(cursor);
    setLoading(false);

    if (!result.ok) {
      setProblem(result.message);
      return;
    }

    // Filtered against what is already on screen: a line saved since the first
    // page was rendered shifts every later page by one, and without this the
    // row on the boundary would appear twice.
    setEntries((prev) => {
      const seen = new Set(prev.map((e) => e.id));
      return [...prev, ...result.data.entries.filter((e) => !seen.has(e.id))];
    });
    setCursor(result.data.nextCursor);
  }

  const groups = groupByDate(entries, today);

  return (
    <ScreenBody
      scroll
      className="pb-3"
      top={
        <div className="pt-4.5 pb-3.5">
          <h1 className="m-0 mb-3.5 text-2xl font-normal tracking-title">Journal</h1>
          <Composer onSave={handleSave} />
        </div>
      }
    >
      {entries.length === 0 ? (
        <EmptyState
          title="Nothing kept yet"
          body="Paste a saying, a line from a book, anything worth keeping."
        />
      ) : (
        groups.map((group) => (
          <div key={group.date}>
            <div className="bg-paper pt-3 pb-1">
              <Eyebrow>{group.label}</Eyebrow>
            </div>
            {group.entries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                // An optimistic row has no route yet. Rendering it without a
                // link is the whole of the guard — a tap on it does nothing
                // rather than landing on a 404.
                href={
                  entry.id.startsWith("optimistic-")
                    ? undefined
                    : journalEntryHref(entry.id)
                }
              />
            ))}
          </div>
        ))
      )}

      {/* A button, not infinite scroll: the list is under a fixed composer and
          above a fixed tab bar, and a scroll that keeps loading makes both
          harder to reach. */}
      {cursor && (
        <div className="flex flex-col items-center gap-2 py-4">
          <Button size="sm" fullWidth={false} loading={loading} onClick={() => void loadMore()}>
            Load more
          </Button>
          {problem && <Meta className="text-red">{problem}</Meta>}
        </div>
      )}
    </ScreenBody>
  );
}
