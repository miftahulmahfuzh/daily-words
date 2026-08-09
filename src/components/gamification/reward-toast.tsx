"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { subscribeRewards, type RewardLine } from "@/lib/gamification/reveal";

/**
 * The reveal moment: one line, one item at a time, above the tab bar.
 *
 * **Zero layout impact.** `position: fixed` puts it outside the flow entirely,
 * so /today's height budget is untouched and the card still does not scroll at
 * 375px. That is the one and only reason this component is allowed the `fixed`
 * the UI-kit README otherwise reserves for `Screen`: the rule protects the
 * vertical budget, and an element with no height cannot spend it. It sits above
 * the card and below the tab bar, so it never covers navigation.
 *
 * **Restraint is the spec.** One 400ms fade-and-rise on entry, 3.5s per line, a
 * cross-fade between them, then it unmounts. No confetti, no sound, no haptics,
 * no full-screen takeover, nothing to dismiss. Under `prefers-reduced-motion`
 * the global rule in `globals.css` collapses the animation to opacity.
 *
 * **Missing it is fine.** The toast is a courtesy, not the record — everything
 * it announces is on /profile permanently. Nothing reappears on the next visit,
 * and there is no unseen-badge dot on the Profile tab, which would be exactly
 * the nagging the roadmap forbids.
 */

const DWELL_MS = 3500;

export function RewardToast({
  /**
   * `/kitchen-sink/today?toast=…` only, so the one thing in this feature that
   * cannot be seen without making a real card can still be read at 375px in
   * both colour schemes — and so the no-scroll claim can be measured with it on
   * screen. Never passed by /today.
   */
  preview,
}: {
  preview?: RewardLine[];
} = {}) {
  const router = useRouter();
  const [queue, setQueue] = useState<RewardLine[]>(preview ?? []);
  const [index, setIndex] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () =>
      subscribeRewards((lines) => {
        setQueue(lines);
        setIndex(0);
      }),
    [],
  );

  useEffect(() => {
    if (queue.length === 0 || preview) return;
    timer.current = setTimeout(() => {
      setIndex((i) => i + 1);
    }, DWELL_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [queue, index, preview]);

  const line = queue[index];
  if (!line) return null;

  return (
    <div
      // `polite`, not `assertive`: a badge is worth mentioning and never worth
      // interrupting what a screen reader is already saying.
      role="status"
      aria-live="polite"
      className="dw-in fixed inset-x-[var(--gutter)] z-30 flex items-baseline gap-2.5 rounded-[var(--r-card)] border border-rule bg-card px-4 py-3"
      style={{ bottom: "calc(50px + var(--pad-bottom) + 8px)" }}
    >
      <button
        type="button"
        onClick={() => {
          setQueue([]);
          router.push("/profile");
        }}
        className="flex flex-1 items-baseline gap-2.5 text-left"
      >
        {line.label && (
          <span className="shrink-0 font-mono text-mono-2xs tracking-eyebrow text-accent uppercase">
            {line.label}
          </span>
        )}
        {/* Two lines allowed — "No Weekend Without Ration Card" needs them —
            and never three. */}
        <span className="line-clamp-2 flex-1 text-body leading-[1.3] text-ink text-pretty">
          {line.text}
        </span>
      </button>
    </div>
  );
}
