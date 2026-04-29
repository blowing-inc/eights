-- Add bio_history to arenas table (issue #15)
-- Mirrors the combatants bio_history pattern: each edit appends a snapshot
-- { name, bio, updatedAt, updatedBy } to the array (capped at 20 entries).
-- Visible as a collapsible reverse-chronological log on the arena detail page.

alter table arenas
  add column if not exists bio_history jsonb not null default '[]';
