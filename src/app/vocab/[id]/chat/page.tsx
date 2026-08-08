import { notFound } from "next/navigation";
import { Screen, BackLink } from "@/components/screen";
import { lookupWord, CHAT_OPENER } from "@/lib/sample-data";

/**
 * The practice chat. The model speaks FIRST — the opener below is fired before
 * the user types anything, in role, with a scenario drawn from their profile.
 * It never defines the word; the user has already read the definition. See F6.
 */
export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const word = lookupWord(id);
  if (!word) notFound();

  return (
    <Screen>
      <header
        className="flex shrink-0 items-center justify-between border-b border-rule px-[var(--gutter)] pb-3"
        style={{ paddingTop: "var(--pad-top)" }}
      >
        <BackLink href={`/vocab/${id}`} label="Back" />
        <span className="flex items-baseline gap-2">
          <span className="font-mono text-[9px] tracking-[0.18em] text-ink-3 uppercase">
            Practising
          </span>
          <span className="text-[18px]">{word.term}</span>
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-[var(--gutter)] py-5">
        <div className="flex justify-start">
          <div className="max-w-[86%] rounded-[10px] rounded-bl-[2px] bg-card px-3.5 py-3">
            <span className="block pb-2 font-mono text-[9px] tracking-[0.18em] text-ink-3 uppercase">
              Scenario
            </span>
            <span className="text-[17px] leading-[1.4] text-ink text-pretty">
              {CHAT_OPENER.text}
            </span>
          </div>
        </div>
      </div>

      <div
        className="flex shrink-0 items-center gap-2.5 border-t border-rule bg-paper px-4 pt-3"
        style={{ paddingBottom: "var(--pad-bottom)" }}
      >
        <input
          type="text"
          placeholder="Use the word"
          className="h-11 flex-1 rounded-[var(--r-pill)] border border-rule bg-card px-4 text-ink outline-none placeholder:text-ink-3"
        />
        <button
          type="button"
          className="flex size-11 shrink-0 items-center justify-center rounded-full border border-ink bg-ink text-[15px] text-paper"
        >
          ↑
        </button>
      </div>
    </Screen>
  );
}
