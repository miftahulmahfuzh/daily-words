"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Meta, Prose } from "@/components/ui/text";
import { cn } from "@/lib/ui/cn";
import { setEntryStatus } from "@/lib/vocab/client";
import { existingWordCopy, type ExistingWordSituation } from "@/lib/vocab/display";
import { vocabDetailHref, type WordOrigin } from "@/lib/vocab/links";
import type { VocabStatus } from "@/lib/vocab/schemas";

/**
 * The one card that says "you already have this word".
 *
 * F14 D10. Four screens were inventing four sentences for one situation, and
 * two of them had already drifted — `add-word-form.tsx` said "You already have
 * genteel." while `enrichment-card.tsx` said "You already had genteel." for what
 * is, to the user, the same fact. The copy now lives in
 * `lib/vocab/display.ts` and every caller draws it through here.
 *
 * `origin` is a prop rather than the `"new"` literal the two old copies
 * hardcoded: this mounts on `/vocab/new`, in the Discover tab and on the detail
 * page, and F11's back link names where the user came from.
 */
export function ExistingWordNotice({
  id,
  term,
  status,
  situation,
  origin,
  note,
  typedTerm,
  onAddAnyway,
  addingAnyway = false,
  className,
}: {
  /** The row the user **already holds** — never the word they just typed. */
  id: string;
  term: string;
  status: VocabStatus;
  situation: ExistingWordSituation;
  origin: WordOrigin;
  /** A second line under the sentence. F14 D4's practice-lost note uses it. */
  note?: string | null;
  /** What the user typed. Only needed when `onAddAnyway` is given. */
  typedTerm?: string;
  /** Present only on the near-duplicate path: the warning never blocks (D5). */
  onAddAnyway?: () => void;
  addingAnyway?: boolean;
  className?: string;
}) {
  /**
   * D8's un-master, held here so the sentence changes with the button that
   * caused it. Follows `MasteredToggle`: the prop is the server's truth, so a
   * fresh one supersedes whatever this component last wrote.
   */
  const [live, setLive] = useState<VocabStatus>(status);
  const [synced, setSynced] = useState<VocabStatus>(status);
  if (status !== synced) {
    setSynced(status);
    setLive(status);
  }

  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  /**
   * D8. F3 §8.3 refused this: "F3 does **not** offer a 'make it active again'
   * button here — that writes `vocab_entries.status`, which is F4's column, and
   * a silent status change on an add is surprising."
   *
   * The objection was to *silence*, and it is honoured — this is a labelled tap
   * that says what it will do, through the same `PATCH /api/vocab/[id]` the
   * detail page uses. What is removed is the dead end: adding a word you have
   * mastered is a request to see it again, and it should not cost a navigation
   * to find that out.
   */
  async function restore() {
    if (busy) return;
    setBusy(true);
    setProblem(null);

    const result = await setEntryStatus(id, "active");
    setBusy(false);

    if (!result.ok) {
      setProblem(result.message);
      return;
    }
    setLive("active");
  }

  return (
    <Card
      variant="outline"
      padding="sm"
      className={cn("dw-in flex shrink-0 flex-col items-start gap-3", className)}
    >
      <Prose size="body" tone="ink">
        {existingWordCopy({ situation, term, status: live })}
      </Prose>

      {note && <Meta>{note}</Meta>}

      {/* Stacked and full width, never side by side. `enrichment-card.tsx`
          records the bug: at 375px a half-width button clips a label carrying a
          term rather than ellipsising it, because `truncate` on a flex
          container does nothing. The inner span handles the pathological term. */}
      <div className="flex w-full flex-col gap-2.5">
        <Button size="sm" href={vocabDetailHref(id, origin)}>
          Open it
        </Button>

        {live === "mastered" && (
          <Button size="sm" disabled={busy} onClick={() => void restore()}>
            Put it back in rotation
          </Button>
        )}

        {onAddAnyway && (
          <Button size="sm" loading={addingAnyway} onClick={onAddAnyway}>
            <span className="min-w-0 truncate">Add {typedTerm} anyway</span>
          </Button>
        )}
      </div>

      {problem && <Meta className="text-red">{problem}</Meta>}
    </Card>
  );
}
