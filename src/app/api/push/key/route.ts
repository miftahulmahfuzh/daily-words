import { requireApiUser } from "@/lib/api/guards";
import { noStore, ok } from "@/lib/api/respond";
import { env } from "@/lib/env";
import type { PushKeyResponse } from "@/lib/push/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The VAPID public key, for `pushManager.subscribe()`.
 *
 * **Why this is a route and not a `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.** The key is
 * public by definition — it is handed to Apple with every subscription — so the
 * variable would be harmless in itself. What would not be harmless is what it
 * establishes: **this repository contains no `NEXT_PUBLIC_*` variable anywhere**,
 * and `src/lib/env.ts` carries `import 'server-only'` so that a client import of
 * the environment is a build error rather than a leak. That is a single,
 * checkable story about how configuration reaches code, and the first
 * `NEXT_PUBLIC_` is the one that turns it into a convention. Four lines of route
 * keep the property; a build-time inlined string spends it on saving a request
 * that happens once, inside a button press the user is already waiting on.
 *
 * `null` when this deployment has no key — which is a supported state, not an
 * error. Reminders are simply unavailable, and the switch on /profile/edit says
 * so rather than offering a control that silently cannot work.
 *
 * Authenticated, because everything under `/api` except the share paths is, and
 * because an anonymous probe of whether reminders are configured is a free
 * fingerprint of the deployment. All of `/api` is outside the middleware
 * matcher, so a signed-out request gets `requireApiUser()`'s 401 JSON envelope
 * rather than a 307 to an HTML page.
 *
 * `force-dynamic` and `noStore()` are not decoration. A GET route handler that
 * reads no request object is exactly the shape Next will happily evaluate once
 * and serve forever — and the value it would freeze is whichever answer the
 * build machine's environment produced, which for a build with no keys is
 * `{ publicKey: null }` served to a production deployment that has one.
 */
export async function GET(): Promise<Response> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  return noStore(ok<PushKeyResponse>({ publicKey: env.VAPID_PUBLIC_KEY ?? null }));
}
