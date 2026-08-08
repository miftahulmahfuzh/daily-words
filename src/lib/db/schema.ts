import { sql } from 'drizzle-orm'
import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import type { AdapterAccountType } from 'next-auth/adapters'

/**
 * The complete schema for all ten features. Single source of truth.
 *
 * Authority order: ROADMAP_v0.1.0.md § Reconciliation Decisions, then
 * § Database schema (authoritative), then plans/F1-foundation.md §5.2.
 */

const tsz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })

/**
 * `date` columns are read and written as 'YYYY-MM-DD' strings, never as JS Dates.
 * A Date here would reintroduce exactly the UTC drift the timezone contract exists
 * to prevent. Maps 1:1 to LocalDate in @/lib/time/local-date.
 */
const localDate = (name: string) => date(name, { mode: 'string' })

/* ---------------------------------- Auth.js --------------------------------- */

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: tsz('email_verified'),
  image: text('image'),
})

export const accounts = pgTable(
  'accounts',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<AdapterAccountType>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    // snake_case TS props on purpose — the Auth.js adapter reads these exact
    // property names off the object it builds. Renaming them to camelCase makes
    // the adapter silently write nulls. See F1 §10.6.
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.providerAccountId] }),
    index('accounts_user_id_idx').on(t.userId),
  ],
)

export const sessions = pgTable(
  'sessions',
  {
    sessionToken: text('session_token').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expires: tsz('expires').notNull(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
)

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: tsz('expires').notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
)

/* ---------------------------------- Profile --------------------------------- */

export const profiles = pgTable('profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /**
   * Roadmap's schema block says default 'UTC'; [R8]-[R10] then approves F1's
   * proposal, and the Reconciliation section wins over anything earlier in the
   * file. The default only has to be a valid bootstrap value — F7 overwrites it
   * with the browser's resolved zone at onboarding.
   */
  timezone: text('timezone').notNull().default('Asia/Jakarta'),
  /** [R10] 'detected' | 'manual'. What makes silent re-detection safe. */
  timezoneSource: text('timezone_source')
    .$type<'detected' | 'manual'>()
    .notNull()
    .default('detected'),
  occupation: text('occupation'),
  interests: text('interests').array(),
  currentlyConsuming: text('currently_consuming'),
  englishContexts: text('english_contexts').array(),
  chatTone: text('chat_tone').$type<'patient' | 'blunt' | 'playful'>(),
  onboardedAt: tsz('onboarded_at'),
  createdAt: tsz('created_at').notNull().defaultNow(),
  updatedAt: tsz('updated_at').notNull().defaultNow(),
})

/* ----------------------------------- Vocab ---------------------------------- */

export const vocabEntries = pgTable(
  'vocab_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    term: text('term').notNull(),
    source: text('source').$type<'manual' | 'suggested'>().notNull(),
    status: text('status').$type<'active' | 'mastered'>().notNull().default('active'),
    partOfSpeech: text('part_of_speech'),
    pronunciation: text('pronunciation'),
    definition: text('definition'),
    examples: jsonb('examples').$type<string[]>(),
    enrichmentStatus: text('enrichment_status')
      .$type<'pending' | 'ready' | 'failed'>()
      .notNull()
      .default('pending'),
    /** [R9] carries "genteell" -> did you mean "genteel"? */
    suggestedCorrection: text('suggested_correction'),
    /** [R9] last failure, so F3 can tell "not a word" from "LLM timed out". */
    enrichmentError: text('enrichment_error'),
    /** [R9] */
    enrichmentAttempts: integer('enrichment_attempts').notNull().default(0),
    lastShownOn: localDate('last_shown_on'),
    createdAt: tsz('created_at').notNull().defaultNow(),
    masteredAt: tsz('mastered_at'),
    // NO deleted_at. There is no soft delete in v0.1.0 — see [R1].
  },
  (t) => [
    uniqueIndex('vocab_entries_user_term_uniq').on(t.userId, sql`lower(${t.term})`),
    index('vocab_entries_selection_idx').on(
      t.userId,
      t.status,
      t.lastShownOn.asc().nullsFirst(),
    ),
    index('vocab_entries_user_created_idx').on(t.userId, t.createdAt.desc()),
  ],
)

/* --------------------------------- Daily card -------------------------------- */

