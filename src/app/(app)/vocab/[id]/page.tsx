import { notFound } from "next/navigation";
import { Screen, ScreenBody } from "@/components/layout/screen";
import { BackLink } from "@/components/layout/back-link";
import { Button } from "@/components/ui/button";
import { Eyebrow, Prose } from "@/components/ui/text";
import { MasteredToggle } from "./mastered-toggle";
import { lookupWord } from "@/lib/sample-data";

/* A real route, not a modal. On iOS Safari a full-page modal loses the
   edge-swipe back gesture, needs hand-rolled scroll locking, and breaks the
   height budget when the URL bar collapses. See the roadmap's Locked Decisions. */
export default async function WordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const word = lookupWord(id);
  if (!word) notFound();

  return (
    <Screen>
      <ScreenBody scroll padded={false} className="px-6 pb-7">
        <BackLink href="/vocab" label="Collection" />

        <h1 className="m-0 pt-2 text-[38px] leading-none font-normal tracking-display">
          {word.term}
        </h1>

        <div className="flex items-baseline gap-3 pt-3 pb-4.5">
          {/* IPA in mono, always: Source Serif 4's latin subset does not
              guarantee the IPA Extensions block and the fallback is visible. */}
          {word.ipa && (
            <span className="font-mono text-mono-lg text-ink-2">{word.ipa}</span>
          )}
          {word.pos && (
            <span className="text-sm italic text-ink-3">{word.pos}</span>
          )}
        </div>

        <div className="h-px bg-rule" />

        <p className="m-0 py-4.5 pb-6.5 text-[21px] leading-[1.35] tracking-tight text-pretty">
          {word.definition}
        </p>

        {word.examples.length > 0 && (
          <>
            <Eyebrow>Usage</Eyebrow>
            <div className="flex flex-col gap-3.5 pt-3 pb-7">
              {word.examples.map((example, i) => (
                <Prose key={i} size="body" className="border-l border-rule pl-3.5">
                  {example}
                </Prose>
              ))}
            </div>
          </>
        )}

        <Button variant="filled" href={`/vocab/${id}/chat`}>
          Practise this word
        </Button>

        <MasteredToggle initial={word.mastered ?? false} />
      </ScreenBody>
    </Screen>
  );
}
