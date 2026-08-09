import { cn } from "@/lib/ui/cn";

/**
 * A multi-line field, for the journal composer and the chat composer.
 *
 * `resize: none` always — a draggable resize handle is desktop furniture and
 * on a phone it is a target the user hits by accident. Height is set by `rows`
 * or by the caller.
 */
export function TextArea({
  className,
  ref,
  rows = 3,
  autoCapitalize = "sentences",
  autoCorrect = "on",
  spellCheck = true,
  ...rest
}: {
  className?: string;
  /**
   * As on `TextInput`: React 19 passes `ref` to function components as an
   * ordinary prop, so this is only a type declaration — but without it the
   * compiler rejects the caller that needs one. F10's composer measures the
   * element to auto-grow it and re-focuses it after a save.
   */
  ref?: React.Ref<HTMLTextAreaElement>;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "className">) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      autoCapitalize={autoCapitalize}
      autoCorrect={autoCorrect}
      spellCheck={spellCheck}
      className={cn(
        "w-full resize-none rounded-[var(--r-field)] border border-rule bg-card px-3.5 py-3 text-base text-ink outline-none placeholder:text-ink-3",
        className,
      )}
      {...rest}
    />
  );
}
