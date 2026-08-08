"use client";

import { Button } from "@/components/ui/button";
import { Eyebrow, Meta } from "@/components/ui/text";
import { cn } from "@/lib/ui/cn";

/**
 * The frame all five onboarding screens share.
 *
 * The chrome is the design's, at `design/from-claude-design/Daily Words.dc.html:76`
 * — five hairline segments and one muted text button on a 40px top row, a step
 * eyebrow, a 28px question, the input, and a single filled CTA at the foot. F7
 * §10 proposed 3px progress bars, no step counter, and a Skip/Next pair in the
 * footer; [R18] makes the design the visual source of truth, so it wins on all
 * three.
 *
 * Two things are added to it, both because the prototype had no state to lose:
 *
 * - A back chevron on screens 2–5. The steps are React state, not history
 *   entries, so iOS's edge-swipe leaves onboarding altogether — without this
 *   there is no way to revise an answer at all.
 * - `Skip all` in place of `Skip` on screen 1. F7 §10 wants both affordances;
 *   the design has one slot for them, and the per-question skip on screen 1 is
 *   already served by pressing Next on an empty field.
 *
 * Three bands at full height: chrome, question (the only band that shrinks when
 * the keyboard opens), footer above the home indicator.
 */
export function QuestionShell({
  step,
  total,
  question,
  children,
  onBack,
  skipLabel,
  onSkip,
  ctaLabel,
  onNext,
  busy = false,
  error,
}: {
  /** 1-based. */
  step: number;
  total: number;
  question: string;
  /** The input for this question. */
  children: React.ReactNode;
  /** Omitted on screen 1, which has nothing to go back to. */
  onBack?: () => void;
  skipLabel: string;
  onSkip: () => void;
  ctaLabel: string;
  onNext: () => void;
  busy?: boolean;
  /** One muted line above the footer. The only failure surface in the flow. */
  error?: string | null;
}) {
  return (
    <div
      className="flex flex-1 flex-col"
      style={{ paddingBottom: "calc(var(--pad-bottom) + 20px)" }}
    >
      <div className="flex h-10 shrink-0 items-center justify-between">
        <div className="flex items-center gap-3">
          {/* The slot is reserved on screen 1 rather than omitted: without it the
              progress hairlines jump 100px to the right on the first Next, which
              reads as the bar moving rather than the step advancing. */}
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            aria-hidden={onBack ? undefined : true}
            tabIndex={onBack ? undefined : -1}
            className={cn(
              "-ml-1 flex size-11 items-center justify-center text-ink-3",
              !onBack && "invisible",
            )}
          >
            ←
          </button>
          {/* Progress is five hairlines, not a bar with a percentage. The user
              is answering questions, not completing a task. */}
          <div className="flex gap-[5px]">
            {Array.from({ length: total }, (_, i) => (
              <span
                key={i}
                className={cn("h-px w-5", i < step ? "bg-ink" : "bg-rule")}
              />
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={onSkip}
          disabled={busy}
          className="py-2 pl-4 font-mono text-mono-sm tracking-nav text-ink-3 uppercase"
        >
          {skipLabel}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 pt-11">
        <Eyebrow>
          Question {step} of {total}
        </Eyebrow>
        <h2 className="m-0 mb-5.5 max-w-[280px] text-[28px] leading-[1.15] font-normal tracking-title text-pretty">
          {question}
        </h2>
        {children}
      </div>

      {error && <Meta className="shrink-0 pb-3 text-red">{error}</Meta>}

      <Button variant="filled" onClick={onNext} loading={busy} className="shrink-0">
        {ctaLabel}
      </Button>
    </div>
  );
}
