/**
 * Placeholder content for the UI build.
 *
 * The vocabulary, journal and stat figures are lifted from the Claude Design
 * prototype so the screens read the way they were drawn. The badge names are NOT:
 * the prototype's filler invented badges that do not exist ("Six Before Noon",
 * "Nothing Skipped in a Fortnight") and listed a streak *level* among them
 * ("Pocket Fuzz"). ROADMAP_v0.1.0.md's tables are authoritative — see [R20].
 *
 * Everything here is replaced by real queries in F3 onward.
 */

import type { DailyCardItemView } from "@/lib/ui/types";
import type { DayStripItem } from "@/components/daily/day-strip";

export type Word = {
  id: string;
  term: string;
  ipa: string;
  pos: string;
  tag: string;
  definition: string;
  examples: string[];
  mastered?: boolean;
};

export const WORDS: Record<string, Word> = {
  brittle: {
    id: "brittle",
    term: "brittle",
    ipa: "/ˈbrɪt(ə)l/",
    pos: "adjective",
    tag: "adj",
    definition: "hard but easily broken",
    examples: [
      "The old tape had gone brittle and snapped.",
      "His voice was brittle by the end of the call.",
      "Brittle metal fails without bending first.",
    ],
  },
  hedge: {
    id: "hedge",
    term: "hedge",
    ipa: "/hɛdʒ/",
    pos: "verb",
    tag: "v",
    definition: "to avoid committing yourself",
    examples: [
      "She hedged when asked for a date.",
      "Stop hedging and give a number.",
      "He hedged the promise with conditions.",
    ],
  },
  quaint: {
    id: "quaint",
    term: "quaint",
    ipa: "/kweɪnt/",
    pos: "adjective",
    tag: "adj",
    definition: "attractively old-fashioned",
    examples: [
      "A quaint shop that still writes receipts by hand.",
      "The custom seemed quaint to the visitors.",
      "Quaint, but the plumbing was from 1902.",
    ],
  },
  lull: {
    id: "lull",
    term: "lull",
    ipa: "/lʌl/",
    pos: "noun",
    tag: "n",
    definition: "a brief pause in activity",
    examples: [
      "There was a lull in the rain at four.",
      "He phoned during a lull between meetings.",
      "The lull did not last.",
    ],
  },
  rue: {
    id: "rue",
    term: "rue",
    ipa: "/ruː/",
    pos: "verb",
    tag: "v",
    definition: "to regret bitterly",
    examples: [
      "You will rue signing that.",
      "She rued the years spent waiting.",
      "He came to rue his silence.",
    ],
  },
  tacit: {
    id: "tacit",
    term: "tacit",
    ipa: "/ˈtasɪt/",
    pos: "adjective",
    tag: "adj",
    definition: "understood without being said",
    examples: [
      "There was a tacit agreement that no one would mention the cost.",
      "Her silence was taken as tacit approval.",
      "They kept a tacit rule about Sundays.",
    ],
  },
};

/** The six on today's card. Repeats across days are intentional. */
export const TODAY_CARD = ["tacit", "brittle", "hedge", "lull", "quaint", "rue"];

/** Today's six, in the shape `DailyCard` takes. F5 replaces this with a query. */
export const TODAY_CARD_ITEMS: DailyCardItemView[] = TODAY_CARD.map((id) => ({
  id,
  term: WORDS[id].term,
  definition: WORDS[id].definition,
  tag: WORDS[id].tag,
}));

const MASTERED = new Set(["idle", "keen", "candid", "prod"]);

