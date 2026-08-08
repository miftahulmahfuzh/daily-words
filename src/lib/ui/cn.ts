import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge has to be taught this project's type scale.
 *
 * Its font-size validator only recognises t-shirt sizes — `xs`, `sm`, `2xl` and
 * so on. Anything else in a `text-*` class is assumed to be a colour. So
 * `cn("text-mono-xs", "text-ink-3")` classified BOTH as colours, decided they
 * conflicted, and silently dropped the size: every eyebrow in the app rendered
 * at the inherited 16px instead of 10px, and the /today header came out 34px
 * taller than the budget allowed for.
 *
 * Nothing failed loudly. It was found by measuring the header in a browser,
 * which is the argument for the layout spec existing at all.
 *
 * The rule: any `--text-*` token whose name is not a t-shirt size must be listed
 * here. `text-sm`, `text-base`, `text-lg`, `text-xl` and `text-2xl` are
 * recognised already; these are not.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "meta",
            "body",
            "mono-2xs",
            "mono-xs",
            "mono-sm",
            "mono-md",
            "mono-lg",
            "mono-xl",
          ],
        },
      ],
      tracking: [
        {
          tracking: [
            "display",
            "title",
            "tight",
            "meta",
            "chip",
            "nav",
            "cta",
            "eyebrow",
          ],
        },
      ],
    },
  },
});

/**
 * Combine class names, letting the caller's classes win.
 *
 * Every component in the kit ends its class string with `cn(..., className)`,
 * so a consumer passing `className="text-ink-3"` overrides the component's own
 * colour rather than racing it on source order.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
