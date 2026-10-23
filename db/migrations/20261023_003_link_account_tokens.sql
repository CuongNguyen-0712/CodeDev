-- =============================================================================
-- 20261023_003_link_account_tokens.sql
--
-- Link confirmation by email (docs/email-verification-plan.md 10.3, case 5b): a GitHub / Google
-- account that wants to join an unverified user is confirmed through a token mailed to that user.
-- The pending link (provider, provider account id, provider email) travels in `payload`.
-- =============================================================================

BEGIN;

ALTER TABLE identity.email_tokens ADD COLUMN IF NOT EXISTS payload jsonb;

ALTER TABLE identity.email_tokens
  DROP CONSTRAINT email_tokens_purpose_check,
  ADD CONSTRAINT email_tokens_purpose_check CHECK (purpose IN ('verify_email', 'link_account'));

COMMIT;
