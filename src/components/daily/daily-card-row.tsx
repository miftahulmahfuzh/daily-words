import Link from "next/link";
import { cn } from "@/lib/ui/cn";
import type { DailyCardItemView } from "@/lib/ui/types";
import { Skeleton } from "@/components/ui/skeleton";
import { vocabDetailHref } from "@/lib/vocab/links";

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
  href,
  last = false,
}: {
  item: DailyCardItemView;
  /**
   * Where the row goes. **Defaults to the word on /today**, which is what this
   * component meant before F18 and still means everywhere but one page.
   *
   * F11's comment here predicted the shape and F18 took it: "if F18's public
   * shared card ever wants this row, lift the href to a prop rather than adding
   * a `share` origin — a public page's rows must not link into `(app)`, which
   * would bounce an anonymous visitor to /signin."
   *
   * Additive and defaulted, so one row component serves both pages and the
   * no-scroll spec's `data-testid="daily-card-row"` keeps covering both. The
   * alternative — forking the row — gives two components that drift and a spec
   * that measures only one of them.
   */
  href?: string;
  /** No hairline after the last row. */
  last?: boolean;
}) {
  /* `"today"` is a literal because the *default* meaning of this component is a
     row of today's card, so the word it opens must come back here (F11 D4). */
  return (
    <Link
      href={href ?? vocabDetailHref(item.id, "today")}
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
