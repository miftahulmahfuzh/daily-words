"use client";

import { useEffect, useRef } from "react";
import { postTimezone } from "@/lib/profile/client";
import { detectTimeZone } from "@/lib/profile/timezone";

/**
 * Captures the browser's IANA zone during onboarding. Renders nothing.
 *
 * The user is never asked for their timezone — F5 and F9 cannot compute a local
 * day without one, and "which of these 400 zones are you in?" is a question a
 * phone can answer itself. It is detected, silently, once.
 *
 * No spinner, no error state, no blocking: a failed POST here is invisible and
 * recovered twice over — `POST /api/profile/complete` carries the zone as a
 * second chance, and `<TimezoneSync />` corrects it on the next page load.
 *
 * The `sentRef` guard is against React StrictMode's double-invoke in dev. The
 * route is idempotent either way; the guard exists so the network tab stays
 * honest while the flow is being verified.
 */
export function TimezoneCapture() {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;

    const tz = detectTimeZone();
    if (!tz) return;
    void postTimezone(tz);
  }, []);

  return null;
}
