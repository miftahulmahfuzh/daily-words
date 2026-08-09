"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TextArea } from "@/components/ui/text-area";
import { TextInput } from "@/components/ui/text-input";
import { Meta } from "@/components/ui/text";
import { cn } from "@/lib/ui/cn";
import { counterFor } from "@/lib/journal/format";
import {
  JOURNAL_DRAFT_KEY,
  JOURNAL_SOURCE_NOTE_MAX,
  JOURNAL_TEXT_MAX,
  JOURNAL_TEXT_MIN,
  SOURCE_NOTE_TOO_LONG_MESSAGE,
  TOO_LONG_MESSAGE,
} from "@/lib/journal/limits";

/**
 * The whole point of `/journal`: a textarea that is always there.
 *
 * Not behind a button, a sheet or a FAB — [R3], and the reason `/journal` is the
 * one tab the app's add affordance skips. Paste, one tap, done.
 *
 * Everything below the textarea is hidden until there is text: no source-note
 * field, no counter, no Save. An empty composer is one field and a placeholder,
 * which is the screen a user opens forty times without saving anything.
 */

const MIN_ROWS = 2;
/** Beyond this the textarea scrolls internally rather than eating the list. */
const MAX_ROWS = 8;

export type SaveResult = { ok: boolean; message?: string };

export function Composer({
  onSave,
}: {
  /** Resolves false with a sentence when the row did not land. */
  onSave: (text: string, sourceNote: string | null) => Promise<SaveResult>;
}) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

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
    try {
      const raw = sessionStorage.getItem(JOURNAL_DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as { text?: unknown; sourceNote?: unknown };
      if (typeof draft.text === "string" && draft.text) setText(draft.text);
      if (typeof draft.sourceNote === "string") setSourceNote(draft.sourceNote);
    } catch {
      // A corrupt draft is not worth a word to the user; the field is empty and
      // that is a state they can act on.
    }
  }, []);

  /** Debounced so a fast typist is not writing to storage on every keystroke. */
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        if (!text && !sourceNote) sessionStorage.removeItem(JOURNAL_DRAFT_KEY);
        else sessionStorage.setItem(JOURNAL_DRAFT_KEY, JSON.stringify({ text, sourceNote }));
      } catch {
        // Private mode, or a full quota. The draft is a convenience.
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [text, sourceNote]);

  useEffect(resize, [text, resize]);

  async function submit() {
    if (!canSave) return;

    const snapshot = { text: trimmed, sourceNote: sourceNote.trim() };

    // Cleared immediately, and focus stays put: a reader working through a page
    // with three lines worth keeping should be able to paste the next one
    // without a tap in between.
    setText("");
    setSourceNote("");
    setProblem(null);
    try {
      sessionStorage.removeItem(JOURNAL_DRAFT_KEY);
    } catch {
      /* see above */
    }
    textRef.current?.focus();

    const result = await onSave(snapshot.text, snapshot.sourceNote || null);
    if (result.ok) return;

    setProblem(result.message ?? "Not saved. Try again.");
    // Restore only into a composer the user has not started refilling. The paste
    // is never lost, but neither is whatever they typed while the request was in
    // flight.
    setText((current) => (current === "" ? snapshot.text : current));
    setSourceNote((current) => (current === "" ? snapshot.sourceNote : current));
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
        }}
        onKeyDown={(e) => {
          // Enter inserts a newline — multi-line paste is the norm here. The
          // desktop shortcut is there for the occasional laptop session.
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
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
                void submit();
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
              onClick={() => void submit()}
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
    </div>
  );
}
