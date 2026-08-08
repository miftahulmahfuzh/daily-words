import Link from "next/link";
import { notFound } from "next/navigation";
import { Screen, BackLink } from "@/components/screen";
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
      <div
        className="flex-1 overflow-y-auto px-6 pb-7"
        style={{ paddingTop: "var(--pad-top)" }}
      >
        <BackLink href="/vocab" label="Collection" />

        <h1 className="m-0 pt-2 text-[38px] leading-none font-normal tracking-[-0.02em]">
          {word.term}
        </h1>

        <div className="flex items-baseline gap-3 pt-3 pb-4.5">
          {word.ipa && (
            <span className="font-mono text-[13px] text-ink-2">{word.ipa}</span>
          )}
          {word.pos && (
            <span className="text-[15px] italic text-ink-3">{word.pos}</span>
          )}
        </div>

        <div className="h-px bg-rule" />

        <p className="m-0 py-4.5 pb-6.5 text-[21px] leading-[1.35] tracking-[-0.005em] text-pretty">
          {word.definition}
        </p>

        {word.examples.length > 0 && (
          <>
            <span className="font-mono text-[10px] tracking-[0.2em] text-ink-3 uppercase">
              Usage
            </span>
            <div className="flex flex-col gap-3.5 pt-3 pb-7">
              {word.examples.map((example, i) => (
                <p
                  key={i}
                  className="m-0 border-l border-rule pl-3.5 text-[16px] leading-[1.45] text-ink-2 text-pretty"
                >
                  {example}
                </p>
              ))}
            </div>
          </>
        )}

        <Link
          href={`/vocab/${id}/chat`}
          className="flex h-[52px] w-full items-center justify-center rounded-[var(--r-field)] border border-ink bg-ink font-mono text-[12px] tracking-[0.16em] text-paper uppercase"
        >
          Practise this word
        </Link>

        <button
          type="button"
          className="mt-4 flex min-h-[56px] w-full items-center justify-between gap-4 border-t border-rule-2 pt-4.5 text-left"
        >
          <span className="flex flex-col gap-[3px]">
            <span className="text-[17px] text-ink">Mastered</span>
            <span className="font-mono text-[10px] tracking-[0.06em] text-ink-3">
              Stop putting it on cards
            </span>
          </span>
          <span
            className={`flex h-[30px] w-[50px] shrink-0 items-center rounded-[var(--r-pill)] p-[3px] ${
              word.mastered ? "justify-end bg-accent" : "justify-start bg-rule"
            }`}
          >
            <span className="block size-6 rounded-full bg-card" />
          </span>
        </button>
      </div>
    </Screen>
  );
}
