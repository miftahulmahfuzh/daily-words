import { Card } from "@/components/ui/card";
import { Meta, Prose } from "@/components/ui/text";
import { cn } from "@/lib/ui/cn";
import type { Suggestion } from "@/lib/vocab/schemas";

/**
 * One proposal. Presentational, stateless, no fetch — the whole of F8's
 * rendering, so the panel above it is only state.
 *
 * The design's Discover card ([R18]) sets the term at 26px with the part of
 * speech beside it on the baseline and the meaning beneath in `--ink-2`. The
 * term is the largest thing on the screen because this screen is about one word.
 *
 * Both text blocks clamp. The gloss is capped at 80 characters server-side and
 * still gets `line-clamp-2`: the tab must not grow a third line and push the two
 * buttons under the tab bar, which is the same discipline [R19] applies to the
 * daily card.
 */

/**
 * The term steps down rather than ellipsising, because on this screen the term
 * *is* the decision — `circumlocution…` is not something anyone can say yes or
 * no to. Same idea as `termSizeClass` on the detail page, different ramp: that
 * one starts at 38px in a full-width column, this one at the design's 26px
 * inside a card with the part of speech beside it. Truncation survives as the
 * last resort at 32 characters, which is where the shape filter caps a term.
 *
 * Both steps are sizes the design already uses; neither was invented here.
 */
function termClass(term: string): string {
  if (term.length <= 14) return "text-2xl tracking-title";
  if (term.length <= 22) return "text-xl tracking-tight";
  return "text-lg tracking-tight";
}

export function SuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  return (
    <Card className="dw-in flex flex-col gap-3">
      <div className="flex items-baseline gap-2.5">
        <span
          lang="en"
          className={cn("min-w-0 truncate text-ink", termClass(suggestion.term))}
        >
          {suggestion.term}
        </span>
        <Meta>{suggestion.partOfSpeech}</Meta>
      </div>
      <Prose size="body" className="line-clamp-2">
        {suggestion.gloss}
      </Prose>
    </Card>
  );
}
