/**
 * Daily Words' service worker. It caches nothing, intercepts nothing, and
 * exists for exactly two events.
 *
 * There is no `fetch` handler and there must not be one. Everything this app
 * draws is a database read behind a session; an offline shell would show a
 * stranger's-eye view of a screen whose whole content is private, and the
 * roadmap's no-cron/no-background-work line is the same argument one layer up.
 * The worker is here so the push service has somewhere to deliver to.
 *
 * Plain JavaScript on purpose: it is served from `public/` byte-for-byte, it is
 * not compiled by `tsc` (tsconfig's `include` lists no glob for `.js` files),
 * and there is no bundler entry for it. It IS linted — `npm run lint` is a bare
 * `eslint` and nothing ignores `public/`.
 *
 * `SW_VERSION` is not read by any code. It is here so that a phone can be asked
 * which worker it is running: in Safari's Web Inspector, or by reading the
 * deployed `/sw.js` directly. A worker is the one piece of this app that can be
 * a month stale on a device while the server is current, so the version has to
 * be visible in the artefact rather than inferred from a deploy log.
 */
const SW_VERSION = "2026-09-14.1";

/**
 * What a notification says when the payload does not say it.
 *
 * `userVisibleOnly: true` is a promise to the browser that every push produces a
 * notification, and a browser that catches the app breaking it revokes the
 * subscription — silently, permanently, and only on the user's phone. So there
 * is no code path below on which `showNotification` is skipped: a push with no
 * data, a push whose body is not JSON, and a push whose JSON is an array all
 * end at these four strings.
 */
const FALLBACK = {
  title: "Daily Words",
  body: "Today's card is still waiting to be made.",
  url: "/today",
  tag: "daily-card-reminder",
};

/**
 * Read the four fields the sender may set, defaulting each one on its own.
 *
 * Field-by-field rather than all-or-nothing: a sender that gets `url` wrong
 * should still deliver its own words, and a sender that gets `title` wrong
 * should still land on the right screen.
 *
 * `url` is the one field with a rule beyond "is a non-empty string". It must be
 * a same-origin path, and `startsWith("/")` alone does not say that —
 * `//evil.example/x` is protocol-relative and resolves off-origin. Both checks
 * are needed, and this is the only place in the worker where a value from the
 * network reaches something navigable.
 */
function readNotification(event) {
  if (!event.data) return FALLBACK;

  let raw;
  try {
    raw = event.data.json();
  } catch {
    return FALLBACK;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return FALLBACK;

  const title = typeof raw.title === "string" && raw.title ? raw.title : FALLBACK.title;
  const body = typeof raw.body === "string" && raw.body ? raw.body : FALLBACK.body;
  const tag = typeof raw.tag === "string" && raw.tag ? raw.tag : FALLBACK.tag;

  const url =
    typeof raw.url === "string" && raw.url.startsWith("/") && !raw.url.startsWith("//")
      ? raw.url
      : FALLBACK.url;

  return { title, body, url, tag };
}

/**
 * Activate a new worker on the next page load rather than waiting for every
 * client to close.
 *
 * `skipWaiting` is dangerous in a worker that caches assets — the new worker
 * starts serving a new manifest to a page built against the old one. This one
 * caches nothing and serves nothing, so there is no such pairing to break, and
 * the alternative is a phone running last month's `push` handler because a
 * standalone PWA is essentially never closed.
 */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * One reminder, replacing the last one rather than stacking beside it.
 *
 * The tag and `renotify` are a pair and neither works alone. A stable tag makes
 * 19:00 replace 17:00, so a user who was out all day comes back to one card on
 * the lock screen instead of seven. But a tagged replacement is silent by
 * default — which would mean the phone buzzes at 07:00 and never again, exactly
 * inverting what was asked for. `renotify: true` is what keeps each of the seven
 * an actual interruption.
 */
self.addEventListener("push", (event) => {
  const notification = readNotification(event);

  event.waitUntil(
    self.registration.showNotification(notification.title, {
      body: notification.body,
      tag: notification.tag,
      renotify: true,
      icon: "/icons/icon-192.png",
      data: { url: notification.url },
    }),
  );
});

/**
 * Tap the notification, land on the card that was not made.
 *
 * Close first, unconditionally: iOS leaves a tapped notification on the lock
 * screen otherwise, and a reminder for a card the user is at that moment
 * making is the worst notification the app could show.
 *
 * Then focus rather than open, when there is anything to focus. A standalone
 * PWA is one long-lived window; `clients.openWindow` against it is a second
 * window on desktop and a no-op-shaped race on iOS. `WindowClient.navigate`
 * shipped late in WebKit and rejects for a target outside the worker's scope,
 * so it is both feature-detected and caught — a focused window on the wrong
 * screen of the right app beats a rejected promise and no window at all.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data;
  const path = data && typeof data.url === "string" ? data.url : FALLBACK.url;
  const href = new URL(path, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        const mine = windows.find(
          (client) => new URL(client.url).origin === self.location.origin,
        );
        if (!mine) return self.clients.openWindow(href);

        return Promise.resolve(mine.focus())
          .then((focused) => {
            const client = focused || mine;
            if (typeof client.navigate !== "function") return undefined;
            if (client.url === href) return undefined;
            return client.navigate(href);
          })
          .catch(() => undefined);
      }),
  );
});
