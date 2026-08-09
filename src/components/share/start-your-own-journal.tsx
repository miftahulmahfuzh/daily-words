"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { startJournalSignup } from "@/lib/share/journal-signup-actions";
import { SHARE_JOURNAL_CTA_LABEL } from "@/lib/share/policy";

/**
 * The shared journal entry's one offer.
 *
 * A **form posting a server action**, where F17's `PractiseThisWord` is a plain
 * link — and the difference is not an inconsistency. That component points at a
 * route handler that sets a cookie and redirects, so it can be a GET and keep
 * working with JavaScript disabled. This one calls `signIn()`, which is a POST
 * with Auth.js's CSRF token behind it; there is no GET form of it to degrade to.
 *
 * The pending copy is `sign-in-button.tsx`'s verbatim, so a stranger who taps
 * this reads the same sentence they would have read on `/signin` and the same
 * one F17's claimer reads. Three screens, one voice.
 *
 * **The composer it lands on is not prefilled**, and there is no `?compose=`.
 * Prefilling would put somebody else's sentence into a new user's journal as the
 * default action — wrong on its own terms, and it would manufacture exactly the
 * near-duplicate collision F15 exists to warn about. `/journal`'s composer is
 * already a permanent field at the top of the screen that re-focuses itself after
 * a save, so landing there *is* the call to action. The label means it.
 */
export function StartYourOwnJournal() {
  return (
    <form action={startJournalSignup}>
      <SubmitButton />
    </form>
  );
}

/**
 * Split out because `useFormStatus` reads the *enclosing* form — a hook called in
 * the same component that renders the `<form>` reports the parent's state, which
 * is `false` forever.
 */
function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="filled" loading={pending} disabled={pending}>
      {pending ? "Taking you to Google…" : SHARE_JOURNAL_CTA_LABEL}
    </Button>
  );
}
