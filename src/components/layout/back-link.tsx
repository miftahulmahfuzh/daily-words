import Link from "next/link";
import { cn } from "@/lib/ui/cn";

/**
 * Top-left back affordance.
 *
 * A supplement to the iOS edge-swipe gesture, never a replacement — it is a
 * real `<Link href>` so it also works when the app is launched cold at a deep
 * route, which a `history.back()` button does not. 44px tall because everything
 * tappable is, even when the glyph is an arrow.
 */
export function BackLink({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-[44px] items-center pr-3 font-mono text-mono-sm tracking-nav text-ink-3 uppercase",
        className,
      )}
    >
      ←&nbsp; {label}
    </Link>
  );
}
