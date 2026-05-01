-- Migration: add players column to seasons table (issue #25)
--
-- The initial seasons migration omitted the player roster field declared in
-- the issue spec. This adds it as a JSONB array of { name: string } objects.
--
-- Safe to re-run (idempotent).

alter table seasons
  add column if not exists players jsonb not null default '[]'::jsonb;
