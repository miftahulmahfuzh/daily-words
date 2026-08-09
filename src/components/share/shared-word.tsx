import { Screen, ScreenBody } from "@/components/layout/screen";
import { PractiseThisWord } from "@/components/share/practise-this-word";
import { Eyebrow, Prose } from "@/components/ui/text";
import type { SharedWordPayload } from "@/lib/share/schemas";
import { termSizeClass } from "@/lib/vocab/format";
import { cn } from "@/lib/ui/cn";

/**
 * The shared word, as a stranger sees it.
 *
 * Server-safe and fixture-drivable: it takes a payload and an href and reads
 * nothing else, which is what lets `/kitchen-sink/share` drive it with no
 * database and lets `tests/e2e/share-frame.spec.ts` measure the frame.
 *
 * Three things are absent on purpose:
 *
 * - **No tab bar** (`tabs` defaults to false). Four tabs that all bounce to
 *   /signin are a trap, not navigation.
 * - **No `BackLink`.** The viewer arrived from WhatsApp; there is nowhere to go
 *   back to, and a link to /vocab would bounce them to sign-in.
 * - **No sharer.** No name, no avatar, no "shared by". The display name is
 *   Google's rather than something the user curated, and a link is forwarded
 *   beyond the sharer's intent by design (F16 D8).
 *
 * The shape below is `/vocab/[id]` minus everything that belongs to an owner —
 * the same `termSizeClass`, the same mono pronunciation, the same hairline rule,
 * the same left-ruled examples — because a shared word should look like the word
 * it is, not like a landing page.
 *
 * **The CTA is the last row of the flex column, not the last child of the
 * scrolling pane**, which is the one place this page departs from `/vocab/[id]`.
 * There the Practise button scrolls with the word and that is fine: the reader
 * owns the word and arrived on purpose. Here it is the only thing the page
 * exists to offer, to someone who arrived from a message and may not scroll —
 * and it was measured going 150px under the fold at 320×568 with a long word
 * before it was pulled out. `tests/e2e/share-frame.spec.ts` asserts its bottom
 * edge is inside the viewport, which is the `viewport-fit=cover` failure
 * ([R16]) that `var(--pad-bottom)` exists to prevent.
 */
export function SharedWord({
  payload,
  claimHref,
}: {
  payload: SharedWordPayload;
  /** Where "Practise this word" goes. F17 owns everything past the tap. */
  claimHref: string;
}) {
  const { term, pronunciation, partOfSpeech, definition, examples } = payload;

  return (
    <Screen>
      <ScreenBody scroll padded={false} className="px-6 pb-5">
        {/* The only branding on the page, and the only answer a stranger has to
            "what is this?" */}
        <Eyebrow>Daily Words</Eyebrow>

        <h1
          className={cn(
            "m-0 pt-2 font-normal break-words text-pretty",
            termSizeClass(term),
          )}
          title={term}
        >
          {term}
        </h1>

        {(pronunciation || partOfSpeech) && (
          <div className="flex items-baseline gap-3 pt-3">
            {/* IPA in mono, always: Source Serif 4's latin subset does not
                guarantee the IPA Extensions block and the fallback is visible. */}
            {pronunciation && (
              <span className="font-mono text-mono-lg text-ink-2">{pronunciation}</span>
            )}
            {partOfSpeech && (
              <span className="text-sm italic text-ink-3">{partOfSpeech}</span>
            )}
          </div>
        )}

        <div className="mt-4.5 h-px bg-rule" />

        {definition && (
          <p className="m-0 py-4.5 pb-6.5 text-[21px] leading-[1.35] tracking-tight text-pretty">
            {definition}
          </p>
        )}

        {/* Never a "Usage" heading over nothing — the absence reads better than
            an apology for it. */}
        {examples.length > 0 && (
          <>
            <Eyebrow>Usage</Eyebrow>
            <div className="flex flex-col gap-3.5 pt-3 pb-7">
              {examples.map((example, i) => (
                <Prose key={i} size="body" className="border-l border-rule pl-3.5">
                  {example}
                </Prose>
              ))}
            </div>
          </>
        )}

      </ScreenBody>

      {/* Outside the pane, so it is on screen whatever the word does. The
          user's own words for this feature, and the same label the private
          detail page carries. `position: fixed` is not an option — that belongs
          to `Screen`, and on iOS a fixed element measured against a viewport
          animating under the URL bar is the classic Safari layout bug. */}
      <footer
        className="shrink-0 px-6 pt-3"
        style={{ paddingBottom: "var(--pad-bottom)" }}
      >
        {/* A client component for one reason: it appends the browser's detected
            timezone to the link. F17 needs a real zone before the OAuth hop,
            because the claim completes onboarding and writes may not fall back to
            a default. It is still a link, and it still works without JS. */}
        <PractiseThisWord claimHref={claimHref} />
      </footer>
    </Screen>
  );
}
