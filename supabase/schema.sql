-- Run this in your Supabase project → SQL Editor
-- Full schema for a fresh deployment. Safe to re-run (all statements are idempotent).
--
-- Migration note for existing deployments: if upgrading from a version without draws,
-- run the following first to add the column and re-create the RPC:
--   alter table combatants add column if not exists draws int not null default 0;
-- Then re-run the create or replace function block below.

-- ─── Rooms ───────────────────────────────────────────────────────────────────
-- Each room is a single JSON blob. All game state lives in rooms.data.
-- Notable top-level fields in data (not enforced by DB — documented here for reference):
--
--   id, code, host, phase, players[], combatants{}, rounds[], currentRound
--   createdAt, devMode, settings{ rosterSize, biosRequired, anonymousCombatants,
--                                  blindVoting, allowSpectators }
--   prevRoomId, nextRoomId   — heritage chain (linked list, oldest↔newest)
--   seriesId                 — id of the first room in this heritage chain
--   seriesIndex              — 1-based position within the series
--   prevWinners{ [ownerId]: [{id, name, bio}] }  — carried into next draft
--
--   round: { id, number, combatants[], winner, picks{}, playerReactions{},
--            chat[], createdAt,
--            evolution: { fromId, fromName, toId, toName, toBio,
--                         ownerId, ownerName, authorId } | null }

create table if not exists rooms (
  id          text primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

create index if not exists rooms_updated_at_idx on rooms (updated_at desc);

alter table rooms enable row level security;

create policy "public read"   on rooms for select using (true);
create policy "public insert" on rooms for insert with check (true);
create policy "public update" on rooms for update using (true);

grant usage  on schema public to anon, authenticated;
grant select, insert, update on table rooms to anon, authenticated;

-- ─── Users ───────────────────────────────────────────────────────────────────
-- PIN stored in plain text — low-stakes party game, no auth library.
-- To force a PIN reset: set needs_reset = true. Next login prompts a new PIN.

create table if not exists users (
  id                      text        primary key,
  username                text        not null,
  pin                     text        not null,
  needs_reset             boolean     not null default false,
  favorite_combatant_id   text        null,
  favorite_combatant_name text        null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Case-insensitive unique usernames
create unique index if not exists users_username_lower_idx on users (lower(username));

alter table users enable row level security;

create policy "public read users"   on users for select using (true);
create policy "public insert users" on users for insert with check (true);
create policy "public update users" on users for update using (true);

grant select, insert, update on table users to anon, authenticated;

-- ─── Combatants ──────────────────────────────────────────────────────────────
-- Global bestiary. One row per combatant form (base + evolved variants).
-- published = false while the game is in progress; set to true on room end.
--
-- lineage is null for generation-0 combatants.
-- For variants (evolved forms):
--   lineage: {
--     rootId:     id of the original gen-0 combatant
--     parentId:   id of the immediate predecessor form
--     generation: integer depth (1 = first variant, 2 = second, …)
--     bornFrom: {
--       opponentName: name of the combatant that was defeated to trigger evolution
--       opponentId:   id of that opponent
--       roundNumber:  which round the evolution occurred in
--       gameCode:     room.code of the game where it happened
--       parentName:   name of the combatant before evolving
--     }
--   }
--
-- round.evolution (stored in rooms.data JSON — no separate table):
--   { fromId, fromName, toId, toName, toBio, ownerId, ownerName, authorId }

create table if not exists combatants (
  id               text        primary key,
  name             text        not null,
  bio              text        not null default '',
  bio_history      jsonb       not null default '[]',  -- [{name, bio, updatedAt, updatedBy}]
  owner_id         text        not null default '',
  owner_name       text        not null default '',
  wins             int         not null default 0,
  losses           int         not null default 0,
  draws            int         not null default 0,
  reactions_heart  int         not null default 0,
  reactions_angry  int         not null default 0,
  reactions_cry    int         not null default 0,
  published        boolean     not null default false,
  lineage          jsonb       null,                   -- null for gen-0; see structure above
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists combatants_wins_idx        on combatants (wins desc);
create index if not exists combatants_owner_idx       on combatants (owner_id);
create index if not exists combatants_name_idx        on combatants (name);
create index if not exists combatants_published_idx   on combatants (published) where published = true;

-- Fast lookup: all variants whose root is X → used by getLineageTree
create index if not exists combatants_lineage_root_idx
  on combatants ((lineage->>'rootId'))
  where lineage is not null;

-- Note: there is intentionally NO unique constraint on parentId.
-- A combatant may spawn multiple variants across different games (e.g., MJ
-- evolves into "MJ on a bike" in one game and "MJ scuffed knee" in another).
-- The only enforced constraint is novelty — evolution names must not match any
-- existing published combatant. That constraint is enforced at the app level
-- (checkCombatantNameExists in supabase.js) rather than the DB level, because
-- the uniqueness check is against the full name string across the combatants
-- table, not a structural constraint on the lineage graph.

alter table combatants enable row level security;

create policy "public read combatants"   on combatants for select using (true);
create policy "public insert combatants" on combatants for insert with check (true);
create policy "public update combatants" on combatants for update using (true);

grant select, insert, update on table combatants to anon, authenticated;

-- Atomic stat increment used by confirmWinner, declareDraw, and undoLastRound.
-- Pass negative values to decrement (undo).
create or replace function increment_combatant_stats(
  p_id     text,
  p_wins   int,
  p_losses int,
  p_draws  int,
  p_heart  int,
  p_angry  int,
  p_cry    int
) returns void language sql as $$
  update combatants set
    wins            = greatest(0, wins            + p_wins),
    losses          = greatest(0, losses          + p_losses),
    draws           = greatest(0, draws           + p_draws),
    reactions_heart = greatest(0, reactions_heart + p_heart),
    reactions_angry = greatest(0, reactions_angry + p_angry),
    reactions_cry   = greatest(0, reactions_cry   + p_cry),
    updated_at      = now()
  where id = p_id;
$$;

grant execute on function increment_combatant_stats(text, int, int, int, int, int, int) to anon, authenticated;

-- Optional: auto-clean rooms older than 7 days via a Supabase scheduled function.
-- Uncomment and run separately if you want automatic cleanup:
--
-- create or replace function delete_old_rooms() returns void language sql as $$
--   delete from rooms where updated_at < now() - interval '7 days';
-- $$;
