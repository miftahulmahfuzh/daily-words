import { LEVEL_ART, LEVEL_ART_SMALL_SIZE } from "@/lib/gamification/level-art";
import type { LevelArtKey } from "@/lib/gamification/levels";
import { cn } from "@/lib/ui/cn";

/**
 * The illustration for the level a user currently holds, drawn small beside the
 * pill on /profile.
 *
 * The user's ask: "for every streak, every collection level, generate a badge
 * illustration as well."
 *
 * **There is no `earned` prop, and its absence is the design** (F22 D5). The key
 * this takes came out of `levelArtKey(kind, level.index)`, and a tier the user
 * does not hold has no index to produce one — so an unearned state is not
 * reachable here, unlike `BadgeMedal`, where the shelf deliberately draws every
 * unearned badge at `opacity-40`. /profile has never listed the tiers and this
 * does not start: the next tier's *name* is already in `levelCaption`, its
 * picture is not, and that is the one thing withheld. It costs nothing and it is
 * what makes the illustration changing under the pill a small event rather than
 * a checklist item ticking. [R18] removed the tier ramp for the same reason.
 *
 * A plain function component, not a client component of its own — it holds no
 * state and no handler, so it composes into a client boundary without adding
 * one, exactly as `BadgeMedal` does.
 *
 * **Not `next/image`**, for the reason `badge-medal.tsx` gives: a fixed-size,
 * content-hashed local asset already served `immutable` for a year has nothing
 * left for the optimiser, and `next/image` appears nowhere in `src`.
 *
 * `alt=""` and `aria-hidden`: the pill immediately beside it carries the title,
 * and the style contract forbids lettering inside the frame, which is exactly
 * why the title is drawn beside the picture rather than in it.
 */
export function LevelMark({
  artKey,
  className,
}: {
  artKey: LevelArtKey;
  className?: string;
}) {
  const art = LEVEL_ART[artKey];

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={art.small}
      // The intrinsic size, not the drawn one — it is what stops the row
      // shifting while the image loads. The 192² asset covers a 56 css px draw
      // past 3×.
      width={LEVEL_ART_SMALL_SIZE}
      height={LEVEL_ART_SMALL_SIZE}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn(
        // `.dw-level-mark` carries the size, in globals.css beside the dialog's
        // other measured rules — see the note there for why it is a constant
        // and `.dw-badge-medal` is not.
        "dw-level-mark block shrink-0 rounded-[var(--r-card)]",
        className,
      )}
    />
  );
}
