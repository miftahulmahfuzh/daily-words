import { notFound } from "next/navigation";
import { Screen, ScreenBody } from "@/components/layout/screen";
import { BackLink } from "@/components/layout/back-link";
import { ChatBubble } from "@/components/ui/chat-bubble";
import { TextInput } from "@/components/ui/text-input";
import { Eyebrow } from "@/components/ui/text";
import { lookupWord, CHAT_OPENER } from "@/lib/sample-data";
import { vocabDetailHref } from "@/lib/vocab/links";

/**
 * The practice chat. The model speaks FIRST — the opener below is fired before
 * the user types anything, in role, with a scenario drawn from their profile.
 * It never defines the word; the user has already read the definition. See F6.
 *
 * The composer sits outside the scrolling pane and carries the bottom safe-area
 * inset itself, so the transcript scrolls under a bar that stays put.
 */
export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const word = lookupWord(id);
  if (!word) notFound();

  return (
    <Screen>
      <header
        className="flex shrink-0 items-center justify-between border-b border-rule px-[var(--gutter)] pb-3"
        style={{ paddingTop: "var(--pad-top)" }}
      >
        <BackLink href={vocabDetailHref(id)} label="Back" />
        <span className="flex items-baseline gap-2">
          <Eyebrow size="sm" className="tracking-[0.18em]">
            Practising
          </Eyebrow>
          <span className="text-lg">{word.term}</span>
        </span>
      </header>

      <ScreenBody scroll className="gap-3.5 py-5">
        <ChatBubble role="assistant" eyebrow="Scenario">
          {CHAT_OPENER.text}
        </ChatBubble>
      </ScreenBody>

      <div
        className="flex shrink-0 items-center gap-2.5 border-t border-rule bg-paper px-4 pt-3"
        style={{ paddingBottom: "var(--pad-bottom)" }}
      >
        <TextInput
          name="reply"
          variant="pill"
          placeholder="Use the word"
          autoCapitalize="sentences"
          autoCorrect="on"
          spellCheck
          enterKeyHint="send"
          className="flex-1"
        />
        <button
          type="button"
          aria-label="Send"
          className="flex size-11 shrink-0 items-center justify-center rounded-full border border-ink bg-ink text-sm text-paper"
        >
          ↑
        </button>
      </div>
    </Screen>
  );
}
