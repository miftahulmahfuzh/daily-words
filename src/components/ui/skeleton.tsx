import { cn } from "@/lib/ui/cn";

/**
 * A placeholder block for a value that has been asked for but not yet arrived —
 * `enrichment_status = 'pending'` on a word, mostly.
 *
 * It does not shimmer. A static block is calmer, costs no animation frame, and
 * on a card whose whole argument is stillness a pulsing rectangle is the single
 * most out-of-place thing that could appear.
 */
export function Skeleton({
  width = "60%",
  height = 12,
  className,
}: {
  width?: string | number;
  height?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("block rounded-[var(--r-chip)] bg-rule-2", className)}
      style={{ width, height }}
    />
  );
}
