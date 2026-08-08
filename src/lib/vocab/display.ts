import type { EnrichmentErrorCode } from "@/lib/vocab/schemas";

/**
 * The user-visible half of `enrichment_error`.
 *
 * The column stores a machine code precisely so this table can exist: a network
 * timeout and "that is not an English word" are both `enrichment_status =
 * 'failed'`, and offering "Try again" for the second one would send the user
 * round a loop that cannot end. Shared by /vocab/new and by F4's detail page so
 * one word never gets two different explanations of the same state.
 *
 * Client-safe. Imported by client components.
 */

export type EnrichmentCopy = {
  /** One line, shown verbatim. */
  message: string;
  /** Whether the retry affordance is offered at all. */
  retry: boolean;
};

export const ENRICHMENT_COPY: Record<EnrichmentErrorCode, EnrichmentCopy> = {
  llm_timeout: { message: "Took too long. Try again.", retry: true },
  llm_unreachable: { message: "Couldn't reach the dictionary. Try again.", retry: true },
  llm_rate_limited: { message: "Busy right now. Try again in a minute.", retry: true },
  bad_response: { message: "Got a garbled answer. Try again.", retry: true },
  not_english: { message: "I couldn't find that in English.", retry: false },
  unverified_spelling: {
    message: "Kept as typed. Not in the dictionary, so there's no definition.",
    retry: false,
  },
};

const UNKNOWN: EnrichmentCopy = { message: "Couldn't fetch this one.", retry: true };

export function enrichmentCopy(code: string | null | undefined): EnrichmentCopy {
  if (!code) return UNKNOWN;
  return ENRICHMENT_COPY[code as EnrichmentErrorCode] ?? UNKNOWN;
}

/** Attempts are capped at three; past that the retry button stops offering itself. */
export const RETRY_EXHAUSTED_MESSAGE = "Tried three times. Delete it and add it again.";

/** §8.5 — long enough that a live request is never mistaken for a dead one. */
const STALE_PENDING_MS = 2 * 60 * 1000;

/**
 * A `pending` row older than two minutes is displayed as failed.
 *
 * The user closed the app mid-enrichment and the request died with the page.
 * Nothing on the server knows that — there is no sweeper and there must not be
 * one ([R1]'s neighbour: the roadmap forbids scheduled work) — so the recovery
 * is a visible button, and this is the rule that decides to draw it. A display
 * rule only: the column is left alone.
 */
export function isStalePending(
  enrichmentStatus: string,
  createdAt: Date | string,
  now: number = Date.now(),
): boolean {
  if (enrichmentStatus !== "pending") return false;
  const started = createdAt instanceof Date ? createdAt : new Date(createdAt);
  return now - started.getTime() > STALE_PENDING_MS;
}
