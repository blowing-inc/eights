-- Migration: awards and votes tables (issue #24)
--
-- awards
--   Permanent record of an award granted at any layer of play.
--   Automatic awards are inserted fully resolved on close.
--   Voted awards are inserted as pending (recipient_id null, awarded_at null)
--   when the ballot opens and resolved when voting closes.
--
--   id              — app-generated text id
--   type            — 'most_wins' | 'mvp' | 'favorite_combatant' | 'best_evolution' | …
--                     unconstrained so new award types don't require a migration
--   layer           — 'game' | 'series' | 'season' | 'league'
--   scope_id        — id of the game/series/season/league this award belongs to
--   scope_type      — mirrors layer; present for explicit polymorphic lookups
--   recipient_type  — 'combatant' | 'player'; known at ballot-open time even
--                     before a winner is determined
--   recipient_id    — nullable; id of the winner; null while ballot is open
--   recipient_name  — denormalized snapshot of winner display name; null while pending
--   value           — optional numeric for stat-based awards (e.g. win count)
--   co_award        — true when the award is shared; one row per co-recipient,
--                     both rows have co_award = true
--   awarded_at      — nullable; set when the award is resolved
--   created_at / updated_at
--
-- votes
--   Permanent record of every individual vote cast.
--   Votes are NEVER deleted — permanent record (Data Conservative).
--
--   id            — app-generated text id
--   award_id      — references awards.id (the pending award row)
--   voter_id      — playerId of the voter
--   voter_name    — denormalized display name; snapshot at vote time
--   nominee_id    — id of the nominated recipient (combatant id or player id)
--   nominee_type  — 'combatant' | 'player'
--   nominee_name  — denormalized display name; snapshot at vote time
--   phase         — 'nomination' | 'runoff'
--   cast_at       — timestamp of the vote
--
-- New tables only; no changes to existing rows.
-- Safe to re-run (all statements are idempotent).

-- ─── awards ──────────────────────────────────────────────────────────────────

create table if not exists awards (
  id             text        primary key,
  type           text        not null,
  layer          text        not null
                   check (layer in ('game', 'series', 'season', 'league')),
  scope_id       text        not null,
  scope_type     text        not null
                   check (scope_type in ('game', 'series', 'season', 'league')),
  recipient_type text        not null
                   check (recipient_type in ('combatant', 'player')),
  recipient_id   text,
  recipient_name text,
  value          numeric,
  co_award       bool        not null default false,
  awarded_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- All awards for a given scope (game/series/season/league summary pages)
create index if not exists awards_scope_idx
  on awards (scope_id, scope_type);

-- All awards for a combatant or player (Cast detail page, player profile)
create index if not exists awards_recipient_idx
  on awards (recipient_id, recipient_type)
  where recipient_id is not null;

-- All pending (unresolved) voted awards — for ballot management
create index if not exists awards_pending_idx
  on awards (scope_id)
  where recipient_id is null;

alter table awards enable row level security;

create policy "public read awards"
  on awards for select using (true);

create policy "public insert awards"
  on awards for insert with check (true);

create policy "public update awards"
  on awards for update using (true);

grant select, insert, update on table awards to anon, authenticated;

-- ─── votes ───────────────────────────────────────────────────────────────────

create table if not exists votes (
  id           text        primary key,
  award_id     text        not null references awards (id),
  voter_id     text        not null,
  voter_name   text        not null,
  nominee_id   text        not null,
  nominee_type text        not null
                 check (nominee_type in ('combatant', 'player')),
  nominee_name text        not null,
  phase        text        not null
                 check (phase in ('nomination', 'runoff')),
  cast_at      timestamptz not null default now()
);

-- All votes for an award (tallying, results display)
create index if not exists votes_award_idx
  on votes (award_id);

-- All votes cast by a player (voter history, audit)
create index if not exists votes_voter_idx
  on votes (voter_id);

alter table votes enable row level security;

create policy "public read votes"
  on votes for select using (true);

create policy "public insert votes"
  on votes for insert with check (true);

grant select, insert on table votes to anon, authenticated;
