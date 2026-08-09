"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { detectTimeZone } from "@/lib/profile/timezone";
import { SHARE_PRACTISE_LABEL } from "@/lib/share/policy";

/**
 * The one thing a stranger can do on this page.
 *
 * It stays a **link** — `Button` renders an anchor when given an `href`, and
 * `tests/e2e/share-frame.spec.ts` finds it by `getByRole("link")`. A form posting
 * a server action was the other option and lost: this page is served to somebody
 * who may have JavaScript disabled, arrived from a message app's in-app browser,
 * or be on the second tap of a flaky connection, and a plain GET to
 * `/s/<slug>/claim` works in all three. The route it points at sets the signed
 * cookie and redirects; nothing here writes anything.
 *
 * **The one job this component has that the server could not do: the timezone.**
 * CLAUDE.md — "the user's timezone is detected, never asked" — and F17 needs it
 * *before* the OAuth hop, because completing onboarding is a write and
 * **writes may not fall back to a default zone**: the failure mode of a guessed
 * zone is a daily card dated a day wrong, forever, silently. `detectTimeZone()` is
 * the same function `components/profile/timezone-capture.tsx` uses, and it can
 * only run in a browser, so the href gains `?tz=` on mount.
 *
 * Degrading is deliberate and honest. With no JS the link is tapped without a
 * zone, the claim resolves to `no_timezone`, and the claimer is sent through the
 * real five-screen onboarding — which mounts `timezone-capture.tsx` and asks the
 * browser properly. One screen spent rather than a date guessed.
 *
 * The zone is validated server-side twice regardless: `encodeClaimIntent` refuses
 * to mint a cookie carrying a zone `isValidTimeZone` rejects, and
 * `decodeClaimIntent` degrades an unresolvable one to null on the way back out.
 * Nothing here is trusted.
 */
export function PractiseThisWord({ claimHref }: { claimHref: string }) {
  const [href, setHref] = useState(claimHref);

  useEffect(() => {
    const tz = detectTimeZone();
    // `claimHref` has no query string of its own — it is `/s/<slug>/claim` from
    // `shareClaimHref` — so `?` is correct and `&` would be a bug waiting for the
    // day it gains one.
    if (tz) setHref(`${claimHref}?tz=${encodeURIComponent(tz)}`);
  }, [claimHref]);

  return (
    <Button variant="filled" href={href}>
      {SHARE_PRACTISE_LABEL}
    </Button>
  );
}
