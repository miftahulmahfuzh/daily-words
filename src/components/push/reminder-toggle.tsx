"use client";

import { useEffect, useRef, useState } from "react";
import { Meta } from "@/components/ui/text";
import { ToggleRow } from "@/components/ui/toggle-row";
import {
  disablePush,
  enablePush,
  getSubscription,
  notificationPermission,
  pushSupport,
  registerServiceWorker,
  requestNotificationPermission,
} from "@/lib/push/client";
import {
  REMINDER_EVERY_HOURS,
  REMINDER_FIRST_HOUR,
  REMINDER_UNTIL_HOUR,
} from "@/lib/push/schedule";

/**
 * The one place a user turns card reminders on, and the four places the app has
 * to admit it cannot.
 *
 * It is on /profile/edit and not on /profile, which is the pride screen and
 * says in its own doc comment that it holds no settings, no countdown and no
 * red states. A "reminders are off" row there would be the first of all three.
 *
 * **It writes on the tap and is not saved by the Save button below it.** Same
 * argument the timezone in that form already makes: a different resource with a
 * different rule. It is drawn last, beneath every field Save does commit, so
 * nothing above it is left looking unsaved.
 *
 * The four honest states matter more than the switch does, because on the
 * device this was built for the first one a user meets is **needs_home_screen**: iOS
 * grants Web Push to a Home Screen app and to nothing else, so Safari in a
 * normal tab has the APIs and no permission to give. A dead switch there is the
 * worst possible answer — it looks broken, and the fix (add to Home Screen) is
 * something no amount of tapping will discover.
 *
 * `denied` is the other one that must never be a silent no-op. Once the browser
 * has been told no it will not ask again, so a switch that flips back with no
 * explanation is a user concluding the feature is broken. The copy names the
 * place the decision actually lives.
 */

