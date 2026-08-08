"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TextInput } from "@/components/ui/text-input";
import { MAX_SEARCH_CHARS } from "@/lib/vocab/format";
import { vocabListHref } from "@/lib/vocab/links";

/**
 * The collection's one control.
 *
 * The search term lives in the **URL**, not in local state, and that is the
 * load-bearing decision for the whole screen: the user searches "gen", taps a
 * word, presses back, and Next.js restores the same filtered list at the same
 * scroll offset because the URL never changed. `useState` in a parent loses
 * that on every navigation.
 *
 * `replace`, not `push` — otherwise the back button walks the user backwards
 * through "g", "ge", "gen" instead of leaving the screen.
 *
 * No clear button of its own: `type="search"` gives iOS Safari a native one,
 * and the no-matches empty state carries a "Clear search" action for everyone
 * else. A third affordance inside a 40px field is chrome, not help.
 */
export function VocabSearch({
  initialQ,
  total,
}: {
  /** What the URL currently holds. The source of truth. */
  initialQ: string;
  total: number;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialQ);
  /**
   * What we believe the URL holds. Without it, "Clear search" navigates to
   * `/vocab`, the debounce below sees `value` still reading "gen", and pushes
   * the query straight back — the button would visibly undo itself.
   */
  const [urlQ, setUrlQ] = useState(initialQ);

  if (initialQ !== urlQ) {
    // The URL moved underneath us: back button, or a link elsewhere on the page.
    setUrlQ(initialQ);
    setValue(initialQ);
  }

  useEffect(() => {
    const next = value.trim();
    if (next === urlQ) return;
    const timer = setTimeout(() => {
      setUrlQ(next);
      router.replace(vocabListHref({ q: next || undefined }), { scroll: false });
    }, 250);
    return () => clearTimeout(timer);
  }, [value, urlQ, router]);

  return (
    <TextInput
      type="search"
      name="q"
      value={value}
      onChange={(e) => setValue(e.target.value)}
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
