import { Screen } from "@/components/screen";
import { STATS, BADGES, PROFILE } from "@/lib/sample-data";

/* The pride screen. No nagging, no loss-aversion, no unseen-badge dots —
   the tone is dry and affectionate, matching the level names. */
export default function ProfilePage() {
  return (
    <Screen tabs>
      <div
        className="flex-1 overflow-y-auto px-[var(--gutter)] pb-4"
        style={{ paddingTop: "var(--pad-top)" }}
      >
        <div className="flex flex-col gap-3 pb-5.5">
          <span className="font-mono text-[10px] tracking-[0.2em] text-ink-3 uppercase">
            {PROFILE.name}
          </span>
          <span className="self-start rounded-[var(--r-pill)] border border-accent px-3.5 py-1.5 text-[15px] text-accent">
            {PROFILE.streakLevel}
          </span>
          <span className="font-mono text-[10px] tracking-[0.06em] text-ink-3">
            Next: {PROFILE.nextLevel}.
          </span>
        </div>

        <div className="grid grid-cols-2 border-t border-l border-rule">
          {STATS.map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col gap-[5px] border-r border-b border-rule px-3.5 py-4"
            >
              <span className="text-[32px] leading-none tracking-[-0.02em]">
                {stat.n}
              </span>
              <span className="font-mono text-[9px] tracking-[0.16em] text-ink-3 uppercase">
                {stat.label}
              </span>
            </div>
          ))}
        </div>

        <p className="m-0 py-4.5 pb-6 text-[17px] leading-[1.4] text-ink-2">
          {PROFILE.since}
        </p>

        <span className="font-mono text-[9px] tracking-[0.2em] text-ink-3 uppercase">
          Badges
        </span>
        <div className="flex flex-col pt-2">
          {BADGES.map((badge) => {
            const earned = badge.count > 0;
            return (
              <div
                key={badge.key}
                className="flex items-baseline gap-3 border-b border-rule-2 py-3.5"
              >
                <span
                  className={`size-[7px] shrink-0 ${
                    earned ? "bg-accent" : "bg-rule"
                  }`}
                />
                <span
                  className={`flex-1 text-[16px] leading-[1.3] text-pretty ${
                    earned ? "text-ink" : "text-ink-3"
                  }`}
                >
                  {badge.name}
                </span>
                <span className="font-mono text-[11px] text-ink-3">
                  {earned ? `×${badge.count}` : "—"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Screen>
  );
}
