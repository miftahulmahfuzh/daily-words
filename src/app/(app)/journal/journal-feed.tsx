"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenBody, ScreenHeader } from "@/components/layout/screen";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/pill";
import { Eyebrow, Meta } from "@/components/ui/text";
import { Composer, type SaveResult } from "@/components/journal/composer";
import { EntryRow } from "@/components/journal/entry-row";
import { JournalSearch } from "@/components/journal/journal-search";
import { listEntries, saveEntry } from "@/lib/journal/client";
import { hasDraft } from "@/lib/journal/draft";
import { groupByDate } from "@/lib/journal/format";
import { JOURNAL_SCROLL_KEY } from "@/lib/journal/limits";
import { journalEntryHref, journalListHref } from "@/lib/journal/links";
import { searchNeedle } from "@/lib/journal/search";
import type { JournalEntryDto } from "@/lib/journal/schemas";
import type { LocalDate } from "@/lib/time/local-date";

/**
 * The header, the composer, the search and the list, in one component because
 * they share one array and one question about the URL.
 *
 * A saved line appears at the top of the list before the request returns. The
 * screen promises "paste, tap, done", and a spinner where the row should be
 * would break that promise on exactly the connection where it matters — a phone
 * on a train.
 *
 * ## What [R23] changed, and the two traps in it
 *
 * The composer used to be drawn permanently at the top of this screen; it is now
 * expanded by the `+ Line` pill on the header, and the search field takes the
 * space it used to occupy. **The two are mutually exclusive**, which is a
 * decision rather than a layout accident:
 *
 *   > Opening the composer clears the search.
 *
 * A user adding a line is not looking for one, and the alternative — preserving
 * the query across a compose — has an edge case with no good answer, because the
 * optimistic row inserted on save need not match the filter it lands in. Either
 * the list lies about the query or the user cannot see the line they just wrote.
 * It also keeps [R19]'s budget: the `top` block never holds both.
 *
 * **Trap 1 — the draft.** `Composer` restores a `sessionStorage` draft *on
 * mount*, which is how a paste survives iOS discarding a backgrounded tab. Behind
 * a pill it never mounts, so the restore never runs and the paste sits behind a
 * button the user has no reason to press. `hasDraft()` in the mount effect below
 * is the whole of the fix. It is an effect and not a `useState` initialiser
 * because `sessionStorage` does not exist during the server render.
 *
 * **Trap 2 — `Load more` under a search.** The cursor is `(created_at, id)` and
 * the filter is a separate WHERE, so an unfiltered page 2 comes back in the
 * correct order and simply does not belong. `sync.seen`, not `query`, is what is
 * sent — the rows on screen were selected by what the server last answered, not
 * by what is in the box this instant.
 *
 * ## Why this navigates where `MineClient` does not
 *
 * The Collection's local mode writes the URL with `history.replaceState`, which
 * is safe there only because the RSC tree for `/vocab` and `/vocab?q=gen` is the
 * same tree. Here it is not: `q` filters the server render, so the field must
 * actually navigate. That makes this the twin of `MineClient`'s *server* mode,
 * including its two-field `sync` — `requested` is what we last asked the URL to
 * become and `seen` is what the server last told us it is. They differ for a
 * whole round trip, and storing both in one slot is the bug F19 exists to fix.
 */
