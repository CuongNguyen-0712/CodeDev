-- =============================================================================
-- 20261101_008_user_status_until.sql
--
-- Admin user management (docs/admin-panel-plan.md, module 02):
--   status 'blocked' + status_until = a suspension that the sweeper lifts when it ends;
--   status 'blocked' + status_until NULL = blocked until an admin activates the account.
-- status_reason keeps the admin's reason on the row (the audit log keeps the history).
-- =============================================================================

BEGIN;

ALTER TABLE identity.users
  ADD COLUMN IF NOT EXISTS status_reason text,
  ADD COLUMN IF NOT EXISTS status_until timestamptz;

CREATE INDEX IF NOT EXISTS idx_users_status_until
  ON identity.users (status_until) WHERE status = 'blocked' AND status_until IS NOT NULL;

COMMIT;
