-- =============================================================================
-- 20261016_001_auth_session_hardening.sql
--
-- Session / refresh-token hardening (expand phase, backwards compatible):
--   * identity.sessions: idle + absolute expiry, last seen / refreshed, revoke
--     reason, client IP. `expires_at` stays the absolute expiry.
--   * identity.refresh_tokens: issued / expires / consumed / revoked timestamps,
--     `replaced_by_id`, and the sealed idempotency-recovery result of a rotation.
--     The legacy columns rotated_at / rotated_to_token_id stay in sync.
--   * At most ONE current (unconsumed, unrevoked) refresh token per session,
--     enforced by a partial unique index.
--   * identity.auth_outbox: transactional outbox for cache invalidation events.
--
-- Compatibility:
--   * No active session is invalidated. Existing sessions get a fresh idle
--     window of 14 days (capped by their absolute expiry).
--   * Triggers fill / mirror the new columns, so code that still writes only the
--     legacy columns (create_session(), old rotation code during a rolling deploy)
--     keeps working and keeps the one-current-token invariant.
--   * Refresh-token hashes are unchanged (HMAC-SHA256), so issued tokens stay valid.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------- sessions

ALTER TABLE identity.sessions
    ADD COLUMN IF NOT EXISTS last_seen_at        timestamptz,
    ADD COLUMN IF NOT EXISTS last_refreshed_at   timestamptz,
    ADD COLUMN IF NOT EXISTS idle_expires_at     timestamptz,
    ADD COLUMN IF NOT EXISTS absolute_expires_at timestamptz,
    ADD COLUMN IF NOT EXISTS revoke_reason       varchar(50),
    ADD COLUMN IF NOT EXISTS ip_address          varchar(64);

UPDATE identity.sessions
SET absolute_expires_at = COALESCE(absolute_expires_at, expires_at),
    idle_expires_at     = COALESCE(idle_expires_at, LEAST(expires_at, now() + interval '14 days')),
    last_refreshed_at   = COALESCE(last_refreshed_at, updated_at),
    last_seen_at        = COALESCE(last_seen_at, updated_at),
    revoked_at          = CASE WHEN is_revoked IS TRUE AND revoked_at IS NULL THEN updated_at ELSE revoked_at END,
    revoke_reason       = CASE WHEN (is_revoked IS TRUE OR revoked_at IS NOT NULL) AND revoke_reason IS NULL THEN 'legacy' ELSE revoke_reason END;

CREATE OR REPLACE FUNCTION identity.sessions_sync_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    -- Absolute expiry and the legacy expires_at are the same value.
    NEW.absolute_expires_at := COALESCE(NEW.absolute_expires_at, NEW.expires_at);
    NEW.expires_at          := NEW.absolute_expires_at;
    NEW.idle_expires_at     := LEAST(COALESCE(NEW.idle_expires_at, now() + interval '14 days'), NEW.absolute_expires_at);
    NEW.last_seen_at        := COALESCE(NEW.last_seen_at, now());

    -- Revocation: is_revoked and revoked_at always agree.
    IF NEW.is_revoked IS TRUE AND NEW.revoked_at IS NULL THEN
        NEW.revoked_at := now();
    END IF;
    IF NEW.revoked_at IS NOT NULL THEN
        NEW.is_revoked := TRUE;
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sessions_sync_columns ON identity.sessions;
CREATE TRIGGER trg_sessions_sync_columns
    BEFORE INSERT OR UPDATE ON identity.sessions
    FOR EACH ROW EXECUTE FUNCTION identity.sessions_sync_columns();

ALTER TABLE identity.sessions
    ALTER COLUMN absolute_expires_at SET NOT NULL,
    ALTER COLUMN idle_expires_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_idle_expires_at ON identity.sessions (idle_expires_at);

-- ---------------------------------------------------------------- refresh tokens

ALTER TABLE identity.refresh_tokens
    ADD COLUMN IF NOT EXISTS issued_at           timestamptz,
    ADD COLUMN IF NOT EXISTS expires_at          timestamptz,
    ADD COLUMN IF NOT EXISTS consumed_at         timestamptz,
    ADD COLUMN IF NOT EXISTS revoked_at          timestamptz,
    ADD COLUMN IF NOT EXISTS replaced_by_id      bigint,
    ADD COLUMN IF NOT EXISTS recovery_key_hash   varchar(64),
    ADD COLUMN IF NOT EXISTS recovery_sealed     text,
    ADD COLUMN IF NOT EXISTS recovery_expires_at timestamptz;

