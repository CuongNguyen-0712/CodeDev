-- =============================================================================
-- 20261018_003_drop_profile_star.sql
--
-- Drops profile.info.star: it was never written (always 0) and is no longer read by the app.
-- Apply in production only after the app version that stopped reading `star` is deployed.
-- rank and level stay for now (no longer read either; dropped in a later migration).
-- =============================================================================

BEGIN;

ALTER TABLE profile.info DROP CONSTRAINT chk_info_counters;
ALTER TABLE profile.info DROP COLUMN star;
ALTER TABLE profile.info ADD CONSTRAINT chk_info_counters CHECK (rank >= 0 AND points >= 0);

COMMIT;
