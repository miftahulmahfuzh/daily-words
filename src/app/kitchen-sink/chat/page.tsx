import { notFound } from "next/navigation";
import { Screen } from "@/components/layout/screen";
import { ChatClient } from "@/app/(app)/vocab/[id]/chat/chat-client";
import { MAX_ASSISTANT_TURNS } from "@/lib/chat/turn-policy";
import type { ChatMessageDto, ChatPageState } from "@/lib/chat/schemas";
import { vocabDetailHref } from "@/lib/vocab/links";

/**
 * The chat layout under worst-case content, for the no-scroll spec.
 *
 * Not the real route: that one needs a session, a word and a model call, and
 * the thing being tested here is the frame — header, one scrolling pane, a
 * composer that stays on screen, and no tab bar. The real page mounts the same
 * `ChatClient` with the same props, so this is the component under test rather
 * than a mock-up of it.
 *
 * **The fixture issues no requests.** Neither state below is `empty` or
 * `closing`, which are the only two the client acts on by itself — the
 * proactive `/open` and the automatic `/close`. `closing` is therefore not
 * offered here: it would fire a POST that 401s without a session, and a
 * fixture that depends on the network is not a layout fixture. Its footer is
 * one line of text where `closed` has a button, and `closed` is the taller of
 * the two.
 *
 * `?state=` selects open (the common case) or closed (verdict plus "practise
 * again"). `?rounds=2` adds a previous round so the divider is on screen.
 */

const LONG_TURN =
  "So the payments lead has finally answered your review comments — three paragraphs, two “as per my previous message”, and not one actual answer anywhere in it. I have read enough of that tone this month to know exactly what he is doing. How would you describe the way he wrote it?";

const VERDICT = [
  "You landed it in 'very genteel, very useless' — the pairing does the work, and that is the word doing its job.",
  "The slip earlier was attaching it to speed; genteel describes a manner, so it can never describe how fast someone replied.",
  'Tomorrow: "He gave me a genteel non-answer, so I asked him again in the standup."',
].join("\n");

function message(
  i: number,
  round: number,
  over: Partial<ChatMessageDto> = {},
): ChatMessageDto {
  const assistant = i % 2 === 0;
  return {
    id: `fixture-${round}-${i}`,
    role: assistant ? "assistant" : "user",
    kind: i === 0 ? "opener" : "reply",
    round,
    content: assistant ? LONG_TURN : "It was very genteel of him to reply so fast.",
    // Fixed instants, not `new Date()`: a fixture whose output changes between
    // runs cannot be asserted against.
    createdAt: `2026-08-0${round}T09:${String(10 + i).padStart(2, "0")}:00.000Z`,
    ...over,
  };
}

export default async function KitchenSinkChatPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; rounds?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const { state = "open", rounds } = await searchParams;
  const closed = state === "closed";
  const round = rounds === "2" ? 2 : 1;

  const messages: ChatMessageDto[] = [];

  // A previous round, so the `Round 2 · …` divider is in the transcript.
  if (round === 2) {
    for (let i = 0; i < 3; i++) messages.push(message(i, 1));
    messages.push(
      message(3, 1, { id: "fixture-1-verdict", kind: "verdict", content: VERDICT }),
    );
  }

  // A full round: the opener plus seven exchanges is the tallest a live
  // transcript can get, which is the case the scrolling pane has to survive.
  const turns = closed ? 15 : 5;
  for (let i = 0; i < turns; i++) messages.push(message(i, round));
  if (closed) {
    messages.push(
      message(turns, round, {
        id: `fixture-${round}-verdict`,
        kind: "verdict",
        content: VERDICT,
      }),
    );
  }

  const initial: ChatPageState = {
    sessionId: "00000000-0000-4000-8000-000000000000",
    vocabEntryId: "11111111-1111-4111-8111-111111111111",
    term: "antidisestablishmentarianism",
    ready: true,
    timezone: "Asia/Jakarta",
    round,
    turnCount: closed ? MAX_ASSISTANT_TURNS : 3,
    maxTurns: MAX_ASSISTANT_TURNS,
    status: closed ? "closed" : "open",
    messages,
  };

  return (
    <Screen keyboardAware>
      {/* The preview has no origin to inherit — this is not a real navigation
          — so the back link points at the word, which is what the chat's own
          back always means. */}
      <ChatClient initial={initial} backHref={vocabDetailHref(initial.vocabEntryId)} />
    </Screen>
  );
}
