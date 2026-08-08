"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Meta, Prose } from "@/components/ui/text";
import { RetryEnrichmentButton } from "@/components/vocab/retry-enrichment-button";
import { acceptCorrection, dismissCorrection } from "@/lib/vocab/client";
import { enrichmentCopy } from "@/lib/vocab/display";
import type { EnrichResponse } from "@/lib/vocab/schemas";
import { vocabDetailHref } from "@/lib/vocab/links";

/**
 * One entry, in whatever state it is in.
 *
 * The term is drawn the instant the save returns and never moves again —
 * everything under it fills in. That is the whole perceived-latency argument for
 * F3's two-request design: the user sees their word land in well under half a
 * second, and the dictionary arrives a beat later around it.
 *
 * There are no section headings. Typography carries the structure, per [R18].
 */
export function EnrichmentCard({
  entry,
  onChange,
}: {
  entry: EnrichResponse;
  onChange: (entry: EnrichResponse) => void;
}) {
  /** Set when accepting the correction found the word already in the collection. */
  const [merged, setMerged] = useState<{ id: string; term: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const copy = entry.enrichmentStatus === "failed" ? enrichmentCopy(entry.enrichmentError) : null;

  async function accept() {
    setBusy(true);
    setNote(null);
    const result = await acceptCorrection(entry.id);
    setBusy(false);

    if (!result.ok) {
      // [R1] refuses to delete a word that has been carded, so the merge is
      // declined and both spellings stay. Nothing is lost; say so in one line.
      if (result.code === "in_use") {
        setNote(result.message);
        onChange({ ...entry, suggestedCorrection: null });
        return;
      }
      setNote(result.message);
      return;
    }

    if (result.data.outcome === "merged") {
      setMerged({ id: result.data.id, term: result.data.term });
      return;
    }

    // `renamed` and `noop` both end with no suggestion outstanding. The
    // enrichment already describes the corrected word (D3), so nothing else
    // changes and no second model call happens.
    onChange({ ...entry, term: result.data.term, suggestedCorrection: null });
  }

  async function dismiss() {
    setBusy(true);
    setNote(null);
    const result = await dismissCorrection(entry.id);
    setBusy(false);

    if (!result.ok) {
      setNote(result.message);
      return;
    }

    onChange({
      ...entry,
      suggestedCorrection: null,
      enrichmentStatus: result.data.enrichmentStatus,
      enrichmentError: result.data.enrichmentError,
      partOfSpeech: null,
      pronunciation: null,
      definition: null,
      examples: [],
    });
  }

  if (merged) {
    return (
      <Card variant="outline" className="dw-in flex flex-col items-start gap-3.5">
        <Prose size="body" tone="ink">
          You already had {merged.term}.
        </Prose>
        <Button size="sm" fullWidth={false} href={vocabDetailHref(merged.id)}>
          Open it
        </Button>
      </Card>
    );
  }

  return (
    <div className="dw-in flex flex-col gap-3">
      {entry.suggestedCorrection && (
        <Card variant="outline" padding="sm" className="flex flex-col gap-3">
          <Prose size="body" tone="ink">
            Did you mean {entry.suggestedCorrection}?
          </Prose>
          {/* Stacked, not side by side. "No, keep genteell" carries the term so
              the user can see which spelling they are choosing, and at 375px a
              half-width button clips that label rather than ellipsising it —
              `truncate` on a flex container does nothing, so the text simply
              lost both its ends. Full width fits it, and the inner span
              ellipsises the pathological long term. */}
          <div className="flex flex-col gap-2.5">
            <Button
              variant="filled"
              size="sm"
              className="text-mono-sm tracking-nav"
              disabled={busy}
              onClick={accept}
            >
              Yes
            </Button>
            <Button
              size="sm"
              className="text-mono-sm tracking-nav"
              disabled={busy}
              onClick={dismiss}
            >
              <span className="min-w-0 truncate">No, keep {entry.term}</span>
            </Button>
          </div>
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="text-[26px] tracking-title">{entry.term}</span>
          {/* IPA is always mono: Source Serif 4's latin subset does not cover the
              IPA Extensions block and the silent fallback shows as a mismatched
              line. Same rule as /vocab/[id] and the Discover card. */}
          {entry.pronunciation && (
            <span className="font-mono text-mono-sm text-ink-3">
              {entry.pronunciation}
            </span>
          )}
          {entry.partOfSpeech && (
            <span className="text-sm italic text-ink-3">{entry.partOfSpeech}</span>
          )}
        </div>

        {entry.enrichmentStatus === "pending" && (
          <span className="flex items-center gap-2 text-ink-3">
            <Spinner size={16} />
            <Meta>finding it…</Meta>
          </span>
        )}

        {entry.enrichmentStatus === "ready" && entry.definition && (
          <Prose size="body">{entry.definition}</Prose>
        )}

        {/* Not rendered at all when the array is empty — a "Usage" heading over
            nothing is worse than the absence. */}
        {entry.examples.length > 0 && (
          <div className="flex flex-col gap-3 pt-1">
            {entry.examples.map((example, i) => (
              <Prose key={i} size="body" className="border-l border-rule pl-3.5">
                {example}
              </Prose>
            ))}
          </div>
        )}

        {copy && (
          <div className="flex flex-col items-start gap-3">
            <Prose size="body">{copy.message}</Prose>
            {copy.retry ? (
              <RetryEnrichmentButton
                entryId={entry.id}
                label="Try again"
                onDone={onChange}
              />
            ) : (
              <Button size="sm" fullWidth={false} href={vocabDetailHref(entry.id)}>
                Open it
              </Button>
            )}
          </div>
        )}

        {note && <Meta className="text-red">{note}</Meta>}
      </Card>
    </div>
  );
}
