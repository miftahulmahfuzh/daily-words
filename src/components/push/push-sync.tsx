"use client";

import { useEffect, useRef } from "react";
import {
  notificationPermission,
  pushCapability,
  registerServiceWorker,
  syncSubscription,
} from "@/lib/push/client";

/**
 * Keeps the stored push endpoint honest on every authed page. Renders nothing.
 *
 * `<TimezoneSync />`'s sibling, and deliberately the same shape: mounted in the
 * app shell, compares before it posts, and in the steady state costs **zero**
 * network requests. The comparison happens inside `syncSubscription()`, against
 * a `localStorage` mirror `lib/push/client.ts` owns — a wrong mirror costs one
 * redundant POST and is then right; a missing one costs the same.
 *
 * What makes this worth having at all: **iOS rotates push endpoints.** A
 * subscription created in March answers with a different URL in May, and the
 * row the sender holds becomes a 410 that nobody notices, because a
 * notification that does not arrive looks exactly like a day with no reminder
 * due. This is the only thing in the app that notices.
 *
 * It never asks for permission. `Notification.requestPermission()` outside a
 * user gesture is refused by iOS, and a permission sheet thrown up on page load
 * is the interruption product principle 1 exists to forbid. The tap on
 * /profile/edit is the only thing that may ask, and until it has, this
 * component registers no worker and touches nothing.
 */
export function PushSync() {
  const ran = useRef(false);

  useEffect(() => {
    // The effect has no dependencies, so React runs it once per mount — except
    // in StrictMode, which runs it twice on purpose. The ref is what keeps the
    // development build from double-posting a rotated endpoint.
    if (ran.current) return;
    ran.current = true;

    void (async () => {
      // Synchronous, three property tests, no network. `pushSupport()` would ask
      // the server for the public key, which is a request this component must
      // never make.
      if (pushCapability() !== "ready") return;

      // "granted" is the only state with anything to reconcile. "default" means
      // the user has never been asked and there is no subscription to rotate;
      // "denied" means there cannot be one.
      if (notificationPermission() !== "granted") return;

      const registration = await registerServiceWorker();
      if (!registration) return;

      // Everything network-shaped is inside here, and it only happens when the
      // live endpoint disagrees with the mirror — which on the overwhelming
      // majority of page loads it does not. A vanished subscription (revoked in
      // iOS Settings) clears the mirror and posts nothing: the server's row is
      // reaped by the sender's 410 sweep, and a DELETE from here would be a
      // request made to tidy something that is going to be tidied anyway, on the
      // one path in the app whose whole design goal is to be silent.
      await syncSubscription();
    })();
  }, []);

  return null;
}
