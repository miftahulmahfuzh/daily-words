import type { CSSProperties } from "react";
import { cn } from "@/lib/ui/cn";

/**
 * A full-bleed band of art across the top of a panel: the square plate laid
 * `object-fit: contain` on a backdrop painted in the art's **own** paper colour,
 * so the region is one continuous sheet edge to edge.
 *
 * The user's ask (F21 §0): "can we change it so the color of the small square
 * fill the whole top half of the modal, so it is in full color, instead of
 * showing small square on top of a white background."
 *
 * **Why `contain` on a colour and not `cover` on a crop.** The deck is opaque,
 * square and already full-bleed, so cropping it into a wide band is the obvious
 * move — and it is wrong. Measured over all fourteen masters, ink reaches from
 * 6.2% to 95.7% of the image height (`ibu`'s prayer-bead tassel hangs out of the
 * bottom of the seal ring), which caps a centred crop at an aspect ratio of
 * 1.094. Any band worth calling a band slices a badge. F21 §1.2 has the table.
 *
 * **Why the colour is a prop and not a constant.** The fourteen plates span
 * #eae6d7 to #f1ede1 — one constant sits flush on `midnight_oil` and seams on
 * `ibu`. It comes from `BADGE_ART[key].plate`, sampled from the master by
 * `tools/make_badge_assets.py` and re-derived by `npm run badges:check`.
 *
 * **No `BadgeKey`, and that is the point.** F22 hangs streak and collector level
 * art in this same band; this component must not learn what a badge is. It takes
 * pixels and a colour. `dimmed` rather than `earned` for the same reason — a
 * level is not "earned".
 *
 * **Nothing here is focusable.** `showModal()` focuses the first focusable
 * descendant of the dialog, which is and must remain the Close button; an `<img>`
 * with no `tabIndex` keeps that true. Do not add a control to this band without
 * reading F21 D7.
 *
 * Not `next/image`, for the reason `badge-medal.tsx` gives: it is imported
 * nowhere in `src`, there is no `images` block in `next.config.ts`, and these are
 * fixed-size content-hashed local assets already served `immutable` for a year.
 */
export function ArtHero({
  src,
  intrinsic,
  plate,
  dimmed = false,
  className,
}: {
  src: string;
  /** The source's intrinsic square size, e.g. `BADGE_ART_SIZE`. Never a literal. */
  intrinsic: number;
  /** `#rrggbb`, the art's own paper. From the generated manifest, never chosen. */
  plate: string;
  /** The unearned / unreached treatment. See F21 D6 — it dims the whole band. */
  dimmed?: boolean;
  className?: string;
}) {
  return (
    <div
      // The dim goes HERE and not on the <img>. With it on the image the plate
      // stays at full strength, and in dark mode an unearned badge becomes a
      // slab of full-brightness cream — brighter than an earned one. F21 D6.
      className={cn("dw-badge-hero shrink-0", dimmed && "opacity-40", className)}
      // A per-instance custom property rather than an inline `background`, so the
      // rule that consumes it stays in globals.css beside the dialog's other
      // measured sizing and there is exactly one place that decides what the
      // fallback is.
      style={{ "--dw-plate": plate } as CSSProperties}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        // The intrinsic size, not the drawn one — it is what stops the band
        // reflowing while the image loads.
        width={intrinsic}
        height={intrinsic}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
    </div>
  );
}
