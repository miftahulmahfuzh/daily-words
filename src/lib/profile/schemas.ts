import { z } from "zod";
import {
  CHAT_TONES,
  ENGLISH_CONTEXTS,
  MAX_CONSUMING_LEN,
  MAX_INTEREST_LEN,
  MAX_INTERESTS,
  MAX_OCCUPATION_LEN,
  MAX_TIMEZONE_LEN,
} from "@/lib/profile/constants";
import { isValidTimeZone } from "@/lib/profile/timezone";

/**
 * Request and response shapes for F7's three routes, in one file so the two
 * halves of each contract cannot drift.
 *
 * `z.uuid()` / `z.enum()` in their zod-4 spellings — ROADMAP [R2].
 *
 * As in F3/F4/F5, the browser imports only the inferred **types**, which erase
 * at compile time. A value import of any schema below from a client component
 * drags the whole of zod into that route's bundle.
 */

/* -------------------------- POST /api/profile/timezone ---------------------- */

const timezoneString = z
  .string()
  .min(1)
  .max(MAX_TIMEZONE_LEN)
  .refine(isValidTimeZone, { message: "Not a valid time zone." });

/**
 * `timezone` is optional so the fallback chain has something to do.
 *
 * Present and bogus is a **400** — the client is claiming to know a zone and is
 * wrong, and silently substituting something else would hide a real bug. Absent
 * is fine and falls through to `x-vercel-ip-timezone`, then the stored value,
 * then `FALLBACK_TIMEZONE`. Both client callers ignore the response either way.
 */
export const setTimezoneSchema = z
  .object({
    timezone: timezoneString.optional(),
    /** True only from /profile/edit. What makes the override stick. */
    manual: z.boolean().optional().default(false),
  })
  .strict();

export type SetTimezoneRequest = z.input<typeof setTimezoneSchema>;

export type SetTimezoneResponse = {
  timezone: string;
  source: "detected" | "manual";
  /** False when a `manual` row refused an automatic sync, or nothing changed. */
  updated: boolean;
};

/* ------------------------------ The five answers ---------------------------- */

/**
 * Every field optional, and every field nullable. Omitted and `null` mean
 * different things to `PATCH` (leave alone vs clear) and the same thing to
 * `complete` (skipped).
 *
 * The caps here are backstops behind the inputs' own `maxLength`; the real
 * shaping — trim, collapse, lowercase, dedupe, the `rarely` rule — is
 * `normalizeProfileAnswers()`, which both routes run after parsing. zod
 * validates structure; the normaliser decides content.
 */
export const profileAnswersSchema = z
  .object({
    occupation: z.string().max(MAX_OCCUPATION_LEN * 2).nullable().optional(),
    interests: z
      .array(z.string().max(MAX_INTEREST_LEN * 2))
      // Generous: the normaliser dedupes and slices to MAX_INTERESTS, so a
      // client that double-sent a chip should be tidied up, not rejected.
      .max(MAX_INTERESTS * 4)
      .nullable()
      .optional(),
    currentlyConsuming: z.string().max(MAX_CONSUMING_LEN * 2).nullable().optional(),
    englishContexts: z
      .array(z.enum(ENGLISH_CONTEXTS))
      .max(ENGLISH_CONTEXTS.length)
      .nullable()
      .optional(),
    chatTone: z.enum(CHAT_TONES).nullable().optional(),
  })
  .strict();

export type ProfileAnswersRequest = z.infer<typeof profileAnswersSchema>;

/* -------------------------- POST /api/profile/complete ---------------------- */

/**
 * `timezone` is belt-and-braces: `<TimezoneCapture />` normally got there first,
 * but a POST that failed silently during onboarding gets a second chance here.
 */
export const completeOnboardingSchema = profileAnswersSchema.extend({
  timezone: timezoneString.optional(),
});

export type CompleteOnboardingRequest = z.infer<typeof completeOnboardingSchema>;

export type CompleteOnboardingResponse = {
  /** ISO instant. Preserved across a double-submit, never moved. */
  onboardedAt: string;
  alreadyOnboarded: boolean;
  /**
   * Where the flow should land — **always one of a closed set of literals the
   * server chose**, never a path the client or a cookie supplied (F18 D13).
   *
   * `/today` unless the user arrived from a shared journal entry and tapped
   * "Start your own journal", in which case `/journal`. The `dw_next` cookie
   * that carries that fact holds one symbol, is signed, and is mapped through a
   * literal `switch` in `nextDestinationHref`; nothing here is concatenated and
   * no path is ever read out of it. That is the whole difference between this
   * and the `?next=` parameter F17 D2 rejected as an open redirect in a
   * feature's clothing.
   */
  next: string;
};

/* ------------------------------ PATCH /api/profile -------------------------- */

export const patchProfileSchema = profileAnswersSchema;

/** The row as the edit form sees it. Internal columns are not exposed. */
export type ProfileResponse = {
  timezone: string;
  timezoneSource: "detected" | "manual";
  occupation: string | null;
  interests: string[] | null;
  currentlyConsuming: string | null;
  englishContexts: string[] | null;
  chatTone: "patient" | "blunt" | "playful" | null;
  onboardedAt: string | null;
};
