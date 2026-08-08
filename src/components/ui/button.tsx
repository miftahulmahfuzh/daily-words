import Link from "next/link";
import { cn } from "@/lib/ui/cn";
import { Spinner } from "./spinner";

type Variant = "filled" | "outline" | "quiet";
type Size = "sm" | "md" | "lg";

const SIZE: Record<Size, string> = {
  sm: "h-11 px-4", // 44 — the touch floor, and the floor is a legal size
  md: "h-[50px] px-5",
  lg: "h-[52px] px-6",
};

const VARIANT: Record<Variant, string> = {
  // The primary action is ink on paper reversed out — the darkest thing on the
  // screen. The accent is green and reserved for state (a tick, a streak, an
  // insight); using it for buttons would make every screen shout at once.
  filled: "border border-ink bg-ink text-paper",
  outline: "border border-rule text-ink-2",
  quiet: "border border-transparent text-ink-3",
};

/**
 * Every button in the app.
 *
 * Labels are mono, uppercase and letter-spaced: a button is the machine's
 * offer, not the app's prose. There is no icon-only variant — if an action
 * cannot be named in one or two words it does not belong on a phone screen, and
 * ROADMAP [R18] removed the icon set entirely.
 *
 * The global CSS kills the iOS tap highlight, so `:active` feedback is owed by
 * every interactive element; it is `opacity` rather than `transform: scale`,
 * which reflows text and looks cheap at 3×.
 */
export function Button({
  children,
  variant = "outline",
  size = "lg",
  shape = "field",
  fullWidth = true,
  href,
  type = "button",
  loading = false,
  disabled = false,
  onClick,
  className,
  ...rest
}: {
  children: React.ReactNode;
  variant?: Variant;
  size?: Size;
  /** `pill` is for the small header controls; `field` for everything committed. */
  shape?: "field" | "pill";
  fullWidth?: boolean;
  href?: string;
  type?: "button" | "submit";
  /** Keeps the label so the button does not resize while it works. */
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLElement>, "onClick" | "type">) {
  const cls = cn(
    "inline-flex items-center justify-center gap-2 font-mono text-mono-md tracking-cta uppercase touch-manipulation",
    shape === "pill" ? "rounded-[var(--r-pill)]" : "rounded-[var(--r-field)]",
    SIZE[size],
    VARIANT[variant],
    fullWidth && "w-full",
    (disabled || loading) && "opacity-60",
    className,
  );

  const body = (
    <>
      {loading && <Spinner size={16} />}
      {children}
    </>
  );

  if (href && !disabled && !loading) {
    return (
      <Link href={href} className={cls} {...rest}>
        {body}
      </Link>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cls}
      {...rest}
    >
      {body}
    </button>
  );
}
