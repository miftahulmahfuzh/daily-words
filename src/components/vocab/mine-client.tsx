"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { VocabList } from "@/components/vocab/vocab-list";
import { VocabSearch } from "@/components/vocab/vocab-search";
import { listEntries } from "@/lib/vocab/client";
import {
  MAX_SEARCH_CHARS,
  VOCAB_PAGE_SIZE,
  VOCAB_SHOWN_KEY,
} from "@/lib/vocab/format";
import { vocabListHref } from "@/lib/vocab/links";
import { filterBySearch, searchNeedle } from "@/lib/vocab/search";
import type { VocabListItem } from "@/lib/vocab/schemas";

/**
 * The Mine tab's entire client state: the query, the render window, the URL, and
 * — above the ceiling only — a fetch loop.
 *
 * ## Two modes, chosen on a number by `MineTab`
 *
 * **Local** (`serverQ === null`) is the normal one: the server shipped the whole
 * collection and the search is `String.includes` over an array. Typing issues no
 * request of any kind. The load-bearing property, which is quiet and easy to
 * break:
 *
 *   > In local mode the server render does not depend on `q` at all.
 *
 * That is what makes the URL write below safe. `window.history.replaceState`
 * changes the address bar without asking the server for anything, so the history
 * entry for `/vocab?q=gen` carries the RSC tree that was fetched for `/vocab` —
 * which is fine only because those are the same tree. Reintroduce a server-side
 * dependence on `q` here ("just to render the count on the server") and this
 * becomes a cache that disagrees with its own URL.
 *
 * **Server** (`serverQ` is a string) is the fallback above
 * `VOCAB_CLIENT_INDEX_MAX`: the server filtered, the cursor paginates, and typing
 * is a `router.replace`. It is the architecture that shipped before F19, with
 * one bug removed — see the `sync` state below.
 *
 * ## What back gives you
 *
 * Search "gen", tap a word, press back: the field still reads "gen" and the list
 * is still filtered, because `?q=` is in the URL and the mount below reads it.
 *
 * **The offset comes back too, since F29.** The paragraph that stood here said
 * it did not, "before or after F19", and named where the fix belonged: "in
 * `screen.tsx`, for every scrolling pane, not here". That is exactly where F24
 * put it — `ScreenBody restoreScroll` and `components/layout/pane-scroll-memory.tsx`
 * — and `/vocab` now passes a key per tab. The diagnosis is kept because it is
 * still the reason the platform cannot help: `screen.tsx` scrolls an inner
 * `.dw-pane-scroll` pane, while browser and Next.js scroll restoration both
 * restore `window.scrollY`, which is permanently 0 in this app. F4 §7.1's
 * acceptance line finally holds.
 *
 * One half of it *is* this component's, and it is the render window below. A
 * restored offset past row 50 has nothing to land on while `shown` is back at
 * its initial page, so the pane clamps and the feature quietly stops at the
 * first fifty words. See `shown` for why the Collection restores its window
 * where `/journal` does not, and `pane-scroll-memory.tsx` for the one frame of
 * slack that lets the two effects compose.
 */
