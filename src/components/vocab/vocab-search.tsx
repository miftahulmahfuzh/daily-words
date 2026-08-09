"use client";

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
 * apart.
 *
 * No clear button of its own: `type="search"` gives iOS Safari a native one, and
 * the no-matches empty state carries a "Clear search" action for everyone else.
 * A third affordance inside a 40px field is chrome, not help.
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
  return (
    <TextInput
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
    />
  );
}
