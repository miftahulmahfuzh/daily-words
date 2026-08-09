"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Pill } from "@/components/ui/pill";
import { TextInput } from "@/components/ui/text-input";
import { Eyebrow } from "@/components/ui/text";
import { EnrichmentCard } from "@/components/vocab/enrichment-card";
import { ExistingWordNotice } from "@/components/vocab/existing-word-notice";
import { createEntry, enrichEntry } from "@/lib/vocab/client";
import { MAX_TERM_CHARS, normalizeTerm, validateTerm } from "@/lib/vocab/normalize";
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

  function onChange(next: string) {
    setValue(next);
    // The notice is dismissed by typing. It is about a word the user has
    // stopped typing, and leaving it up makes the next word look rejected.
    if (existing) setExisting(null);
    if (error) setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving || forcing) return;
    await save(normalizeTerm(value), false);
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

    setExisting(null);
    const id = created.data.id;
    const mine = ++ticket.current;

    setEntry({
      id,
      term: created.data.term,
      enrichmentStatus: created.data.enrichmentStatus,
      partOfSpeech: null,
      pronunciation: null,
      definition: null,
      examples: [],
      suggestedCorrection: null,
      enrichmentError: null,
      attempts: 0,
    });
    setJustAdded((prev) => [{ id, term: created.data.term }, ...prev].slice(0, 6));

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
      ) : (
        <form onSubmit={submit} className="flex shrink-0 flex-col">
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
            />
          )}

          <div className="shrink-0 pt-6">
            <Field
              id="term"
              label="Word"
              hideLabel
              hint="Pronunciation and meaning are fetched for you."
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
                disabled={saving}
                autoFocus
                autoComplete="off"
                enterKeyHint="go"
                inputMode="text"
                maxLength={MAX_TERM_CHARS}
                type="text"
              />
            </Field>
          </div>

          <Button
            type="submit"
            variant="filled"
            className="mt-[22px] shrink-0"
            loading={saving}
            disabled={!value.trim()}
          >
            {saving ? "Saving…" : "Add"}
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
