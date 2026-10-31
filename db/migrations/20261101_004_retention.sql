-- =============================================================================
-- 20261101_004_retention.sql
--
-- docs/performance-plan.md, Phase 4.
--   1. challenge.code_runs: timestamptz like every newer table (the columns were compared with
--      now() as local time), and one finished_at index for both the admission load (recent
--      completed runs) and the daily retention (services/retention.service.js).
--   2. Indexes no query uses or that another index covers:
--      - identity.sessions expires_at / idle_expires_at: sessions are only read by id or user;
--        idle_expires_at changes on every refresh, so the index also blocked HOT updates;
--      - identity.accounts idx_accounts_user: accounts_user_provider_uq (user_id, provider);
--      - identity.users users_email_key: emails are unique in lower case (users_email_lower_uq)
--        and looked up as lower(email).
-- =============================================================================

BEGIN;

-- 1. code runs
ALTER TABLE challenge.code_runs
  ALTER COLUMN queued_at TYPE timestamptz,
  ALTER COLUMN started_at TYPE timestamptz,
  ALTER COLUMN finished_at TYPE timestamptz,
  ALTER COLUMN deadline_at TYPE timestamptz,
  ALTER COLUMN published_at TYPE timestamptz;

DROP INDEX IF EXISTS challenge.idx_code_runs_done_recent;
CREATE INDEX IF NOT EXISTS idx_code_runs_finished
  ON challenge.code_runs (finished_at) WHERE finished_at IS NOT NULL;

-- 2. unused / covered
DROP INDEX IF EXISTS identity.idx_sessions_expires_at;
DROP INDEX IF EXISTS identity.idx_sessions_idle_expires_at;
DROP INDEX IF EXISTS identity.idx_accounts_user;
ALTER TABLE identity.users DROP CONSTRAINT IF EXISTS users_email_key;

COMMIT;
