/**
 * A demo account with a plausible history, for capturing the README's media.
 *
 *   npm run demo:seed          seed (idempotent — wipes and rebuilds the account)
 *   npm run demo:seed -- --clean   delete the account and stop
 *   npm run demo:seed -- --token   print the session token of the live account
 *
 * Not a test and not part of the app. It exists because every screen worth
 * photographing needs a *session*, and Auth.js uses database sessions here — so
 * a signed-in browser is a `sessions` row and nothing more. The token it prints
 * is what `scripts/capture-media.ts` puts in a cookie.
 *
 * **Everything below is written through the app's own paths where one exists.**
 * `createCard` picks the six words (so `last_shown_on` rotates exactly as it
 * does in production) and `recomputeUserGamification` derives the streaks,
 * levels and badges from the card rows rather than asserting them. A fixture
 * that hand-writes `user_stats` would photograph a screen the app cannot
 * produce, which is the one thing a README screenshot must not do.
 *
 * `--clean` first, then re-seed, is the whole story: the account is addressed by
 * a fixed email under `.invalid`, so there is nothing to collide with and
 * nothing to leak into a real user's data.
 */
import { and, eq, sql } from 'drizzle-orm'
import { db } from '../src/lib/db'
import {
  chatMessages,
  chatSessions,
  dailyCards,
  journalEntries,
  profiles,
  sessions,
  shares,
  users,
  vocabEntries,
} from '../src/lib/db/schema'
import { createCard, getCardForShare } from '../src/lib/db/queries/cards'
import { recomputeUserGamification } from '../src/lib/gamification/recompute'
import { newShareSlug } from '../src/lib/share/slug'
import {
  toSharedCardPayload,
  toSharedJournalPayload,
  toSharedWordPayload,
} from '../src/lib/share/serialize'
import { addLocalDays, localDateNow, type LocalDate } from '../src/lib/time/local-date'

const EMAIL = 'barnaby@demo.invalid'
const NAME = 'Barnaby'
const TZ = 'Asia/Jakarta'
/** Fixed, so a re-seed does not invalidate a browser that is already open. */
const SESSION_TOKEN = 'dw-demo-session-0000000000000000'

type Word = {
  term: string
  pos: string
  ipa: string
  def: string
  examples: [string, string]
  source?: 'manual' | 'suggested' | 'shared'
  status?: 'active' | 'mastered'
  /** The non-English lookup's trail, for the one row that has one. */
  origin?: { term: string; language: string; context: string }
  /** Days before today the word was added, so the collection has a real order. */
  age: number
}

/**
 * Twenty-nine words: twenty-six added by hand, two kept from Discover and one
 * claimed from somebody else's share. The split is not decoration — F9's
 * collector level counts `source = 'manual'` only, so it is what puts the
 * account on "Shelf of Odds" rather than one tier above it.
 *
 * Definitions are kept under sixty characters, which is F2's obligation on F3
 * and the reason a two-line card row can promise a fixed height.
 */
