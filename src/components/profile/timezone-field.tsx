"use client";

import { useState } from "react";
import { Eyebrow, Meta } from "@/components/ui/text";
import { TextInput } from "@/components/ui/text-input";
import { MAX_TIMEZONE_LEN } from "@/lib/profile/constants";
import { isValidTimeZone, supportedTimeZones } from "@/lib/profile/timezone";

/**
 * The only place in the app a user ever sees the word "time zone".
 *
 * It is shown, not asked. The row reads back what was detected; changing it is
 * one tap behind a text button, because the case it serves — a VPN, or a device
 * with the wrong zone set — is rare and the machine is usually right.
 *
 * A native `<select>` where `Intl.supportedValuesOf` exists (iOS 15.4+, Node 20),
 * and a validated text field where it does not. The enumerated list is fine for a
 * *picker*; it is not used for validation, because it omits live aliases like
 * `Asia/Calcutta` that `Intl.DateTimeFormat` accepts.
 */
export function TimezoneField({
  value,
  storedSource,
  changed,
  onChange,
}: {
  value: string;
  storedSource: "detected" | "manual";
  /** True once the user has picked something other than what was stored. */
  changed: boolean;
  onChange: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [zones] = useState<string[] | null>(() => supportedTimeZones());
  const [typed, setTyped] = useState(value);

  // "(detected)" until the user commits a change; a label claiming they set it
  // before they have saved would be a lie the next reload contradicts.
  const label = changed || storedSource === "manual" ? "set by you" : "detected";

  return (
    // No top rule: the tone list above ends with one, and two hairlines a few
    // pixels apart read as a rendering fault rather than as a division.
    <div className="flex flex-col gap-2.5">
      <Eyebrow>Time zone</Eyebrow>

      {editing ? (
        zones ? (
          <select
            aria-label="Time zone"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-[46px] rounded-[var(--r-field)] border border-rule bg-card px-3 text-base text-ink"
          >
            {/* The stored value may be an alias the enumerated list omits, so it
                is offered explicitly or the select would silently re-point the
                user at whatever happens to be first. */}
            {!zones.includes(value) && <option value={value}>{value}</option>}
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        ) : (
          <TextInput
            name="timezone"
            aria-label="Time zone"
            placeholder="Asia/Jakarta"
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value);
              // Only promoted to the form's value once it is a real zone; the
              // server refuses anything else with a 400 the form cannot use.
              if (isValidTimeZone(e.target.value.trim())) onChange(e.target.value.trim());
            }}
            autoComplete="off"
            enterKeyHint="done"
            maxLength={MAX_TIMEZONE_LEN}
          />
        )
      ) : (
        <div className="flex min-h-[44px] items-center justify-between gap-3">
          <span className="min-w-0 truncate text-base text-ink">
            {value} <span className="text-ink-3">({label})</span>
          </span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="shrink-0 py-2 pl-4 font-mono text-mono-sm tracking-nav text-ink-3 uppercase"
          >
            Change
          </button>
        </div>
      )}

      {editing && (
        <Meta>
          {zones ? "Saved as your choice." : "An IANA name, like Asia/Jakarta."}
        </Meta>
      )}
    </div>
  );
}
