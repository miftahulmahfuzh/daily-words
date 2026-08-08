"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Meta } from "@/components/ui/text";
import { cn } from "@/lib/ui/cn";
import { deleteEntry } from "@/lib/vocab/client";
import { vocabListHref } from "@/lib/vocab/links";

/**
 * The typo-recovery path, and the only destructive action in the app.
 *
 * [R1]: a word that has never been carded is hard-deleted, tombstones and all
 * removed from the design. A word that *has* been carded cannot be deleted at
 * all — the detail page draws a sentence instead of this button, so reaching
 * the 409 branch below means the word was carded between the page render and
 * the tap. The server's message is shown verbatim; it is the same sentence.
 *
 * Two taps, armed and self-disarming after four seconds, matching `ToggleRow`.
 * There is no confirm dialog anywhere in this app: a full-screen overlay on iOS
 * Safari costs the edge-swipe back gesture and needs hand-rolled scroll
 * locking, and the design contains no modal.
 *
 * Text, never an icon-only control. ROADMAP [R18] removed the icon set, and an
 * unlabelled destroy button is exactly the ambiguity Product Principle 1
 * rejects.
 */
export function DeleteWordButton({ id, term }: { id: string; term: string }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!armed) return;
    // A control left armed because the user's thumb moved on is a trap for the
    // next tap.
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  async function handleTap() {
    if (busy) return;
    if (!armed) {
      setArmed(true);
      return;
    }

    setArmed(false);
    setBusy(true);
    setProblem(null);

    const result = await deleteEntry(id);

    if (!result.ok) {
      setBusy(false);
      // 404 means somebody else already removed it — the user's intent is
      // satisfied either way, so treat it as success and leave.
      if (result.code === "not_found") {
        router.replace(vocabListHref());
        return;
      }
      setProblem(result.message);
      return;
    }

    // `replace`, not `push`: the back button must not return to a detail page
    // whose entry no longer exists.
    router.replace(vocabListHref());
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-2 pt-5">
      <button
        type="button"
        onClick={() => void handleTap()}
        disabled={busy}
        className={cn(
          "flex min-h-[44px] items-center font-mono text-mono-sm tracking-nav uppercase",
          armed ? "text-red" : "text-ink-3",
          busy && "opacity-60",
        )}
      >
        {armed ? `Tap again to delete ${term}` : "Delete this word"}
      </button>
      {problem && <Meta className="text-red">{problem}</Meta>}
    </div>
  );
}
