-- Migration: tag support functions (issue #5)
--
-- get_tag_suggestions: autocomplete endpoint — returns distinct tags from published
--   combatants that start with the given prefix, up to limit_n results.
--
-- merge_tags: Super Host capability (role defined in 1.2.x) — replaces old_tag with
--   new_tag on every combatant that carries old_tag. If the combatant already has
--   new_tag, old_tag is simply removed to avoid duplicates.
--   Returns the count of affected rows.

create or replace function get_tag_suggestions(prefix text, limit_n int default 10)
returns setof text
language sql stable
as $$
  select distinct t
  from combatants, unnest(tags) as t
  where status = 'published'
    and (prefix = '' or t ilike prefix || '%')
  order by t
  limit limit_n;
$$;

create or replace function merge_tags(old_tag text, new_tag text)
returns int
language sql
as $$
  with updated as (
    update combatants
    set tags = case
      when new_tag = any(tags) then array_remove(tags, old_tag)
      else array_append(array_remove(tags, old_tag), new_tag)
    end
    where old_tag = any(tags)
    returning 1
  )
  select count(*)::int from updated;
$$;
