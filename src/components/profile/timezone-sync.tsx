"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { postTimezone } from "@/lib/profile/client";
import { detectTimeZone } from "@/lib/profile/timezone";

/**
 * Keeps the stored zone honest on every authed page. Renders nothing.
 *
 * Mounted in the app shell with the server-rendered value as a prop, and it
 * compares before it posts — so in the steady state this costs **zero** network
 * requests. Only a genuine mismatch, which means the user has travelled or
 * changed their device clock, causes a write.
 *
 * Updating silently rather than asking is deliberate. The field's only job is
 * answering "what local calendar date is it for this user right now"; a user who
 * has flown to Tokyo genuinely is in Tokyo, and leaving the stored zone makes
 * /today show yesterday's card. Staleness is the bug, not the fix. It also cannot
 * corrupt history: `daily_cards.card_date` is already written, and only *future*
 * boundary computations move. And a modal asking the user to confirm something
 * the browser already knows, in front of the daily ritual, is exactly what
 * product principle 1 forbids.
 *
 * The one case where the human is more trustworthy than the machine — a VPN, or
 * a mis-set device the user has corrected by hand — is covered on the server:
 * `timezone_source = 'manual'` makes this component's POST a no-op for good.
 */
export function TimezoneSync({
  stored,
  source,
}: {
  stored: string;
  /** `manual` means don't even ask. The server would refuse anyway. */
  source: "detected" | "manual";
}) {
  const router = useRouter();
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;

    // The server is the real guard, but a request it is certain to refuse is a
    // request not worth making — and a user whose manual zone differs from their
    // device zone would otherwise pay for one on every single navigation.
    if (source === "manual") return;

    const tz = detectTimeZone();
    if (!tz || tz === stored) return;

    sent.current = true;
    void postTimezone(tz).then((result) => {
      // Only when the row actually moved. The page above was rendered against
      // the old zone, so /today's date line and its week strip are wrong until
      // it re-renders. A `manual` row answers `updated: false` and is left
      // alone, which is also what keeps this from looping.
      if (result.ok && result.data.updated) router.refresh();
    });
  }, [stored, source, router]);

  return null;
}
