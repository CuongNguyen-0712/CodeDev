-- =============================================================================
-- 20261101_005_drop_unused_token_index.sql
--
-- idx_refresh_tokens_expires (20261101_001) serves no query: retention deletes ended sessions and
-- their tokens go with them through ON DELETE CASCADE (session_id is indexed). Every refresh
-- inserts a token row, so the unused index only cost writes.
-- =============================================================================

BEGIN;

DROP INDEX IF EXISTS identity.idx_refresh_tokens_expires;

COMMIT;
