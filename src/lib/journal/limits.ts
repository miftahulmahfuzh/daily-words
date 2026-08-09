/**
 * The journal's numbers, in one zod-free module.
 *
 * The composer and the entry page need these at runtime, and they are client
 * components. Importing them from `schemas.ts` would be a **value** import of a
 * module whose first line is `import { z } from "zod"`, which puts the whole of
 * zod in the bundle — 73kB the last time this project made that mistake, in
 * `/vocab/new`. `schemas.ts` imports from here; nothing imports schemas for a
 * number.
 */

export const JOURNAL_TEXT_MIN = 2;

/**
 * ~150–170 English words: a long Kindle highlight or a full paragraph fits, a
 * chapter does not. It is also what bounds the insight prompt's input cost,
 * which matters on a free tier.
 */
export const JOURNAL_TEXT_MAX = 1000;
export const JOURNAL_SOURCE_NOTE_MAX = 200;
export const JOURNAL_PAGE_SIZE = 30;

/** Below this the counter is not drawn at all. A saying needs no character count. */
export const JOURNAL_COUNTER_FROM = 800;

/**
 * How long a `pending` insight is believed before the next tap may re-claim it.
 *
 * Serverless functions die mid-call — a deploy, a cold-start kill, a timeout.
 * Without this window an entry stuck at `pending` would be permanently
 * unretryable and the user's only recourse would be deleting the line and
 * pasting it again. There is no sweeper: the roadmap forbids scheduled jobs, so
 * recovery is the next tap.
 */
export const INSIGHT_STALE_MS = 120_000;

/**
 * The two messages the client and the server must agree on word for word.
 *
 * The client disables Save and the server rejects the request, and both say the
 * same sentence — a message the client invents is a message that can disagree
 * with what actually happened.
 */
export const TOO_LONG_MESSAGE = `Too long — trim to ${JOURNAL_TEXT_MAX} characters.`;
export const SOURCE_NOTE_TOO_LONG_MESSAGE = `Source note is too long — ${JOURNAL_SOURCE_NOTE_MAX} characters maximum.`;

/**
 * Where an in-progress paste lives between mounts.
 *
 * `sessionStorage`, not `localStorage`: a draft is the state of one visit to one
 * tab. iOS Safari discards backgrounded tabs aggressively, and a paste must
 * survive a switch to the Kindle app and back — but it should not still be
 * sitting there a week later.
 */
export const JOURNAL_DRAFT_KEY = "journal:draft";
