"use client";

import { useState } from "react";
import { Chip, ChipSelect } from "@/components/profile/chip-select";
import { TextInput } from "@/components/ui/text-input";
import {
  INTEREST_CHIPS,
  MAX_INTEREST_LEN,
  MAX_INTERESTS,
} from "@/lib/profile/constants";
import { toggleCapped } from "@/lib/profile/selection";

/**
 * Q2's input, shared by the onboarding flow and /profile/edit.
 *
 * The twelve presets plus one free-text escape, capped at five between them. The
 * cap is why this is a component rather than a bare `ChipSelect`: the typed
 * entries and the tapped chips compete for the same five slots, so something has
 * to own the merge.
 *
 * The parent holds one `string[]` and hands over its updater, not its value.
 * Which chips are lit and what is in the text field are both derived from that
 * array, so the edit form pre-fills from a stored row with nothing extra on the
 * wire — and every write is a function of the previous selection, so a fast
 * series of taps cannot drop one.
 */

const PRESETS = INTEREST_CHIPS.map((c) => ({ value: c.slug, label: c.label }));
const PRESET_SLUGS = new Set<string>(INTEREST_CHIPS.map((c) => c.slug));

const isPreset = (slug: string) => PRESET_SLUGS.has(slug);

/** Comma-separated free text → slugs, in the shape the server normalises to. */
function parseOther(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const slug = part.replace(/\s+/gu, " ").trim().toLowerCase().slice(0, MAX_INTEREST_LEN);
    if (slug.length > 0 && !isPreset(slug) && !out.includes(slug)) out.push(slug);
  }
  return out;
}

export function InterestsField({
  value,
  onChange,
}: {
  value: string[];
  /** The parent's updater. A plain value would reintroduce the dropped-tap race. */
  onChange: (update: (previous: string[]) => string[]) => void;
}) {
  const stored = value.filter((slug) => !isPreset(slug));

  const [other, setOther] = useState(() => stored.join(", "));
  const [showOther, setShowOther] = useState(() => stored.length > 0);

  function editOther(text: string) {
    setOther(text);
    // The typed entries are replaced wholesale; the chips keep their tap order
    // and their claim on the five slots.
    onChange((previous) =>
      [...previous.filter(isPreset), ...parseOther(text)].slice(0, MAX_INTERESTS),
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ChipSelect
        options={PRESETS}
        selected={value}
        onToggle={(slug) =>
          onChange((previous) => toggleCapped(previous, slug, MAX_INTERESTS))
        }
      />

      {showOther ? (
        <TextInput
          name="interests-other"
          aria-label="Anything else"
          placeholder="anything else?"
          value={other}
          onChange={(e) => editOther(e.target.value)}
          autoCapitalize="none"
          autoComplete="off"
          enterKeyHint="done"
          maxLength={MAX_INTEREST_LEN * MAX_INTERESTS}
        />
      ) : (
        <Chip onClick={() => setShowOther(true)} className="self-start">
          + Other
        </Chip>
      )}
    </div>
  );
}
