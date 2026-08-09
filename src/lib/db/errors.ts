import "server-only";

/**
 * `UNIQUE (user_id, lower(term))` is caught rather than pre-checked: a pre-check
 * is a race, and two devices adding the same word at once is a real case.
 *
 * Drizzle wraps driver errors, so the Postgres code may be one level down under
 * `cause`. Lifted out of `app/api/vocab/route.ts` when F8's accept route needed
 * the same handling — a second copy of this is a second thing to get wrong.
 */
export function isUniqueViolation(err: unknown): boolean {
  const code = (e: unknown) =>
    typeof e === "object" && e !== null && "code" in e
      ? (e as { code?: unknown }).code
      : undefined;

  if (code(err) === "23505") return true;

  const cause =
    typeof err === "object" && err !== null ? (err as { cause?: unknown }).cause : undefined;
  return code(cause) === "23505";
}
