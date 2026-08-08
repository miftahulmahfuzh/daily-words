import { cn } from "@/lib/ui/cn";
import { Meta } from "@/components/ui/text";

/**
 * The card that has not been made yet.
 *
 * A dashed outline rather than a filled card, because the space is real and
 * empty — the shape of the thing is already there and the user has not yet put
 * anything in it. It occupies exactly the same slot in the budget as a made
 * card, so pressing the button changes what is on the screen and never how the
 * screen is arranged.
 *
 * The line beneath the button is the product's whole argument in seven words:
 * the ritual is the point, so nothing is generated on a schedule or on page
 * load. Do not soften it into "Generating…" — there is nothing to generate
 * until the user asks.
 */
export function NoCardYet({
  action,
  className,
}: {
  /** The nudge button. F5 supplies the server action that creates the card. */
  action: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      data-testid="no-card-yet"
      className={cn(
        "dw-fade flex min-h-0 flex-1 flex-col items-center justify-center gap-[22px] rounded-[var(--r-card)] border border-dashed border-rule p-7 text-center",
        className,
      )}
    >
      <p className="m-0 max-w-[230px] text-lg leading-[1.45] text-ink-2 text-pretty">
        No card yet. Six words are waiting to be written out.
      </p>
      {action}
      <Meta>Nothing is generated until you press it.</Meta>
    </div>
  );
}
