import Link from "next/link";
import { cn } from "@/lib/ui/cn";
import type { CalendarMark } from "@/lib/ui/types";

/**
 * The mark itself, shared by the /today week strip and the /calendar month grid
 * so the two can never drift apart.
 *
 * Today with no card yet is an open ring, never a cross: a day is not a failure
 * until it is over. Today with a card is an ordinary tick — it earned one.
 */
export function CalendarMarkGlyph({
  mark,
  isToday = false,
}: {
  mark: CalendarMark;
  isToday?: boolean;
}) {
  if (mark === "made") {
    return <span className="text-[12px] text-accent">✓</span>;
  }
  if (isToday) {
    return (
      <span className="inline-block size-[9px] rounded-full border border-ink" />
    );
  }
  if (mark === "missed") {
    return <span className="text-[11px] text-miss">✕</span>;
  }
  return <span className="inline-block h-px w-[9px] bg-rule" />;
}

/**
 * One day in the month grid: a numeral and its mark.
 *
 * The visual is small but the cell is a full square of the grid, so the tap
 * target clears 44px at 375px width without the grid looking chunky —
 * (375 − 44 gutter) / 7 ≈ 47px per column.
 *
 * `accessibleDate` is supplied by the caller rather than formatted here on
 * purpose: every date in this app belongs to the user's timezone, and the kit
 * has no business deciding what "8 August" means.
 */
export function CalendarCell({
  day,
  mark,
  isToday = false,
  href,
  accessibleDate,
  className,
}: {
  /** 1..31. Null renders an empty leading cell in the first week. */
  day: number | null;
  mark: CalendarMark;
  isToday?: boolean;
  /** Links to that day's card. Only meaningful when `mark === "made"`. */
  href?: string;
  /** Pre-formatted in the user's timezone, e.g. "8 August". */
  accessibleDate?: string;
  className?: string;
}) {
  if (day === null) {
    return <div aria-hidden="true" className="aspect-square" />;
  }

  const label = accessibleDate
    ? `${accessibleDate}, ${
        mark === "made" ? "card made" : isToday ? "today, no card yet" : mark === "missed" ? "no card" : "not yet"
      }`
    : undefined;

  const body = (
    <>
      <span
        className={cn(
          "font-mono text-mono-sm",
          isToday ? "text-ink" : "text-ink-3",
        )}
      >
        {day}
      </span>
      <CalendarMarkGlyph mark={mark} isToday={isToday} />
    </>
  );

  const cls = cn(
    "flex aspect-square flex-col items-center justify-center gap-1",
    className,
  );

  if (href && mark === "made") {
    return (
      <Link href={href} aria-label={label} className={cls}>
        {body}
      </Link>
    );
  }

  return (
    <div
      className={cls}
      aria-label={label}
      // A future day carries no information a screen reader needs to stop on.
      aria-hidden={mark === "future" && !isToday ? "true" : undefined}
    >
      {body}
    </div>
  );
}
