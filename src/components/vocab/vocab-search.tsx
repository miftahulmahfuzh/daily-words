"use client";

import { useRef } from "react";
import { ClearButton } from "@/components/ui/clear-button";
import { TextInput } from "@/components/ui/text-input";
import { MAX_SEARCH_CHARS } from "@/lib/vocab/format";

/**
 * The collection's one control. A controlled input, and nothing else.
 *
 * It holds no state, reads no router and writes no URL. All three used to live
 * here, and the combination is what made a typed character visibly disappear:
 * the component kept one `urlQ` slot that meant both "what we asked the URL to
 * become" and "what the server says the URL is", and a render-phase sync read
 * the disagreement between the two — which lasts for the whole of a round trip —
 * as "the URL moved underneath us", and reverted the field to the stale server
 * value. See `mine-client.tsx`, which now owns all of it and keeps the two facts
 * apart. **The ref below is none of those three things** — it is a handle on the
 * element, not a fact about the query — so that invariant is unweakened.
 *
 * No clear button of its own: `type="search"` gives iOS Safari a native one, and
 * the no-matches empty state carries a "Clear search" action for everyone else.
 * A third affordance inside a 40px field is chrome, not help.
 *
 * **Amended by F26.** Both premises above are true and both are about the
 * *empty* field, which is why the last clause survives intact — the mark is
 * drawn only when there is a value, so an empty field is byte-for-byte what it
 * was. What the argument missed is the query that **does** match: the empty
 * state's action exists only when nothing matched, and the native control is not
 * a floor but a coin flip — Chrome on Android draws none, and Firefox has never
 * drawn one on any platform. So the ordinary case, the field working, had no
 * clear affordance on screen at all on most browsers.
 *
 * The native one is suppressed in `globals.css` rather than relied on: Chrome
 * and Safari draw theirs *as well*, and two X marks side by side is what this
 * would otherwise ship with on the desktop browsers it gets reviewed in.
 */
export function VocabSearch({
  value,
  onChange,
  total,
}: {
  value: string;
  /** Called with the raw field value. Normalisation is the parent's business. */
  onChange: (next: string) => void;
  /** Size of the whole collection, ignoring the search. Placeholder only. */
  total: number;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <TextInput
      ref={input}
      type="search"
      name="q"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      maxLength={MAX_SEARCH_CHARS}
      inputMode="search"
      enterKeyHint="search"
      aria-label="Search your collection"
      placeholder={total > 0 ? `Search ${total} words` : "Search"}
      className="h-10"
      inputClassName="h-10 text-body"
      leading={<span className="font-mono text-mono-md text-ink-3">/</span>}
      trailing={
        value ? (
          <ClearButton
            label="Clear search"
            /* Empty it, then hand focus back: clearing is what a user does
               before typing something else, which is what both native
               implementations do. `.focus()` is honoured on iOS because this
               runs inside the gesture that asked for it — see `composer.tsx`. */
            onClick={() => {
              onChange("");
              input.current?.focus();
            }}
          />
        ) : null
      }
    />
  );
}
