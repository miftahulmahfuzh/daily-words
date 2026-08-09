"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/text-area";
import { TextInput } from "@/components/ui/text-input";
import { Eyebrow, Meta } from "@/components/ui/text";
import { InsightPanel } from "@/components/journal/insight-panel";
import { ShareButton } from "@/components/share/share-button";
import { SHARE_JOURNAL_ACTION_LABEL } from "@/lib/share/policy";
import { cn } from "@/lib/ui/cn";
import {
  deleteEntry as deleteEntryRequest,
  getEntry,
  patchEntry,
  requestInsight,
} from "@/lib/journal/client";
import { counterFor, entryMeta, excerptFor } from "@/lib/journal/format";
import {
  JOURNAL_SOURCE_NOTE_MAX,
  JOURNAL_TEXT_MAX,
  JOURNAL_TEXT_MIN,
  SOURCE_NOTE_TOO_LONG_MESSAGE,
  TOO_LONG_MESSAGE,
} from "@/lib/journal/limits";
import type { JournalEntryDto } from "@/lib/journal/schemas";

/**
 * The entry, and the three things that can be done to it.
 *
 * The whole page is client state seeded from a server render, because an
 * insight arriving replaces a button with a paragraph *in place* — no
 * navigation, no scroll jump, no re-render of the line the user is reading.
 */
export function EntryView({
  initial,
  initialShareSlug,
  initialShareUrl,
}: {
  initial: JournalEntryDto;
  /** F18 D18: the share, if there is one, so revocation has somewhere to live. */
  initialShareSlug: string | null;
  initialShareUrl: string | null;
}) {
  const router = useRouter();
  const [entry, setEntry] = useState(initial);
  const [editing, setEditing] = useState(false);

  return (
    <>
      {editing ? (
        <EditForm
          entry={entry}
          onDone={(next) => {
            if (next) setEntry(next);
            setEditing(false);
          }}
        />
      ) : (
        <>
          {/* `pre-wrap`, so a pasted stanza keeps its line breaks. Set larger
              than list text: the line is the point of the screen. */}
          <p className="m-0 pt-3 text-2xl leading-[1.25] tracking-[-0.015em] whitespace-pre-wrap text-pretty">
            {entry.text}
          </p>

          <div className="flex items-baseline gap-2 py-4.5 pb-5.5">
            <Eyebrow className="tracking-[0.1em]">{entryMeta(entry)}</Eyebrow>
          </div>

          <div className="h-px bg-rule" />

          <InsightArea entry={entry} onChange={setEntry} />

          <div className="flex items-center gap-6 pt-7">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex min-h-[44px] items-center font-mono text-mono-sm tracking-nav text-ink-3 uppercase"
            >
              Edit
            </button>
            <DeleteButton id={entry.id} onDeleted={() => router.replace("/journal")} />
          </div>

          {/* F18 D18. Below the row rather than in it, because once shared this
              control grows a selectable URL field and two more actions — and
              because Share is not one of the three things this screen was built
              around, it is the fourth.

              **The share is a snapshot of the text as it was when it was
              shared**, so editing the line revokes it: `PATCH /api/journal/[id]`
              deletes the share row whenever the text actually changed. That is
              why nothing here tries to "update the shared copy" — publishing an
              edit means sharing again, which mints a new slug and kills the old
              link, and the person you sent the old text to keeps seeing what you
              actually sent them until you do. A source-note edit revokes
              nothing, mirroring the insight rule exactly.

              `key` on the entry's `updatedAt` so that an edit which revoked the
              share resets this control to its un-shared state rather than
              leaving a dead URL on screen. */}
          <ShareButton
            key={entry.updatedAt}
            entityType="journal"
            entityId={entry.id}
            /* An excerpt, never the source note. It is what a native share sheet
               shows beside the link. */
            title={excerptFor(entry.text)}
            label={SHARE_JOURNAL_ACTION_LABEL}
            initialSlug={initialShareSlug}
            initialUrl={initialShareUrl}
          />
        </>
      )}
    </>
  );
}

/* --------------------------------- Insight -------------------------------- */

/**
 * Four states, one of which is a button.
 *
 * `ready` draws no button at all: the roadmap forbids re-calling the model for
 * an entry that already has an insight, and the honest way to enforce that is
 * to not offer it. A `pending` row older than the stale window is drawn as
 * failed by the server, which is what makes a killed function recoverable.
 */
