-- =============================================================================
-- 20261114_029_team_members_joined_at.sql
--
-- Teams (group chats of up to 5 friends).
--  1. joined_at records when a member's invitation was accepted; the oldest
--     approved member becomes host when the host leaves. NULL while pending.
--  2. Rows approved before this column existed are backfilled.
--  3. idx_team_members_team_joined serves the member list and host succession
--     (team_id, status, joined_at, id).
-- =============================================================================

BEGIN;

ALTER TABLE community.team_members ADD COLUMN IF NOT EXISTS joined_at timestamp;

UPDATE community.team_members
SET joined_at = COALESCE(updated_at, created_at)
WHERE status = 'approved' AND joined_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_team_members_team_joined
    ON community.team_members (team_id, status, joined_at, id);

COMMIT;
