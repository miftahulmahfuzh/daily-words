/**
 * GENERATED FILE — do not edit by hand.
 *
 *   python3 tools/make_badge_assets.py
 *
 * Source art is `assets/badges/<key>.png`; these are its derivatives.
 * Every entry here is generated against style v1.
 *
 * This is a TOTAL `Record<BadgeKey, BadgeArt>` on purpose (F12 D9). A badge
 * key added to BADGE_CATALOG with no art fails `npm run typecheck`
 * immediately, in the same session, before anything ships — which is a far
 * stronger guarantee than a check script nobody runs, and it costs one
 * keyword. The fix for that failure is to generate the art, not to reach
 * for `Partial<>`.
 *
 * Filenames carry the first 8 hex of the master's SHA-256. Regenerating an
 * image changes its bytes, its hash and its filename, so every cache misses
 * correctly and `next.config.ts` may serve /badges/* as `immutable`.
 *
 * Plain data. No `import "server-only"` — F13's badge modal is a client
 * component and imports this — and it holds no secret.
 */
import type { BadgeKey } from "./badges";

export type BadgeArt = {
  /** 768×768 WebP for the badge modal. */
  src: string;
  /** 192×192 WebP for the shelf mark. */
  small: string;
  /** SHA-256 of `assets/badges/<key>.png`, the approved master. */
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
export const BADGE_ART_SIZE = 768;
export const BADGE_ART_SMALL_SIZE = 192;

export const BADGE_ART: Record<BadgeKey, BadgeArt> = {
  first_card: {
    src: "/badges/first_card.dd1b0291.webp",
    small: "/badges/first_card.dd1b0291.sm.webp",
    sha256: "dd1b02911bb3d91538f344c2ef6dcbf001f112e3882479957ee77aa799c1bcb7",
    plate: "#ede9d8",
    styleVersion: "v1",
  },
  full_week: {
    src: "/badges/full_week.a5d4a9ad.webp",
    small: "/badges/full_week.a5d4a9ad.sm.webp",
    sha256: "a5d4a9adfc92f044ec76cb83741dc147470e78f94cc9e1a6c1b8d11bee9cdd02",
    plate: "#f1ede1",
    styleVersion: "v1",
  },
  sunday: {
    src: "/badges/sunday.54e694d5.webp",
    small: "/badges/sunday.54e694d5.sm.webp",
    sha256: "54e694d5e784c4a86fdda89ed86869821324f40d7ffd37e92a6e5ff117e3befc",
    plate: "#ece8dd",
    styleVersion: "v1",
  },
  midnight_oil: {
    src: "/badges/midnight_oil.1b42236c.webp",
    small: "/badges/midnight_oil.1b42236c.sm.webp",
    sha256: "1b42236c97f252755002fbbcd39c4b505d35146c9f92585770cd5ecd4bcb545f",
    plate: "#ece8db",
    styleVersion: "v1",
  },
  new_year: {
    src: "/badges/new_year.6a384f75.webp",
    small: "/badges/new_year.6a384f75.sm.webp",
    sha256: "6a384f75d30e188cdcd67571560558c12ce3c520552a3895e8c18432c893fffc",
    plate: "#f0ebdf",
    styleVersion: "v1",
  },
  womens_day: {
    src: "/badges/womens_day.45b30120.webp",
    small: "/badges/womens_day.45b30120.sm.webp",
    sha256: "45b301201ec2ee646635885b49d28c1b4925d97b91b1e78a9d0b1d5f46fb923b",
    plate: "#efebe1",
    styleVersion: "v1",
  },
  world_book_day: {
    src: "/badges/world_book_day.fad59f74.webp",
    small: "/badges/world_book_day.fad59f74.sm.webp",
    sha256: "fad59f7442c338ea0ba3cfd726a5892263eec857422b0901d7fb3bec9ab545f3",
    plate: "#efeadd",
    styleVersion: "v1",
  },
  fathers_day: {
    src: "/badges/fathers_day.8b1c1651.webp",
    small: "/badges/fathers_day.8b1c1651.sm.webp",
    sha256: "8b1c1651d9debdcbaedb9348b930bac4468d1886f179a3a38bc55bf80b2708b1",
    plate: "#edeadc",
    styleVersion: "v1",
  },
  indonesia_independence: {
    src: "/badges/indonesia_independence.37bf05fc.webp",
    small: "/badges/indonesia_independence.37bf05fc.sm.webp",
    sha256: "37bf05fc55cb612c0f240ccc56291dce2a5452e74c1129b97b7b78c220c7c091",
    plate: "#ede9da",
    styleVersion: "v1",
  },
  ibu: {
    src: "/badges/ibu.6bff7bcb.webp",
    small: "/badges/ibu.6bff7bcb.sm.webp",
    sha256: "6bff7bcbe595648e21d0530fd45c13ac8302743580ac8b9c322bf75f2bf22082",
    plate: "#eae6d7",
    styleVersion: "v1",
  },
  christmas: {
    src: "/badges/christmas.05f5f397.webp",
    small: "/badges/christmas.05f5f397.sm.webp",
    sha256: "05f5f3979d3c9c4637b60b8c728c3064d6add275df629e89acb8109855196cff",
    plate: "#ede8dc",
    styleVersion: "v1",
  },
  year_end: {
    src: "/badges/year_end.e8becf15.webp",
    small: "/badges/year_end.e8becf15.sm.webp",
    sha256: "e8becf15831012ae7fc6bd36a8fca90db49d227e4754100de292be4f83e35e1e",
    plate: "#eeebdd",
    styleVersion: "v1",
  },
  leap_day: {
    src: "/badges/leap_day.34b45475.webp",
    small: "/badges/leap_day.34b45475.sm.webp",
    sha256: "34b454753a91efeb40ba82f49351229d006e828808499336fe463cfa2bc29645",
    plate: "#eeeade",
    styleVersion: "v1",
  },
  tolkien: {
    src: "/badges/tolkien.6f5d9027.webp",
    small: "/badges/tolkien.6f5d9027.sm.webp",
    sha256: "6f5d9027ffedc48d07f1cae9b38de49a5f68efad23d6359f38af3975665f920a",
    plate: "#ebe7da",
    styleVersion: "v1",
  },
  three_in_a_week: {
    src: "/badges/three_in_a_week.9803a5ae.webp",
    small: "/badges/three_in_a_week.9803a5ae.sm.webp",
    sha256: "9803a5aed3fdac6c959207b44a133a3f0a792feadd83747675570012b564336d",
    plate: "#f0ebdb",
    styleVersion: "v1",
  },
  thirty_day_streak: {
    src: "/badges/thirty_day_streak.c9470730.webp",
    small: "/badges/thirty_day_streak.c9470730.sm.webp",
    sha256: "c94707301ad370d4e3c872a44986bc66124ad233d1e5ad9d16e598d3fb3a4bda",
    plate: "#f2ead3",
    styleVersion: "v1",
  },
  dumbledore: {
    src: "/badges/dumbledore.f815e53a.webp",
    small: "/badges/dumbledore.f815e53a.sm.webp",
    sha256: "f815e53a2514eede831c038a90e2234a4a776fe584e2c33434d228b0433d4eb5",
    plate: "#f2e7cd",
    styleVersion: "v1",
  },
  dobby: {
    src: "/badges/dobby.db5038a0.webp",
    small: "/badges/dobby.db5038a0.sm.webp",
    sha256: "db5038a0e36d20d048e05a4a01af9f3e1c9044ab6c7026353b4bb09d13f7f976",
    plate: "#e9e4d2",
    styleVersion: "v1",
  },
  five_shares: {
    src: "/badges/five_shares.dcc84edc.webp",
    small: "/badges/five_shares.dcc84edc.sm.webp",
    sha256: "dcc84edc280a07fa66283edba4ad3d41c184edf31d6ce3e05742055911820d6d",
    plate: "#ede8d5",
    styleVersion: "v1",
  },
  ten_journal_lines: {
    src: "/badges/ten_journal_lines.f54fe8c3.webp",
    small: "/badges/ten_journal_lines.f54fe8c3.sm.webp",
    sha256: "f54fe8c3ce52d5f8632e2eb52c2fee42b7070c9130cc526bef46d6d6c5f2a574",
    plate: "#eae5d4",
    styleVersion: "v1",
  },
};