const WORDS: Word[] = [
  {
    term: 'genteel',
    pos: 'adjective',
    ipa: '/dʒɛnˈtiːl/',
    def: 'polite in a way that tries too hard',
    examples: [
      'His genteel manners fooled nobody at that table.',
      'A genteel poverty, kept up for the neighbours.',
    ],
    age: 41,
  },
  {
    term: 'winnow',
    pos: 'verb',
    ipa: '/ˈwɪnəʊ/',
    def: 'to sift out what is not wanted',
    examples: [
      'We winnow the shortlist down to three by Friday.',
      'She winnowed the drawer of everything unopened.',
    ],
    age: 39,
    status: 'mastered',
  },
  {
    term: 'sanguine',
    pos: 'adjective',
    ipa: '/ˈsæŋɡwɪn/',
    def: 'cheerful with little reason to be',
    examples: [
      'He stayed sanguine about a deadline nobody believed in.',
      'A sanguine reading of the numbers, and a wrong one.',
    ],
    age: 37,
  },
  {
    term: 'gossamer',
    pos: 'noun',
    ipa: '/ˈɡɒsəmə/',
    def: 'so fine it is nearly not there',
    examples: [
      'Gossamer hung on the fence and caught the morning.',
      'A gossamer excuse, and he knew it as he said it.',
    ],
    age: 35,
  },
  {
    term: 'halcyon',
    pos: 'adjective',
    ipa: '/ˈhælsɪən/',
    def: 'calm, and remembered as calmer still',
    examples: [
      'The halcyon summer before either of us worked.',
      'He talks about the old office in halcyon terms.',
    ],
    age: 34,
  },
  {
    term: 'truculent',
    pos: 'adjective',
    ipa: '/ˈtrʌkjʊlənt/',
    def: 'spoiling for an argument',
    examples: [
      'A truculent reply to a question nobody meant badly.',
      'He gets truculent an hour into any meeting.',
    ],
    age: 32,
  },
  {
    term: 'petrichor',
    pos: 'noun',
    ipa: '/ˈpɛtrɪkɔː/',
    def: 'the smell of rain on dry ground',
    examples: [
      'Petrichor came up off the road before the rain did.',
      'That first petrichor is the whole of the wet season.',
    ],
    age: 30,
  },
  {
    term: 'laconic',
    pos: 'adjective',
    ipa: '/ləˈkɒnɪk/',
    def: 'saying little, and meaning all of it',
    examples: [
      'A laconic “noted” was the entire review.',
      'He is laconic on the phone and warm in person.',
    ],
    age: 29,
  },
  {
    term: 'obsequious',
    pos: 'adjective',
    ipa: '/əbˈsiːkwɪəs/',
    def: 'fawning, and after something',
    examples: [
      'An obsequious note to the man who signs the budget.',
      'He was obsequious upward and short downward.',
    ],
    age: 27,
  },
  {
    term: 'quotidian',
    pos: 'adjective',
    ipa: '/kwɒˈtɪdɪən/',
    def: 'so daily it has stopped being noticed',
    examples: [
      'The quotidian business of getting six words down.',
      'Quotidian traffic, and an hour of it either way.',
    ],
    age: 25,
  },
  {
    term: 'susurrus',
    pos: 'noun',
    ipa: '/sʊˈsʌrəs/',
    def: 'a whispering, rustling sound',
    examples: [
      'A susurrus of paper as the room found the page.',
      'The susurrus of the fan is the only sound up here.',
    ],
    age: 24,
  },
  {
    term: 'limerence',
    pos: 'noun',
    ipa: '/ˈlɪmərəns/',
    def: 'the helpless first stage of love',
    examples: [
      'Limerence explains the first month and nothing after.',
      'He mistook limerence for a decision about his life.',
    ],
    age: 22,
  },
  {
    term: 'defenestrate',
    pos: 'verb',
    ipa: '/diːˈfɛnɪstreɪt/',
    def: 'to throw someone out of a window',
    examples: [
      'Prague defenestrated its councillors twice, historically.',
      'I would defenestrate this printer if the window opened.',
    ],
    age: 21,
  },
  {
    term: 'penumbra',
    pos: 'noun',
    ipa: '/pɪˈnʌmbrə/',
    def: 'the half-shadow at a shadow’s edge',
    examples: [
      'The penumbra of the eclipse crossed the yard slowly.',
      'A penumbra of doubt around an otherwise clean claim.',
    ],
    age: 19,
  },
  {
    term: 'sonder',
    pos: 'noun',
    ipa: '/ˈsɒndə/',
    def: 'every stranger has a whole life',
    examples: [
      'Sonder, on a bus at six, looking at forty faces.',
      'A moment of sonder in the queue outside the bank.',
    ],
    age: 18,
  },
  {
    term: 'recalcitrant',
    pos: 'adjective',
    ipa: '/rɪˈkælsɪtrənt/',
    def: 'refusing, steadily, to be managed',
    examples: [
      'One recalcitrant migration and the whole deploy waits.',
      'A recalcitrant child and a patient grandmother.',
    ],
    age: 16,
  },
  {
    term: 'ineffable',
    pos: 'adjective',
    ipa: '/ɪnˈɛfəbl/',
    def: 'too large for the words available',
    examples: [
      'She called it ineffable and then talked for an hour.',
      'An ineffable relief when the test finally went green.',
    ],
    age: 15,
    status: 'mastered',
  },
  {
    term: 'bucolic',
    pos: 'adjective',
    ipa: '/bjuːˈkɒlɪk/',
    def: 'of the countryside, and glad of it',
    examples: [
      'A bucolic weekend, and mud on everything by Sunday.',
      'He sends bucolic photographs from his mother’s village.',
    ],
    age: 13,
  },
  {
    term: 'cantankerous',
    pos: 'adjective',
    ipa: '/kænˈtæŋkərəs/',
    def: 'bad-tempered as a settled habit',
    examples: [
      'A cantankerous uncle who is right about most things.',
      'The lift is cantankerous between the third and fourth.',
    ],
    age: 12,
  },
  {
    term: 'lassitude',
    pos: 'noun',
    ipa: '/ˈlæsɪtjuːd/',
    def: 'tiredness that has lost its cause',
    examples: [
      'A lassitude that no amount of coffee touched.',
      'Wednesday lassitude, and two more days of it.',
    ],
    age: 10,
  },
  {
    term: 'perfunctory',
    pos: 'adjective',
    ipa: '/pəˈfʌŋktəri/',
    def: 'done to be seen to have been done',
    examples: [
      'A perfunctory apology, delivered to the room.',
      'He gave the document a perfunctory scroll.',
    ],
    age: 9,
  },
  {
    term: 'eddy',
    pos: 'noun',
    ipa: '/ˈɛdi/',
    def: 'water turning back on itself',
    examples: [
      'An eddy behind the rock, holding one leaf in place.',
      'The conversation caught in an eddy and went round.',
    ],
    age: 7,
  },
  {
    term: 'nadir',
    pos: 'noun',
    ipa: '/ˈneɪdɪə/',
    def: 'the lowest point, and the turn after',
    examples: [
      'March was the nadir and nobody says otherwise.',
      'At the nadir of it he started writing things down.',
    ],
    age: 6,
  },
  {
    term: 'verdant',
    pos: 'adjective',
    ipa: '/ˈvɜːdənt/',
    def: 'green in the way new growth is green',
    examples: [
      'A verdant month, after all that rain in June.',
      'The verdant strip between the road and the kampung.',
    ],
    age: 4,
  },
  {
    term: 'smear',
    pos: 'verb',
    ipa: '/smɪə/',
    def: 'to spread thinly and untidily',
    examples: [
      'He smeared the balm across his forehead and gave up.',
      'Don’t smear it on — press it in and let it sit.',
    ],
    origin: {
      term: 'melumuri',
      language: 'Indonesian',
      context: 'Ibu melumuri dahi saya dengan minyak kayu putih.',
    },
    age: 3,
  },
  {
    term: 'desultory',
    pos: 'adjective',
    ipa: '/ˈdɛsəltəri/',
    def: 'from thing to thing with no plan',
    examples: [
      'A desultory hour of tabs and no decision at all.',
      'Desultory practice is how a language is forgotten.',
    ],
    age: 2,
    status: 'mastered',
  },

  /* Kept from Discover. `source = 'suggested'`, which is what puts them under
     that tab's "kept" heading and keeps them out of the collector count. */
  {
    term: 'epistolary',
    pos: 'adjective',
    ipa: '/ɪˈpɪstələri/',
    def: 'carried on in letters',
    examples: [
      'An epistolary friendship, four years and no phone call.',
      'The novel is epistolary and better for it.',
    ],
    source: 'suggested',
    age: 20,
  },
  {
    term: 'threnody',
    pos: 'noun',
    ipa: '/ˈθrɛnədi/',
    def: 'a song for someone who has died',
    examples: [
      'The last movement is a threnody for his brother.',
      'What began as a complaint ended as a threnody.',
    ],
    source: 'suggested',
    age: 11,
  },

  /* Claimed from a stranger's shared link. `source = 'shared'` exists so that
     one tap on somebody else's word cannot promote this account a collector
     tier — see F17 D7. */
  {
    term: 'arcadian',
    pos: 'adjective',
    ipa: '/ɑːˈkeɪdɪən/',
    def: 'rural and impossibly peaceful',
    examples: [
      'An arcadian view, and a two-hour drive to a shop.',
      'He wants something arcadian and near a hospital.',
    ],
    source: 'shared',
    age: 5,
  },
]