/** 7 -> "7am", 12 -> "12pm", 20 -> "8pm". Presentation of an integer constant. */
function hourLabel(hour: number): string {
  if (hour === 0) return "12am";
  if (hour === 12) return "12pm";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

/**
 * The schedule, read back from phase 1's constants rather than typed out.
 *
 * The sentence is copy, but the numbers in it are the feature, and a hint that
 * says 7am beside a `REMINDER_FIRST_HOUR` of 8 is exactly the drift this
 * codebase keeps out of prose. Importing them is also the only coupling this
 * component has to the schedule: no clock is read here, no date is computed,
 * and `hourLabel` does integer-to-string formatting rather than date
 * arithmetic, so `lib/time/local-date.ts`'s monopoly is untouched.
 */
const SCHEDULE_HINT =
  `From ${hourLabel(REMINDER_FIRST_HOUR)} to ${hourLabel(REMINDER_UNTIL_HOUR)}, ` +
  `every ${REMINDER_EVERY_HOURS} hours, until the card exists.`;

/**
 * The six states this section can be in, and five of them draw a sentence rather
 * than a switch.
 *
 * The four that are not `loading` or `ready` are spelled with phase 2's
 * `PushSupport` tokens exactly, so `setStatus({ kind: support.kind })` assigns
 * straight across with no mapping table to keep in step. `denied` is this
 * component's own, because permission is not a capability.
 */
type Status =
  | { kind: "loading" }
  | { kind: "unsupported" }
  | { kind: "needs_home_screen" }
  | { kind: "unconfigured" }
  | { kind: "denied" }
  | { kind: "ready"; on: boolean };

/** The first line of every state that is not the switch. */
const SECTION_LABEL = "Card reminders";

const SENTENCE: Record<
  "loading" | "unsupported" | "needs_home_screen" | "unconfigured" | "denied",
  string
> = {
  loading: "Checking…",
  unsupported: "This browser cannot show notifications.",
  needs_home_screen:
    "Add Daily Words to your Home Screen and open it from there. iOS gives notifications to installed web apps and to nothing else.",
  unconfigured: "Reminders are not set up on this server.",
  denied:
    "Notifications are turned off for Daily Words. Turn them back on in iOS Settings, under Notifications, then come back here.",
};

export function ReminderToggle() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const probed = useRef(false);

  useEffect(() => {
    if (probed.current) return;
    probed.current = true;

    void (async () => {
      // One authenticated GET, on a settings screen — which is the only place
      // `pushSupport()` may be called. It is what tells "the server has no key"
      // apart from "the switch is off", two states that draw the same picture
      // and are opposite problems. `<PushSync/>` uses `pushCapability()`
      // instead, precisely so this request does not happen on every page.
      const support = await pushSupport();
      if (support.kind !== "supported") {
        setStatus({ kind: support.kind });
        return;
      }

      const permission = notificationPermission();
      if (permission === "denied") {
        setStatus({ kind: "denied" });
        return;
      }

      // Only a granted permission can have a subscription behind it, and only
      // that case is worth registering a worker for. "default" is a user who
      // has never been asked: there is nothing to read and nothing to install.
      if (permission !== "granted") {
        setStatus({ kind: "ready", on: false });
        return;
      }

      const registration = await registerServiceWorker();
      const subscription = registration ? await getSubscription() : null;
      setStatus({ kind: "ready", on: subscription !== null });
    })();
  }, []);

  async function change(next: boolean) {
    // `ToggleRow` has no disabled state, so the guard lives here — the same
    // place `MasteredToggle` puts it. A second tap during the round trip must
    // not fire a second subscribe.
    if (busy || status.kind !== "ready") return;

    setBusy(true);
    setProblem(null);

    if (!next) {
      // `disablePush()` clears `lib/push/client.ts`'s endpoint mirror itself,
      // before anything can fail — this component holds no copy of it.
      const result = await disablePush();
      setBusy(false);
      if (!result.ok) {
        setProblem(result.message);
        return;
      }
      setStatus({ kind: "ready", on: false });
      return;
    }

    /**
     * NOTHING MAY BE AWAITED ABOVE THIS LINE on the enable path.
     *
     * iOS refuses `Notification.requestPermission()` unless it is reached from
     * a user gesture, and an await between the tap and the call loses the
     * gesture on WebKit. `setBusy` and `setProblem` are synchronous and safe;
     * a `registerServiceWorker()` here would be a permission sheet that never
     * appears, on the one platform this feature exists for — which is also why
     * the ask is here rather than inside `enablePush()`, whose first job is to
     * register.
     */
    const permission = await requestNotificationPermission();

    if (permission === "denied") {
      setBusy(false);
      setStatus({ kind: "denied" });
      return;
    }
    if (permission !== "granted") {
      // Dismissed. Not a failure and not worth a sentence: the user closed a
      // sheet they opened, and the switch is still where they left it.
      setBusy(false);
      return;
    }

    // `enablePush()` registers the worker, subscribes, POSTs the subscription
    // and remembers the endpoint. It does NOT ask for permission — that has
    // already happened, above, in the gesture.
    const result = await enablePush();
    setBusy(false);
    if (!result.ok) {
      setProblem(result.message);
      return;
    }

    setStatus({ kind: "ready", on: true });
  }

  if (status.kind === "ready") {
    return (
      <div>
        <ToggleRow
          label="Remind me to make today's card"
          hint={SCHEDULE_HINT}
          checked={status.on}
          // Not destructive in either direction — turning reminders on is
          // undone by turning them off — so no two-tap arm. [R22]'s
          // neighbours, F13 D5.
          confirmOn={false}
          onChange={(next) => void change(next)}
        />
        {problem && <Meta className="pt-2 text-red">{problem}</Meta>}
      </div>
    );
  }

  // The same frame `ToggleRow` draws, minus the switch: the section keeps its
  // rule, its padding and its two-line stack in every state, so the page does
  // not change shape depending on what the device can do.
  return (
    <div className="flex min-h-[56px] flex-col gap-[3px] border-t border-rule-2 pt-4.5">
      <span className="text-base text-ink">{SECTION_LABEL}</span>
      <Meta>{SENTENCE[status.kind]}</Meta>
    </div>
  );
}
