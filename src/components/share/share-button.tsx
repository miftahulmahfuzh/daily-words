"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TextInput } from "@/components/ui/text-input";
import { Meta } from "@/components/ui/text";
import { cn } from "@/lib/ui/cn";
import { createShare, revokeShare } from "@/lib/share/client";
import type { CreateShareRequest } from "@/lib/share/schemas";
import {
  shareHandoff,
  SHARE_COPIED_NOTICE,
  SHARE_COPY_LABEL,
  SHARE_FIELD_LABEL,
  SHARE_REVOKE_ARMED_LABEL,
  SHARE_REVOKE_LABEL,
} from "@/lib/share/policy";

/**
 * The Share affordance, for all three entities: one tap to create, two taps to
 * revoke, and no page refresh in either direction.
 *
 * **F18 generalised F16's `ShareWordButton` rather than writing a second
 * button.** The chain below — `navigator.share`, then the clipboard, then a
 * selectable field — is the part of this feature most likely to behave
 * differently on a real phone than in development, and a card or a journal entry
 * whose Share control had drifted from the word's would be the worst place to
 * find that out. One component, three call sites, one set of failure modes.
 *
 * `entityType` and `entityId` are the only things that vary. `title` is what a
 * native share sheet shows above the link, so it is a word, a date or the first
 * line of an entry depending on what is being shared.
 *
 * **There is one shape, not two.** F18 D3 wanted a compact 32px variant for
 * `/today`'s header; the header was measured and it does not fit at 375px with a
 * three-digit streak, so D3's own fallback was taken — the date on `/today` links
 * to `/card/[date]`, and the control lives there at a full 44px. A variant with
 * no caller was removed rather than left to rot.
 *
 * **Text, never an icon.** [R18] removed the icon set, and
 * `delete-word-button.tsx` already records why: an unlabelled control is exactly
 * the ambiguity Product Principle 1 rejects. Drawn identically to that button —
 * `min-h-[44px]`, mono, uppercase, `text-ink-3` — because it belongs to the same
 * stack at the foot of the same pane and the kit is frozen.
 *
 * ## The share chain, and the iOS trap
 *
 * `navigator.share` needs a secure context **and transient user activation** —
 * it must run inside the click handler. Awaiting a `fetch` first may consume the
 * activation and make the call reject with `NotAllowedError`. This could not be
 * verified on a real iPhone during development (F16 R1), so the chain is built
 * so that **every** failure lands somewhere usable:
 *
 *   1. `navigator.share({ title, url })`. If it rejects with `AbortError`,
 *      **stop** — the user dismissed the sheet, which is a success, and falling
 *      through to the clipboard would silently copy something they declined to
 *      send. **No `text` field**: with one, iOS concatenates it onto the URL and
 *      the sheet's *Copy* yields `"genteel https://…"` rather than a link. The
 *      payload is built by `shareHandoff`, not written out here.
 *   2. Any other rejection, or no `navigator.share`: `navigator.clipboard` gets
 *      `handoff.text`, the bare URL, and a `Link copied` line.
 *   3. Always, regardless: the same bare URL sits in a selectable read-only
 *      field. **The terminal state is never "nothing happened."**
 *
 * Once the share exists, `Copy link` runs the same chain with the URL already in
 * hand, so that tap carries its activation intact — which is the shape to fall
 * back to wholesale if step 1 turns out to reject reliably on iOS.
 *
 * ## What is deliberately not here
 *
 * **No "update the shared copy".** The payload is a snapshot of what was shared
 * (D3). Publishing an edit means stopping and sharing again, which mints a new
 * slug and kills the old link — the honest outcome, because the person you sent
 * the old text to keeps seeing what you actually sent them until you revoke it.
 * A third control on this page loses to Product Principle 1.
 */
