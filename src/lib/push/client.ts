import { request } from "@/lib/api/client";
import type { PushKeyResponse, PushSubscriptionResponse } from "@/lib/push/schemas";

/**
 * The browser half of F30's two routes, plus every piece of Push API etiquette
 * that iOS enforces silently.
 *
 * Types only from `@/lib/push/schemas` — the zod schemas stay on the server; see
 * the note in `@/lib/api/client`. No `server-only`, and never any: this file
 * ships to the phone, and `lib/push/send.ts` is its server-side counterpart and
 * must not be imported from it, directly or transitively. It names neither
 * server-side secret env variable this feature declares, and `npm run
 * push:check` asserts that.
 *
 * **Nothing in this module asks for notification permission.** That is not an
 * omission. On iOS `Notification.requestPermission()` is refused unless it is
 * reached from a user gesture, and an `await` between the tap and the call loses
 * the gesture on WebKit — while `enablePush()` must register a service worker
 * before it can subscribe. So the ask belongs to the tap handler in
 * `components/push/reminder-toggle.tsx`, which calls it with nothing awaited
 * above it, and this module is handed a permission that is already `granted`.
 *
 * Nothing here throws. Every function returns a result object carrying the exact
 * sentence to show, because a `catch` three components up cannot know which one.
 */

/** Registered by `enablePush`, and by `<PushSync />` through `registerServiceWorker`. */
const SERVICE_WORKER_URL = "/sw.js";

/**
 * The endpoint this browser last *deliberately* enabled.
 *
 * **Load-bearing, not an optimisation.** Without it `syncSubscription()` cannot
 * tell "iOS rotated my endpoint, re-register it" from "I turned reminders off
 * and the browser's own unsubscribe failed" — and the second one would be
 * silently re-enabled on the next navigation, which is the worst bug this
 * feature could have. Absent means "this browser has not turned reminders on",
 * and a sync does nothing at all.
 *
 * It is also what makes `<PushSync />` cost zero network requests in the steady
 * state, the property `<TimezoneSync />` establishes: compare, then post only on
 * a genuine mismatch.
 *
 * **It lives here and in no second module.** A parallel draft put the same
 * mirror in `components/push/endpoint-mirror.ts` under a different key; two
 * mirrors of one fact is two try/catch disciplines and one silent disagreement.
 * The key is named once, the writes happen only inside `enablePush` /
 * `disablePush` / `syncSubscription`, and no component touches it.
 *
 * `localStorage`, not the `sessionStorage` the journal draft and the pane scroll
 * memory use: theirs hold the state of one visit, this holds the opposite. A
 * mirror that emptied on every cold start would make `<PushSync />` post on
 * every app open, which is the request it exists to avoid. Being wrong costs one
 * redundant POST, after which it is right; being absent costs the same.
 */
const ENABLED_ENDPOINT_KEY = "dw_push_endpoint";

/**
 * What this browser can do **without asking the server anything**. Synchronous,
 * three property tests, no network — which is what lets `<PushSync />` run it on
 * every authed page for free.
 */
export type PushCapability = "unsupported" | "needs_home_screen" | "ready";

/**
 * What this browser and this deployment can do together, asked once and answered
 * exactly.
 *
 * Four arms because there are four genuinely different sentences to show, and
 * collapsing any two of them produces a lie: "not supported" shown to an iPhone
 * user who only needs to install the app is the difference between a working
 * feature and an abandoned one.
 */
export type PushSupport =
  /** Everything is in place. Carries the key so `enablePush` need not refetch. */
  | { kind: "supported"; publicKey: string }
  /**
   * iOS Safari in a normal tab. `navigator.serviceWorker` exists but
   * `PushManager` does not: Apple exposes Web Push only to a web app launched
   * from the Home Screen. The fix is a user action, so this arm exists purely so
   * the UI can describe it.
   */
  | { kind: "needs_home_screen" }
  /** No service worker, or no Notification API. Nothing the user can do. */
  | { kind: "unsupported" }
  /** The browser is fine; this deployment has no VAPID key, or would not say. */
  | { kind: "unconfigured" };

