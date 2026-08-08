import 'server-only'
import type { z } from 'zod'

export type ApiError = { error: { code: string; message: string } }

export function ok<T>(data: T, status = 200): Response {
  return Response.json(data as object, { status })
}

export function fail(status: number, message: string, code = 'bad_request'): Response {
  return Response.json({ error: { code, message } } satisfies ApiError, { status })
}

/** Parse + validate a JSON body. Returns a ready-made 400 on failure. */
export async function readJson<T>(
  req: Request,
  schema: z.ZodType<T>,
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return { ok: false, response: fail(400, 'Body must be JSON', 'invalid_json') }
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return {
      ok: false,
      response: fail(
        400,
        parsed.error.issues[0]?.message ?? 'Invalid request',
        'invalid_body',
      ),
    }
  }
  return { ok: true, data: parsed.data }
}
