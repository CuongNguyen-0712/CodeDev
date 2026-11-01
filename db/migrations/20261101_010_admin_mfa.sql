-- =============================================================================
-- 20261101_010_admin_mfa.sql
--
-- Two-factor authentication for the admin area (docs/admin-panel-plan.md 2.1, 3.4):
--   identity.admin_mfa           one TOTP secret per user, encrypted by the app (AES-256-GCM);
--                                last_step blocks replaying a code inside its 30-second window
--   identity.admin_mfa_recovery  one-time recovery codes, stored as keyed hashes
--   identity.sessions            mfa_verified_at: this session passed the second factor
--                                reauth_at: last confirmation, sensitive actions need it recent
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS identity.admin_mfa (
    user_id bigint PRIMARY KEY REFERENCES identity.users(id) ON DELETE CASCADE,
    secret_enc text NOT NULL,
    confirmed_at timestamptz,
    last_step bigint NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS identity.admin_mfa_recovery (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id bigint NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    code_hash varchar(64) NOT NULL,
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_mfa_recovery_user ON identity.admin_mfa_recovery (user_id) WHERE used_at IS NULL;

ALTER TABLE identity.sessions
    ADD COLUMN IF NOT EXISTS mfa_verified_at timestamptz,
    ADD COLUMN IF NOT EXISTS reauth_at timestamptz;

COMMIT;
