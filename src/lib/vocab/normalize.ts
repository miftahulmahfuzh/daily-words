/**
 * The single definition of what a term is.
 *
 * Imported by the client form, both API routes, and (per F3 §10) F8's dedup.
 * There is deliberately no second copy of these rules anywhere: the client's
 * check exists to give an instant message, the server's is the real gate, and
 * if the two ever disagree the user gets a message that does not match what
 * happened.
 *
 * No `server-only` here — this module is imported by a client component.
 */

/** Matches the input's `maxLength` and the `TERM_PATTERN` length below. */
export const MAX_TERM_CHARS = 80;

/** More than this is a sentence, not a term. */
export const MAX_TERM_WORDS = 6;

/**
 * Latin letters, combining marks, apostrophe, hyphen, full stop, space.
 * First character must be a letter.
 *
 * This is also the first of F3's four prompt-injection layers (§11 E26): no
 * newline, no colon, no angle bracket can reach the `<term>` tags, so the term
 * cannot close them or issue an instruction. It is a cheap, offline rejection
 * that costs no LLM quota.
 *
 * Diacritics are inside the class, so `naïve` and `café` pass.
 */
export const TERM_PATTERN = /^\p{Script=Latin}[\p{Script=Latin}\p{M}'\-. ]{0,79}$/u;

export type TermErrorCode =
  | "empty_term"
  | "too_many_words"
  | "term_too_long"
  | "unsupported_characters";

export type TermValidation =
  | { ok: true }
  | { ok: false; code: TermErrorCode; message: string };

/** One line each, shown to the user verbatim. F3 §6.1. */
const TERM_MESSAGES: Record<TermErrorCode, string> = {
  empty_term: "Type a word.",
  too_many_words: "That's a sentence. Add a word or a short phrase.",
  term_too_long: "Too long.",
  unsupported_characters: "Letters only.",
};

/** Ends only — an interior apostrophe or hyphen is part of the word. */
const EDGE_PUNCTUATION = "[,;:!?\"'‘’“”()\\[\\]]";
const LEADING = new RegExp(`^(?:${EDGE_PUNCTUATION}|\\.)+`);
const TRAILING = new RegExp(`(?:${EDGE_PUNCTUATION})+$`);

/**
 * Trim, collapse, straighten, and strip the punctuation a paste drags along.
 * Case is preserved: the user's spelling is stored as typed and deduped
 * case-insensitively by the `lower(term)` unique index.
 */
export function normalizeTerm(raw: string): string {
  const straightened = raw
    .normalize("NFC")
    // Curly quotes and dashes arrive from every ebook reader on earth. Left as
    // typed they would fail TERM_PATTERN and the user would be told "Letters
    // only." about a word that is entirely letters.
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/\s+/gu, " ")
    .trim();

  if (!straightened) return "";

  let stripped = straightened.replace(LEADING, "").replace(TRAILING, "");

  // A trailing full stop is stripped only when it is the term's only one, so
  // `genteel.` loses it and `i.e.` keeps it. Abbreviations are English (§7.1)
  // and turning one into `i.e` would send a different word to the model.
  if (stripped.endsWith(".") && stripped.indexOf(".") === stripped.length - 1) {
    stripped = stripped.slice(0, -1);
  }

  // A term that is nothing but punctuation strips to empty. Keep the original
  // so the user is told "Letters only." rather than "Type a word."
  return stripped.trim() || straightened;
}

/** Word count for the six-word cap. `half-hearted` is one word. */
export function countWords(term: string): number {
  return term.split(" ").filter(Boolean).length;
}

/**
 * Run this on the normalized term, never on the raw input.
 *
 * Order matters: the word count is checked before the pattern so a pasted
 * sentence is told it is a sentence rather than told it contains an
 * unsupported character, which is true but useless.
 */
export function validateTerm(term: string): TermValidation {
  const fail = (code: TermErrorCode): TermValidation => ({
    ok: false,
    code,
    message: TERM_MESSAGES[code],
  });

  if (!term) return fail("empty_term");
  if (countWords(term) > MAX_TERM_WORDS) return fail("too_many_words");
  if (term.length > MAX_TERM_CHARS) return fail("term_too_long");
  if (!TERM_PATTERN.test(term)) return fail("unsupported_characters");
  return { ok: true };
}
