import { cn } from "@/lib/ui/cn";
import { Button } from "./button";

/**
 * A sentence and, sometimes, a button.
 *
 * No illustration, no icon, no emoji — partly because ROADMAP [R18] removed
 * icons from the app entirely, and partly because a drawing of an empty box is
 * a way of apologising for a screen that has nothing to apologise for. The copy
 * says what is missing and how to get it, and that is the whole component.
 */
export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  /** ≤ 40 characters, sentence case, no full stop. */
  title?: string;
  /** One sentence, ≤ 90 characters. */
  body: string;
  action?: { label: string; href?: string; onClick?: () => void };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-5 py-10 text-center",
        className,
      )}
    >
      {title && <p className="m-0 text-lg text-ink">{title}</p>}
      <p className="m-0 max-w-[250px] text-base text-ink-3 text-pretty">{body}</p>
      {action && (
        <Button
          variant="outline"
          size="sm"
          fullWidth={false}
          href={action.href}
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}
