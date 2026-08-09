import { BADGE_ART, BADGE_ART_SIZE } from "@/lib/gamification/badge-art";
import type { BadgeKey } from "@/lib/gamification/badges";
import { cn } from "@/lib/ui/cn";

/**
 * One badge's medal, drawn large. The picture the user asked for: "a big modal,
 * showing a picture of the medal".
 *
 * A plain function component, not a client component of its own — it holds no
 * state and no handler, so it composes into `BadgeDialog`'s client boundary
 * without adding one.
 *
 * **Not `next/image`.** It is not imported anywhere in `src`, `next.config.ts`
 * has no `images` block, and a fixed-size local asset in `public/` gains nothing
 * from it. The intrinsic size comes from `BADGE_ART_SIZE` rather than a literal,
 * so the numbers live in one place (the generated manifest) and a component
 * never restates them.
 *
 * `alt=""` and `aria-hidden` because the art is decorative in the strict sense:
 * the `<h2>` directly below names the badge and the condition states what earns
 * it, so alt text here would only repeat the heading. The style contract forbids
 * lettering inside the seal, which is exactly why the title is drawn beside it.
 *
 * Unearned is `opacity-40` and nothing else. **No `grayscale()` and no `blur()`**
 * — a greyscale filter reads as damage in dark mode, and a blur reads as locked
 * content, which `badge-shelf.tsx` has already ruled out.
 */
export function BadgeMedal({
  badgeKey,
  earned,
  className,
}: {
  badgeKey: BadgeKey;
  earned: boolean;
  className?: string;
}) {
  const art = BADGE_ART[badgeKey];

  return (
    // Deliberate: a fixed-size, content-hashed local asset already served
    // `immutable` for a year has nothing left for the optimiser to do, and
    // `next/image` appears nowhere else in `src`.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={art.src}
      // The intrinsic size, not the drawn one — it is what stops the layout
      // shifting while the image loads. The 768² master covers the ~220 css px
      // panel draw past 3×.
      width={BADGE_ART_SIZE}
      height={BADGE_ART_SIZE}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn(
        // `.dw-badge-medal` carries the size, in globals.css beside the dialog's
        // other measured rules, because it is a `dvh` clamp rather than a
        // constant — see the note there.
        "dw-badge-medal block max-w-full rounded-[var(--r-card)]",
        !earned && "opacity-40",
        className,
      )}
    />
  );
}
