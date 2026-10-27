-- =============================================================================
-- 20261026_001_purge_after_fixed_hours.sql
--
-- The never-verified account deadline (20261024_001) is 168 hours after sign-up, not 7 calendar
-- days. `now() + interval '7 days'` is calendar arithmetic in the session time zone, so across a
-- daylight-saving change it gives 167 or 169 hours (seen locally on PostgreSQL set to
-- America/Los_Angeles). Production runs in UTC, so its deadlines are unchanged; existing rows stay
-- as they are.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION identity.users_purge_after()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.purge_after := CASE WHEN NEW.email_verified IS TRUE THEN NULL ELSE now() + interval '168 hours' END;
  ELSIF NEW.email_verified IS TRUE THEN
    NEW.purge_after := NULL;
    NEW.purge_reminded_at := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

COMMIT;
