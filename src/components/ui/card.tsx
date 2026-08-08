import { cn } from "@/lib/ui/cn";

/**
 * The paper primitive — the raised stock everything else sits on.
 *
 * A card never nests inside another card, and a card never scrolls internally.
 * If content overflows, the page scrolls or the content is clamped; a card that
 * scrolls stops reading as a physical object, which is the whole point of it.
 *
 * Elevation is carried by `--card` sitting lighter than `--paper` plus a
 * hairline, never by a shadow. In dark mode that is the only thing separating
 * them, so any component that relies on a shadow to be legible is wrong.
 */
export function Card({
  children,
  as: Tag = "div",
  variant = "raised",
  padding = "md",
  className,
}: {
  children: React.ReactNode;
  as?: "div" | "section" | "article";
  /** `raised` is stock on paper; `outline` is a ruled region; `dashed` is a space waiting to be filled. */
  variant?: "raised" | "outline" | "dashed";
  padding?: "none" | "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <Tag
      className={cn(
        "rounded-[var(--r-card)] border",
        variant === "raised" && "border-rule bg-card",
        variant === "outline" && "border-rule",
        variant === "dashed" && "border-dashed border-rule",
        padding === "sm" && "p-3.5",
        padding === "md" && "p-5",
        padding === "lg" && "p-7",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
