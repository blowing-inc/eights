-- Run this in your Supabase project → SQL Editor
-- Creates the rooms table and sets up Row Level Security so anyone
-- can read/write rooms without needing auth (appropriate for a party game).

create table if not exists rooms (
  id          text primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

-- Index so polling by id is instant
create index if not exists rooms_updated_at_idx on rooms (updated_at desc);

-- Enable RLS
alter table rooms enable row level security;

-- Allow anyone to read any room (needed for join-by-code)
create policy "public read"
  on rooms for select
  using (true);

-- Allow anyone to insert a new room
create policy "public insert"
  on rooms for insert
  with check (true);

-- Allow anyone to update any room (host/player writes during game)
create policy "public update"
  on rooms for update
  using (true);

-- Optional: auto-clean rooms older than 7 days
-- (Uncomment if you want automatic cleanup via a cron job in Supabase)
-- create or replace function delete_old_rooms() returns void language sql as $$
--   delete from rooms where updated_at < now() - interval '7 days';
-- $$;

-- ─── Global combatants (bestiary) ────────────────────────────────────────────
-- Run this block separately if you're adding it to an existing deployment.

create table if not exists combatants (
  id               text        primary key,
  name             text        not null,
  bio              text        not null default '',
  bio_history      jsonb       not null default '[]',  -- [{name, bio, updatedAt, updatedBy}]
  owner_id         text        not null default '',
  owner_name       text        not null default '',
  wins             int         not null default 0,
  losses           int         not null default 0,
  reactions_heart  int         not null default 0,
  reactions_angry  int         not null default 0,
  reactions_cry    int         not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists combatants_wins_idx  on combatants (wins desc);
create index if not exists combatants_owner_idx on combatants (owner_id);
create index if not exists combatants_name_idx  on combatants (name);

alter table combatants enable row level security;

create policy "public read combatants"
  on combatants for select using (true);

create policy "public insert combatants"
  on combatants for insert with check (true);

create policy "public update combatants"
  on combatants for update using (true);

-- Atomic stat increment used by confirmWinner and undoLastRound.
-- Pass negative values to decrement (undo).
create or replace function increment_combatant_stats(
  p_id     text,
  p_wins   int,
  p_losses int,
  p_heart  int,
  p_angry  int,
  p_cry    int
) returns void language sql as $$
  update combatants set
    wins            = greatest(0, wins   + p_wins),
    losses          = greatest(0, losses + p_losses),
    reactions_heart = greatest(0, reactions_heart + p_heart),
    reactions_angry = greatest(0, reactions_angry + p_angry),
    reactions_cry   = greatest(0, reactions_cry   + p_cry),
    updated_at      = now()
  where id = p_id;
$$;
