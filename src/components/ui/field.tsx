import { cn } from "@/lib/ui/cn";
import { Eyebrow, Meta } from "./text";

/**
 * Label, control, and then either a hint or an error — never both. The error
 * wins, because a hint the user has already failed to follow is noise.
 *
 * The `aria-describedby` wiring is the point of the component: the message is
 * announced with the field rather than orphaned beneath it.
 */
export function Field({
  id,
  label,
  hint,
  error,
  hideLabel = false,
  children,
  className,
}: {
  /** Must match the control's own id. */
  id: string;
  label: string;
  hint?: string;
  error?: string;
  /**
   * Keep the label for screen readers but not on screen. For the field that
   * *is* the screen — /vocab/new asks for one word and says so in its own
   * title, so a second "WORD" above the input is repetition, not guidance.
   */
  hideLabel?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const messageId = `${id}-message`;

  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <label htmlFor={id} className={hideLabel ? "sr-only" : undefined}>
        {hideLabel ? label : <Eyebrow>{label}</Eyebrow>}
      </label>
      {children}
      {error ? (
        <span
          id={messageId}
          role="alert"
          className="font-mono text-mono-xs tracking-meta text-red"
        >
          {error}
        </span>
      ) : hint ? (
        <Meta>{hint}</Meta>
      ) : null}
    </div>
  );
}
