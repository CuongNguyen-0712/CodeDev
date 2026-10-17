-- =============================================================================
-- 20261017_002_sync_auth_with_provider.sql
--
-- Brings public.auth_with_provider in production to the definition used locally (the same
-- logic, with the step comments added during the schema reorganisation). Found by
-- db/tools/compare-schema.mjs. No behaviour change.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.auth_with_provider(_id bigint, _public_id character varying, _username character varying, _email text, _image text, _provider character varying, _provideraccountid character varying)
 RETURNS TABLE(id character varying, username character varying, email character varying, image text, provider character varying, role character varying)
 LANGUAGE plpgsql
AS $function$
DECLARE
  _user_id bigint;
BEGIN
  -- 1. Account already linked to this provider?
  SELECT a.user_id INTO _user_id
  FROM identity.accounts a
  WHERE a.provider = _provider::provider_enum
    AND a.provider_account_id = _providerAccountId
  LIMIT 1;

  -- 2. Otherwise link to an existing user with the same email.
  IF _user_id IS NULL AND _email IS NOT NULL THEN
    SELECT u.id INTO _user_id
    FROM identity.users u
    WHERE u.email = _email
    LIMIT 1;

    IF _user_id IS NOT NULL THEN
      INSERT INTO identity.accounts(user_id, provider, provider_account_id)
      SELECT _user_id, _provider::provider_enum, _providerAccountId
      WHERE NOT EXISTS (
        SELECT 1 FROM identity.accounts
        WHERE user_id = _user_id
          AND provider = _provider::provider_enum
          AND provider_account_id = _providerAccountId
      );

      IF _image IS NOT NULL THEN
        UPDATE profile.info
        SET image = _image
        WHERE user_id = _user_id AND (image IS NULL OR image = '');
      END IF;
    END IF;
  END IF;

  -- 3. Create a new user.
  IF _user_id IS NULL THEN
    INSERT INTO identity.users(id, public_id, email, username)
    VALUES (_id, _public_id, _email, _username);

    INSERT INTO profile.info(user_id, surname, name, image)
    VALUES (_id, _username, _username, _image);

    INSERT INTO identity.accounts(user_id, provider, provider_account_id)
    VALUES (_id, _provider::provider_enum, _providerAccountId);

    INSERT INTO identity.user_roles(user_id, role_id)
    VALUES (_id, public.default_role_id());

    _user_id := _id;
  END IF;

  RETURN QUERY
  SELECT
    u.public_id AS id,
    u.username,
    u.email,
    i.image,
    a.provider::varchar,
    COALESCE(r.code, 'user')::varchar AS role
  FROM identity.users u
  JOIN identity.accounts a ON u.id = a.user_id AND a.provider = _provider::provider_enum
  LEFT JOIN profile.info i ON u.id = i.user_id
  LEFT JOIN identity.user_roles ur ON u.id = ur.user_id
  LEFT JOIN identity.roles r ON r.id = ur.role_id
  WHERE u.id = _user_id
  LIMIT 1;
END;
$function$;

COMMIT;
