import Link from "next/link";
import { Screen } from "@/components/screen";
import { JOURNAL } from "@/lib/sample-data";

/* The composer is a permanent textarea at the top — not behind a button, sheet
   or FAB. This screen is the one place the app-shell "+" is suppressed. [R3] */
export default function JournalPage() {
  return (
    <Screen tabs>
      <div
        className="shrink-0 px-[var(--gutter)]"
        style={{ paddingTop: "var(--pad-top)" }}
      >
        <h1 className="m-0 mb-3.5 text-[27px] font-normal tracking-[-0.01em]">
          Journal
        </h1>
        <div className="flex items-center gap-2.5 rounded-[var(--r-field)] border border-rule bg-card px-3.5">
          <input
            type="text"
            placeholder="Paste a line worth keeping"
            className="h-[46px] min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3"
          />
          <button
            type="button"
            className="font-mono text-[10px] tracking-[0.14em] text-accent uppercase"
          >
            Save
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-[var(--gutter)] pt-4.5 pb-3">
        {JOURNAL.map((entry) => (
          <Link
            key={entry.id}
            href={`/journal/${entry.id}`}
            className="flex w-full flex-col gap-[7px] border-b border-rule-2 py-4 text-left"
          >
            {/* Clamped to three lines so a pasted paragraph occupies the same
                space as a proverb and the list stays scannable. */}
            <span className="line-clamp-3 text-[18px] leading-[1.35] tracking-[-0.005em] text-ink text-pretty">
              {entry.text}
            </span>
            <span className="flex items-baseline gap-2 font-mono text-[10px] tracking-[0.08em] text-ink-3">
              <span>{entry.source}</span>
              <span>·</span>
              <span>{entry.date}</span>
            </span>
          </Link>
        ))}
      </div>
    </Screen>
  );
}
