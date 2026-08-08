import Link from "next/link";
import { cn } from "@/lib/ui/cn";

/**
 * Underline tabs, link-based.
 *
 * This is F2 §6.13's `SegmentedTabs` redrawn as the design draws it ([R18]): a
 * ruled strip with the active label underlined, not an iOS segmented control on
 * a sunken track. Same job, and it sits under a page title without looking like
 * a second toolbar.
 *
 * Every segment is a real URL — `/vocab` and `/vocab?tab=discover` — so reload
 * and edge-swipe back both work. Never reach for `history.replaceState` here:
 * replacing the entry removes the destination the back-swipe would return to.
 */
export function Tabs({
  items,
  className,
}: {
  items: { label: string; href: string; active: boolean }[];
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn("flex gap-[22px] border-b border-rule", className)}
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          role="tab"
          aria-selected={item.active}
          className={cn(
            "-mb-px border-b py-2.5 text-base",
            item.active
              ? "border-ink text-ink"
              : "border-transparent text-ink-3",
          )}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
