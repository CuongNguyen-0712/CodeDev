-- =============================================================================
-- 20261023_002_email_verification.sql
--
-- One-time email tokens (docs/email-verification-plan.md section 3). Only an HMAC digest of
-- the token is stored. `email` is the address the token was sent to: once the user changes their
-- email, older tokens no longer match and stop working. Each user has at most one live token
-- per purpose; issuing a new one deletes the previous one.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS identity.email_tokens (
  id          bigserial PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  purpose     text NOT NULL CONSTRAINT email_tokens_purpose_check CHECK (purpose IN ('verify_email')),
  email       varchar(255) NOT NULL,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_tokens_live_uq
  ON identity.email_tokens (user_id, purpose) WHERE consumed_at IS NULL;

COMMIT;
