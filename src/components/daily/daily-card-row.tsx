import Link from "next/link";
import { cn } from "@/lib/ui/cn";
import type { DailyCardItemView } from "@/lib/ui/types";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * One word on the card: the term, and a one-line meaning.
 *
 * Both lines are clamped to exactly one line — the term truncates, the
 * definition truncates — and that is what makes the card's height predictable
 * rather than hoped for. No term, no definition, no locale and no font
 * substitution can change a row's height. "incomprehensibilities" gets an
 * ellipsis and the full word is a tap away on /vocab/[id].
 *
 * The row is `flex-1 min-h-0` so six of them divide whatever the card was
 * given ([R19]). At 375×667 that lands above the 52px floor; the Playwright
 * spec asserts it rather than trusting it.
 */
export function DailyCardRow({
  item,
  last = false,
}: {
  item: DailyCardItemView;
  /** No hairline after the last row. */
  last?: boolean;
}) {
  return (
    <Link
      href={`/vocab/${item.id}`}
      data-testid="daily-card-row"
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-[3px] px-0.5 py-[11px]",
        !last && "border-b border-rule-2",
      )}
    >
      <span className="flex min-w-0 items-baseline gap-[9px]">
        <span data-testid="row-term" className="truncate text-xl tracking-tight text-ink">
          {item.term}
        </span>
        {item.tag && (
          <span className="shrink-0 font-mono text-mono-2xs tracking-[0.1em] text-ink-3 uppercase">
            {item.tag}
          </span>
        )}
      </span>
      {/* Enrichment pending: a placeholder inside the same line box, so a word
          whose meaning has not landed yet does not resize its own row. */}
      {item.definition === null ? (
        <span className="flex h-[20px] items-center">
          <Skeleton width="60%" height={12} />
        </span>
      ) : (
        <span data-testid="row-definition" className="truncate text-sm text-ink-2">
          {item.definition}
        </span>
      )}
    </Link>
  );
}
