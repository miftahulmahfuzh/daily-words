"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TextArea } from "@/components/ui/text-area";
import { TextInput } from "@/components/ui/text-input";
import { Meta } from "@/components/ui/text";
import { DuplicateWarning } from "@/components/journal/duplicate-warning";
import { cn } from "@/lib/ui/cn";
import { clearDraft, readDraft, writeDraft } from "@/lib/journal/draft";
import { counterFor } from "@/lib/journal/format";
import {
  JOURNAL_SOURCE_NOTE_MAX,
  JOURNAL_TEXT_MAX,
  JOURNAL_TEXT_MIN,
  SOURCE_NOTE_TOO_LONG_MESSAGE,
  TOO_LONG_MESSAGE,
} from "@/lib/journal/limits";
// **Type only.** A value import from `schemas.ts` would drag the whole of zod
// into this route's bundle — 73 kB the last time this project made that mistake.
import type { DuplicateMatchDto } from "@/lib/journal/schemas";

/**
 * The whole point of `/journal`: a textarea, and as little else as possible.
 *
 * Everything below the textarea is hidden until there is text: no source-note
 * field, no counter, no Save. An empty composer is one field and a placeholder,
 * which is the screen a user opens forty times without saving anything.
 *
 * **Originally: "not behind a button, a sheet or a FAB — [R3], and the reason
 * `/journal` is the one tab the app's add affordance skips. Paste, one tap,
 * done."** That paragraph is kept rather than deleted because it is the argument
 * [R23] had to answer, and the answer is narrower than a reversal: the composer
 * is now expanded by a pill on the journal's header, and [R3]'s actual concern —
 * two competing add affordances on one screen — is still honoured, because there
 * is exactly one and it is that pill. What the move cost is one tap and the
 * mount-time draft restore below, and the second is why `lib/journal/draft.ts`
 * exists: `JournalFeed` asks it whether to open this component before the user
 * has touched anything.
 *
 * Still true, and still load-bearing: this is not a modal, and [S4]'s warning is
 * a block underneath it. `journal-duplicate.spec.ts` asserts `dialog[open]` has
 * count 0.
 */

const MIN_ROWS = 2;
/** Beyond this the textarea scrolls internally rather than eating the list. */
const MAX_ROWS = 8;

/**
 * Three outcomes, as a union rather than a boolean with a field bolted on.
 *
 * F15 §7.6: `ok: true | false` with a third arm is exactly the case where a
 * boolean stops being a boolean, and this shape is shared with `journal-feed`,
 * which must withdraw its optimistic row on `duplicate` and keep it on `saved`.
 * A widened `{ ok, message?, match? }` would let those two be confused with
 * nothing to catch it.
 */
export type SaveResult =
  | { status: "saved" }
  | { status: "duplicate"; match: DuplicateMatchDto }
  | { status: "failed"; message?: string };

/** What a save carries, and what "Keep it anyway" re-sends unchanged. */
type Snapshot = { text: string; sourceNote: string };

