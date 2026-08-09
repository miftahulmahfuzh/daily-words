import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        /**
         * Badge art, cached for a year and never revalidated.
         *
         * This header is safe here for exactly one reason, and it is worth
         * spelling out because it was NOT safe in the project this skill was
         * copied from. There, art was served under slug-based filenames with
         * `immutable` on top, so regenerating a picture changed the bytes behind
         * a URL that every cache had been told would never change — and every
         * existing install kept the old art for up to a year.
         *
         * Every file under /badges/ carries the first 8 hex of its master's
         * SHA-256 in its name (`first_card.9d27a980.webp`), written by
         * `tools/make_badge_assets.py`. Regenerating a badge changes the
         * master's bytes, which changes the hash, which changes the filename, so
         * the old URL is simply never requested again and every cache misses
         * correctly. `npm run badges:check` asserts that the hash in each
         * filename is still the SHA-256 of `assets/badges/<key>.png`, which is
         * what keeps that sentence true rather than merely intended.
         *
         * Do not extend this source to any path whose filenames are not
         * content-hashed.
         */
        source: "/badges/:path*",
        headers: [
          {
            key: "cache-control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        /**
         * F22's level art, cached for a year and never revalidated, and safe
         * for exactly the reason the block above gives: every file under
         * /levels/ carries the first 8 hex of its master's SHA-256, written by
         * the same `tools/make_badge_assets.py`. `npm run badges:check` §9
         * asserts that the hash in each filename is still the SHA-256 of
         * `assets/levels/<key>.png`, which is what keeps the sentence true
         * rather than merely intended.
         *
         * A second source rather than a widened pattern: the two decks are
         * separate directories on purpose (F22 D6), because the orphan sweeps
         * in `make_badge_assets.py` and in `badges:check` each compute
         * "expected filenames" from one key set.
         *
         * Do not extend either source to any path whose filenames are not
         * content-hashed.
         */
        source: "/levels/:path*",
        headers: [
          {
            key: "cache-control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
