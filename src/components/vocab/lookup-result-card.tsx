"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Meta, Prose } from "@/components/ui/text";

/** The resolved half of `LookupVocabResponse`, without the opaque token. */
export type LookupResult = {
  term: string;
  language: string;
  fit: "exact" | "loose";
  partOfSpeech: string;
  pronunciation: string;
  definition: string;
  examples: string[];
};

/**
 * What the model made of a foreign word, before anything is written.
 *
 * Drawn in `EnrichmentCard`'s visual language on purpose — same 26px term, same
 * mono IPA, same italic part of speech — because it is the same object at a
 * different moment, and a second dialect for "here is your word" would make the
 * two screens feel like two apps. What it is *not* is a second mount of that
 * component: this one has no row, no id, no correction to accept and no retry.
 * Every branch in `EnrichmentCard` is about a row that exists.
 *
 * **The origin is drawn above the word, not below it.** The user typed
 * `melumuri` and is being handed `smear`; leading with the English word alone
 * reads as the app having ignored them. The line they typed comes first, and the
 * answer follows from it.
 *
 * There are no section headings — typography carries the structure, per [R18].
 */
export function LookupResultCard({
  result,
  originTerm,
  saving,
  onAdd,
  onCancel,
}: {
  result: LookupResult;
  originTerm: string;
  saving: boolean;
  onAdd: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="dw-in flex flex-col gap-3">
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-lg tracking-title text-ink-2">{originTerm}</span>
          <Meta>{result.language}</Meta>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="text-[26px] tracking-title">{result.term}</span>
          {/* IPA is always mono: Source Serif 4's latin subset does not cover
              the IPA Extensions block and the silent fallback shows as a
              mismatched line. Same rule as EnrichmentCard and /vocab/[id]. */}
          {result.pronunciation && (
            <span className="font-mono text-mono-sm text-ink-3">
              {result.pronunciation}
            </span>
          )}
          {result.partOfSpeech && (
            <span className="text-sm italic text-ink-3">{result.partOfSpeech}</span>
          )}
        </div>

        {result.definition && <Prose size="body">{result.definition}</Prose>}

        {/**
         * The honest half of the answer, and the reason `fit` is a field on the
         * response rather than something guessed here from the word count.
         * "communal work" is two words and exact-ish; "cosy" is one word and
         * loses most of what `gezellig` means. Only the model knows which.
         */}
        {result.fit === "loose" && (
          <Prose size="sm" tone="muted">
            No exact English word for this. The closest is above — some of the
            meaning does not carry over.
          </Prose>
        )}

        {result.examples.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {result.examples.map((example) => (
              <li key={example}>
                <Prose size="sm" tone="ink">
                  {example}
                </Prose>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/**
       * Stacked, not side by side — `EnrichmentCard`'s measured reason: at 375px
       * a half-width button clips its label rather than ellipsising it, because
       * `truncate` on a flex container does nothing.
       */}
      <div className="flex flex-col gap-2.5">
        <Button variant="filled" loading={saving} onClick={onAdd}>
          {saving ? "Saving…" : `Add ${result.term}`}
        </Button>
        <Button disabled={saving} onClick={onCancel}>
          Not that word
        </Button>
      </div>
    </div>
  );
}
