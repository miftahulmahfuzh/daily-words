import { cn } from "@/lib/ui/cn";

/**
 * The mono voice, uppercase: section labels, dates, counts — anything the
 * machine tallies rather than the user wrote.
 *
 * The serif/mono split is the design's central idea and it is semantic, not
 * decorative: the serif means "this is language, read it", the mono means "this
 * is bookkeeping". Setting an eyebrow in the serif quietly breaks that.
 */
export function Eyebrow({
  children,
  size = "md",
  tone = "muted",
  className,
}: {
  children: React.ReactNode;
  /** `sm` (9px) subdivides a screen; `md` (10px) titles one. */
  size?: "sm" | "md";
  tone?: "muted" | "accent" | "ink";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-mono tracking-eyebrow uppercase",
        size === "sm" ? "text-mono-2xs" : "text-mono-xs",
        tone === "accent" ? "text-accent" : tone === "ink" ? "text-ink" : "text-ink-3",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * The mono voice, sentence case: a short aside the app says about itself.
 *
 * "Nothing is generated until you press it." Not uppercase, because it is a
 * sentence rather than a label, and not serif, because the app is speaking
 * about its own mechanics rather than about words.
 */
export function Meta({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("font-mono text-mono-xs tracking-meta text-ink-3", className)}>
      {children}
    </span>
  );
}

/**
 * A serif paragraph. `text-wrap: pretty` everywhere, never `hyphens: auto` —
 * Safari's English hyphenation is aggressive enough to make a card look broken.
 */
export function Prose({
  children,
  size = "base",
  tone = "muted",
  className,
}: {
  children: React.ReactNode;
  size?: "sm" | "body" | "base" | "lg";
  tone?: "ink" | "muted" | "faint";
  className?: string;
}) {
  return (
    <p
      className={cn(
        "m-0 text-pretty",
        size === "sm"
          ? "text-sm"
          : size === "body"
            ? "text-body"
            : size === "lg"
              ? "text-lg"
              : "text-base",
        tone === "ink" ? "text-ink" : tone === "faint" ? "text-ink-3" : "text-ink-2",
        className,
      )}
    >
      {children}
    </p>
  );
}