/** Lines worth keeping. One carries an insight, because one is the honest rate. */
const JOURNAL = [
  {
    text: 'A fall in a pit, a gain in one’s wit.',
    note: 'Chinese proverb, heard in a film',
    age: 1,
    insight: {
      meaning:
        'Failure teaches. The proverb does not soften the loss; it treats the understanding gained as what the loss bought.',
      whenItApplies: [
        'Reviewing a project that failed and working out what it taught.',
        'Reassuring someone who has just made an expensive mistake.',
        'Arguing for trying something that might not work.',
      ],
    },
  },
  {
    text: 'The axe forgets; the tree remembers.',
    note: 'Zimbabwean proverb',
    age: 3,
    insight: null,
  },
  {
    text: 'Ada hikmah di setiap pertemuan.',
    note: 'Ibu, on the phone, Sunday',
    age: 6,
    insight: null,
  },
  {
    text: 'He who has a why to live can bear almost any how.',
    note: 'Nietzsche, by way of Frankl',
    age: 9,
    insight: null,
  },
  {
    text: 'Still waters run deep.',
    note: null,
    age: 14,
    insight: null,
  },
]

/**
 * Which days have a card.
 *
 * Two runs with a gap between them, deliberately: the calendar's whole job is
 * ticks *and* crosses, and a fixture that is solid green photographs a screen
 * that says nothing. The recent run stops at yesterday so `/today` opens on the
 * nudge — the one screen state the README most needs to show, and the one a
 * seeded card would destroy.
 */
