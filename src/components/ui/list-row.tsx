import Link from "next/link";
import { cn } from "@/lib/ui/cn";

/**
 * The only list affordance in the app.
 *
 * `inline` puts the title and its gloss on one baseline and truncates the
 * gloss — that is the vocab list and the kept-from-Discover list, where the
 * term is what you scan and the meaning is a reminder. `stacked` gives the
 * title up to three lines with the metadata beneath, which is the journal, where
 * the text *is* the entry.
 *
 * Never put a second tappable control inside a row. The trailing slot takes
 * text or a static mark, not a button: nested tap targets are the first cause
 * of mis-taps on a phone.
 */
export function ListRow({
  href,
  onClick,
  leading,
  title,
  subtitle,
  trailing,
  layout = "inline",
  muted = false,
  strikethrough = false,
  divider = true,
  className,
}: {
  href?: string;
  onClick?: () => void;
  /** A mark, not a control. ≤ 28px. */
  leading?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
  layout?: "inline" | "stacked";
  /** Retired words sit back rather than disappear. */
  muted?: boolean;
  /** Rules the title through. Reserved for `status = 'mastered'`. */
  strikethrough?: boolean;
  divider?: boolean;
  className?: string;
}) {
  const cls = cn(
    "flex w-full min-h-[46px] text-left",
    layout === "inline"
      ? "items-baseline gap-2.5 py-3 pr-2"
      : "flex-col gap-[7px] py-4",
    divider && "border-b border-rule-2",
    muted && "text-ink-3",
    className,
  );

  const body =
    layout === "inline" ? (
      <>
        {leading}
        {/* `min-w-0 truncate` is load-bearing, not tidiness. Without it a flex
            item never shrinks below its text, so a long term ran off the right
            edge of the row and was clipped by the pane with no ellipsis and no
            hint that anything was missing — found by screenshotting /vocab at
            375px with a 36-character word. The design's own rows omit it only
            because its sample terms are all short; real terms run to
            MAX_TERM_CHARS. */}
        <span
          className={cn(
            "min-w-0 truncate text-lg",
            muted ? "text-ink-3" : "text-ink",
            strikethrough && "line-through",
          )}
        >
          {title}
        </span>
        {subtitle != null && (
          <span className="min-w-0 flex-1 truncate text-meta text-ink-3">
            {subtitle}
          </span>
        )}
        {trailing}
      </>
    ) : (
      <>
        <span className="flex items-baseline gap-2.5">
          {leading}
          <span className="line-clamp-3 flex-1 text-lg tracking-tight text-ink text-pretty">
            {title}
          </span>
          {trailing}
        </span>
        {subtitle != null && (
          <span className="font-mono text-mono-xs tracking-[0.08em] text-ink-3">
            {subtitle}
          </span>
        )}
      </>
    );

  if (href) {
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {body}
      </button>
    );
  }

  return <div className={cls}>{body}</div>;
}
