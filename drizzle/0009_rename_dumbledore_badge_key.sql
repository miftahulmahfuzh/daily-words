-- Badge key `dumbledore` → `voldy`, 2026-08-28. Authored via
-- `drizzle-kit generate --custom`: `badges_awarded.badge_key` is a plain `text`
-- column with a `$type<BadgeKey>()` union in front of it, so renaming a key emits
-- NO DDL and drizzle's differ has nothing to say about it. The whole change is
-- data, and without this file the rename is silent data loss.
--
-- What it is worth: an award row under a key that is no longer in
-- `BADGE_CATALOG` is inert — `badgeTitle` returns null, `getProfileStats` drops
-- it from the shelf with a warning, and `stats:recompute --prune` deletes it. So
-- skipping this migration does not throw anywhere; it quietly takes a badge off
-- somebody's shelf. That is the failure mode this file exists to prevent, and it
-- is why the default in `badges.ts` is still to RETITLE rather than rekey.
--
-- Idempotent, and it has to be: `badges_awarded_uniq` is UNIQUE on
-- (user_id, badge_key, awarded_for_date), so a second pass over an
-- already-renamed table would collide if it were written as a bare UPDATE and
-- any `voldy` row had appeared in between. The NOT EXISTS guard makes a
-- collision a no-op instead of an error, and leaves the old row where it is
-- rather than deleting it — an inert duplicate is recoverable by hand, a deleted
-- award is not. It matched 0 rows on the production database on 2026-08-28,
-- which is the only reason this could ship as one statement without a backfill
-- plan: nobody had made a card on a 30 June yet.
UPDATE badges_awarded AS b
SET badge_key = 'voldy'
WHERE b.badge_key = 'dumbledore'
  AND NOT EXISTS (
    SELECT 1
    FROM badges_awarded AS existing
    WHERE existing.user_id = b.user_id
      AND existing.badge_key = 'voldy'
      AND existing.awarded_for_date = b.awarded_for_date
  );