function cardDates(today: LocalDate): LocalDate[] {
  const days: LocalDate[] = []
  // The current run: thirteen days ending yesterday. Pressing the button in the
  // browser makes it fourteen, which is the "Margin Scribbler" band.
  for (let i = 13; i >= 1; i--) days.push(addLocalDays(today, -i))
  // A scattering before it, so the month has gaps.
  for (const back of [15, 16, 18, 20, 21]) days.push(addLocalDays(today, -back))
  // An earlier, longer run — this is what `longest_streak` reports.
  for (let i = 44; i >= 24; i--) days.push(addLocalDays(today, -i))
  return days.sort()
}

async function findUser(): Promise<string | null> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, EMAIL))
    .limit(1)
  return row?.id ?? null
}

/**
 * `daily_card_items` is RESTRICT on `vocab_entries` ([R1]), so the order here is
 * not a preference: items, then cards, then words. Deleting the user would
 * cascade through all of it, and that is what this does — but only after the
 * card items are gone, because the cascade from `users` reaches `vocab_entries`
 * and the RESTRICT from `daily_card_items` fires first.
 */
async function clean(userId: string) {
  await db.execute(
    sql`delete from daily_card_items where card_id in (select id from daily_cards where user_id = ${userId})`,
  )
  await db.delete(dailyCards).where(eq(dailyCards.userId, userId))
  await db.delete(shares).where(eq(shares.userId, userId))
  await db.delete(vocabEntries).where(eq(vocabEntries.userId, userId))
  await db.delete(users).where(eq(users.id, userId))
}

