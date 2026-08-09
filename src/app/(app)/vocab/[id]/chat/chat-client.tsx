"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BackLink } from "@/components/layout/back-link";
import { Button } from "@/components/ui/button";
import { Eyebrow, Meta } from "@/components/ui/text";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatTranscript } from "@/components/chat/chat-transcript";
import { TurnMeter } from "@/components/chat/turn-meter";
import { closeChat, openChat, resetChat, sendChatMessage } from "@/lib/chat/client";
import type { ChatMessageDto, ChatPageState, ChatStateDto } from "@/lib/chat/schemas";
import type { ChatStatus } from "@/lib/chat/turn-policy";

/**
 * The whole interactive surface of the chat: the proactive opener fire, the
 * send loop, the automatic close at eight turns, and "practise again".
 *
 * **No turn accounting happens here.** The counts it renders come from the
 * server's response to every request; the composer's disabled state is a
 * courtesy, and the reservation in `chat_sessions` is the actual cap. A client
 * that lies about `turnCount` gets a 409, which is the point.
 */
export function ChatClient({
  initial,
  backHref,
}: {
  initial: ChatPageState;
  /**
   * Fully formed by the server, which is the only place that has read the
   * `from` param. Passed rather than computed so no origin union reaches this
   * bundle: the client stays dumb about where the word came from.
   */
  backHref: string;
}) {
  const entryId = initial.vocabEntryId;

  const [messages, setMessages] = useState<ChatMessageDto[]>(initial.messages);
  const [turnCount, setTurnCount] = useState(initial.turnCount);
  const [status, setStatus] = useState<ChatStatus>(initial.status);

  const [draft, setDraft] = useState("");
  /** The user's sentence, shown dimmed until the server confirms it. */
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(initial.status === "empty");
  const [error, setError] = useState<string | null>(null);
  const [openFailed, setOpenFailed] = useState(false);

  /**
   * Replace just the incoming round and keep every earlier one.
   *
   * The API returns the current round only — a growing transcript on every turn
   * would make a send cost more the longer the word has been practised — so the
   * client is where the rounds are stitched back together. Rounds only ever
   * increase, so appending after the filter preserves chronological order.
   *
   * The round number itself is not held in state: every message carries its
   * own, and the transcript is the only thing that needs it.
   */
  const apply = useCallback((state: ChatStateDto) => {
    setMessages((prev) => [
      ...prev.filter((m) => m.round !== state.round),
      ...state.messages,
    ]);
    setTurnCount(state.turnCount);
    setStatus(state.status);
  }, []);

  /* ------------------------------ The proactive fire ----------------------- */

  const firedRef = useRef(false);

  const open = useCallback(async () => {
    setBusy(true);
    setError(null);
    setOpenFailed(false);

    const result = await openChat(entryId);
    setBusy(false);

    if (!result.ok) {
      setOpenFailed(true);
      setError(result.message);
      return;
    }
    apply(result.data);
  }, [apply, entryId]);

  useEffect(() => {
    if (initial.status !== "empty") return;
    // Strict mode invokes effects twice in development. This is convenience
    // only — the server's "does this round already have a message" check and
    // the partial unique index are what actually guarantee one opener.
    if (firedRef.current) return;
    firedRef.current = true;
    void open();
  }, [initial.status, open]);

  /* --------------------------------- Sending ------------------------------- */

  async function send() {
    const content = draft.trim();
    if (!content || busy) return;

    setDraft("");
    setPending(content);
    setBusy(true);
    setError(null);

    const result = await sendChatMessage(entryId, content);
    setBusy(false);
    setPending(null);

    if (!result.ok) {
      // The turn was released server-side and the user's row deleted, so they
      // have lost nothing but the round trip. Give them their sentence back
      // rather than making them retype it.
      setDraft(content);
      setError(result.message);
      return;
    }
    apply(result.data);
  }

  /* ------------------------- Closing, at eight turns ----------------------- */

  const closingRef = useRef(false);

  useEffect(() => {
    if (status !== "closing" || closingRef.current) return;
    closingRef.current = true;

    void (async () => {
      setBusy(true);
      const result = await closeChat(entryId);
      setBusy(false);
      // A failed verdict still closes the round server-side, so an error here
      // means the request itself never landed. Leaving `closing` on screen with
      // its "wrapping up" line is honest, and a reload retries.
      if (result.ok) apply(result.data);
      else setError(result.message);
    })();
  }, [status, entryId, apply]);

  /* ------------------------------ Practise again --------------------------- */

  async function practiseAgain() {
    if (busy) return;
    setBusy(true);
    setError(null);

    const result = await resetChat(entryId);
    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    // The next round may reach eight turns too, so the close latch has to open.
    closingRef.current = false;
    apply(result.data);
  }

  /* ---------------------------------- Render -------------------------------- */

  const thinking =
    busy && (status === "empty" || status === "open" || status === "closing");

  return (
    <>
      <header
        className="flex shrink-0 items-center justify-between gap-3 border-b border-rule px-[var(--gutter)] pb-3"
        style={{ paddingTop: "var(--pad-top)" }}
      >
        <BackLink href={backHref} label="Back" />
        <span className="flex min-w-0 items-center gap-3">
          {/* The term only — never the definition. The user has just come from
              the detail page, and repeating the meaning here invites them to
              read it again instead of talking. */}
          <span className="truncate text-lg" title={initial.term}>
            {initial.term}
          </span>
          <TurnMeter used={turnCount} />
        </span>
      </header>

      <ChatTranscript
        messages={messages}
        timezone={initial.timezone}
        pending={pending}
        thinking={thinking}
      />

      {status === "closed" ? (
        <footer
          className="flex shrink-0 flex-col gap-2 border-t border-rule px-[var(--gutter)] pt-3"
          style={{ paddingBottom: "var(--pad-bottom)" }}
        >
          <Button variant="outline" onClick={() => void practiseAgain()} loading={busy}>
            Practise again
          </Button>
          {error && <Meta className="text-red">{error}</Meta>}
        </footer>
      ) : status === "closing" ? (
        <footer
          className="flex shrink-0 items-center justify-center border-t border-rule px-[var(--gutter)] pt-4"
          style={{ paddingBottom: "var(--pad-bottom)" }}
        >
          <Eyebrow>{error ?? "Wrapping up"}</Eyebrow>
        </footer>
      ) : openFailed ? (
        <footer
          className="flex shrink-0 flex-col items-center gap-3 border-t border-rule px-[var(--gutter)] pt-4"
          style={{ paddingBottom: "var(--pad-bottom)" }}
        >
          <Meta>Couldn&rsquo;t start the scene.</Meta>
          <Button
            variant="outline"
            size="sm"
            fullWidth={false}
            onClick={() => void open()}
            loading={busy}
          >
            Try again
          </Button>
        </footer>
      ) : (
        <ChatComposer
          value={draft}
          onChange={setDraft}
          onSend={() => void send()}
          busy={busy}
          error={error}
        />
      )}
    </>
  );
}
