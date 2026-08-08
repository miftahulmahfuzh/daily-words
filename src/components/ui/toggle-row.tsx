"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/ui/cn";

/**
 * A switch row that asks twice before it does something you cannot undo.
 *
 * This is what the app has instead of F2 §6.14's `ConfirmSheet`. The roadmap
 * flagged that component as the thin end of a wedge — it forbids modals for
 * navigation precisely because a full-screen overlay on iOS Safari costs the
 * edge-swipe back gesture and hand-rolled scroll locking — and the Claude
 * Design output contains no modal anywhere. So the confirmation happens in
 * place: the first tap arms the control and relabels it, the second commits.
 *
 * Arming only guards the destructive direction. Marking a word mastered retires
 * it from every future card, so it asks; un-mastering it puts the word back in
 * the pool, which is not a loss and does not.
 *
 * The armed state expires on its own after four seconds. A control left armed
 * because the user's thumb moved on is a trap for the next tap.
 */
export function ToggleRow({
  label,
  hint,
  armedLabel = "Tap again to confirm",
  checked,
  onChange,
  confirmOn = true,
  className,
}: {
  label: string;
  hint?: string;
  /** Replaces `hint` while the control is armed. */
  armedLabel?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Require two taps to switch on. Switching off is always one tap. */
  confirmOn?: boolean;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  function handleTap() {
    const turningOn = !checked;
    if (turningOn && confirmOn && !armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    onChange(turningOn);
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={handleTap}
      className={cn(
        "flex min-h-[56px] w-full items-center justify-between gap-4 border-t border-rule-2 pt-4.5 text-left",
        className,
      )}
    >
      <span className="flex flex-col gap-[3px]">
        <span className="text-base text-ink">{label}</span>
        {(armed || hint) && (
          <span
            className={cn(
              "font-mono text-mono-xs tracking-meta",
              armed ? "text-red" : "text-ink-3",
            )}
          >
            {armed ? armedLabel : hint}
          </span>
        )}
      </span>
      <span
        className={cn(
          "flex h-[30px] w-[50px] shrink-0 items-center rounded-[var(--r-pill)] p-[3px] transition-colors duration-150",
          checked
            ? "justify-end bg-accent"
            : armed
              ? "justify-center bg-red"
              : "justify-start bg-rule",
        )}
      >
        <span className="block size-6 rounded-full bg-card" />
      </span>
    </button>
  );
}
