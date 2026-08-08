/**
 * The single source of truth for what the five onboarding questions may hold.
 *
 * Shared by the UI, the zod schemas, the normalizer and the prompt-context
 * builder. Nothing here may be restated anywhere else: a chip list that lives in
 * two files is a chip the server rejects and the client offers.
 *
 * No `server-only` — the onboarding flow and the edit form both import it.
 */

import { DEFAULT_TIMEZONE } from "@/lib/time/local-date";

/**
 * The zone a **read** falls back to when the profile cannot supply one.
 *
 * F7's plan named `'UTC'`. F1 had already shipped `profiles.timezone NOT NULL
 * DEFAULT 'Asia/Jakarta'` and `DEFAULT_TIMEZONE` in `lib/time/local-date`, and
 * F5's `/today` renders against it. Two different fallbacks would show the same
 * user two different "todays", so this is an alias, not a second value — one
 * constant, two names, because F5 and F9 were told to import this one.
 *
 * Writes never use it. `POST /api/cards` refuses with 409 rather than date a
 * card by guesswork; the only writer here is `ensureProfile`, which is creating
 * a row that `<TimezoneCapture />` corrects a moment later.
 */
export const FALLBACK_TIMEZONE = DEFAULT_TIMEZONE;

/** IANA identifiers are well under this. The cap is against a 5 KB "zone". */
export const MAX_TIMEZONE_LEN = 64;

/* --------------------------------- Q1, Q3 ---------------------------------- */

export const MAX_OCCUPATION_LEN = 80;
export const MAX_CONSUMING_LEN = 120;

/* ----------------------------- Q2 — interests ------------------------------ */

/**
 * Twelve, chosen to cover common ground and to fit three rows of chips at
 * 375 px. The stored value is the slug, never the label, so relabelling
 * "Film & TV" in a later version does not orphan a stored answer.
 */
export const INTEREST_CHIPS = [
  { slug: "football", label: "Football" },
  { slug: "music", label: "Music" },
  { slug: "film & tv", label: "Film & TV" },
  { slug: "books", label: "Books" },
  { slug: "games", label: "Games" },
  { slug: "cooking", label: "Cooking" },
  { slug: "travel", label: "Travel" },
  { slug: "tech", label: "Tech" },
  { slug: "science", label: "Science" },
  { slug: "history", label: "History" },
  { slug: "art", label: "Art" },
  { slug: "fitness", label: "Fitness" },
] as const;

/** More than five bloats the prompt without sharpening it. */
export const MAX_INTERESTS = 5;

/** A free-text "other" interest longer than this is a sentence, not an interest. */
export const MAX_INTEREST_LEN = 40;

/* -------------------------- Q4 — english contexts -------------------------- */

export const ENGLISH_CONTEXTS = ["work", "online", "travel", "study", "rarely"] as const;

export type EnglishContext = (typeof ENGLISH_CONTEXTS)[number];

/** Chip labels. What the user taps. */
export const ENGLISH_CONTEXT_LABELS: Record<EnglishContext, string> = {
  work: "Work",
  online: "Online",
  travel: "Travel",
  study: "Study",
  rarely: "Not much yet",
};

/**
 * Prompt labels. What the model reads on the `uses_english:` line.
 *
 * Deliberately different from the chip labels: a comma-joined list of nouns
 * ("Work, Online") reads as a menu, and the phrasing below reads as a fact
 * about a person, which is what the block is for.
 */
export const ENGLISH_CONTEXT_PROMPT_LABELS: Record<EnglishContext, string> = {
  work: "at work",
  online: "online",
  travel: "when travelling",
  study: "studying",
  rarely: "not much yet",
};

/**
 * `rarely` is mutually exclusive with the rest. Enforced in the component for
 * the tap, and in `normalizeProfileAnswers` for the crafted request.
 */
export const EXCLUSIVE_ENGLISH_CONTEXT: EnglishContext = "rarely";

/* ----------------------------- Q5 — chat tone ------------------------------ */

export const CHAT_TONES = ["patient", "blunt", "playful"] as const;

export type ChatTone = (typeof CHAT_TONES)[number];

/** Skipped stays null in the column; this is what the prompt resolves it to. */
export const DEFAULT_CHAT_TONE: ChatTone = "patient";

/** Title and gloss for the three option rows on screen 5. */
export const CHAT_TONE_OPTIONS: { value: ChatTone; label: string; gloss: string }[] = [
  { value: "patient", label: "Patient", gloss: "explains, waits" },
  { value: "blunt", label: "Blunt", gloss: "corrects, no cushioning" },
  { value: "playful", label: "Playful", gloss: "jokes, teases" },
];

/* ---------------------------------- Flow ----------------------------------- */

/** Five is a hard cap from the roadmap's first principle. Not a config value. */
export const ONBOARDING_STEPS = 5;

/**
 * The ceiling on `buildProfileContext().text`.
 *
 * The field caps (80 + 5×40 + 120 + ~40 + ~10) make overflow essentially
 * impossible; the cap is a backstop so a hostile or migrated row can never
 * push a prompt around. The *format* is a contract shared with F6 and F8 — this
 * number is not, and may be raised without touching them.
 */
export const PROFILE_CONTEXT_MAX_CHARS = 600;
