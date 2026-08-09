"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { CLAIM_SUBMIT_LABEL } from "@/lib/share/claim";

/**
 * Submits the enclosing form once, on mount.
 *
 * The claim is a POST because a GET that writes is prefetchable, replayable and
 * invisible to Next's CSRF machinery (F17 D5) — but the *user* did their tapping
 * two screens ago, on "Practise this word", and should not be asked to tap again.
 * So the form is real, visible and tappable, and this fires it for them.
 *
 * With JS the user reads one sentence and lands in the chat. Without it, or on a
 * client slow enough that this never runs, they see a working button instead of a
 * dead screen. That is the whole reason the form is not hidden.
 *
 * `firedRef` and not the effect's own idempotence: React 19 runs effects twice in
 * development, and a second `requestSubmit()` would POST the claim twice. The
 * write is idempotent (the second lands `already_have`), but a double POST would
 * still race its own redirect. The same discipline F6's opener uses.
 *
 * The form is found by walking up from a hidden marker rather than by an id,
 * because an id is a global name two mounted copies of this page would share.
 */
export function ClaimRunner() {
  const markerRef = useRef<HTMLSpanElement>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    markerRef.current?.closest("form")?.requestSubmit();
  }, []);

  return <span ref={markerRef} hidden aria-hidden="true" />;
}

/**
 * The form's own button. Must be rendered inside the form whose action is
 * `finishShareClaim` — `useFormStatus` reads the enclosing form's pending state.
 *
 * It goes pending within a frame of mounting when `ClaimRunner` fires, which is
 * the point: the screen reads as one sentence and one button that is already
 * working, rather than as an invitation to tap something that has been tapped.
 */
export function ClaimSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="filled" loading={pending} disabled={pending}>
      {CLAIM_SUBMIT_LABEL}
    </Button>
  );
}
