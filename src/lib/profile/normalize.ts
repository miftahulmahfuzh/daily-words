import {
  CHAT_TONES,
  ENGLISH_CONTEXTS,
  EXCLUSIVE_ENGLISH_CONTEXT,
  MAX_CONSUMING_LEN,
  MAX_INTEREST_LEN,
  MAX_INTERESTS,
  MAX_OCCUPATION_LEN,
  type ChatTone,
  type EnglishContext,
} from "@/lib/profile/constants";

/**
 * The single definition of what a stored answer looks like.
 *
 * Imported by the two write routes and by the client before submit — the same
 * module both times, on the F3 precedent: the client's copy exists to keep the
 * form honest, the server's is the real gate, and a second implementation is a
 * guarantee the two eventually disagree.
 *
 * No `server-only` here: the onboarding flow and the edit form both import it.
 *
 * **Empty string → null. Empty array → null.** `''` and `{}` are never stored,
 * so "the user skipped this" and "the user cleared this" are the same state and
 * `buildProfileContext()` has no third case to handle.
 */

export type ProfileAnswers = {
  occupation: string | null;
  interests: string[] | null;
  currentlyConsuming: string | null;
  englishContexts: EnglishContext[] | null;
  chatTone: ChatTone | null;
};

/** What the routes accept: any subset, `null` meaning "clear this". */
export type ProfileAnswersInput = {
  occupation?: string | null;
  interests?: string[] | null;
  currentlyConsuming?: string | null;
  englishContexts?: string[] | null;
  chatTone?: string | null;
};

const collapse = (raw: string) => raw.replace(/\s+/gu, " ").trim();

/** Trimmed, whitespace-collapsed, capped. Original casing preserved. */
function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const out = collapse(value).slice(0, max);
  return out.length > 0 ? out : null;
}

/**
 * Lowercased, deduped, capped at five.
 *
 * Lowercase because the twelve presets are stored as their own lowercase
 * labels, so an "other" entry of `Football` must collide with the `football`
 * chip rather than sit beside it.
 */
function interests(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const slug = collapse(item).toLowerCase().slice(0, MAX_INTEREST_LEN);
    if (slug.length === 0) continue;
    seen.add(slug);
    if (seen.size >= MAX_INTERESTS) break;
  }
  return seen.size > 0 ? [...seen] : null;
}

/**
 * The five slugs, deduped, with `rarely` dropped when anything else is present.
 *
 * `rarely` loses rather than wins because the positive answers are strictly more
 * informative: "at work and online" tells F6 where to set a scene, and "not much
 * yet" only tells it to slow down.
 */
function englishContexts(value: unknown): EnglishContext[] | null {
  if (!Array.isArray(value)) return null;
  const allowed = new Set<string>(ENGLISH_CONTEXTS);
  const picked = new Set<EnglishContext>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const slug = item.trim().toLowerCase();
    if (allowed.has(slug)) picked.add(slug as EnglishContext);
  }
  if (picked.size > 1) picked.delete(EXCLUSIVE_ENGLISH_CONTEXT);
  return picked.size > 0 ? [...picked] : null;
}

function chatTone(value: unknown): ChatTone | null {
  return typeof value === "string" && (CHAT_TONES as readonly string[]).includes(value)
    ? (value as ChatTone)
    : null;
}

/**
 * Normalise only the keys actually present.
 *
 * The distinction is what makes `PATCH /api/profile` a real partial update: an
 * absent key means "leave it alone", an explicit `null` means "clear it". A
 * normaliser that always returned all five would turn every edit into a full
 * overwrite and silently wipe the fields the form did not send.
 */
export function normalizeProfileAnswers(
  input: ProfileAnswersInput,
): Partial<ProfileAnswers> {
  const out: Partial<ProfileAnswers> = {};
  if ("occupation" in input) out.occupation = text(input.occupation, MAX_OCCUPATION_LEN);
  if ("interests" in input) out.interests = interests(input.interests);
  if ("currentlyConsuming" in input) {
    out.currentlyConsuming = text(input.currentlyConsuming, MAX_CONSUMING_LEN);
  }
  if ("englishContexts" in input) {
    out.englishContexts = englishContexts(input.englishContexts);
  }
  if ("chatTone" in input) out.chatTone = chatTone(input.chatTone);
  return out;
}

/** All five, with anything absent explicitly null. What onboarding writes. */
export function completeProfileAnswers(input: ProfileAnswersInput): ProfileAnswers {
  return {
    occupation: null,
    interests: null,
    currentlyConsuming: null,
    englishContexts: null,
    chatTone: null,
    ...normalizeProfileAnswers({
      occupation: null,
      interests: null,
      currentlyConsuming: null,
      englishContexts: null,
      chatTone: null,
      ...input,
    }),
  };
}
