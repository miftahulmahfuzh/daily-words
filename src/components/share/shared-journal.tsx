import { Screen, ScreenBody } from "@/components/layout/screen";
import { InsightPanel } from "@/components/journal/insight-panel";
import { StartYourOwnJournal } from "@/components/share/start-your-own-journal";
import { Eyebrow } from "@/components/ui/text";
import { SHARE_BRAND_EYEBROW } from "@/lib/share/policy";
import type { SharedJournalPayload } from "@/lib/share/schemas";

/**
 * A line someone kept, and what the machine made of it.
 *
 * The shape is `/journal/[id]`'s exactly — the `text-2xl` `whitespace-pre-wrap`
 * paragraph, the meta line, the hairline, `InsightPanel` — minus Edit, Delete
 * and every insight control, plus the CTA. It introduces no new colour, type
 * size or radius; the kit is frozen and a public page is not a licence.
 *
 * ## The insight is shared, and the viewer is told a machine wrote it
 *
 * The case against was real and is worth restating: the insight is
 * model-generated prose about a line the user found meaningful, it is not the
 * user's own voice, and a stranger naturally attributes everything on a shared
 * page to the person who sent the link. If the model got the line wrong, the
 * sharer wears it.
 *
 * It loses on three counts. The user asked for exactly this — "sharing journal
 * detailed page, **the one which shows insight**". Without it the page is a bare
 * quotation with nothing to explain why anyone should sign up, and the CTA below
 * has no reason to exist. And the attribution problem was solved before this
 * feature existed: `InsightPanel` ends with "Written by the machine. Keep or
 * discard.", a line the design specified verbatim.
 *
 * **`InsightPanel` is reused unchanged, and reused specifically so that line
 * cannot be dropped by a public-page rewrite.** No prop is added to it, no copy
 * is changed.
 *
 * ## What is absent
 *
 * - **`sourceNote`.** It never reaches this component: the snapshot does not
 *   carry it (D10). Where the user met the line is about the user's life.
 * - **Every insight control.** No ask button, no retry, no failure copy. A
 *   `pending` or `failed` entry shares as a bare line rather than as a button a
 *   stranger cannot press — the payload simply holds `insight: null`.
 * - **The sharer.** No name, no avatar, no "shared by".
 * - **A tab bar.** Four tabs that all bounce to /signin are a trap.
 *
 * The CTA is in normal flow at the foot of the scrolling pane rather than pinned
 * outside it, unlike `SharedWord`'s. The line is the content here and it can be
 * long; a pinned block would cover the end of somebody's quotation to advertise
 * at them.
 */
export function SharedJournal({ payload }: { payload: SharedJournalPayload }) {
  return (
    <Screen>
      <ScreenBody scroll padded={false} className="px-6 pb-7">
        <Eyebrow>{SHARE_BRAND_EYEBROW}</Eyebrow>

        {/* `pre-wrap`, so a shared stanza keeps its line breaks. Set larger than
            list text: the line is the point of the screen. */}
        <p className="m-0 pt-3 text-2xl leading-[1.25] tracking-[-0.015em] whitespace-pre-wrap text-pretty">
          {payload.text}
        </p>

        <div className="flex items-baseline gap-2 py-4.5 pb-5.5">
          {/* The day it was kept, in the **owner's** zone, formatted at share
              time. `toJournalEntryDto` takes the *reader's* timezone, and on a
              public page the reader is a stranger — which is one of the two
              reasons this page does not go anywhere near that function. */}
          <Eyebrow className="tracking-[0.1em]">{payload.dateLabel}</Eyebrow>
        </div>

        <div className="h-px bg-rule" />

        {payload.insight && <InsightPanel insight={payload.insight} />}

        <div className="pt-7">
          <StartYourOwnJournal />
        </div>
      </ScreenBody>
    </Screen>
  );
}