export function MineClient({
  items,
  total,
  serverQ,
  initialCursor,
}: {
  /**
   * Local mode: the **whole** collection, sorted by Postgres `lower(term)`.
   * Server mode: page 1 of the server's answer for `serverQ`.
   */
  items: VocabListItem[];
  /** The size of the whole collection, ignoring any search. */
  total: number;
  /**
   * `null` in local mode — and that is the mode switch. `null` rather than `""`
   * on purpose: `""` is a real, distinguishable server answer.
   */
  serverQ: string | null;
  /** Server mode only. Always null in local mode. */
  initialCursor: string | null;
}) {
  const local = serverQ === null;
  const searchParams = useSearchParams();
  const router = useRouter();

  /**
   * Read the URL **once**, at mount, and never again.
   *
   * A `useState` initialiser runs on the first render only, so there is no
   * render-phase branch that can fire mid-flight and no second slot to disagree
   * with this one. That is the structural deletion of the bug F19 exists to fix.
   * Back-navigation still works because navigating away unmounts this tree, so
   * coming back runs the initialiser again, against the restored URL.
   */
  const [query, setQuery] = useState(
    () => searchParams.get("q")?.trim().slice(0, MAX_SEARCH_CHARS) ?? "",
  );

  /** How many matching rows are drawn. A render window, never a fetch window. */
  const [shown, setShown] = useState(VOCAB_PAGE_SIZE);

  /**
   * Restore the window before the first paint — local mode only.
   *
   * **Not a `useState` initialiser**, which is the obvious shape and is wrong:
   * this component is server-rendered, `sessionStorage` does not exist there,
   * and a client that opened with 200 rows against an HTML document holding 50
   * is a hydration mismatch. The first render therefore agrees with the server
   * and the window is widened one commit later, which `PaneScrollMemory`'s
   * single retry is built to wait for.
   *
   * `useLayoutEffect` rather than `useEffect` for the same reason it is one
   * there: it must land before the browser paints, and before the frame on
   * which that retry re-applies the offset.
   */
  useIsomorphicLayoutEffect(() => {
    if (!local) return;
    const saved = readShown();
    if (saved !== null) setShown(saved);
  }, [local]);

  /**
   * And record it. Local mode only, so the two modes cannot leave each other a
   * window: above the ceiling `shown` is not the render window at all — the
   * cursor is — and a value written there would be restored into a list that
   * fetches its own pages.
   *
   * Passive, not layout: nothing paints differently for it, and passive effects
   * run after the layout pair above, so the mount's write can never precede the
   * read it would otherwise clobber.
   */
  useEffect(() => {
    if (!local) return;
    writeShown(shown);
  }, [local, shown]);

  const onQueryChange = useCallback((next: string) => {
    setQuery(next);
    // Reset here rather than in an effect: an effect would leave one committed
    // frame with the previous window's row count mounted against the new filter.
    setShown(VOCAB_PAGE_SIZE);
  }, []);

  const onClear = useCallback(() => onQueryChange(""), [onQueryChange]);

  /* ------------------------------ server mode ------------------------------ */

  const [pages, setPages] = useState<VocabListItem[]>([]);
  const [cursor, setCursor] = useState(initialCursor);
  const [problem, setProblem] = useState<string | null>(null);
  /** A ref, not state: the observer fires again before a re-render lands. */
  const busy = useRef(false);

  /**
   * Two facts, in two fields, because putting them in one is the bug.
   *
   * `requested` is what we last asked the URL to become; `seen` is what the
   * server last told us it is. They differ for the whole of a round trip — three
   * seconds on a free-tier Neon instance — and the old code stored both in one
   * `urlQ`, so it could not tell "the user is mid-flight" from "somebody
   * navigated". It read the first as the second and reverted the field to the
   * stale server value, one keystroke at a time.
   */
  const [sync, setSync] = useState({ requested: serverQ ?? "", seen: serverQ ?? "" });

  if (serverQ !== null && serverQ !== sync.seen) {
    // React's documented "adjust state when a prop changes": a state update in
    // the render body, which React re-runs immediately rather than committing.
    const external = serverQ !== sync.requested;
    setSync({ requested: serverQ, seen: serverQ });
    // The reset that `key={q}` on <VocabList> used to do. The new page-1 rows
    // and the new cursor arrive as props in the same render.
    setPages([]);
    setCursor(initialCursor);
    setProblem(null);
    // Only an answer we did not ask for may overwrite the field: a Link
    // elsewhere on the page (the Mine tab), or the back button.
    if (external) setQuery(serverQ);
  }

  useEffect(() => {
    if (local) return;
    const next = query.trim();
    if (next === sync.requested) return;
    const timer = setTimeout(() => {
      setSync((s) => ({ ...s, requested: next }));
      // `replace`, not `push` — otherwise the back button walks the user
      // backwards through "g", "ge", "gen" instead of leaving the screen.
      router.replace(vocabListHref({ q: next || undefined }), { scroll: false });
    }, 250);
    return () => clearTimeout(timer);
  }, [local, query, sync.requested, router]);

  const loadMore = useCallback(async () => {
    if (busy.current || !cursor) return;
    busy.current = true;
    setProblem(null);

    const result = await listEntries({ q: sync.seen || undefined, cursor });
    busy.current = false;

    if (!result.ok) {
      // Stop auto-loading and leave the button. Retrying a failing fetch every
      // time the sentinel re-enters the viewport is a scroll-driven spin.
      setProblem(result.message);
      return;
    }

    setPages((prev) => [...prev, ...result.data.items]);
    setCursor(result.data.nextCursor);
  }, [cursor, sync.seen]);

  /* ------------------------------- local mode ------------------------------ */

  useEffect(() => {
    if (!local) return;
    const href = vocabListHref({ q: query.trim() || undefined });
    /**
     * Debounced, and not for performance: Safari throttles
     * `history.replaceState` to roughly 100 calls per 30 seconds and throws a
     * SecurityError past it. At 500 ms, burst typing produces one call and the
     * worst sustained case is 60 per 30 s.
     */
    const timer = setTimeout(() => {
      if (href !== window.location.pathname + window.location.search) {
        window.history.replaceState(null, "", href);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [local, query]);

  /* ------------------------------- both modes ------------------------------ */

  const needle = searchNeedle(query);

  const matches = useMemo(
    () => (local ? filterBySearch(items, needle) : items.concat(pages)),
    [local, items, needle, pages],
  );

  const visible = local ? matches.slice(0, shown) : matches;

  const showMore = useCallback(() => setShown((n) => n + VOCAB_PAGE_SIZE), []);
  const fetchMore = useCallback(() => void loadMore(), [loadMore]);
  const hasMore = local ? shown < matches.length : Boolean(cursor);
  const onMore = hasMore ? (local ? showMore : fetchMore) : null;

  /**
   * The query the rows on screen were actually selected by. In local mode that
   * is what is in the box; in server mode it is what the server last answered,
   * so the count line and the empty state cannot describe a result that has not
   * arrived.
   */
  const shownQuery = local ? query.trim() : sync.seen;

  return (
    <>
      <div className="sticky top-0 z-2 bg-paper pt-3 pb-2.5">
        <VocabSearch value={query} onChange={onQueryChange} total={total} />
      </div>

      <VocabList
        items={visible}
        q={shownQuery}
        total={total}
        matchCount={matches.length}
        onMore={onMore}
        onClear={onClear}
        problem={problem}
      />
    </>
  );
}

/**
 * The standard SSR guard, and the twin of the one in `pane-scroll-memory.tsx`.
 * Three lines are duplicated rather than a hook exported from a component
 * module; there is nothing here that can drift.
 */
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Every failure is "start at the first page", which is the behaviour that
 * shipped before F29. Safari in private mode throws on `sessionStorage` access,
 * and a render window is never worth a blank list.
 *
 * A stored window below the initial page is discarded rather than honoured: it
 * could only shrink the list, and `null` and "50" mean the same thing to the
 * caller.
 */
function readShown(): number | null {
  try {
    const raw = sessionStorage.getItem(VOCAB_SHOWN_KEY);
    if (raw === null) return null;
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= VOCAB_PAGE_SIZE) return null;
    return value;
  } catch {
    return null;
  }
}

function writeShown(shown: number) {
  try {
    // Removed at the initial page, so a session that never tapped "More" — and
    // a search that reset the window — leaves nothing behind.
    if (shown <= VOCAB_PAGE_SIZE) sessionStorage.removeItem(VOCAB_SHOWN_KEY);
    else sessionStorage.setItem(VOCAB_SHOWN_KEY, String(shown));
  } catch {
    /* Private mode, or a full quota. Losing the window is the correct cost. */
  }
}
