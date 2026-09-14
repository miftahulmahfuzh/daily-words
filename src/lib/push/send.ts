import 'server-only'
import webpush from 'web-push'
import type { PushTarget } from '@/lib/db/queries/push'
import { env } from '@/lib/env'

/**
 * The Web Push transport. One device, one notification, one result value.
 *
 * `import 'server-only'` is what turns a client import of `VAPID_PRIVATE_KEY`
 * into a build error rather than a leak, and this is one of exactly two files
 * under `src/` that names that variable — `npm run push:check` asserts that
 * every file which does carries this import.
 *
 * **Nothing here throws.** Every failure is a value, for the same reason
 * `lib/llm/embed.ts` gives: the caller is an unattended hourly job iterating
 * devices, and its correct response to any single failure is to carry on with
 * the next one. A rejected promise three frames up cannot tell a dead
 * subscription from a dead provider, and those two need opposite handling.
 *
 * **And nothing here knows what a reminder is.** No slot, no copy, no schedule —
 * `lib/push/schedule.ts` and `lib/push/reminders.ts` are not imported, and the
 * title and body arrive as arguments. This is the layer that talks to Apple.
 */

/**
 * The JSON that is encrypted and put on the wire. **This is the seam with
 * `public/sw.js`**, which parses exactly these fields in its `push` handler;
 * neither side may change it alone.
 *
 * `url` is a same-origin **path**, never an absolute URL. The worker opens it
 * relative to its own scope, so there is no shape of value here that can send a
 * tap somewhere else.
 */
export type PushPayload = {
  title: string
  body: string
  url: string
  /**
   * Collapses an undelivered notification into the next one with the same tag,
   * on the device. Optional here; the reminder path passes one.
   */
  tag?: string
}

export type PushSendOptions = {
  /**
   * How long the push service may hold an undelivered message, in seconds.
   *
   * Default one hour, and the default is an argument rather than a number: a
   * reminder the phone could not receive for an hour should not arrive at all,
   * because the next slot is at most two hours away and carries fresher copy.
   * The failure this prevents is the one that would make the whole feature
   * intolerable — a phone coming back online and playing six stale reminders.
   */
  ttlSeconds?: number
  /**
   * The push service's own collapse key, defaulting to `DEFAULT_TOPIC`. Two
   * messages with the same topic, neither yet delivered, become one — the newer
   * wins. A topic must be ≤32 URL-safe base64 characters.
   *
   * **Not the same thing as the notification `tag`** (`'daily-card-reminder'`,
   * which `public/sw.js` owns). The tag collapses notifications already *on the
   * device*; the topic collapses messages still queued *at the service*. The
   * strings differ on purpose so a log line says which layer collapsed.
   */
  topic?: string
  urgency?: 'very-low' | 'low' | 'normal' | 'high'
}

/**
 * What came back, classified so the caller does not have to parse anything.
 *
 * `gone` is the one arm with a mandatory consequence: **delete the row**. iOS
 * rotates and revokes endpoints, a revoked one answers 404 or 410 forever, and
 * retrying it is how a dead device becomes a permanent hourly error.
 */
export type PushOutcome =
  | { ok: true }
  /** 404 or 410. The subscription is dead. `deleteDeadSubscription` it. */
  | { ok: false; reason: 'gone' }
  /** No key pair configured. Reminders are off; this is not an error. */
  | { ok: false; reason: 'unconfigured' }
  /** The service answered and refused. Logged, skipped, kept. */
  | { ok: false; reason: 'rejected'; status: number }
  /** Never got an answer: timeout, DNS, TLS. Logged, skipped, kept. */
  | { ok: false; reason: 'transport' }

const DEFAULT_TTL_SECONDS = 60 * 60

/**
 * The default collapse key at the push service. Every reminder shares it, so a
 * phone that has been offline since breakfast receives the *latest* queued
 * reminder rather than six stale ones. Phase 4 passes no topic and relies on
 * this, which is why it is a default rather than a caller's responsibility.
 */
const DEFAULT_TOPIC = 'daily-card'

/**
 * The request budget. Generous next to an LLM call and short next to an hourly
 * schedule: the tick fans out over every device in one invocation, and a hung
 * connection must not be able to hold the whole run open.
 */