const COLLECTION: [string, string][] = [
  ["abate", "to become less intense"],
  ["aloof", "distant and uninvolved"],
  ["amble", "to walk at a slow pace"],
  ["austere", "plain and without comfort"],
  ["banal", "so ordinary it is dull"],
  ["brittle", "hard but easily broken"],
  ["brusque", "abrupt to the point of rudeness"],
  ["candid", "frank and open"],
  ["coy", "pretending to be shy"],
  ["curt", "rudely brief"],
  ["dally", "to waste time"],
  ["deft", "quick and skilful"],
  ["dour", "stern and joyless"],
  ["earnest", "serious and sincere"],
  ["elude", "to escape from"],
  ["feign", "to pretend"],
  ["frugal", "careful with money"],
  ["gaunt", "thin and bony"],
  ["glib", "fluent but insincere"],
  ["hedge", "to avoid committing yourself"],
  ["hoard", "to store away in secret"],
  ["idle", "not working or in use"],
  ["irk", "to annoy"],
  ["jaded", "tired of a thing through overuse"],
  ["keen", "sharp, or eager"],
  ["lull", "a brief pause in activity"],
  ["lurch", "to move unsteadily"],
  ["meek", "quiet and submissive"],
  ["mundane", "dull and ordinary"],
  ["nimble", "quick and light in movement"],
  ["obtuse", "slow to understand"],
  ["opaque", "not able to be seen through"],
  ["placate", "to calm someone down"],
  ["prod", "to poke, or to urge"],
  ["quaint", "attractively old-fashioned"],
  ["quell", "to put an end to"],
  ["rue", "to regret bitterly"],
  ["rife", "widespread, usually of something bad"],
  ["scant", "barely enough"],
  ["stoic", "enduring without complaint"],
  ["tacit", "understood without being said"],
  ["terse", "brief to the point of rudeness"],
  ["unfazed", "not disturbed by"],
  ["vex", "to trouble or annoy"],
  ["wane", "to grow smaller"],
  ["wry", "dryly humorous"],
];

export type CollectionItem = {
  id: string;
  term: string;
  definition: string;
  mastered: boolean;
};

export const MINE: CollectionItem[] = COLLECTION.map(([term, definition]) => ({
  id: term,
  term,
  definition,
  mastered: MASTERED.has(term),
}));

/** Grouped by first letter, the way the design's index rail expects. */
export function groupedByLetter(items: CollectionItem[]) {
  const groups = new Map<string, CollectionItem[]>();
  for (const item of items) {
    const letter = item.term[0].toUpperCase();
    const bucket = groups.get(letter);
    if (bucket) bucket.push(item);
    else groups.set(letter, [item]);
  }
  return [...groups.entries()].map(([letter, words]) => ({ letter, words }));
}

export function lookupWord(id: string): Word | undefined {
  if (WORDS[id]) return WORDS[id];
  const item = MINE.find((m) => m.id === id);
  if (!item) return undefined;
  return {
    id: item.id,
    term: item.term,
    ipa: "",
    pos: "",
    tag: "",
    definition: item.definition,
    examples: [],
    mastered: item.mastered,
  };
}

/** A suggestion that has been proposed but not yet kept. See F8 / [R4]. */
export const DISCOVER_PICK = {
  term: "pellucid",
  ipa: "/pəˈl(j)uːsɪd/",
  definition: "clear enough to see straight through",
};

export const DISCOVER_KEPT = [
  { term: "obviate", definition: "to remove a difficulty before it arises" },
  { term: "sanguine", definition: "cheerful in a difficult situation" },
  { term: "truculent", definition: "eager to argue or fight" },
];

export type JournalEntry = {
  id: string;
  text: string;
  source: string;
  date: string;
  insight?: { meaning: string; whenItApplies: string[] };
};

export const JOURNAL: JournalEntry[] = [
  {
    id: "1",
    text: "A fall in a pit, a gain in one’s wit.",
    source: "Chinese proverb",
    date: "12 Sep",
    insight: {
      meaning:
        "The line prices the mistake rather than excusing it: the pit is not undone, only paid for.",
      whenItApplies: [
        "Said to someone still standing in the hole, which is what keeps it from sounding smug.",
        "After a loss that taught something the winner would not have learned.",
      ],
    },
  },
  {
    id: "2",
    text: "The past is a foreign country: they do things differently there.",
    source: "L. P. Hartley",
    date: "3 Sep",
  },
  {
    id: "3",
    text: "Nothing to be done.",
    source: "Waiting for Godot",
    date: "28 Aug",
  },
  {
    id: "4",
    text: "We are all in the gutter, but some of us are looking at the stars.",
    source: "Oscar Wilde",
    date: "21 Aug",
  },
];

