"use client";

import { useEffect, useRef } from "react";
import { Meta } from "@/components/ui/text";
import { Spinner } from "@/components/ui/spinner";
import { MAX_USER_MESSAGE_CHARS } from "@/lib/chat/turn-policy";

/** Four lines, then it scrolls internally rather than eating the transcript. */
const MAX_ROWS = 4;
const LINE_HEIGHT = 24;

/**
 * The composer. Sits **inside** the flex column, never `position: fixed`.
 *
 * Fixed positioning plus an on-screen keyboard is the exact combination iOS
 * Safari gets wrong; inside a height-controlled column whose height comes from
 * `visualViewport` it is deterministic.
 *
 * The bottom inset is arithmetic rather than a JS branch: the home-indicator
 * inset applies only when the keyboard is down, because when it is up the
 * visual viewport already stops above it and adding the inset again leaves a
 * visible gap. `100dvh - var(--vvh)` is the keyboard's height, so subtracting it
 * from the inset and clamping at zero switches the padding off exactly when the
 * keyboard appears — and with no `--vvh` set the difference is zero and the
 * inset applies, which is the correct non-iOS behaviour.
 */
export function ChatComposer({
  value,
  onChange,
  onSend,
  busy,
  error,
}: {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
  busy: boolean;
  error: string | null;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-grow. Reset to `auto` first or the height only ever ratchets up.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_ROWS * LINE_HEIGHT + 24)}px`;
  }, [value]);

  const canSend = value.trim().length > 0 && !busy;

  function send() {
    if (!canSend) return;
    onSend();
    // Deliberately no blur and no refocus. On iOS, focus cannot be restored
    // outside a user gesture, so a blur here — or anything awaited before a
    // refocus — dismisses the keyboard for the rest of the interaction. Clear
    // the value, keep the focus, keep the keyboard up.
    ref.current?.focus();
  }

  return (
    <div
      className="shrink-0 border-t border-rule bg-paper px-4 pt-3"
      style={{
        paddingBottom:
          "max(0px, calc(var(--pad-bottom) - (100dvh - var(--vvh, 100dvh))))",
      }}
    >
      {/* `role="status"` sits on the wrapper because `Meta` is a frozen kit
          component with a fixed prop shape and no feature may widen it. */}
      {error && (
        <div role="status" className="pb-2">
          <Meta className="text-red">{error}</Meta>
        </div>
      )}

      <div className="flex items-end gap-2.5">
        <textarea
          ref={ref}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={busy}
          placeholder={busy ? "…" : "Say something"}
          maxLength={MAX_USER_MESSAGE_CHARS}
          // Return inserts a newline, per iOS convention; the button sends. The
          // hint still says "send" because that is what the key is for on a
          // hardware keyboard, where Enter does submit.
          enterKeyHint="send"
          autoCapitalize="sentences"
          autoCorrect="on"
          spellCheck
          autoComplete="off"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) {
              e.preventDefault();
              send();
            }
          }}
          aria-label="Your reply"
          // text-base is 17px. Anything under 16 triggers iOS zoom-on-focus,
          // which changes the layout viewport and cascades into every other
          // problem on this screen.
          className="dw-pane-scroll max-h-[120px] w-full flex-1 resize-none rounded-[var(--r-field)] border border-rule bg-card px-3.5 py-2.5 text-base leading-[1.4] text-ink outline-none placeholder:text-ink-3"
        />

        <button
          type="button"
          onClick={send}
          disabled={!canSend}
          aria-label="Send"
          className="flex size-11 shrink-0 items-center justify-center rounded-full border border-ink bg-ink text-sm text-paper disabled:opacity-40"
        >
          {busy ? <Spinner size={16} /> : "↑"}
        </button>
      </div>
    </div>
  );
}