async function seed() {
  const today = localDateNow(TZ)
  const now = Date.now()
  const daysAgo = (n: number) => new Date(now - n * 86_400_000)

  const [user] = await db
    .insert(users)
    .values({ email: EMAIL, name: NAME, emailVerified: daysAgo(45) })
    .returning({ id: users.id })
  const userId = user.id

  await db.insert(profiles).values({
    userId,
    timezone: TZ,
    timezoneSource: 'detected',
    occupation: 'Backend engineer at a payments company',
    interests: ['long-distance running', 'Javanese cooking', 'nineteenth-century novels'],
    currentlyConsuming: 'Bleak House, slowly, and a podcast about shipping containers',
    englishContexts: ['code review', 'standups with the Singapore team', 'writing docs'],
    chatTone: 'blunt',
    // Not today's date, on purpose: the birthday badge is a real rule and a
    // fixture should not quietly award itself one.
    birthday: '1994-03-12',
    birthdayAskedAt: daysAgo(44),
    onboardedAt: daysAgo(45),
    createdAt: daysAgo(45),
  })

  await db.insert(sessions).values({
    sessionToken: SESSION_TOKEN,
    userId,
    expires: new Date(now + 30 * 86_400_000),
  })

  const byTerm = new Map<string, string>()
  for (const w of WORDS) {
    const [row] = await db
      .insert(vocabEntries)
      .values({
        userId,
        term: w.term,
        source: w.source ?? 'manual',
        status: w.status ?? 'active',
        partOfSpeech: w.pos,
        pronunciation: w.ipa,
        definition: w.def,
        examples: w.examples,
        enrichmentStatus: 'ready',
        originTerm: w.origin?.term ?? null,
        originLanguage: w.origin?.language ?? null,
        originContext: w.origin?.context ?? null,
        createdAt: daysAgo(w.age),
        masteredAt: w.status === 'mastered' ? daysAgo(Math.max(1, w.age - 8)) : null,
      })
      .returning({ id: vocabEntries.id })
    byTerm.set(w.term, row.id)
  }

  /* Cards through the app's own path, oldest first, so `selectCardCandidates`
     rotates `last_shown_on` exactly as it does in production. */
  const dates = cardDates(today)
  for (const date of dates) {
    const outcome = await createCard(userId, date, TZ)
    if (outcome.status === 'created') {
      // `createCard` stamps now(); a card dated five weeks ago that was written
      // this afternoon makes every local-hour badge read the wrong day.
      await db
        .update(dailyCards)
        .set({ createdAt: new Date(`${date}T20:40:00+07:00`) })
        .where(and(eq(dailyCards.userId, userId), eq(dailyCards.cardDate, date)))
    }
  }

  const journalIds: string[] = []
  for (const j of JOURNAL) {
    const [row] = await db
      .insert(journalEntries)
      .values({
        userId,
        text: j.text,
        sourceNote: j.note,
        insight: j.insight,
        insightStatus: j.insight ? 'ready' : 'none',
        insightRequestedAt: j.insight ? daysAgo(j.age) : null,
        createdAt: daysAgo(j.age),
        updatedAt: daysAgo(j.age),
      })
      .returning({ id: journalEntries.id })
    journalIds.push(row.id)
  }

  /* One practice session, mid-round, on the word the README leads with. Written
     rather than generated: `chat:dry-run` is what exercises the prompts, and a
     README capture should not depend on a live model. */
  const genteelId = byTerm.get('genteel')!
  const [chat] = await db
    .insert(chatSessions)
    .values({
      userId,
      vocabEntryId: genteelId,
      round: 1,
      turnCount: 2,
      lastMessageAt: daysAgo(1),
      createdAt: daysAgo(1),
    })
    .returning({ id: chatSessions.id })

  await db.insert(chatMessages).values([
    {
      sessionId: chat.id,
      round: 1,
      kind: 'opener',
      role: 'assistant',
      content:
        'So the payments lead has finally answered your review comments — three paragraphs, two “as per my previous message”, and not one actual answer in any of it. How would you describe the way he wrote it?',
      createdAt: new Date(now - 86_400_000 - 600_000),
    },
    {
      sessionId: chat.id,
      round: 1,
      kind: 'reply',
      role: 'user',
      content: 'It was very genteel of him to reply so fast.',
      createdAt: new Date(now - 86_400_000 - 540_000),
    },
    {
      sessionId: chat.id,
      round: 1,
      kind: 'reply',
      role: 'assistant',
      content:
        'Careful — genteel describes a manner, not a speed, so it cannot do the work of “promptly”. Try it on the tone instead: what was genteel about three paragraphs that answered nothing?',
      createdAt: new Date(now - 86_400_000 - 480_000),
    },
  ])

  /* Three shares, one of each kind, so all three public pages have a URL. The
     payload is a snapshot written by `lib/share/serialize.ts` — never a join. */
  const petrichor = await db
    .select()
    .from(vocabEntries)
    .where(eq(vocabEntries.id, byTerm.get('petrichor')!))
    .limit(1)
  const wordSlug = newShareSlug()
  await db.insert(shares).values({
    slug: wordSlug,
    userId,
    entityType: 'vocab',
    vocabEntryId: petrichor[0].id,
    payload: toSharedWordPayload(petrichor[0]),
    createdAt: daysAgo(2),
  })

  const lastCardDate = dates[dates.length - 1]
  const [lastCard] = await db
    .select({ id: dailyCards.id })
    .from(dailyCards)
    .where(and(eq(dailyCards.userId, userId), eq(dailyCards.cardDate, lastCardDate)))
    .limit(1)
  const forShare = await getCardForShare(userId, lastCard.id)
  const cardSlug = newShareSlug()
  await db.insert(shares).values({
    slug: cardSlug,
    userId,
    entityType: 'card',
    dailyCardId: lastCard.id,
    payload: toSharedCardPayload(forShare!),
    createdAt: daysAgo(1),
  })

  const [entry] = await db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.id, journalIds[0]))
    .limit(1)
  const journalSlug = newShareSlug()
  await db.insert(shares).values({
    slug: journalSlug,
    userId,
    entityType: 'journal',
    journalEntryId: entry.id,
    payload: toSharedJournalPayload(entry, TZ),
    createdAt: daysAgo(1),
  })

  /* Streaks, levels and badges are derived, never asserted. */
  const report = await recomputeUserGamification(userId)

  return {
    userId,
    today,
    cards: dates.length,
    words: WORDS.length,
    stats: report,
    slugs: { word: wordSlug, card: cardSlug, journal: journalSlug },
    firstWordId: byTerm.get('genteel')!,
    journalEntryId: journalIds[0],
    lastCardDate,
  }
}

