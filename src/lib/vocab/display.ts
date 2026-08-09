import type {
  AcceptCorrectionResponse,
  EnrichmentErrorCode,
  VocabStatus,
} from "@/lib/vocab/schemas";

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
  // F14 D9. It used to read "I couldn't find that in English.", which left the
  // reading that the word was rejected — it never was. Parallel to
  // `unverified_spelling` below, because the outcome is the same: the word is
  // kept and the app has nothing true to say about it. `retry` stays false for
  // both; retrying a verdict is a loop that cannot end.
  not_english: { message: "Kept as typed. I couldn't find it in English.", retry: false },
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

/* ------------------------- F14 — "you already have this" -------------------- */

/**
 * The five ways the app can tell a user their word is already in the collection.
 *
 * One table rather than four screens' worth of sentences. F14 D10: "You already
 * have genteel." and "You already had genteel." had already drifted into two
 * strings for one situation before this file existed, in two components that
 * could not see each other.
 */
export const EXISTING_WORD_SITUATIONS = [
  /** Exact `lower(term)` match on the add path. */
  "duplicate",
  /** The fold matched. No row was written and the user may overrule it. */
  "near_duplicate",
  /** Accepting a correction found the word already held; the typo is gone. */
  "merged",
  /** [R1] refused the delete, so both spellings survive. */
  "kept_both",
  /** Discover's accept: the term arrived between the suggestion and the tap. */
  "already_existed",
] as const;

export type ExistingWordSituation = (typeof EXISTING_WORD_SITUATIONS)[number];

/**
 * One line, shown verbatim. `term` is always the word the user **already
 * holds**, never what they just typed — for `merged` and `kept_both` those are
 * different words, and naming the wrong one is the whole confusion the notice
 * exists to remove.
 *
 * The mastered variants exist because Gap 1e is invisible otherwise: a word the
 * user has mastered is excluded from every future daily card, so an add that
 * lands on one has produced nothing they will see. The notice says so and offers
 * "Put it back in rotation" (D8).
 */
export function existingWordCopy(input: {
  situation: ExistingWordSituation;
  term: string;
  status: VocabStatus;
}): string {
  const { term, status } = input;
  const mastered = status === "mastered";

  switch (input.situation) {
    case "duplicate":
    case "already_existed":
      return mastered
        ? `${term} — you marked this mastered.`
        : `You already have ${term}.`;

    case "near_duplicate":
      return mastered
        ? `That looks like ${term}, which you marked mastered.`
        : `That looks like ${term}, which you already have.`;

    case "merged":
      return mastered
        ? `You already had ${term}, and you marked it mastered.`
        : `You already had ${term}.`;

    case "kept_both":
      return mastered
        ? `Kept both — the spelling you typed is already on a card. You also have ${term}, marked mastered.`
        : `Kept both — the spelling you typed is already on a card. You also have ${term}.`;
  }
}

/**
 * The sentence a correction outcome leaves behind, for all four outcomes.
 *
 * `renamed` and `noop` never draw the notice — the card simply updates in place
 * — but they are in the table so `vocab:check` can assert the mapping is total.
 * A missing arm here would be a blank card, not a compile error, once the
 * outcome union grows again.
 */
export function correctionCopy(input: {
  outcome: AcceptCorrectionResponse["outcome"];
  term: string;
  status: VocabStatus;
}): string {
  switch (input.outcome) {
    case "renamed":
      return `Now ${input.term}.`;
    case "noop":
      return `Nothing left to change.`;
    case "merged":
    case "kept_both":
      return existingWordCopy({ ...input, situation: input.outcome });
  }
}

/**
 * F14 D4, drawn under the merge sentence. `typo` is the spelling that was
 * deleted, because that is the word the transcript was about.
 */
export function practiceLostNote(typo: string): string {
  return `The practice round on ${typo} went with it.`;
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
