"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Pill } from "@/components/ui/pill";
import { TextInput } from "@/components/ui/text-input";
import { Eyebrow, Meta } from "@/components/ui/text";
import { Chip } from "@/components/profile/chip-select";
import { EnrichmentCard } from "@/components/vocab/enrichment-card";
import { ExistingWordNotice } from "@/components/vocab/existing-word-notice";
import {
  LookupResultCard,
  type LookupResult,
} from "@/components/vocab/lookup-result-card";
import {
  attachOriginToEntry,
  createEntry,
  createEntryFromLookup,
  enrichEntry,
  lookupTerm,
} from "@/lib/vocab/client";
import { enrichmentCopy } from "@/lib/vocab/display";
import {
  MAX_CONTEXT_CHARS,
  MAX_TERM_CHARS,
  normalizeTerm,
  validateContext,
  validateTerm,
} from "@/lib/vocab/normalize";
import type { CreateVocabResponse, EnrichResponse } from "@/lib/vocab/schemas";
import { vocabDetailHref } from "@/lib/vocab/links";

export type RecentWord = { id: string; term: string };

/**
 * A word the add did not create. `term` is the row the user already holds;
 * `typed` is what they just typed, and for a near duplicate the two differ —
 * which is exactly what the notice has to be able to say.
 */
type Existing = {
  id: string;
  term: string;
  status: CreateVocabResponse["status"];
  situation: "duplicate" | "near_duplicate";
  typed: string;
};

/**
 * The whole of `/vocab/new`: one field, one button, and the word landing.
 *
 * Two requests, not one (F3 §9 D1). `POST /api/vocab` is auth + validate +
 * INSERT and returns in well under half a second; the model call is a second
 * request the client fires immediately and watches. From the user's side it is
 * one flow with a spinner that fills in — but a dropped connection during the
 * second leaves a saved word and a retry button rather than a 504 nobody can
 * interpret. Nothing the user does on this screen can lose what they typed.
 */
