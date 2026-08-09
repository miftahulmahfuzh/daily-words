"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ListRow } from "@/components/ui/list-row";
import { Eyebrow, Prose } from "@/components/ui/text";
import { ExistingWordNotice } from "@/components/vocab/existing-word-notice";
import { SuggestionCard } from "@/components/vocab/suggestion-card";
import { acceptSuggestion, enrichEntry, suggestWords } from "@/lib/vocab/client";
import { vocabDetailHref } from "@/lib/vocab/links";
import type { AcceptSuggestionResponse, Suggestion } from "@/lib/vocab/schemas";

/**
 * The whole of the Discover tab's behaviour.
 *
 * The shape is F8 §9 Decision 3: one call returns five candidates, the queue
 * lives in this component, and "Another" is a `shift()` rather than a request.
 * That is not an optimisation. Accept/reject only works if declining is
 * instant — if every decline cost two seconds, the user would start keeping
 * words to avoid the wait, and ten idle keeps put ten unwanted words in a
 * six-word daily card. A slow reject button silently converts an accept/reject
 * UI back into the auto-add UI Decision 1 exists to prevent.
 *
 * Accepting does **not** navigate. F8 §10 D specified `router.push('/vocab/id')`;
 * the design ([R18], the visual source of truth) keeps the user here and lands
 * the word in a "Kept from Discover" list below, and it is right — a Discover
 * sitting is several words long, and leaving the screen after each one throws
 * the queue away that Decision 3 paid for.
 */

export type KeptWord = {
  id: string;
  term: string;
  definition: string | null;
  enrichmentStatus: "pending" | "ready" | "failed";
};

/**
 * Four batches — twenty words — is more than anyone considers in one sitting.
 * A nudge rather than a wall: reloading clears it, and there is no countdown
 * and no explanation of quota, because neither is the user's problem.
 */
const MAX_SESSION_CALLS = 4;

/** Every row of the kept list has a second line, so no row can collapse. */
function keptGloss(word: KeptWord): string {
  if (word.definition) return word.definition;
  return word.enrichmentStatus === "pending" ? "Preparing…" : "No definition";
}

type Blocked = { label: string; note: string } | null;

/** The accepted word turned out to be one the user already held (F14 Gap 4). */
type Existing = Pick<AcceptSuggestionResponse, "id" | "term" | "status">;

