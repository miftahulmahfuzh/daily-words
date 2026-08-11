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
  prefetch,
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
  /**
   * Passed straight to `<Link>`. Undefined — the default — is Next's `auto`,
   * which is what this row has always done.
   *
   * A prop rather than a default of `true`, for the reason the `href` prop above
   * exists: this component also draws F18's **public** shared card, and eagerly
   * prefetching six `/s/<slug>/<n>` snapshot pages for a stranger is a decision
   * nobody asked for. `/today` opts in; nothing else does.
   *
   * `true` here means `PrefetchKind.FULL`, and that is the whole point — it is
   * the only kind whose payload is *reusable* rather than merely `stale`. With
   * `staleTimes.dynamic` at its default 0, the `AUTO` prefetch this row gets by
   * default reuses only a loading boundary and lazy-fetches the real data on tap,
   * which is why a tap is not instant. `FULL` is governed by the neighbouring
   * `STATIC_STALETIME_MS` branch instead — 300s — with no config change.
   * See `router-reducer/prefetch-cache-utils.ts`'s `getPrefetchEntryCacheStatus`.
   */
  prefetch?: boolean;
}) {
  /* `"today"` is a literal because the *default* meaning of this component is a
     row of today's card, so the word it opens must come back here (F11 D4). */
  return (
    <Link
      href={href ?? vocabDetailHref(item.id, "today")}
      /* Never prefetch a word that is still enriching. The row below draws
         "finding it…" from `definition === null`, and a FULL prefetch would pin
         that sentence in the router cache for 300s — so the tap would show a
         spinner where today it renders fresh and shows the definition. The
         condition is the row's own pending branch rather than a second reading of
         it: `toDailyCardItemView` nulls `definition` unless the status is
         `ready`, so `definition !== null` *is* "ready". Nothing throws if this is
         got wrong, which is why it is one expression and not two. */
      prefetch={prefetch === undefined ? undefined : prefetch && item.definition !== null}
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
