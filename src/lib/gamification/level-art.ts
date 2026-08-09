/**
 * GENERATED FILE — do not edit by hand.
 *
 *   python3 tools/make_badge_assets.py
 *
 * Source art is `assets/levels/<key>.png`; these are its derivatives.
 * Every entry here is generated against style v1.
 *
 * This is a TOTAL `Record<LevelArtKey, LevelArt>` on purpose (F12 D9, F22
 * D1). A band added to STREAK_LEVELS or COLLECTOR_LEVELS with no art fails
 * `npm run typecheck` immediately, in the same session, before anything
 * ships — which is a far stronger guarantee than a check script nobody
 * runs, and it costs one keyword. The fix for that failure is to generate
 * the art, not to reach for `Partial<>`.
 *
 * Filenames carry the first 8 hex of the master's SHA-256. Regenerating an
 * image changes its bytes, its hash and its filename, so every cache misses
 * correctly and `next.config.ts` may serve /levels/* as `immutable`.
 *
 * Plain data. No `import "server-only"` — the level dialog is a client
 * component and imports this — and it holds no secret. A level is derived
 * from a number and awarded nothing, so no row anywhere names these keys
 * (F22 D1); they exist only here, in `levels.ts` and in the filenames.
 */
import type { LevelArtKey } from "./levels";

export type LevelArt = {
  /** 768×768 WebP for the level dialog’s hero band. */
  src: string;
  /** 192×192 WebP for the 56px mark on /profile. */
  small: string;
  /** SHA-256 of `assets/levels/<key>.png`, the approved master. */
  sha256: string;
  /**
   * The art's own paper, `#rrggbb`, as the mean of the master's outer 5%
   * frame. F21's hero paints its band with this so the square art can sit
   * `object-fit: contain` on a wider region with no seam and no crop —
   * the deck cannot be cropped (F21 §1.2: ibu's tassel reaches 95.7% of
   * the image height). Sampled, never chosen: regenerating an image can
   * shift its paper, and `npm run badges:check` recomputes this from the
   * master exactly as it recomputes `sha256`.
   */
  plate: string;
  /** The contract-file version this image was generated against. */
  styleVersion: string;
};

/** Intrinsic pixel sizes, so a consumer never has to restate them. */
export const LEVEL_ART_SIZE = 768;
export const LEVEL_ART_SMALL_SIZE = 192;

