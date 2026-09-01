"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * Remember where a `.dw-pane-scroll` pane was scrolled to, and put it back.
 *
 * ## Why the app needs this at all
 *
 * `Screen` is a fixed-height flex column with `overflow: hidden`; scrolling is
 * an inner pane's business and never the page's. So `window.scrollY` is
 * permanently 0 — and `window.scrollY` is precisely what the browser's native
 * scroll restoration and Next's both restore. Neither is broken here; neither
 * has anything to restore. `mine-client.tsx` wrote that down for the Collection
 * before this existed and named `screen.tsx` as where the fix belongs.
 *
 * ## Three details that are load-bearing
 *
 * **It renders `null`.** The obvious shape — a zero-size element carrying a
 * `ref` as the pane's first child — puts a real node into a flex column, and any
 * pane carrying `gap-*` grows by one gap. A component that renders nothing
 * cannot move a layout, which is worth insisting on in a repo whose test suite
 * is eighteen height assertions. The pane is found by the `data-dw-scroll-key`
 * attribute `ScreenBody` stamps on it instead.
 *
 * **The offset is written during the scroll, never flushed on unmount.** A
 * `useEffect` cleanup that reads `el.scrollTop` can run after React has detached
 * the node, and a detached element reads 0 — an intermittent, silent "it saved
 * the top of the list". Recording as it happens has no such window. The write is
 * throttled to one animation frame, which is one short `setItem` per frame of an
 * actual fling and nothing at all when the pane is still.
 *
 * **The restore is a layout effect.** On a client-side navigation it therefore
 * runs before the browser paints, and the list appears already at the right
 * offset rather than flashing the top for a frame. On the server there is no
 * layout to lay out, hence the guard: `ScreenBody`'s children are server-rendered
 * and React warns about `useLayoutEffect` during SSR.
 *
 * ## What it deliberately does not do
 *
 * Nothing here knows what is *in* the pane. A screen that appends pages into
 * client state — `/journal` past its first 30 entries — re-mounts with page one,
 * and the browser clamps the restore to the furthest offset that page allows.
 * Bottom of page one rather than top of it: better than the status quo in every
 * case and wrong in none. Replaying the pages belongs to the screen that
 * paginates, not to a layout primitive.
 */
/**
 * The standard SSR guard. `useLayoutEffect` is what makes a client-side
 * navigation restore before the paint rather than after it; on the server the
 * effect never runs and React warns if you ask for the layout one anyway.
 */
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export function PaneScrollMemory({ storageKey }: { storageKey: string }) {
  /** The pending rAF, so a fling writes once per frame rather than per event. */
  const frame = useRef(0);

  useIsomorphicLayoutEffect(() => {
    const pane = document.querySelector<HTMLElement>(
      `[data-dw-scroll-key="${CSS.escape(storageKey)}"]`,
    );
    if (!pane) return;

    const key = paneScrollStorageKey(storageKey);

    const saved = readOffset(key);
    // Assigned even when 0 is what was stored: a pane restored from a fresh
    // mount is already at 0, so this costs nothing and keeps the one code path.
    // The browser clamps to `scrollHeight - clientHeight` for us, which is the
    // whole of the past-page-one story above.
    if (saved !== null) pane.scrollTop = saved;

    const onScroll = () => {
      if (frame.current) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        writeOffset(key, pane.scrollTop);
      });
    };

    pane.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      pane.removeEventListener("scroll", onScroll);
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [storageKey]);

  return null;
}

/**
 * `sessionStorage`, not `localStorage`, and the same argument the journal's
 * draft makes: this is the state of one visit to one tab. A week-old offset
 * restored into a list that has grown twenty lines is not a kindness.
 */
export function paneScrollStorageKey(key: string): string {
  return `dw:scroll:${key}`;
}

/**
 * Every failure is "start at the top", which is the behaviour that shipped
 * before this file existed. Safari in private mode throws on `sessionStorage`
 * access, and a scroll offset is never worth a blank screen.
 */
function readOffset(key: string): number | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
}

function writeOffset(key: string, offset: number) {
  try {
    // Rounded, because a fractional device-pixel offset is noise in a string
    // that gets written sixty times a second, and removed at the top so a tab
    // that never scrolls leaves nothing behind.
    if (offset <= 0) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, String(Math.round(offset)));
  } catch {
    /* Private mode, or a full quota. Losing the offset is the correct cost. */
  }
}
