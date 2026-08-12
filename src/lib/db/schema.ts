import { sql } from 'drizzle-orm'
import {
  check,
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
  vector,
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
  /**
   * The user's date of birth, `'YYYY-MM-DD'`, or null — which is where every
   * profile that existed before this column starts, and where a profile whose
   * owner declined the question stays.
   *
   * A `date` and not a `(month, day)` pair: it is a real day, `localDate()`
   * already reads and writes it as a string, and the badge that consumes it
   * reads the month and day off it and ignores the year. NOT NULL was never an
   * option — the column has to be able to say "never answered", and that is a
   * different fact from any date it could be defaulted to.
   *
   * **Not one of the five onboarding answers**, deliberately: the roadmap caps
   * that flow at five questions and `ONBOARDING_STEPS` is not a config value.
   * `/birthday` is its own single-question screen, asked once of everybody.
   */
  birthday: localDate('birthday'),
  /**
   * When the birthday question was last put to this user — set whether they
   * answered it or skipped it, which is the whole reason it exists. Without it
   * `birthday IS NULL` cannot tell "not asked yet" from "asked and declined",
   * and a skip would re-ask on every single app open forever.
   */
  birthdayAskedAt: tsz('birthday_asked_at'),
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
    /**
     * How the word got here. `'shared'` is F17's, and it is a third value on a
     * plain `text` column rather than a pgEnum — the same TypeScript-level
     * refinement `status` and `enrichment_status` use — so widening it emits no
     * DDL and needs no migration.
     *
     * It exists because reusing `'manual'` would silently redefine eight badge
     * titles: F9's collector level counts manually added words, and a stranger
     * who claims one shared word would become a "Word Picker" with no code
     * change anywhere near `lib/gamification/`. `'suggested'` was wrong for a
     * neighbouring reason — `listKeptFromDiscover` renders exactly those rows
     * under a heading naming a feature the claimer has never opened. See F17 D7.
     */
    source: text('source').$type<'manual' | 'suggested' | 'shared'>().notNull(),
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
    /**
     * Where a non-English lookup started. All three are null for every row
     * added in English, which is every row written before migration 0008 — not
     * a placeholder, but the truth about how those words got here.
     *
     * The **term is the English word**: `melumuri` resolves to `smear` and
     * `smear` is what this row holds, because `pronunciation` is specified as
     * British RP and all three `examples` must contain the term, neither of
     * which has a defined meaning for an Indonesian headword. These three
     * columns are the trail back to why the word is in the collection.
     *
     * `source` stays `'manual'` for these rows, which is the *opposite* call to
     * F17's and deliberate: a claimed word got `'shared'` so F9's collector
     * level would not count a stranger's word, and this is the inverse — the
     * user typed it, chose it and kept it, so it counts.
     *
     * `origin_language` is the model's detection, never a question asked of the
     * user. Flat columns rather than one jsonb, matching the grain above:
     * `examples` is jsonb because it is a list, these are three scalars.
     */
    originTerm: text('origin_term'),
    originLanguage: text('origin_language'),
    /** The "as in" sentence. Never crosses into a share payload — see D6. */
    originContext: text('origin_context'),
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
    /**
     * F9's collector level counts `user_id = $1 AND source = 'manual'` on every
     * /profile read. Neither index above can serve that filter: the unique one
     * is on `lower(term)` and the other on `created_at`. Additive, and approved
     * as one of the set in [R8]–[R10].
     *
     * It serves all three values of `source` equally, which is *why* F17 could
     * add `'shared'` without touching anything here: `queries/stats.ts`'s
     * `= 'manual'` count and `queries/vocab-suggestions.ts`'s `= 'suggested'`
     * list both keep their index scan **and** both keep meaning what they say,
     * so a claimed word does not inflate the collector level.
     */
    index('vocab_entries_user_source_idx').on(t.userId, t.source),
    /**
     * A context sentence with nothing to be the context *of* is a bug, and it is
     * cheaper to make it unrepresentable than to test for it everywhere a row
     * is written. The converse is legal: an origin term with no sentence is a
     * lookup where the user did not supply one, which is the common case.
     */
    check(
      'vocab_entries_origin_context_needs_term',
      sql`${t.originContext} is null or ${t.originTerm} is not null`,
    ),
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
    /**
     * The only read path this feature has, in both its shapes: one round's
     * history for the model, and every round chronologically for the page.
     * `(round, created_at)` is chronological order for the second case too,
     * because `round` only ever increases — so one index serves both and F6 §5
     * gets its composite without a second index on a sixteen-row table.
     *
     * Replaces F1's `(session_id, created_at)`, which cannot serve the
     * per-round filter.
     */
    index('chat_messages_session_round_created_idx').on(
      t.sessionId,
      t.round,
      t.createdAt,
    ),
    // [R6] partial unique: exactly one opener per (session, round).
    uniqueIndex('chat_messages_session_round_opener_uniq')
      .on(t.sessionId, t.round)
      .where(sql`${t.kind} = 'opener'`),
    /**
     * `$type<>()` is a compile-time claim; this is the runtime one. F6 reads
     * `kind` to decide what goes in the model's history and what renders as a
     * card, so a fourth value arriving from a migration or a psql session would
     * be a silent display bug rather than an error.
     */
    check('chat_messages_kind_check', sql`${t.kind} in ('opener', 'reply', 'verdict')`),
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

/**
 * F15: one embedding per journal entry, in a table of its own.
 *
 * Deliberately NOT a column on `journal_entries`. Every read in
 * `lib/db/queries/journal.ts` is `db.select().from(journalEntries)` with no
 * column list, so a vector(1536) — 6 148 bytes — would ride along on all thirty
 * rows of every journal page to render text. See F15 §2.2.
 *
 * `user_id` is denormalised so the search filters by owner without touching
 * `journal_entries`; the FK to `users` mirrors `journal_entries` so a deleted
 * user cascades from both directions.
 *
 * `text_sha` is sha256 of the exact text that was embedded. Postgres computes
 * `sha256(text::bytea)` natively (PG 11+; this instance is 18.4), so a stale
 * vector is detected inside the search query itself and an edit needs no
 * invalidation write anywhere — which is why `PATCH /api/journal/[id]` gained
 * nothing in F15. `norm_sha` is sha256 of `normalizeForCompare()` output and is
 * Layer 1, the free duplicate check that needs no provider at all.
 *
 * No verdict is ever stored. "Unique" is a property of a *collection*, and the
 * collection changes with the next save; what is stored is only whether a
 * current vector exists for this row's current text.
 */
export const journalEntryEmbeddings = pgTable(
  'journal_entry_embeddings',
  {
    entryId: uuid('entry_id')
      .primaryKey()
      .references(() => journalEntries.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 'ready' | 'failed'. The absence of a row is the third state: never tried. */
    status: text('status').$type<'ready' | 'failed'>().notNull(),
    /** sha256 hex of the exact text embedded. Stale when it != sha256(entry.text). */
    textSha: text('text_sha').notNull(),
    /** sha256 hex of normalizeForCompare(text). Layer 1, and it needs no provider. */
    normSha: text('norm_sha').notNull(),
    /** Which model produced it. A model change invalidates by value, not by DDL. */
    model: text('model'),
    /** Null on 'failed'. pgvector skips NULLs in the index. */
    embedding: vector('embedding', { dimensions: 1536 }),
    attempts: integer('attempts').notNull().default(0),
    /** Server-log detail for a 'failed' row. Never rendered. */
    failedReason: text('failed_reason'),
    createdAt: tsz('created_at').notNull().defaultNow(),
    updatedAt: tsz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    // Layer 1. The only index the feature strictly needs.
    index('journal_entry_embeddings_norm_idx').on(t.userId, t.normSha),
    // Drives the backfill's "what is missing" scan and the coverage count.
    index('journal_entry_embeddings_user_status_idx').on(t.userId, t.status),
    // Layer 2. Built on an empty table because that is the only moment it is
    // free; correctness does not rest on it. At this scale the planner prefers a
    // filtered exact scan, which has perfect recall — see F15 §3.3 and the
    // comment on `findNearest` for the trigger to revisit that.
    index('journal_entry_embeddings_hnsw_idx').using(
      'hnsw',
      t.embedding.op('vector_cosine_ops'),
    ),
  ],
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

/* ---------------------------------- Shares ---------------------------------- */

/**
 * F16. Opt-in, token-addressed sharing. [S3]: a row exists only because the user
 * tapped Share; the slug is the capability; revoking is deleting the row.
 *
 * Three nullable FK columns rather than a polymorphic (entity_type, entity_id)
 * pair, because a polymorphic pair cannot carry a real foreign key and a share
 * whose target was deleted would 500 in front of a stranger. F18's two extra
 * types write into columns that already exist here — no second migration.
 *
 * CASCADE, not the RESTRICT of daily_card_items: that rule protects a record of
 * a day that happened, and a share is not one. RESTRICT here would make a shared
 * word permanently undeletable and break [R1]'s typo-recovery path —
 * `deleteVocabEntry` would find no card items, issue the DELETE, and take a raw
 * 23503 that no caller catches. Deleting the word revokes the share, which is
 * also the only answer that keeps the user in control of their own data.
 */
export const shares = pgTable(
  'shares',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** 16 chars of Crockford-style base32 = 80 bits. See F16 §1 D6. */
    slug: text('slug').notNull(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    entityType: text('entity_type').$type<'vocab' | 'card' | 'journal'>().notNull(),

    vocabEntryId: uuid('vocab_entry_id').references(() => vocabEntries.id, {
      onDelete: 'cascade',
    }),
    /** F18. Created now, unused in F16. */
    dailyCardId: uuid('daily_card_id').references(() => dailyCards.id, {
      onDelete: 'cascade',
    }),
    /** F18. Created now, unused in F16. */
    journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id, {
      onDelete: 'cascade',
    }),

    /**
     * The snapshot. What was shared, as it was when it was shared.
     *
     * Not a join: a live read against a user-owned table leaks any private
     * column added to it later, silently — the public read would be a
     * `select()` over a table that keeps gaining columns, and nothing in the
     * type system or the check scripts would notice. This column is written by
     * one allowlisting serializer (`lib/share/serialize.ts`), so "what a
     * stranger can see" is decided in one file rather than by every future
     * migration. See F16 §1 D3.
     */
    payload: jsonb('payload').notNull(),
    payloadVersion: integer('payload_version').notNull().default(1),

    createdAt: tsz('created_at').notNull().defaultNow(),
    // No expires_at. There is no cron in this app ([R11]); a TTL with nothing to
    // enforce it is a lie in the schema. Revocation is manual and immediate.
  },
  (t) => [
    /** The public read path, and the only one that takes no user id. */
    uniqueIndex('shares_slug_uniq').on(t.slug),

    /**
     * One live share per entity, which is what makes the Share button
     * idempotent and revoke unambiguous. Partial because Postgres treats NULLs
     * as distinct — a plain unique index on a nullable column would also work,
     * but the partial one is smaller and says what it means.
     */
    uniqueIndex('shares_vocab_entry_uniq')
      .on(t.vocabEntryId)
      .where(sql`${t.vocabEntryId} is not null`),
    uniqueIndex('shares_daily_card_uniq')
      .on(t.dailyCardId)
      .where(sql`${t.dailyCardId} is not null`),
    uniqueIndex('shares_journal_entry_uniq')
      .on(t.journalEntryId)
      .where(sql`${t.journalEntryId} is not null`),

    /**
     * The only non-slug access path: listShares(userId), and the cascade from
     * users.id, which without this is a sequential scan (Postgres does not index
     * the referencing side of an FK).
     */
    index('shares_user_created_idx').on(t.userId, t.createdAt.desc()),

    /**
     * Exactly one entity id, and it agrees with entity_type. One constraint
     * rather than three: `$type<>()` is a compile-time claim and this is the
     * runtime one, and it is what makes the three columns behave as a
     * discriminated union rather than as three independent nullable columns.
     */
    check(
      'shares_entity_check',
      sql`(
        (${t.entityType} = 'vocab'
           and ${t.vocabEntryId} is not null
           and ${t.dailyCardId} is null and ${t.journalEntryId} is null)
     or (${t.entityType} = 'card'
           and ${t.dailyCardId} is not null
           and ${t.vocabEntryId} is null and ${t.journalEntryId} is null)
     or (${t.entityType} = 'journal'
           and ${t.journalEntryId} is not null
           and ${t.vocabEntryId} is null and ${t.dailyCardId} is null)
      )`,
    ),
  ],
)
