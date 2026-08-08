"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Pill } from "@/components/ui/pill";
import { TextInput } from "@/components/ui/text-input";
import { Eyebrow, Prose } from "@/components/ui/text";
import { EnrichmentCard } from "@/components/vocab/enrichment-card";
import { createEntry, enrichEntry } from "@/lib/vocab/client";
import { MAX_TERM_CHARS, normalizeTerm, validateTerm } from "@/lib/vocab/normalize";
import type { EnrichResponse, VocabEntrySummary } from "@/lib/vocab/schemas";
import { vocabDetailHref } from "@/lib/vocab/links";

export type RecentWord = { id: string; term: string };

type Duplicate = Pick<VocabEntrySummary, "id" | "term" | "status">;

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
  const [duplicate, setDuplicate] = useState<Duplicate | null>(null);
  const [entry, setEntry] = useState<EnrichResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [justAdded, setJustAdded] = useState<RecentWord[]>(recent);

  function onChange(next: string) {
    setValue(next);
    // The duplicate notice is dismissed by typing. It is about a word the user
    // has stopped typing, and leaving it up makes the next word look rejected.
    if (duplicate) setDuplicate(null);
    if (error) setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    const term = normalizeTerm(value);
    // The same module the server runs. A message the client invents is a message
    // that can disagree with what actually happened.
    const valid = validateTerm(term);
    if (!valid.ok) {
      setError(valid.message);
      return;
    }

    setSaving(true);
    setError(null);
    setDuplicate(null);

    const created = await createEntry(term);
    setSaving(false);

    if (!created.ok) {
      setError(created.message);
      return;
    }

    if (created.data.duplicate) {
      setDuplicate({
        id: created.data.id,
        term: created.data.term,
        status: created.data.status,
      });
      return;
    }

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
    setDuplicate(null);
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
          {duplicate && <DuplicateNotice duplicate={duplicate} />}

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
              <Pill key={word.id} href={vocabDetailHref(word.id)}>
                {word.term}
              </Pill>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * F3 does not offer "make it active again" here even for a mastered duplicate:
 * that writes `vocab_entries.status`, which is F4's column, and a silent status
 * change on an add is surprising. The un-master control lives on the detail page.
 */
function DuplicateNotice({ duplicate }: { duplicate: Duplicate }) {
  return (
    <Card variant="outline" padding="sm" className="dw-in mt-4 flex shrink-0 flex-col items-start gap-3">
      <Prose size="body" tone="ink">
        {duplicate.status === "mastered"
          ? `${duplicate.term} — you marked this mastered.`
          : `You already have ${duplicate.term}.`}
      </Prose>
      <Button size="sm" fullWidth={false} href={vocabDetailHref(duplicate.id)}>
        Open it
      </Button>
    </Card>
  );
}
