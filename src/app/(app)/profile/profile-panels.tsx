"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { BadgeDialog, type DialogSelection } from "@/components/gamification/badge-dialog";

/**
 * The one dialog on /profile, and the only thing that may open it.
 *
 * **"There is exactly one modal in the app" is an element, not just a
 * component.** F13 mounted one `<dialog>` from `BadgeShelf`; F22 made the level
 * rows open the same panel, and mounting a second instance from `LevelBlocks`
 * would have put two `<dialog>` elements in /profile's DOM — one of them
 * permanently empty. That is the same argument `badge-shelf.tsx` already makes
 * one level down ("One dialog instance … not fourteen, one per badge"), and it
 * is measurable: the layout spec's `locator("dialog")` resolved to two elements
 * the moment the second one appeared, which is how this was caught.
 *
 * The two islands are **not adjacent** — the stats grid and the "keeping a card
 * since" line sit between the level blocks and the badge shelf — so the state
 * cannot simply be lifted into a wrapper component that renders both. It is a
 * context instead: this provider takes the server tree as `children`, so
 * everything between the two islands stays a server component and only the
 * islands themselves are client code.
 */

const OpenPanelContext = createContext<((selection: DialogSelection | null) => void) | null>(
  null,
);

/**
 * Throws rather than no-ops when a row is rendered outside the provider. A row
 * that silently does nothing on tap is the failure this cannot afford: it looks
 * exactly like a row that was never meant to be tappable.
 */
export function useOpenPanel(): (selection: DialogSelection | null) => void {
  const open = useContext(OpenPanelContext);
  if (!open) {
    throw new Error("a profile panel row was rendered outside <ProfilePanels>");
  }
  return open;
}

export function ProfilePanels({
  children,
  initialSelection = null,
}: {
  children: ReactNode;
  /** /kitchen-sink only: `?badge=` / `?level=`, resolved on the server. */
  initialSelection?: DialogSelection | null;
}) {
  const [selection, setSelection] = useState<DialogSelection | null>(initialSelection);

  return (
    <OpenPanelContext.Provider value={setSelection}>
      {children}
      <BadgeDialog selection={selection} onClose={() => setSelection(null)} />
    </OpenPanelContext.Provider>
  );
}