export const dailyCards = pgTable(
  'daily_cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    cardDate: localDate('card_date').notNull(),
    /**
     * The IANA zone actually used to compute `card_date`, recorded at creation.
     *
     * Additive, nullable, and worth its keep: `card_date` alone is
     * uninterpretable after a user changes timezone, so "I made a card but the
     * calendar shows the wrong day" goes from unanswerable to a five-minute
     * diagnosis. It also lets F9 recompute a past card's local hour and weekday
     * without assuming the *current* profile zone applied at the time.
     * Null on any row written before F5.
     */
    timezone: text('timezone'),
    createdAt: tsz('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('daily_cards_user_date_uniq').on(t.userId, t.cardDate)],
)

export const dailyCardItems = pgTable(
  'daily_card_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cardId: uuid('card_id')
      .notNull()
      .references(() => dailyCards.id, { onDelete: 'cascade' }),
    /**
     * RESTRICT is deliberate and is roadmap policy [R1]. A past card is a record
     * of a day that happened; deleting a word must never punch a hole in it.
     * A word with zero card items may still be hard deleted — the FK is what
     * enforces the distinction.
     */
    vocabEntryId: uuid('vocab_entry_id')
      .notNull()
      .references(() => vocabEntries.id, { onDelete: 'restrict' }),
    position: integer('position').notNull(),
  },
  (t) => [
    uniqueIndex('daily_card_items_card_position_uniq').on(t.cardId, t.position),
    index('daily_card_items_vocab_idx').on(t.vocabEntryId),
  ],
)

/* ----------------------------------- Chat ----------------------------------- */

export const chatSessions = pgTable(
  'chat_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** [R5] cascade: days are permanent, practice is not. */
    vocabEntryId: uuid('vocab_entry_id')
      .notNull()
      .references(() => vocabEntries.id, { onDelete: 'cascade' }),
    /** [R6] practice rounds — a closed session can be replayed without losing the transcript. */
    round: integer('round').notNull().default(1),
    turnCount: integer('turn_count').notNull().default(0),
    closedAt: tsz('closed_at'),
    lastMessageAt: tsz('last_message_at'),
    createdAt: tsz('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('chat_sessions_user_entry_uniq').on(t.userId, t.vocabEntryId)],
)

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => chatSessions.id, { onDelete: 'cascade' }),
    /** [R6] */
    round: integer('round').notNull().default(1),
    /** [R6] one opener per round; the verdict closes it. */
    kind: text('kind').$type<'opener' | 'reply' | 'verdict'>().notNull().default('reply'),
    role: text('role').$type<'user' | 'assistant'>().notNull(),
    content: text('content').notNull(),
    createdAt: tsz('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('chat_messages_session_created_idx').on(t.sessionId, t.createdAt),
    // [R6] partial unique: exactly one opener per (session, round).
    uniqueIndex('chat_messages_session_round_opener_uniq')
      .on(t.sessionId, t.round)
      .where(sql`${t.kind} = 'opener'`),
  ],
)

/* ---------------------------------- Journal --------------------------------- */

/** [R7] the insight is a two-part structure, so the column is jsonb, not text. */
export type JournalInsight = {
  meaning: string
  whenItApplies: string[]
}

export const journalEntries = pgTable(
  'journal_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    sourceNote: text('source_note'),
    insight: jsonb('insight').$type<JournalInsight>(),
    insightStatus: text('insight_status')
      .$type<'none' | 'pending' | 'ready' | 'failed'>()
      .notNull()
      .default('none'),
    /** [R8] without this, an entry stuck at 'pending' is permanently unretryable. */
    insightRequestedAt: tsz('insight_requested_at'),
    createdAt: tsz('created_at').notNull().defaultNow(),
    updatedAt: tsz('updated_at').notNull().defaultNow(),
  },
  (t) => [index('journal_entries_user_created_idx').on(t.userId, t.createdAt.desc())],
)

/* ------------------------------- Gamification -------------------------------- */

/** CACHE ONLY. Never trusted for display — /profile recomputes on read. See [R11]. */
export const userStats = pgTable('user_stats', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  currentStreak: integer('current_streak').notNull().default(0),
  longestStreak: integer('longest_streak').notNull().default(0),
  totalCards: integer('total_cards').notNull().default(0),
  firstCardOn: localDate('first_card_on'),
  /** [R11] a streak decays with time and nothing writes on absence. */
  lastCardOn: localDate('last_card_on'),
  updatedAt: tsz('updated_at').notNull().defaultNow(),
})

export const badgesAwarded = pgTable(
  'badges_awarded',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    badgeKey: text('badge_key').notNull(),
    awardedForDate: localDate('awarded_for_date').notNull(),
    createdAt: tsz('created_at').notNull().defaultNow(),
  },
  (t) => [
    // What makes badge awarding idempotent. F9 must pair it with onConflictDoNothing().
    uniqueIndex('badges_awarded_uniq').on(t.userId, t.badgeKey, t.awardedForDate),
    index('badges_awarded_user_created_idx').on(t.userId, t.createdAt.desc()),
  ],
)
