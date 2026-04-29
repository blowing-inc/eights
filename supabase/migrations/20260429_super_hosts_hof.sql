-- Migration: Super Hosts role and Hall of Fame (issue #18)
--
-- Users:
--   is_super_host bool — admin-assigned trusted-user role for world-level curation.
--
-- Combatants (Hall of Fame):
--   hall_of_fame bool        — currently inducted flag
--   inducted_at  timestamptz — set on induction, preserved on removal (Data Conservative)
--   inducted_by  text        — Super Host name, denormalized at induction time
--   induction_note text      — optional note from the inducting Super Host
--   removed_at   timestamptz — set on removal; null if currently inducted
--   removed_by   text        — Super Host name on removal; null if currently inducted
--
-- merge_tags:
--   Extended to cover arenas and groups in addition to combatants.
--   Replaces the version from 20260416_tag_suggestions_fn.sql.
--
-- Safe to re-run (all statements are idempotent).

-- ─── Users ────────────────────────────────────────────────────────────────────

alter table users
  add column if not exists is_super_host bool not null default false;

-- ─── Hall of Fame ────────────────────────────────────────────────────────────

alter table combatants
  add column if not exists hall_of_fame    bool        not null default false,
  add column if not exists inducted_at     timestamptz,
  add column if not exists inducted_by     text,
  add column if not exists induction_note  text        not null default '',
  add column if not exists removed_at      timestamptz,
  add column if not exists removed_by      text;

create index if not exists combatants_hof_idx
  on combatants (hall_of_fame)
  where hall_of_fame = true;

-- ─── merge_tags — extended to cover all entity types ─────────────────────────
-- Replaces the combatants-only version. Merges old_tag → new_tag across
-- combatants, arenas, and groups simultaneously.
-- Returns total count of affected rows.

create or replace function merge_tags(old_tag text, new_tag text)
returns int
language sql
as $$
  with
    c as (
      update combatants
      set tags = case
        when new_tag = any(tags) then array_remove(tags, old_tag)
        else array_append(array_remove(tags, old_tag), new_tag)
      end
      where old_tag = any(tags)
      returning 1
    ),
    a as (
      update arenas
      set tags = case
        when new_tag = any(tags) then array_remove(tags, old_tag)
        else array_append(array_remove(tags, old_tag), new_tag)
      end
      where old_tag = any(tags)
      returning 1
    ),
    g as (
      update groups
      set tags = case
        when new_tag = any(tags) then array_remove(tags, old_tag)
        else array_append(array_remove(tags, old_tag), new_tag)
      end
      where old_tag = any(tags)
      returning 1
    )
  select (select count(*)::int from c)
       + (select count(*)::int from a)
       + (select count(*)::int from g);
$$;