export function ShareButton({
  entityType,
  entityId,
  title,
  label,
  initialSlug,
  initialUrl,
}: {
  entityType: CreateShareRequest["entityType"];
  entityId: string;
  /**
   * The native share sheet's heading. Never the sharer's name, and never the
   * `text` field — see `shareHandoff`.
   */
  title: string;
  /** The un-shared call to action. "Share this word" / "…card" / "…line". */
  label: string;
  /** The server already knows, from `getShareForEntity` beside the page read. */
  initialSlug: string | null;
  initialUrl: string | null;
}) {
  const router = useRouter();
  const [slug, setSlug] = useState(initialSlug);
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!armed) return;
    // A control left armed because the user's thumb moved on is a trap for the
    // next tap. Same four seconds as `DeleteWordButton` and `ToggleRow`.
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 4000);
    return () => clearTimeout(timer);
  }, [copied]);

  /** Steps 1 and 2 of the chain. Step 3 is the field, which is always drawn. */
  async function handOff(target: string) {
    const { sheet, text } = shareHandoff(title, target);

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share(sheet);
        return;
      } catch (err) {
        // The user dismissed the sheet. That is a completed intention, not a
        // failure, and copying behind their back would be the wrong answer.
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // `navigator.clipboard` needs a secure context: localhost:3200 qualifies,
      // http://192.168.x.x:3200 does not. The selectable field below is the
      // floor, and it always works.
    }
  }

  async function handleShare() {
    if (busy) return;
    setProblem(null);

    if (url) {
      await handOff(url);
      return;
    }

    setBusy(true);
    const result = await createShare(entityType, entityId);
    setBusy(false);

    if (!result.ok) {
      setProblem(result.message);
      return;
    }

    setSlug(result.data.slug);
    setUrl(result.data.url);
    await handOff(result.data.url);
  }

  async function handleRevoke() {
    if (busy || !slug) return;
    if (!armed) {
      setArmed(true);
      return;
    }

    setArmed(false);
    setBusy(true);
    setProblem(null);
    const result = await revokeShare(slug);
    setBusy(false);

    // A 404 means it is already gone — the user's intent is satisfied either
    // way, so it is treated as success rather than as an error to explain.
    if (!result.ok && result.code !== "not_found") {
      setProblem(result.message);
      return;
    }

    setSlug(null);
    setUrl(null);
    setCopied(false);
    // The server component reads `getShareForEntity` on render; without this a
    // back-and-forward would draw the stale shared state.
    router.refresh();
  }

  const control =
    "flex min-h-[44px] items-center font-mono text-mono-sm tracking-nav uppercase";

  if (!url) {
    return (
      <div className="flex flex-col items-start gap-2 pt-5">
        <button
          type="button"
          onClick={() => void handleShare()}
          disabled={busy}
          className={cn(control, "text-ink-3", busy && "opacity-60")}
        >
          {label}
        </button>
        {problem && <Meta className="text-red">{problem}</Meta>}
      </div>
    );
  }

  // The same record the chain hands off, so the field cannot drift from the
  // clipboard: both draw `text`.
  const payload = shareHandoff(title, url);

  return (
    <div className="flex flex-col items-start gap-2 pt-5">
      {/* Step 3, and the reason the other two are allowed to fail: whatever the
          platform does, the link is on screen and selectable. */}
      <label htmlFor="share-url" className="sr-only">
        {SHARE_FIELD_LABEL}
      </label>
      <TextInput
        id="share-url"
        value={payload.text}
        readOnly
        onFocus={(e) => e.currentTarget.select()}
        className="w-full"
        inputClassName="font-mono text-mono-sm"
      />
      <div className="flex items-center gap-5">
        <button
          type="button"
          onClick={() => void handleShare()}
          disabled={busy}
          className={cn(control, "text-ink-3", busy && "opacity-60")}
        >
          {SHARE_COPY_LABEL}
        </button>
        <button
          type="button"
          onClick={() => void handleRevoke()}
          disabled={busy}
          className={cn(control, armed ? "text-red" : "text-ink-3", busy && "opacity-60")}
        >
          {armed ? SHARE_REVOKE_ARMED_LABEL : SHARE_REVOKE_LABEL}
        </button>
      </div>
      {copied && <Meta>{SHARE_COPIED_NOTICE}</Meta>}
      {problem && <Meta className="text-red">{problem}</Meta>}
    </div>
  );
}
