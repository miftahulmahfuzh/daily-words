"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Meta } from "@/components/ui/text";
import { createCard, detectTimezone } from "@/lib/cards/client";

/**
 * The press that brings the card into existence.
 *
 * Guarded twice, on purpose. `useTransition` plus a local flag stops a double
 * tap from firing a second request, and the server's `UNIQUE (user_id,
 * card_date)` stops it from mattering if one gets through — a second press
 * returns the same card with `created: false`, which is a success. The database
 * guarantee is the real one; the client flag only spares it the round trip.
 *
 * Pending state stays on until `router.refresh()` has finished, because the
 * button's job is not done when the POST returns — it is done when the card has
 * replaced it. A button that goes idle and then sits there for another 200ms
 * reads as a press that did nothing.
 */
export function NudgeButton() {
  const router = useRouter();
  const [posting, setPosting] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);

  const busy = posting || refreshing;

  async function press() {
    if (busy) return;
    setPosting(true);
    setProblem(null);

    const result = await createCard(detectTimezone());
    setPosting(false);

    if (!result.ok) {
      // Retry is always safe: worst case the card was created and the second
      // press returns it.
      setProblem(result.message);
      return;
    }

    // Never compare the response's cardDate against a date captured at render
    // time — a press at 00:00:03 local legitimately lands on the next day, and
    // the server is right by definition. Refresh unconditionally.
    startRefresh(() => router.refresh());
  }

  return (
    <>
      <Button
        variant="filled"
        size="md"
        fullWidth={false}
        className="min-w-[200px]"
        loading={busy}
        onClick={() => void press()}
      >
        Make today’s card
      </Button>
      {problem && <Meta className="text-red">{problem}</Meta>}
    </>
  );
}
