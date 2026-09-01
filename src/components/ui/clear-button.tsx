import { cn } from "@/lib/ui/cn";

/**
 * The mark that empties a field, for `TextInput`'s `trailing` slot.
 *
 * Presentational and nothing else: no state, no ref, no opinion about what
 * clearing means. The caller empties its own value and puts focus back, because
 * the caller is the one holding the input.
 *
 * Three things here are decisions rather than defaults:
 *
 * - **`✕` (U+2715), not an icon.** There is not one `<svg>` in `src/`; this app
 *   draws its marks as characters, and this is the codepoint `calendar-cell.tsx`
 *   already chose for a cross. In the mono face at `text-ink-3` it reads as the
 *   field's own punctuation opposite the leading `/` — one mono mark at each end,
 *   same tone — rather than as a second control bolted into the row.
 * - **40×40, under the repo's 44px touch floor.** The floor is real and eight
 *   files cite it, and it cannot be met inside this field: both search fields are
 *   `h-10`, so a 44px child overflows its border box by 2px top and bottom. 40 is
 *   the largest square the field admits, and it is larger than the 36px `+ Line`
 *   pill on the header directly above it.
 * - **`-mr-3.5` cancels the field's own right padding**, so the button's edge is
 *   flush with the inner border and the glyph sits centred 20px in. Without it
 *   the glyph floats 34px from the edge and reads as unaligned.
 *
 * No `:active` state of its own — `globals.css` removes the tap highlight from
 * every `button` and gives it `opacity: 0.6` in exchange, and this is a `button`.
 */
export function ClearButton({
  onClick,
  label,
  className,
}: {
  onClick: () => void;
  /** The accessible name. There is no visible one — the glyph is the whole label. */
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "-mr-3.5 flex h-10 w-10 shrink-0 items-center justify-center font-mono text-mono-lg text-ink-3",
        className,
      )}
    >
      {/* The glyph is decorative; `aria-label` above is what is announced. */}
      <span aria-hidden="true">✕</span>
    </button>
  );
}
