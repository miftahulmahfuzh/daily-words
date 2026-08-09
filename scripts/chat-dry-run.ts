/**
 * Run F6's three prompts against the live model and print what comes back.
 *
 * Run with:
 *   npm run chat:dry-run -- "genteel"
 *   npm run chat:dry-run -- "genteel" --profile empty
 *   npm run chat:dry-run -- "genteel" --profile partial --round 2
 *   npm run chat:dry-run -- "genteel" --reply "It was very genteel of him."
 *
 * **Writes nothing.** No session, no messages, no vocab row — the word is
 * enriched live through F3's prompt purely to get a real definition and part of
 * speech into the system prompt, exactly as `vocab:enrich` does.
 *
 * This is the tool for F6 §10 step 18, which is the step that matters: read
 * every opener aloud against the §13.6 rubric and fix the *prompt*, not the
 * code, until they all pass. Four model calls per run.
 *
 * `--conditions=react-server` in the npm script is required: the LLM modules
 * import `server-only`, whose default export throws outside a server bundle.
 */
import "dotenv/config";
import { enrichTerm } from "../src/lib/llm/prompts/vocab-enrich";
import { generateText } from "../src/lib/llm/text";
import { sanitizeReply, sanitizeVerdict } from "../src/lib/chat/sanitize";
import {
  buildConversation,
  renderTranscript,
  type TranscriptRow,
} from "../src/lib/chat/transcript";
import { MAX_REPLY_TOKENS, MAX_VERDICT_TOKENS } from "../src/lib/chat/turn-policy";
import {
  chatSystemPrompt,
  SCENARIO_BLOCK_OPENING,
  SCENARIO_BLOCK_UNDERWAY,
} from "../src/lib/llm/prompts/chat-system";
import { chatOpenerPrompt } from "../src/lib/llm/prompts/chat-opener";
import { pickScenario } from "../src/lib/llm/prompts/chat-scenarios";
import { verdictPrompt, VERDICT_SYSTEM_PROMPT } from "../src/lib/llm/prompts/chat-verdict";
import {
  buildProfileContext,
  type ProfileContextInput,
} from "../src/lib/profile/context";

/**
 * Three profile shapes, because the opener has to work for all three and the
 * empty one is the hardest — it is where a model invents a biography if the
 * prompt lets it.
 */
const PROFILES: Record<string, ProfileContextInput | null> = {
  full: {
    occupation: "backend engineer at a bank",
    interests: ["football", "film & tv", "books"],
    currentlyConsuming: "Bleak House",
    englishContexts: ["work"],
    chatTone: "playful",
  },
  partial: {
    occupation: null,
    interests: ["cooking"],
    currentlyConsuming: null,
    englishContexts: null,
    chatTone: "blunt",
  },
  empty: null,
};

/** A stable fake id, so `pickScenario` is reproducible across runs. */
const FAKE_ENTRY_ID = "00000000-0000-4000-8000-000000000000";