function InsightArea({
  entry,
  onChange,
}: {
  entry: JournalEntryDto;
  onChange: (entry: JournalEntryDto) => void;
}) {
  const [busy, setBusy] = useState(entry.insightStatus === "pending");
  const [problem, setProblem] = useState<string | null>(null);

  async function ask() {
    if (busy) return;
    setBusy(true);
    setProblem(null);

    // 3–15 seconds, awaited inline. The insight is ~60 words; streaming it
    // token by token would be more machinery than the paragraph is worth.
    const result = await requestInsight(entry.id);

    if (result.ok) {
      setBusy(false);
      onChange(result.data.entry);
      return;
    }

    // A 409 means the truth is on the server, not here — another tab, another
    // tap, or an edit that landed mid-flight. Re-read rather than guess.
    if (result.code === "insight_running" || result.code === "insight_exists") {
      const fresh = await getEntry(entry.id);
      setBusy(false);
      if (fresh.ok) {
        onChange(fresh.data.entry);
        if (fresh.data.entry.insightStatus !== "ready") setProblem(result.message);
        return;
      }
      setProblem(result.message);
      return;
    }

    setBusy(false);
    setProblem(result.message);
    onChange({ ...entry, insightStatus: "failed" });
  }

  if (entry.insightStatus === "ready" && entry.insight) {
    return <InsightPanel insight={entry.insight} />;
  }

  const failed = entry.insightStatus === "failed";

  return (
    <div className="flex flex-col gap-2.5">
      {failed && !busy && <Meta className="pt-5.5 text-red">Insight failed.</Meta>}
      <Button
        onClick={() => void ask()}
        loading={busy}
        disabled={busy}
        className={cn("h-[50px] text-ink", failed ? "mt-0" : "mt-5.5")}
      >
        {busy ? "Thinking…" : failed ? "Try again" : "Ask for an insight"}
      </Button>
      {problem && !failed && <Meta className="text-red">{problem}</Meta>}
    </div>
  );
}

/* ---------------------------------- Edit ---------------------------------- */

function EditForm({
  entry,
  onDone,
}: {
  entry: JournalEntryDto;
  /** Null when the edit was abandoned. */
  onDone: (next: JournalEntryDto | null) => void;
}) {
  const [text, setText] = useState(entry.text);
  const [sourceNote, setSourceNote] = useState(entry.sourceNote ?? "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const trimmed = text.trim();
  const counter = counterFor(text);
  const noteTooLong = sourceNote.trim().length > JOURNAL_SOURCE_NOTE_MAX;
  const canSave =
    trimmed.length >= JOURNAL_TEXT_MIN && trimmed.length <= JOURNAL_TEXT_MAX && !noteTooLong;
  const textChanged = trimmed !== entry.text;

  async function save() {
    if (!canSave || busy) return;
    setBusy(true);
    setProblem(null);

    const note = sourceNote.trim();
    const result = await patchEntry(entry.id, {
      text: trimmed,
      sourceNote: note.length > 0 ? note : null,
    });
    setBusy(false);

    if (!result.ok) {
      setProblem(result.message);
      return;
    }
    onDone(result.data.entry);
  }

  return (
    <div className="flex flex-col gap-3.5 pt-3">
      <TextArea
        rows={6}
        value={text}
        aria-label="The line"
        onChange={(e) => setText(e.target.value)}
        className="text-lg leading-[1.4]"
      />

      <TextInput
        name="sourceNote"
        value={sourceNote}
        placeholder="Where from? (optional)"
        aria-label="Where from"
        autoCapitalize="sentences"
        autoCorrect="on"
        spellCheck
        onChange={(e) => setSourceNote(e.target.value)}
      />

      {counter && <Meta className={cn(counter.over && "text-red")}>{counter.label}</Meta>}
      {counter?.over && <Meta className="text-red">{TOO_LONG_MESSAGE}</Meta>}
      {noteTooLong && <Meta className="text-red">{SOURCE_NOTE_TOO_LONG_MESSAGE}</Meta>}

      {/* Shown only when it is true, which is what keeps it from being noise. */}
      {entry.insightStatus === "ready" && textChanged && (
        <Meta>Saving new text clears the insight.</Meta>
      )}

      {problem && <Meta className="text-red">{problem}</Meta>}

      <div className="flex items-center gap-6 pt-1">
        <Button
          size="sm"
          fullWidth={false}
          loading={busy}
          disabled={!canSave}
          onClick={() => void save()}
        >
          Save
        </Button>
        <button
          type="button"
          onClick={() => onDone(null)}
          className="flex min-h-[44px] items-center font-mono text-mono-sm tracking-nav text-ink-3 uppercase"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* --------------------------------- Delete --------------------------------- */

/**
 * Two taps, armed and self-disarming, matching `ToggleRow` and F4's delete.
 *
 * No dialog and no native `confirm()`: there is no modal anywhere in this app,
 * and on iOS Safari a full-screen overlay costs the edge-swipe back gesture.
 */
function DeleteButton({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => () => void (mounted.current = false), []);

  useEffect(() => {
    if (!armed) return;
    // A control left armed because the user's thumb moved on is a trap for the
    // next tap.
    const timer = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(timer);
  }, [armed]);

  async function tap() {
    if (busy) return;
    if (!armed) {
      setArmed(true);
      return;
    }

    setArmed(false);
    setBusy(true);
    setProblem(null);

    const result = await deleteEntryRequest(id);
    if (result.ok) {
      onDeleted();
      return;
    }

    if (!mounted.current) return;
    setBusy(false);
    setProblem("Not deleted. Try again.");
  }

  return (
    <span className="flex flex-col items-start">
      <button
        type="button"
        onClick={() => void tap()}
        disabled={busy}
        className={cn(
          "flex min-h-[44px] items-center font-mono text-mono-sm tracking-nav uppercase",
          armed ? "text-red" : "text-ink-3",
          busy && "opacity-60",
        )}
      >
        {armed ? "Delete for good?" : "Delete"}
      </button>
      {problem && <Meta className="text-red">{problem}</Meta>}
    </span>
  );
}
