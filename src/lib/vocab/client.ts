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
 * The browser half of F3's three routes.
 *
 * Every call returns a result object rather than throwing, because every failure
 * here has a sentence the user must be shown, and a `catch` block three
 * components up cannot know which sentence. `fetch` only rejects on a genuinely
 * dead connection, which is `no_connection`.
 *
 * Types only from `schemas.ts` — the zod schemas stay on the server. Importing
 * them as values here pulled the whole of zod into the /vocab/new bundle for
 * 73kB, to re-check a payload that a route handler had already produced through
 * the same typed shape. The compiler catches that drift at build time; the phone
 * should not pay to catch it again at runtime. What is checked below is only
 * what the compiler genuinely cannot see: that a body arrived and is an object.
 */

export type ApiFailure = { ok: false; code: string; message: string };
export type ApiSuccess<T> = { ok: true; status: number; data: T };
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

const OFFLINE: ApiFailure = {
  ok: false,
  code: "no_connection",
  message: "No connection. Try again.",
};

const GARBLED: ApiFailure = {
  ok: false,
  code: "bad_response",
  message: "Something went wrong. Try again.",
};

type ErrorEnvelope = { error: { code: string; message: string } };

/** The `{ error: { code, message } }` shape every F1 route handler returns. */
function isErrorEnvelope(v: unknown): v is ErrorEnvelope {
  if (typeof v !== "object" || v === null || !("error" in v)) return false;
  const e = (v as { error: unknown }).error;
  return (
    typeof e === "object" &&
    e !== null &&
    typeof (e as { code?: unknown }).code === "string" &&
    typeof (e as { message?: unknown }).message === "string"
  );
}

async function request<T>(
  url: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return OFFLINE;
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    return GARBLED;
  }

  if (!res.ok) {
    return isErrorEnvelope(payload)
      ? { ok: false, code: payload.error.code, message: payload.error.message }
      : { ...GARBLED, code: `http_${res.status}` };
  }

  if (typeof payload !== "object" || payload === null) return GARBLED;
  return { ok: true, status: res.status, data: payload as T };
}

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
