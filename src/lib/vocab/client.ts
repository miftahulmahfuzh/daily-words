import { request, type ApiResult } from "@/lib/api/client";
import type {
  AcceptCorrectionResponse,
  AcceptSuggestionResponse,
  CreateVocabResponse,
  DeleteVocabResponse,
  DismissCorrectionResponse,
  EnrichResponse,
  ListVocabResponse,
  LookupVocabResponse,
  SuggestResponse,
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

/**
 * `allowNearDuplicate` is only ever sent by the "Add … anyway" button on the
 * near-duplicate notice — never by the first attempt, and never as a default.
 * F14 D5: the warning must be something the user overrules, which means it has
 * to have been shown.
 */
export function createEntry(
  term: string,
  allowNearDuplicate = false,
): Promise<ApiResult<CreateVocabResponse>> {
  return request("/api/vocab", "POST", { term, allowNearDuplicate });
}

export function enrichEntry(id: string): Promise<ApiResult<EnrichResponse>> {
  return request(`/api/vocab/${id}/enrich`, "POST");
}

/* ----------------------------- Non-English lookup --------------------------- */

/**
 * Resolve a foreign term to an English word. **Writes nothing** — the entry it
 * returns is not a row and has no id, which is the whole difference between this
 * and `createEntry`.
 *
 * The `lookup` string on a `resolved` answer is opaque here and stays that way:
 * held, handed back, never read. It is an HMAC over the model's output, and the
 * moment this file tried to interpret it the server's guarantee would become a
 * suggestion.
 */
export function lookupTerm(
  term: string,
  context: string,
): Promise<ApiResult<LookupVocabResponse>> {
  return request("/api/vocab/lookup", "POST", {
    term,
    ...(context.trim() ? { context } : {}),
  });
}

/**
 * Keep a resolution. Same route as the typed add and the same response shape, so
 * the duplicate and near-duplicate outcomes need no second handler in the form.
 *
 * `term` is sent for symmetry and is **not** what the row gets named — the
 * server takes that from the signed token. Sending it makes the request legible
 * in a network log; trusting it would defeat the signature.
 */
export function createEntryFromLookup(args: {
  term: string;
  originTerm: string;
  originContext: string;
  lookup: string;
}): Promise<ApiResult<CreateVocabResponse>> {
  return request("/api/vocab", "POST", {
    term: args.term,
    originTerm: args.originTerm,
    ...(args.originContext.trim() ? { originContext: args.originContext } : {}),
    lookup: args.lookup,
  });
}

/**
 * The collision path: the English word is already held, so attach the foreign
 * word that led back to it rather than creating anything. A no-op when that row
 * already carries an origin — one per row, first one wins.
 */
export function attachOriginToEntry(
  id: string,
  args: { originTerm: string; originContext: string; lookup: string },
): Promise<ApiResult<CreateVocabResponse>> {
  return request(`/api/vocab/${id}/origin`, "POST", {
    originTerm: args.originTerm,
    ...(args.originContext.trim() ? { originContext: args.originContext } : {}),
    lookup: args.lookup,
  });
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

/* -------------------------------- Discovery -------------------------------- */

/**
 * One batch of candidates. `exclude` is what the user has declined so far in
 * this browser session — held in the component, never persisted (F8 §9 D2).
 */
export function suggestWords(exclude: string[]): Promise<ApiResult<SuggestResponse>> {
  return request("/api/vocab/suggestions", "POST", { exclude });
}

/**
 * Keep one. The term is the only thing sent: `source` is forced server-side and
 * the preview gloss is discarded here, which is what guarantees the stored
 * definition can only ever come from F3's enrichment.
 */
export function acceptSuggestion(
  term: string,
): Promise<ApiResult<AcceptSuggestionResponse>> {
  return request("/api/vocab/suggestions/accept", "POST", { term });
}
