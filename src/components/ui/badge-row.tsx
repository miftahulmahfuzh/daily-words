import { cn } from "@/lib/ui/cn";

/**
 * One awarded badge on /profile.
 *
 * This replaces F2 §6.10's `BadgeChip` under ROADMAP [R18]. The design draws
 * badges as a ruled list, not as wrapping pills, and the list is the better
 * answer for the same reason F2 gave for refusing to truncate: the roadmap's
 * titles run to "No Weekend Without Ration Card", and a chip that long stops
 * being a chip. A row gives the title a full line and puts the count where the
 * eye already is.
 *
 * Unearned badges are shown, greyed. Seeing what is still out there is the
 * point of a badge list; hiding them turns it into a receipt.
 */
export function BadgeRow({
  label,
  count = 0,
  className,
}: {
  /** The exact title string from the roadmap's badge table. */
  label: string;
  /** Occurrences. Badges repeat across years, so this is "×2", not a boolean. */
  count?: number;
  className?: string;
}) {
  const earned = count > 0;

  return (
    <div
      className={cn(
        "flex items-baseline gap-3 border-b border-rule-2 py-3.5",
        className,
      )}
    >
      <span
        className={cn("size-[7px] shrink-0", earned ? "bg-accent" : "bg-rule")}
      />
      <span
        className={cn(
          "flex-1 text-body leading-[1.3] text-pretty",
          earned ? "text-ink" : "text-ink-3",
        )}
      >
        {label}
      </span>
      <span className="font-mono text-mono-sm tabular-nums text-ink-3">
        {earned ? `×${count}` : "—"}
      </span>
    </div>
  );
}
