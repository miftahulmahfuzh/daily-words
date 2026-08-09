import { requireApiUser } from "@/lib/api/guards";
import { fail, ok } from "@/lib/api/respond";
import { readJson } from "@/lib/api/respond";
import { getCardForShare } from "@/lib/db/queries/cards";
import { getEntry } from "@/lib/db/queries/journal";
import { getUserTimezone } from "@/lib/db/queries/profiles";
import { createShare } from "@/lib/db/queries/shares";
import { getEntryForUser } from "@/lib/db/queries/vocab";
import { env } from "@/lib/env";
import { shareHref } from "@/lib/share/policy";
import {
  createShareSchema,
  type CreateShareRequest,
  type CreateShareResponse,
} from "@/lib/share/schemas";
import {
  toSharedCardPayload,
  toSharedJournalPayload,
  toSharedWordPayload,
} from "@/lib/share/serialize";

export const runtime = "nodejs";

/**
 * Mint a share. Auth, ownership, a snapshot, one INSERT. **No LLM call, ever.**
 *
 * Three properties this route has and should keep:
 *
 * 1. **Ownership is re-verified here, from the session**, never taken from the
 *    body. `getEntryForUser` puts `user_id` in the WHERE clause, so an id
 *    belonging to somebody else is a 404 rather than a 403 — a 403 would confirm
 *    the id exists.
 * 2. **The snapshot is built server-side**, by `toSharedWordPayload` and by
 *    nothing else. The client sends an id and receives a URL; it never sees or
 *    supplies the payload, so there is no path by which a phone decides what a
 *    stranger can read.
 * 3. **Idempotent.** A second POST for the same entity returns the same slug,
 *    because `createShare` catches the partial unique index rather than reading
 *    first. Two tabs cannot mint two links for one word.
 *
 * No rate limit, and that is reasoning rather than laziness (D11): creation is
 * authenticated, idempotent per entity, and structurally bounded by
 * `DAILY_ADD_LIMIT = 50` words a day. It burns no model quota and calls no
 * external service, so a best-effort in-memory counter would add a moving part
 * that protects nothing.
 */
export async function POST(req: Request): Promise<Response> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const body = await readJson(req, createShareSchema);
  if (!body.ok) return body.response;

  /**
   * Three arms, and the `switch` is exhaustive over `createShareSchema`'s
   * discriminant — which is why the request shape is a discriminated union
   * rather than an enum beside a bare uuid. A fourth entity type stops this
   * file compiling until somebody has decided what a stranger may see of it.
   *
   * Every arm re-verifies ownership **from the session**, never from the body,
   * and every arm builds its snapshot **server-side**. The client sends an id
   * and receives a URL; a phone has no part in deciding what crosses.
   */
  const built = await buildSnapshot(auth.user.id, body.data);
  if (!built.ok) return built.response;

  const share = await createShare(auth.user.id, {
    entityType: body.data.entityType,
    entityId: built.entityId,
    payload: built.payload,
  });

  // Absolute, because the phone puts it straight into a message. `env.APP_URL`
  // rather than the request's own Host header: a header a proxy can rewrite is
  // not something to build a shared link out of.
  return ok<CreateShareResponse>({
    slug: share.slug,
    url: `${env.APP_URL}${shareHref(share.slug)}`,
  });
}

type Snapshot =
  | { ok: true; entityId: string; payload: unknown }
  | { ok: false; response: Response };

/**
 * Read the entity the caller claims to own, and turn it into what a stranger
 * may see. **One function per kind, and every one of them goes through
 * `lib/share/serialize.ts`** — the one file that decides that question.
 *
 * Ownership is a WHERE clause in all three cases, so an id belonging to somebody
 * else is a 404 rather than a 403: a 403 confirms the id exists.
 */
async function buildSnapshot(
  userId: string,
  request: CreateShareRequest,
): Promise<Snapshot> {
  switch (request.entityType) {
    case "vocab": {
      const entry = await getEntryForUser(userId, request.id);
      if (!entry) {
        return { ok: false, response: fail(404, "That word is not in your collection.", "not_found") };
      }

      /**
       * Only a `ready` word can be shared.
       *
       * The control on `/vocab/[id]` does not render until then, so reaching
       * this is a stale tab or a hand-made request — but it is enforced here
       * because the client is not the gate. Sharing a `pending` word hands a
       * stranger a page with a term and nothing under it, and F17's claim path
       * would then have no enrichment to copy and would land a brand-new user on
       * "come back later".
       */
      if (entry.enrichmentStatus !== "ready") {
        return {
          ok: false,
          response: fail(409, "You can share a word once we've looked it up.", "not_ready"),
        };
      }

      return { ok: true, entityId: entry.id, payload: toSharedWordPayload(entry) };
    }

    case "card": {
      const card = await getCardForShare(userId, request.id);
      if (!card) {
        return { ok: false, response: fail(404, "That card is not yours.", "not_found") };
      }

      /**
       * **No `ready` gate here, unlike a word, and that is deliberate.** A card
       * is a record of a day that happened ([R1]) and it is at its most worth
       * sharing on the day it was made — which is exactly when a word added
       * minutes earlier may still be enriching. The public row draws F5's
       * skeleton for that word, the same as `/today` does, and the other five
       * are unaffected.
       *
       * A card is never created with zero items, so there is no empty case.
       */
      return { ok: true, entityId: card.id, payload: toSharedCardPayload(card) };
    }

    case "journal": {
      const entry = await getEntry(userId, request.id);
      if (!entry) {
        return { ok: false, response: fail(404, "That entry is gone.", "not_found") };
      }

      /**
       * The **owner's** zone, not the reader's. `toJournalEntryDto` takes the
       * reader's, which is right on `/journal/[id]` and wrong on a public page
       * where the reader is a stranger — so the day is resolved here, once, at
       * share time, and stored as a formatted string.
       */
      const timezone = await getUserTimezone(userId);
      return {
        ok: true,
        entityId: entry.id,
        payload: toSharedJournalPayload(entry, timezone),
      };
    }
  }
}
