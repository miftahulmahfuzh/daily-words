import { Meta } from "@/components/ui/text";

/**
 * The card's slot when there is nothing to put in it.
 *
 * Same dashed outline and same slot in the vertical budget as `NoCardYet`, so
 * adding a word changes what is on the screen and never how the screen is
 * arranged. `NoCardYet` itself is the kit's component for "no card *yet*" and
 * carries the copy for it; these are the states where the button would be a lie
 * — there are no words to draw from, or no timezone to date the card with — so
 * they say what is actually missing and offer the way out of it.
 *
 * No illustration and no icon, per [R18]. A drawing of an empty box is a way of
 * apologising for a screen with nothing to apologise for.
 */
export function CardEmpty({
  title,
  actions,
  note,
}: {
  /** One short line. Sentence case. */
  title: string;
  /** One or two links out. Never more — this is a dead end with an exit, not a menu. */
  actions: React.ReactNode;
  note?: string;
}) {
  return (
    <div
      data-testid="card-empty"
      className="dw-fade flex min-h-0 flex-1 flex-col items-center justify-center gap-[22px] rounded-[var(--r-card)] border border-dashed border-rule p-7 text-center"
    >
      <p className="m-0 max-w-[230px] text-lg leading-[1.45] text-ink-2 text-pretty">
        {title}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">{actions}</div>
      {note && <Meta>{note}</Meta>}
    </div>
  );
}
