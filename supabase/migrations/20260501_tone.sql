-- Tone: JSONB column on rooms and seasons
-- Shape: { tags: string[], premise: string } | null
-- Snapshotted onto rooms.tone at draft start; never mutated after that point.

ALTER TABLE rooms ADD COLUMN tone jsonb DEFAULT NULL;
ALTER TABLE seasons ADD COLUMN tone jsonb DEFAULT NULL;
