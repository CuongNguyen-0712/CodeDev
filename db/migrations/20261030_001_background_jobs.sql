-- =============================================================================
-- 20261030_001_background_jobs.sql
--
-- docs/queue-execution-plan.md: Inngest runs background work, PostgreSQL is the job store.
--   1. challenge.code_runs becomes the queue of code executions (Run samples and Submit):
--      deadline_at (cancelled when still waiting after it), published_at (event sent to Inngest;
--      NULL = the sweeper sends it again), sandbox (concurrency key), result (graded outcome),
--      error. One queued/running job per user at a time.
--   2. identity.auth_outbox: published_at (event sent), dead_at (gave up after max_attempts),
--      max_attempts. Pending rows exclude dead ones.
--   3. ops.dead_letters: background work that failed for good, from every source, for
--      `npm run dlq` and /api/health.
-- =============================================================================

BEGIN;

-- 1. code executions
ALTER TABLE challenge.code_runs
  ADD COLUMN IF NOT EXISTS deadline_at timestamp,
  ADD COLUMN IF NOT EXISTS published_at timestamp,
  ADD COLUMN IF NOT EXISTS sandbox varchar(100),
  ADD COLUMN IF NOT EXISTS result jsonb,
  ADD COLUMN IF NOT EXISTS error text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_code_runs_user_active
  ON challenge.code_runs (user_id) WHERE status IN ('queued', 'running');

CREATE INDEX IF NOT EXISTS idx_code_runs_active_deadline
  ON challenge.code_runs (deadline_at) WHERE status IN ('queued', 'running');

-- 2. auth outbox
ALTER TABLE identity.auth_outbox
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS dead_at timestamptz,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 8;

DROP INDEX IF EXISTS identity.idx_auth_outbox_pending;
CREATE INDEX idx_auth_outbox_pending
  ON identity.auth_outbox (available_at, id) WHERE processed_at IS NULL AND dead_at IS NULL;

-- 3. dead letters
CREATE SCHEMA IF NOT EXISTS ops;

CREATE TABLE IF NOT EXISTS ops.dead_letters (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source varchar(30) NOT NULL,       -- 'inngest' | 'outbox'
  kind varchar(100) NOT NULL,        -- function id or outbox event type
  ref varchar(200),                  -- Inngest run id or outbox id
  payload jsonb,
  error text,
  attempts integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolution text
);

-- A failure reported twice (at-least-once delivery) is stored once.
CREATE UNIQUE INDEX IF NOT EXISTS uq_dead_letters_ref ON ops.dead_letters (source, kind, ref);
CREATE INDEX IF NOT EXISTS idx_dead_letters_open ON ops.dead_letters (created_at) WHERE resolved_at IS NULL;

COMMIT;