export function AddWordForm({ recent }: { recent: RecentWord[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  /** Bumped on every new save; a reply for an older ticket is discarded. */
  const ticket = useRef(0);

  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<Existing | null>(null);
  const [entry, setEntry] = useState<EnrichResponse | null>(null);
  const [saving, setSaving] = useState(false);
  /** The "Add … anyway" round trip, so it spins and the Add button does not. */
  const [forcing, setForcing] = useState(false);
  const [justAdded, setJustAdded] = useState<RecentWord[]>(recent);

  /**
   * The non-English half. `mode` is the toggle; `context` is the "as in"
   * sentence; `resolved` is a model answer that has not been written yet.
   *
   * `resolved` is the one piece of state on this screen that is **not** a row —
   * every other branch here describes something the database already holds. That
   * is why it has its own card rather than a mode on `EnrichmentCard`, and why
   * `Not that word` can simply drop it.
   */
  const [mode, setMode] = useState<"english" | "foreign">("english");
  const [context, setContext] = useState("");
  const [resolved, setResolved] = useState<(LookupResult & { lookup: string }) | null>(
    null,
  );
  const [lookingUp, setLookingUp] = useState(false);
  /** The "Add melumuri to it" round trip on the collision path. */
  const [attaching, setAttaching] = useState(false);

  const busy = saving || forcing || lookingUp || attaching;

  function onChange(next: string) {
    setValue(next);
    // The notice is dismissed by typing. It is about a word the user has
    // stopped typing, and leaving it up makes the next word look rejected.
    if (existing) setExisting(null);
    if (error) setError(null);
    /* And the resolution goes with it. It describes the *old* word, and the
       render hides the card behind `existing` — so leaving it would make the
       card reappear the moment the notice was dismissed by a keystroke. */
    if (resolved) setResolved(null);
  }

  /**
   * Switching the toggle clears the answer but never the typing.
   *
   * The user's word survives a flip in both directions on purpose: the common
   * reason to touch this control is having just been told "that's already
   * English", and retyping the word you were just shown is the kind of small
   * insult that makes a feature feel hostile. The *context* is cleared going
   * back to English, because there is nowhere to put it there and leaving it
   * hidden would silently send it on the next lookup.
   */
  function switchMode(next: "english" | "foreign") {
    if (next === mode || busy) return;
    setMode(next);
    setResolved(null);
    setExisting(null);
    setError(null);
    if (next === "english") setContext("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (mode === "foreign") {
      await lookUp();
      return;
    }
    await save(normalizeTerm(value), false);
  }

  /**
   * The model call. Writes nothing, so every failure here is recoverable by
   * tapping the button again — and the form still holds exactly what the user
   * typed, which is the same promise F3's two-request design makes on the
   * English side by a different route.
   */
  async function lookUp() {
    const term = normalizeTerm(value);
    const valid = validateTerm(term);
    if (!valid.ok) {
      setError(valid.message);
      return;
    }
    const validContext = validateContext(context);
    if (!validContext.ok) {
      setError(validContext.message);
      return;
    }

    setLookingUp(true);
    setError(null);
    setExisting(null);
    const result = await lookupTerm(term, context);
    setLookingUp(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    switch (result.data.outcome) {
      case "resolved":
        setResolved(result.data);
        return;
      case "already_english":
        /**
         * A real answer, not an error — the toggle is one tap from right. The
         * mode is **not** switched automatically: the user is mid-flow and a
         * control that moves under them is worse than a sentence telling them
         * which one to move.
         */
        setError(`${result.data.term} is already English. Switch to English and add it.`);
        return;
      case "not_a_word":
        setError("Could not place that word in any language.");
        return;
      case "failed":
        /* The same table the English path draws from — the failures are the
           same provider's, and F14 D10's argument against one situation
           acquiring two sentences applies exactly. */
        setError(enrichmentCopy(result.data.code).message);
        return;
    }
  }

  /**
   * Keep the resolution. One request, and the row lands `ready` — there is no
   * second enrichment call, because the entry came back with the resolution and
   * travelled under an HMAC to prove it.
   */
  async function addResolved() {
    if (!resolved || busy) return;
    const originTerm = normalizeTerm(value);

    setSaving(true);
    setError(null);
    const created = await createEntryFromLookup({
      term: resolved.term,
      originTerm,
      originContext: context,
      lookup: resolved.lookup,
    });
    setSaving(false);

    if (!created.ok) {
      setError(created.message);
      return;
    }

    if (created.data.outcome !== "created") {
      /**
       * The English word is already held. Nothing was written, and the foreign
       * word is offered to the row that exists instead.
       *
       * `resolved` is deliberately **kept** — it holds the signed token, which
       * is the only thing that can tell `POST /api/vocab/[id]/origin` what
       * language this was. Clearing it here is the bug this comment exists to
       * stop being reintroduced: the notice would render with an attach button
       * that had nothing to attach with. The card is hidden by `existing`
       * instead, in the render below.
       */
      setExisting({
        id: created.data.id,
        term: created.data.term,
        status: created.data.status,
        situation: created.data.outcome,
        typed: originTerm,
      });
      return;
    }

    landAdded(created.data.id, created.data.term, {
      enrichmentStatus: created.data.enrichmentStatus,
      partOfSpeech: resolved.partOfSpeech,
      pronunciation: resolved.pronunciation,
      definition: resolved.definition,
      examples: resolved.examples,
    });
    setResolved(null);
  }

  /** The collision path's one tap. Amends a row; never creates one. */
  async function attachOrigin() {
    if (!existing || !resolved) return;
    setAttaching(true);
    setError(null);
    const result = await attachOriginToEntry(existing.id, {
      originTerm: normalizeTerm(value),
      originContext: context,
      lookup: resolved.lookup,
    });
    setAttaching(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    setExisting(null);
    setResolved(null);
    setJustAdded((prev) =>
      prev.some((w) => w.id === result.data.id)
        ? prev
        : [{ id: result.data.id, term: result.data.term }, ...prev].slice(0, 6),
    );
  }

  /**
   * The shared tail of both add paths: draw the card, remember the word in the
   * "Just added" strip. Extracted when the lookup arrived so the two cannot
   * disagree about what landing looks like.
   */
  function landAdded(
    id: string,
    term: string,
    fields: Pick<
      EnrichResponse,
      "enrichmentStatus" | "partOfSpeech" | "pronunciation" | "definition" | "examples"
    >,
  ) {
    setExisting(null);
    setEntry({
      id,
      term,
      suggestedCorrection: null,
      enrichmentError: null,
      attempts: 0,
      ...fields,
    });
    setJustAdded((prev) => [{ id, term }, ...prev].slice(0, 6));
  }

  /**
   * One save path, taken twice: once as the user typed it, and — only if the
   * near-duplicate notice was shown and overruled — once with
   * `allowNearDuplicate`. F14 D5's warning never blocks, and the second attempt
   * is a plain re-POST rather than a different endpoint, so the exact-duplicate
   * catch and the daily cap still apply to it.
   */
  async function save(term: string, allowNearDuplicate: boolean) {
    // The same module the server runs. A message the client invents is a message
    // that can disagree with what actually happened.
    const valid = validateTerm(term);
    if (!valid.ok) {
      setError(valid.message);
      return;
    }

    const setBusy = allowNearDuplicate ? setForcing : setSaving;
    setBusy(true);
    setError(null);
    if (!allowNearDuplicate) setExisting(null);

    const created = await createEntry(term, allowNearDuplicate);
    setBusy(false);

    if (!created.ok) {
      setError(created.message);
      return;
    }

    if (created.data.outcome !== "created") {
      // `created.data` describes the row the user already holds, which for a
      // near duplicate is a different word from the one they typed.
      setExisting({
        id: created.data.id,
        term: created.data.term,
        status: created.data.status,
        situation: created.data.outcome,
        typed: term,
      });
      return;
    }

    const id = created.data.id;
    const mine = ++ticket.current;

    landAdded(id, created.data.term, {
      enrichmentStatus: created.data.enrichmentStatus,
      partOfSpeech: null,
      pronunciation: null,
      definition: null,
      examples: [],
    });

    const enriched = await enrichEntry(id);
    if (ticket.current !== mine) return; // "Add another" was tapped mid-flight.

    if (enriched.ok) {
      setEntry(enriched.data);
      return;
    }

    // The route answers 200 with a `failed` row for every model failure, so a
    // non-2xx here is transport, the attempt cap, or the row being gone.
    if (enriched.code === "not_found") {
      setEntry(null);
      setError("That word is gone.");
      return;
    }

    setEntry((prev) =>
      prev && prev.id === id
        ? { ...prev, enrichmentStatus: "failed", enrichmentError: null }
        : prev,
    );
  }

  function addAnother() {
    ticket.current++;
    setEntry(null);
    setValue("");
    setError(null);
    setExisting(null);
    setResolved(null);
    setContext("");
    inputRef.current?.focus();
  }

  return (
    <>
      <div className="flex h-11 shrink-0 items-center justify-between">
        <Eyebrow>Add a word</Eyebrow>
        <Link
          href="/vocab"
          className="py-2 pl-4 font-mono text-mono-sm tracking-nav text-ink-3 uppercase"
        >
          {entry ? "Done" : "Close"}
        </Link>
      </div>

      {entry ? (
        <div className="flex shrink-0 flex-col gap-4 pt-6">
          <EnrichmentCard entry={entry} onChange={setEntry} />
          {/* The path for someone working through a page of Dickens with four
              unknown words on it. */}
          <Button onClick={addAnother}>Add another</Button>
        </div>
      ) : resolved && !existing ? (
        <div className="flex shrink-0 flex-col gap-4 pt-6">
          <LookupResultCard
            result={resolved}
            originTerm={normalizeTerm(value)}
            saving={saving}
            onAdd={() => void addResolved()}
            /* Drops the answer and returns to the form with the word and the
               sentence still in it — the user disagreed with the resolution,
               not with what they typed. */
            onCancel={() => setResolved(null)}
          />
          {error && <Meta className="text-red">{error}</Meta>}
        </div>
      ) : (
        <form onSubmit={submit} className="flex shrink-0 flex-col">
          {/**
           * The toggle. Two `Chip`s rather than a new segmented control: it is
           * the kit's tappable element, it already carries `aria-pressed` and a
           * 44px floor, and [R18] leaves no room on this screen for a control
           * that introduces a radius or a tone of its own.
           *
           * Above the field, because it changes what the field means.
           */}
          <div className="flex shrink-0 gap-2 pt-4" role="group" aria-label="Word language">
            <Chip pressed={mode === "english"} onClick={() => switchMode("english")}>
              English
            </Chip>
            <Chip pressed={mode === "foreign"} onClick={() => switchMode("foreign")}>
              Non-English
            </Chip>
          </div>

          {existing && (
            <ExistingWordNotice
              className="mt-4"
              id={existing.id}
              term={existing.term}
              status={existing.status}
              situation={existing.situation}
              origin="new"
              typedTerm={existing.typed}
              addingAnyway={forcing}
              /* Only the fold is refusable. An exact duplicate has nowhere to
                 go: the unique index owns that answer, and offering "add it
                 anyway" would be a button that cannot do what it says. */
              onAddAnyway={
                existing.situation === "near_duplicate"
                  ? () => void save(existing.typed, true)
                  : undefined
              }
              /* The lookup's collision. Offered only while the token that
                 carries the detected language is still in hand — without it
                 there is nothing to attach, and re-deriving the language would
                 be a second model call to learn what we were just told. */
              originTerm={normalizeTerm(value)}
              attachingOrigin={attaching}
              onAttachOrigin={
                mode === "foreign" && resolved ? () => void attachOrigin() : undefined
              }
            />
          )}

          <div className="shrink-0 pt-6">
            <Field
              id="term"
              label="Word"
              hideLabel
              hint={
                mode === "foreign"
                  ? "We'll find the English for it."
                  : "Pronunciation and meaning are fetched for you."
              }
              error={error ?? undefined}
            >
              {/* autoCorrect and spellCheck are off — TextInput's defaults, and
                  the single most important attribute set in this feature. iOS
                  silently repairs "genteell" to "genteel" before the app ever
                  sees the value, and the typo-correction path would then never
                  fire once. */}
              <TextInput
                ref={inputRef}
                id="term"
                name="term"
                variant="underline"
                placeholder="word"
                inputClassName="text-[30px] tracking-title"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={busy}
                autoFocus
                autoComplete="off"
                enterKeyHint="go"
                inputMode="text"
                maxLength={MAX_TERM_CHARS}
                type="text"
              />
            </Field>
          </div>

          {/**
           * The context field, and the reason this feature is worth more than a
           * dictionary: it is the difference between `melumuri` → *smear* and
           * `melumuri` → *coat*.
           *
           * Optional, and drawn small — a second full-size field would compete
           * with the word for the screen and read as a second thing to fill in.
           * It is only mounted in non-English mode, so the English screen keeps
           * the "one field, one button" shape `/vocab/new` was designed around
           * and [R19]'s height budget is unchanged there.
           *
           * `autoCorrect` and `spellCheck` stay off for the term's reason turned
           * around: the sentence is in another language, and iOS would repair it
           * into English one word at a time.
           */}
          {mode === "foreign" && (
            <div className="dw-in shrink-0 pt-5">
              <Field
                id="as-in"
                label="As in"
                hint="Optional. A sentence you met it in, so the right sense is picked."
              >
                <TextInput
                  id="as-in"
                  name="as-in"
                  variant="underline"
                  placeholder="mereka melumuri budi dengan minyak panas"
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  disabled={busy}
                  autoComplete="off"
                  enterKeyHint="go"
                  inputMode="text"
                  maxLength={MAX_CONTEXT_CHARS}
                  type="text"
                />
              </Field>
            </div>
          )}

          <Button
            type="submit"
            variant="filled"
            className="mt-[22px] shrink-0"
            loading={saving || lookingUp}
            disabled={!value.trim()}
          >
            {mode === "foreign"
              ? lookingUp
                ? "Looking…"
                : "Look it up"
              : saving
                ? "Saving…"
                : "Add"}
          </Button>
        </form>
      )}

      {justAdded.length > 0 && (
        <div className="flex shrink-0 flex-col gap-2.5 pt-6">
          <Eyebrow size="sm">Just added</Eyebrow>
          <div className="flex flex-wrap gap-2">
            {justAdded.map((word) => (
              <Pill key={word.id} href={vocabDetailHref(word.id, "new")}>
                {word.term}
              </Pill>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/* `DuplicateNotice` lived here and drew its own sentence. It is now
   `ExistingWordNotice`, shared with the enrichment card and the Discover panel
   (F14 D10), and it does offer "Put it back in rotation" for a mastered
   duplicate — F3 §8.3's objection was to a *silent* status change, not to a
   labelled one (F14 D8). */
