import { cn } from "@/lib/ui/cn";

type Variant = "boxed" | "underline" | "pill";

const WRAP: Record<Variant, string> = {
  boxed: "rounded-[var(--r-field)] border border-rule bg-card px-3.5",
  // The underline field is for the one word a screen exists to capture — it has
  // no box because there is nothing to distinguish it from.
  underline: "border-b border-ink pb-3",
  pill: "rounded-[var(--r-pill)] border border-rule bg-card px-4",
};

/**
 * A single-line field.
 *
 * `type="number"` is deliberately not offered: iOS renders it with a numeric
 * keypad that hides the return key, and some builds add spinner chrome. Use
 * `inputMode="numeric"` on a text field instead.
 *
 * The defaults are chosen for this app's primary input, which is /vocab/new:
 * autocapitalise off, autocorrect off, spellcheck off. iOS will otherwise
 * silently rewrite "genteell" to "gentle" before the app ever sees it, which
 * makes the typo-correction feature impossible to trigger. The journal and chat
 * composers override all three.
 */
export function TextInput({
  id,
  name,
  variant = "boxed",
  leading,
  trailing,
  className,
  inputClassName,
  autoCapitalize = "none",
  autoCorrect = "off",
  spellCheck = false,
  ...rest
}: {
  variant?: Variant;
  /** Rendered inside the field, before the input. A mark, not a control. */
  leading?: React.ReactNode;
  /** Rendered inside the field, after the input. May be a control. */
  trailing?: React.ReactNode;
  className?: string;
  inputClassName?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "className" | "size">) {
  return (
    <div className={cn("flex items-center gap-2.5", WRAP[variant], className)}>
      {leading}
      <input
        id={id}
        name={name}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        spellCheck={spellCheck}
        className={cn(
          // 17px clears iOS Safari's 16px zoom-on-focus threshold. The base rule
          // in globals.css enforces the floor a second time; both are deliberate.
          "min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-3",
          variant === "boxed" && "h-[46px]",
          variant === "pill" && "h-11",
          inputClassName,
        )}
        {...rest}
      />
      {trailing}
    </div>
  );
}
