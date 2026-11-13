-- =============================================================================
-- 20261113_028_friend_cleanup.sql
--
-- Friends follow-up. 027 stays untouched (already applied locally).
--  1. A block always means "no friendship" (spec rule 5), but chatService.block
--     only deletes the pair row since the friends feature; rows of pairs blocked
--     before that (blocks shipped with chat) are deleted here, either direction.
--  2. Invitation keyset paging on (updated_at, id) breaks on a NULL updated_at:
--     backfill legacy NULLs, then make the column NOT NULL.
--  3. idx_friend_sender (sender_id) is a strict prefix of idx_friend_sender_state,
--     which also serves the user-delete cascade, so it goes.
-- =============================================================================

BEGIN;

DELETE FROM community.friend f
USING community.user_block b
WHERE LEAST(b.blocker_id, b.blocked_id) = LEAST(f.sender_id, f.receiver_id)
  AND GREATEST(b.blocker_id, b.blocked_id) = GREATEST(f.sender_id, f.receiver_id);

UPDATE community.friend SET updated_at = COALESCE(updated_at, created_at, now()) WHERE updated_at IS NULL;
ALTER TABLE community.friend ALTER COLUMN updated_at SET NOT NULL;

DROP INDEX IF EXISTS community.idx_friend_sender;

COMMIT;
