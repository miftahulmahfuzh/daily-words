export type TabKey = "today" | "vocab" | "journal" | "profile";

/**
 * The four tabs. Exactly four, fixed, and the only navigation surface in the
 * app — no hamburger, no drawer, no nested navigation.
 *
 * /calendar matches the Today tab rather than earning a fifth: it is reached
 * from the streak pill on /today and is a view of the same thing. A tab bar
 * that highlights nothing while the user is on a real screen reads as a bug.
 */
export const TAB_ITEMS = [
  { key: "today", label: "Today", href: "/today", match: ["/today", "/calendar"] },
  { key: "vocab", label: "Vocab", href: "/vocab", match: ["/vocab"] },
  { key: "journal", label: "Journal", href: "/journal", match: ["/journal"] },
  { key: "profile", label: "Profile", href: "/profile", match: ["/profile"] },
] as const satisfies ReadonlyArray<{
  key: TabKey;
  label: string;
  href: string;
  match: readonly string[];
}>;

/** Which tab owns a pathname, or null on a route outside the tab bar. */
export function activeTab(pathname: string): TabKey | null {
  const hit = TAB_ITEMS.find((tab) =>
    tab.match.some((m) => pathname === m || pathname.startsWith(`${m}/`)),
  );
  return hit?.key ?? null;
}
