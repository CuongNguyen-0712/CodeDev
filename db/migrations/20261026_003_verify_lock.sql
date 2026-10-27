-- =============================================================================
-- 20261026_003_verify_lock.sql
--
-- docs/email-verification-plan.md section 12: an unverified email gets 7 days of normal use,
-- then the account is locked until the email is verified; a never-verified account is deleted
-- 14 days after sign-up (was 7, migrations 20261024_001 / 20261026_001).
--   1. identity.users.verify_lock_at: end of the grace period (NULL = never locked).
--      lock_reminded_at: the "verify by <lock date>" reminder went out (2 days before).
--      purge_after / purge_reminded_at keep their meaning (deletion and its reminder).
--   2. Trigger: an unverified sign-up locks at +168 hours and is deleted at +336 hours. Verifying
--      clears all four columns. Losing verification (email change of a verified account) locks
--      again at +168 hours but never makes the account deletable (11.2). Changing the email of a
--      never-verified account keeps its deadlines, so it cannot buy itself more time.
--   3. Accounts that exist today: never locked before now + 48 hours (time for the reminder),
--      and never deleted earlier than they would have been.
-- =============================================================================

BEGIN;

ALTER TABLE identity.users
  ADD COLUMN IF NOT EXISTS verify_lock_at timestamptz,
  ADD COLUMN IF NOT EXISTS lock_reminded_at timestamptz;

CREATE INDEX IF NOT EXISTS users_verify_lock_at_idx ON identity.users (verify_lock_at) WHERE verify_lock_at IS NOT NULL;

CREATE OR REPLACE FUNCTION identity.users_purge_after()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.email_verified IS TRUE THEN
      NEW.verify_lock_at := NULL;
      NEW.purge_after := NULL;
    ELSE
      NEW.verify_lock_at := now() + interval '168 hours';
      NEW.purge_after := now() + interval '336 hours';
    END IF;
  ELSIF NEW.email_verified IS TRUE THEN
    NEW.verify_lock_at := NULL;
    NEW.lock_reminded_at := NULL;
    NEW.purge_after := NULL;
    NEW.purge_reminded_at := NULL;
  ELSIF OLD.email_verified IS TRUE THEN
    NEW.verify_lock_at := now() + interval '168 hours';
    NEW.lock_reminded_at := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

-- Existing unverified accounts. created_at is a timestamp without time zone written by now().
WITH deadlines AS (
  SELECT id, greatest(COALESCE(created_at::timestamptz, now()) + interval '168 hours', now() + interval '48 hours') AS lock_at
  FROM identity.users
  WHERE email_verified IS NOT TRUE AND verify_lock_at IS NULL
)
UPDATE identity.users u
SET verify_lock_at = d.lock_at,
    -- greatest() skips NULL: an account that was verified once (purge_after NULL) stays undeletable.
    purge_after = CASE WHEN u.purge_after IS NULL THEN NULL ELSE greatest(u.purge_after, d.lock_at + interval '168 hours') END,
    -- A reminder sent for the old, earlier deletion date is sent again for the new one.
    purge_reminded_at = CASE WHEN u.purge_after IS NULL OR u.purge_after >= d.lock_at + interval '168 hours' THEN u.purge_reminded_at ELSE NULL END
FROM deadlines d
WHERE u.id = d.id;

COMMIT;
