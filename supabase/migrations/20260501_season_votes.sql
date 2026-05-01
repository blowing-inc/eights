-- Migration: season votes tracking (issue #29)
--
-- Adds a `votes` jsonb column to the seasons table to track award row IDs
-- created at season close. Populated automatically when a season ends;
-- stores { favoriteCombatantAwardId, mostCreativeAwardId, bestEvolutionAwardId }.
--
-- Safe to re-run (idempotent).

alter table seasons add column if not exists votes jsonb;
