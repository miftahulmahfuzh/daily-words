-- F15 §3.1. Authored via `drizzle-kit generate --custom`, not by hand-editing an
-- auto-diffed file: extensions are not in drizzle's snapshot, so `db:generate`
-- would emit `vector(1536)` against a database that has no such type and
-- `db:migrate` would die with `type "vector" does not exist`.
--
-- This must be journalled BEFORE the migration that creates the table. It is
-- invisible to drizzle's differ, which is what makes it safe (nothing will ever
-- try to reverse it) and also why `db:push` — which skips the journal entirely —
-- must never be run on this schema.
CREATE EXTENSION IF NOT EXISTS vector;