export type PushEnableResult =
  | { ok: true; endpoint: string }
  | {
      ok: false;
      reason: "unsupported" | "needs_home_screen" | "unconfigured" | "failed";
      /** Shown to the user verbatim. */
      message: string;
    };

export type PushDisableResult = { ok: true } | { ok: false; message: string };

/** `endpoint: null` means this browser holds no subscription to sync. */
export type PushSyncResult =
  | { ok: true; endpoint: string | null }
  | { ok: false; message: string };

/**
 * Is this a Home-Screen install?
 *
 * Two tests because the two engines answer differently: `display-mode:
 * standalone` is the standard and is what Chrome and modern iOS report, and
 * `navigator.standalone` is Apple's original boolean, still the only reliable
 * signal on some iOS versions. Either is enough.
 */
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const byDisplayMode = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  const byApple = (window.navigator as { standalone?: boolean }).standalone === true;
  return byDisplayMode || byApple;
}

/**
 * Base64url -> Uint8Array, for `applicationServerKey`.
 *
 * Hand-written rather than pulled from a package, and it is eleven lines: the
 * Push API refuses the base64url string every VAPID tool prints, and wants the
 * raw 65 bytes. Passing the string produces a `DOMException` whose message
 * mentions neither base64 nor the key.
 *
 * `atob` handles standard base64 only, hence the two character swaps and the
 * padding — which is what every "why does subscribe() throw on iOS" answer is
 * actually about.
 */
function urlBase64ToUint8Array(base64url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function rememberEndpoint(endpoint: string | null): void {
  // A private window, or site data blocked, throws on access rather than
  // returning null. Reminders must still work for the session in that case.
  try {
    if (endpoint === null) window.localStorage.removeItem(ENABLED_ENDPOINT_KEY);
    else window.localStorage.setItem(ENABLED_ENDPOINT_KEY, endpoint);
  } catch {
    /* ignore */
  }
}

function rememberedEndpoint(): string | null {
  try {
    return window.localStorage.getItem(ENABLED_ENDPOINT_KEY);
  } catch {
    return null;
  }
}

/**
 * Three property tests, no network, no promise. `<PushSync />`'s first line.
 *
 * The iOS tab case is why the middle arm exists: in Safari on iOS 16.4+
 * `navigator.serviceWorker` is present and `window.PushManager` is **absent**
 * until the app is launched from the Home Screen. Reporting that as
 * "unsupported" would be true of the tab and false of the phone.
 */
export function pushCapability(): PushCapability {
  if (typeof window === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator) || !("Notification" in window)) return "unsupported";
  if (!("PushManager" in window)) {
    return isStandalone() ? "unsupported" : "needs_home_screen";
  }
  return "ready";
}

/**
 * `pushCapability()` plus the one question only the server can answer.
 *
 * Asked through `GET /api/push/key` rather than a `NEXT_PUBLIC_` variable — the
 * argument is in that route's own comment. **One authenticated GET**, so this is
 * for a settings screen, not for a component mounted on every page:
 * `<PushSync />` calls `pushCapability()` instead, and that separation is what
 * keeps the authed shell free.
 *
 * A request that fails answers `unconfigured` as well as one that returns a null
 * key. Both mean "this deployment cannot give you a subscription right now", the
 * switch's sentence is honest for either, and a fifth arm for a transient
 * network error would be a state the UI has nothing different to say about.
 */
export async function pushSupport(): Promise<PushSupport> {
  const capability = pushCapability();
  if (capability !== "ready") return { kind: capability };

  const result = await request<PushKeyResponse>("/api/push/key", "GET");
  if (!result.ok || !result.data.publicKey) return { kind: "unconfigured" };

  return { kind: "supported", publicKey: result.data.publicKey };
}

