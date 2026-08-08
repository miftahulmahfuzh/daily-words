import { request, type ApiResult } from "@/lib/api/client";
import type {
  AcceptCorrectionResponse,
  CreateVocabResponse,
  DeleteVocabResponse,
  DismissCorrectionResponse,
  EnrichResponse,
  ListVocabResponse,
  VocabDetailResponse,
  VocabStatus,
} from "@/lib/vocab/schemas";

/**
 * The browser half of F3's and F4's routes.
 *
 * The transport — the result-object convention, the `{ error: { code, message } }`
 * envelope, the offline case — lives in `@/lib/api/client` so F5's nudge and
 * every later feature share exactly one implementation of it. Types only from
 * `schemas.ts`; the zod schemas stay on the server.
 */

export type { ApiResult, ApiSuccess, ApiFailure } from "@/lib/api/client";

export function createEntry(term: string): Promise<ApiResult<CreateVocabResponse>> {
  return request("/api/vocab", "POST", { term });
}

export function enrichEntry(id: string): Promise<ApiResult<EnrichResponse>> {
  return request(`/api/vocab/${id}/enrich`, "POST");
}

export function acceptCorrection(
  id: string,
): Promise<ApiResult<AcceptCorrectionResponse>> {
  return request(`/api/vocab/${id}/correction`, "POST");
}

export function dismissCorrection(
  id: string,
): Promise<ApiResult<DismissCorrectionResponse>> {
  return request(`/api/vocab/${id}/correction`, "DELETE");
}

/* -------------------------------- Collection ------------------------------- */

/** The cursor is opaque here on purpose — held, returned, never read. */
export function listEntries(opts: {
  q?: string;
  cursor?: string | null;
}): Promise<ApiResult<ListVocabResponse>> {
  const params = new URLSearchParams();
  if (opts.q) params.set("q", opts.q);
  if (opts.cursor) params.set("cursor", opts.cursor);
  const qs = params.toString();
  return request(`/api/vocab${qs ? `?${qs}` : ""}`, "GET");
}

/** Absolute target, never a toggle — see `patchVocabBodySchema`. */
export function setEntryStatus(
  id: string,
  status: VocabStatus,
): Promise<ApiResult<VocabDetailResponse>> {
  return request(`/api/vocab/${id}`, "PATCH", { op: "set_status", status });
}

/** Fails with `in_use` and a readable sentence when the word has been carded. */
export function deleteEntry(id: string): Promise<ApiResult<DeleteVocabResponse>> {
  return request(`/api/vocab/${id}`, "DELETE");
}
