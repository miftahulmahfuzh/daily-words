"use client";

import { useEffect } from "react";

/**
 * Publishes the iOS on-screen keyboard's effect on the viewport as two CSS
 * variables, `--vvh` and `--vvo`. Renders nothing.
 *
 * **The one place keyboard maths lives.** `Screen keyboardAware` renders it and
 * `.dw-screen-kb` in globals.css consumes it; nothing else should read either
 * variable.
 *
 * Why it is needed at all, given `Screen` already uses `100dvh`: the dynamic
 * viewport unit tracks Safari's collapsing URL bar, but **not** the keyboard.
 * When the keyboard opens, `100dvh` is unchanged and the composer at the bottom
 * of a full-height column is simply underneath it. Only `visualViewport` knows.
 *
 * `--vvo` is the second half. Safari scrolls the layout viewport to bring the
 * focused input into view; without translating the shell by `offsetTop` the
 * composer scrolls off the top of what the user can see, which looks exactly
 * like the bug the height fix was supposed to solve.
 *
 * Both variables are removed on unmount. They are set on `<html>` — the only
 * element outside any React tree that both the shell and any future sheet can
 * see — so leaving them behind would apply a stale keyboard height to the next
 * route.
 */
export function VisualViewportProbe() {
  useEffect(() => {
    const vv = window.visualViewport;
    // Every browser this app targets has it. Where it is missing, `.dw-screen-kb`
    // falls back to `100dvh` through the `var()` default and behaves exactly as
    // every other screen does.
    if (!vv) return;

    const root = document.documentElement;
    const set = () => {
      root.style.setProperty("--vvh", `${vv.height}px`);
      root.style.setProperty("--vvo", `${vv.offsetTop}px`);
    };

    set();
    vv.addEventListener("resize", set);
    vv.addEventListener("scroll", set);
    return () => {
      vv.removeEventListener("resize", set);
      vv.removeEventListener("scroll", set);
      root.style.removeProperty("--vvh");
      root.style.removeProperty("--vvo");
    };
  }, []);

  return null;
}
