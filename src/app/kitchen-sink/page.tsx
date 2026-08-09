import { notFound } from "next/navigation";
import Link from "next/link";
import { Screen, ScreenBody, ScreenHeader } from "@/components/layout/screen";
import { BackLink } from "@/components/layout/back-link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChatBubble, ChatBubbleTyping } from "@/components/ui/chat-bubble";
import { CalendarCell } from "@/components/ui/calendar-cell";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { BadgeRow } from "@/components/ui/badge-row";
import { LevelPill } from "@/components/ui/level-pill";
import { ListRow } from "@/components/ui/list-row";
import { Pill } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs } from "@/components/ui/tabs";
import { TextArea } from "@/components/ui/text-area";
import { TextInput } from "@/components/ui/text-input";
import { Eyebrow, Meta, Prose } from "@/components/ui/text";
import { DailyCard } from "@/components/daily/daily-card";
import { DayStrip } from "@/components/daily/day-strip";
import { WEEK_STRIP, TODAY_CARD_ITEMS } from "@/lib/sample-data";

/**
 * Every component, every variant, on one scrolling page.
 *
 * This is the app's Storybook, at the cost of one route and no dependency. Open
 * it at 375px in both colour schemes; if something is wrong here it is wrong on
 * a real screen too. `notFound()` in production — the gallery is scaffolding.
 */
