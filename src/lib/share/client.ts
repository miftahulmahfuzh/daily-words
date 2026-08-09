import { request, type ApiResult } from "@/lib/api/client";
import type {
  CreateShareRequest,
  CreateShareResponse,
  DeleteShareResponse,
} from "@/lib/share/schemas";

/**
 * The browser half of F16's two routes.
 *
 * The transport — the result-object convention, the `{ error: { code, message } }`
 * envelope, the offline case — lives in `@/lib/api/client`, shared with every
 * other feature. **Types only from `schemas.ts`**; importing a zod schema as a
 * value from a client component pulls the whole of zod into that route's bundle.
 *
 * The client sends an id and receives a URL. It never sends a payload: what a
 * stranger can see is decided on the server, in one file, and a phone has no
 * business in that decision.
 */

/**
 * All three entity types, as of F18.
 *
 * `entityType` is typed against the request union rather than as a bare string,
 * so a fourth kind cannot be sent from a phone before the route knows how to
 * snapshot it.
 */
export function createShare(
  entityType: CreateShareRequest["entityType"],
  id: string,
): Promise<ApiResult<CreateShareResponse>> {
  return request("/api/shares", "POST", { entityType, id });
}

export function revokeShare(slug: string): Promise<ApiResult<DeleteShareResponse>> {
  return request(`/api/shares/${slug}`, "DELETE");
}
