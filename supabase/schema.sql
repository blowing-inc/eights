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
-- Global cast. One row per combatant form (base + evolved variants).
--
-- source: 'game' = entered at draft time | 'created' = built in The Workshop
-- status: 'stashed' = private to owner | 'published' = permanent public record
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
--
-- mvp_record: array of { gameCode, voteShare, coMvp } — one entry per MVP win.
-- tags: free-form labels, lowercase, applied at creation or edit time.

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
  source           text        not null default 'game',   -- 'game' | 'created'
  status           text        not null default 'stashed', -- 'stashed' | 'published'
  tags             text[]      not null default '{}',
  mvp_record       jsonb       not null default '[]',
  lineage          jsonb       null,                      -- null for gen-0; see structure above
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists combatants_wins_idx    on combatants (wins desc);
create index if not exists combatants_owner_idx   on combatants (owner_id);
create index if not exists combatants_name_idx    on combatants (name);
create index if not exists combatants_status_idx  on combatants (status) where status = 'published';

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

-- ─── Groups ──────────────────────────────────────────────────────────────────
-- Named collectives combatants can belong to.
-- Follows the same stash/publish lifecycle as combatants.
-- A group's win/loss record is derived from its members — not stored here.
--
-- owner_name is snapshotted at creation time. If the user later changes their
-- username, the group's record still shows who created it.

create table if not exists groups (
  id          text        primary key,
  name        text        not null,
  description text        not null default '',
  owner_id    text        not null,
  owner_name  text        not null,
  status      text        not null default 'stashed', -- 'stashed' | 'published'
  tags        text[]      not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists groups_owner_idx
  on groups (owner_id);

create index if not exists groups_status_idx
  on groups (status)
  where status = 'published';

alter table groups enable row level security;

create policy "public read groups"   on groups for select using (true);
create policy "public insert groups" on groups for insert with check (true);
create policy "public update groups" on groups for update using (true);

grant select, insert, update on table groups to anon, authenticated;

-- ─── Combatant Groups ────────────────────────────────────────────────────────
-- Join table for combatant ↔ group membership.
-- Either the combatant owner or the group owner may create the link.
--
-- added_by: user id of whoever created the membership link.
-- No FK to users — users are stored with text ids; enforce membership integrity
-- at the app level.
--
-- On combatant delete (stashed only): app removes all combatant_groups rows
-- for that combatant before deleting. Published combatants are not deletable.

create table if not exists combatant_groups (
  combatant_id  text        not null,
  group_id      text        not null,
  added_at      timestamptz not null default now(),
  added_by      text        not null,
  primary key (combatant_id, group_id)
);

-- Fast lookup of all combatants in a group
create index if not exists combatant_groups_group_idx
  on combatant_groups (group_id);

alter table combatant_groups enable row level security;

create policy "public read combatant_groups"   on combatant_groups for select using (true);
create policy "public insert combatant_groups" on combatant_groups for insert with check (true);
create policy "public update combatant_groups" on combatant_groups for update using (true);
create policy "public delete combatant_groups" on combatant_groups for delete using (true);

grant select, insert, update, delete on table combatant_groups to anon, authenticated;

-- ─── Arenas ──────────────────────────────────────────────────────────────────
-- Optional fight contexts: name, bio (the setting/vibe), and house rules.
-- Schema only in 1.1.x — no arena feature work until scope decision is resolved
-- (game-level vs round-level assignment; see docs/glossary.md → Arenas).
--
-- Follows the same stash/publish lifecycle as combatants and groups.
-- Publish-on-game-completion applies: stashed arenas used in a completed game
-- auto-publish on room close (app-level logic, not enforced here).
--
-- Arena data is denormalized into the round/room at selection time.
-- Later edits to the arena row do not alter the fight record.

create table if not exists arenas (
  id          text        primary key,
  name        text        not null,
  bio         text        not null default '',   -- the setting, the vibe, the absurdity
  rules       text        not null default '',   -- optional house rules (free text)
  owner_id    text        not null,
  owner_name  text        not null,
  status      text        not null default 'stashed', -- 'stashed' | 'published'
  tags        text[]      not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists arenas_owner_idx
  on arenas (owner_id);

create index if not exists arenas_status_idx
  on arenas (status)
  where status = 'published';

alter table arenas enable row level security;

create policy "public read arenas"   on arenas for select using (true);
create policy "public insert arenas" on arenas for insert with check (true);
create policy "public update arenas" on arenas for update using (true);

grant select, insert, update on table arenas to anon, authenticated;
