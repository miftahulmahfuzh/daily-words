import type {
  users,
  profiles,
  vocabEntries,
  dailyCards,
  dailyCardItems,
  chatSessions,
  chatMessages,
  journalEntries,
  journalEntryEmbeddings,
  userStats,
  badgesAwarded,
  shares,
} from '@/lib/db/schema'

export type { JournalInsight } from '@/lib/db/schema'

export type User = typeof users.$inferSelect
export type Profile = typeof profiles.$inferSelect
export type NewProfile = typeof profiles.$inferInsert
export type VocabEntry = typeof vocabEntries.$inferSelect
export type NewVocabEntry = typeof vocabEntries.$inferInsert
export type DailyCard = typeof dailyCards.$inferSelect
export type DailyCardItem = typeof dailyCardItems.$inferSelect
export type ChatSession = typeof chatSessions.$inferSelect
export type ChatMessage = typeof chatMessages.$inferSelect
export type JournalEntry = typeof journalEntries.$inferSelect
export type NewJournalEntry = typeof journalEntries.$inferInsert
export type JournalEntryEmbedding = typeof journalEntryEmbeddings.$inferSelect
export type NewJournalEntryEmbedding = typeof journalEntryEmbeddings.$inferInsert
export type UserStats = typeof userStats.$inferSelect
export type BadgeAward = typeof badgesAwarded.$inferSelect
export type Share = typeof shares.$inferSelect
export type NewShare = typeof shares.$inferInsert

// 'shared' is F17's: a word claimed from somebody else's share link. Kept out of
// 'manual' so F9's collector level keeps counting words the user typed.
export type VocabSource = VocabEntry['source'] // 'manual' | 'suggested' | 'shared'
export type VocabStatus = VocabEntry['status'] // 'active' | 'mastered'
export type EnrichmentStatus = VocabEntry['enrichmentStatus']
export type InsightStatus = JournalEntry['insightStatus']
export type ChatTone = NonNullable<Profile['chatTone']> // 'patient'|'blunt'|'playful'
export type ChatRole = ChatMessage['role'] // 'user' | 'assistant'
export type ChatMessageKind = ChatMessage['kind'] // 'opener'|'reply'|'verdict'
export type TimezoneSource = Profile['timezoneSource'] // 'detected' | 'manual'
export type ShareEntityType = Share['entityType'] // 'vocab' | 'card' | 'journal'
