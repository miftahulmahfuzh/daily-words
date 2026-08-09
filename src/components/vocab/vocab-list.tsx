"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/list-row";
import { Eyebrow, Meta } from "@/components/ui/text";
import { groupByLetter, listGloss } from "@/lib/vocab/format";
import { vocabDetailHref } from "@/lib/vocab/links";
import type { VocabListItem } from "@/lib/vocab/schemas";

/**
 * The collection, A–Z, in pages. Presentational: it draws exactly the rows it is
 * given and asks its parent for more.
 *
 * Page 1 arrives from the server render inside `MineClient`'s props, so the
 * first paint carries real rows and no fetch. What "more" means is the parent's
 * business and differs by mode — a wider slice of an array the browser already
 * holds, or another `GET /api/vocab` page — and keeping that decision out of
 * here is what let the search stop being a navigation.
 *
 * **Never sorts.** The rows arrive in the database's `lower(term)` order and
 * `groupByLetter` requires it; re-sorting here would silently disagree with the
 * cursor's ordering and make the seam between two server pages wrong.
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
  items,
  q,
  total,
  matchCount,
  onMore,
  onClear,
  problem,
}: {
  /** Exactly the rows to draw, in the database's order. */
  items: VocabListItem[];
  /** The active search, or "". Drives which empty state is right. */
  q: string;
  /** Size of the whole collection, ignoring the search. */
  total: number;
  /** How many rows match `q` in all. `items.length` is only what is drawn. */
  matchCount: number;
  /** Null when there is nothing further to show. */
  onMore: (() => void) | null;
  onClear: () => void;
  /** A failed fetch, in server mode. Null in local mode, which cannot fail. */
  problem: string | null;
}) {
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !onMore || problem) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) onMore();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [onMore, problem]);

  if (items.length === 0) {
    return q ? (
      <EmptyState
        title="Nothing matches"
        body={`No word or meaning contains “${q}”.`}
        /* A callback, not a link to /vocab: in local mode a navigation here
           would be a server round trip to clear a text field, on the one control
           that exists to recover from a bad search. */
        action={{ label: "Clear search", onClick: onClear }}
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
              href={vocabDetailHref(item.id, "collection")}
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
          {matchCount} {matchCount === 1 ? "match" : "matches"} of {total}
        </Meta>
      )}

      {onMore && (
        <div ref={sentinel} className="flex flex-col items-center gap-2 py-4">
          {/* The button is not a fallback for slow networks — it is the whole
              affordance when IntersectionObserver never fires, which is the
              case in reduced-capability browsers and in a screen reader's
              virtual cursor. */}
          <Button size="sm" fullWidth={false} onClick={onMore}>
            Load more
          </Button>
          {problem && <Meta className="text-red">{problem}</Meta>}
        </div>
      )}
    </>
  );
}