export function Composer({
  onSave,
}: {
  /** `force` skips the duplicate check and nothing else. */
  onSave: (
    text: string,
    sourceNote: string | null,
    opts: { force: boolean },
  ) => Promise<SaveResult>;
}) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  /** The line the user already has, plus the paste that collided with it. */
  const [duplicate, setDuplicate] = useState<{
    match: DuplicateMatchDto;
    snapshot: Snapshot;
  } | null>(null);
  /** A ref, not state: it must be true before the next paint, not after it. */
  const sending = useRef(false);

  const trimmed = text.trim();
  const counter = counterFor(text);
  const noteTooLong = sourceNote.trim().length > JOURNAL_SOURCE_NOTE_MAX;
  const canSave =
    trimmed.length >= JOURNAL_TEXT_MIN && trimmed.length <= JOURNAL_TEXT_MAX && !noteTooLong;

  /**
   * Grow with the text, up to eight rows.
   *
   * Measured from the element rather than from a line-height constant: the
   * serif's line box is set in `globals.css` and a number copied here would
   * drift from it silently.
   */
  const resize = useCallback(() => {
    const el = textRef.current;
    if (!el) return;
    const style = getComputedStyle(el);
    const line = parseFloat(style.lineHeight) || 24;
    const chrome =
      parseFloat(style.paddingTop) +
      parseFloat(style.paddingBottom) +
      parseFloat(style.borderTopWidth) +
      parseFloat(style.borderBottomWidth);
    const max = line * MAX_ROWS + chrome;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, []);

  /**
   * Restore a draft, once, on mount.
   *
   * iOS Safari discards a backgrounded tab aggressively. Switching to the Kindle
   * app to check the wording of the line being copied is the *expected* way to
   * use this screen, and without this the paste would be gone on the way back.
   */
  useEffect(() => {
    const draft = readDraft();
    if (!draft) return;
    /**
     * The same `current === ""` guard `restore` below uses, and [R23] is why it
     * is needed here too. The composer used to be in the first render of
     * `/journal`; now `JournalFeed` mounts it only after its own effect has
     * asked `hasDraft()`, so this restore lands one commit later and the field
     * is briefly on screen and empty. A user who starts typing into that frame
     * must not have it overwritten by a draft they have already replaced.
     */
    setText((current) => (current === "" ? draft.text : current));
    setSourceNote((current) => (current === "" ? draft.sourceNote : current));
  }, []);

  /** Debounced so a fast typist is not writing to storage on every keystroke. */
  useEffect(() => {
    const timer = setTimeout(() => writeDraft({ text, sourceNote }), 300);
    return () => clearTimeout(timer);
  }, [text, sourceNote]);

  useEffect(resize, [text, resize]);

  /**
   * Restore only into a composer the user has not started refilling.
   *
   * The paste is never lost, but neither is whatever they typed while the
   * request was in flight. Shared by the failure arm and the duplicate arm —
   * the warning must be able to appear without clobbering a line being typed,
   * and this `current === ""` guard is the whole of what does it.
   */
  const restore = useCallback((snapshot: Snapshot) => {
    setText((current) => (current === "" ? snapshot.text : current));
    setSourceNote((current) => (current === "" ? snapshot.sourceNote : current));
  }, []);

  async function send(snapshot: Snapshot, force: boolean) {
    if (sending.current) return;
    sending.current = true;

    /**
     * Clear only what the user has not already replaced.
     *
     * On a fresh submit the fields *are* the snapshot, so this clears them —
     * immediately, and focus stays put, because a reader working through a page
     * with three lines worth keeping should be able to paste the next one
     * without a tap in between.
     *
     * On **"Keep it anyway"** they may not be. The warning can sit on screen
     * while the user starts their next paste, and the snapshot being saved is
     * the line that collided, not what is in the box now. Clearing
     * unconditionally there destroys work the user can see — the same mistake
     * the `current === ""` guard in `restore` prevents on the way back, and
     * this is its mirror on the way out.
     */
    const wasReset = text.trim() === snapshot.text;
    setText((current) => (current.trim() === snapshot.text ? "" : current));
    setSourceNote((current) => (current.trim() === snapshot.sourceNote ? "" : current));
    setProblem(null);
    setDuplicate(null);
    if (wasReset) {
      clearDraft();
      textRef.current?.focus();
    }

    try {
      const result = await onSave(snapshot.text, snapshot.sourceNote || null, { force });
      if (result.status === "saved") return;

      if (result.status === "duplicate") {
        // Not a problem sentence. The line is offered back with two ways
        // forward, and the paste comes back into the composer so "Never mind"
        // leaves the user exactly where they were.
        setDuplicate({ match: result.match, snapshot });
        restore(snapshot);
        return;
      }

      setProblem(result.message ?? "Not saved. Try again.");
      restore(snapshot);
    } finally {
      sending.current = false;
    }
  }

  function submit() {
    if (!canSave) return;
    void send({ text: trimmed, sourceNote: sourceNote.trim() }, false);
  }

  /**
   * The re-POST, with the **snapshot that collided** rather than with whatever
   * is in the fields now. They are usually the same string; they are not when
   * the user started editing while the warning was up, and saving what they are
   * halfway through typing would be the wrong line.
   */
  function keepAnyway() {
    if (!duplicate) return;
    void send(duplicate.snapshot, true);
  }

  return (
    <div className="flex flex-col gap-2.5">
      <TextArea
        ref={textRef}
        rows={MIN_ROWS}
        value={text}
        placeholder="Paste a line worth keeping"
        aria-label="A line worth keeping"
        enterKeyHint="enter"
        /* No `maxLength`. iOS Safari silently truncates a paste that exceeds it,
           which would destroy part of what the user copied without telling them.
           The paste is always accepted in full; only saving is blocked. */
        onChange={(e) => {
          setText(e.target.value);
          if (problem) setProblem(null);
          // Editing the line makes the warning a statement about something the
          // user is no longer saving. Programmatic restores do not fire this,
          // so the warning survives its own restore.
          if (duplicate) setDuplicate(null);
        }}
        onKeyDown={(e) => {
          // Enter inserts a newline — multi-line paste is the norm here. The
          // desktop shortcut is there for the occasional laptop session.
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
      />

      {trimmed.length > 0 && (
        <div className="dw-in flex flex-col gap-2.5">
          <TextInput
            name="sourceNote"
            value={sourceNote}
            placeholder="Where from? (optional)"
            aria-label="Where from"
            autoCapitalize="sentences"
            autoCorrect="on"
            spellCheck
            enterKeyHint="done"
            onChange={(e) => setSourceNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />

          <div className="flex min-h-[44px] items-center justify-between gap-3">
            <span className="flex min-w-0 flex-col gap-1">
              {counter && (
                <Meta className={cn(counter.over && "text-red")}>{counter.label}</Meta>
              )}
              {counter?.over && <Meta className="text-red">{TOO_LONG_MESSAGE}</Meta>}
              {noteTooLong && <Meta className="text-red">{SOURCE_NOTE_TOO_LONG_MESSAGE}</Meta>}
              {problem && <Meta className="text-red">{problem}</Meta>}
            </span>

            {/* The design's Save: mono, uppercase, accent, and text rather than a
                filled button. It is the only control on the screen, so it does
                not have to compete with anything. */}
            <button
              type="button"
              onClick={submit}
              disabled={!canSave}
              className={cn(
                "shrink-0 py-2 pl-4 font-mono text-mono-sm tracking-nav uppercase",
                canSave ? "text-accent" : "text-ink-3 opacity-60",
              )}
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Outside the `trimmed.length > 0` gate on purpose: the warning must
          still be answerable if the user empties the field while it is up, and
          its "Keep it anyway" saves the snapshot rather than the field. */}
      {duplicate && (
        <DuplicateWarning
          match={duplicate.match}
          onKeep={keepAnyway}
          onDismiss={() => setDuplicate(null)}
        />
      )}
    </div>
  );
}
