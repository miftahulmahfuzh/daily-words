# Claude Design Brief — Daily Words

## How to use this file

Claude Design cannot be driven from Claude Code. There is no API to prompt it. The
generative side lives only in your browser. What *is* connected is the file channel:
this Claude Code session can read and write files in your design-system project
`8c1c015d-78c9-4945-8382-23bf124f2333` ("Design System"), which is currently empty.

So the loop is:

1. Open **claude.ai/design** in your browser.
2. Select the **Design System** project (the same one this session can see).
3. Paste the brief below — everything under the horizontal rule — as your prompt.
4. Let it generate. Iterate in the browser until the look feels right to you. You are
   the taste here; nobody else can do that part.
5. **Save the output into the Design System project** so it becomes files, not just
   a chat response.
6. Come back to this Claude Code session and say: **"pull the design"**. I will run
   `DesignSync` `list_files` / `get_file`, read what you made, and turn it into the
   real Tailwind component kit in this repo per `plans/F2-design-system.md`.
7. From then on the flow reverses: I push updated previews back with `/design-sync`,
   and you review them as cards in the Design System pane.

Steps 1–5 are yours. Step 6 onward is mine.

---

Design a mobile web app called **Daily Words**. It is used almost exclusively in
Safari on an iPhone, held in one hand. Not a responsive desktop site — design for one
device, one thumb.

**What it is.** A digital rebuild of a paper vocabulary card. The original was a
13×8 cm card that a man carried in his trouser pocket, hand-written with a short list
of English words he did not know and their meanings. He glanced at it through the day
to refresh his memory. That is the whole product. Everything else is an improvement on
that one object.

**The feeling I want.** Calm, sparse, deliberate, and a little bit analogue. Paper
rather than dashboard. It should feel like a small private object you carry, not a
consumer app competing for your attention. No gradients-for-the-sake-of-gradients, no
glassmorphism, no confetti, no progress bars that scream. Restraint is the point.
Typography is the primary instrument, because this app is entirely about words —
treat type the way an editorial designer would, not the way a SaaS dashboard would.
It must work in both light and dark mode, because iPhone users live in both.

**The hardest constraint, and the one I care about most.** The daily card shows
exactly **6 words**. Each word takes at most **2 lines**: the word itself, and a
one-line definition under it. The card **must not scroll**. The entire thing has to be
glanceable at 375 px wide without moving a finger — exactly like pulling a paper card
out of your pocket and looking at it. If your layout requires scrolling, the layout is
wrong, not the constraint.

**Screens to design:**

1. **Sign in** — a single "Continue with Google" button. That is the only way in. No
   email, no password, no alternatives. Make the emptiness of this screen feel
   intentional.
2. **Today** — the daily card. A button to *make* today's card when none exists yet
   (the card is never generated automatically; pressing the button is the daily
   ritual being tracked). Once made: the six words, non-scrolling, each row tappable.
   Plus a compact strip of the last several days showing which had a card and which
   did not.
3. **Calendar** — a month view of ticks and crosses. Days with a card, days without,
   today, and future days must all be visually distinct at a glance.
4. **Word detail** — a full page, not a modal. The word, its pronunciation, part of
   speech, a one-line definition, and a few usage examples. Plus a button into the
   practice chat, and a toggle meaning "I have mastered this — stop showing it to me".
5. **Add a word** — one input, one button. This is the most-used screen in the app.
   Getting a word in must be nearly frictionless.
6. **Collection** — the user's words, in two tabs: **Mine** and **Discover**. Mine can
   hold hundreds of words and must stay usable at that size on a phone. Discover has
   one prominent button, "Pick a new word for me", that proposes words the user does
   not have yet.
7. **Practice chat** — a conversation about one specific word. The important detail:
   the assistant speaks *first*, before the user types, opening with a scenario that
   pushes the user into using the word. Design the empty-but-not-really-empty state
   where that opener has just appeared. Handle the iOS keyboard-open case.
8. **Journal** — saved sayings and lines worth keeping, pasted from books and films.
   For example: *"a fall in a pit, a gain in one's wit."* A list, a fast composer, and
   an entry page where an AI-written insight about the saying can appear on request.
9. **Profile** — the pride screen. Current streak, longest streak, total cards, total
   words collected, a "keeping a card since 8 August 2026" line, a level title, and a
   shelf of earned badges with repeat counts. The level names are dry and funny —
   "Pocket Fuzz", "The Small Scribe", "Keeper of the Pocket", "The Uncle's
   Apprentice", "Barnaby's Ghost". Badges include "No Weekend Without Ration Card" and
   "Ibu Would Be Proud". Match that register: affectionate and understated, never
   cheerleading. This screen should make a consistent user quietly proud, without any
   mechanic that punishes or nags.
10. **Onboarding** — five short questions, one per screen, every one skippable, done
    in under a minute.

**Navigation:** a bottom tab bar with exactly four items — Today, Vocab, Journal,
Profile. Respect the iPhone home-indicator safe area. No hamburger menu, no drawers.

**Also give me the underlying system, not just screens:** the colour tokens for light
and dark, the type scale, the spacing scale, corner radii, and the reusable pieces —
card surface, list row, tab bar, buttons, text input, empty state, chat bubble, badge
chip, level pill, and calendar cell in its four states.

**Copy rules.** All text in English. Terse. Dictionary register — plain, precise,
unfussy. Never motivational-poster prose. Most body text in this app is
machine-generated and machine-generated text sprawls by default, so the design must
make long text look wrong.
