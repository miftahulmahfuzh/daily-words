"use client";

import { cn } from "@/lib/ui/cn";

export type OptionRow = { value: string; label: string; gloss?: string };

/**
 * Single-select as a ruled list with a tick — the design's own onboarding
 * option row, drawn at `design/from-claude-design/Daily Words.dc.html:90`.
 *
 * Not `ListRow`: that component's contract forbids a tappable control inside a
 * row and draws for scanning a collection, where this row *is* the control.
 * Not `ToggleRow` either — three mutually exclusive choices are not three
 * switches. The tick is a text glyph, per [R18]'s "no icons anywhere".
 *
 * Selecting does **not** advance the flow. The user should be able to change
 * their mind before committing, and an auto-advance on the last screen would
 * submit the whole profile on a mis-tap.
 */
export function OptionRows({
  options,
  value,
  onChange,
  className,
}: {
  options: readonly OptionRow[];
  /** Null renders nothing selected, which is what "skipped" looks like. */
  value: string | null;
  onChange: (next: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", className)} role="radiogroup">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className="flex min-h-[56px] items-center justify-between gap-3 border-b border-rule-2 px-0.5 py-4 text-left text-[19px]"
          >
            <span className="flex min-w-0 items-baseline gap-2.5">
              <span className={selected ? "text-ink" : "text-ink-2"}>{option.label}</span>
              {option.gloss && (
                <span className="min-w-0 truncate text-meta text-ink-3">
                  {option.gloss}
                </span>
              )}
            </span>
            {/* Kept in the layout when unselected so the label does not shift
                by the glyph's width on the tap that selects it. */}
            <span
              aria-hidden
              className={cn("shrink-0", selected ? "text-accent" : "text-transparent")}
            >
              ✓
            </span>
          </button>
        );
      })}
    </div>
  );
}
