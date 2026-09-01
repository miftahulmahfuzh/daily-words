"use client";

import { useRef } from "react";
import { ClearButton } from "@/components/ui/clear-button";
import { TextInput } from "@/components/ui/text-input";
import { JOURNAL_SEARCH_MAX_CHARS } from "@/lib/journal/search";

/**
 * The journal's search field. A controlled input, and nothing else.
 *
 * `VocabSearch` is the model, down to holding no state, reading no router and
 * writing no URL — F19's bug was one component owning both "what we asked the
 * URL to become" and "what the server says it is", and the fix was to move all
 * three out. `JournalFeed` owns them here for the same reason. The ref below is
 * none of those three: a handle on the element, not a fact about the query.
 *
 * Two differences from the vocab twin, both deliberate:
 *
 * - **It is not sticky.** `VocabSearch` sits inside the scrolling pane and needs
 *   `position: sticky` to stay put; this one lives in `ScreenBody`'s `top`
 *   block, which does not scroll at all. A `sticky` here would be inert
 *   decoration, and the `top-[62px]` offsets the Collection's letter headings
 *   carry to clear it have no counterpart in the journal's date headings.
 * - **The placeholder does not count.** `/vocab` draws "Search 214 words" from a
 *   `count(*)` it already runs; the journal has no count query and adding one to
 *   fill in a placeholder would be a second statement on every page load for a
 *   number nothing else uses.
 *
 * No clear button of its own: `type="search"` gives iOS Safari a native one, and
 * the no-matches empty state carries a "Clear search" action for everyone else.
 *
 * **Amended by F26**, in step with the vocab twin and for the reasons written
 * out there: the argument above holds for the *empty* field and the mark is only
 * drawn when there is a value, so nothing about the empty state changed. The
 * clause it does not cover is a query that matches, where — outside iOS and
 * desktop Safari — no clear affordance was on screen at all.
 */
export function JournalSearch({
  value,
  onChange,
}: {
  value: string;
  /** Called with the raw field value. Normalisation is the parent's business. */
  onChange: (next: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <TextInput
      ref={input}
      type="search"
      name="q"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      maxLength={JOURNAL_SEARCH_MAX_CHARS}
      inputMode="search"
      enterKeyHint="search"
      aria-label="Search your journal"
      placeholder="Search your lines"
      className="h-10"
      inputClassName="h-10 text-body"
      leading={<span className="font-mono text-mono-md text-ink-3">/</span>}
      trailing={
        value ? (
          <ClearButton
            label="Clear search"
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
