"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/* Four words and a dot. The design has no icons anywhere — see ROADMAP [R18]. */
const TABS = [
  { href: "/today", label: "Today", match: ["/today", "/calendar"] },
  { href: "/vocab", label: "Vocab", match: ["/vocab"] },
  { href: "/journal", label: "Journal", match: ["/journal"] },
  { href: "/profile", label: "Profile", match: ["/profile"] },
] as const;

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="grid shrink-0 grid-cols-4 border-t border-rule bg-paper px-1"
      style={{ paddingBottom: "var(--pad-bottom)" }}
    >
      {TABS.map((tab) => {
        const active = tab.match.some(
          (m) => pathname === m || pathname.startsWith(`${m}/`),
        );
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="flex min-h-[50px] flex-col items-center gap-1.5 pt-[11px] pb-1.5 font-mono text-[11px] tracking-[0.14em] uppercase"
          >
            <span className="flex h-[5px] items-center">
              {active && (
                <span className="block size-[5px] rounded-full bg-accent" />
              )}
            </span>
            <span className={active ? "text-ink" : "text-ink-3"}>
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
