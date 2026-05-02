-- Migration: leagues table (issue #32)
--
-- leagues
--   Top-tier persistent container running multiple seasons.
--   A league holds a fixed player roster and accumulates standings across all
--   its seasons. Each new season starts fresh — no heritage carryover.
--
--   id                            — app-generated text id
--   name                          — league display name
--   owner_id                      — league creator's playerId
--   owner_name                    — denormalized display name; snapshot at creation
--   status                        — 'active' | 'ended' | 'cancelled'
--                                    'ended' covers both natural completion
--                                    (seasons_played = season_count) and early close;
--                                    callers distinguish via seasons_played vs season_count
--   season_count                  — declared target number of seasons
--   seasons_played                — running count; incremented when each season closes
--   efficient_trapper_min_threshold — minimum traps-set required before a player
--                                    qualifies for the efficient trapper award.
--                                    Stored on the league so each league can tune
--                                    the threshold independently.
--   created_at / updated_at
--
-- seasons.league_id (nullable text) references leagues.id — no FK constraint,
-- consistent with text-id conventions throughout this schema.
--
-- New table only; no changes to existing rows.
-- Safe to re-run (all statements are idempotent).

-- ─── leagues ─────────────────────────────────────────────────────────────────

create table if not exists leagues (
  id                              text        primary key,
  name                            text        not null,
  owner_id                        text        not null,
  owner_name                      text        not null,
  status                          text        not null default 'active'
                                    check (status in ('active', 'ended', 'cancelled')),
  season_count                    int         not null,
  seasons_played                  int         not null default 0,
  efficient_trapper_min_threshold int         not null default 3,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

-- Fast lookup of all leagues for a creator (management view, standings)
create index if not exists leagues_owner_idx
  on leagues (owner_id);

-- Fast lookup of active leagues (league resume, season creation flow)
create index if not exists leagues_status_idx
  on leagues (status)
  where status = 'active';

alter table leagues enable row level security;

create policy "public read leagues"
  on leagues for select using (true);

create policy "public insert leagues"
  on leagues for insert with check (true);

create policy "public update leagues"
  on leagues for update using (true);

grant select, insert, update on table leagues to anon, authenticated;