/** `null` when this browser has no `Notification` at all. Never throws. */
export function notificationPermission(): NotificationPermission | null {
  if (typeof window === "undefined" || !("Notification" in window)) return null;
  return Notification.permission;
}

/**
 * The ask. **Call this synchronously from a tap handler, with nothing awaited
 * above it.**
 *
 * It is a one-line wrapper on purpose: it exists so that the call site in
 * `reminder-toggle.tsx` is the *only* place in the app that asks, and so that a
 * grep for `requestPermission` finds one function rather than a scattering. On
 * iOS a call not reached from a user gesture resolves `default` without ever
 * showing the prompt — no throw, no dialog, no console line.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return "default";
  }
}

/**
 * The registration, registering the worker first if it is not there yet. `null`
 * on any failure — a browser that will not register a worker is a browser that
 * cannot have reminders, and there is nothing for a caller to do about it.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    await navigator.serviceWorker.register(SERVICE_WORKER_URL);
    // `register()` resolves before the worker is active; `ready` is the one that
    // waits for a registration with an active worker, which is what
    // `pushManager` needs. Registering an already-registered URL is a no-op, so
    // this is cheap.
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

/** This device's live subscription, or null. A local read; no network. */
export async function getSubscription(): Promise<PushSubscription | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_URL);
    if (!registration?.pushManager) return null;
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/** Does this browser currently hold a push subscription? The switch's position. */
export async function isSubscribed(): Promise<boolean> {
  return (await getSubscription()) !== null;
}

/**
 * Register the worker, subscribe, and tell the server.
 *
 * **It does not ask for permission and must never start doing so.** By the time
 * this runs, `reminder-toggle.tsx` has already asked in the tap handler and has
 * a `granted`. Asking again here would be harmless on a granted permission and
 * disastrous as a design: it would put the ask *after* `registerServiceWorker()`
 * awaits, which on iOS is a prompt that never appears.
 *
 * Nothing is left behind on any failure path: a subscription the server refused
 * is unsubscribed again before this returns, because a half-on state reads as
 * "on" and never delivers.
 */
export async function enablePush(): Promise<PushEnableResult> {
  const support = await pushSupport();

  if (support.kind === "needs_home_screen") {
    return {
      ok: false,
      reason: "needs_home_screen",
      message: "Add Daily Words to your Home Screen first, then turn this on from there.",
    };
  }
  if (support.kind === "unsupported") {
    return { ok: false, reason: "unsupported", message: "This browser can't do reminders." };
  }
  if (support.kind === "unconfigured") {
    return {
      ok: false,
      reason: "unconfigured",
      message: "Reminders aren't available right now.",
    };
  }

  try {
    const registration = await registerServiceWorker();
    if (!registration) {
      return { ok: false, reason: "failed", message: "Couldn't set up reminders. Try again." };
    }

    const subscription = await registration.pushManager.subscribe({
      /**
       * Mandatory, and a promise rather than a flag: every push that arrives
       * **must** result in a visible notification. `public/sw.js` always calls
       * `showNotification`; a push that does not is how a browser revokes the
       * subscription without telling anybody.
       */
      userVisibleOnly: true,
      // The raw key bytes. The base64url string every VAPID tool prints is
      // rejected here — see `urlBase64ToUint8Array`.
      // Cast for TS 5.7+'s generic `Uint8Array<ArrayBufferLike>`, which no
      // longer structurally satisfies `BufferSource` — a TS/lib.dom typing
      // change, not a behavioural one; the bytes are exactly what the Push API
      // expects.
      applicationServerKey: urlBase64ToUint8Array(support.publicKey) as BufferSource,
    });

    const json = subscription.toJSON();
    const keys = json.keys;
    if (!json.endpoint || !keys?.p256dh || !keys?.auth) {
      await subscription.unsubscribe().catch(() => {});
      return { ok: false, reason: "failed", message: "Couldn't set up reminders. Try again." };
    }

    const saved = await request<PushSubscriptionResponse>("/api/push/subscription", "POST", {
      endpoint: json.endpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
    });

    if (!saved.ok) {
      // The browser has a subscription the server does not know about. Undo it,
      // so the switch and the server agree.
      await subscription.unsubscribe().catch(() => {});
      return { ok: false, reason: "failed", message: saved.message };
    }

    rememberEndpoint(json.endpoint);
    return { ok: true, endpoint: json.endpoint };
  } catch {
    return { ok: false, reason: "failed", message: "Couldn't set up reminders. Try again." };
  }
}

