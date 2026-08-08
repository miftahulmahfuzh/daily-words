/**
 * The browser half of every route handler in the app.
 *
 * **No `server-only` here, and never any.** This is the one file under
 * `lib/api/` that ships to the phone; `guards.ts` and `respond.ts` are its
 * server-side counterparts and must not be imported from it, directly or
 * transitively.
 *
 * Every call returns a result object rather than throwing, because every
 * failure here has a sentence the user must be shown, and a `catch` block three
 * components up cannot know which sentence. `fetch` only rejects on a genuinely
 * dead connection, which is `no_connection`.
 *
 * Callers pass their response **type**, never a zod schema. Importing a schema
 * as a value from a client component pulls the whole of zod into that route's
 * bundle — 73kB in /vocab/new before F3 caught it — to re-check a payload a
 * route handler already produced through the same typed shape. The compiler
 * catches that drift at build time; the phone should not pay to catch it again
 * at runtime. What is checked below is only what the compiler genuinely cannot
 * see: that a body arrived and is an object.
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

/** The `{ error: { code, message } }` shape every route handler returns. */
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

export async function request<T>(
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
