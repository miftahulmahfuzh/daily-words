"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Meta, Prose } from "@/components/ui/text";
import { RetryEnrichmentButton } from "@/components/vocab/retry-enrichment-button";
import { ExistingWordNotice } from "@/components/vocab/existing-word-notice";
import { enrichmentCopy, practiceLostNote } from "@/lib/vocab/display";
import { acceptCorrection, dismissCorrection } from "@/lib/vocab/client";
import type { AcceptCorrectionResponse, EnrichResponse } from "@/lib/vocab/schemas";
import { vocabDetailHref } from "@/lib/vocab/links";

/**
 * The two correction outcomes that end with a word other than this one.
 *
 * `merged` — the typo row is gone, so the card is replaced.
 * `kept_both` — [R1] refused the delete, so both rows exist and the notice sits
 * *above* the card rather than instead of it. Replacing the card there would
 * assert the word had disappeared, which is precisely the opposite of what
 * happened (F14 D2).
 */
type Resolved = {
  situation: "merged" | "kept_both";
  id: string;
  term: string;
  status: AcceptCorrectionResponse["status"];
  note: string | null;
};

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
  /* The `"new"` origin below is still a literal, and still true: this card has
     exactly one mount point, `AddWordForm` on `/vocab/new`. F14's detail-page
     suggestion is `CorrectionBanner`, a separate component with its own origin,
     rather than a second mount of this one — so the note F11 §7 left here still
     holds. Mount this anywhere else and the origin becomes a prop. */

  /** Set when accepting the correction landed on a word already in the collection. */
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const copy = entry.enrichmentStatus === "failed" ? enrichmentCopy(entry.enrichmentError) : null;

  async function accept() {
    setBusy(true);
    setNote(null);
    const result = await acceptCorrection(entry.id);
    setBusy(false);

    if (!result.ok) {
      setNote(result.message);
      return;
    }

    const { outcome, id, term, status, practiceLost } = result.data;

    // `kept_both` is a 200 now, not a 409 (F14 D2): nothing failed, [R1] simply
    // refuses to delete a word that has been carded, so both spellings stay and
    // the survivor's id comes back with the answer.
    if (outcome === "merged" || outcome === "kept_both") {
      setResolved({
        situation: outcome,
        id,
        term,
        status,
        // The transcript was about the misspelling, so the sentence names it.
        note: practiceLost ? practiceLostNote(entry.term) : null,
      });
      if (outcome === "kept_both") onChange({ ...entry, suggestedCorrection: null });
      return;
    }

    // `renamed` and `noop` both end with no suggestion outstanding. The
    // enrichment already describes the corrected word (D3), so nothing else
    // changes and no second model call happens.
    onChange({ ...entry, term, suggestedCorrection: null });
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

  // The typo row is gone, so the card that drew it goes with it.
  if (resolved?.situation === "merged") {
    return (
      <ExistingWordNotice
        id={resolved.id}
        term={resolved.term}
        status={resolved.status}
        situation="merged"
        origin="new"
        note={resolved.note}
      />
    );
  }

  return (
    <div className="dw-in flex flex-col gap-3">
      {/* Both rows survive, so this sits above the word rather than replacing
          it. The user's spelling is still here and still theirs. */}
      {resolved?.situation === "kept_both" && (
        <ExistingWordNotice
          id={resolved.id}
          term={resolved.term}
          status={resolved.status}
          situation="kept_both"
          origin="new"
          note={resolved.note}
        />
      )}

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
              <Button size="sm" fullWidth={false} href={vocabDetailHref(entry.id, "new")}>
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
