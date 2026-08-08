"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/list-row";
import { Eyebrow, Meta } from "@/components/ui/text";
import { listEntries } from "@/lib/vocab/client";
import { groupByLetter, listGloss } from "@/lib/vocab/format";
import { vocabDetailHref, vocabListHref } from "@/lib/vocab/links";
import type { VocabListItem } from "@/lib/vocab/schemas";

/**
 * The collection, A–Z, in pages.
 *
 * Page 1 arrives as a prop from the server render, so the first paint carries
 * fifty real rows and no fetch. Everything after it is appended from
 * `GET /api/vocab` as the user reaches the bottom.
 *
 * The parent re-keys this component on the search term, which is what resets
 * the accumulated pages when the query changes — cheaper and harder to get
 * wrong than reconciling a cursor against a filter that moved underneath it.
 *
 * No virtualisation library, and no `content-visibility` either. F4 §7.1 called
 * for `content-visibility: auto; contain-intrinsic-size: 0 64px` on every row,
 * on the premise that rows are a fixed height. Measured at 375px they are not:
 * an ordinary row is 49.3px and one whose term wraps to two lines is 71px.
 * `contain-intrinsic-size` that disagrees with the real height moves the
 * scrollbar as rows render — several hundred pixels of drift over a long
 * collection — so the optimisation was removed rather than guessed at. At this
 * scale the list is fast without it.
 */
export function VocabList({
  initialItems,
  initialCursor,
  q,
  total,
}: {
  initialItems: VocabListItem[];
  initialCursor: string | null;
  /** The active search, or "". Drives which empty state is right. */
  q: string;
  /** Size of the whole collection, ignoring the search. */
  total: number;
}) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [problem, setProblem] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  /** A ref, not state: the observer fires again before a re-render lands. */
  const busy = useRef(false);

  const loadMore = useCallback(async () => {
    if (busy.current || !cursor) return;
    busy.current = true;
    setProblem(null);

    const result = await listEntries({ q: q || undefined, cursor });
    busy.current = false;

    if (!result.ok) {
      // Stop auto-loading and leave the button. Retrying a failing fetch every
      // time the sentinel re-enters the viewport is a scroll-driven spin.
      setProblem(result.message);
      return;
    }

    setItems((prev) => [...prev, ...result.data.items]);
    setCursor(result.data.nextCursor);
  }, [cursor, q]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !cursor || problem) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void loadMore();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, problem, loadMore]);

  if (items.length === 0) {
    return q ? (
      <EmptyState
        title="Nothing matches"
        body={`No word or meaning contains “${q}”.`}
        action={{ label: "Clear search", href: vocabListHref() }}
      />
    ) : (
      <EmptyState
        title="No words yet"
        body="Add the first one, or let Discover suggest one."
        action={{ label: "Add a word", href: "/vocab/new" }}
      />
    );
  }

  return (
    <>
      {groupByLetter(items).map((group) => (
        <div key={group.letter}>
          {/* 62px is the sticky search block above: 12 pad + 40 field + 10 pad. */}
          <div className="sticky top-[62px] z-1 bg-paper pt-2.5 pb-1.5">
            <Eyebrow>{group.letter}</Eyebrow>
          </div>
          {group.items.map((item) => (
            <ListRow
              key={item.id}
              href={vocabDetailHref(item.id)}
              title={item.term}
              subtitle={listGloss(item)}
              muted={item.status === "mastered"}
              trailing={
                item.status === "mastered" ? (
                  <>
                    <span className="size-[5px] shrink-0 rounded-full bg-accent" />
                    <span className="sr-only">Mastered</span>
                  </>
                ) : undefined
              }
            />
          ))}
        </div>
      ))}

      {q && (
        <Meta className="py-3">
          {items.length} {items.length === 1 ? "match" : "matches"} of {total}
        </Meta>
      )}

      {cursor && (
        <div ref={sentinel} className="flex flex-col items-center gap-2 py-4">
          {/* The button is not a fallback for slow networks — it is the whole
              affordance when IntersectionObserver never fires, which is the
              case in reduced-capability browsers and in a screen reader's
              virtual cursor. */}
          <Button size="sm" fullWidth={false} onClick={() => void loadMore()}>
            Load more
          </Button>
          {problem && <Meta className="text-red">{problem}</Meta>}
        </div>
      )}
    </>
  );
}
