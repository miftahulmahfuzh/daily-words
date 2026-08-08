"use client";

import { useState } from "react";
import { ToggleRow } from "@/components/ui/toggle-row";

/**
 * Retiring a word from the daily card.
 *
 * Two taps, in place — the roadmap's answer to "confirm a destructive action"
 * without a modal. Mastering a word removes it from every future card, and
 * [R1] means it is also the only way to retire a word that has already appeared
 * on one, so the tap that does it should not be the same tap that scrolls past.
 *
 * F4 replaces the local state with the server action that writes
 * `status` and `mastered_at`.
 */
export function MasteredToggle({ initial }: { initial: boolean }) {
  const [mastered, setMastered] = useState(initial);

  return (
    <ToggleRow
      className="mt-4"
      label="Mastered"
      hint="Stop putting it on cards"
      checked={mastered}
      onChange={setMastered}
    />
  );
}
