-- Migration: seasons table (issue #23)
--
-- seasons
--   Container for a structured run of series with a fixed player roster,
--   cumulative standings, and end-of-season awards.
--   A season can be standalone (league_id null) or nested inside a league.
--
--   id                     — app-generated text id
--   name                   — season display name
--   league_id              — nullable; links to leagues.id when nested
--   owner_id               — season creator's playerId
--   owner_name             — denormalized display name; snapshot at creation
--   status                 — 'active' | 'ended' | 'cancelled'
--                            'ended' covers both natural completion
--                            (series_played = series_count) and early close;
--                            callers distinguish via series_played vs series_count
--   series_count           — declared target number of series
--   series_played          — running count; incremented when each series closes
--   latest_evolutions_only — when true, only the tip form of an evolved
--                            combatant is draftable within this season's
--                            history. Stored now; enforcement deferred.
--   created_at / updated_at
--
-- New table only; no changes to existing rows.
-- Safe to re-run (all statements are idempotent).

-- ─── seasons ─────────────────────────────────────────────────────────────────

create table if not exists seasons (
  id                     text        primary key,
  name                   text        not null,
  league_id              text,
  owner_id               text        not null,
  owner_name             text        not null,
  status                 text        not null default 'active'
                           check (status in ('active', 'ended', 'cancelled')),
  series_count           int         not null,
  series_played          int         not null default 0,
  latest_evolutions_only bool        not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Fast lookup of all seasons for a creator (standings, management view)
create index if not exists seasons_owner_idx
  on seasons (owner_id);

-- Fast lookup of all seasons for a league (league standings page)
create index if not exists seasons_league_idx
  on seasons (league_id)
  where league_id is not null;

-- Fast lookup of active seasons (lobby creation, join flows)
create index if not exists seasons_status_idx
  on seasons (status)
  where status = 'active';

alter table seasons enable row level security;

create policy "public read seasons"
  on seasons for select using (true);

create policy "public insert seasons"
  on seasons for insert with check (true);

create policy "public update seasons"
  on seasons for update using (true);

grant select, insert, update on table seasons to anon, authenticated;
