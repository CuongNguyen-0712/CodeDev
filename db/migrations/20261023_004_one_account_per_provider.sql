-- =============================================================================
-- 20261023_004_one_account_per_provider.sql
--
-- A user has at most one sign-in row per provider (one password, one GitHub, one Google), so
-- Settings lists and disconnects exactly one account per provider (plan 10.4, 10.5).
-- Local and production 2026-10-23: 0 (user_id, provider) duplicates.
-- =============================================================================

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS accounts_user_provider_uq ON identity.accounts (user_id, provider);

COMMIT;
