import Link from "next/link";
import { WORDS } from "@/lib/sample-data";

/**
 * The card. Six words, at most two lines each, and it never scrolls.
 *
 * The no-scroll guarantee is structural rather than arithmetic (ROADMAP [R19]):
 * the card takes the space left after the header, day strip and tab bar, and the
 * six rows divide it — `flex-1` with `min-h-0` so they compress rather than
 * overflow. Both text lines are clamped to exactly one line, so no term, no
 * definition and no font substitution can change a row's height.
 */
export function DailyCard({ words }: { words: string[] }) {
  return (
    <div className="dw-in flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--r-card)] border border-rule bg-card px-4 py-1">
      {words.map((id, i) => {
        const word = WORDS[id];
        if (!word) return null;
        return (
          <Link
            key={id}
            href={`/vocab/${id}`}
            className={`flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-[3px] px-0.5 py-[11px] ${
              i === words.length - 1 ? "" : "border-b border-rule-2"
            }`}
          >
            <span className="flex min-w-0 items-baseline gap-[9px]">
              <span className="truncate text-[22px] leading-[1.15] tracking-[-0.005em] text-ink">
                {word.term}
              </span>
              <span className="shrink-0 font-mono text-[9px] tracking-[0.1em] text-ink-3 uppercase">
                {word.tag}
              </span>
            </span>
            <span className="truncate text-[15px] leading-[1.3] text-ink-2">
              {word.definition}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/** Shown when the day's card has not been pressed into being yet. */
export function NoCardYet() {
  return (
    <div className="dw-fade flex min-h-0 flex-1 flex-col items-center justify-center gap-[22px] rounded-[var(--r-card)] border border-dashed border-rule p-7 text-center">
      <p className="m-0 max-w-[230px] text-[18px] leading-[1.45] text-ink-2 text-pretty">
        No card yet. Six words are waiting to be written out.
      </p>
      <button
        type="button"
        className="h-[50px] min-w-[200px] rounded-[var(--r-field)] border border-ink bg-ink px-[26px] font-mono text-[12px] tracking-[0.16em] text-paper uppercase"
      >
        Make today’s card
      </button>
      <span className="font-mono text-[10px] tracking-[0.06em] text-ink-3">
        Nothing is generated until you press it.
      </span>
    </div>
  );
}
