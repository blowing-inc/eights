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
