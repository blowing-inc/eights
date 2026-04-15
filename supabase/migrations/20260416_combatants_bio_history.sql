-- Migration: combatants bio_history (issue #6)
--
-- Adds bio_history column to track every bio edit as a historical record.
-- Format: [{name, bio, updatedAt, updatedBy}] — last 20 entries kept (enforced at app layer).
--
-- Safe to re-run (idempotent).

alter table combatants
  add column if not exists bio_history jsonb not null default '[]';
