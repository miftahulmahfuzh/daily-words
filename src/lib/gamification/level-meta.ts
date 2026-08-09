import type { LevelArtKey } from "./levels";

/**
 * What each level title refers to. One sentence, the prose the level dialog
 * draws beneath the illustration.
 *
 * A peer of `levels.ts` and deliberately not part of it, for the reason F13 D1
 * gives about `badge-meta.ts`: `levels.ts` is imported by `on-card-created.ts`
 * on the write path and by `profile-stats.ts` on every profile read, and ~2 kB
 * of explanation that only one panel renders has no business travelling with
 * the resolver.
 *
 * Browser-safe by construction: no `import "server-only"`, no zod, no React, no
 * clock. The `LevelArtKey` import is **type-only** and adds no runtime edge.
 *
 * **No art path here.** `LEVEL_ART` in the generated `level-art.ts` owns that
 * and carries content-hashed filenames; a hand-written path would drift the
 * first time a tier was regenerated. **No `condition` here either** — that is
 * computed from the band by `levelCondition()`, so no threshold is typed twice.
 *
 * Register, enforced by `npm run stats:check` rather than remembered: no second
 * person, no exclamation, no flattery, no loss aversion, no deadline,
 * typographic apostrophes only, ≤ 320 characters.
 *
 * A **total** `Record`, deliberately, not a `Partial` — a band added to either
 * table with no gloss is a `npm run typecheck` error in the same session, which
 * is the same guard `BADGE_META` and `BADGE_ART` already carry.
 */
export const LEVEL_GLOSS: Record<LevelArtKey, string> = {
  streak_blank_card:
    "Every card starts as this one. The title is the plain truth about a pocket with nothing in it yet, and it is not an insult.",
  streak_pocket_fuzz:
    "What is actually in a coat pocket after three days of carrying something: not much, and more than there was.",
  streak_small_scribe:
    "A week was the smallest unit a ration office recognised. A scribe is anybody who writes things down for other people to use later.",
  streak_margin_scribbler:
    "The margin is where a reader argues with a book. A fortnight is roughly how long it takes to stop being polite about it.",
  streak_keeper_of_the_pocket:
    "A month. The keys are the point — a keeper is somebody trusted with the small things that open other things.",
  streak_uncles_apprentice:
    "The uncle in question is the one with the trick: six words in a pocket at the moment somebody asked. Two months is about an apprenticeship in it.",
  streak_lexicon_smuggler:
    "A hundred days of moving words across a border nobody is watching. The false bottom is empty because the goods are already through.",
  streak_walking_errata:
    "An errata slip is the printer admitting the book went out wrong. Two hundred days of corrections is a person who has become one.",
  streak_dickens_would_nod:
    "A year. Dickens wrote to a deadline for most of his working life and would have recognised the arithmetic, whatever he made of the vocabulary.",
  collector_word_picker:
    "One word, picked up rather than looked up. That is the whole qualification.",
  collector_jam_jar_of_words:
    "Ten. A jam jar is what a collection lives in before anybody admits it is a collection.",
  collector_shelf_of_odds:
    "Twenty-five, and no two alike. A shelf of odds is what a drawer of odds becomes when it stops closing.",
  collector_bag_man_of_nouns:
    "Fifty. The bag man carried the samples; the bag was the job, and the job was knowing what was in it.",
  collector_private_collector:
    "A hundred, kept in compartments. Private means the collection is nobody’s business, not that it is worth money.",
  collector_hoarder_of_rare_speech:
    "Two hundred and fifty. A hoard is a collection whose owner has stopped explaining it.",
  collector_curator_of_forgotten_tongues:
    "Five hundred. A curator does not own the case. The job is keeping what is in it findable after the person who filled it has gone.",
  collector_barnabys_ghost:
    "A thousand. Barnaby Rudge kept a raven called Grip with a large vocabulary and no idea what any of it meant; Poe read the book and got a poem out of the bird.",
};
