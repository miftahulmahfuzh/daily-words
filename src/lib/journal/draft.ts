import { JOURNAL_DRAFT_KEY } from "@/lib/journal/limits";

/**
 * Where an in-progress paste lives between mounts, and the only file that names
 * the key.
 *
 * F10 put this inline in `Composer`, which was right while the composer was the
 * first thing on the screen and mounted on every visit. [R23] put it behind a
 * pill, and that introduced a failure with no symptom: a composer that only
 * mounts on a tap never runs the restore, so a paste that survived an iOS tab
 * discard sits in `sessionStorage` behind a button the user has no reason to
 * press. `JournalFeed` therefore asks `hasDraft()` on mount and opens the
 * composer if the answer is yes — which puts the key in two files, and this
 * module is what stops the two from keeping different try/catch disciplines.
 *
 * **Every function here swallows its own failure.** Private mode throws on
 * `sessionStorage` access, a full quota throws on write, and a corrupt value
 * throws on parse. None of that is worth a word to the user: the draft is a
 * convenience, and the fields are in a state they can act on either way.
 *
 * `sessionStorage`, not `localStorage`: a draft is the state of one visit to one
 * tab. It must survive a switch to the Kindle app and back; it should not still
 * be sitting there a week later.
 */

export type JournalDraft = { text: string; sourceNote: string };

/**
 * The draft, or null. Never throws, and never returns a half-read draft —
 * anything that is not two strings is treated as absent.
 */
export function readDraft(): JournalDraft | null {
  try {
    const raw = sessionStorage.getItem(JOURNAL_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { text?: unknown; sourceNote?: unknown };
    const text = typeof parsed.text === "string" ? parsed.text : "";
    const sourceNote = typeof parsed.sourceNote === "string" ? parsed.sourceNote : "";
    // A draft with no text is nothing to restore: the source note alone cannot
    // be saved, and opening the composer for it would be a tap the user did not
    // ask for on every visit until they cleared it.
    if (!text) return null;
    return { text, sourceNote };
  } catch {
    return null;
  }
}

/**
 * Whether the composer should open itself on mount.
 *
 * Deliberately `readDraft() !== null` rather than a cheaper `getItem` check:
 * "there is a key" and "there is something to restore" differ for an empty
 * draft, and the feed must not open a composer the composer would then fill
 * with nothing.
 */
export function hasDraft(): boolean {
  return readDraft() !== null;
}

/** Writes, or clears when both fields are empty. Never throws. */
export function writeDraft(draft: JournalDraft): void {
  try {
    if (!draft.text && !draft.sourceNote) sessionStorage.removeItem(JOURNAL_DRAFT_KEY);
    else sessionStorage.setItem(JOURNAL_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* Private mode, or a full quota. The draft is a convenience. */
  }
}

/** Never throws. */
export function clearDraft(): void {
  try {
    sessionStorage.removeItem(JOURNAL_DRAFT_KEY);
  } catch {
    /* see above */
  }
}