const REQUEST_TIMEOUT_MS = 10_000

type VapidDetails = { subject: string; publicKey: string; privateKey: string }

/**
 * The key pair, or null when this deployment has none.
 *
 * **Read per call, never at module scope.** `webpush.setVapidDetails()` is the
 * library's own global-configuration path and it *throws* on a malformed key —
 * calling it while the module graph is being evaluated turns a bad environment
 * variable into a build failure in an unrelated route. Passing `vapidDetails`
 * per request keeps every failure inside the call that caused it.
 */
function vapidDetails(): VapidDetails | null {
  const publicKey = env.VAPID_PUBLIC_KEY
  const privateKey = env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) return null
  return { subject: env.VAPID_SUBJECT, publicKey, privateKey }
}

/**
 * Is this deployment able to send at all?
 *
 * The honest half of "reminders are off": `GET /api/push/key` uses the public
 * key alone to decide what to tell the browser, and Phase 4's tick uses this to
 * return early without reading a single row.
 */
export function isPushConfigured(): boolean {
  return vapidDetails() !== null
}

/**
 * Which part of the endpoint is safe to log.
 *
 * A push endpoint is a bearer capability: anyone holding it can queue a message
 * to that device. It does not go in a log line, and this is what goes instead —
 * the service's host, which is the only part that is ever diagnostically
 * interesting ("Apple is refusing everything" vs "one device is dead").
 */
function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host
  } catch {
    return 'invalid-endpoint'
  }
}

/**
 * The HTTP status of a `WebPushError`, or undefined for anything else.
 *
 * Duck-typed rather than `instanceof webpush.WebPushError`, which is
 * `lib/db/errors.ts`'s reasoning for `isUniqueViolation`: a thrown value that
 * crossed a library boundary is not reliably an instance of the class you
 * imported, and the property is the thing actually being asked about.
 */
function statusOf(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined
  const code = (err as { statusCode?: unknown }).statusCode
  return typeof code === 'number' ? code : undefined
}

/**
 * Send one notification to one device.
 *
 * The payload is encrypted against the device's own `p256dh`/`auth` pair (RFC
 * 8291) and the request is signed with the VAPID key (RFC 8292) — both by
 * `web-push`. Apple sees ciphertext and an endpoint; the title and body are
 * readable only on the phone.
 */
export async function sendPush(
  target: PushTarget,
  payload: PushPayload,
  options: PushSendOptions = {},
): Promise<PushOutcome> {
  const vapid = vapidDetails()
  if (!vapid) return { ok: false, reason: 'unconfigured' }

  try {
    await webpush.sendNotification(
      {
        endpoint: target.endpoint,
        keys: { p256dh: target.p256dh, auth: target.auth },
      },
      JSON.stringify(payload),
      {
        vapidDetails: vapid,
        TTL: options.ttlSeconds ?? DEFAULT_TTL_SECONDS,
        urgency: options.urgency ?? 'normal',
        topic: options.topic ?? DEFAULT_TOPIC,
        timeout: REQUEST_TIMEOUT_MS,
      },
    )
    return { ok: true }
  } catch (err) {
    const status = statusOf(err)

    /**
     * 404 Not Found and 410 Gone are the same fact said twice by different push
     * services: this subscription will never work again. The caller deletes the
     * row. Retrying is what turns one rotated iPhone endpoint into an hourly
     * error for the rest of the year.
     */
    if (status === 404 || status === 410) {
      return { ok: false, reason: 'gone' }
    }

    if (status !== undefined) {
      // 400 is usually a malformed VAPID subject, 403 a key that does not match
      // the one the subscription was created with, 413 a payload over the 4 kB
      // ceiling. All three are deployment mistakes rather than device problems,
      // so they are loud in the log and harmless to the run.
      console.error('[push/send] refused', { host: endpointHost(target.endpoint), status })
      return { ok: false, reason: 'rejected', status }
    }

    console.error('[push/send] transport failed', {
      host: endpointHost(target.endpoint),
      err,
    })
    return { ok: false, reason: 'transport' }
  }
}
