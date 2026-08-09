import { request, type ApiResult } from "@/lib/api/client";
import type {
  JournalEntryResponse,
  ListJournalResponse,
} from "@/lib/journal/schemas";

/**
 * The browser half of F10's routes.
 *
 * Types only from `schemas.ts` — the zod schemas stay on the server. The
 * transport, the result-object convention and the offline case all live in
 * `@/lib/api/client`, shared with every other feature.
 */

export type { ApiResult, ApiSuccess, ApiFailure } from "@/lib/api/client";

export function saveEntry(
  text: string,
  sourceNote: string | null,
): Promise<ApiResult<JournalEntryResponse>> {
  return request("/api/journal", "POST", { text, sourceNote });
}

/** The cursor is opaque here on purpose — held, returned, never read. */
export function listEntries(cursor: string): Promise<ApiResult<ListJournalResponse>> {
  return request(`/api/journal?cursor=${encodeURIComponent(cursor)}`, "GET");
}

export function getEntry(id: string): Promise<ApiResult<JournalEntryResponse>> {
  return request(`/api/journal/${id}`, "GET");
}

/** Any subset of the two fields. Omitting a key leaves it alone. */
export function patchEntry(
  id: string,
  patch: { text?: string; sourceNote?: string | null },
): Promise<ApiResult<JournalEntryResponse>> {
  return request(`/api/journal/${id}`, "PATCH", patch);
}

/** `204` with no body — `request` reads that as `bad_response`, so this is bespoke. */
export async function deleteEntry(id: string): Promise<{ ok: boolean; code?: string }> {
  try {
    const res = await fetch(`/api/journal/${id}`, { method: "DELETE" });
    if (res.status === 204) return { ok: true };
    // 404 means somebody else already removed it — the user's intent is
    // satisfied either way, and the caller treats it as success.
    if (res.status === 404) return { ok: true, code: "not_found" };
    return { ok: false, code: `http_${res.status}` };
  } catch {
    return { ok: false, code: "no_connection" };
  }
}

/** Costs a model call and takes 3–15 s. One per entry, forever. */
export function requestInsight(id: string): Promise<ApiResult<JournalEntryResponse>> {
  return request(`/api/journal/${id}/insight`, "POST");
}