export const LEVEL_ART: Record<LevelArtKey, LevelArt> = {
  streak_blank_card: {
    src: "/levels/streak_blank_card.5618e2f4.webp",
    small: "/levels/streak_blank_card.5618e2f4.sm.webp",
    sha256: "5618e2f460828788466724b17e2a898a42e5c25af21ff1991e64e76e08ce9d93",
    plate: "#f3eacb",
    styleVersion: "v1",
  },
  streak_pocket_fuzz: {
    src: "/levels/streak_pocket_fuzz.5d11fd5a.webp",
    small: "/levels/streak_pocket_fuzz.5d11fd5a.sm.webp",
    sha256: "5d11fd5a45e7117172d354bb0020cb36a7ff8d93b5e92094304f19862acac6a8",
    plate: "#f2ebce",
    styleVersion: "v1",
  },
  streak_small_scribe: {
    src: "/levels/streak_small_scribe.e5b9d36b.webp",
    small: "/levels/streak_small_scribe.e5b9d36b.sm.webp",
    sha256: "e5b9d36b7a72548225d13265a81862096f304c67a2ac51babfc184ef3ff804ba",
    plate: "#f1e9cb",
    styleVersion: "v1",
  },
  streak_margin_scribbler: {
    src: "/levels/streak_margin_scribbler.0dc218cb.webp",
    small: "/levels/streak_margin_scribbler.0dc218cb.sm.webp",
    sha256: "0dc218cb216a12debdca9dd9f452b07178d145b4c2708a056d8ee5a43da06dc3",
    plate: "#f2ebce",
    styleVersion: "v1",
  },
  streak_keeper_of_the_pocket: {
    src: "/levels/streak_keeper_of_the_pocket.4a802c63.webp",
    small: "/levels/streak_keeper_of_the_pocket.4a802c63.sm.webp",
    sha256: "4a802c63ea09201cc2a29b66c3095d9cdb9dc3551804b38c7c0f16a5cc48375f",
    plate: "#f2ebce",
    styleVersion: "v1",
  },
  streak_uncles_apprentice: {
    src: "/levels/streak_uncles_apprentice.c96a5a88.webp",
    small: "/levels/streak_uncles_apprentice.c96a5a88.sm.webp",
    sha256: "c96a5a880167f4f22d709871695c8fc2c628bc509fdd841db05b4a36b79ac3ca",
    plate: "#ede6ca",
    styleVersion: "v1",
  },
  streak_lexicon_smuggler: {
    src: "/levels/streak_lexicon_smuggler.b4913364.webp",
    small: "/levels/streak_lexicon_smuggler.b4913364.sm.webp",
    sha256: "b49133648f5af9cf208e131e14040ee335f8a4f5654e6d4969628f0469ef7ff4",
    plate: "#f3eccd",
    styleVersion: "v1",
  },
  streak_walking_errata: {
    src: "/levels/streak_walking_errata.831de38f.webp",
    small: "/levels/streak_walking_errata.831de38f.sm.webp",
    sha256: "831de38fc44bb7e0969b88c5f90c7309ebf0283d6f7c6e45ff668f4c83b42daa",
    plate: "#f2eccc",
    styleVersion: "v1",
  },
  streak_dickens_would_nod: {
    src: "/levels/streak_dickens_would_nod.cbca5af2.webp",
    small: "/levels/streak_dickens_would_nod.cbca5af2.sm.webp",
    sha256: "cbca5af2e9afcfbf54f1937622b9c5e90e1f000b6276dbb392d14c7d3e6163c9",
    plate: "#f3eccc",
    styleVersion: "v1",
  },
  collector_word_picker: {
    src: "/levels/collector_word_picker.a7b84a47.webp",
    small: "/levels/collector_word_picker.a7b84a47.sm.webp",
    sha256: "a7b84a470cfdd0b7d004b690e142cc20bbc6a3228e9b88904222cea4379229cb",
    plate: "#f0e9cd",
    styleVersion: "v1",
  },
  collector_jam_jar_of_words: {
    src: "/levels/collector_jam_jar_of_words.52949dc3.webp",
    small: "/levels/collector_jam_jar_of_words.52949dc3.sm.webp",
    sha256: "52949dc3a35bc4cb3312cc2e60fa5ecb64947931fe5aea7e3aacff1bb320f221",
    plate: "#f5efd3",
    styleVersion: "v1",
  },
  collector_shelf_of_odds: {
    src: "/levels/collector_shelf_of_odds.b25bbf9f.webp",
    small: "/levels/collector_shelf_of_odds.b25bbf9f.sm.webp",
    sha256: "b25bbf9f8df5b72692f1e25f50ba788fdc722db7b92b6636b5d71c828b314f53",
    plate: "#f1eace",
    styleVersion: "v1",
  },
  collector_bag_man_of_nouns: {
    src: "/levels/collector_bag_man_of_nouns.6b569c4e.webp",
    small: "/levels/collector_bag_man_of_nouns.6b569c4e.sm.webp",
    sha256: "6b569c4e6a8a1713ebac3f40131e25010a62e47de90c9a8a6ef20f533200b607",
    plate: "#f0e9cb",
    styleVersion: "v1",
  },
  collector_private_collector: {
    src: "/levels/collector_private_collector.6509daab.webp",
    small: "/levels/collector_private_collector.6509daab.sm.webp",
    sha256: "6509daab05e7b496d2285460f51a5a601b019633544c099fa86066af5c7d35db",
    plate: "#f0e8c7",
    styleVersion: "v1",
  },
  collector_hoarder_of_rare_speech: {
    src: "/levels/collector_hoarder_of_rare_speech.f129fb43.webp",
    small: "/levels/collector_hoarder_of_rare_speech.f129fb43.sm.webp",
    sha256: "f129fb4311852e643c3a99d06b45f21787f906cde1403a14d2916e9ebf28e6ae",
    plate: "#f3eccc",
    styleVersion: "v1",
  },
  collector_curator_of_forgotten_tongues: {
    src: "/levels/collector_curator_of_forgotten_tongues.0c412fa8.webp",
    small: "/levels/collector_curator_of_forgotten_tongues.0c412fa8.sm.webp",
    sha256: "0c412fa800a1000159d820492cd19fdbf1fed38e3be1ba23facc31a10042818e",
    plate: "#f3eccc",
    styleVersion: "v1",
  },
  collector_barnabys_ghost: {
    src: "/levels/collector_barnabys_ghost.29ab17d1.webp",
    small: "/levels/collector_barnabys_ghost.29ab17d1.sm.webp",
    sha256: "29ab17d18474c85ead69c39db182611245c98981510bdd522824a16f6653b7e0",
    plate: "#f2eacb",
    styleVersion: "v1",
  },
};
