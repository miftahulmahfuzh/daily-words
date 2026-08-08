import { cn } from "@/lib/ui/cn";
import { LAYOUT } from "@/lib/ui/layout";
import type { DailyCardItemView } from "@/lib/ui/types";
import { DailyCardRow } from "./daily-card-row";

/**
 * The card. Six words, at most two lines each, and it never scrolls.
 *
 * The guarantee is structural rather than arithmetic (ROADMAP [R19]): the card
 * is `flex: 1` in the screen's fixed-height column, taking whatever is left
 * after the header, day strip and tab bar, and the rows are `flex: 1 1 0` with
 * `min-height: 0` so they divide that space and compress into it. Nothing here
 * is a computed pixel total, which is why the layout survives a device the
 * ledger never measured.
 *
 * Fewer than six words is a real state, not an error: the rows spread out, the
 * card keeps its shape, and `shortCardAction` offers a way to fill it. The card
 * is never padded with placeholder rows — the roadmap forbids filler, and six
 * greyed slots would make a small collection feel like a failure.
 */
export function DailyCard({
  items,
  shortCardAction,
  className,
}: {
  /** 0..6. More than six is a programming error and is sliced, loudly. */
  items: DailyCardItemView[];
  /** Shown beneath the rows when the card is short. F5 supplies it. */
  shortCardAction?: React.ReactNode;
  className?: string;
}) {
  let rows = items;
  if (items.length > LAYOUT.cardSize) {
    if (process.env.NODE_ENV !== "production") {
      throw new Error(
        `DailyCard received ${items.length} items; the card holds ${LAYOUT.cardSize}.`,
      );
    }
    console.warn(
      `DailyCard received ${items.length} items; slicing to ${LAYOUT.cardSize}.`,
    );
    rows = items.slice(0, LAYOUT.cardSize);
  }

  return (
    <div
      data-testid="daily-card"
      className={cn(
        "dw-in flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--r-card)] border border-rule bg-card px-4 py-1",
        className,
      )}
    >
      {rows.map((item, i) => (
        <DailyCardRow
          key={item.id}
          item={item}
          last={i === rows.length - 1 && !shortCardAction}
        />
      ))}
      {shortCardAction && (
        <div className="flex shrink-0 items-center justify-center py-3">
          {shortCardAction}
        </div>
      )}
    </div>
  );
}
