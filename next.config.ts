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
      {
        /**
         * F30's service worker, and the exact inverse of the two blocks above.
         *
         * Those two may say `immutable` for a year for one reason only: every
         * filename under /badges/ and /levels/ carries the first 8 hex of its
         * master's SHA-256, so new bytes mean a new name and every cache misses
         * correctly. `/sw.js` carries no hash and cannot — the path is what the
         * browser *registers*, and a registration is a standing promise to keep
         * re-fetching that one URL. A content-hashed worker filename would mean
         * a new registration on every deploy, which is the opposite of what a
         * worker is for.
         *
         * So it gets the opposite rule. A cached worker is a worker that has
         * stopped updating, and it fails with no symptom whatsoever: the phone
         * keeps running last month's `push` handler, every deploy succeeds,
         * every check passes, and the only evidence is a notification that
         * still reads the way it used to.
         *
         * `no-cache`, not `no-store`: the browser may keep the bytes, it just
         * may not use them without asking. That is what makes the update check
         * a 304 rather than a download.
         *
         * This is the third source and it is deliberately its own block rather
         * than a widened pattern, for the reason F22 gives above: a shared
         * source makes a rule correct only against the union of what it covers.
         */
        source: "/sw.js",
        headers: [
          {
            key: "cache-control",
            value: "no-cache",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
