import Link from "next/link";
import { Screen } from "@/components/screen";

const RECENT = ["truculent", "obviate", "sanguine"];

export default function AddWordPage() {
  return (
    <Screen>
      <div
        className="flex flex-1 flex-col px-6"
        style={{ paddingTop: "var(--pad-top)" }}
      >
        <div className="flex h-11 items-center justify-between">
          <span className="font-mono text-[10px] tracking-[0.2em] text-ink-3 uppercase">
            Add a word
          </span>
          <Link
            href="/vocab"
            className="py-2 pl-4 font-mono text-[11px] tracking-[0.14em] text-ink-3 uppercase"
          >
            Close
          </Link>
        </div>

        <div className="flex flex-col gap-2.5 pt-6">
          <div className="border-b border-ink pb-3">
            {/* autoCorrect and spellCheck are off deliberately: iOS silently
                repairs "genteell" before the app ever sees it, which would make
                the typo-correction feature impossible to trigger. */}
            <input
              type="text"
              placeholder="word"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className="w-full bg-transparent text-[30px] tracking-[-0.01em] text-ink outline-none placeholder:text-ink-3"
            />
          </div>
          <span className="font-mono text-[10px] tracking-[0.06em] text-ink-3">
            Pronunciation and meaning are fetched for you.
          </span>
        </div>

        <button
          type="button"
          className="mt-[22px] h-[52px] w-full rounded-[var(--r-field)] border border-ink bg-ink font-mono text-[12px] tracking-[0.16em] text-paper uppercase"
        >
          Add
        </button>

        <div className="flex flex-col gap-2.5 pt-6">
          <span className="font-mono text-[9px] tracking-[0.2em] text-ink-3 uppercase">
            Just added
          </span>
          <div className="flex flex-wrap gap-2">
            {RECENT.map((word) => (
              <Link
                key={word}
                href={`/vocab/${word}`}
                className="rounded-[var(--r-pill)] border border-rule px-3 py-1.5 text-[15px] text-ink-2"
              >
                {word}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </Screen>
  );
}
