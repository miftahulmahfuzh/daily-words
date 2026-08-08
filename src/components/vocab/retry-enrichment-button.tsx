"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Meta } from "@/components/ui/text";
import { enrichEntry } from "@/lib/vocab/client";
import { RETRY_EXHAUSTED_MESSAGE } from "@/lib/vocab/display";
import type { EnrichResponse } from "@/lib/vocab/schemas";

/**
 * The recovery handle for every entry that is not `ready`.
 *
 * F4 mounts this on `/vocab/[id]` and may mount it on a `/vocab` list row; it is
 * the *only* thing in the app outside `/vocab/new` that may cause a model call,
 * and it does so on an explicit tap. That is what keeps the roadmap's rule —
 * detail pages read the database, never a live call — true in practice.
 *
 * `onDone` is for callers that already hold the entry in state (the add flow).
 * Without it the component refreshes the server render, which is what a page
 * that read its entry from the database wants.
 */
export function RetryEnrichmentButton({
  entryId,
  label = "Finish this word",
  size = "sm",
  fullWidth = false,
  onDone,
}: {
  entryId: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  /** Called with the fresh row instead of refreshing the route. */
  onDone?: (entry: EnrichResponse) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(false);

  async function run() {
    setBusy(true);
    setProblem(null);
    const result = await enrichEntry(entryId);
    setBusy(false);

    if (!result.ok) {
      if (result.code === "retry_exhausted") {
        setExhausted(true);
        return;
      }
      setProblem(result.message);
      return;
    }

    if (onDone) onDone(result.data);
    else router.refresh();
  }

  if (exhausted) return <Meta>{RETRY_EXHAUSTED_MESSAGE}</Meta>;

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        size={size}
        fullWidth={fullWidth}
        loading={busy}
        onClick={run}
        className="tracking-nav"
      >
        {label}
      </Button>
      {problem && <Meta className="text-red">{problem}</Meta>}
    </div>
  );
}