UPDATE identity.refresh_tokens r
SET issued_at      = COALESCE(r.issued_at, r.created_at, now()),
    consumed_at    = COALESCE(r.consumed_at, r.rotated_at),
    replaced_by_id = COALESCE(r.replaced_by_id, r.rotated_to_token_id),
    expires_at     = COALESCE(r.expires_at, s.idle_expires_at)
FROM identity.sessions s
WHERE s.id = r.session_id;

-- Tokens of sessions that are already revoked can never be used again.
UPDATE identity.refresh_tokens r
SET revoked_at = COALESCE(s.revoked_at, now())
FROM identity.sessions s
WHERE s.id = r.session_id
  AND s.revoked_at IS NOT NULL
  AND r.revoked_at IS NULL
  AND r.consumed_at IS NULL;

-- Defensive: if a session somehow has several current tokens, keep the newest.
WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY issued_at DESC, id DESC) AS rn
    FROM identity.refresh_tokens
    WHERE consumed_at IS NULL AND revoked_at IS NULL
)
UPDATE identity.refresh_tokens r
SET revoked_at = now()
FROM ranked
WHERE ranked.id = r.id AND ranked.rn > 1;

CREATE OR REPLACE FUNCTION identity.refresh_tokens_sync_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.issued_at  := COALESCE(NEW.issued_at, NEW.created_at, now());
    NEW.created_at := COALESCE(NEW.created_at, NEW.issued_at);

    IF NEW.expires_at IS NULL THEN
        SELECT s.idle_expires_at INTO NEW.expires_at FROM identity.sessions s WHERE s.id = NEW.session_id;
    END IF;

    -- Legacy writers set rotated_*; new writers set consumed_at / replaced_by_id.
    NEW.consumed_at         := COALESCE(NEW.consumed_at, NEW.rotated_at);
    NEW.rotated_at          := COALESCE(NEW.rotated_at, NEW.consumed_at);
    NEW.replaced_by_id      := COALESCE(NEW.replaced_by_id, NEW.rotated_to_token_id);
    NEW.rotated_to_token_id := COALESCE(NEW.rotated_to_token_id, NEW.replaced_by_id);

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_refresh_tokens_sync_columns ON identity.refresh_tokens;
CREATE TRIGGER trg_refresh_tokens_sync_columns
    BEFORE INSERT OR UPDATE ON identity.refresh_tokens
    FOR EACH ROW EXECUTE FUNCTION identity.refresh_tokens_sync_columns();

ALTER TABLE identity.refresh_tokens
    ALTER COLUMN issued_at SET DEFAULT now(),
    ALTER COLUMN issued_at SET NOT NULL,
    ALTER COLUMN expires_at SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_refresh_tokens_replaced_by') THEN
        ALTER TABLE identity.refresh_tokens
            ADD CONSTRAINT fk_refresh_tokens_replaced_by
            FOREIGN KEY (replaced_by_id) REFERENCES identity.refresh_tokens(id) ON DELETE SET NULL
            -- Checked at commit: the old token is consumed (and linked) before its replacement is
            -- inserted, because the one-current-token index forbids the reverse order.
            DEFERRABLE INITIALLY DEFERRED;
    END IF;
END;
$$;

-- One current refresh token per session.
CREATE UNIQUE INDEX IF NOT EXISTS uq_refresh_tokens_one_current_per_session
    ON identity.refresh_tokens (session_id)
    WHERE consumed_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_recovery_expires
    ON identity.refresh_tokens (recovery_expires_at)
    WHERE recovery_expires_at IS NOT NULL;

-- ---------------------------------------------------------------- outbox

CREATE TABLE IF NOT EXISTS identity.auth_outbox (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_type   varchar(50) NOT NULL,
    payload      jsonb NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    available_at timestamptz NOT NULL DEFAULT now(),
    attempts     int NOT NULL DEFAULT 0,
    last_error   text,
    processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_auth_outbox_pending
    ON identity.auth_outbox (available_at, id)
    WHERE processed_at IS NULL;

COMMIT;
