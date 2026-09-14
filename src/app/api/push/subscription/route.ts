import { requireApiUser } from "@/lib/api/guards";
import { fail, noStore, ok, readJson } from "@/lib/api/respond";
import { deleteSubscription, upsertSubscription } from "@/lib/db/queries/push";
import {
  createPushSubscriptionSchema,
  deletePushSubscriptionSchema,
  type PushSubscriptionResponse,
} from "@/lib/push/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Register this device for reminders. Idempotent on the endpoint.
 *
 * Two callers, and the second is why idempotence is a requirement rather than a
 * nicety: the switch on /profile/edit posts once, and `<PushSync />` posts again
 * whenever iOS has rotated the endpoint underneath a subscription the user
 * turned on weeks ago. Neither caller reads first, and neither should have to.
 *
 * The conflict target is the endpoint alone, so a second account signing into
 * the same installed PWA **moves** the row rather than duplicating it — the
 * argument is in `queries/push.ts` and it is the difference between "reminders
 * follow the install" and "a stranger's reminders arrive on your phone".
 *
 * The `user-agent` is stored as a diagnostic and nothing reads it in this phase.
 * "Which of my devices is this row?" is otherwise unanswerable from an opaque
 * endpoint URL, and it is the first question asked the first time a notification
 * arrives twice.
 */
export async function POST(req: Request): Promise<Response> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const body = await readJson(req, createPushSubscriptionSchema);
  if (!body.ok) return body.response;

  try {
    await upsertSubscription(auth.user.id, {
      endpoint: body.data.endpoint,
      p256dh: body.data.keys.p256dh,
      auth: body.data.keys.auth,
      userAgent: req.headers.get("user-agent"),
    });
  } catch (err) {
    console.error("[api/push/subscription] upsert failed", { userId: auth.user.id, err });
    return noStore(fail(500, "Couldn't turn reminders on. Try again.", "internal"));
  }

  return noStore(ok<PushSubscriptionResponse>({ subscribed: true }));
}

/**
 * Stop sending to this device.
 *
 * **200 whether or not a row was removed**, which is the opposite call to
 * `DELETE /api/shares/[slug]`'s 404 and is deliberate. There, the distinction
 * carries information the user needs — the link either is or is not revoked.
 * Here the user's intent is "stop notifying this browser", and that is equally
 * true of an endpoint that was already gone, one that rotated, and one that
 * belongs to a row this session does not own. The client also calls
 * `subscription.unsubscribe()` locally either way, which is the half that
 * actually silences the device. An honest-looking 404 would turn a no-op into an
 * error message under a switch that had already worked.
 *
 * Scoped by `userId` in the WHERE clause regardless, so this cannot be used to
 * unsubscribe somebody else's device by guessing an endpoint.
 */
export async function DELETE(req: Request): Promise<Response> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const body = await readJson(req, deletePushSubscriptionSchema);
  if (!body.ok) return body.response;

  try {
    await deleteSubscription(auth.user.id, body.data.endpoint);
  } catch (err) {
    console.error("[api/push/subscription] delete failed", { userId: auth.user.id, err });
    return noStore(fail(500, "Couldn't turn reminders off. Try again.", "internal"));
  }

  return noStore(ok<PushSubscriptionResponse>({ subscribed: false }));
}
