import { cn } from "@/lib/ui/cn";
import { TabBar } from "@/components/nav/tab-bar";
import { PaneScrollMemory } from "@/components/layout/pane-scroll-memory";
import { VisualViewportProbe } from "@/components/layout/visual-viewport";

/**
 * The layout primitive that owns the vertical budget.
 *
 * Everything the app draws sits inside exactly one of these. The frame is a
 * fixed-height flex column with `overflow: hidden`; scrolling, where a screen
 * wants it, is an inner pane's business and never the page's. Header and tab
 * bar are rows in the flow, not `position: fixed` — a fixed element measured
 * against a viewport that is animating under the URL bar is the classic iOS
 * Safari layout bug, and this shape does not have it.
 *
 * Nothing else in the app may set `height: 100vh`, `position: fixed`, or
 * `overflow` on `<body>`. Those are this component's job and duplicating them
 * is how the budget breaks.
 */
export function Screen({
  children,
  tabs = false,
  keyboardAware = false,
  className,
}: {
  children: React.ReactNode;
  /** Render the four-item tab bar. False on /signin, /onboarding and detail routes. */
  tabs?: boolean;
  /**
   * Size the frame to `visualViewport` rather than `100dvh`.
   *
   * For the one screen with a text field pinned to the bottom of the column:
   * F6's chat composer. `dvh` tracks Safari's URL bar but not its keyboard, so
   * without this the composer sits under the keyboard the moment it is focused.
   * Everywhere else the field scrolls in a pane and the default is correct —
   * turning this on globally would make every screen re-layout on every focus.
   */
  keyboardAware?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("dw-screen", keyboardAware && "dw-screen-kb")}>
      {keyboardAware && <VisualViewportProbe />}
      <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
        {children}
      </div>
      {tabs && <TabBar />}
    </div>
  );
}

/**
 * The gutter-padded region a screen's content lives in.
 *
 * `top` exists so the two shapes the design actually uses are one component
 * rather than two hand-rolled divs. Pass it when a title block must stay put
 * while a list scrolls under it; the top block gets the safe-area padding and
 * the scrolling pane starts flush beneath it. Omit it and the whole pane is one
 * piece, which is what /today and /calendar want.
 */
export function ScreenBody({
  children,
  top,
  scroll = false,
  padded = true,
  restoreScroll,
  className,
}: {
  children: React.ReactNode;
  /** A non-scrolling block pinned above the pane. Gets the safe-area inset. */
  top?: React.ReactNode;
  /** Opt into scrolling. The default is a pane that has undertaken not to. */
  scroll?: boolean;
  /** Apply the design's horizontal gutter. Off for full-bleed panes. */
  padded?: boolean;
  /**
   * Remember this pane's offset for the tab session, under this key, and put it
   * back when the screen mounts again. See `pane-scroll-memory.tsx` for why the
   * platform cannot do this for us: nothing in the app scrolls `window`, and
   * `window.scrollY` is all either restoration mechanism knows how to restore.
   *
   * **Opt-in, one screen at a time, and deliberately not the default.** A
   * restored offset is right for a list the user was reading down and wrong for
   * a pane that is anchored somewhere — the chat transcript sits at its
   * bottom — so turning it on everywhere would change screens nobody asked
   * about. Ignored unless `scroll` is set; a pane that cannot scroll has no
   * offset to keep.
   */
  restoreScroll?: string;
  className?: string;
}) {
  const gutter = padded && "px-[var(--gutter)]";
  const pane = scroll ? "dw-pane-scroll" : "dw-pane-fixed";
  /**
   * How `PaneScrollMemory` finds the pane. It renders `null` and reads this
   * attribute rather than carrying a `ref`, because a ref needs an element and
   * an extra element in a flex column is an extra `gap`.
   */
  const scrollKey = scroll ? restoreScroll : undefined;
  const memory = scrollKey ? <PaneScrollMemory storageKey={scrollKey} /> : null;

  if (top) {
    return (
      <>
        <div
          className={cn("shrink-0 bg-paper", gutter)}
          style={{ paddingTop: "var(--pad-top)" }}
        >
          {top}
        </div>
        <div
          className={cn("flex min-h-0 flex-1 flex-col", gutter, pane, className)}
          data-dw-scroll-key={scrollKey}
        >
          {memory}
          {children}
        </div>
      </>
    );
  }

  return (
    <div
      className={cn("flex min-h-0 flex-1 flex-col", gutter, pane, className)}
      style={{ paddingTop: "var(--pad-top)" }}
      data-dw-scroll-key={scrollKey}
    >
      {memory}
      {children}
    </div>
  );
}

/**
 * A screen's title row: optional eyebrow, a title, and one trailing control.
 *
 * Deliberately not the `PageHeader` of F2 §6.17. That component fixed a 48px
 * bar with a `{title, subtitle, trailing}` shape, and the design gives every
 * screen a different header — /today carries a date eyebrow and a streak pill,
 * /vocab a filled "+ Word" button and an underline tab strip beneath, /chat a
 * ruled bar with the word being practised. A single frozen prop shape cannot
 * express those, so this composes instead of prescribing.
 */
export function ScreenHeader({
  eyebrow,
  title,
  trailing,
  className,
}: {
  eyebrow?: React.ReactNode;
  title?: React.ReactNode;
  /** One control, right-aligned on the title's baseline. */
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex items-baseline justify-between gap-3", className)}>
      <div className="flex min-w-0 flex-col gap-[3px]">
        {eyebrow}
        {title != null && (
          <h1 className="m-0 text-2xl font-normal tracking-title">{title}</h1>
        )}
      </div>
      {trailing}
    </header>
  );
}
