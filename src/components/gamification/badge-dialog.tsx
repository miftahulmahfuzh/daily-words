"use client";

import { useEffect, useId, useRef } from "react";
import { ArtHero } from "@/components/gamification/art-hero";
import { Button } from "@/components/ui/button";
import { Eyebrow, Meta, Prose } from "@/components/ui/text";
import { BADGE_ART, BADGE_ART_SIZE } from "@/lib/gamification/badge-art";
import { BADGE_META } from "@/lib/gamification/badge-meta";
import type { BadgeKey } from "@/lib/gamification/badges";
import { formatLocalDateLong, type LocalDate } from "@/lib/time/local-date";

/**
 * The one modal in the app.
 *
 * The user's ask: "we should be able to make each badge and achievements
 * clickable. if we click it, it will pop up a big modal, showing a picture of
 * the medal, and what this badge means".
 *
 * **A native `<dialog>` opened with `showModal()`, not a route.** The roadmap's
 * "every feature plan must assume routes" gives four reasons, and its strongest
 * one — a full-page modal "breaks fixed-height layout math when the URL bar
 * collapses" — inverts here. `showModal()` puts the element in the **top layer**:
 * outside `.dw-screen`'s flex column, outside its `overflow: hidden`, outside the
 * `100dvh` arithmetic, sized by its own content against the viewport. It
 * contributes **zero height to the budget** — the same property
 * `src/components/README.md` already accepts for `RewardToast`. A route would put
 * a second `Screen` into that budget and have to defend it. Nothing here is
 * addressable, shareable or losable: the panel is read for four seconds and
 * dismissed. F13 D5 argues each of the four reasons in full.
 *
 * What the UA gives, with no application code: the focus trap, initial focus,
 * `aria-modal`, Escape-to-cancel, focus restoration on close, and the backdrop.
 * **Do not add `role="dialog" aria-modal="true"` by hand** — a redundant explicit
 * role on a `<dialog>` is a known screen-reader hazard.
 *
 * **The panel is not a `Card`.** It borrows `Card`'s tokens — `bg-card`,
 * `border-rule`, `--r-card` — but `card.tsx` promises "a card never scrolls
 * internally", and the body below the art takes a documented `overflow-y` escape
 * under a short viewport. Using the tokens without claiming the component keeps
 * that promise honest.
 *
 * **F21: the picture is a full-bleed band, not a centred medal.** A follow-up
 * ask — "can we change it so the color of the small square fill the whole top
 * half of the modal … instead of showing small square on top of a white
 * background" — and the complaint was precise: the art's paper stopped at the
 * medal's edge with 82px of `--card` around it, so the picture read as a tile
 * dropped on a sheet. `ArtHero` extends the *colour* instead of cropping the
 * art, which is also the only option the deck allows (F21 §1.2). `BadgeMedal`
 * is still the right component for a sized square medal elsewhere; this is
 * simply no longer one of those places.
 *
 * The column below carries `min-h-0`, restating what `.dw-badge-dialog > *`
 * already supplies. That is the mechanism letting the body shrink below its
 * content height and scroll instead of overrunning the panel's `max-height` —
 * without it the gloss is clipped by the border radius with nothing throwing.
 */

export type BadgeSelection = {
  key: BadgeKey;
  title: string;
  /** Null is the unearned state. `getProfileStats` supplies the rest. */
  earned: {
    count: number;
    firstAwardedOn: LocalDate;
    lastAwardedOn: LocalDate;
  } | null;
};

