"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/ui/cn";
import { TAB_ITEMS, activeTab } from "./tab-items";

/**
 * Four words and a dot.
 *
 * No glyphs — ROADMAP [R18]: "No icons anywhere." The active state is a 5px
 * accent dot above the label plus the label darkening to full ink, and the dot
 * slot is reserved on every item so nothing shifts when the tab changes.
 *
 * Rendered by `Screen`, never by a route. It is a flow row inside the frame,
 * not `position: fixed`, which is what removes the whole class of "content
 * hidden behind the tab bar when the URL bar moves" bugs.
 */
export function TabBar({ className }: { className?: string }) {
  const pathname = usePathname();
  const active = activeTab(pathname);

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "grid shrink-0 grid-cols-4 border-t border-rule bg-paper px-1",
        className,
      )}
      style={{ paddingBottom: "var(--pad-bottom)" }}
    >
      {TAB_ITEMS.map((tab) => {
        const current = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={current ? "page" : undefined}
            className="flex min-h-[50px] flex-col items-center gap-1.5 pt-[11px] pb-1.5 font-mono text-mono-sm tracking-nav uppercase"
          >
            <span className="flex h-[5px] items-center">
              {current && (
                <span className="block size-[5px] rounded-full bg-accent" />
              )}
            </span>
            <span className={current ? "text-ink" : "text-ink-3"}>
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
