import Link from "next/link";
import { TabBar } from "./tab-bar";

/**
 * The layout primitive that owns the vertical budget.
 *
 * Everything the app draws sits inside one of these. The frame is a fixed-height
 * flex column with `overflow: hidden`; scrolling, where a screen wants it, is the
 * inner pane's business and never the page's.
 */
export function Screen({
  children,
  tabs = false,
  className = "",
}: {
  children: React.ReactNode;
  tabs?: boolean;
  className?: string;
}) {
  return (
    <div className="dw-screen">
      <div className={`flex min-h-0 flex-1 flex-col ${className}`}>
        {children}
      </div>
      {tabs && <TabBar />}
    </div>
  );
}

/** The gutter-padded region a screen's content lives in. */
export function ScreenBody({
  children,
  scroll = false,
  className = "",
}: {
  children: React.ReactNode;
  scroll?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex min-h-0 flex-1 flex-col px-[var(--gutter)] ${
        scroll ? "overflow-y-auto" : "overflow-hidden"
      } ${className}`}
      style={{ paddingTop: "var(--pad-top)" }}
    >
      {children}
    </div>
  );
}

/** Top-left back affordance. Sits where an edge-swipe would also work. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-[44px] items-center pr-3 font-mono text-[11px] tracking-[0.14em] text-ink-3 uppercase"
    >
      ←&nbsp; {label}
    </Link>
  );
}

/** Small uppercase mono label. The machine's voice. */
export function Label({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`font-mono text-[10px] tracking-[0.2em] text-ink-3 uppercase ${className}`}
    >
      {children}
    </span>
  );
}

/** The filled primary action. One per screen, in the lower third. */
export function PrimaryButton({
  children,
  href,
  className = "",
}: {
  children: React.ReactNode;
  href?: string;
  className?: string;
}) {
  const cls = `flex h-[52px] w-full items-center justify-center rounded-[var(--r-field)] border border-ink bg-ink font-mono text-[12px] tracking-[0.16em] text-paper uppercase ${className}`;
  return href ? (
    <Link href={href} className={cls}>
      {children}
    </Link>
  ) : (
    <button type="button" className={cls}>
      {children}
    </button>
  );
}
