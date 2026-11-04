-- =============================================================================
-- 20261104_017_notification_inbox.sql
--
-- Persistent notification inbox (docs/ui-ux/INFORMATION_ARCHITECTURE.md D-04). The bell and
-- /notifications read profile.notification; services write a row when something durable happens
-- (course unlocked or revoked, level-up, achievement, course completed).
--   kind        drives the icon and copy on the client
--   title       heading; `message` stays the body
--   link        in-app deep link of the item
--   dedupe_key  id of the fact that caused the row (order, entitlement, level, achievement code,
--               course), so a replayed webhook or a repeated submission inserts nothing
-- =============================================================================

BEGIN;

ALTER TABLE profile.notification
    ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'system',
    ADD COLUMN IF NOT EXISTS title text,
    ADD COLUMN IF NOT EXISTS link text,
    ADD COLUMN IF NOT EXISTS dedupe_key text;

-- Unread badge count.
CREATE INDEX IF NOT EXISTS idx_notification_unread ON profile.notification (user_id)
    WHERE has_seen = false AND is_deleted = false;

-- One inbox row per fact.
CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_dedupe ON profile.notification (user_id, kind, dedupe_key)
    WHERE dedupe_key IS NOT NULL;

COMMIT;
