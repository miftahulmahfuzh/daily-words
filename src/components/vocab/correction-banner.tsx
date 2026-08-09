"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Meta, Prose } from "@/components/ui/text";
import { ExistingWordNotice } from "@/components/vocab/existing-word-notice";
import { acceptCorrection, dismissCorrection } from "@/lib/vocab/client";
import { practiceLostNote } from "@/lib/vocab/display";
import type { AcceptCorrectionResponse } from "@/lib/vocab/schemas";
import type { WordOrigin } from "@/lib/vocab/links";

/**
 * "Did you mean genteel?" — on the detail page, which is F14 D1 and the point of
 * the plan.
 *
 * F3 §5 already said the suggestion "arrives asynchronously … and must survive
 * an app close, a reload, and a navigation to the detail page". The column was
 * built for exactly that; only the last clause was never rendered, and three
 * ordinary things strand a suggestion permanently: the enrichment reply arriving
 * after "Add another" was tapped (`add-word-form.tsx` discards it by ticket),
 * closing the tab while "finding it…" is up, and reloading `/vocab/new`.
 *
 * A stranded row is the expensive part. `selectCardCandidates` filters on
 * `status = 'active'` and nothing else, so `genteell` — `enrichment_status =
 * 'ready'`, carrying *genteel's* definition — is fully eligible for tomorrow's
 * card. Once carded, `daily_card_items.vocab_entry_id` is `ON DELETE RESTRICT`
 * ([R1]), so the typo can never be deleted and never be merged. A suggestion
 * nobody was shown becomes a permanent misspelling with a correct word's
 * definition attached.
 *
 * This is a separate component from `EnrichmentCard` rather than a second mount
 * of it: that card draws the whole word, which the detail page already does, and
 * its `"new"` origin is a literal that is true only there.
 */

type Resolved = {
  situation: "merged" | "kept_both";
  id: string;
  term: string;
  status: AcceptCorrectionResponse["status"];
  note: string | null;
};

export function CorrectionBanner({
  id,
  term,
  suggestion,
  origin,
}: {
  id: string;
  /** The spelling as stored — the misspelling. Named on the "No" button. */
  term: string;
  suggestion: string;
  /** Carried through to the notice's "Open it", so back still names the origin. */
  origin: WordOrigin | null;
}) {
  const router = useRouter();
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function accept() {
    if (busy) return;
    setBusy(true);
    setProblem(null);

    const result = await acceptCorrection(id);
    setBusy(false);

    if (!result.ok) {
      setProblem(result.message);
      return;
    }

    const outcome = result.data;

    /**
     * `merged` and `kept_both` both end on a word other than this page's, and
     * neither may call `router.refresh()`.
     *
     * For `merged` the row this page is rendering has been deleted, so a
     * refresh is a `notFound()` — the user would get the 404 screen instead of
     * the sentence explaining what happened, and would lose the link to the
     * word that survived. For `kept_both` nothing on the page changed (same
     * term, same definition) but the suggestion is cleared server-side, so a
     * refresh would unmount this component and the outcome would go unexplained.
     * Both stay put and hand the user a link.
     */
    if (outcome.outcome === "merged" || outcome.outcome === "kept_both") {
      setResolved({
        situation: outcome.outcome,
        id: outcome.id,
        term: outcome.term,
        status: outcome.status,
        // The transcript belonged to the misspelling, so the sentence names it.
        note: outcome.practiceLost ? practiceLostNote(term) : null,
      });
      return;
    }

    // `renamed` changes the heading and `noop` changes nothing. The server
    // render is the truth for both, and this component unmounts with the
    // suggestion it drew.
    router.refresh();
  }

  async function dismiss() {
    if (busy) return;
    setBusy(true);
    setProblem(null);

    const result = await dismissCorrection(id);
    setBusy(false);

    if (!result.ok) {
      setProblem(result.message);
      return;
    }

    // The definition, IPA, part of speech and examples went with the suggestion
    // — they described the *corrected* word — so the page redraws in the honest
    // state: the word is kept and the app has nothing true to say about it.
    router.refresh();
  }

  if (resolved) {
    return (
      <ExistingWordNotice
        className="mt-4"
        id={resolved.id}
        term={resolved.term}
        status={resolved.status}
        situation={resolved.situation}
        origin={origin ?? "collection"}
        note={resolved.note}
      />
    );
  }

  return (
    <Card variant="outline" padding="sm" className="dw-in mt-4 flex flex-col gap-3">
      <Prose size="body" tone="ink">
        Did you mean {suggestion}?
      </Prose>

      {/* Stacked, not side by side — `enrichment-card.tsx` records the reason:
          at 375px "No, keep genteell" clips in a half-width button rather than
          ellipsising, because `truncate` on a flex container does nothing. */}
      <div className="flex flex-col gap-2.5">
        <Button
          variant="filled"
          size="sm"
          className="text-mono-sm tracking-nav"
          disabled={busy}
          onClick={() => void accept()}
        >
          Yes
        </Button>
        <Button
          size="sm"
          className="text-mono-sm tracking-nav"
          disabled={busy}
          onClick={() => void dismiss()}
        >
          <span className="min-w-0 truncate">No, keep {term}</span>
        </Button>
      </div>

      {problem && <Meta className="text-red">{problem}</Meta>}
    </Card>
  );
}
