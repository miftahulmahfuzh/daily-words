import { z } from 'zod'

/**
 * Request and response shapes for F30's two routes.
 *
 * zod 4 spellings throughout ([R2]).
 *
 * The browser imports only the inferred **types** from here. A value import of
 * any schema below from a client component drags the whole of zod into that
 * route's bundle — 73 kB in `/vocab/new` before F3 caught it — to re-check a
 * payload the route handler already produced through the same typed shape.
 * `lib/push/client.ts` imports types and nothing else, and that is not an
 * accident of how it was written.
 */

/**
 * Endpoints are opaque and vendor-chosen. Apple's are ~150 characters, FCM's
 * ~180, Mozilla's ~100; the cap is a backstop against a body that is trying to
 * be a denial-of-service rather than a claim about any real endpoint.
 */
export const PUSH_ENDPOINT_MAX = 1024

/** `p256dh` is an uncompressed P-256 point (87 b64url chars); `auth` is 22. */
export const PUSH_KEY_MAX = 255

/**
 * What the browser posts after `pushManager.subscribe()`.
 *
 * The shape mirrors `PushSubscription.toJSON()` exactly — `endpoint` beside a
 * nested `keys` object — rather than being flattened to match the table. The
 * client then hands over what the Push API gave it without reshaping anything,
 * which is one fewer place for a key to be swapped with the other one, and the
 * route does the flattening where the column names are visible.
 *
 * `z.url()` rather than `z.string()`: an endpoint that is not a URL cannot be
 * one, and `web-push` would reject it later with a worse message.
 *
 * `.strict()` for the reason every other schema in this app is strict — an
 * unexpected key is a client that believes something untrue, and finding that
 * out at the boundary is cheaper than finding it out in a column.
 */
export const createPushSubscriptionSchema = z
  .object({
    endpoint: z.url().max(PUSH_ENDPOINT_MAX),
    keys: z
      .object({
        p256dh: z.string().min(1).max(PUSH_KEY_MAX),
        auth: z.string().min(1).max(PUSH_KEY_MAX),
      })
      .strict(),
  })
  .strict()

export type CreatePushSubscriptionRequest = z.infer<typeof createPushSubscriptionSchema>

/**
 * Turning it off. The endpoint alone — the keys are not an identifier and
 * sending them back would be sending a secret to prove a fact the endpoint
 * already proves.
 *
 * It travels in the body rather than as `?endpoint=…` deliberately: a push
 * endpoint is a bearer capability for queueing messages to that device, and a
 * query string is the one part of a request that ends up in every access log
 * between here and the function.
 */
export const deletePushSubscriptionSchema = z
  .object({
    endpoint: z.url().max(PUSH_ENDPOINT_MAX),
  })
  .strict()

export type DeletePushSubscriptionRequest = z.infer<typeof deletePushSubscriptionSchema>

/* -------------------------------- Responses -------------------------------- */

/**
 * `null` is a real answer and the most important one: this deployment has no
 * VAPID key, so reminders are unavailable and the switch says so honestly
 * instead of offering a control that cannot work.
 *
 * There is a route at all — rather than a `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — for a
 * reason given in full in the route file: this repository contains no
 * `NEXT_PUBLIC_*` variable anywhere, and `lib/env.ts` is `server-only` precisely
 * so that stays true.
 */
export type PushKeyResponse = {
  publicKey: string | null
}

/** Both verbs answer the same shape, so the client has one thing to read. */
export type PushSubscriptionResponse = {
  subscribed: boolean
}
