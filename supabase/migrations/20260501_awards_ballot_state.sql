-- Migration: ballot_state column on awards (issue #26)
--
-- The ballot_state column tracks live voting progress while a ballot is open.
-- It is set when the ballot opens and cleared to null on resolution —
-- the votes and awards tables are the permanent record.
--
--   ballot_state jsonb — nullable; present while the ballot is open
--     phase            — 'nomination' | 'runoff'
--     lockedVoterIds   — voter IDs who have locked in (voted or explicitly abstained)
--     runoffPool       — [{ id, name, type }] | null — populated on runoff transition
--
-- Safe to re-run (idempotent).

alter table awards add column if not exists ballot_state jsonb;

-- Enable realtime for live ballot status strip (subscription on award row updates)
-- and vote insert events.
alter publication supabase_realtime add table awards;
alter publication supabase_realtime add table votes;
