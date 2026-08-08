import Link from "next/link";
import { cn } from "@/lib/ui/cn";

/**
 * A small rounded label — sometimes a control, sometimes just a fact.
 *
 * The streak level on /profile, the "12 day run" link on /today, the just-added
 * word chips on /vocab/new. `mono` decides which voice it speaks in: a count is
 * mono, a word is serif.
 */
export function Pill({
  children,
  href,
  tone = "outline",
  mono = false,
  className,
}: {
  children: React.ReactNode;
  href?: string;
  tone?: "outline" | "accent" | "ink";
  mono?: boolean;
  className?: string;
}) {
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

  return href ? (
    <Link href={href} className={cls}>
      {children}
    </Link>
  ) : (
    <span className={cls}>{children}</span>
  );
}
