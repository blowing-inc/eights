-- Migration: new tables — groups, combatant_groups, arenas (issue #4)
--
-- Creates three tables for future 1.1.x features.
-- Schema only — no app-level feature work in this release.
--
-- groups:           named collectives combatants can belong to
-- combatant_groups: join table for combatant ↔ group membership
-- arenas:           optional fight contexts (schema only; feature work deferred)
--
-- Safe to re-run (all statements are idempotent).

-- ─── groups ──────────────────────────────────────────────────────────────────
-- Named collectives. Combatants belong to zero or multiple groups.
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

-- ─── combatant_groups ────────────────────────────────────────────────────────
-- Join table for combatant ↔ group membership.
-- Either the combatant owner or the group owner may create the link.
--
-- added_by: user id of whoever created the membership link.
-- No FK to users — users are stored with text ids and the table may not exist
-- in all deployments; enforce at app level.
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

-- ─── arenas ──────────────────────────────────────────────────────────────────
-- Optional fight contexts: name, bio (setting/vibe), and house rules.
-- Schema only — no arena feature work in 1.1.x.
-- Scope decision (game-level vs round-level) must be resolved before app work.
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
