import Link from "next/link";
import { cn } from "@/lib/ui/cn";

/**
 * A small rounded label — sometimes a control, sometimes just a fact.
 *
 * The streak level on /profile, the "12 day run" link on /today, the just-added
 * word chips on /vocab/new. `mono` decides which voice it speaks in: a count is
 * mono, a word is serif.
 *
 * Three elements, chosen by what it is given, the way `Button` already chooses
 * between a `Link` and a `<button>`: `href` makes it a link, `onClick` makes it a
 * real `<button>`, and neither makes it a `<span>`. [R23] added the third case —
 * `/journal`'s add control opens a composer in place rather than navigating, and
 * a `<span onClick>` would be untabbable, unannounced and unactivatable by
 * keyboard. Passing both is a mistake the types refuse.
 *
 * `Chip` remains the tappable sibling for *selection* — it carries
 * `aria-pressed` and a 44px floor. This is a plain action.
 */
type PillProps = {
  children: React.ReactNode;
  tone?: "outline" | "accent" | "ink";
  mono?: boolean;
  className?: string;
} & (
  | { href: string; onClick?: never }
  | { onClick: () => void; href?: never; "aria-expanded"?: boolean }
  | { href?: never; onClick?: never }
);

export function Pill({
  children,
  href,
  onClick,
  tone = "outline",
  mono = false,
  className,
  ...rest
}: PillProps) {
  const cls = cn(
    "inline-flex items-center rounded-[var(--r-pill)] border",
    mono
      ? "font-mono text-mono-sm tracking-chip uppercase px-3"
      : "text-sm px-3.5 py-1.5",
    tone === "outline" && "border-rule text-ink-2",
    tone === "accent" && "border-accent text-accent",
    tone === "ink" && "border-ink bg-ink text-paper",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }

  if (onClick) {
    return (
      /* `type="button"` explicitly: inside a form the default is `submit`, and
         this pill opens a composer rather than sending anything. */
      <button type="button" onClick={onClick} className={cls} {...rest}>
        {children}
      </button>
    );
  }

  return <span className={cls}>{children}</span>;
}
