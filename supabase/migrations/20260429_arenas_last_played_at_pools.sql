-- Add last_played_at and pools to arenas table (issue #73)
--
-- last_played_at: updated when an arena snapshot is written to a round.
--   Used for "most recently played" default sort in The Archive Arenas tab.
--   Null means the arena has been created but not yet used in a game.
--   The delivery-mode assignment code (issue #14) is responsible for setting this.
--
-- pools: curated pool membership, managed by Super Hosts (issue #74).
--   Values: 'standard' | 'wacky' | 'league'
--   'weighted-liked' is computed at read time from likes/dislikes — not stored here.
--   An arena can belong to multiple curated pools simultaneously.

alter table arenas
  add column if not exists last_played_at timestamptz null,
  add column if not exists pools text[] not null default '{}';

create index if not exists arenas_last_played_at_idx
  on arenas (last_played_at desc nulls last)
  where status = 'published';
