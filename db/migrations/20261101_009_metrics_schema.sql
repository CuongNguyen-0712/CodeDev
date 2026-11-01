-- =============================================================================
-- 20261101_009_metrics_schema.sql
--
-- Read-only views for Grafana (docs/admin-panel-plan.md 6.4): aggregated, with no personal data
-- (no email, username, IP or source code). Grafana connects as `grafana_ro`, created by hand in
-- each environment (Neon console for production, psql locally), e.g.:
--
--   CREATE ROLE grafana_ro LOGIN PASSWORD '<secret>' CONNECTION LIMIT 3;
--   ALTER ROLE grafana_ro SET statement_timeout = '5s';
--   ALTER ROLE grafana_ro SET default_transaction_read_only = on;
--
-- then this migration is run again or the GRANT block below is run by hand. The grants only apply
-- when the role exists, so the migration also runs where Grafana is not used.
-- =============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS metrics;

CREATE INDEX IF NOT EXISTS idx_code_runs_queued_at ON challenge.code_runs (queued_at);

CREATE OR REPLACE VIEW metrics.code_runs_5m AS
SELECT date_bin(interval '5 minutes', queued_at, timestamptz '2000-01-01') AS bucket,
       status, run_type, language, COALESCE(sandbox, 'default') AS sandbox,
       COUNT(*)::int AS runs,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM started_at - queued_at)) AS wait_p50_sec,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM started_at - queued_at)) AS wait_p95_sec,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM finished_at - started_at)) AS run_p50_sec,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM finished_at - started_at)) AS run_p95_sec
FROM challenge.code_runs
WHERE queued_at > now() - interval '15 days'
GROUP BY 1, 2, 3, 4, 5;

CREATE OR REPLACE VIEW metrics.code_runs_active AS
SELECT COUNT(*) FILTER (WHERE status = 'queued' AND deadline_at > now())::int AS queued,
       COUNT(*) FILTER (WHERE status = 'running')::int AS running,
       COUNT(*) FILTER (WHERE deadline_at < now())::int AS expired,
       COALESCE(EXTRACT(EPOCH FROM now() - MIN(queued_at) FILTER (WHERE status = 'queued' AND deadline_at > now())), 0)::int AS oldest_wait_sec
FROM challenge.code_runs
WHERE status IN ('queued', 'running');

CREATE OR REPLACE VIEW metrics.outbox AS
SELECT COUNT(*) FILTER (WHERE processed_at IS NULL AND dead_at IS NULL)::int AS pending,
       COUNT(*) FILTER (WHERE processed_at IS NULL AND dead_at IS NULL AND attempts > 0)::int AS retrying,
       COUNT(*) FILTER (WHERE dead_at IS NOT NULL AND processed_at IS NULL)::int AS dead,
       COALESCE(EXTRACT(EPOCH FROM now() - MIN(created_at) FILTER (WHERE processed_at IS NULL AND dead_at IS NULL)), 0)::int AS oldest_pending_sec
FROM identity.auth_outbox;

CREATE OR REPLACE VIEW metrics.dead_letters_daily AS
SELECT date_trunc('day', created_at) AS day, source, kind,
       COUNT(*) FILTER (WHERE resolved_at IS NULL)::int AS open,
       COUNT(*) FILTER (WHERE resolved_at IS NOT NULL)::int AS resolved
FROM ops.dead_letters
GROUP BY 1, 2, 3;

CREATE OR REPLACE VIEW metrics.learning_daily AS
SELECT d::date AS day,
       (SELECT COUNT(*) FROM challenge.code_submissions WHERE submitted_at >= d AND submitted_at < d + interval '1 day')::int AS code_submissions,
       (SELECT COUNT(DISTINCT (user_id, created_at)) FROM challenge.question_submissions WHERE created_at >= d AND created_at < d + interval '1 day')::int AS quiz_submissions,
       (SELECT COUNT(*) FROM challenge.code_submissions WHERE submitted_at >= d AND submitted_at < d + interval '1 day' AND status = 'passed')::int AS code_passed,
       (SELECT COUNT(*) FROM learning.register WHERE created_at >= d AND created_at < d + interval '1 day')::int AS enrollments,
       (SELECT COUNT(DISTINCT user_id) FROM identity.sessions WHERE last_seen_at >= d AND last_seen_at < d + interval '1 day')::int AS active_users
FROM generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') AS d;

CREATE OR REPLACE VIEW metrics.signups_daily AS
SELECT date_trunc('day', created_at)::date AS day,
       COUNT(*)::int AS signups,
       COUNT(*) FILTER (WHERE email_verified IS TRUE)::int AS verified
FROM identity.users
WHERE created_at > now() - interval '90 days'
GROUP BY 1;

CREATE OR REPLACE VIEW metrics.orders_daily AS
SELECT date_trunc('day', created_at)::date AS day, status::text AS status, payment_method::text AS payment_method,
       COUNT(*)::int AS orders, COALESCE(SUM(points_total), 0)::bigint AS points
FROM commerce.orders
WHERE created_at > now() - interval '90 days'
GROUP BY 1, 2, 3;

CREATE OR REPLACE VIEW metrics.db_activity AS
SELECT COALESCE(state, 'other') AS state, COUNT(*)::int AS connections
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY 1;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'grafana_ro') THEN
        GRANT USAGE ON SCHEMA metrics TO grafana_ro;
        GRANT SELECT ON ALL TABLES IN SCHEMA metrics TO grafana_ro;
    END IF;
END
$$;

COMMIT;
