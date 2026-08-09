import { notFound } from "next/navigation";
import { Screen, ScreenBody } from "@/components/layout/screen";
import { BackLink } from "@/components/layout/back-link";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/session";
import { vocabEntryIdSchema } from "@/lib/chat/schemas";
import { getPageState } from "@/lib/chat/service";
import { parseOrigin, vocabDetailHref } from "@/lib/vocab/links";
import { ChatClient } from "./chat-client";

/**
 * The practice chat. **The model speaks first.**
 *
 * Everything drawn here is read from the database. No LLM call is issued on
 * load — the roadmap's persistence rule, and the reason a hard refresh
 * mid-conversation restores the exact transcript for free, with zero model
 * requests in the server log. The opener is a POST the client fires on mount,
 * once, and only when the round is empty.
 *
 * The tab bar is absent (`Screen` without `tabs`). At 375×667 with the keyboard
 * up there are roughly 260px of usable height, and a tab bar, a composer and a
 * keyboard cannot share it. The back link is the way out — and because this is
 * a route rather than a modal, so is the iOS edge-swipe.
 *
 * `keyboardAware` is the one thing this screen asks of the shell that no other
 * screen does. See `components/layout/visual-viewport.tsx`.
 */
export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const origin = parseOrigin((await searchParams).from);

  // A malformed id compared against a `uuid` column is a cast error and a 500,
  // where the honest answer is a 404.
  const parsed = vocabEntryIdSchema.safeParse(id);
  if (!parsed.success) notFound();

  // 404 and never 403 for someone else's word: a 403 confirms the id exists.
  const result = await getPageState(user.id, parsed.data);
  if (!result.ok) notFound();

  const state = result.state;

  /**
   * The chat always returns to its word, so its own label stays "Back" — but
   * the *word* it returns to must still know where the user originally came
   * from, or Today → word → chat → back → back lands in the Collection. The
   * chat is never itself an origin: that would make back a two-node cycle with
   * no exit (F11 D6).
   */
  const backHref = vocabDetailHref(state.vocabEntryId, origin);

  /**
   * Enrichment has not landed, so there is no definition and no part of speech
   * — and the system prompt is built out of both. The client is never mounted,
   * so no `/open` is fired; `/open` refuses it independently if called direct.
   */
  if (!state.ready) {
    return (
      <Screen>
        <ScreenBody padded={false} className="px-6">
          <BackLink href={backHref} label="Back" />
          <EmptyState
            title="Still looking this word up"
            body="Practice needs the meaning first. Come back once it is ready."
            action={{ label: "The word", href: backHref }}
          />
        </ScreenBody>
      </Screen>
    );
  }

  return (
    <Screen keyboardAware>
      <ChatClient initial={state} backHref={backHref} />
    </Screen>
  );
}
