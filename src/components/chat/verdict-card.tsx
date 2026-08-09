import { Eyebrow } from "@/components/ui/text";

/**
 * The three closing lines, drawn as a ruled block rather than a chat bubble.
 *
 * A bubble would say the scene is still running and that this is one more thing
 * the other person said. It is not: the model stepped out of role to write it,
 * and the visual break is what tells the user to read once and stop. Same
 * treatment F10 gives its journal insight — an accent rule down the left,
 * nothing else.
 *
 * Lines are stored newline-separated. Two or one is fine; the model is asked
 * for three and the fallback text is one.
 */
export function VerdictCard({ content }: { content: string }) {
  const lines = content.split("\n").filter((line) => line.trim().length > 0);

  return (
    <section className="border-l-2 border-accent pl-4">
      <Eyebrow tone="accent" className="block pb-2">
        How it went
      </Eyebrow>
      <div className="flex flex-col gap-2.5">
        {lines.map((line, i) => (
          <p key={i} className="m-0 text-base text-ink text-pretty">
            {line}
          </p>
        ))}
      </div>
    </section>
  );
}
