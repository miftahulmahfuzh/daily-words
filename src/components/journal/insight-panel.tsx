import { Eyebrow, Meta, Prose } from "@/components/ui/text";
import type { Insight } from "@/lib/journal/schemas";

/**
 * The insight, drawn as the design draws it: a block ruled down its left edge in
 * the accent, never a card and never a bubble. It is the one place the accent
 * green carries meaning on this screen.
 *
 * Two headings rather than the design's single `Insight` label, because the
 * insight is a two-part structure ([R7]) and the parts answer different
 * questions. Both are mono: they are the machine's own bookkeeping over prose it
 * produced.
 *
 * The situations are a plain stack with no bullets and no numbers. They are not
 * ranked and not a procedure, and a bulleted list would imply both.
 */
export function InsightPanel({ insight }: { insight: Insight }) {
  return (
    <div className="dw-in mt-5.5 flex flex-col gap-2 border-l-2 border-accent pl-3.5">
      <Eyebrow size="sm" tone="accent">
        What it means
      </Eyebrow>
      <Prose size="body" className="leading-[1.5]">
        {insight.meaning}
      </Prose>

      <Eyebrow size="sm" className="pt-2.5">
        When it applies
      </Eyebrow>
      <div className="flex flex-col gap-1.5">
        {insight.whenItApplies.map((line, i) => (
          <Prose key={i} size="sm" tone="faint" className="leading-[1.45]">
            {line}
          </Prose>
        ))}
      </div>

      {/* The design's line, kept verbatim. It is the app being honest about
          where the paragraph came from, which matters more here than anywhere
          else in the app: everything else on this screen is the user's own. */}
      <Meta className="pt-1 tracking-[0.08em]">
        Written by the machine. Keep or discard.
      </Meta>
    </div>
  );
}