export default function KitchenSinkPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <Screen>
      <ScreenBody scroll className="pb-12">
        <ScreenHeader
          className="pb-4"
          eyebrow={<Eyebrow>Dev only</Eyebrow>}
          title="Kitchen sink"
          trailing={
            <Pill href="/kitchen-sink/today" mono className="min-h-[32px] text-mono-xs">
              Layout
            </Pill>
          }
        />

        <Section title="Type">
          <p className="m-0 text-2xl tracking-title">Page title, 27px serif</p>
          <p className="m-0 text-xl tracking-tight">Card term, 22px serif</p>
          <Prose size="lg" tone="ink">
            List term, 18px serif
          </Prose>
          <Prose>Body prose, 17px serif on ink-2, which is what most of the app is set in.</Prose>
          <Prose size="body">Secondary prose, 16px</Prose>
          <Prose size="sm">Small prose, 15px</Prose>
          <div className="flex flex-col gap-1.5 pt-1">
            <Eyebrow>Eyebrow, 10px mono</Eyebrow>
            <Eyebrow size="sm">Eyebrow small, 9px mono</Eyebrow>
            <Eyebrow tone="accent">Eyebrow accent</Eyebrow>
            <Meta>Meta sentence, 10px mono, not uppercase.</Meta>
          </div>
        </Section>

        <Section title="Colour">
          <div className="grid grid-cols-4 gap-1.5">
            {[
              ["paper", "bg-paper"],
              ["paper-2", "bg-paper-2"],
              ["card", "bg-card"],
              ["ink", "bg-ink"],
              ["ink-2", "bg-ink-2"],
              ["ink-3", "bg-ink-3"],
              ["rule", "bg-rule"],
              ["rule-2", "bg-rule-2"],
              ["accent", "bg-accent"],
              ["accent-soft", "bg-accent-soft"],
              ["miss", "bg-miss"],
              ["red", "bg-red"],
            ].map(([name, cls]) => (
              <div key={name} className="flex flex-col gap-1">
                <span className={`block h-10 rounded-[var(--r-field)] border border-rule ${cls}`} />
                <span className="font-mono text-mono-2xs text-ink-3">{name}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Buttons">
          <Button variant="filled">Filled, the one per screen</Button>
          <Button>Outline</Button>
          <Button variant="quiet">Quiet</Button>
          <Button variant="filled" loading>
            Loading
          </Button>
          <Button variant="filled" disabled>
            Disabled
          </Button>
          <div className="flex gap-2.5">
            <Button size="sm" className="flex-1 text-mono-sm tracking-nav">
              Small
            </Button>
            <Button size="md" className="flex-1 text-mono-sm tracking-nav">
              Medium
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Pill mono tone="ink" className="h-9">
              + Word
            </Pill>
            <Pill mono className="min-h-[32px] text-mono-xs">
              12 day run
            </Pill>
            <Pill>truculent</Pill>
            <LevelPill kind="streak" label="Keeper of the Pocket" tier={5} tierCount={9} />
          </div>
        </Section>

        <Section title="Inputs">
          <Field id="ks-a" label="Boxed" hint="The default. Journal composer, search.">
            <TextInput id="ks-a" name="a" placeholder="Paste a line worth keeping" />
          </Field>
          <Field id="ks-b" label="Underline" error="That is not a word we can look up">
            <TextInput
              id="ks-b"
              name="b"
              variant="underline"
              placeholder="word"
              inputClassName="text-[30px] tracking-title"
            />
          </Field>
          <Field id="ks-c" label="Pill">
            <TextInput id="ks-c" name="c" variant="pill" placeholder="Use the word" />
          </Field>
          <Field id="ks-d" label="Text area">
            <TextArea id="ks-d" name="d" placeholder="Longer than a line" />
          </Field>
        </Section>

        <Section title="Surfaces">
          <Card>
            <Prose size="body">Raised card — stock on paper.</Prose>
          </Card>
          <Card variant="outline">
            <Prose size="body">Outline card — a ruled region.</Prose>
          </Card>
          <Card variant="dashed">
            <Prose size="body">Dashed card — a space waiting to be filled.</Prose>
          </Card>
          <div className="flex items-center gap-3 pt-1">
            <Spinner />
            <Spinner size={20} />
            <Spinner size={24} />
            <Skeleton width={120} />
          </div>
          <EmptyState
            body="Nothing here until you ask. The app does not choose for you."
            action={{ label: "Pick a word", href: "/vocab?tab=discover" }}
          />
        </Section>

        <Section title="Lists">
          <ListRow title="genteel" subtitle="polite in a way that is trying too hard" href="#" />
          <ListRow
            title="candid"
            subtitle="honest, even when it costs something"
            muted
            strikethrough
            trailing={<span className="size-[6px] shrink-0 rounded-full bg-accent" />}
          />
          <ListRow
            layout="stacked"
            title="A fall in a pit, a gain in one’s wit."
            subtitle="Chinese proverb · 12 Sep"
            href="#"
          />
          <div className="pt-2">
            <Tabs
              items={[
                { label: "Mine", href: "#", active: true },
                { label: "Discover", href: "#", active: false },
              ]}
            />
          </div>
        </Section>

        <Section title="Daily card">
          <div className="h-[380px]">
            <DailyCard items={TODAY_CARD_ITEMS} />
          </div>
          <div className="h-[200px]">
            <DailyCard
              items={[
                { id: "a", term: "tacit", definition: null, tag: "adj" },
                { id: "b", term: "circumlocutionaryness", definition: "a very long meaning that will certainly not fit on one line at this width", tag: "noun" },
              ]}
              shortCardAction={
                <Button variant="quiet" size="sm" fullWidth={false} href="/vocab/new">
                  Add more words
                </Button>
              }
            />
          </div>
          <DayStrip days={WEEK_STRIP} />
        </Section>

        <Section title="Calendar">
          <div className="grid grid-cols-7 gap-0.5">
            <CalendarCell day={1} mark="made" accessibleDate="1 September" />
            <CalendarCell day={2} mark="missed" accessibleDate="2 September" />
            <CalendarCell day={3} mark="made" isToday accessibleDate="3 September" />
            <CalendarCell day={4} mark="missed" isToday accessibleDate="4 September" />
            <CalendarCell day={5} mark="future" accessibleDate="5 September" />
            <CalendarCell day={null} mark="future" />
            <CalendarCell day={7} mark="made" href="#" accessibleDate="7 September" />
          </div>
        </Section>

        <Section title="Chat">
          <ChatBubble role="assistant" eyebrow="Scenario">
            You are showing a friend around the office, and they ask why the Friday
            meeting is never actually scheduled.
          </ChatBubble>
          <ChatBubble role="user">Nobody has ever said it out loud.</ChatBubble>
          <ChatBubble role="user" state="pending">
            Sending this one.
          </ChatBubble>
          <ChatBubble role="user" state="failed">
            This one did not send.
          </ChatBubble>
          <ChatBubbleTyping />
        </Section>

        <Section title="Gamification">
          <BadgeRow label="No Weekend Without Ration Card" count={4} />
          <BadgeRow label="Burning the Midnight Oil" count={1} />
          <BadgeRow label="Leap Year Lexicographer" count={0} />
        </Section>

        <Section title="Navigation">
          <BackLink href="#" label="Collection" />
          <Meta>The tab bar is on every screen with `tabs`; see any real route.</Meta>
          <Link href="/kitchen-sink/today" className="text-base text-accent underline">
            Layout fixture → /kitchen-sink/today
          </Link>
          <Link href="/kitchen-sink/profile" className="text-base text-accent underline">
            F9 profile states → /kitchen-sink/profile
          </Link>
          <Link href="/kitchen-sink/journal" className="text-base text-accent underline">
            F10 journal list and entry → /kitchen-sink/journal
          </Link>
          <Link href="/kitchen-sink/share" className="text-base text-accent underline">
            F16 public share page → /kitchen-sink/share
          </Link>
        </Section>
      </ScreenBody>
    </Screen>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex shrink-0 flex-col gap-3 border-t border-rule pt-4 pb-7">
      <Eyebrow size="sm">{title}</Eyebrow>
      {children}
    </section>
  );
}
