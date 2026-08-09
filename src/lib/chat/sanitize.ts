import { MAX_USER_MESSAGE_CHARS } from '@/lib/chat/turn-policy'

/**
 * What the model said, reduced to what a person would have said out loud.
 *
 * The system prompt forbids markdown, emoji, stage directions and name labels
 * (rule 3), and GLM mostly obeys — but "mostly" is not a rendering contract, and
 * `ChatBubble` renders plain text with no markdown pass. An asterisk that slips
 * through is drawn as an asterisk.
 *
 * **The sanitised text is what gets persisted**, not the raw output. The roadmap
 * requires that every displayed response be stored; storing something other than
 * what was shown would make the transcript a different document from the
 * conversation, and the verdict call reads that transcript back.
 *
 * Pure. No `server-only` — `npm run chat:check` exercises it offline.
 */

/** `You:`, `Assistant:`, `Alex:` — a name label before the line. */
const LEADING_LABEL = /^\s*(?:[A-Z][\w'’-]{0,20}|You|Assistant|AI|Model)\s*:\s+/

/** Markdown list bullets and blockquote/heading markers at the start of a line. */
const LINE_MARKER = /^[ \t]*(?:[-*+•>]\s+|#{1,6}\s+|\d+[.)]\s+)/gm

/**
 * Asterisk-wrapped stage directions: `*sighs*`, `**leans in**`.
 * Non-greedy and single-line, so a stray asterisk in the middle of a sentence
 * cannot swallow the rest of the reply.
 */
const STAGE_DIRECTION = /\*{1,3}([^*\n]*)\*{1,3}/g

/** Underscore emphasis. Conservative: both delimiters must hug a word. */
const UNDERSCORE_EMPHASIS = /(?<![\w\\])_{1,2}([^_\n]+)_{1,2}(?![\w\\])/g

/** Inline code and code fences. */
const CODE_FENCE = /```[\s\S]*?```/g
const INLINE_CODE = /`([^`\n]*)`/g

/**
 * Emoji and pictographs. `Extended_Pictographic` covers the emoji blocks
 * without touching punctuation, accents or IPA — which matters, because a word
 * being practised may well be spelled with either.
 */
const PICTOGRAPH = /[\p{Extended_Pictographic}️‍]/gu

/**
 * A whole reply wrapped in quotation marks, straight or curly.
 *
 * No `s` flag: the whitespace collapse above runs first, so by the time this is
 * tested there are no newlines left for `.` to miss. (The flag is also ES2018
 * and this project targets ES2017.)
 */
const WRAPPING_QUOTES = /^["“'‘](.*)["”'’]$/

/**
 * A line that is nothing but a parenthetical: `(He puts the cup down.)`
 * Only whole lines. An inline aside inside a sentence is how people talk and is
 * left alone.
 */
const PARENTHETICAL_LINE = /^[ \t]*[([][^)\]\n]*[)\]][ \t]*$/gm

/** Sentence-ending punctuation followed by a space or the end of the string. */
const SENTENCE_END = /[.!?…]["”'’)]?(?=\s|$)/g

export function sanitizeReply(raw: string): string {
  let text = raw

  text = text.replace(CODE_FENCE, ' ')
  text = text.replace(INLINE_CODE, '$1')
  text = text.replace(PARENTHETICAL_LINE, '')
  text = text.replace(LINE_MARKER, '')
  text = text.replace(STAGE_DIRECTION, '$1')
  text = text.replace(UNDERSCORE_EMPHASIS, '$1')
  text = text.replace(PICTOGRAPH, '')

  // Collapse before the label strip, so a label sitting on its own line is
  // still recognised as leading.
  text = text.replace(/\s+/g, ' ').trim()
  text = text.replace(LEADING_LABEL, '').trim()

  const unwrapped = WRAPPING_QUOTES.exec(text)
  // Only when there are no interior quotes: a reply that quotes the user back
  // and happens to start and end with a quotation mark must keep both.
  if (unwrapped && !/["“”]/.test(unwrapped[1])) text = unwrapped[1].trim()

  return softTruncate(text, MAX_USER_MESSAGE_CHARS)
}

/**
 * Cut at the last sentence boundary that fits, never mid-word.
 *
 * A reply this long means the prompt failed, not the truncation — rule 3 asks
 * for two or three sentences. Fix it in the prompt; this only stops the bubble
 * from becoming a wall while you do. See F6 §12.16.
 */
export function softTruncate(text: string, limit: number): string {
  if (text.length <= limit) return text

  const head = text.slice(0, limit)
  let cut = -1
  for (const m of head.matchAll(SENTENCE_END)) cut = m.index + m[0].length

  if (cut > 0) return head.slice(0, cut).trim()

  // No sentence ended in range: fall back to the last word boundary, and to a
  // hard cut only if the model somehow produced one 500-character word.
  const space = head.lastIndexOf(' ')
  return (space > 0 ? head.slice(0, space) : head).trim()
}

/**
 * The verdict is three lines and must stay three lines, so it is sanitised
 * without the single-line collapse and with a generous ceiling.
 *
 * Blank lines between the three are dropped rather than preserved: the card
 * lays them out itself, and a model that emits a blank line between each would
 * otherwise render as three paragraphs inside a component expecting three lines.
 */
export function sanitizeVerdict(raw: string): string[] {
  return raw
    .replace(CODE_FENCE, ' ')
    .replace(INLINE_CODE, '$1')
    .replace(LINE_MARKER, '')
    .replace(STAGE_DIRECTION, '$1')
    .replace(UNDERSCORE_EMPHASIS, '$1')
    .replace(PICTOGRAPH, '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .map((line) => softTruncate(line, 300))
    .slice(0, 3)
}
