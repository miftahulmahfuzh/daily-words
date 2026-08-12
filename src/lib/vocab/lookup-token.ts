import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { MAX_TERM_CHARS } from "@/lib/vocab/normalize";

/**
 * The signature over a non-English lookup's model output.
 *
 * **Why anything is signed at all.** The lookup is one request and the insert is
 * another, so the entry the model produced has to travel out to the browser and
 * come back. Taken on trust, `POST /api/vocab` would accept any `definition` and
 * `examples` the client cared to send. That is only the caller's own collection
 * — but those four fields are exactly what F17's `buildClaimEnrichment` copies
 * into a *stranger's* collection when a shared word is claimed, so trusting them
 * would put user-authored text on a public page for the first time in the vocab
 * feature. The signature is what keeps "everything under `enrichment_status:
 * ready` was written by the model" true.
 *
 * **The line this draws is worth stating, because it is the whole design:**
 * signed is model output, validated is user input. The resolved English term,
 * the detected language, the fit and the four enrichment fields are signed here
 * and taken as-is on the way back. The origin term and the "as in" sentence are
 * the user's own typing, are re-run through `normalizeTerm` and
 * `normalizeContext` on the way in exactly as they were on the way out, and are
 * deliberately **not** in this payload — signing user input would assert
 * something about it that is not true.
 *
 * **Shape and provenance.** `v1.<base64url(payload)>.<base64url(hmac-sha256)>`,
 * lifted from `lib/share/intent.ts` down to the version prefix and the
 * `exp`-inside-the-signature rule. It is a second codec rather than a third
 * function in that file because `intent.ts` is share-specific, sits beside a
 * `policy.ts` that imports nothing on purpose, and is about a cookie surviving
 * an OAuth hop — none of which is true here.
 *
 * **The one thing not copied is the separator.** `intent.ts` joins fields with
 * `|` and says why that is safe: every field there is charset-bounded, so no
 * value can contain the separator and there is no escaping to get wrong. None of
 * that holds for a definition or an example sentence, which are free text. JSON,
 * therefore — and the parse is inside a `try`, because a payload that survived
 * the HMAC can still be truncated by a proxy.
 *
 * **The secret is a parameter, not an import**, for `intent.ts`'s reason:
 * `lib/env.ts` would drag the whole required-variable schema into
 * `npm run vocab:check`, which runs offline with no `.env` at all.
 */

export type LookupPayload = {
  /** The resolved English word or short phrase. This becomes `term`. */
  term: string;
  /** The model's detection, e.g. "Indonesian". Never asked of the user. */
  language: string;
  /** `loose` drives the "no exact English word" line on the card. */
  fit: "exact" | "loose";
  partOfSpeech: string;
  pronunciation: string;
  definition: string;
  examples: string[];
  /** Unix **seconds**. Enforced here, inside the signature. */
  exp: number;
};

const VERSION = "v1";

/**
 * Ten minutes, not one.
 *
 * The token authorises inserting an entry the caller has already legitimately
 * been shown, into their own collection, where a replay is refused by
 * `vocab_entries_user_term_uniq` anyway. So the TTL is hygiene rather than a
 * control, and the failure it must not cause is real: a user who reads the card,
 * looks away, and comes back to find Add no longer works has lost a model call
 * to a timer that was protecting nothing.
 */
export const LOOKUP_TOKEN_TTL_SECONDS = 600;

/**
 * Comfortably above a full entry — 80 characters of definition, three 120-character
 * examples, 60 of IPA — and far below anything worth hashing by accident.
 */
const MAX_TOKEN_CHARS = 4096;

const b64url = (buf: Buffer) => buf.toString("base64url");

function sign(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(`${VERSION}.${payload}`).digest();
}

/** Constant-time, and length-safe: `timingSafeEqual` throws on a length mismatch. */
function signatureMatches(expected: Buffer, actual: Buffer): boolean {
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * `exp` is stamped here rather than taken from the caller, so no call site can
 * mint a token that outlives the window.
 *
 * `nowSeconds` is injectable for the check script alone — there is no clock in
 * this module's contract, and the expiry assertions would otherwise have to
 * sleep for ten minutes.
 */
export function encodeLookupToken(
  result: Omit<LookupPayload, "exp">,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const payload = b64url(
    Buffer.from(
      JSON.stringify({ ...result, exp: nowSeconds + LOOKUP_TOKEN_TTL_SECONDS }),
      "utf8",
    ),
  );
  return `${VERSION}.${payload}.${b64url(sign(payload, secret))}`;
}

/**
 * Total: every input, including nonsense, yields a payload or `null`.
 *
 * Order matters, and it is `intent.ts`'s order: the cheap structural rejections
 * first, the HMAC second, and the shape checks only after the signature has
 * proven we wrote the value — so a hostile token never reaches `JSON.parse`.
 */
export function decodeLookupToken(
  raw: unknown,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): LookupPayload | null {
  if (typeof raw !== "string") return null;
  if (raw.length === 0 || raw.length > MAX_TOKEN_CHARS) return null;

  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [version, payload, signature] = parts;
  if (version !== VERSION) return null;

  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (!signatureMatches(sign(payload, secret), actual)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  return isLookupPayload(parsed) && parsed.exp > nowSeconds ? parsed : null;
}

/**
 * Runs on a payload the HMAC has already vouched for, so this is not a trust
 * boundary — it is a version guard. A token minted before a field was added
 * survives in a browser tab across a deploy, and the honest answer to one is
 * "look it up again", not a row with `undefined` in its definition.
 */
function isLookupPayload(v: unknown): v is LookupPayload {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.term === "string" &&
    p.term.length > 0 &&
    p.term.length <= MAX_TERM_CHARS &&
    typeof p.language === "string" &&
    (p.fit === "exact" || p.fit === "loose") &&
    typeof p.partOfSpeech === "string" &&
    typeof p.pronunciation === "string" &&
    typeof p.definition === "string" &&
    Array.isArray(p.examples) &&
    p.examples.every((e) => typeof e === "string") &&
    typeof p.exp === "number" &&
    Number.isSafeInteger(p.exp)
  );
}