export function DiscoverPanel({
  initialKept,
  initialSuggestion = null,
}: {
  initialKept: KeptWord[];
  /**
   * Seeds the proposal state. **Only `/kitchen-sink/discover` passes it** — the
   * real tab always starts at rest, because principle 5 says the user nudges.
   * It exists so the proposal layout can be reviewed at 375px in both colour
   * schemes without a session, a database and a model call, which makes the
   * fixture the component under test rather than a mock-up of it.
   */
  initialSuggestion?: Suggestion | null;
}) {
  const [queue, setQueue] = useState<Suggestion[]>([]);
  const [current, setCurrent] = useState<Suggestion | null>(initialSuggestion);
  /** Declined this session. Sent as `exclude`; lost on reload, by design. */
  const [rejected, setRejected] = useState<string[]>([]);
  const [kept, setKept] = useState<KeptWord[]>(initialKept);
  const [calls, setCalls] = useState(0);
  const [busy, setBusy] = useState<"picking" | "keeping" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [blocked, setBlocked] = useState<Blocked>(null);
  const [existing, setExisting] = useState<Existing | null>(null);

  async function advance(declined?: string) {
    if (busy || blocked) return;

    const exclude = declined ? [declined, ...rejected] : rejected;
    if (declined) setRejected(exclude);
    setError(null);
    setExisting(null);

    // The instant path: four taps in five never touch the network.
    const [next, ...rest] = queue;
    if (next) {
      setQueue(rest);
      setCurrent(next);
      return;
    }

    if (calls >= MAX_SESSION_CALLS) {
      setCurrent(null);
      setBlocked({
        label: "That's plenty for one sitting.",
        note: "Reload the page if you want more.",
      });
      return;
    }

    setBusy("picking");
    setCurrent(null);
    const result = await suggestWords(exclude.slice(0, 50));
    setBusy(null);
    setCalls((n) => n + 1);

    if (!result.ok) {
      if (result.code === "unauthenticated") {
        setSignedOut(true);
        return;
      }
      if (result.code === "rate_limited") {
        setBlocked({ label: result.message, note: "Try again later." });
        return;
      }
      setError(
        result.code === "no_connection" ? "No connection." : "Could not fetch a word. Try again.",
      );
      return;
    }

    const [first, ...queued] = result.data.suggestions;
    if (!first) {
      setError("Nothing new came back. Try again in a moment.");
      return;
    }

    setCurrent(first);
    setQueue(queued);
  }

  async function keep() {
    if (!current || busy) return;

    setBusy("keeping");
    setError(null);
    setExisting(null);
    const accepted = await acceptSuggestion(current.term);

    if (!accepted.ok) {
      setBusy(null);
      if (accepted.code === "unauthenticated") {
        setSignedOut(true);
        return;
      }
      // F3 judged it not a word: drop the candidate silently and show the next
      // one. The user never learns the model proposed a non-word.
      if (accepted.code === "bad_term") {
        void advance(current.term);
        return;
      }
      setError(
        accepted.code === "no_connection"
          ? "No connection."
          : "Could not save that one. Try again.",
      );
      return;
    }

    /**
     * F14 Gap 4. The route has always returned `alreadyExisted` and nothing
     * read it: the panel pushed the word onto the "Kept" strip as though it
     * were new, and then fired `enrichEntry` on it — which, for a row already
     * `failed`, burns one of the three attempts `MAX_ENRICHMENT_ATTEMPTS`
     * allows. If the pre-existing row was `mastered`, the strip claimed a keep
     * that no card will ever show.
     *
     * So: show the word the user already has, offer the way back into rotation,
     * and **make no enrichment call**. The route's own logic is unchanged —
     * F14 D7 keeps its re-check exact-only, because the fold has already run
     * against the whole collection in `lib/vocab/suggest.ts` and a collision
     * here can only be a race, which is an exact match.
     */
    if (accepted.data.alreadyExisted) {
      // The strip is left exactly as it was. If the word is already on it, it
      // belongs there — it was kept from Discover once — and removing it to
      // make room for the notice would delete a true row to explain a true fact.
      setExisting({
        id: accepted.data.id,
        term: accepted.data.term,
        status: accepted.data.status,
      });
      setCurrent(null);
      setBusy(null);
      return;
    }

    const word: KeptWord = {
      id: accepted.data.id,
      term: accepted.data.term,
      definition: null,
      enrichmentStatus: accepted.data.enrichmentStatus,
    };

    // The word is durable now. Everything below is decoration on a row that
    // already links somewhere real.
    setKept((prev) => [word, ...prev.filter((w) => w.id !== word.id)]);
    setCurrent(null);
    setBusy(null);

    // F3's single enrichment entry point for the whole app. The preview gloss
    // the user just read is thrown away here and the definition that arrives is
    // F3's — which is why the two are worded differently.
    const enriched = await enrichEntry(word.id);
    if (!enriched.ok) return;

    setKept((prev) =>
      prev.map((w) =>
        w.id === word.id
          ? {
              ...w,
              term: enriched.data.term,
              definition: enriched.data.definition,
              enrichmentStatus: enriched.data.enrichmentStatus,
            }
          : w,
      ),
    );
  }

  const picking = busy === "picking";
  const keeping = busy === "keeping";

  return (
    <>
      <Button
        variant="filled"
        onClick={() => advance()}
        loading={picking}
        disabled={Boolean(blocked) || signedOut || keeping}
      >
        {blocked ? blocked.label : picking ? "Thinking…" : "Pick a new word for me"}
      </Button>

      {/* Dismissed by the next "Pick a new word for me" or "Another", the same
          way the add form's notice is dismissed by typing. */}
      {existing && (
        <ExistingWordNotice
          id={existing.id}
          term={existing.term}
          status={existing.status}
          situation="already_existed"
          origin="discover"
        />
      )}

      {current ? (
        <div className="flex flex-col gap-3">
          <SuggestionCard suggestion={current} />
          {error && <Prose size="sm" tone="faint">{error}</Prose>}
          <div className="flex gap-2.5">
            {/* Opposite actions, side by side, both at the 44px touch floor and
                10px apart — a mis-tap here keeps a word the user rejected. */}
            <Button
              variant="filled"
              size="sm"
              fullWidth={false}
              className="flex-1"
              onClick={keep}
              loading={keeping}
            >
              Keep
            </Button>
            <Button
              size="sm"
              fullWidth={false}
              className="flex-1"
              onClick={() => advance(current.term)}
              disabled={keeping}
            >
              Another
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {signedOut ? (
            <Prose size="base" tone="faint">
              Sign in again. <Link href="/signin" className="text-ink underline">Sign in</Link>
            </Prose>
          ) : (
            <Prose size="base" tone="faint" className="max-w-[250px]">
              {error ?? blocked?.note ?? "Nothing here until you ask. The app does not choose for you."}
            </Prose>
          )}
        </div>
      )}

      {kept.length > 0 && (
        <div className="flex flex-col gap-2.5 pt-1.5">
          <Eyebrow size="sm">Kept from Discover</Eyebrow>
          <div className="flex flex-col">
            {kept.map((word, i) => (
              <ListRow
                key={word.id}
                href={vocabDetailHref(word.id, "discover")}
                title={word.term}
                subtitle={keptGloss(word)}
                divider={i < kept.length - 1}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