async function main() {
  const args = process.argv.slice(2)

  if (args.includes('--token')) {
    const id = await findUser()
    if (!id) throw new Error(`no demo account (${EMAIL}); run without --token first`)
    console.log(SESSION_TOKEN)
    return
  }

  const existing = await findUser()
  if (existing) {
    await clean(existing)
    console.log(`removed the previous demo account (${EMAIL})`)
  }
  if (args.includes('--clean')) return

  const out = await seed()
  console.log(
    [
      '',
      `  account      ${EMAIL}  (${out.userId})`,
      `  session      ${SESSION_TOKEN}`,
      `  timezone     ${TZ}, today is ${out.today}`,
      `  words        ${out.words}`,
      `  cards        ${out.cards}, last one ${out.lastCardDate} — today is deliberately empty`,
      `  streak       current ${out.stats.after.currentStreak}, longest ${out.stats.after.longestStreak}`,
      `  badges       ${out.stats.badgesInserted.length} awarded`,
      `  shares       /s/${out.slugs.word}  /s/${out.slugs.card}  /s/${out.slugs.journal}`,
      '',
      '  Set the cookie and browse:',
      `    document.cookie = 'authjs.session-token=${SESSION_TOKEN}; path=/'`,
      '',
    ].join('\n'),
  )
  console.log(JSON.stringify({ ...out, sessionToken: SESSION_TOKEN }, null, 0))
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