/**
 * Turn reminders off on this device.
 *
 * The local mirror is cleared **first**, before anything can fail, so that a
 * partially-failed disable can never be undone by the next `syncSubscription()`
 * re-registering the endpoint the user just rejected.
 *
 * The server row goes next and the browser's own subscription last. If the row
 * survives, the device is already silent and the sender collects the row on its
 * next 410; if the browser subscription survives, it is an inert endpoint with
 * nothing sending to it.
 */
export async function disablePush(): Promise<PushDisableResult> {
  rememberEndpoint(null);

  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return { ok: true };

  try {
    const subscription = await getSubscription();

    // Nothing here to turn off. The user's intent is satisfied.
    if (!subscription) return { ok: true };

    const removed = await request<PushSubscriptionResponse>(
      "/api/push/subscription",
      "DELETE",
      { endpoint: subscription.endpoint },
    );
    if (!removed.ok) return { ok: false, message: removed.message };

    await subscription.unsubscribe();
    return { ok: true };
  } catch {
    return { ok: false, message: "Couldn't turn reminders off. Try again." };
  }
}

/**
 * Reconcile this device's subscription with the server. Never throws, and
 * **issues no request at all in the steady state** — which is `<TimezoneSync />`'s
 * property and the reason Phase 3's `<PushSync />` can be mounted in the authed
 * shell without costing anything per navigation.
 *
 * It exists because **iOS rotates push endpoints**. A subscription registered in
 * March answers `410 Gone` in April under a new endpoint the browser already
 * holds and never mentions; without this the user's reminders stop, with no
 * error anywhere and a switch that still reads "on".
 *
 * The three-way decision:
 *
 *   - no remembered endpoint -> this browser never opted in (or opted out).
 *     **Do nothing**, and answer `endpoint: null`. This is the guard that makes
 *     the disable path safe.
 *   - no current subscription -> the user revoked permission at the OS level.
 *     Clear the mirror, answer `endpoint: null`; the server row dies on its next
 *     send. No DELETE from here: it would be a request made to tidy a row that
 *     is going to be tidied anyway, on the one path whose design goal is silence.
 *   - endpoints differ -> it rotated. Re-register and remember the new one. The
 *     old row is left for the sender's 410 sweep, which is the only thing that
 *     can actually observe that it is dead.
 */
export async function syncSubscription(): Promise<PushSyncResult> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return { ok: true, endpoint: null };
  }

  const known = rememberedEndpoint();
  if (!known) return { ok: true, endpoint: null };

  try {
    const subscription = await getSubscription();
    if (!subscription) {
      rememberEndpoint(null);
      return { ok: true, endpoint: null };
    }
    if (subscription.endpoint === known) return { ok: true, endpoint: known };

    const json = subscription.toJSON();
    const keys = json.keys;
    if (!json.endpoint || !keys?.p256dh || !keys?.auth) {
      return { ok: true, endpoint: known };
    }

    const saved = await request<PushSubscriptionResponse>("/api/push/subscription", "POST", {
      endpoint: json.endpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
    });
    if (!saved.ok) return { ok: false, message: saved.message };

    // Only on success. A failed POST must leave the mirror saying what the
    // server actually last acknowledged, or the next page load would believe the
    // rotation had landed and never try again.
    rememberEndpoint(json.endpoint);
    return { ok: true, endpoint: json.endpoint };
  } catch {
    /* A failed sync is invisible and must stay that way. The next one retries. */
    return { ok: true, endpoint: known };
  }
}
