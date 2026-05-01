-- Migration: Lobby invitations (issue #94)
--
-- room_invitations
--   Tracks host-to-player invitations for closed lobbies. One row per invitation.
--   An invited user can accept (joins the lobby) or decline (removes their entry).
--   The host can cancel a pending invitation before the invitee acts.
--
--   room_id      — text reference to rooms.id (app-level integrity, no FK)
--   invitee_id   — registered user's playerId (guests cannot be invited)
--   invitee_name — denormalized display name; snapshot at invitation time
--   invited_by   — host's playerId
--   invited_at   — when the invitation was created
--   status       — 'pending' | 'accepted' | 'declined'
--
-- New table only; no changes to existing rows.
-- Safe to re-run (all statements are idempotent).

-- ─── room_invitations ─────────────────────────────────────────────────────────

create table if not exists room_invitations (
  id           uuid        primary key default gen_random_uuid(),
  room_id      text        not null,
  invitee_id   text        not null,
  invitee_name text        not null,
  invited_by   text        not null,
  invited_at   timestamptz not null default now(),
  status       text        not null default 'pending'
                 check (status in ('pending', 'accepted', 'declined'))
);

-- Fast lookup of all invitations for a room (host view: pending invitees list)
create index if not exists room_invitations_room_idx
  on room_invitations (room_id);

-- Fast lookup of all invitations for a user (invitee's My Open Lobbies query)
create index if not exists room_invitations_invitee_idx
  on room_invitations (invitee_id)
  where status = 'pending';

alter table room_invitations enable row level security;

create policy "public read room_invitations"
  on room_invitations for select using (true);

create policy "public insert room_invitations"
  on room_invitations for insert with check (true);

create policy "public update room_invitations"
  on room_invitations for update using (true);

create policy "public delete room_invitations"
  on room_invitations for delete using (true);

grant select, insert, update, delete on table room_invitations to anon, authenticated;