/** The proactive opener: the model speaks first, in role. See F6. */
export const CHAT_OPENER = {
  role: "assistant" as const,
  text: "You are showing a friend around the office where you work, and they ask why the Friday meeting is never actually scheduled. Answer them — but the reason has to be an unspoken one.",
};

export const STATS = [
  { n: 12, label: "Current streak" },
  { n: 19, label: "Longest streak" },
  { n: 38, label: "Cards made" },
  { n: 227, label: "Words collected" },
];

/**
 * Badge keys and titles are taken from ROADMAP_v0.1.0.md, not from the design
 * prototype's filler. `earned: false` renders the dimmed slot on the shelf.
 */
export const BADGES = [
  { key: "sunday", name: "No Weekend Without Ration Card", count: 4 },
  { key: "ibu", name: "Ibu Would Be Proud", count: 2 },
  { key: "full_week", name: "Full Week Ration", count: 3 },
  { key: "midnight_oil", name: "Burning the Midnight Oil", count: 1 },
  { key: "first_card", name: "The Uncle’s Trick", count: 1 },
  { key: "indonesia_independence", name: "National Speaker", count: 0 },
  { key: "world_book_day", name: "The Bard’s Regard", count: 0 },
];

export const PROFILE = {
  name: "Barnaby",
  streakLevel: "Keeper of the Pocket",
  nextLevel: "The Uncle’s Apprentice, at a 60-day streak",
  collectorLevel: "Private Collector",
  since: "Keeping a card since 8 August 2026.",
};

/** Last seven days, most recent last. Shaped for `DayStrip`. */
export const WEEK_STRIP: DayStripItem[] = [
  { date: "2026-09-12", day: 12, weekday: "S", mark: "made" },
  { date: "2026-09-13", day: 13, weekday: "M", mark: "made" },
  { date: "2026-09-14", day: 14, weekday: "T", mark: "made" },
  { date: "2026-09-15", day: 15, weekday: "W", mark: "missed" },
  { date: "2026-09-16", day: 16, weekday: "T", mark: "made" },
  { date: "2026-09-17", day: 17, weekday: "F", mark: "made" },
  { date: "2026-09-18", day: 18, weekday: "S", mark: "made", isToday: true },
];

/** September 2026 — 16 cards made, per the design's sample month. */
export const MONTH = {
  label: "September 2026",
  firstWeekday: 2,
  days: 30,
  today: 18,
  made: new Set([1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18]),
  summary: "16 cards in September. 38 since you started.",
};

/**
 * Onboarding questions. The design prototype's placeholders asked things the
 * app does not ask ("How many words on a card?" — that is locked at six), so
 * these follow F7's five profile questions instead. See [R20].
 */
export const ONBOARDING = [
  {
    prompt: "What do you do?",
    kind: "text" as const,
    placeholder: "Barnaby",
  },
  {
    prompt: "What are you into?",
    kind: "options" as const,
    options: ["Books", "Film", "Music", "Sport", "Code", "Cooking"],
    multi: true,
  },
  {
    prompt: "What are you reading or watching now?",
    kind: "text" as const,
    placeholder: "Barnaby Rudge",
  },
  {
    prompt: "Where do you actually use English?",
    kind: "options" as const,
    options: ["Work", "Online", "Travel", "Study", "Nobody really"],
    multi: true,
  },
  {
    prompt: "How should the chat treat you?",
    kind: "options" as const,
    options: ["Patient", "Blunt", "Playful"],
    multi: false,
  },
];
