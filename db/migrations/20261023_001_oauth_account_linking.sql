-- =============================================================================
-- 20261023_001_oauth_account_linking.sql
--
-- OAuth hotfix (docs/email-verification-plan.md, section 10):
--   - emails are compared in lower case (unique index on lower(email));
--   - identity.accounts.provider_email: the verified email the provider reported when linking;
--   - users with a GitHub / Google account count as email-verified (backfill);
--   - public.sign_in_with_provider replaces auth_with_provider: it links a provider to an
--     existing user only when that user's email is verified, and returns the decision instead of
--     always linking ('login' | 'created' | 'linked' | 'link_required' | 'blocked');
--   - public.link_provider_account: explicit link after the user proved the account is theirs;
--   - log_in only returns active users.
--
-- Additive: auth_with_provider(7) is kept for the app version still running during the deploy
-- and is dropped by a later migration.
-- =============================================================================

BEGIN;

-- 1. Email in lower case, unique without regard to case.
UPDATE identity.users SET email = lower(trim(email)) WHERE email <> lower(trim(email));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uq ON identity.users (lower(email));

-- 2. Email reported by the provider when the account was linked.
ALTER TABLE identity.accounts ADD COLUMN IF NOT EXISTS provider_email varchar(255);

-- 3. A GitHub / Google account proves the email (checked before this migration: no account was
--    linked to an existing password user by email).
UPDATE identity.users u SET email_verified = true
WHERE u.email_verified IS NOT TRUE
  AND EXISTS (SELECT 1 FROM identity.accounts a WHERE a.user_id = u.id AND a.provider IN ('google', 'github'));

-- 4. OAuth sign-in decision. _email is the provider's verified email, already in lower case.
CREATE OR REPLACE FUNCTION public.sign_in_with_provider(
  _id bigint, _public_id character varying, _username character varying, _email text,
  _image text, _provider character varying, _provider_account_id character varying,
  _surname character varying, _name character varying)
 RETURNS TABLE(result character varying, id character varying, username character varying, email character varying,
               image text, provider character varying, role character varying)
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
    -- 2. Existing user with the same email: link only when that email was verified.
    SELECT u.id INTO _user_id FROM identity.users u WHERE lower(u.email) = _email LIMIT 1;

    IF _user_id IS NOT NULL THEN
      SELECT u.email_verified INTO _verified FROM identity.users u WHERE u.id = _user_id;
      IF COALESCE(_verified, false) THEN
        _result := 'linked';
      ELSE
        _result := 'link_required';
      END IF;
    END IF;
  END IF;

  IF _user_id IS NOT NULL THEN
    SELECT u.status INTO _status FROM identity.users u WHERE u.id = _user_id;
    IF _status <> 'active' THEN
      _result := 'blocked';
    END IF;
  END IF;

  IF _result = 'linked' THEN
    INSERT INTO identity.accounts (user_id, provider, provider_account_id, provider_email)
    VALUES (_user_id, _provider::provider_enum, _provider_account_id, _email);

    IF _image IS NOT NULL THEN
      UPDATE profile.info SET image = _image
      WHERE user_id = _user_id AND (image IS NULL OR image = '');
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

-- 5. Explicit link (after a password sign-in, an email confirmation, or from Settings).
--    The user's email counts as verified when the provider reported the same verified email.
CREATE OR REPLACE FUNCTION public.link_provider_account(
  _user_public_id character varying, _provider character varying,
  _provider_account_id character varying, _provider_email text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  _user_id bigint;
  _owner_id bigint;
BEGIN
  SELECT u.id INTO _user_id FROM identity.users u WHERE u.public_id = _user_public_id AND u.status = 'active';
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'CD404';
  END IF;

  SELECT a.user_id INTO _owner_id
  FROM identity.accounts a
  WHERE a.provider = _provider::provider_enum AND a.provider_account_id = _provider_account_id;

  IF _owner_id IS NOT NULL AND _owner_id <> _user_id THEN
    RAISE EXCEPTION 'This account is already linked to another CodeDev account.' USING ERRCODE = 'CD409';
  END IF;

  IF _owner_id IS NULL THEN
    INSERT INTO identity.accounts (user_id, provider, provider_account_id, provider_email)
    VALUES (_user_id, _provider::provider_enum, _provider_account_id, lower(_provider_email));
  END IF;

  UPDATE identity.users SET email_verified = true, updated_at = now()
  WHERE id = _user_id AND email_verified IS NOT TRUE AND email = lower(_provider_email);
END;
$function$;

-- 6. Only active users sign in with a password.
CREATE OR REPLACE FUNCTION public.log_in(_username character varying)
 RETURNS TABLE(id character varying, username character varying, password text, email character varying, image text, role character varying)
 LANGUAGE sql
AS $function$
    SELECT
        u.public_id AS id,
        u.username,
        a.password_hash AS password,
        u.email,
        i.image AS image,
        COALESCE(r.code, 'user')::varchar AS role
    FROM identity.users u
    JOIN identity.accounts a ON a.user_id = u.id AND a.provider = 'credentials'::provider_enum
    LEFT JOIN profile.info i ON i.user_id = u.id
    LEFT JOIN identity.user_roles ur ON ur.user_id = u.id
    LEFT JOIN identity.roles r ON r.id = ur.role_id
    WHERE u.username = _username
      AND u.status = 'active'
    LIMIT 1;
$function$;

COMMIT;
