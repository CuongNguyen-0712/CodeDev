-- =============================================================================
-- 20261102_011_audit_log_no_truncate.sql
--
-- identity.audit_log was append-only for UPDATE and DELETE only: TRUNCATE (directly or through
-- TRUNCATE ... CASCADE from a referenced table) skipped the row trigger and emptied the log
-- (docs/admin-panel-plan.md 10.2, S10). A statement trigger reuses the same function, which
-- refuses every operation except the actor_id SET NULL of a deleted admin.
--
-- Not done here: moving the table to another owner. On Neon the app and the migrations use the
-- same database role, which can also create and assume any new role, so a separate owner would
-- not stop someone holding the app's credentials and would break db:anonymize (it lifts the
-- trigger for one update).
-- =============================================================================

BEGIN;

DROP TRIGGER IF EXISTS trg_audit_log_no_truncate ON identity.audit_log;
CREATE TRIGGER trg_audit_log_no_truncate
    BEFORE TRUNCATE ON identity.audit_log
    FOR EACH STATEMENT EXECUTE FUNCTION identity.audit_log_append_only();

COMMIT;