export function JournalFeed({
  initialEntries,
  initialCursor,
  today,
  serverQ,
}: {
  initialEntries: JournalEntryDto[];
  initialCursor: string | null;
  /** The user's local date, computed server-side. Drives Today / Yesterday. */
  today: LocalDate;
  /** The search this page was rendered for. `""` when there is none. */
  serverQ: string;
}) {
  const router = useRouter();

  const [entries, setEntries] = useState(initialEntries);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [query, setQuery] = useState(serverQ);
  const [sync, setSync] = useState({ requested: serverQ, seen: serverQ });
  /** Only ever used to key optimistic rows; never sent anywhere. */
  const optimisticId = useRef(0);
  /** `loadMore`'s real guard. See the comment on it for why `loading` is not. */
  const busy = useRef(false);
  /** The `Load more` block. Watched, so reaching it fetches the next page. */
  const sentinel = useRef<HTMLDivElement>(null);

  /**
   * A new server answer arrived. React's documented "adjust state when a prop
   * changes": a state update in the render body, which React re-runs
   * immediately rather than committing.
   */
  if (serverQ !== sync.seen) {
    const external = serverQ !== sync.requested;
    setSync({ requested: serverQ, seen: serverQ });
    // This drops an in-flight optimistic row on the floor. `handleSave` puts the
    // real one back when its POST resolves — see the note there; recovering in
    // the arm that has the saved entry is cheaper and more certain than trying
    // to carry a temporary row across a list it may not belong in.
    setEntries(initialEntries);
    setCursor(initialCursor);
    setProblem(null);
    // Only an answer we did not ask for may overwrite the field — the back
    // button, or a tap on the Journal tab from elsewhere in the app.
    if (external) setQuery(serverQ);
  }

  /** See "Trap 1" above. Runs once; a draft written later is the user's own. */
  useEffect(() => {
    if (hasDraft()) setComposing(true);
  }, []);

  /** Debounced, then a real navigation — `q` changes the server render. */
  useEffect(() => {
    const next = searchNeedle(query);
    if (next === sync.requested) return;
    const timer = setTimeout(() => {
      setSync((s) => ({ ...s, requested: next }));
      // `replace`, not `push` — otherwise back walks the user through "g", "ge",
      // "gen" instead of leaving the screen.
      router.replace(journalListHref({ q: next }), { scroll: false });
    }, 250);
    return () => clearTimeout(timer);
  }, [query, sync.requested, router]);

  const clearSearch = useCallback(() => setQuery(""), []);

  const toggleComposer = useCallback(() => {
    setComposing((open) => {
      // Opening clears the search; closing leaves it alone, because a user who
      // searched, added a line and closed the composer is back to where they
      // were rather than somewhere new.
      if (!open) setQuery("");
      return !open;
    });
  }, []);

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
    setEntries((prev) => {
      if (prev.some((e) => e.id === tempId)) {
        return prev.map((e) => (e.id === tempId ? saved : e));
      }
      /**
       * The optimistic row is gone, which means a server answer landed while
       * this save was in the air — opening the composer clears the search, and
       * that clear is a navigation. A blind `map` would find nothing and the
       * line would be saved, real, and invisible until the next navigation,
       * which is the one failure this screen must not have. Put it back, unless
       * the render that replaced the list already contains it.
       */
      return prev.some((e) => e.id === saved.id) ? prev : [saved, ...prev];
    });
    return { status: "saved" };
  }

  /**
   * Guarded by a **ref**, not by `loading`, and that is F28's one subtlety.
   *
   * `loading` still exists — it draws the button's spinner — but it cannot be
   * the guard now that an observer also calls this. The effect below is torn
   * down and rebuilt whenever its dependencies change, and a rebuild landing
   * between this call and React committing `setLoading(true)` would re-observe
   * a sentinel that is still on screen and fire a second fetch through a
   * closure in which `loading` is still false. `busy.current` is set
   * synchronously and has no such window. `mine-client.tsx` guards the
   * Collection's fetch loop the same way, for the same reason.
   */
  const loadMore = useCallback(async () => {
    if (busy.current || !cursor) return;
    busy.current = true;
    setLoading(true);
    setProblem(null);

    // `sync.seen`, never `query`. See "Trap 2" above.
    const result = await listEntries(cursor, sync.seen || undefined);
    busy.current = false;
    setLoading(false);

    if (!result.ok) {
      // Stop auto-loading and leave the button. Retrying a failing fetch every
      // time the sentinel re-enters the viewport is a scroll-driven spin.
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
  }, [cursor, sync.seen]);

  /**
   * [F28] Reaching the end of the list fetches the next page.
   *
   * `/vocab` has done this since F19 and this is the same eight lines
   * (`vocab-list.tsx`), which is the whole design: two screens that paginate
   * differently is a difference nobody chose.
   *
   * **No `root`, deliberately.** The obvious worry is that nothing here scrolls
   * `window` — `Screen` is a fixed-height flex column and the offset belongs to
   * an inner `.dw-pane-scroll` pane — so the observer must surely be pointed at
   * that pane. It must not, and the reasoning conflates scrolling with
   * intersection: with `root: null` the sentinel is measured by its *current*
   * viewport rect, which the pane's scrolling moves, and clipped on the way up
   * by every ancestor's overflow — so the pane's own `overflow-y: auto` is
   * exactly what takes the sentinel out of the intersection rect once it is
   * scrolled past. Naming the pane would additionally mean finding it by
   * `data-dw-scroll-key`, which buys nothing.
   *
   * **It fires once on a restored mount, and that is wanted.** F24 clamps a
   * returning reader to the bottom of page one, so the sentinel is on screen
   * before a finger touches anything and one page is fetched immediately. There
   * is no cascade behind it: a page is `JOURNAL_PAGE_SIZE` entries, several
   * viewports, so the append pushes the sentinel below the fold and this goes
   * quiet again. One request, for somebody demonstrably at the end of the list.
   */
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !cursor || problem) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void loadMore();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, problem, loadMore]);

  const groups = groupByDate(entries, today);
  /**
   * The query the rows on screen were actually selected by, so the empty state
   * cannot describe a result that has not arrived yet.
   */
  const shownQuery = sync.seen;

  return (
    <ScreenBody
      scroll
      // Back from an entry lands where the user was reading. Restored within
      // the server-rendered first page only: `loadMore` appends into state that
      // a re-mount does not have, so a deeper offset clamps to the bottom of
      // page one rather than replaying the fetches. F24 §4.
      //
      // F25's search does not disturb this. A `router.replace` keeps the tree
      // mounted, and a re-mount under a different `?q=` restores an offset into
      // a list that is genuinely a different list — but the pane is at the top
      // whenever a search has just changed, because the field is in the
      // non-scrolling `top` block and the rows below it are new.
      restoreScroll={JOURNAL_SCROLL_KEY}
      className="pb-3"
      top={
        <div className="pt-4.5 pb-3.5">
          <ScreenHeader
            className="pb-3.5"
            title="Journal"
            trailing={
              /* [R23]: the journal's one add affordance, and still not a FAB. */
              <Pill
                onClick={toggleComposer}
                aria-expanded={composing}
                tone="ink"
                mono
                className="h-9"
              >
                {composing ? "Close" : "+ Line"}
              </Pill>
            }
          />
          {composing ? (
            <Composer onSave={handleSave} />
          ) : (
            <JournalSearch value={query} onChange={setQuery} />
          )}
        </div>
      }
    >
      {entries.length === 0 ? (
        shownQuery ? (
          <EmptyState
            title="Nothing matches"
            body={`No line or source contains “${shownQuery}”.`}
            action={{ label: "Clear search", onClick: clearSearch }}
          />
        ) : (
          <EmptyState
            title="Nothing kept yet"
            body="Paste a saying, a line from a book, anything worth keeping."
          />
        )
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

      {/* [F28] Scrolling here fetches the next page; the button stays.

          This block used to say "a button, not infinite scroll: the list is
          under a fixed top block and above a fixed tab bar, and a scroll that
          keeps loading makes both harder to reach". Both halves were wrong.
          `screen.tsx` makes the tab bar a **sibling** of the scrolling pane
          inside `.dw-screen`, and `ScreenBody`'s `top` block is the other
          sibling — neither is in this list, so appending rows cannot move
          either one. What an endless list really buries is whatever sits below
          it *inside the pane*, and nothing does.

          The button is not a fallback for a slow network. It is the whole
          affordance where `IntersectionObserver` never fires — reduced
          capability, and a screen reader's virtual cursor, which does not
          scroll anything — and the only one left after a failed fetch, where
          the effect above stops watching on purpose. The ref rides the
          container that was already here, so this feature adds no DOM node to
          a pane whose height is under eighteen assertions. */}
      {cursor && (
        <div ref={sentinel} className="flex flex-col items-center gap-2 py-4">
          <Button size="sm" fullWidth={false} loading={loading} onClick={() => void loadMore()}>
            Load more
          </Button>
          {problem && <Meta className="text-red">{problem}</Meta>}
        </div>
      )}
    </ScreenBody>
  );
}
