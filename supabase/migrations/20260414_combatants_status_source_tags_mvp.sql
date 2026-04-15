-- Migration: combatants table v2 (issue #3)
--
-- Changes:
--   source text      — 'game' | 'created', default 'game' for all existing rows
--   status text      — replaces boolean published column ('stashed' | 'published')
--   tags text[]      — free-form labels, default empty array
--   mvp_record jsonb — array of { gameCode, voteShare, coMvp }, default empty array
--
-- Run order matters: add status nullable → populate → set not null → drop published.
-- Safe to re-run (all statements are idempotent).

-- 1. source — 'game' for all existing rows
alter table combatants
  add column if not exists source text not null default 'game';

-- 2. status — add nullable first so we can populate before enforcing not null
alter table combatants
  add column if not exists status text;

-- 3. Migrate: true → 'published', false → 'stashed'
--    Only touches rows where status is still null (idempotency safe).
update combatants
  set status = case when published = true then 'published' else 'stashed' end
  where status is null;

-- 4. Lock down the column
alter table combatants
  alter column status set not null,
  alter column status set default 'stashed';

-- 5. Drop the old boolean column
alter table combatants
  drop column if exists published;

-- 6. tags — free-form labels
alter table combatants
  add column if not exists tags text[] not null default '{}';

-- 7. mvp_record — permanent MVP vote log
alter table combatants
  add column if not exists mvp_record jsonb not null default '[]';

-- 8. Swap the index: published boolean → status text
drop index if exists combatants_published_idx;
create index if not exists combatants_status_idx
  on combatants (status)
  where status = 'published';
