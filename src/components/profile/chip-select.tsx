"use client";

import { cn } from "@/lib/ui/cn";

/**
 * A tappable chip, and a grid of them.
 *
 * Not `Pill`: that is a label — a `span` or a `Link` with `py-1.5`, which is
 * ~30px tall and below the 44px touch floor. This is the same visual language
 * (the pill radius, the outline/ink tones) as a real `<button>` with
 * `aria-pressed`. No new colour, size or radius is introduced.
 */
export function Chip({
  children,
  pressed,
  onClick,
  className,
}: {
  children: React.ReactNode;
  /** Omit entirely for a chip that is a control rather than a selection. */
  pressed?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-[44px] items-center rounded-[var(--r-pill)] border px-4 text-sm",
        pressed ? "border-ink bg-ink text-paper" : "border-rule text-ink-2",
        className,
      )}
    >
      {children}
    </button>
  );
}

export type ChipOption = { value: string; label: string };

/**
 * Purely presentational: it draws the options and reports which one was tapped.
 *
 * It deliberately does **not** compute the next selection. Deriving it here from
 * the `selected` prop loses taps that arrive before React has re-rendered — six
 * rapid taps produced three selections. The caller applies `toggleCapped` or
 * `toggleExclusive` from `lib/profile/selection` inside a functional `setState`,
 * which is race-free and keeps the two rules in one place.
 */
export function ChipSelect({
  options,
  selected,
  onToggle,
  className,
}: {
  options: readonly ChipOption[];
  selected: readonly string[];
  onToggle: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {options.map((option) => (
        <Chip
          key={option.value}
          pressed={selected.includes(option.value)}
          onClick={() => onToggle(option.value)}
        >
          {option.label}
        </Chip>
      ))}
    </div>
  );
}