function flag(args: string[], name: string, fallback: string): string {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

function rule(title: string) {
  console.log(`\n${"─".repeat(72)}\n${title}\n`);
}

async function main() {
  const args = process.argv.slice(2);
  const shape = flag(args, "profile", "full");
  const round = Number(flag(args, "round", "1"));
  const userReply = flag(args, "reply", "It was very genteel of him to reply so fast.");

  const term = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--")).join(" ");

  if (!term) {
    console.error('usage: npm run chat:dry-run -- "<term>" [--profile full|partial|empty] [--round N] [--reply "…"]');
    process.exit(2);
  }
  if (!(shape in PROFILES)) {
    console.error(`--profile must be one of: ${Object.keys(PROFILES).join(", ")}`);
    process.exit(2);
  }

  const profile = buildProfileContext(PROFILES[shape]);

  rule(`Enriching "${term}" (F3's prompt — no database writes)`);
  const enriched = await enrichTerm(term);
  if (!enriched.ok || enriched.data.status === "unknown") {
    console.error(`could not enrich "${term}"`);
    process.exit(1);
  }
  const word = enriched.data;
  console.log(`${word.part_of_speech} — ${word.definition}`);

  const base = {
    term,
    partOfSpeech: word.part_of_speech,
    definition: word.definition,
    profileBlock: profile.text,
    toneDirective: profile.toneDirective,
    profileIsEmpty: profile.isEmpty,
  };

  const scenario = pickScenario(FAKE_ENTRY_ID, round);

  rule(`System prompt  ·  profile=${shape}  round=${round}`);
  const system = chatSystemPrompt({ ...base, scenarioBlock: SCENARIO_BLOCK_OPENING });
  console.log(system);
  // Roughly four characters to a token. F6 §11 predicts ~930 for the system
  // prompt; a reading far outside that range means the prompt has drifted.
  console.log(`\n[~${Math.round(system.length / 4)} tokens, fallback scenario: ${scenario}]`);

  /* ------------------------------- 1. Opener ------------------------------- */

  rule("Opener  (LLM call 1)");
  const opener = await generateText({
    label: "dry.opener",
    system,
    messages: [
      {
        role: "user",
        content: chatOpenerPrompt({
          term,
          profileIsEmpty: profile.isEmpty,
          fallbackScenario: scenario,
        }),
      },
    ],
    maxTokens: MAX_REPLY_TOKENS,
    temperature: 0.9,
  });
  if (!opener.ok) {
    console.error(`opener failed: ${opener.error.kind}`);
    process.exit(1);
  }
  const openerText = sanitizeReply(opener.text);
  console.log(openerText);
  audit(openerText, term);

  /* -------------------------------- 2. Reply ------------------------------- */

  const history: TranscriptRow[] = [
    { role: "assistant", kind: "opener", content: openerText },
    { role: "user", kind: "reply", content: userReply },
  ];

  rule(`Reply  (LLM call 2)  ·  they said: "${userReply}"`);
  const reply = await generateText({
    label: "dry.reply",
    system: chatSystemPrompt({ ...base, scenarioBlock: SCENARIO_BLOCK_UNDERWAY }),
    messages: buildConversation(history),
    maxTokens: MAX_REPLY_TOKENS,
    temperature: 0.9,
  });
  if (!reply.ok) {
    console.error(`reply failed: ${reply.error.kind}`);
    process.exit(1);
  }
  const replyText = sanitizeReply(reply.text);
  console.log(replyText);
  audit(replyText, term);

  history.push({ role: "assistant", kind: "reply", content: replyText });

  /* ------------------------------- 3. Verdict ------------------------------ */

  rule("Verdict  (LLM call 3)");
  const verdict = await generateText({
    label: "dry.verdict",
    system: VERDICT_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: verdictPrompt({
          term,
          partOfSpeech: word.part_of_speech,
          definition: word.definition,
          transcript: renderTranscript(history),
        }),
      },
    ],
    maxTokens: MAX_VERDICT_TOKENS,
    temperature: 0.3,
  });
  if (!verdict.ok) {
    console.error(`verdict failed: ${verdict.error.kind}`);
    process.exit(1);
  }
  sanitizeVerdict(verdict.text).forEach((line) => console.log(line));

  console.log("");
  process.exit(0);
}

/**
 * The mechanical half of §13.6. It cannot judge whether an opener is any good —
 * that is what reading it aloud is for — but it catches the failures that are
 * decidable, and those are the ones that recur.
 */
function audit(text: string, term: string) {
  const sentences = text.split(/[.!?…]+\s/).filter((s) => s.trim().length > 0).length;
  const forbidden = ["practice", "practise", "learn", "vocabulary", "english", "exercise"];
  const hits = forbidden.filter((w) => new RegExp(`\\b${w}`, "i").test(text));
  const uses = (text.match(new RegExp(`\\b${term}\\b`, "gi")) ?? []).length;

  const notes = [
    sentences <= 3 ? null : `${sentences} sentences — rule 3 says two or three`,
    hits.length === 0 ? null : `names the exercise: ${hits.join(", ")}`,
    uses <= 1 ? null : `uses "${term}" ${uses} times — rule 8 allows one`,
    /^(hi|hello|hey|good (morning|afternoon|evening))\b/i.test(text)
      ? "opens with a greeting"
      : null,
    /[*_#•]|\p{Extended_Pictographic}/u.test(text) ? "markdown or emoji survived" : null,
  ].filter(Boolean);

  console.log(
    notes.length === 0
      ? "\n[checks pass — now read it aloud against §13.6]"
      : `\n[!] ${notes.join("  ·  ")}`,
  );
}

void main();
