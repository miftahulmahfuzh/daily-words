"use client";

import { useCallback, useEffect, useRef } from "react";
import { ChatBubble, ChatBubbleTyping } from "@/components/ui/chat-bubble";
import { RoundDivider } from "@/components/chat/round-divider";
import { VerdictCard } from "@/components/chat/verdict-card";
import type { ChatMessageDto } from "@/lib/chat/schemas";

/**
 * The scrolling pane. **The only thing on this screen that scrolls** — the
 * header and the composer are rows in the same flex column, so the page itself
 * never moves.
 *
 * Auto-scroll uses `el.scrollTo`, never `scrollIntoView`. On iOS the latter
 * scrolls every ancestor including the layout viewport, which drags the whole
 * shell out from under the composer — the exact failure the frame is built to
 * avoid.
 */
export function ChatTranscript({
  messages,
  timezone,
  pending,
  thinking,
}: {
  /** Every round, oldest first. */
  messages: ChatMessageDto[];
  timezone: string;
  /** The user's text, shown before the server has confirmed it. */
  pending: string | null;
  thinking: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const toBottom = useCallback(() => {
    const el = ref.current;
    if (el) el.scrollTo({ top: el.scrollHeight });
  }, []);

  // On mount and on every new message, including the optimistic one and the
  // typing bubble — both change the height of the pane.
  useEffect(toBottom, [messages.length, pending, thinking, toBottom]);

  // And when the keyboard opens: the pane just got shorter and the newest
  // message would otherwise be above the fold.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    vv.addEventListener("resize", toBottom);
    return () => vv.removeEventListener("resize", toBottom);
  }, [toBottom]);

  return (
    <div
      ref={ref}
      className="dw-pane-scroll flex min-h-0 flex-1 flex-col gap-3.5 px-[var(--gutter)] py-5"
    >
      {messages.map((message, i) => {
        const startsRound = message.round !== messages[i - 1]?.round;

        return (
          <div key={message.id} className="flex flex-col gap-3.5">
            {startsRound && message.round > 1 && (
              <RoundDivider
                round={message.round}
                startedAt={message.createdAt}
                timezone={timezone}
              />
            )}

            {message.kind === "verdict" ? (
              <VerdictCard content={message.content} />
            ) : (
              <ChatBubble
                role={message.role}
                // Only the very first bubble of a round is framed. It is the one
                // the user did not ask for, arriving before they have typed
                // anything, and without the label it reads as the app having
                // started talking to itself.
                eyebrow={message.kind === "opener" ? "Scenario" : undefined}
              >
                {message.content}
              </ChatBubble>
            )}
          </div>
        );
      })}

      {pending && (
        <ChatBubble role="user" state="pending">
          {pending}
        </ChatBubble>
      )}

      {thinking && <ChatBubbleTyping />}
    </div>
  );
}
