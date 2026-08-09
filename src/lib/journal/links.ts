/**
 * Every URL into the journal surface, in one place.
 *
 * `lib/vocab/links.ts` is the precedent and the reason: the detail route is a
 * URL more than one component builds, and a template literal in the next file is
 * how it drifts. F15 adds the third call site — the duplicate warning links to
 * the line the user already has — which is the point at which a shared function
 * stops being ceremony.
 *
 * No `server-only`: client components import these.
 *
 * **No back-origin token here, and there should not be one.** F11's whitelist
 * exists because a *word* is reachable from four screens; a journal entry is
 * reachable from the journal. `npm run nav:check` asserts that the origin query
 * parameter is built in `lib/vocab/links.ts` and nowhere else under `src/` — as
 * a plain grep for the literal, which is why that literal is not spelled out in
 * this comment either. Adding an origin to the journal means extending that
 * whitelist, not writing a template literal here.
 */

export function journalListHref(): string {
  return "/journal";
}

export function journalEntryHref(id: string): string {
  return `/journal/${id}`;
}
