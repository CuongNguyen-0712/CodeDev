-- =============================================================================
-- 20261024_001_account_claim_and_purge.sql
--
-- docs/email-verification-plan.md section 11.
--   1. identity.users.purge_after: when a never-verified account is deleted (11.2). Set on
--      insert of an unverified user (now + 7 days), cleared for good once the email is verified.
--      An email change later (verified -> unverified) never sets it again.
--      purge_reminded_at: the "verify or the account is deleted" reminder went out.
--   2. Grace for the accounts that exist today: 7 days from this migration, not from sign-up.
--   3. sign_in_with_provider no longer links by email by itself. An existing user with the
--      provider's email returns 'link_required' (email unverified: claim with a new password,
--      11.1) or 'confirm_required' (email verified: confirm the link by email, 11.3 option B).
--      The return type is unchanged, so the running app version keeps working during the deploy.
-- =============================================================================

BEGIN;

ALTER TABLE identity.users
  ADD COLUMN IF NOT EXISTS purge_after timestamptz,
  ADD COLUMN IF NOT EXISTS purge_reminded_at timestamptz;

UPDATE identity.users SET purge_after = now() + interval '7 days'
WHERE email_verified IS NOT TRUE AND purge_after IS NULL;

CREATE INDEX IF NOT EXISTS users_purge_after_idx ON identity.users (purge_after) WHERE purge_after IS NOT NULL;

CREATE OR REPLACE FUNCTION identity.users_purge_after()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.purge_after := CASE WHEN NEW.email_verified IS TRUE THEN NULL ELSE now() + interval '7 days' END;
  ELSIF NEW.email_verified IS TRUE THEN
    NEW.purge_after := NULL;
    NEW.purge_reminded_at := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_users_purge_after ON identity.users;
CREATE TRIGGER trg_users_purge_after
  BEFORE INSERT OR UPDATE OF email_verified ON identity.users
  FOR EACH ROW EXECUTE FUNCTION identity.users_purge_after();

CREATE OR REPLACE FUNCTION public.sign_in_with_provider(_id bigint, _public_id character varying, _username character varying, _email text, _image text, _provider character varying, _provider_account_id character varying, _surname character varying, _name character varying)
 RETURNS TABLE(result character varying, id character varying, username character varying, email character varying, image text, provider character varying, role character varying)
 LANGUAGE plpgsql
AS $function$
DECLARE
  _user_id bigint;
  _status public.user_status_enum;
  _verified boolean;
  _result varchar;
  _candidate varchar := _username;
  _attempt int := 0;
BEGIN
  -- 1. Account already linked to this provider.
  SELECT a.user_id INTO _user_id
  FROM identity.accounts a
  WHERE a.provider = _provider::provider_enum AND a.provider_account_id = _provider_account_id
  LIMIT 1;

  IF _user_id IS NOT NULL THEN
    _result := 'login';
  ELSE
    -- 2. Existing user with the same email: never linked here, the owner confirms by email.
    SELECT u.id, u.email_verified INTO _user_id, _verified FROM identity.users u WHERE lower(u.email) = _email LIMIT 1;

    IF _user_id IS NOT NULL THEN
      _result := CASE WHEN COALESCE(_verified, false) THEN 'confirm_required' ELSE 'link_required' END;
    END IF;
  END IF;

  IF _user_id IS NOT NULL THEN
    SELECT u.status INTO _status FROM identity.users u WHERE u.id = _user_id;
    IF _status <> 'active' THEN
      _result := 'blocked';
    END IF;
  END IF;

  -- 3. New user. The username gets a numeric suffix while it is taken.
  IF _user_id IS NULL THEN
    WHILE EXISTS (SELECT 1 FROM identity.users u WHERE u.username = _candidate) LOOP
      _attempt := _attempt + 1;
      IF _attempt > 5 THEN
        RAISE EXCEPTION 'Could not pick a free username for %', _username USING ERRCODE = 'P0001';
      END IF;
      _candidate := left(_username, 25) || '_' || lpad(floor(random() * 10000)::int::text, 4, '0');
    END LOOP;

    INSERT INTO identity.users (id, public_id, email, username, email_verified)
    VALUES (_id, _public_id, _email, _candidate, true);

    INSERT INTO profile.info (user_id, surname, name, image)
    VALUES (_id, _surname, _name, _image);

    INSERT INTO identity.accounts (user_id, provider, provider_account_id, provider_email)
    VALUES (_id, _provider::provider_enum, _provider_account_id, _email);

    INSERT INTO identity.user_roles (user_id, role_id)
    VALUES (_id, public.default_role_id());

    _user_id := _id;
    _result := 'created';
  END IF;

  RETURN QUERY
  SELECT
    _result,
    u.public_id AS id,
    u.username,
    u.email,
    i.image,
    _provider,
    COALESCE(r.code, 'user')::varchar AS role
  FROM identity.users u
  LEFT JOIN profile.info i ON u.id = i.user_id
  LEFT JOIN identity.user_roles ur ON u.id = ur.user_id
  LEFT JOIN identity.roles r ON r.id = ur.role_id
  WHERE u.id = _user_id
  LIMIT 1;
END;
$function$;

COMMIT;
