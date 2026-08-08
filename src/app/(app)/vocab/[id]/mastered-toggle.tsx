"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Meta } from "@/components/ui/text";
import { ToggleRow } from "@/components/ui/toggle-row";
import { setEntryStatus } from "@/lib/vocab/client";

/**
 * Retiring a word from the daily card.
 *
 * Two taps, in place — the roadmap's answer to "confirm a consequential action"
 * without a modal. Mastering a word removes it from every future card, and
 * [R1] means it is also the only way to retire a word that has already appeared
 * on one, so the tap that does it should not be the same tap that scrolls past.
 * Un-mastering is one tap: putting a word back in the pool loses nothing.
 *
 * Optimistic, and self-reverting. The switch moves before the request, because
 * a control that waits 300ms to acknowledge a tap reads as broken; if the write
 * fails it moves back and says so, rather than leaving the UI asserting
 * something the database does not hold.
 */
export function MasteredToggle({ id, initial }: { id: string; initial: boolean }) {
  const router = useRouter();
  const [mastered, setMastered] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  /** Follow the server whenever it re-renders — `router.refresh()`, or a back. */
  const [synced, setSynced] = useState(initial);
  if (initial !== synced) {
    setSynced(initial);
    setMastered(initial);
  }

  async function change(next: boolean) {
    // ToggleRow has no disabled state, so the guard lives here: a double tap
    // during the round trip must not fire a second write.
    if (busy) return;

    setMastered(next);
    setBusy(true);
    setProblem(null);

    const result = await setEntryStatus(id, next ? "mastered" : "active");
    setBusy(false);

    if (!result.ok) {
      setMastered(!next);
      setProblem(result.message);
      return;
    }

    // The status changes what the list draws and whether F5 may select the
    // word. Refresh rather than patch: the server render is the truth.
    router.refresh();
  }

  return (
    <>
      <ToggleRow
        className="mt-4"
        label="Mastered"
        hint="Stop putting it on cards"
        checked={mastered}
        onChange={(next) => void change(next)}
      />
      {problem && <Meta className="pt-2 text-red">{problem}</Meta>}
    </>
  );
}
