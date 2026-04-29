-- Migration: arena schema expansion — round snapshot, lineage, reactions, playlists (issue #68)
--
-- round.arena (rooms.data JSONB — no separate rounds table):
--   Arenas attach at the round level. The round object inside rooms.data
--   carries a denormalized snapshot taken at assignment time. Shape:
--
--     round.arena: {
--       id:          string,
--       name:        string,
--       description: string,     -- the setting, the vibe, the absurdity
--       houseRules:  string|null,
--       tags:        string[],
--     } | null
--
--   null means no arena was assigned to that round. Existing round records
--   are unaffected — null is the safe default for the read path.
--
-- Safe to re-run (all statements are idempotent).

-- ─── arenas: lineage columns ─────────────────────────────────────────────────
-- Mirrors the combatants lineage pattern.
-- null on all three id/json columns means generation-0 (original) arena.
-- bornFrom shape: { gameCode, roundNumber, seriesId } (seriesId nullable).
-- Intentionally minimal — the bio and update history tell the story;
-- the round pointer is the anchor.

alter table arenas
  add column if not exists root_id    text    null,
  add column if not exists parent_id  text    null,
  add column if not exists generation int     not null default 0,
  add column if not exists born_from  jsonb   null;

-- ─── arenas: reaction count cache ────────────────────────────────────────────
-- Running totals derived from arena_reactions. Cached here for read performance.
-- Updated by trigger on arena_reactions (see below). Use greatest(0, …) in
-- the trigger so concurrent deletes cannot drive the count below zero.

alter table arenas
  add column if not exists likes    int not null default 0,
  add column if not exists dislikes int not null default 0;

-- ─── arena_reactions ─────────────────────────────────────────────────────────
-- Per-player reactions. Unique constraint on (arena_id, user_id) means each
-- player can hold exactly one reaction at a time — changing from like to
-- dislike is an UPDATE, not a new row.
--
-- Counts on the arenas row are kept in sync by the trigger below.

create table if not exists arena_reactions (
  id         uuid        primary key default gen_random_uuid(),
  arena_id   text        not null,
  user_id    text        not null,
  reaction   text        not null check (reaction in ('like', 'dislike')),
  created_at timestamptz not null default now(),
  unique (arena_id, user_id)
);

create index if not exists arena_reactions_arena_idx on arena_reactions (arena_id);

alter table arena_reactions enable row level security;

create policy "public read arena_reactions"   on arena_reactions for select using (true);
create policy "public insert arena_reactions" on arena_reactions for insert with check (true);
create policy "public update arena_reactions" on arena_reactions for update using (true);
create policy "public delete arena_reactions" on arena_reactions for delete using (true);

grant select, insert, update, delete on table arena_reactions to anon, authenticated;

-- Trigger: keep arenas.likes / arenas.dislikes in sync with arena_reactions.
-- Handles INSERT (new reaction), UPDATE (reaction flip), and DELETE (removed
-- reaction). greatest(0, …) guards against drift from out-of-order operations.

create or replace function sync_arena_reaction_counts()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.reaction = 'like' then
      update arenas set likes    = likes    + 1 where id = NEW.arena_id;
    else
      update arenas set dislikes = dislikes + 1 where id = NEW.arena_id;
    end if;

  elsif TG_OP = 'UPDATE' then
    -- reaction flipped; the unique constraint means arena_id never changes
    if OLD.reaction = 'like' then
      update arenas
        set likes    = greatest(0, likes    - 1),
            dislikes = dislikes + 1
        where id = NEW.arena_id;
    else
      update arenas
        set dislikes = greatest(0, dislikes - 1),
            likes    = likes    + 1
        where id = NEW.arena_id;
    end if;

  elsif TG_OP = 'DELETE' then
    if OLD.reaction = 'like' then
      update arenas set likes    = greatest(0, likes    - 1) where id = OLD.arena_id;
    else
      update arenas set dislikes = greatest(0, dislikes - 1) where id = OLD.arena_id;
    end if;

  end if;
  return null; -- after trigger, return value unused
end;
$$;

create trigger arena_reaction_count_sync
  after insert or update or delete on arena_reactions
  for each row execute function sync_arena_reaction_counts();

-- ─── arena_playlists ─────────────────────────────────────────────────────────
-- A named, ordered collection of arenas for round-by-round delivery.
-- Distinct from Groups — a playlist is a delivery mechanism, not a narrative
-- collective. Follows the same stash/publish lifecycle as all Workshop objects.

create table if not exists arena_playlists (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  owner_id   text        not null,
  owner_name text        not null,
  status     text        not null default 'stashed'
               check (status in ('stashed', 'published')),
  tags       text[]      not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists arena_playlists_owner_idx  on arena_playlists (owner_id);
create index if not exists arena_playlists_status_idx on arena_playlists (status)
  where status = 'published';

alter table arena_playlists enable row level security;

create policy "public read arena_playlists"   on arena_playlists for select using (true);
create policy "public insert arena_playlists" on arena_playlists for insert with check (true);
create policy "public update arena_playlists" on arena_playlists for update using (true);

grant select, insert, update on table arena_playlists to anon, authenticated;

-- ─── arena_playlist_slots ────────────────────────────────────────────────────
-- Ordered slots within a playlist. position is 1-based. Unique constraint on
-- (playlist_id, position) ensures no two slots occupy the same position.
-- arena_id is not a FK to arenas — arenas use text primary keys.

create table if not exists arena_playlist_slots (
  id          uuid        primary key default gen_random_uuid(),
  playlist_id uuid        not null references arena_playlists(id),
  arena_id    text        not null,
  position    int         not null,
  unique (playlist_id, position)
);

create index if not exists arena_playlist_slots_playlist_idx on arena_playlist_slots (playlist_id);

alter table arena_playlist_slots enable row level security;

create policy "public read arena_playlist_slots"   on arena_playlist_slots for select using (true);
create policy "public insert arena_playlist_slots" on arena_playlist_slots for insert with check (true);
create policy "public update arena_playlist_slots" on arena_playlist_slots for update using (true);
create policy "public delete arena_playlist_slots" on arena_playlist_slots for delete using (true);

grant select, insert, update, delete on table arena_playlist_slots to anon, authenticated;
