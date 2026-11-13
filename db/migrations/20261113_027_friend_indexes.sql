-- =============================================================================
-- 20261113_027_friend_indexes.sql
--
-- Friends list and requests: keyset pagination by (updated_at DESC, id) per
-- status needs composite indexes on both sides of the edge. idx_friend_receiver
-- (receiver_id) is a strict prefix of idx_friend_receiver_state, so it goes.
-- idx_friend_sender stays (used by the user-delete cascade and older queries).
-- =============================================================================

BEGIN;

CREATE INDEX IF NOT EXISTS idx_friend_receiver_state ON community.friend (receiver_id, status, updated_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_friend_sender_state ON community.friend (sender_id, status, updated_at DESC, id);
DROP INDEX IF EXISTS community.idx_friend_receiver;

COMMIT;
