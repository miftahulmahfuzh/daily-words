import { notFound } from "next/navigation";
import { Screen, ScreenBody } from "@/components/layout/screen";
import { BackLink } from "@/components/layout/back-link";
import { Button } from "@/components/ui/button";
import { Eyebrow, Meta, Prose } from "@/components/ui/text";
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
      <ScreenBody scroll padded={false} className="px-6 pb-7">
        <BackLink href="/journal" label="Journal" />

        <p className="m-0 pt-3 text-2xl leading-[1.25] tracking-[-0.015em] text-pretty">
          {entry.text}
        </p>

        <div className="flex items-baseline gap-2 py-4.5 pb-5.5">
          <Eyebrow className="tracking-[0.1em]">
            {entry.source} · {entry.date}
          </Eyebrow>
        </div>

        <div className="h-px bg-rule" />

        {/* Insight is opt-in per entry, never automatic on save — a line worth
            keeping should not cost a model call to keep. */}
        {entry.insight ? (
          <div className="dw-in mt-5.5 flex flex-col gap-2 border-l-2 border-accent pl-3.5">
            <Eyebrow size="sm" tone="accent">
              Insight
            </Eyebrow>
            <Prose size="body" className="leading-[1.5]">
              {entry.insight.meaning}
            </Prose>
            <div className="flex flex-col gap-1.5 pt-1">
              {entry.insight.whenItApplies.map((line, i) => (
                <Prose key={i} size="sm" tone="faint" className="leading-[1.45]">
                  {line}
                </Prose>
              ))}
            </div>
            <Meta className="pt-1 tracking-[0.08em]">
              Written by the machine. Keep or discard.
            </Meta>
          </div>
        ) : (
          <Button className="mt-5.5 h-[50px] text-ink">Ask for an insight</Button>
        )}
      </ScreenBody>
    </Screen>
  );
}
