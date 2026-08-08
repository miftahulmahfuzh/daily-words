import { notFound } from "next/navigation";
import { Screen, BackLink } from "@/components/screen";
import { JOURNAL } from "@/lib/sample-data";

export default async function JournalEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const entry = JOURNAL.find((j) => j.id === id);
  if (!entry) notFound();

  return (
    <Screen>
      <div
        className="flex-1 overflow-y-auto px-6 pb-7"
        style={{ paddingTop: "var(--pad-top)" }}
      >
        <BackLink href="/journal" label="Journal" />

        <p className="m-0 pt-3 text-[27px] leading-[1.25] tracking-[-0.015em] text-pretty">
          {entry.text}
        </p>

        <div className="flex items-baseline gap-2 py-4.5 pb-5.5 font-mono text-[10px] tracking-[0.1em] text-ink-3 uppercase">
          <span>{entry.source}</span>
          <span>·</span>
          <span>{entry.date}</span>
        </div>

        <div className="h-px bg-rule" />

        {/* Insight is opt-in per entry, never automatic on save — a line worth
            keeping should not cost a model call to keep. */}
        {entry.insight ? (
          <div className="dw-in mt-5.5 flex flex-col gap-2 border-l-2 border-accent pl-3.5">
            <span className="font-mono text-[9px] tracking-[0.2em] text-accent uppercase">
              Insight
            </span>
            <p className="m-0 text-[16px] leading-[1.5] text-ink-2 text-pretty">
              {entry.insight.meaning}
            </p>
            <div className="flex flex-col gap-1.5 pt-1">
              {entry.insight.whenItApplies.map((line, i) => (
                <p
                  key={i}
                  className="m-0 text-[15px] leading-[1.45] text-ink-3 text-pretty"
                >
                  {line}
                </p>
              ))}
            </div>
            <span className="pt-1 font-mono text-[9px] tracking-[0.08em] text-ink-3">
              Written by the machine. Keep or discard.
            </span>
          </div>
        ) : (
          <button
            type="button"
            className="mt-5.5 h-[50px] w-full rounded-[var(--r-field)] border border-rule font-mono text-[12px] tracking-[0.16em] text-ink uppercase"
          >
            Ask for an insight
          </button>
        )}
      </div>
    </Screen>
  );
}
