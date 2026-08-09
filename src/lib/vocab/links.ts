/**
 * Every URL into the vocab surface, in one place.
 *
 * F4 contract — F5's daily-card rows, F6's chat page and F8's Discover results
 * all link through these. Do not hand-build `/vocab/${id}` anywhere else: the
 * detail route is the one URL four features share, and a template literal in a
 * fifth file is how it drifts.
 *
 * F11 extends the contract with an *origin*: where the user was when they
 * opened a word, so the detail page's back link can name it. The origin travels
 * as `?from=<token>` and is resolved server-side against the closed whitelist
 * below — there is no code path that builds an href out of the query value, so
 * an open redirect is not mitigated here, it is structurally impossible.
 *
 * No `server-only` — client components import these too.
 */

export type VocabTab = "mine" | "discover";

/** `?tab=`, not a `/vocab/discover` segment: [R17] and F4 §7.1. */
export function vocabListHref(params?: { tab?: VocabTab; q?: string }): string {
  const search = new URLSearchParams();
  if (params?.tab === "discover") search.set("tab", "discover");
  if (params?.q) search.set("q", params.q);
  const qs = search.toString();
  return qs ? `/vocab?${qs}` : "/vocab";
}

/* --------------------------------- F11 ------------------------------------- */

/** Where the user was when they opened a word. A closed set. */
export type WordOrigin = "today" | "collection" | "discover" | "new";

/** What a back affordance needs: somewhere to go, and what to call it. */
export type BackTarget = { href: string; label: string };

/**
 * The whitelist. The only place a `?from=` token becomes a URL.
 *
 * `label` is user-visible copy and must name the destination — `BackLink`
 * uppercases it, so keep it title case and short.
 *
 * `discover` is written through `vocabListHref` rather than as the literal
 * `/vocab?tab=discover` so the two cannot drift; `check-nav.ts` asserts it.
 * The Discover tab is a distinct origin from the collection because it is a
 * distinct screen — returning a Discover user to Mine throws away the "Kept
 * from Discover" strip they were building (F11 D5).
 *
 * Exported only so `check-nav.ts` can assert the record is closed and total.
 * Read it through `backTarget()`; never index it with a value off the wire.
 */
export const BACK_TARGETS: Record<WordOrigin, BackTarget> = {
  today: { href: "/today", label: "Today" },
  collection: { href: vocabListHref(), label: "Collection" },
  discover: { href: vocabListHref({ tab: "discover" }), label: "Discover" },
  new: { href: "/vocab/new", label: "Add a word" },
};

/** No origin, and every origin we do not recognise, mean the same thing. */
export const DEFAULT_ORIGIN: WordOrigin = "collection";

/** True for the four tokens and nothing else. */
export function isWordOrigin(value: unknown): value is WordOrigin {
  // `Object.hasOwn`, not `value in BACK_TARGETS` and not `BACK_TARGETS[value]`:
  // `"toString"` and `"constructor"` are truthy on any object literal and would
  // otherwise pass for origins.
  return typeof value === "string" && Object.hasOwn(BACK_TARGETS, value);
}

/**
 * A `?from=` value from the wire, narrowed or discarded.
 *
 * Takes what Next hands a page: `string | string[] | undefined`.
 *
 * **Measured on Next 15.5.23, 2026-08-09.** F11 D2 asserted that a repeated
 * param "arrives as an array and is discarded rather than sampled — one `from`
 * or none". That is false here: `?from=today&from=discover` reaches the page as
 * the string `"today"`, first occurrence wins, and `?from=discover&from=today`
 * renders Discover. `useSearchParams().get()` behaves the same way. So the
 * array branch below is unreachable from both current callers.
 *
 * It stays, for two reasons: it is the correct handling *if* an array ever does
 * arrive (a different Next version, a different caller), and the alternative —
 * reading the raw query string to reject a duplicated key — would buy nothing.
 * Sampling is harmless here precisely because the sampled value still has to be
 * a union member: whichever occurrence Next picks, the answer is one of four
 * legitimate origins or the Collection. A repeated param cannot smuggle
 * anything past the whitelist, it can only pick between two safe answers.
 */
export function parseOrigin(
  value: string | string[] | undefined,
): WordOrigin | null {
  return isWordOrigin(value) ? value : null;
}

/**
 * The resolver. Total: every input, including `null`, yields a real target.
 * Returns a fresh object so a caller cannot mutate the whitelist.
 */
export function backTarget(origin: WordOrigin | null | undefined): BackTarget {
  return { ...BACK_TARGETS[origin ?? DEFAULT_ORIGIN] };
}

/**
 * `/vocab/{id}` — plus `?from={origin}` when, and only when, an origin is
 * given. The no-origin form is byte-identical to what it returned before F11,
 * so every shared, pasted and bookmarked URL keeps working and stays clean.
 *
 * `origin` is typed as the union, never `string`: user input cannot reach it
 * without a cast.
 */
export function vocabDetailHref(id: string, origin?: WordOrigin | null): string {
  return origin ? `/vocab/${id}?from=${origin}` : `/vocab/${id}`;
}

/**
 * `/vocab/{id}/chat` — carries the *word's* origin one hop further, so
 * Today → word → chat → back → back lands on Today.
 *
 * The chat is deliberately not itself an origin: `/vocab/[id]/chat` reaching
 * `/vocab/[id]` is always a backward hop, and naming it would make back a
 * two-node cycle with no exit (F11 D6).
 */
export function vocabChatHref(id: string, origin?: WordOrigin | null): string {
  return origin ? `/vocab/${id}/chat?from=${origin}` : `/vocab/${id}/chat`;
}