export function BadgeDialog({
  selection,
  onClose,
}: {
  selection: BadgeSelection | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const open = selection !== null;

  // `showModal()` and `close()` are imperative and this component is
  // declarative, so exactly one effect reconciles them. Guarding on `el.open`
  // is load-bearing twice over: `showModal()` on an already-open dialog throws
  // `InvalidStateError`, and React 19 Strict Mode double-invokes effects in
  // development.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const meta = selection ? BADGE_META[selection.key] : null;

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // Escape fires `cancel` and then closes the element itself. Telling React
      // about it is what keeps DOM state and component state from diverging —
      // without this the dialog is shut but `selection` is still set, and the
      // next tap on the same row changes nothing.
      onCancel={onClose}
      // A click on the backdrop targets the <dialog> itself, because the panel
      // is a child of it. This is the robust form; comparing pointer coordinates
      // against the bounding box breaks when a text selection is dragged out of
      // the panel and released over the backdrop.
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className="dw-badge-dialog m-auto w-[calc(100vw-2*var(--gutter))] max-w-[340px] border border-rule bg-card p-0 text-ink"
    >
      {selection && meta && (
        // No padding on the column itself — the hero is flush to all three of
        // its edges, which is the whole change. The padding moved into the body
        // and the footer below. `gap` is gone for the same reason: the spacing
        // under the hero is the body's `pt-4`, so the hero has nothing between
        // it and the dialog's border. `items-center` came off too — a full-bleed
        // child must stretch, and centring the column would shrink the band back
        // to its content width, which is the artefact this feature removes.
        <div className="dw-in flex min-h-0 flex-col">
          <ArtHero
            src={BADGE_ART[selection.key].src}
            intrinsic={BADGE_ART_SIZE}
            plate={BADGE_ART[selection.key].plate}
            dimmed={selection.earned === null}
          />

          {/* Everything below the hero is what gives when the panel cannot fit
              the viewport — the hero and the close button keep their size. The
              same documented degradation `.dw-pane-fixed` takes below
              LAYOUT.designFloorDvh, and for the same reason: clip nothing,
              scroll instead. F21 D4 measured that at the design target it does
              not have to: the band spends 1.7px less than the medal and its
              padding did. */}
          <div className="dw-badge-dialog-body flex w-full flex-col items-center gap-2.5 px-5 pt-4 text-center">
            <Eyebrow size="sm" tone={selection.earned ? "accent" : "muted"}>
              {selection.earned ? "Earned" : "Not yet earned"}
            </Eyebrow>

            {/* The same classes ScreenHeader gives its <h1>. Not a new size. */}
            <h2 id={titleId} className="m-0 text-2xl font-normal tracking-title text-ink">
              {selection.title}
            </h2>

            <Prose size="base" tone="ink">
              {meta.condition}
            </Prose>

            <Prose size="sm" tone="muted">
              {meta.gloss}
            </Prose>

            {/* Absent when unearned — not "—", not "never". An empty place on a
                shelf says what it needs to say. */}
            {selection.earned && <Meta>{datesLine(selection.earned)}</Meta>}
          </div>

          {/* **No `autoFocus` here, and it is not an oversight.** `showModal()`
              already focuses the first focusable descendant, and this is still
              it — F21's hero is an `<img>` with no `tabIndex`, exactly as the
              medal was, so initial focus did not move. React's `autoFocus` prop
              additionally calls `.focus()` when the element *mounts*, which is
              one commit BEFORE the effect above runs `showModal()`. The dialog
              therefore records the Close button as the element to restore focus
              to, that button is unmounted on close, and focus lands on `<body>`
              — the shelf row the user tapped loses it silently. Measured, both
              on the pointer and the keyboard path. `fullWidth={false}` keeps it
              a control rather than a commitment; nothing here is destructive.

              Do not move this control into the hero. It would become the FIRST
              focusable descendant and `showModal()` would announce "Close"
              before the panel's content. F21 D7. */}
          <div className="flex shrink-0 justify-center px-5 pb-5 pt-4">
            <Button variant="outline" size="sm" fullWidth={false} onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}
    </dialog>
  );
}

/**
 * `awarded_for_date`, never `created_at` — the day the badge is *about*, not the
 * instant its row was written. After a backfill those differ by years, and
 * `created_at` would tell a user they earned "Ghost of Christmas Vocab" in
 * August. `getBadgeCounts` selects only the correct column, which is what keeps
 * this honest (F13 D3).
 *
 * Not a list of every occurrence: `sunday` on a two-year user is 104 rows, which
 * is a log rather than a record, and no question is answered by the middle 102.
 */
function datesLine(earned: NonNullable<BadgeSelection["earned"]>): string {
  if (earned.count === 1) return `Earned ${formatLocalDateLong(earned.firstAwardedOn)}`;
  return [
    `×${earned.count}`,
    `first ${formatLocalDateLong(earned.firstAwardedOn)}`,
    `latest ${formatLocalDateLong(earned.lastAwardedOn)}`,
  ].join(" · ");
}
