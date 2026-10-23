-- =============================================================================
-- db/schema.sql: full schema baseline + reference data (generated with pg_dump 18 from the local
-- database on 2026-10-23, every migration up to 20261023_002 applied).
--
-- Replaces the migration files up to 20261019_001 (applied on local and production, removed
-- from db/migrations; git history keeps them). New database:
--   createdb codedev && psql -d codedev -v ON_ERROR_STOP=1 -f db/schema.sql
--   npm run db:migrate      # applies migrations newer than the baseline
-- Then the seeds in db/seeds (roadmaps.sql, one file per course).
-- Regenerate only when squashing again; day-to-day changes stay in db/migrations.
-- =============================================================================

--
-- PostgreSQL database dump
--

\restrict 18jVXSQ0kKqkNu48GgN1d07PS3v2fGUUdbdZnicOSlM5es30RFyZkYzEMJFWpgU

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: catalog; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA catalog;


--
-- Name: SCHEMA catalog; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA catalog IS 'Course catalog: courses, categories, languages';


--
-- Name: challenge; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA challenge;


--
-- Name: SCHEMA challenge; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA challenge IS 'Lesson challenges: quizzes and coding exercises';


--
-- Name: commerce; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA commerce;


--
-- Name: SCHEMA commerce; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA commerce IS 'Cart and orders';


--
-- Name: community; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA community;


--
-- Name: SCHEMA community; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA community IS 'Comments, votes, events, feedback, teams, friendships, messages';


--
-- Name: course; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA course;


--
-- Name: SCHEMA course; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA course IS 'Course content structure: modules, lessons';


--
-- Name: identity; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA identity;


--
-- Name: SCHEMA identity; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA identity IS 'Authentication & authorization: users, accounts, sessions, RBAC';


--
-- Name: learning; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA learning;


--
-- Name: SCHEMA learning; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA learning IS 'Learner state: enrollments, lesson progress, favorites, recovery';


--
-- Name: profile; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA profile;


--
-- Name: SCHEMA profile; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA profile IS 'Per-user data: profile info, points ledger, notifications, tasks';


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: roadmap; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA roadmap;


--
-- Name: SCHEMA roadmap; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA roadmap IS 'Learning roadmaps and per-user roadmap progress';


--
-- Name: storage; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA storage;


--
-- Name: SCHEMA storage; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA storage IS 'Stored file metadata (S3 / Cloudinary assets)';


--
-- Name: difficulty_question; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.difficulty_question AS ENUM (
    'easy',
    'medium',
    'hard'
);


--
-- Name: join_team_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.join_team_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'left',
    'kicked'
);


--
-- Name: level_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.level_enum AS ENUM (
    'beginner',
    'intermediate',
    'advanced',
    'expert',
    'master'
);


--
-- Name: order_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_status AS ENUM (
    'pending',
    'completed',
    'cancelled',
    'refunded',
    'failed',
    'expired'
);


--
-- Name: payment_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_method AS ENUM (
    'banking',
    'master_card',
    'points',
    'gateway'
);


--
-- Name: provider_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.provider_enum AS ENUM (
    'credentials',
    'github',
    'google'
);


--
-- Name: question_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.question_type AS ENUM (
    'single_choice',
    'multiple_choice',
    'text',
    'code'
);


--
-- Name: status_challenge; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.status_challenge AS ENUM (
    'coming_soon',
    'closed',
    'open'
);


--
-- Name: status_course_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.status_course_enum AS ENUM (
    'enrolled',
    'in_progress',
    'paused',
    'completed',
    'cancelled'
);


--
-- Name: status_friend_request_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.status_friend_request_enum AS ENUM (
    'pending',
    'accepted',
    'rejected',
    'cancelled'
);


--
-- Name: status_progress_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.status_progress_enum AS ENUM (
    'enrolled',
    'in_progress',
    'completed'
);


--
-- Name: task_priority_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.task_priority_enum AS ENUM (
    'high',
    'medium',
    'low',
    'critical'
);


--
-- Name: task_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.task_status_enum AS ENUM (
    'todo',
    'in_progress',
    'cancelled',
    'archived',
    'completed'
);


--
-- Name: user_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_status_enum AS ENUM (
    'active',
    'inactive',
    'blocked'
);


--
-- Name: voting_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.voting_enum AS ENUM (
    'upvote',
    'downvote'
);


--
-- Name: course_publish_sync(); Type: FUNCTION; Schema: catalog; Owner: -
--

CREATE FUNCTION catalog.course_publish_sync() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.publish_status IS NULL THEN
            NEW.publish_status := CASE
                WHEN COALESCE(NEW.is_deleted, false) THEN 'archived'
                WHEN COALESCE(NEW.is_hidden, false)  THEN 'unpublished'
                ELSE 'published'
            END;
        END IF;
    ELSIF NEW.publish_status IS NOT DISTINCT FROM OLD.publish_status THEN
        IF NEW.is_deleted IS DISTINCT FROM OLD.is_deleted AND COALESCE(NEW.is_deleted, false) THEN
            NEW.publish_status := 'archived';
        ELSIF NEW.is_hidden IS DISTINCT FROM OLD.is_hidden THEN
            NEW.publish_status := CASE WHEN COALESCE(NEW.is_hidden, false) THEN 'unpublished' ELSE 'published' END;
        END IF;
    END IF;

    NEW.is_hidden := NEW.publish_status <> 'published';
    IF NEW.publish_status = 'published' AND NEW.published_at IS NULL THEN
        NEW.published_at := now();
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: audit_log_append_only(); Type: FUNCTION; Schema: identity; Owner: -
--

CREATE FUNCTION identity.audit_log_append_only() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- actor_id is nulled by ON DELETE SET NULL when the admin account is deleted; nothing else may change.
    IF TG_OP = 'UPDATE' AND NEW.actor_id IS NULL AND OLD.actor_id IS NOT NULL
       AND (NEW.action, NEW.target_type, NEW.target_id, NEW.created_at) = (OLD.action, OLD.target_type, OLD.target_id, OLD.created_at) THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'CD400', MESSAGE = 'Audit log entries are append-only';
END;
$$;


--
-- Name: refresh_tokens_sync_columns(); Type: FUNCTION; Schema: identity; Owner: -
--

CREATE FUNCTION identity.refresh_tokens_sync_columns() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: sessions_sync_columns(); Type: FUNCTION; Schema: identity; Owner: -
--

CREATE FUNCTION identity.sessions_sync_columns() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: create_onboarding_row(); Type: FUNCTION; Schema: profile; Owner: -
--

CREATE FUNCTION profile.create_onboarding_row() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO profile.onboarding (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$;


--
-- Name: point_transaction_append_only(); Type: FUNCTION; Schema: profile; Owner: -
--

CREATE FUNCTION profile.point_transaction_append_only() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM identity.users WHERE id = OLD.user_id) THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'CD400', MESSAGE = 'Point transactions are append-only';
END;
$$;


--
-- Name: point_transaction_defaults(); Type: FUNCTION; Schema: profile; Owner: -
--

CREATE FUNCTION profile.point_transaction_defaults() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.entry_type IS NULL THEN
        NEW.entry_type := CASE WHEN NEW.action = 'credit' THEN 'earned' ELSE 'spent' END;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: apply_payment_event(character varying, character varying, character varying, character varying, character varying, bigint, character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_payment_event(_provider character varying, _event_id character varying, _event_type character varying, _provider_ref character varying, _payment_public_id character varying, _amount_minor bigint, _currency character varying, _payload_sha256 character varying) RETURNS TABLE(result character varying, order_id character varying, user_id character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_event_id bigint;
    v_payment record;
    v_order record;
    v_result varchar;
    v_granted bigint;
BEGIN
    INSERT INTO commerce.payment_event (provider, event_id, event_type, provider_ref, payload_sha256)
    VALUES (_provider, _event_id, _event_type, _provider_ref, _payload_sha256)
    ON CONFLICT (provider, event_id) DO NOTHING
    RETURNING id INTO v_event_id;

    IF v_event_id IS NULL THEN
        RETURN QUERY SELECT 'duplicate'::varchar, NULL::varchar, NULL::varchar;
        RETURN;
    END IF;

    SELECT p.* INTO v_payment
    FROM commerce.payment p
    WHERE p.provider = _provider
      AND ((_provider_ref IS NOT NULL AND p.provider_ref = _provider_ref)
        OR (_payment_public_id IS NOT NULL AND p.public_id = _payment_public_id))
    ORDER BY (p.provider_ref = _provider_ref) DESC NULLS LAST
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        UPDATE commerce.payment_event SET result = 'unknown_payment', processed_at = now() WHERE id = v_event_id;
        RETURN QUERY SELECT 'unknown_payment'::varchar, NULL::varchar, NULL::varchar;
        RETURN;
    END IF;

    SELECT o.*, u.public_id AS user_public_id INTO v_order
    FROM commerce.orders o
    JOIN identity.users u ON u.id = o.user_id
    WHERE o.id = v_payment.order_id
    FOR UPDATE OF o;

    IF v_payment.provider_ref IS NULL AND _provider_ref IS NOT NULL THEN
        UPDATE commerce.payment SET provider_ref = _provider_ref, updated_at = now() WHERE id = v_payment.id;
    END IF;

    IF _event_type = 'payment.succeeded' THEN
        IF _amount_minor IS DISTINCT FROM v_payment.amount_minor OR upper(_currency) IS DISTINCT FROM v_payment.currency THEN
            UPDATE commerce.payment SET failure_code = 'amount_mismatch', updated_at = now() WHERE id = v_payment.id;
            v_result := 'amount_mismatch';
        ELSIF v_payment.status IN ('refunded', 'disputed') OR v_order.status = 'refunded' THEN
            v_result := 'ignored_refunded';
        ELSE
            UPDATE commerce.payment
            SET status = 'succeeded', succeeded_at = COALESCE(succeeded_at, now()), failure_code = NULL, updated_at = now()
            WHERE id = v_payment.id;

            UPDATE commerce.orders
            SET status = 'completed', paid_at = COALESCE(paid_at, now()), updated_at = now()
            WHERE id = v_order.id;

            UPDATE commerce.entitlement e SET status = 'expired'
            WHERE e.user_id = v_order.user_id AND e.status = 'active' AND e.expires_at <= now()
              AND e.course_id IN (SELECT oi.course_id FROM commerce.order_items oi WHERE oi.order_id = v_order.id);

            WITH ins AS (
                INSERT INTO commerce.entitlement (public_id, user_id, course_id, source, order_id)
                SELECT 'ent_' || replace(gen_random_uuid()::text, '-', ''), v_order.user_id, oi.course_id, 'purchase', v_order.id
                FROM commerce.order_items oi
                WHERE oi.order_id = v_order.id
                ON CONFLICT DO NOTHING
                RETURNING 1
            )
            SELECT COUNT(*) INTO v_granted FROM ins;

            IF v_granted > 0 THEN
                v_result := 'granted';
            ELSIF EXISTS (SELECT 1 FROM commerce.entitlement e WHERE e.order_id = v_order.id) THEN
                v_result := 'already_applied';
            ELSE
                -- Paid, but the course is already owned through another source: needs a refund.
                v_result := 'already_owned';
                UPDATE commerce.orders SET failure_reason = 'already_owned_refund_required', updated_at = now()
                WHERE id = v_order.id;
            END IF;
        END IF;

    ELSIF _event_type IN ('payment.failed', 'payment.cancelled') THEN
        IF v_payment.status = 'pending' THEN
            UPDATE commerce.payment
            SET status = CASE WHEN _event_type = 'payment.failed' THEN 'failed' ELSE 'cancelled' END, updated_at = now()
            WHERE id = v_payment.id;
            UPDATE commerce.orders
            SET status = CASE WHEN _event_type = 'payment.failed' THEN 'failed'::order_status ELSE 'cancelled'::order_status END,
                failed_at = CASE WHEN _event_type = 'payment.failed' THEN now() END,
                cancelled_at = CASE WHEN _event_type = 'payment.cancelled' THEN now() END,
                updated_at = now()
            WHERE id = v_order.id AND status IN ('pending', 'expired');
            v_result := 'closed';
        ELSE
            v_result := 'ignored_out_of_order';
        END IF;

    ELSIF _event_type IN ('payment.refunded', 'payment.disputed') THEN
        IF v_payment.status IN ('succeeded', 'disputed') THEN
            UPDATE commerce.payment
            SET status = CASE WHEN _event_type = 'payment.refunded' THEN 'refunded' ELSE 'disputed' END,
                refunded_at = CASE WHEN _event_type = 'payment.refunded' THEN now() ELSE refunded_at END,
                updated_at = now()
            WHERE id = v_payment.id;
            IF _event_type = 'payment.refunded' THEN
                UPDATE commerce.orders SET status = 'refunded', refunded_at = now(), updated_at = now() WHERE id = v_order.id;
            END IF;
            UPDATE commerce.entitlement e
            SET status = 'revoked', revoked_at = now(),
                revoke_reason = CASE WHEN _event_type = 'payment.refunded' THEN 'refund' ELSE 'dispute' END
            WHERE e.order_id = v_order.id AND e.status = 'active';
            v_result := 'revoked';
        ELSE
            v_result := 'ignored_out_of_order';
        END IF;

    ELSE
        v_result := 'ignored_type';
    END IF;

    UPDATE commerce.payment_event
    SET result = v_result, payment_id = v_payment.id, processed_at = now()
    WHERE id = v_event_id;

    RETURN QUERY SELECT v_result, v_order.public_id::varchar, v_order.user_public_id::varchar;
END;
$$;


--
-- Name: assert_lesson_access(bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assert_lesson_access(_user_id bigint, _lesson_id bigint) RETURNS bigint
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_course_id bigint;
BEGIN
    SELECT m.course_id INTO v_course_id
    FROM course.lesson l
    JOIN course.module m ON m.id = l.module_id
    WHERE l.id = _lesson_id;

    IF v_course_id IS NULL
       OR NOT public.has_course_access(_user_id, v_course_id)
       OR NOT EXISTS (
           SELECT 1 FROM learning.register r
           WHERE r.user_id = _user_id AND r.course_id = v_course_id AND r.is_deleted = false
       ) THEN
        RAISE EXCEPTION USING ERRCODE = 'CD403', MESSAGE = 'You do not have access to this lesson';
    END IF;

    RETURN v_course_id;
END;
$$;


--
-- Name: auth_with_provider(bigint, character varying, character varying, text, text, character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auth_with_provider(_id bigint, _public_id character varying, _username character varying, _email text, _image text, _provider character varying, _provideraccountid character varying) RETURNS TABLE(id character varying, username character varying, email character varying, image text, provider character varying, role character varying)
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: award_challenge_exp(bigint, bigint, numeric, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.award_challenge_exp(_user_id bigint, _challenge_id bigint, _multiplier numeric DEFAULT 1, _metadata jsonb DEFAULT NULL::jsonb) RETURNS TABLE(created boolean, awarded integer, exp_after bigint, previous_level integer, new_level integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_rule varchar;
BEGIN
    SELECT CASE WHEN ch.type = 'quiz' THEN 'quiz.' || ch.difficulty
                ELSE 'coding.' || ch.type || '.' || ch.difficulty END
    INTO v_rule
    FROM challenge.challenges ch
    WHERE ch.id = _challenge_id;

    RETURN QUERY SELECT * FROM public.award_exp(_user_id, v_rule, 'challenge', _challenge_id, _multiplier, _metadata);
END;
$$;


--
-- Name: award_exp(bigint, character varying, character varying, bigint, numeric, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.award_exp(_user_id bigint, _rule_key character varying, _source_type character varying, _source_id bigint, _multiplier numeric DEFAULT 1, _metadata jsonb DEFAULT NULL::jsonb) RETURNS TABLE(created boolean, awarded integer, exp_after bigint, previous_level integer, new_level integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_amount int;
BEGIN
    SELECT CEIL(r.amount * GREATEST(_multiplier, 0))::int INTO v_amount
    FROM profile.exp_rule r
    WHERE r.rule_key = _rule_key AND r.is_active;

    IF v_amount IS NULL OR v_amount <= 0 THEN
        RETURN QUERY
        SELECT false, 0, i.exp, i.exp_level, i.exp_level FROM profile.info i WHERE i.user_id = _user_id;
        RETURN;
    END IF;

    RETURN QUERY SELECT * FROM public.post_exp(_user_id, v_amount, _source_type, _source_id, _rule_key, NULL, NULL, NULL, _metadata);
END;
$$;


--
-- Name: create_money_order(character varying, character varying, character varying, character varying, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_money_order(_user_public_id character varying, _course_public_id character varying, _idempotency_key character varying, _provider character varying, _ttl_minutes integer DEFAULT 30) RETURNS TABLE(order_id character varying, payment_id character varying, amount_minor bigint, currency character, checkout_url text, provider_ref character varying, reused boolean)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_user bigint;
    v_course record;
    v_offer record;
    v_prior record;
    v_order_id bigint;
    v_order_public varchar;
    v_payment_public varchar;
BEGIN
    IF _idempotency_key IS NULL OR length(_idempotency_key) < 8 OR length(_idempotency_key) > 100 THEN
        RAISE EXCEPTION USING ERRCODE = 'CD400', MESSAGE = 'Invalid idempotency key';
    END IF;

    SELECT u.id INTO v_user FROM identity.users u WHERE u.public_id = _user_public_id;
    IF v_user IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'CD404', MESSAGE = 'User not found';
    END IF;

    PERFORM 1 FROM profile.info i WHERE i.user_id = v_user FOR UPDATE;

    SELECT c.id, c.public_id, c.publish_status, c.is_deleted, c.access_model INTO v_course
    FROM catalog.course c WHERE c.public_id = _course_public_id;

    IF NOT FOUND OR v_course.is_deleted OR v_course.publish_status <> 'published' THEN
        RAISE EXCEPTION USING ERRCODE = 'CD404', MESSAGE = 'This course is not available';
    END IF;

    -- Replay of the same request, or another click while an order for this course is still open.
    SELECT o.public_id AS order_public, o.payment_method::text AS method,
           oi.course_id, p.public_id AS payment_public, o.amount_minor, o.currency, p.checkout_url, p.provider_ref,
           (o.idempotency_key = _idempotency_key) AS same_key
    INTO v_prior
    FROM commerce.orders o
    JOIN commerce.order_items oi ON oi.order_id = o.id
    LEFT JOIN commerce.payment p ON p.order_id = o.id AND p.provider = _provider
    WHERE o.user_id = v_user
      AND (
            o.idempotency_key = _idempotency_key
         OR (oi.course_id = v_course.id AND o.status = 'pending' AND o.expires_at > now())
      )
    ORDER BY (o.idempotency_key = _idempotency_key) DESC NULLS LAST, o.created_at DESC
    LIMIT 1;

    IF FOUND THEN
        IF v_prior.course_id <> v_course.id OR v_prior.method <> 'gateway' THEN
            RAISE EXCEPTION USING ERRCODE = 'CD422', MESSAGE = 'This request key was already used for another order';
        END IF;
        IF v_prior.payment_public IS NOT NULL THEN
            RETURN QUERY SELECT v_prior.order_public::varchar, v_prior.payment_public::varchar, v_prior.amount_minor,
                                v_prior.currency, v_prior.checkout_url, v_prior.provider_ref::varchar, true;
            RETURN;
        END IF;
    END IF;

    IF EXISTS (
        SELECT 1 FROM commerce.entitlement e
        WHERE e.user_id = v_user AND e.course_id = v_course.id AND e.status = 'active'
          AND (e.expires_at IS NULL OR e.expires_at > now())
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'CD409', MESSAGE = 'You already own this course';
    END IF;

    SELECT ofr.id, ofr.amount, ofr.currency INTO v_offer
    FROM commerce.offer ofr
    WHERE ofr.course_id = v_course.id AND ofr.price_type = 'money' AND ofr.is_active;

    IF NOT FOUND OR v_course.access_model <> 'premium' THEN
        RAISE EXCEPTION USING ERRCODE = 'CD410', MESSAGE = 'This course cannot be bought';
    END IF;

    UPDATE commerce.orders o
    SET status = 'expired', updated_at = now()
    WHERE o.user_id = v_user AND o.status = 'pending' AND o.expires_at <= now();

    INSERT INTO commerce.orders
        (public_id, user_id, status, payment_method, total, currency, amount_minor, idempotency_key, expires_at, updated_at)
    VALUES (
        'ord_' || replace(gen_random_uuid()::text, '-', ''), v_user, 'pending', 'gateway',
        v_offer.amount::numeric / CASE WHEN v_offer.currency IN ('VND', 'JPY', 'KRW') THEN 1 ELSE 100 END,
        v_offer.currency, v_offer.amount, _idempotency_key,
        now() + make_interval(mins => GREATEST(_ttl_minutes, 5)), now()
    )
    RETURNING id, public_id INTO v_order_id, v_order_public;

    INSERT INTO commerce.order_items (order_id, course_id, price, offer_id, amount_minor)
    VALUES (v_order_id, v_course.id,
            v_offer.amount::numeric / CASE WHEN v_offer.currency IN ('VND', 'JPY', 'KRW') THEN 1 ELSE 100 END,
            v_offer.id, v_offer.amount);

    INSERT INTO commerce.payment (public_id, order_id, provider, amount_minor, currency)
    VALUES ('pay_' || replace(gen_random_uuid()::text, '-', ''), v_order_id, _provider, v_offer.amount, v_offer.currency)
    RETURNING public_id INTO v_payment_public;

    RETURN QUERY SELECT v_order_public, v_payment_public, v_offer.amount, v_offer.currency::char(3), NULL::text, NULL::varchar, false;
END;
$$;


--
-- Name: create_session(bigint, bigint, character varying, character varying, timestamp with time zone, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_session(_session_id bigint, _token_id bigint, _user_id character varying, _refresh_token_hash character varying, _expires_at timestamp with time zone, _user_agent character varying) RETURNS TABLE("sessionId" bigint, "tokenId" bigint)
    LANGUAGE plpgsql
    AS $$
DECLARE
    p_user_id bigint;
BEGIN
    SELECT u.id INTO p_user_id
    FROM identity.users u
    WHERE u.public_id = _user_id
    LIMIT 1;

    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'User not found: %', _user_id USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO identity.sessions (id, user_id, user_agent, expires_at)
    VALUES (_session_id, p_user_id, _user_agent, _expires_at);

    RETURN QUERY
    INSERT INTO identity.refresh_tokens (id, session_id, refresh_token_hash)
    VALUES (_token_id, _session_id, _refresh_token_hash)
    RETURNING session_id, id;
END;
$$;


--
-- Name: default_role_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.default_role_id() RETURNS bigint
    LANGUAGE sql STABLE
    AS $$
    SELECT COALESCE((SELECT id FROM identity.roles WHERE code = 'user'), 1);
$$;


--
-- Name: has_course_access(bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_course_access(_user_id bigint, _course_id bigint) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM commerce.entitlement e
        JOIN catalog.course c ON c.id = e.course_id
        WHERE e.user_id = _user_id
          AND e.course_id = _course_id
          AND e.status = 'active'
          AND (e.expires_at IS NULL OR e.expires_at > now())
          AND c.is_deleted = false
          AND c.publish_status <> 'archived'
    );
$$;


--
-- Name: learning_lesson(character varying, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.learning_lesson(p_user_id character varying, p_lesson_id bigint) RETURNS TABLE(lesson_id bigint, module_id bigint, type character varying, source text, status character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_user_id bigint;
BEGIN
  SELECT id INTO v_user_id FROM identity.users WHERE public_id = p_user_id;

  PERFORM public.assert_lesson_access(v_user_id, p_lesson_id);

  IF EXISTS (
    SELECT 1 FROM learning.history h
    WHERE h.user_id = v_user_id AND h.lesson_id = p_lesson_id AND h.status = 'enrolled'
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'Please complete the previous lesson', ERRCODE = 'P0001';
  END IF;

  UPDATE learning.history h2
  SET last_seen = now()
  WHERE h2.user_id = v_user_id AND h2.lesson_id = p_lesson_id;

  RETURN QUERY
  SELECT l.id, l.module_id, l.content_type, l.content_source, h.status::varchar
  FROM course.lesson l
  JOIN learning.history h ON l.id = h.lesson_id
  WHERE h.user_id = v_user_id AND h.lesson_id = p_lesson_id;
END;
$$;


--
-- Name: learning_progress(character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.learning_progress(p_user_public_id character varying, p_course_public_id character varying) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_user_id bigint;
    v_course_id bigint;
BEGIN
    SELECT id INTO v_user_id FROM identity.users WHERE public_id = p_user_public_id;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User not found';
    END IF;

    SELECT id INTO v_course_id FROM catalog.course WHERE public_id = p_course_public_id;
    IF v_course_id IS NULL THEN
        RAISE EXCEPTION 'Course not found';
    END IF;

    IF NOT public.has_course_access(v_user_id, v_course_id) THEN
        RAISE EXCEPTION USING ERRCODE = 'CD403', MESSAGE = 'You do not have access to this course';
    END IF;

    RETURN public.learning_progress_content(p_user_public_id, p_course_public_id);
END;
$$;


--
-- Name: learning_progress_content(character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.learning_progress_content(p_user_public_id character varying, p_course_public_id character varying) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_user_id bigint;
    v_course_id bigint;
    v_result jsonb;
    v_register_status varchar;
BEGIN
    SELECT id INTO v_user_id FROM identity.users WHERE public_id = p_user_public_id;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User not found';
    END IF;

    SELECT id INTO v_course_id FROM catalog.course WHERE public_id = p_course_public_id;
    IF v_course_id IS NULL THEN
        RAISE EXCEPTION 'Course not found';
    END IF;

    SELECT status INTO v_register_status
    FROM learning.register
    WHERE user_id = v_user_id AND course_id = v_course_id AND is_deleted = false;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'You have not registered this course.';
    END IF;

    UPDATE learning.register
    SET status = CASE WHEN status = 'enrolled' THEN 'in_progress' ELSE status END,
        last_seen = now()
    WHERE user_id = v_user_id AND course_id = v_course_id AND is_deleted = false;

    IF v_register_status = 'enrolled' THEN
        UPDATE learning.history h
        SET status = 'in_progress', last_seen = now()
        WHERE h.user_id = v_user_id
          AND h.course_id = v_course_id
          AND h.status = 'enrolled'
          AND h.lesson_id = (
              SELECT l.id
              FROM course.module m
              JOIN course.lesson l ON l.module_id = m.id
              WHERE m.course_id = v_course_id AND m.is_deleted = false AND l.is_deleted = false
              ORDER BY m.order_index, l.order_index
              LIMIT 1
          );
    END IF;

    WITH module_data AS (
        SELECT
            m.id,
            m.title,
            m.order_index,
            COALESCE((
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', l.id::text,
                        'module_id', l.module_id,
                        'title', l.title,
                        'order_index', l.order_index,
                        'status', h.status,
                        'content_source', l.content_source,
                        'last_seen', h.last_seen,
                        'challenges', COALESCE((
                            SELECT jsonb_agg(
                                jsonb_build_object(
                                    'id', ch.id,
                                    'public_id', ch.public_id,
                                    'lesson_id', ch.lesson_id,
                                    'name', ch.name,
                                    'title', ch.title,
                                    'description', ch.description,
                                    'status', ch.status,
                                    'difficulty', ch.difficulty,
                                    'type', ch.type,
                                    'points', COALESCE(ch.points, 0),
                                    'exp', (SELECT r.amount FROM profile.exp_rule r WHERE r.is_active AND r.rule_key = CASE WHEN ch.type = 'quiz' THEN 'quiz.' || ch.difficulty ELSE 'coding.' || ch.type || '.' || ch.difficulty END),
                                    'questions', CASE WHEN ch.type = 'quiz' THEN COALESCE((
                                        SELECT jsonb_agg(
                                            jsonb_build_object(
                                                'id', q.id,
                                                'content', q.question,
                                                'type', q.type,
                                                'points', COALESCE(q.points, 10),
                                                'options', COALESCE((
                                                    SELECT jsonb_agg(
                                                        jsonb_build_object('id', o.id, 'content', o.option_text)
                                                        ORDER BY o.id
                                                    )
                                                    FROM challenge.question_options o
                                                    WHERE o.question_id = q.id
                                                ), '[]'::jsonb)
                                            )
                                            ORDER BY q.order_index NULLS LAST, q.id
                                        )
                                        FROM challenge.questions q
                                        WHERE q.challenge_id = ch.id
                                    ), '[]'::jsonb) END,
                                    'coding', CASE WHEN ch.type IN ('fix_bug', 'mini_coding') THEN jsonb_build_object(
                                        'language', COALESCE(cf.language, 'javascript'),
                                        'file_path', cf.file_path,
                                        'time_limit_ms', COALESCE(cfg.time_limit_ms, 2000),
                                        'execution_mode', cfg.execution_mode,
                                        'tests_total', (SELECT COUNT(*) FROM challenge.challenge_test_cases tc WHERE tc.challenge_id = ch.id),
                                        'tests_visible', (SELECT COUNT(*) FROM challenge.challenge_test_cases tc WHERE tc.challenge_id = ch.id AND tc.is_hidden = false)
                                    ) END
                                )
                                ORDER BY ch.id
                            )
                            FROM challenge.challenges ch
                            LEFT JOIN challenge.coding_configs cfg ON cfg.challenge_id = ch.id
                            LEFT JOIN challenge.coding_files cf ON cf.challenge_id = ch.id AND cf.file_role = 'starter'
                            WHERE ch.lesson_id = l.id
                              AND ch.is_deleted = false
                              AND ch.is_published = true
                              AND ch.type IN ('quiz', 'fix_bug', 'mini_coding')
                        ), '[]'::jsonb)
                    )
                    ORDER BY l.order_index
                )
                FROM course.lesson l
                JOIN learning.history h
                  ON h.lesson_id = l.id
                 AND h.module_id = m.id
                 AND h.user_id = v_user_id
                 AND h.course_id = v_course_id
                WHERE l.module_id = m.id AND l.is_deleted = false
            ), '[]'::jsonb) AS lessons
        FROM course.module m
        WHERE m.course_id = v_course_id AND m.is_deleted = false
    ),
    progress_data AS (
        SELECT
            c.public_id, c.title, c.description, c.image, c.rating, c.modules, c.lessons,
            c.level, c.concept, c.instructor, c.duration,
            r.progress, r.status,
            l.name AS language_name, l.logo AS language_logo, l.color AS language_color,
            cat.name AS category_name
        FROM catalog.course c
        JOIN learning.register r ON r.course_id = c.id AND r.user_id = v_user_id AND r.is_deleted = false
        JOIN catalog.language l ON l.id = c.language_id
        JOIN catalog.category cat ON cat.id = c.category_id
        WHERE c.id = v_course_id
    )
    SELECT jsonb_build_object(
        'id', p.public_id,
        'title', p.title,
        'description', p.description,
        'image', p.image,
        'rating', p.rating,
        'modules_count', p.modules,
        'lessons_count', p.lessons,
        'level', p.level,
        'concept', p.concept,
        'instructor', p.instructor,
        'duration', p.duration,
        'progress', p.progress,
        'status', p.status,
        'language_name', p.language_name,
        'language_logo', p.language_logo,
        'language_color', p.language_color,
        'category_name', p.category_name,
        'modules', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object('id', md.id, 'title', md.title, 'order_index', md.order_index, 'lessons', md.lessons)
                ORDER BY md.order_index
            )
            FROM module_data md
        ), '[]'::jsonb)
    )
    INTO v_result
    FROM progress_data p;

    RETURN v_result;
END;
$$;


--
-- Name: FUNCTION learning_progress_content(p_user_public_id character varying, p_course_public_id character varying); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.learning_progress_content(p_user_public_id character varying, p_course_public_id character varying) IS 'Body of learning_progress without the access check; call learning_progress instead';


--
-- Name: lesson_course_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.lesson_course_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NOT NEW.is_deleted THEN
            UPDATE catalog.course
            SET modules = modules + 1, lessons = lessons + NEW.lessons
            WHERE id = NEW.course_id;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.is_deleted AND NOT OLD.is_deleted THEN
            UPDATE catalog.course
            SET modules = GREATEST(modules - 1, 0), lessons = GREATEST(lessons - OLD.lessons, 0)
            WHERE id = OLD.course_id;
        ELSIF NOT NEW.is_deleted AND OLD.is_deleted THEN
            UPDATE catalog.course
            SET modules = modules + 1, lessons = lessons + NEW.lessons
            WHERE id = NEW.course_id;
        ELSIF NOT NEW.is_deleted AND NEW.lessons <> OLD.lessons THEN
            UPDATE catalog.course
            SET lessons = GREATEST(lessons + (NEW.lessons - OLD.lessons), 0)
            WHERE id = NEW.course_id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF NOT OLD.is_deleted THEN
            UPDATE catalog.course
            SET modules = GREATEST(modules - 1, 0), lessons = GREATEST(lessons - OLD.lessons, 0)
            WHERE id = OLD.course_id;
        END IF;
    END IF;

    RETURN NULL;
END;
$$;


--
-- Name: lesson_module_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.lesson_module_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NOT NEW.is_deleted THEN
            UPDATE course.module SET lessons = lessons + 1 WHERE id = NEW.module_id;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.is_deleted AND NOT OLD.is_deleted THEN
            UPDATE course.module SET lessons = GREATEST(lessons - 1, 0) WHERE id = OLD.module_id;
        ELSIF NOT NEW.is_deleted AND OLD.is_deleted THEN
            UPDATE course.module SET lessons = lessons + 1 WHERE id = NEW.module_id;
        ELSIF NOT NEW.is_deleted AND NEW.module_id <> OLD.module_id THEN
            UPDATE course.module SET lessons = GREATEST(lessons - 1, 0) WHERE id = OLD.module_id;
            UPDATE course.module SET lessons = lessons + 1 WHERE id = NEW.module_id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF NOT OLD.is_deleted THEN
            UPDATE course.module SET lessons = GREATEST(lessons - 1, 0) WHERE id = OLD.module_id;
        END IF;
    END IF;

    RETURN NULL;
END;
$$;


--
-- Name: level_for_exp(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.level_for_exp(_exp bigint) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
    SELECT COALESCE(MAX(level), 1) FROM profile.exp_level WHERE is_active AND min_exp <= GREATEST(_exp, 0);
$$;


--
-- Name: link_provider_account(character varying, character varying, character varying, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.link_provider_account(_user_public_id character varying, _provider character varying, _provider_account_id character varying, _provider_email text) RETURNS void
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: log_in(character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_in(_username character varying) RETURNS TABLE(id character varying, username character varying, password text, email character varying, image text, role character varying)
    LANGUAGE sql
    AS $$
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
$$;


--
-- Name: post_exp(bigint, integer, character varying, bigint, character varying, character varying, bigint, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.post_exp(_user_id bigint, _amount integer, _source_type character varying, _source_id bigint, _rule_key character varying DEFAULT NULL::character varying, _idempotency_key character varying DEFAULT NULL::character varying, _actor_id bigint DEFAULT NULL::bigint, _reason text DEFAULT NULL::text, _metadata jsonb DEFAULT NULL::jsonb) RETURNS TABLE(created boolean, awarded integer, exp_after bigint, previous_level integer, new_level integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_exp bigint;
    v_level int;
    v_new bigint;
    v_new_level int;
BEGIN
    IF _amount IS NULL OR _amount = 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'CD400', MESSAGE = 'EXP amount must not be zero';
    END IF;
    IF _amount < 0 AND _source_type <> 'adjustment' THEN
        RAISE EXCEPTION USING ERRCODE = 'CD400', MESSAGE = 'Only adjustments can remove EXP';
    END IF;

    SELECT i.exp, i.exp_level INTO v_exp, v_level
    FROM profile.info i
    WHERE i.user_id = _user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'CD404', MESSAGE = 'User profile not found';
    END IF;

    IF EXISTS (
        SELECT 1 FROM profile.exp_transaction t
        WHERE t.user_id = _user_id
          AND (
                (_idempotency_key IS NOT NULL AND t.idempotency_key = _idempotency_key)
             OR (_source_id IS NOT NULL AND t.source_type = _source_type AND t.source_id = _source_id)
          )
    ) THEN
        RETURN QUERY SELECT false, 0, v_exp, v_level, v_level;
        RETURN;
    END IF;

    v_new := GREATEST(v_exp + _amount, 0);
    IF v_new = v_exp THEN
        RETURN QUERY SELECT false, 0, v_exp, v_level, v_level;
        RETURN;
    END IF;

    v_new_level := public.level_for_exp(v_new);

    INSERT INTO profile.exp_transaction
        (user_id, amount, source_type, source_id, rule_key, exp_after, idempotency_key, actor_id, reason, metadata)
    VALUES
        (_user_id, (v_new - v_exp)::int, _source_type, _source_id, _rule_key, v_new, _idempotency_key, _actor_id, _reason, _metadata);

    UPDATE profile.info SET exp = v_new, exp_level = v_new_level, updated_at = now() WHERE user_id = _user_id;

    RETURN QUERY SELECT true, (v_new - v_exp)::int, v_new, v_level, v_new_level;
END;
$$;


--
-- Name: post_points(bigint, character varying, character varying, bigint, character varying, bigint, character varying, bigint, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.post_points(_user_id bigint, _action character varying, _entry_type character varying, _amount bigint, _source_type character varying, _source_id bigint, _idempotency_key character varying DEFAULT NULL::character varying, _order_id bigint DEFAULT NULL::bigint, _actor_id bigint DEFAULT NULL::bigint, _reason text DEFAULT NULL::text) RETURNS TABLE(transaction_id uuid, balance_after bigint, created boolean)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_balance bigint;
    v_new bigint;
    v_id uuid;
    v_existing record;
BEGIN
    IF _amount IS NULL OR _amount <= 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'CD400', MESSAGE = 'Point amount must be positive';
    END IF;
    IF _action NOT IN ('credit', 'debit') THEN
        RAISE EXCEPTION USING ERRCODE = 'CD400', MESSAGE = 'Unknown point action';
    END IF;

    SELECT COALESCE(i.points, 0) INTO v_balance
    FROM profile.info i
    WHERE i.user_id = _user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'CD404', MESSAGE = 'User profile not found';
    END IF;

    SELECT pt.id, pt.balance_after INTO v_existing
    FROM profile.point_transaction pt
    WHERE pt.user_id = _user_id
      AND (
            (_idempotency_key IS NOT NULL AND pt.idempotency_key = _idempotency_key)
         OR (pt.source_type = _source_type AND pt.source_id = _source_id AND pt.action = _action)
      )
    LIMIT 1;

    IF FOUND THEN
        RETURN QUERY SELECT v_existing.id, v_existing.balance_after, false;
        RETURN;
    END IF;

    v_new := v_balance + CASE WHEN _action = 'credit' THEN _amount ELSE -_amount END;
    IF v_new < 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'CD402', MESSAGE = 'Not enough points';
    END IF;

    INSERT INTO profile.point_transaction
        (user_id, action, entry_type, amount, source_type, source_id, idempotency_key, order_id, actor_id, reason, balance_after)
    VALUES
        (_user_id, _action, _entry_type, _amount, _source_type, _source_id, _idempotency_key, _order_id, _actor_id, _reason, v_new)
    RETURNING id INTO v_id;

    UPDATE profile.info SET points = v_new, updated_at = now() WHERE user_id = _user_id;

    RETURN QUERY SELECT v_id, v_new, true;
END;
$$;


--
-- Name: ranking_scores(timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ranking_scores(_since timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(user_id bigint, exp bigint, points_earned bigint, challenges_passed integer, challenges_first_try integer, overall bigint, last_at timestamp with time zone)
    LANGUAGE sql STABLE
    AS $$
    WITH e AS (
        SELECT t.user_id, GREATEST(SUM(t.amount), 0)::bigint AS exp, MAX(t.created_at) AS last_at
        FROM profile.exp_transaction t
        WHERE _since IS NULL OR t.created_at >= _since
        GROUP BY t.user_id
    ),
    p AS (
        SELECT t.user_id, SUM(t.amount)::bigint AS points, MAX(t.created_at) AS last_at
        FROM profile.point_transaction t
        WHERE t.action = 'credit' AND t.entry_type = 'earned'
          AND (_since IS NULL OR t.created_at >= _since)
        GROUP BY t.user_id
    ),
    passes AS (
        SELECT t.user_id,
               CASE WHEN ch.type = 'quiz' THEN (
                   SELECT COUNT(DISTINCT qs.created_at)
                   FROM challenge.question_submissions qs
                   JOIN challenge.questions q ON q.id = qs.question_id
                   WHERE qs.user_id = t.user_id AND q.challenge_id = ch.id
                     AND qs.created_at <= t.created_at::timestamp
               ) ELSE (
                   SELECT COUNT(*)
                   FROM challenge.code_submissions s
                   WHERE s.user_id = t.user_id AND s.challenge_id = ch.id
                     AND s.submitted_at <= t.created_at::timestamp
               ) END AS attempts
        FROM profile.exp_transaction t
        JOIN challenge.challenges ch ON ch.id = t.source_id
        WHERE t.source_type = 'challenge' AND t.amount > 0
          AND (_since IS NULL OR t.created_at >= _since)
    ),
    c AS (
        SELECT passes.user_id,
               COUNT(*)::int AS passed,
               COUNT(*) FILTER (WHERE attempts <= 1)::int AS first_try
        FROM passes
        GROUP BY passes.user_id
    )
    SELECT ids.user_id,
           COALESCE(e.exp, 0),
           COALESCE(p.points, 0),
           COALESCE(c.passed, 0),
           COALESCE(c.first_try, 0),
           ROUND(
               (COALESCE(e.exp, 0) + 0.5 * COALESCE(p.points, 0))
               * CASE WHEN COALESCE(c.passed, 0) >= 10
                      THEN 0.9 + 0.2 * c.first_try::numeric / c.passed
                      ELSE 1 END
           )::bigint,
           GREATEST(e.last_at, p.last_at)
    FROM (SELECT e.user_id FROM e UNION SELECT p.user_id FROM p) ids
    LEFT JOIN e ON e.user_id = ids.user_id
    LEFT JOIN p ON p.user_id = ids.user_id
    LEFT JOIN c ON c.user_id = ids.user_id;
$$;


--
-- Name: redeem_course_points(character varying, character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.redeem_course_points(_user_public_id character varying, _course_public_id character varying, _idempotency_key character varying) RETURNS TABLE(order_id character varying, course_id character varying, points_spent bigint, balance_after bigint, replayed boolean)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_user bigint;
    v_course record;
    v_offer record;
    v_prior record;
    v_order_id bigint;
    v_order_public varchar;
    v_tx record;
BEGIN
    IF _idempotency_key IS NULL OR length(_idempotency_key) < 8 OR length(_idempotency_key) > 100 THEN
        RAISE EXCEPTION USING ERRCODE = 'CD400', MESSAGE = 'Invalid idempotency key';
    END IF;

    SELECT u.id INTO v_user FROM identity.users u WHERE u.public_id = _user_public_id;
    IF v_user IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'CD404', MESSAGE = 'User not found';
    END IF;

    -- Serialises every points spend of this user: concurrent / repeated requests run one by one.
    PERFORM 1 FROM profile.info i WHERE i.user_id = v_user FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'CD404', MESSAGE = 'User profile not found';
    END IF;

    SELECT o.id, o.public_id, o.payment_method::text AS method, o.points_total, c.public_id AS course_public_id
    INTO v_prior
    FROM commerce.orders o
    JOIN commerce.order_items oi ON oi.order_id = o.id
    JOIN catalog.course c ON c.id = oi.course_id
    WHERE o.user_id = v_user AND o.idempotency_key = _idempotency_key
    LIMIT 1;

    IF FOUND THEN
        IF v_prior.method <> 'points' OR v_prior.course_public_id <> _course_public_id THEN
            RAISE EXCEPTION USING ERRCODE = 'CD422', MESSAGE = 'This request key was already used for another order';
        END IF;
        RETURN QUERY
        SELECT v_prior.public_id::varchar, v_prior.course_public_id::varchar, v_prior.points_total,
               (SELECT pt.balance_after FROM profile.point_transaction pt
                WHERE pt.order_id = v_prior.id AND pt.action = 'debit' LIMIT 1),
               true;
        RETURN;
    END IF;

    SELECT c.id, c.public_id, c.publish_status, c.is_deleted, c.access_model INTO v_course
    FROM catalog.course c WHERE c.public_id = _course_public_id;

    IF NOT FOUND OR v_course.is_deleted OR v_course.publish_status <> 'published' THEN
        RAISE EXCEPTION USING ERRCODE = 'CD404', MESSAGE = 'This course is not available';
    END IF;

    IF EXISTS (
        SELECT 1 FROM commerce.entitlement e
        WHERE e.user_id = v_user AND e.course_id = v_course.id AND e.status = 'active'
          AND (e.expires_at IS NULL OR e.expires_at > now())
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'CD409', MESSAGE = 'You already own this course';
    END IF;

    SELECT ofr.id, ofr.amount INTO v_offer
    FROM commerce.offer ofr
    WHERE ofr.course_id = v_course.id AND ofr.price_type = 'points' AND ofr.is_active;

    IF NOT FOUND OR v_course.access_model <> 'premium' THEN
        RAISE EXCEPTION USING ERRCODE = 'CD410', MESSAGE = 'This course cannot be redeemed with points';
    END IF;

    -- An active row past its expiry would block the new grant.
    UPDATE commerce.entitlement e SET status = 'expired'
    WHERE e.user_id = v_user AND e.course_id = v_course.id AND e.status = 'active' AND e.expires_at <= now();

    INSERT INTO commerce.orders (public_id, user_id, status, payment_method, total, points_total, idempotency_key, paid_at, updated_at)
    VALUES ('ord_' || replace(gen_random_uuid()::text, '-', ''), v_user, 'completed', 'points', 0, v_offer.amount, _idempotency_key, now(), now())
    RETURNING id, public_id INTO v_order_id, v_order_public;

    INSERT INTO commerce.order_items (order_id, course_id, price, offer_id, points)
    VALUES (v_order_id, v_course.id, 0, v_offer.id, v_offer.amount);

    SELECT * INTO v_tx
    FROM public.post_points(v_user, 'debit', 'spent', v_offer.amount, 'order', v_order_id,
                            'redeem:' || _idempotency_key, v_order_id, NULL, NULL);

    INSERT INTO commerce.entitlement (public_id, user_id, course_id, source, order_id)
    VALUES ('ent_' || replace(gen_random_uuid()::text, '-', ''), v_user, v_course.id, 'points', v_order_id);

    RETURN QUERY SELECT v_order_public, v_course.public_id::varchar, v_offer.amount, v_tx.balance_after, false;
END;
$$;


--
-- Name: register_course(character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.register_course(_user_id character varying, _course_id character varying) RETURNS TABLE(courseid character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
  p_user_id bigint;
  v_course record;
BEGIN
    SELECT id INTO p_user_id FROM identity.users WHERE public_id = _user_id;
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'User not found';
    END IF;

    SELECT c.id, c.publish_status, c.access_model, c.is_deleted INTO v_course
    FROM catalog.course c
    WHERE c.public_id = _course_id;

    IF NOT FOUND OR v_course.is_deleted OR v_course.publish_status IN ('archived', 'draft') THEN
        RAISE EXCEPTION USING ERRCODE = 'CD404', MESSAGE = 'Course not found';
    END IF;

    IF NOT public.has_course_access(p_user_id, v_course.id) THEN
        IF v_course.publish_status <> 'published' THEN
            RAISE EXCEPTION USING ERRCODE = 'CD404', MESSAGE = 'Course not found';
        ELSIF v_course.access_model = 'free' THEN
            UPDATE commerce.entitlement e SET status = 'expired'
            WHERE e.user_id = p_user_id AND e.course_id = v_course.id AND e.status = 'active' AND e.expires_at <= now();

            INSERT INTO commerce.entitlement (public_id, user_id, course_id, source)
            VALUES ('ent_' || replace(gen_random_uuid()::text, '-', ''), p_user_id, v_course.id, 'free')
            ON CONFLICT DO NOTHING;
        ELSE
            RAISE EXCEPTION USING ERRCODE = 'CD403', MESSAGE = 'This course requires a purchase';
        END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM learning.register WHERE user_id = p_user_id AND course_id = v_course.id) THEN
        UPDATE learning.register
        SET is_deleted = false, deleted_at = NULL
        WHERE user_id = p_user_id AND course_id = v_course.id;
    ELSE
        INSERT INTO learning.register (user_id, course_id)
        VALUES (p_user_id, v_course.id);

        UPDATE catalog.course
        SET students = students + 1
        WHERE id = v_course.id;

        INSERT INTO learning.history (user_id, course_id, module_id, lesson_id)
        SELECT p_user_id, v_course.id, m.id, l.id
        FROM course.lesson l
        JOIN course.module m ON m.id = l.module_id
        WHERE m.course_id = v_course.id
          AND l.is_deleted = false
          AND m.is_deleted = false
        ON CONFLICT DO NOTHING;
    END IF;

    RETURN QUERY SELECT _course_id AS courseId;
END;
$$;


--
-- Name: sign_in_with_provider(bigint, character varying, character varying, text, text, character varying, character varying, character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sign_in_with_provider(_id bigint, _public_id character varying, _username character varying, _email text, _image text, _provider character varying, _provider_account_id character varying, _surname character varying, _name character varying) RETURNS TABLE(result character varying, id character varying, username character varying, email character varying, image text, provider character varying, role character varying)
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: sign_up(bigint, character varying, character varying, character varying, character varying, character varying, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sign_up(_id bigint, _public_id character varying, _username character varying, _email character varying, _surname character varying, _name character varying, _password text) RETURNS TABLE(public_id character varying, username character varying, email character varying)
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM identity.users AS u WHERE u.username = _username) THEN
        RAISE EXCEPTION 'Username has been used, please try other username' USING ERRCODE = 'P0001';
    END IF;

    IF EXISTS (SELECT 1 FROM identity.users AS u WHERE u.email = _email) THEN
        RAISE EXCEPTION 'Email has been used, please try other email' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO identity.users (id, public_id, username, email)
    VALUES (_id, _public_id, _username, _email);

    INSERT INTO profile.info (user_id, surname, name)
    VALUES (_id, _surname, _name);

    INSERT INTO identity.accounts (user_id, password_hash, provider)
    VALUES (_id, _password, 'credentials'::provider_enum);

    INSERT INTO identity.user_roles (user_id, role_id)
    VALUES (_id, public.default_role_id());

    RETURN QUERY
    SELECT u.public_id, u.username, u.email
    FROM identity.users u
    WHERE u.id = _id;
END;
$$;


--
-- Name: submit_lesson(character varying, character varying, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_lesson(_user_id character varying, _course_id character varying, _lesson_id bigint) RETURNS TABLE("nextLessonId" bigint, "completedLessons" integer, "awardedPoints" integer, "awardedExp" integer, exp bigint, level integer, "previousLevel" integer, "courseCompleted" boolean)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_user_id bigint;
    v_course_id bigint;
    v_course_level text;
    v_status status_progress_enum;
    total_lessons int;
    completed_lessons int;
    next_lesson_id bigint;
    v_points record;
    v_exp record;
    v_course_exp record;
    v_awarded_points int := 0;
    v_awarded_exp int := 0;
    v_previous_level int;
    v_level int;
    v_total_exp bigint;
    v_course_completed boolean := false;
BEGIN
    SELECT u.id INTO v_user_id FROM identity.users u WHERE u.public_id = _user_id;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Missing user id';
    END IF;

    SELECT c.id, c.level::text INTO v_course_id, v_course_level
    FROM catalog.course c
    WHERE c.public_id = _course_id;
    IF v_course_id IS NULL THEN
        RAISE EXCEPTION 'Missing course id';
    END IF;

    IF public.assert_lesson_access(v_user_id, _lesson_id) <> v_course_id THEN
        RAISE EXCEPTION 'Lesson % does not belong to course %', _lesson_id, _course_id;
    END IF;

    SELECT h.status INTO v_status
    FROM learning.history h
    WHERE h.user_id = v_user_id AND h.course_id = v_course_id AND h.lesson_id = _lesson_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Lesson % does not belong to course %', _lesson_id, _course_id;
    END IF;

    -- Locked lessons cannot be completed (prevents skipping ahead / farming points).
    IF v_status = 'enrolled' THEN
        RAISE EXCEPTION USING MESSAGE = 'Please complete the previous lesson', ERRCODE = 'P0001';
    END IF;

    UPDATE learning.history
    SET status = 'completed', updated_at = now()
    WHERE user_id = v_user_id AND course_id = v_course_id AND lesson_id = _lesson_id;

    -- Lesson reward, once per lesson: points and EXP (both idempotent per source).
    SELECT * INTO v_points FROM public.post_points(v_user_id, 'credit', 'earned', 10, 'lesson', _lesson_id);
    IF v_points.created THEN
        v_awarded_points := 10;
    END IF;

    SELECT * INTO v_exp FROM public.award_exp(v_user_id, 'lesson', 'lesson', _lesson_id);
    v_awarded_exp := v_exp.awarded;
    v_previous_level := v_exp.previous_level;
    v_level := v_exp.new_level;
    v_total_exp := v_exp.exp_after;

    -- Unlock the next lesson in course order.
    SELECT l2.id INTO next_lesson_id
    FROM course.lesson cur_l
    JOIN course.module cur_m ON cur_m.id = cur_l.module_id
    JOIN course.module m2 ON m2.course_id = cur_m.course_id AND m2.is_deleted = false
    JOIN course.lesson l2 ON l2.module_id = m2.id AND l2.is_deleted = false
    JOIN learning.history h ON h.lesson_id = l2.id AND h.user_id = v_user_id AND h.course_id = v_course_id
    WHERE cur_l.id = _lesson_id
      AND h.status = 'enrolled'
      AND (
            m2.order_index > cur_m.order_index
         OR (m2.order_index = cur_m.order_index AND l2.order_index > cur_l.order_index)
      )
    ORDER BY m2.order_index, l2.order_index
    LIMIT 1;

    IF next_lesson_id IS NOT NULL THEN
        UPDATE learning.history
        SET status = 'in_progress', updated_at = now(), last_seen = now()
        WHERE user_id = v_user_id AND course_id = v_course_id AND lesson_id = next_lesson_id;
    END IF;

    SELECT COUNT(*) INTO total_lessons
    FROM course.lesson l
    JOIN course.module m ON m.id = l.module_id
    WHERE m.course_id = v_course_id AND l.is_deleted = false AND m.is_deleted = false;

    SELECT COUNT(*) INTO completed_lessons
    FROM learning.history
    WHERE user_id = v_user_id AND course_id = v_course_id AND status = 'completed';

    UPDATE learning.register
    SET progress = completed_lessons
    WHERE user_id = v_user_id AND course_id = v_course_id;

    IF completed_lessons >= total_lessons THEN
        UPDATE learning.register
        SET status = 'completed'
        WHERE user_id = v_user_id AND course_id = v_course_id;
        v_course_completed := true;

        -- Course completion bonus is EXP only (points come from lessons and challenges).
        IF v_course_level IS NOT NULL THEN
            SELECT * INTO v_course_exp FROM public.award_exp(v_user_id, 'course.' || v_course_level, 'course', v_course_id);
            v_awarded_exp := v_awarded_exp + v_course_exp.awarded;
            v_level := v_course_exp.new_level;
            v_total_exp := v_course_exp.exp_after;
        END IF;
    END IF;

    RETURN QUERY
    SELECT next_lesson_id, completed_lessons, v_awarded_points, v_awarded_exp, v_total_exp, v_level, v_previous_level, v_course_completed;
END;
$$;


--
-- Name: voting_comment(character varying, uuid, public.voting_enum); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.voting_comment(_user_id character varying, _comment_id uuid, new_vote public.voting_enum) RETURNS TABLE(upvotes bigint, downvotes bigint, vote public.voting_enum)
    LANGUAGE plpgsql
    AS $$
#variable_conflict use_column
DECLARE
    p_user_id bigint;
    p_comment_id bigint;
    old_vote voting_enum;
    up_delta int := 0;
    down_delta int := 0;
BEGIN
    SELECT id INTO p_user_id FROM identity.users WHERE public_id = _user_id;
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'User not found';
    END IF;

    SELECT id INTO p_comment_id FROM community.comment WHERE public_id = _comment_id;
    IF p_comment_id IS NULL THEN
        RAISE EXCEPTION 'Comment not found';
    END IF;

    SELECT voting INTO old_vote
    FROM community.voting
    WHERE reference_id = p_comment_id AND user_id = p_user_id
    FOR UPDATE;

    IF new_vote IS NULL THEN
        DELETE FROM community.voting
        WHERE reference_id = p_comment_id AND user_id = p_user_id;

        IF old_vote = 'upvote' THEN
            up_delta := -1;
        ELSIF old_vote = 'downvote' THEN
            down_delta := -1;
        END IF;
    ELSE
        IF old_vote = new_vote THEN
            RETURN QUERY
            SELECT c.upvotes, c.downvotes, new_vote FROM community.comment c WHERE c.id = p_comment_id;
            RETURN;
        END IF;

        IF old_vote IS NULL THEN
            IF new_vote = 'upvote' THEN up_delta := 1; ELSE down_delta := 1; END IF;
        ELSIF old_vote = 'upvote' AND new_vote = 'downvote' THEN
            up_delta := -1;
            down_delta := 1;
        ELSIF old_vote = 'downvote' AND new_vote = 'upvote' THEN
            up_delta := 1;
            down_delta := -1;
        END IF;

        INSERT INTO community.voting (user_id, reference_id, voting)
        VALUES (p_user_id, p_comment_id, new_vote)
        ON CONFLICT (user_id, reference_id)
        DO UPDATE SET voting = EXCLUDED.voting, updated_at = now();
    END IF;

    UPDATE community.comment
    SET upvotes = GREATEST(upvotes + up_delta, 0),
        downvotes = GREATEST(downvotes + down_delta, 0)
    WHERE id = p_comment_id;

    RETURN QUERY
    SELECT c.upvotes, c.downvotes, v.voting
    FROM community.comment c
    LEFT JOIN community.voting v ON v.reference_id = c.id AND v.user_id = p_user_id
    WHERE c.id = p_comment_id;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: career_role; Type: TABLE; Schema: catalog; Owner: -
--

CREATE TABLE catalog.career_role (
    id integer NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT chk_career_role_code CHECK (((code)::text ~ '^[a-z0-9_]+$'::text))
);


--
-- Name: TABLE career_role; Type: COMMENT; Schema: catalog; Owner: -
--

COMMENT ON TABLE catalog.career_role IS 'Career roles a learner picks during onboarding (not RBAC roles: see identity.roles)';


--
-- Name: career_role_id_seq; Type: SEQUENCE; Schema: catalog; Owner: -
--

ALTER TABLE catalog.career_role ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME catalog.career_role_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: career_role_skill; Type: TABLE; Schema: catalog; Owner: -
--

CREATE TABLE catalog.career_role_skill (
    career_role_id integer NOT NULL,
    skill_id integer NOT NULL,
    weight smallint DEFAULT 1 NOT NULL,
    CONSTRAINT chk_career_role_skill_weight CHECK (((weight >= 1) AND (weight <= 5)))
);


--
-- Name: category; Type: TABLE; Schema: catalog; Owner: -
--

CREATE TABLE catalog.category (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone
);


--
-- Name: category_id_seq; Type: SEQUENCE; Schema: catalog; Owner: -
--

CREATE SEQUENCE catalog.category_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: category_id_seq; Type: SEQUENCE OWNED BY; Schema: catalog; Owner: -
--

ALTER SEQUENCE catalog.category_id_seq OWNED BY catalog.category.id;


--
-- Name: course; Type: TABLE; Schema: catalog; Owner: -
--

CREATE TABLE catalog.course (
    title text NOT NULL,
    concept text NOT NULL,
    image text,
    rating integer,
    description text NOT NULL,
    lessons integer DEFAULT 0 NOT NULL,
    duration integer DEFAULT 0 NOT NULL,
    instructor text NOT NULL,
    students integer DEFAULT 0 NOT NULL,
    cost numeric(10,2) DEFAULT 0,
    is_hidden boolean DEFAULT false,
    is_deleted boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    modules integer DEFAULT 0 NOT NULL,
    category_id integer,
    language_id integer,
    level public.level_enum,
    id bigint NOT NULL,
    public_id character varying(255) NOT NULL,
    point_price bigint DEFAULT 0,
    reward bigint DEFAULT 0,
    reviews bigint DEFAULT 0,
    publish_status character varying(20) NOT NULL,
    published_at timestamp with time zone,
    course_type character varying(20) DEFAULT 'course'::character varying NOT NULL,
    access_model character varying(20) DEFAULT 'free'::character varying NOT NULL,
    CONSTRAINT chk_course_access_model CHECK (((access_model)::text = ANY ((ARRAY['free'::character varying, 'premium'::character varying])::text[]))),
    CONSTRAINT chk_course_counters CHECK (((modules >= 0) AND (lessons >= 0) AND (students >= 0) AND (duration >= 0) AND (COALESCE(cost, (0)::numeric) >= (0)::numeric))),
    CONSTRAINT chk_course_publish_status CHECK (((publish_status)::text = ANY ((ARRAY['draft'::character varying, 'published'::character varying, 'unpublished'::character varying, 'archived'::character varying])::text[]))),
    CONSTRAINT chk_course_type CHECK (((course_type)::text = ANY ((ARRAY['course'::character varying, 'project'::character varying, 'workshop'::character varying])::text[])))
);


--
-- Name: COLUMN course.cost; Type: COMMENT; Schema: catalog; Owner: -
--

COMMENT ON COLUMN catalog.course.cost IS 'Deprecated: prices live in commerce.offer';


--
-- Name: COLUMN course.point_price; Type: COMMENT; Schema: catalog; Owner: -
--

COMMENT ON COLUMN catalog.course.point_price IS 'Deprecated: prices live in commerce.offer';


--
-- Name: COLUMN course.publish_status; Type: COMMENT; Schema: catalog; Owner: -
--

COMMENT ON COLUMN catalog.course.publish_status IS 'draft | published | unpublished | archived. Source of truth for visibility; is_hidden is derived from it';


--
-- Name: COLUMN course.access_model; Type: COMMENT; Schema: catalog; Owner: -
--

COMMENT ON COLUMN catalog.course.access_model IS 'free: anyone may enrol (a free entitlement is granted). premium: needs an entitlement from a purchase, points or an admin grant';


--
-- Name: course_career_role; Type: TABLE; Schema: catalog; Owner: -
--

CREATE TABLE catalog.course_career_role (
    course_id bigint NOT NULL,
    career_role_id integer NOT NULL
);


--
-- Name: course_id_seq; Type: SEQUENCE; Schema: catalog; Owner: -
--

CREATE SEQUENCE catalog.course_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: course_id_seq; Type: SEQUENCE OWNED BY; Schema: catalog; Owner: -
--

ALTER SEQUENCE catalog.course_id_seq OWNED BY catalog.course.id;


--
-- Name: course_industry; Type: TABLE; Schema: catalog; Owner: -
--

CREATE TABLE catalog.course_industry (
    course_id bigint NOT NULL,
    industry_id integer NOT NULL
);


--
-- Name: course_learning_goal; Type: TABLE; Schema: catalog; Owner: -
--

CREATE TABLE catalog.course_learning_goal (
    course_id bigint NOT NULL,
    learning_goal_id integer NOT NULL
);


--
-- Name: course_prerequisite; Type: TABLE; Schema: catalog; Owner: -
--

CREATE TABLE catalog.course_prerequisite (
    course_id bigint NOT NULL,
    prerequisite_course_id bigint NOT NULL,
    CONSTRAINT chk_course_prerequisite_not_self CHECK ((course_id <> prerequisite_course_id))
);


--
-- Name: course_skill; Type: TABLE; Schema: catalog; Owner: -
--

CREATE TABLE catalog.course_skill (
    course_id bigint NOT NULL,
    skill_id integer NOT NULL,
    weight smallint DEFAULT 1 NOT NULL,
    CONSTRAINT chk_course_skill_weight CHECK (((weight >= 1) AND (weight <= 5)))
);


--
-- Name: industry; Type: TABLE; Schema: catalog; Owner: -
--

CREATE TABLE catalog.industry (
    id integer NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT chk_industry_code CHECK (((code)::text ~ '^[a-z0-9_]+$'::text))
);


--
-- Name: industry_id_seq; Type: SEQUENCE; Schema: catalog; Owner: -
--

ALTER TABLE catalog.industry ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME catalog.industry_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: language; Type: TABLE; Schema: catalog; Owner: -
--

CREATE TABLE catalog.language (
    name text NOT NULL,
    color text NOT NULL,
    logo text NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone,
    id integer NOT NULL
);


--
-- Name: language_id_seq; Type: SEQUENCE; Schema: catalog; Owner: -
--

CREATE SEQUENCE catalog.language_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: language_id_seq; Type: SEQUENCE OWNED BY; Schema: catalog; Owner: -
--

ALTER SEQUENCE catalog.language_id_seq OWNED BY catalog.language.id;


--
-- Name: learning_goal; Type: TABLE; Schema: catalog; Owner: -
--

CREATE TABLE catalog.learning_goal (
    id integer NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT chk_learning_goal_code CHECK (((code)::text ~ '^[a-z0-9_]+$'::text))
);


--
-- Name: learning_goal_id_seq; Type: SEQUENCE; Schema: catalog; Owner: -
--

ALTER TABLE catalog.learning_goal ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME catalog.learning_goal_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: skill; Type: TABLE; Schema: catalog; Owner: -
--

CREATE TABLE catalog.skill (
    id integer NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT chk_skill_code CHECK (((code)::text ~ '^[a-z0-9_]+$'::text))
);


--
-- Name: skill_id_seq; Type: SEQUENCE; Schema: catalog; Owner: -
--

ALTER TABLE catalog.skill ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME catalog.skill_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: challenge_test_cases; Type: TABLE; Schema: challenge; Owner: -
--

CREATE TABLE challenge.challenge_test_cases (
    id bigint NOT NULL,
    challenge_id bigint NOT NULL,
    name character varying(100),
    input_data text,
    expected_output text NOT NULL,
    score numeric(8,2) DEFAULT 1 NOT NULL,
    is_sample boolean DEFAULT false NOT NULL,
    is_hidden boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_test_case_score CHECK ((score >= (0)::numeric))
);


--
-- Name: challenge_test_cases_id_seq; Type: SEQUENCE; Schema: challenge; Owner: -
--

CREATE SEQUENCE challenge.challenge_test_cases_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: challenge_test_cases_id_seq; Type: SEQUENCE OWNED BY; Schema: challenge; Owner: -
--

ALTER SEQUENCE challenge.challenge_test_cases_id_seq OWNED BY challenge.challenge_test_cases.id;


--
-- Name: challenges; Type: TABLE; Schema: challenge; Owner: -
--

CREATE TABLE challenge.challenges (
    course_id bigint NOT NULL,
    module_id bigint NOT NULL,
    name text NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    status public.status_challenge DEFAULT 'coming_soon'::public.status_challenge NOT NULL,
    difficulty public.difficulty_question NOT NULL,
    type character varying(50) NOT NULL,
    is_published boolean DEFAULT false,
    is_deleted boolean DEFAULT false,
    deleted_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone,
    id bigint NOT NULL,
    public_id character varying(50) NOT NULL,
    lesson_id bigint NOT NULL,
    points integer DEFAULT 0
);


--
-- Name: challenges_id_seq; Type: SEQUENCE; Schema: challenge; Owner: -
--

CREATE SEQUENCE challenge.challenges_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: challenges_id_seq; Type: SEQUENCE OWNED BY; Schema: challenge; Owner: -
--

ALTER SEQUENCE challenge.challenges_id_seq OWNED BY challenge.challenges.id;


--
-- Name: code_run_results; Type: TABLE; Schema: challenge; Owner: -
--

CREATE TABLE challenge.code_run_results (
    run_id bigint NOT NULL,
    stdout text,
    stderr text,
    exit_code integer,
    execution_time_ms integer,
    memory_used_kb bigint,
    passed_tests integer DEFAULT 0 NOT NULL,
    total_tests integer DEFAULT 0 NOT NULL,
    score numeric(8,2),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_code_run_execution_time CHECK (((execution_time_ms IS NULL) OR (execution_time_ms >= 0))),
    CONSTRAINT chk_code_run_memory CHECK (((memory_used_kb IS NULL) OR (memory_used_kb >= 0))),
    CONSTRAINT chk_code_run_test_counts CHECK (((passed_tests >= 0) AND (total_tests >= 0) AND (passed_tests <= total_tests)))
);


--
-- Name: code_run_test_results; Type: TABLE; Schema: challenge; Owner: -
--

CREATE TABLE challenge.code_run_test_results (
    id bigint NOT NULL,
    run_id bigint NOT NULL,
    test_case_id bigint,
    status character varying(30) NOT NULL,
    execution_time_ms integer,
    score numeric(8,2) DEFAULT 0 NOT NULL,
    CONSTRAINT chk_run_test_result_score CHECK ((score >= (0)::numeric)),
    CONSTRAINT chk_run_test_result_time CHECK (((execution_time_ms IS NULL) OR (execution_time_ms >= 0)))
);


--
-- Name: code_run_test_results_id_seq; Type: SEQUENCE; Schema: challenge; Owner: -
--

CREATE SEQUENCE challenge.code_run_test_results_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: code_run_test_results_id_seq; Type: SEQUENCE OWNED BY; Schema: challenge; Owner: -
--

ALTER SEQUENCE challenge.code_run_test_results_id_seq OWNED BY challenge.code_run_test_results.id;


--
-- Name: code_runs; Type: TABLE; Schema: challenge; Owner: -
--

CREATE TABLE challenge.code_runs (
    id bigint NOT NULL,
    public_id character varying(50) NOT NULL,
    user_id bigint NOT NULL,
    challenge_id bigint NOT NULL,
    submission_id bigint,
    run_type character varying(30) DEFAULT 'manual'::character varying NOT NULL,
    language character varying(50) NOT NULL,
    source_snapshot jsonb NOT NULL,
    stdin text,
    status character varying(30) DEFAULT 'queued'::character varying NOT NULL,
    queued_at timestamp without time zone DEFAULT now() NOT NULL,
    started_at timestamp without time zone,
    finished_at timestamp without time zone,
    CONSTRAINT chk_code_run_status CHECK (((status)::text = ANY (ARRAY[('queued'::character varying)::text, ('running'::character varying)::text, ('completed'::character varying)::text, ('failed'::character varying)::text, ('timeout'::character varying)::text, ('cancelled'::character varying)::text]))),
    CONSTRAINT chk_code_run_type CHECK (((run_type)::text = ANY (ARRAY[('manual'::character varying)::text, ('submit'::character varying)::text])))
);


--
-- Name: code_runs_id_seq; Type: SEQUENCE; Schema: challenge; Owner: -
--

CREATE SEQUENCE challenge.code_runs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: code_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: challenge; Owner: -
--

ALTER SEQUENCE challenge.code_runs_id_seq OWNED BY challenge.code_runs.id;


--
-- Name: code_submissions; Type: TABLE; Schema: challenge; Owner: -
--

CREATE TABLE challenge.code_submissions (
    id bigint NOT NULL,
    public_id character varying(50) NOT NULL,
    user_id bigint NOT NULL,
    challenge_id bigint NOT NULL,
    language character varying(50) NOT NULL,
    source_snapshot jsonb NOT NULL,
    status character varying(30) DEFAULT 'submitted'::character varying NOT NULL,
    score numeric(8,2),
    submitted_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_code_submission_score CHECK (((score IS NULL) OR (score >= (0)::numeric)))
);


--
-- Name: code_submissions_id_seq; Type: SEQUENCE; Schema: challenge; Owner: -
--

CREATE SEQUENCE challenge.code_submissions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: code_submissions_id_seq; Type: SEQUENCE OWNED BY; Schema: challenge; Owner: -
--

ALTER SEQUENCE challenge.code_submissions_id_seq OWNED BY challenge.code_submissions.id;


--
-- Name: coding_configs; Type: TABLE; Schema: challenge; Owner: -
--

CREATE TABLE challenge.coding_configs (
    challenge_id bigint NOT NULL,
    execution_mode character varying(30) DEFAULT 'function'::character varying NOT NULL,
    time_limit_ms integer DEFAULT 3000 NOT NULL,
    memory_limit_mb integer DEFAULT 256 NOT NULL,
    max_attempts integer,
    scoring_mode character varying(30) DEFAULT 'test_case'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone,
    CONSTRAINT chk_coding_configs_max_attempts CHECK (((max_attempts IS NULL) OR (max_attempts > 0))),
    CONSTRAINT chk_coding_configs_memory_limit CHECK ((memory_limit_mb > 0)),
    CONSTRAINT chk_coding_configs_time_limit CHECK ((time_limit_ms > 0))
);


--
-- Name: coding_files; Type: TABLE; Schema: challenge; Owner: -
--

CREATE TABLE challenge.coding_files (
    id bigint NOT NULL,
    challenge_id bigint NOT NULL,
    language character varying(50),
    file_path character varying(255) NOT NULL,
    file_role character varying(50) DEFAULT 'starter'::character varying NOT NULL,
    asset_id bigint,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone
);


--
-- Name: coding_files_id_seq; Type: SEQUENCE; Schema: challenge; Owner: -
--

CREATE SEQUENCE challenge.coding_files_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: coding_files_id_seq; Type: SEQUENCE OWNED BY; Schema: challenge; Owner: -
--

ALTER SEQUENCE challenge.coding_files_id_seq OWNED BY challenge.coding_files.id;


--
-- Name: coding_workspace_files; Type: TABLE; Schema: challenge; Owner: -
--

CREATE TABLE challenge.coding_workspace_files (
    id bigint NOT NULL,
    workspace_id bigint NOT NULL,
    file_path character varying(255) NOT NULL,
    asset_id bigint NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    file_size bigint,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_workspace_file_size CHECK (((file_size IS NULL) OR (file_size >= 0))),
    CONSTRAINT chk_workspace_file_version CHECK ((version > 0))
);


--
-- Name: coding_workspace_files_id_seq; Type: SEQUENCE; Schema: challenge; Owner: -
--

CREATE SEQUENCE challenge.coding_workspace_files_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: coding_workspace_files_id_seq; Type: SEQUENCE OWNED BY; Schema: challenge; Owner: -
--

ALTER SEQUENCE challenge.coding_workspace_files_id_seq OWNED BY challenge.coding_workspace_files.id;


--
-- Name: coding_workspaces; Type: TABLE; Schema: challenge; Owner: -
--

CREATE TABLE challenge.coding_workspaces (
    id bigint NOT NULL,
    public_id character varying(50) NOT NULL,
    challenge_id bigint NOT NULL,
    user_id bigint NOT NULL,
    language character varying(50) DEFAULT 'javascript'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone
);


--
-- Name: coding_workspaces_id_seq; Type: SEQUENCE; Schema: challenge; Owner: -
--

CREATE SEQUENCE challenge.coding_workspaces_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: coding_workspaces_id_seq; Type: SEQUENCE OWNED BY; Schema: challenge; Owner: -
--

ALTER SEQUENCE challenge.coding_workspaces_id_seq OWNED BY challenge.coding_workspaces.id;


--
-- Name: question_options; Type: TABLE; Schema: challenge; Owner: -
--

CREATE TABLE challenge.question_options (
    question_id bigint NOT NULL,
    option_text text NOT NULL,
    is_correct boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone,
    id bigint NOT NULL
);


--
-- Name: question_options_id_seq; Type: SEQUENCE; Schema: challenge; Owner: -
--

CREATE SEQUENCE challenge.question_options_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: question_options_id_seq; Type: SEQUENCE OWNED BY; Schema: challenge; Owner: -
--

ALTER SEQUENCE challenge.question_options_id_seq OWNED BY challenge.question_options.id;


--
-- Name: question_submissions; Type: TABLE; Schema: challenge; Owner: -
--

CREATE TABLE challenge.question_submissions (
    user_id bigint NOT NULL,
    question_id bigint NOT NULL,
    question_option_id bigint,
    is_correct boolean NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: questions; Type: TABLE; Schema: challenge; Owner: -
--

CREATE TABLE challenge.questions (
    challenge_id bigint NOT NULL,
    question text NOT NULL,
    type public.question_type NOT NULL,
    explanation text,
    order_index integer,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone,
    id bigint NOT NULL,
    points integer DEFAULT 10
);


--
-- Name: questions_id_seq; Type: SEQUENCE; Schema: challenge; Owner: -
--

CREATE SEQUENCE challenge.questions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: questions_id_seq; Type: SEQUENCE OWNED BY; Schema: challenge; Owner: -
--

ALTER SEQUENCE challenge.questions_id_seq OWNED BY challenge.questions.id;


--
-- Name: cart_items; Type: TABLE; Schema: commerce; Owner: -
--

CREATE TABLE commerce.cart_items (
    user_id bigint NOT NULL,
    course_id bigint NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: entitlement; Type: TABLE; Schema: commerce; Owner: -
--

CREATE TABLE commerce.entitlement (
    id bigint NOT NULL,
    public_id character varying(50) NOT NULL,
    user_id bigint NOT NULL,
    course_id bigint NOT NULL,
    source character varying(20) NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    order_id bigint,
    granted_by bigint,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone,
    revoke_reason character varying(50),
    CONSTRAINT chk_entitlement_order CHECK ((((source)::text <> ALL ((ARRAY['purchase'::character varying, 'points'::character varying])::text[])) OR (order_id IS NOT NULL))),
    CONSTRAINT chk_entitlement_revoked CHECK ((((status)::text <> 'revoked'::text) OR (revoked_at IS NOT NULL))),
    CONSTRAINT chk_entitlement_source CHECK (((source)::text = ANY ((ARRAY['free'::character varying, 'purchase'::character varying, 'points'::character varying, 'admin_grant'::character varying, 'subscription'::character varying, 'bundle'::character varying])::text[]))),
    CONSTRAINT chk_entitlement_status CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'revoked'::character varying, 'expired'::character varying])::text[])))
);


--
-- Name: TABLE entitlement; Type: COMMENT; Schema: commerce; Owner: -
--

COMMENT ON TABLE commerce.entitlement IS 'Course access. Checked by public.has_course_access for courses, lessons and challenges';


--
-- Name: entitlement_id_seq; Type: SEQUENCE; Schema: commerce; Owner: -
--

ALTER TABLE commerce.entitlement ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME commerce.entitlement_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: offer; Type: TABLE; Schema: commerce; Owner: -
--

CREATE TABLE commerce.offer (
    id bigint NOT NULL,
    public_id character varying(50) NOT NULL,
    course_id bigint NOT NULL,
    price_type character varying(10) NOT NULL,
    amount bigint NOT NULL,
    currency character(3),
    is_active boolean DEFAULT true NOT NULL,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deactivated_at timestamp with time zone,
    CONSTRAINT chk_offer_amount CHECK ((amount > 0)),
    CONSTRAINT chk_offer_currency CHECK (((((price_type)::text = 'money'::text) AND (currency ~ '^[A-Z]{3}$'::text)) OR (((price_type)::text = 'points'::text) AND (currency IS NULL)))),
    CONSTRAINT chk_offer_price_type CHECK (((price_type)::text = ANY ((ARRAY['money'::character varying, 'points'::character varying])::text[])))
);


--
-- Name: TABLE offer; Type: COMMENT; Schema: commerce; Owner: -
--

COMMENT ON TABLE commerce.offer IS 'Course prices. money: amount in minor units of currency; points: amount in points. Never updated in place except to deactivate';


--
-- Name: offer_id_seq; Type: SEQUENCE; Schema: commerce; Owner: -
--

ALTER TABLE commerce.offer ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME commerce.offer_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: order_items; Type: TABLE; Schema: commerce; Owner: -
--

CREATE TABLE commerce.order_items (
    id bigint NOT NULL,
    order_id bigint NOT NULL,
    course_id bigint NOT NULL,
    price numeric(12,2) DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    offer_id bigint,
    amount_minor bigint,
    points bigint,
    CONSTRAINT chk_order_items_amounts CHECK (((COALESCE(amount_minor, (0)::bigint) >= 0) AND (COALESCE(points, (0)::bigint) >= 0))),
    CONSTRAINT order_items_price_check CHECK ((price >= (0)::numeric))
);


--
-- Name: order_items_id_seq; Type: SEQUENCE; Schema: commerce; Owner: -
--

ALTER TABLE commerce.order_items ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME commerce.order_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: orders; Type: TABLE; Schema: commerce; Owner: -
--

CREATE TABLE commerce.orders (
    id bigint NOT NULL,
    public_id character varying(50) NOT NULL,
    user_id bigint NOT NULL,
    status public.order_status DEFAULT 'pending'::public.order_status NOT NULL,
    payment_method public.payment_method DEFAULT 'banking'::public.payment_method NOT NULL,
    total numeric(12,2) DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone,
    currency character(3),
    amount_minor bigint,
    points_total bigint,
    idempotency_key character varying(100),
    expires_at timestamp with time zone,
    paid_at timestamp with time zone,
    failed_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    refunded_at timestamp with time zone,
    failure_reason character varying(100),
    CONSTRAINT chk_orders_amounts CHECK (((COALESCE(amount_minor, (0)::bigint) >= 0) AND (COALESCE(points_total, (0)::bigint) >= 0))),
    CONSTRAINT chk_orders_currency CHECK (((currency IS NULL) OR (currency ~ '^[A-Z]{3}$'::text))),
    CONSTRAINT orders_total_check CHECK ((total >= (0)::numeric))
);


--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: commerce; Owner: -
--

ALTER TABLE commerce.orders ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME commerce.orders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: payment; Type: TABLE; Schema: commerce; Owner: -
--

CREATE TABLE commerce.payment (
    id bigint NOT NULL,
    public_id character varying(50) NOT NULL,
    order_id bigint NOT NULL,
    provider character varying(30) NOT NULL,
    provider_ref character varying(255),
    checkout_url text,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    amount_minor bigint NOT NULL,
    currency character(3) NOT NULL,
    failure_code character varying(100),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    succeeded_at timestamp with time zone,
    refunded_at timestamp with time zone,
    CONSTRAINT chk_payment_amount CHECK ((amount_minor > 0)),
    CONSTRAINT chk_payment_currency CHECK ((currency ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT chk_payment_provider CHECK (((provider)::text ~ '^[a-z0-9_]+$'::text)),
    CONSTRAINT chk_payment_status CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'succeeded'::character varying, 'failed'::character varying, 'cancelled'::character varying, 'refunded'::character varying, 'disputed'::character varying])::text[])))
);


--
-- Name: payment_event; Type: TABLE; Schema: commerce; Owner: -
--

CREATE TABLE commerce.payment_event (
    id bigint NOT NULL,
    provider character varying(30) NOT NULL,
    event_id character varying(255) NOT NULL,
    event_type character varying(50) NOT NULL,
    provider_ref character varying(255),
    payment_id bigint,
    payload_sha256 character(64) NOT NULL,
    result character varying(40),
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone
);


--
-- Name: TABLE payment_event; Type: COMMENT; Schema: commerce; Owner: -
--

COMMENT ON TABLE commerce.payment_event IS 'Verified webhook deliveries; the unique key makes duplicate deliveries no-ops. Raw payloads are not stored';


--
-- Name: payment_event_id_seq; Type: SEQUENCE; Schema: commerce; Owner: -
--

ALTER TABLE commerce.payment_event ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME commerce.payment_event_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: payment_id_seq; Type: SEQUENCE; Schema: commerce; Owner: -
--

ALTER TABLE commerce.payment ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME commerce.payment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: comment; Type: TABLE; Schema: community; Owner: -
--

CREATE TABLE community.comment (
    public_id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id bigint NOT NULL,
    reference_id bigint NOT NULL,
    content text NOT NULL,
    upvotes bigint DEFAULT 0,
    downvotes bigint DEFAULT 0,
    is_hidden boolean DEFAULT false,
    is_deleted boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    rating integer DEFAULT 1 NOT NULL,
    id bigint NOT NULL,
    CONSTRAINT chk_comment_rating CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: comment_id_seq; Type: SEQUENCE; Schema: community; Owner: -
--

ALTER TABLE community.comment ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME community.comment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: event; Type: TABLE; Schema: community; Owner: -
--

CREATE TABLE community.event (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject character varying(255) NOT NULL,
    content text NOT NULL,
    upvotes bigint DEFAULT 0,
    downvotes bigint DEFAULT 0,
    is_hidden boolean DEFAULT false,
    is_deleted boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    created_by bigint NOT NULL
);


--
-- Name: event_join; Type: TABLE; Schema: community; Owner: -
--

CREATE TABLE community.event_join (
    is_cancelled boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    user_id bigint NOT NULL,
    event_id uuid NOT NULL
);


--
-- Name: feedback; Type: TABLE; Schema: community; Owner: -
--

CREATE TABLE community.feedback (
    title character varying(255) NOT NULL,
    feedback text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id bigint
);


--
-- Name: friend; Type: TABLE; Schema: community; Owner: -
--

CREATE TABLE community.friend (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sender_id bigint NOT NULL,
    receiver_id bigint NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    status public.status_friend_request_enum NOT NULL,
    CONSTRAINT chk_friend_not_self CHECK ((sender_id <> receiver_id))
);


--
-- Name: messages; Type: TABLE; Schema: community; Owner: -
--

CREATE TABLE community.messages (
    id integer NOT NULL,
    message text NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    sender_id bigint NOT NULL,
    receiver_id bigint NOT NULL,
    read_at timestamp without time zone
);


--
-- Name: messages_id_seq; Type: SEQUENCE; Schema: community; Owner: -
--

CREATE SEQUENCE community.messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: messages_id_seq; Type: SEQUENCE OWNED BY; Schema: community; Owner: -
--

ALTER SEQUENCE community.messages_id_seq OWNED BY community.messages.id;


--
-- Name: team; Type: TABLE; Schema: community; Owner: -
--

CREATE TABLE community.team (
    id character varying(50) NOT NULL,
    name character varying(20) NOT NULL,
    size integer NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    image_url text DEFAULT '/image/static/default.svg'::text,
    description text,
    updated_at timestamp without time zone,
    host_id bigint NOT NULL,
    CONSTRAINT chk_team_size CHECK (((size >= 2) AND (size <= 5)))
);


--
-- Name: team_members; Type: TABLE; Schema: community; Owner: -
--

CREATE TABLE community.team_members (
    id bigint NOT NULL,
    team_id character varying(50) NOT NULL,
    user_id bigint NOT NULL,
    status public.join_team_status DEFAULT 'pending'::public.join_team_status NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone
);


--
-- Name: team_members_id_seq; Type: SEQUENCE; Schema: community; Owner: -
--

ALTER TABLE community.team_members ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME community.team_members_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: voting; Type: TABLE; Schema: community; Owner: -
--

CREATE TABLE community.voting (
    user_id bigint NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    reference_id bigint NOT NULL,
    voting public.voting_enum NOT NULL,
    updated_at timestamp without time zone
);


--
-- Name: lesson; Type: TABLE; Schema: course; Owner: -
--

CREATE TABLE course.lesson (
    module_id bigint NOT NULL,
    title character varying(255) NOT NULL,
    content_type character varying(50),
    content_source text,
    order_index integer NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    is_hidden boolean DEFAULT false NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    id bigint NOT NULL
);


--
-- Name: lesson_id_seq; Type: SEQUENCE; Schema: course; Owner: -
--

CREATE SEQUENCE course.lesson_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: lesson_id_seq; Type: SEQUENCE OWNED BY; Schema: course; Owner: -
--

ALTER SEQUENCE course.lesson_id_seq OWNED BY course.lesson.id;


--
-- Name: module; Type: TABLE; Schema: course; Owner: -
--

CREATE TABLE course.module (
    course_id bigint NOT NULL,
    title character varying(255) NOT NULL,
    order_index integer NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    lessons integer DEFAULT 0 NOT NULL,
    updated_at timestamp without time zone DEFAULT now(),
    is_hidden boolean DEFAULT false NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    id bigint NOT NULL
);


--
-- Name: module_id_seq; Type: SEQUENCE; Schema: course; Owner: -
--

CREATE SEQUENCE course.module_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: module_id_seq; Type: SEQUENCE OWNED BY; Schema: course; Owner: -
--

ALTER SEQUENCE course.module_id_seq OWNED BY course.module.id;


--
-- Name: accounts; Type: TABLE; Schema: identity; Owner: -
--

CREATE TABLE identity.accounts (
    id integer NOT NULL,
    user_id bigint NOT NULL,
    provider_account_id character varying(255),
    is_authenticated boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    password_hash text,
    provider public.provider_enum,
    provider_email character varying(255)
);


--
-- Name: accounts_id_seq; Type: SEQUENCE; Schema: identity; Owner: -
--

CREATE SEQUENCE identity.accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: identity; Owner: -
--

ALTER SEQUENCE identity.accounts_id_seq OWNED BY identity.accounts.id;


--
-- Name: audit_log; Type: TABLE; Schema: identity; Owner: -
--

CREATE TABLE identity.audit_log (
    id bigint NOT NULL,
    actor_id bigint,
    action character varying(60) NOT NULL,
    target_type character varying(40) NOT NULL,
    target_id character varying(100) NOT NULL,
    reason text,
    before jsonb,
    after jsonb,
    ip_address character varying(64),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE audit_log; Type: COMMENT; Schema: identity; Owner: -
--

COMMENT ON TABLE identity.audit_log IS 'Append-only log of privileged (admin / course manager) actions';


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: identity; Owner: -
--

ALTER TABLE identity.audit_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME identity.audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: auth_outbox; Type: TABLE; Schema: identity; Owner: -
--

CREATE TABLE identity.auth_outbox (
    id bigint NOT NULL,
    event_type character varying(50) NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    available_at timestamp with time zone DEFAULT now() NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    processed_at timestamp with time zone
);


--
-- Name: auth_outbox_id_seq; Type: SEQUENCE; Schema: identity; Owner: -
--

ALTER TABLE identity.auth_outbox ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME identity.auth_outbox_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: email_tokens; Type: TABLE; Schema: identity; Owner: -
--

CREATE TABLE identity.email_tokens (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    purpose text NOT NULL,
    email character varying(255) NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_tokens_purpose_check CHECK ((purpose = 'verify_email'::text))
);


--
-- Name: email_tokens_id_seq; Type: SEQUENCE; Schema: identity; Owner: -
--

CREATE SEQUENCE identity.email_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: email_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: identity; Owner: -
--

ALTER SEQUENCE identity.email_tokens_id_seq OWNED BY identity.email_tokens.id;


--
-- Name: permissions; Type: TABLE; Schema: identity; Owner: -
--

CREATE TABLE identity.permissions (
    id bigint NOT NULL,
    resource character varying(100) NOT NULL,
    action character varying(50) NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone
);


--
-- Name: permissions_id_seq; Type: SEQUENCE; Schema: identity; Owner: -
--

CREATE SEQUENCE identity.permissions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: identity; Owner: -
--

ALTER SEQUENCE identity.permissions_id_seq OWNED BY identity.permissions.id;


--
-- Name: refresh_tokens; Type: TABLE; Schema: identity; Owner: -
--

CREATE TABLE identity.refresh_tokens (
    id bigint NOT NULL,
    session_id bigint NOT NULL,
    refresh_token_hash character varying NOT NULL,
    rotated_at timestamp with time zone,
    rotated_to_token_id bigint,
    created_at timestamp with time zone,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    revoked_at timestamp with time zone,
    replaced_by_id bigint,
    recovery_key_hash character varying(64),
    recovery_sealed text,
    recovery_expires_at timestamp with time zone
);


--
-- Name: role_permissions; Type: TABLE; Schema: identity; Owner: -
--

CREATE TABLE identity.role_permissions (
    role_id bigint NOT NULL,
    permission_id bigint NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: roles; Type: TABLE; Schema: identity; Owner: -
--

CREATE TABLE identity.roles (
    id bigint NOT NULL,
    code character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone
);


--
-- Name: roles_id_seq; Type: SEQUENCE; Schema: identity; Owner: -
--

CREATE SEQUENCE identity.roles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: roles_id_seq; Type: SEQUENCE OWNED BY; Schema: identity; Owner: -
--

ALTER SEQUENCE identity.roles_id_seq OWNED BY identity.roles.id;


--
-- Name: sessions; Type: TABLE; Schema: identity; Owner: -
--

CREATE TABLE identity.sessions (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    is_revoked boolean DEFAULT false,
    user_agent character varying(255),
    last_seen_at timestamp with time zone,
    last_refreshed_at timestamp with time zone,
    idle_expires_at timestamp with time zone NOT NULL,
    absolute_expires_at timestamp with time zone NOT NULL,
    revoke_reason character varying(50),
    ip_address character varying(64)
);


--
-- Name: user_roles; Type: TABLE; Schema: identity; Owner: -
--

CREATE TABLE identity.user_roles (
    user_id bigint NOT NULL,
    role_id bigint NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: identity; Owner: -
--

CREATE TABLE identity.users (
    public_id character varying(50) NOT NULL,
    username character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    status public.user_status_enum DEFAULT 'active'::public.user_status_enum NOT NULL,
    id bigint NOT NULL,
    email character varying(255) NOT NULL,
    email_verified boolean DEFAULT false
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: identity; Owner: -
--

CREATE SEQUENCE identity.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: identity; Owner: -
--

ALTER SEQUENCE identity.users_id_seq OWNED BY identity.users.id;


--
-- Name: favorite; Type: TABLE; Schema: learning; Owner: -
--

CREATE TABLE learning.favorite (
    id bigint NOT NULL,
    course_id bigint NOT NULL,
    user_id bigint NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: favorite_id_seq; Type: SEQUENCE; Schema: learning; Owner: -
--

ALTER TABLE learning.favorite ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME learning.favorite_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: history; Type: TABLE; Schema: learning; Owner: -
--

CREATE TABLE learning.history (
    user_id bigint NOT NULL,
    course_id bigint NOT NULL,
    lesson_id bigint NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone,
    module_id bigint NOT NULL,
    last_seen timestamp without time zone,
    status public.status_progress_enum DEFAULT 'enrolled'::public.status_progress_enum NOT NULL
);


--
-- Name: recovery; Type: TABLE; Schema: learning; Owner: -
--

CREATE TABLE learning.recovery (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id bigint NOT NULL,
    course_id bigint NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    module_id bigint NOT NULL,
    lesson_id bigint NOT NULL,
    status public.status_progress_enum NOT NULL
);


--
-- Name: register; Type: TABLE; Schema: learning; Owner: -
--

CREATE TABLE learning.register (
    user_id bigint NOT NULL,
    course_id bigint NOT NULL,
    progress integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    is_marked boolean DEFAULT false,
    last_seen timestamp with time zone,
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,
    is_archived boolean DEFAULT false,
    status public.status_course_enum DEFAULT 'enrolled'::public.status_course_enum,
    CONSTRAINT chk_register_progress CHECK ((progress >= 0))
);


--
-- Name: user_progress; Type: VIEW; Schema: learning; Owner: -
--

CREATE VIEW learning.user_progress AS
 SELECT c.public_id AS id,
    c.title,
    c.concept,
    c.image,
    c.level,
    c.rating,
    c.description,
    c.modules,
    c.lessons,
    c.duration,
    c.instructor,
    c.students,
    c.reviews,
    c.cost,
    c.point_price AS points,
    c.reward,
    c.is_hidden AS c_hidden,
    c.is_deleted AS c_deleted,
    r.status,
    r.progress,
    r.last_seen,
    r.is_deleted AS r_deleted,
    u.public_id AS user_id,
    l.color AS language_color,
    l.name AS language_name,
    l.logo AS language_logo,
    cat.name AS category_name,
    f.id AS is_favorite
   FROM (((((learning.register r
     JOIN identity.users u ON ((u.id = r.user_id)))
     JOIN catalog.course c ON ((c.id = r.course_id)))
     JOIN catalog.language l ON ((l.id = c.language_id)))
     JOIN catalog.category cat ON ((cat.id = c.category_id)))
     LEFT JOIN learning.favorite f ON (((f.course_id = c.id) AND (f.user_id = r.user_id))));


--
-- Name: exp_transaction; Type: TABLE; Schema: profile; Owner: -
--

CREATE TABLE profile.exp_transaction (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id bigint NOT NULL,
    amount integer NOT NULL,
    source_type character varying(20) NOT NULL,
    source_id bigint,
    rule_key character varying(60),
    exp_after bigint NOT NULL,
    idempotency_key character varying(120),
    actor_id bigint,
    reason text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_exp_transaction_adjustment CHECK ((((source_type)::text <> 'adjustment'::text) OR ((reason IS NOT NULL) AND (length(btrim(reason)) > 0)))),
    CONSTRAINT chk_exp_transaction_source CHECK ((((source_type)::text = 'adjustment'::text) OR (source_id IS NOT NULL))),
    CONSTRAINT exp_transaction_amount_check CHECK ((amount <> 0)),
    CONSTRAINT exp_transaction_exp_after_check CHECK ((exp_after >= 0)),
    CONSTRAINT exp_transaction_source_type_check CHECK (((source_type)::text = ANY ((ARRAY['lesson'::character varying, 'challenge'::character varying, 'course'::character varying, 'adjustment'::character varying])::text[])))
);


--
-- Name: info; Type: TABLE; Schema: profile; Owner: -
--

CREATE TABLE profile.info (
    surname character varying(30) NOT NULL,
    name character varying(30) NOT NULL,
    image text,
    nickname character varying(30) DEFAULT 'None'::character varying,
    phone character varying(10),
    rank integer DEFAULT 0,
    bio text DEFAULT 'No thing'::text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    user_id bigint NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    level public.level_enum DEFAULT 'beginner'::public.level_enum,
    points bigint DEFAULT 0,
    avatar_asset_id bigint,
    exp bigint DEFAULT 0 NOT NULL,
    exp_level integer DEFAULT 1 NOT NULL,
    show_profile boolean DEFAULT true NOT NULL,
    show_learning boolean DEFAULT false NOT NULL,
    show_on_leaderboard boolean DEFAULT true NOT NULL,
    CONSTRAINT chk_info_counters CHECK (((rank >= 0) AND (points >= 0))),
    CONSTRAINT chk_info_exp CHECK (((exp >= 0) AND (exp_level >= 1)))
);


--
-- Name: COLUMN info.avatar_asset_id; Type: COMMENT; Schema: profile; Owner: -
--

COMMENT ON COLUMN profile.info.avatar_asset_id IS 'Uploaded avatar (storage.assets); NULL when image is an OAuth provider URL or empty';


--
-- Name: exp_drift; Type: VIEW; Schema: profile; Owner: -
--

CREATE VIEW profile.exp_drift AS
 SELECT i.user_id,
    i.exp AS cached_exp,
    COALESCE(l.ledger_exp, (0)::bigint) AS ledger_exp
   FROM (profile.info i
     LEFT JOIN ( SELECT exp_transaction.user_id,
            sum(exp_transaction.amount) AS ledger_exp
           FROM profile.exp_transaction
          GROUP BY exp_transaction.user_id) l ON ((l.user_id = i.user_id)))
  WHERE (i.exp <> COALESCE(l.ledger_exp, (0)::bigint));


--
-- Name: exp_level; Type: TABLE; Schema: profile; Owner: -
--

CREATE TABLE profile.exp_level (
    level integer NOT NULL,
    title character varying(60) NOT NULL,
    min_exp bigint NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT exp_level_level_check CHECK ((level >= 1)),
    CONSTRAINT exp_level_min_exp_check CHECK ((min_exp >= 0))
);


--
-- Name: exp_rule; Type: TABLE; Schema: profile; Owner: -
--

CREATE TABLE profile.exp_rule (
    rule_key character varying(60) NOT NULL,
    amount integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT exp_rule_amount_check CHECK ((amount > 0))
);


--
-- Name: learning_preference; Type: TABLE; Schema: profile; Owner: -
--

CREATE TABLE profile.learning_preference (
    user_id bigint NOT NULL,
    career_role_id integer,
    experience_level character varying(20),
    preferred_language_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_learning_preference_level CHECK (((experience_level IS NULL) OR ((experience_level)::text = ANY ((ARRAY['beginner'::character varying, 'junior'::character varying, 'intermediate'::character varying, 'advanced'::character varying])::text[]))))
);


--
-- Name: COLUMN learning_preference.preferred_language_id; Type: COMMENT; Schema: profile; Owner: -
--

COMMENT ON COLUMN profile.learning_preference.preferred_language_id IS 'Optional: programming language favoured by recommendations';


--
-- Name: notification; Type: TABLE; Schema: profile; Owner: -
--

CREATE TABLE profile.notification (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id bigint NOT NULL,
    message text NOT NULL,
    has_seen boolean DEFAULT false,
    is_archive boolean DEFAULT false,
    is_deleted boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: onboarding; Type: TABLE; Schema: profile; Owner: -
--

CREATE TABLE profile.onboarding (
    user_id bigint NOT NULL,
    status character varying(20) DEFAULT 'not_started'::character varying NOT NULL,
    current_step character varying(20) DEFAULT 'role'::character varying NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    skipped_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_onboarding_completed_at CHECK ((((status)::text <> 'completed'::text) OR (completed_at IS NOT NULL))),
    CONSTRAINT chk_onboarding_skipped_at CHECK ((((status)::text <> 'skipped'::text) OR (skipped_at IS NOT NULL))),
    CONSTRAINT chk_onboarding_status CHECK (((status)::text = ANY ((ARRAY['not_started'::character varying, 'in_progress'::character varying, 'skipped'::character varying, 'completed'::character varying])::text[]))),
    CONSTRAINT chk_onboarding_step CHECK (((current_step)::text = ANY ((ARRAY['role'::character varying, 'industry'::character varying, 'level_goals'::character varying, 'review'::character varying, 'recommendations'::character varying])::text[])))
);


--
-- Name: TABLE onboarding; Type: COMMENT; Schema: profile; Owner: -
--

COMMENT ON TABLE profile.onboarding IS 'Explicit onboarding state per user; current_step is where an in-progress onboarding resumes';


--
-- Name: point_transaction; Type: TABLE; Schema: profile; Owner: -
--

CREATE TABLE profile.point_transaction (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id bigint NOT NULL,
    amount bigint NOT NULL,
    action character varying NOT NULL,
    source_type character varying NOT NULL,
    source_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    entry_type character varying(20) NOT NULL,
    balance_after bigint,
    idempotency_key character varying(120),
    order_id bigint,
    actor_id bigint,
    reason text,
    CONSTRAINT check_amount CHECK ((amount > 0)),
    CONSTRAINT chk_point_transaction_action CHECK (((action)::text = ANY ((ARRAY['credit'::character varying, 'debit'::character varying])::text[]))),
    CONSTRAINT chk_point_transaction_balance CHECK (((balance_after IS NULL) OR (balance_after >= 0))),
    CONSTRAINT chk_point_transaction_entry_type CHECK (((((entry_type)::text = ANY ((ARRAY['earned'::character varying, 'refunded'::character varying])::text[])) AND ((action)::text = 'credit'::text)) OR (((entry_type)::text = ANY ((ARRAY['spent'::character varying, 'expired'::character varying])::text[])) AND ((action)::text = 'debit'::text)) OR ((entry_type)::text = 'adjusted'::text)))
);


--
-- Name: point_balance_drift; Type: VIEW; Schema: profile; Owner: -
--

CREATE VIEW profile.point_balance_drift AS
 SELECT i.user_id,
    COALESCE(i.points, (0)::bigint) AS cached_points,
    COALESCE(l.ledger_points, (0)::numeric) AS ledger_points
   FROM (profile.info i
     LEFT JOIN ( SELECT point_transaction.user_id,
            sum(
                CASE
                    WHEN ((point_transaction.action)::text = 'credit'::text) THEN point_transaction.amount
                    ELSE (- point_transaction.amount)
                END) AS ledger_points
           FROM profile.point_transaction
          GROUP BY point_transaction.user_id) l ON ((l.user_id = i.user_id)))
  WHERE ((COALESCE(i.points, (0)::bigint))::numeric <> COALESCE(l.ledger_points, (0)::numeric));


--
-- Name: rank_tier; Type: TABLE; Schema: profile; Owner: -
--

CREATE TABLE profile.rank_tier (
    kind character varying(10) NOT NULL,
    tier integer NOT NULL,
    title character varying(40) NOT NULL,
    min_score bigint NOT NULL,
    CONSTRAINT rank_tier_kind_check CHECK (((kind)::text = ANY ((ARRAY['overall'::character varying, 'exp'::character varying, 'points'::character varying])::text[]))),
    CONSTRAINT rank_tier_min_score_check CHECK ((min_score >= 0)),
    CONSTRAINT rank_tier_tier_check CHECK ((tier >= 1))
);


--
-- Name: task; Type: TABLE; Schema: profile; Owner: -
--

CREATE TABLE profile.task (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id bigint NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    status public.task_status_enum NOT NULL,
    priority public.task_priority_enum NOT NULL
);


--
-- Name: user_industry; Type: TABLE; Schema: profile; Owner: -
--

CREATE TABLE profile.user_industry (
    user_id bigint NOT NULL,
    industry_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_learning_goal; Type: TABLE; Schema: profile; Owner: -
--

CREATE TABLE profile.user_learning_goal (
    user_id bigint NOT NULL,
    learning_goal_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version character varying(12) NOT NULL,
    name text NOT NULL,
    checksum character(64) NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_by text
);


--
-- Name: node_course; Type: TABLE; Schema: roadmap; Owner: -
--

CREATE TABLE roadmap.node_course (
    node_id bigint NOT NULL,
    course_id bigint NOT NULL,
    priority integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: nodes; Type: TABLE; Schema: roadmap; Owner: -
--

CREATE TABLE roadmap.nodes (
    roadmap_id bigint NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone,
    order_index integer DEFAULT 0,
    id bigint NOT NULL
);


--
-- Name: roadmap_nodes_id_seq; Type: SEQUENCE; Schema: roadmap; Owner: -
--

CREATE SEQUENCE roadmap.roadmap_nodes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: roadmap_nodes_id_seq; Type: SEQUENCE OWNED BY; Schema: roadmap; Owner: -
--

ALTER SEQUENCE roadmap.roadmap_nodes_id_seq OWNED BY roadmap.nodes.id;


--
-- Name: roadmap_users; Type: TABLE; Schema: roadmap; Owner: -
--

CREATE TABLE roadmap.roadmap_users (
    user_id bigint NOT NULL,
    roadmap_id bigint NOT NULL,
    completed_nodes integer DEFAULT 0,
    total_nodes integer DEFAULT 0,
    progress_percent numeric(5,2) DEFAULT 0,
    current_node_id bigint NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone
);


--
-- Name: roadmaps; Type: TABLE; Schema: roadmap; Owner: -
--

CREATE TABLE roadmap.roadmaps (
    title character varying(255) NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone,
    public_id uuid DEFAULT gen_random_uuid(),
    id bigint NOT NULL,
    level public.level_enum,
    career_role_id integer
);


--
-- Name: roadmaps_id_seq; Type: SEQUENCE; Schema: roadmap; Owner: -
--

CREATE SEQUENCE roadmap.roadmaps_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: roadmaps_id_seq; Type: SEQUENCE OWNED BY; Schema: roadmap; Owner: -
--

ALTER SEQUENCE roadmap.roadmaps_id_seq OWNED BY roadmap.roadmaps.id;


--
-- Name: user_progress; Type: TABLE; Schema: roadmap; Owner: -
--

CREATE TABLE roadmap.user_progress (
    user_id bigint NOT NULL,
    roadmap_id bigint NOT NULL,
    node_id bigint NOT NULL,
    is_completed boolean DEFAULT false,
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: assets; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.assets (
    id bigint NOT NULL,
    public_id character varying(100) NOT NULL,
    provider character varying(30) NOT NULL,
    object_key text,
    external_url text,
    resource_type character varying(50) NOT NULL,
    mine_type character varying(100),
    file_size bigint,
    original_name character varying(100),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone,
    owner_id bigint,
    purpose character varying(30),
    width integer,
    height integer,
    format character varying(20),
    version bigint,
    checksum character varying(64),
    deleted_at timestamp with time zone,
    CONSTRAINT chk_assets_dimensions CHECK ((((width IS NULL) OR (width > 0)) AND ((height IS NULL) OR (height > 0)))),
    CONSTRAINT chk_assets_provider CHECK (((provider)::text = ANY ((ARRAY['s3'::character varying, 'cloudinary'::character varying])::text[])))
);


--
-- Name: COLUMN assets.object_key; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.assets.object_key IS 'S3 object key, or the Cloudinary public_id';


--
-- Name: COLUMN assets.external_url; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.assets.external_url IS 'Delivery URL (Cloudinary secure_url); NULL for S3 objects read through the API';


--
-- Name: COLUMN assets.mine_type; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.assets.mine_type IS 'MIME type (column name misspelled historically; kept for compatibility)';


--
-- Name: COLUMN assets.owner_id; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.assets.owner_id IS 'Uploading user, NULL for platform content (seeded challenge files)';


--
-- Name: COLUMN assets.purpose; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.assets.purpose IS 'avatar | challenge_file | submission | ...';


--
-- Name: COLUMN assets.version; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.assets.version IS 'Cloudinary version of the stored file';


--
-- Name: COLUMN assets.checksum; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.assets.checksum IS 'SHA-256 (hex) of the uploaded bytes';


--
-- Name: COLUMN assets.deleted_at; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.assets.deleted_at IS 'Set when the file was replaced / removed from the provider';


--
-- Name: assets_id_seq; Type: SEQUENCE; Schema: storage; Owner: -
--

ALTER TABLE storage.assets ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME storage.assets_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: category id; Type: DEFAULT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.category ALTER COLUMN id SET DEFAULT nextval('catalog.category_id_seq'::regclass);


--
-- Name: course id; Type: DEFAULT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.course ALTER COLUMN id SET DEFAULT nextval('catalog.course_id_seq'::regclass);


--
-- Name: language id; Type: DEFAULT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.language ALTER COLUMN id SET DEFAULT nextval('catalog.language_id_seq'::regclass);


--
-- Name: challenge_test_cases id; Type: DEFAULT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.challenge_test_cases ALTER COLUMN id SET DEFAULT nextval('challenge.challenge_test_cases_id_seq'::regclass);


--
-- Name: challenges id; Type: DEFAULT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.challenges ALTER COLUMN id SET DEFAULT nextval('challenge.challenges_id_seq'::regclass);


--
-- Name: code_run_test_results id; Type: DEFAULT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.code_run_test_results ALTER COLUMN id SET DEFAULT nextval('challenge.code_run_test_results_id_seq'::regclass);


--
-- Name: code_runs id; Type: DEFAULT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.code_runs ALTER COLUMN id SET DEFAULT nextval('challenge.code_runs_id_seq'::regclass);


--
-- Name: code_submissions id; Type: DEFAULT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.code_submissions ALTER COLUMN id SET DEFAULT nextval('challenge.code_submissions_id_seq'::regclass);


--
-- Name: coding_files id; Type: DEFAULT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.coding_files ALTER COLUMN id SET DEFAULT nextval('challenge.coding_files_id_seq'::regclass);


--
-- Name: coding_workspace_files id; Type: DEFAULT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.coding_workspace_files ALTER COLUMN id SET DEFAULT nextval('challenge.coding_workspace_files_id_seq'::regclass);


--
-- Name: coding_workspaces id; Type: DEFAULT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.coding_workspaces ALTER COLUMN id SET DEFAULT nextval('challenge.coding_workspaces_id_seq'::regclass);


--
-- Name: question_options id; Type: DEFAULT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.question_options ALTER COLUMN id SET DEFAULT nextval('challenge.question_options_id_seq'::regclass);


--
-- Name: questions id; Type: DEFAULT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.questions ALTER COLUMN id SET DEFAULT nextval('challenge.questions_id_seq'::regclass);


--
-- Name: messages id; Type: DEFAULT; Schema: community; Owner: -
--

ALTER TABLE ONLY community.messages ALTER COLUMN id SET DEFAULT nextval('community.messages_id_seq'::regclass);


--
-- Name: lesson id; Type: DEFAULT; Schema: course; Owner: -
--

ALTER TABLE ONLY course.lesson ALTER COLUMN id SET DEFAULT nextval('course.lesson_id_seq'::regclass);


--
-- Name: module id; Type: DEFAULT; Schema: course; Owner: -
--

ALTER TABLE ONLY course.module ALTER COLUMN id SET DEFAULT nextval('course.module_id_seq'::regclass);


--
-- Name: accounts id; Type: DEFAULT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.accounts ALTER COLUMN id SET DEFAULT nextval('identity.accounts_id_seq'::regclass);


--
-- Name: email_tokens id; Type: DEFAULT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.email_tokens ALTER COLUMN id SET DEFAULT nextval('identity.email_tokens_id_seq'::regclass);


--
-- Name: permissions id; Type: DEFAULT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.permissions ALTER COLUMN id SET DEFAULT nextval('identity.permissions_id_seq'::regclass);


--
-- Name: roles id; Type: DEFAULT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.roles ALTER COLUMN id SET DEFAULT nextval('identity.roles_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.users ALTER COLUMN id SET DEFAULT nextval('identity.users_id_seq'::regclass);


--
-- Name: nodes id; Type: DEFAULT; Schema: roadmap; Owner: -
--

ALTER TABLE ONLY roadmap.nodes ALTER COLUMN id SET DEFAULT nextval('roadmap.roadmap_nodes_id_seq'::regclass);


--
-- Name: roadmaps id; Type: DEFAULT; Schema: roadmap; Owner: -
--

ALTER TABLE ONLY roadmap.roadmaps ALTER COLUMN id SET DEFAULT nextval('roadmap.roadmaps_id_seq'::regclass);


--
-- Name: career_role career_role_code_key; Type: CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.career_role
    ADD CONSTRAINT career_role_code_key UNIQUE (code);


--
-- Name: career_role career_role_pkey; Type: CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.career_role
    ADD CONSTRAINT career_role_pkey PRIMARY KEY (id);


--
-- Name: career_role_skill career_role_skill_pkey; Type: CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.career_role_skill
    ADD CONSTRAINT career_role_skill_pkey PRIMARY KEY (career_role_id, skill_id);


--
-- Name: category category_pkey; Type: CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.category
    ADD CONSTRAINT category_pkey PRIMARY KEY (id);


--
-- Name: course_career_role course_career_role_pkey; Type: CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.course_career_role
    ADD CONSTRAINT course_career_role_pkey PRIMARY KEY (course_id, career_role_id);


--
-- Name: course_industry course_industry_pkey; Type: CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.course_industry
    ADD CONSTRAINT course_industry_pkey PRIMARY KEY (course_id, industry_id);


--
-- Name: course_learning_goal course_learning_goal_pkey; Type: CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.course_learning_goal
    ADD CONSTRAINT course_learning_goal_pkey PRIMARY KEY (course_id, learning_goal_id);


--
-- Name: course course_pkey; Type: CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.course
    ADD CONSTRAINT course_pkey PRIMARY KEY (id);


--
-- Name: course_prerequisite course_prerequisite_pkey; Type: CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.course_prerequisite
    ADD CONSTRAINT course_prerequisite_pkey PRIMARY KEY (course_id, prerequisite_course_id);


--
-- Name: course course_public_id_key; Type: CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.course
    ADD CONSTRAINT course_public_id_key UNIQUE (public_id);


--
-- Name: course_skill course_skill_pkey; Type: CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.course_skill
    ADD CONSTRAINT course_skill_pkey PRIMARY KEY (course_id, skill_id);


--
-- Name: industry industry_code_key; Type: CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.industry
    ADD CONSTRAINT industry_code_key UNIQUE (code);


--
-- Name: industry industry_pkey; Type: CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.industry
    ADD CONSTRAINT industry_pkey PRIMARY KEY (id);


--
-- Name: language language_pkey; Type: CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.language
    ADD CONSTRAINT language_pkey PRIMARY KEY (id);


--
-- Name: learning_goal learning_goal_code_key; Type: CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.learning_goal
    ADD CONSTRAINT learning_goal_code_key UNIQUE (code);


--
-- Name: learning_goal learning_goal_pkey; Type: CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.learning_goal
    ADD CONSTRAINT learning_goal_pkey PRIMARY KEY (id);


--
-- Name: skill skill_code_key; Type: CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.skill
    ADD CONSTRAINT skill_code_key UNIQUE (code);


--
-- Name: skill skill_pkey; Type: CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.skill
    ADD CONSTRAINT skill_pkey PRIMARY KEY (id);


--
-- Name: challenges challenge_pkey; Type: CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.challenges
    ADD CONSTRAINT challenge_pkey PRIMARY KEY (id);


--
-- Name: challenge_test_cases challenge_test_cases_pkey; Type: CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.challenge_test_cases
    ADD CONSTRAINT challenge_test_cases_pkey PRIMARY KEY (id);


--
-- Name: code_run_results code_run_results_pkey; Type: CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.code_run_results
    ADD CONSTRAINT code_run_results_pkey PRIMARY KEY (run_id);


--
-- Name: code_run_test_results code_run_test_results_pkey; Type: CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.code_run_test_results
    ADD CONSTRAINT code_run_test_results_pkey PRIMARY KEY (id);


--
-- Name: code_runs code_runs_pkey; Type: CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.code_runs
    ADD CONSTRAINT code_runs_pkey PRIMARY KEY (id);


--
-- Name: code_runs code_runs_public_id_key; Type: CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.code_runs
    ADD CONSTRAINT code_runs_public_id_key UNIQUE (public_id);


--
-- Name: code_submissions code_submissions_pkey; Type: CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.code_submissions
    ADD CONSTRAINT code_submissions_pkey PRIMARY KEY (id);


--
-- Name: code_submissions code_submissions_public_id_key; Type: CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.code_submissions
    ADD CONSTRAINT code_submissions_public_id_key UNIQUE (public_id);


--
-- Name: coding_configs coding_configs_pkey; Type: CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.coding_configs
    ADD CONSTRAINT coding_configs_pkey PRIMARY KEY (challenge_id);


--
-- Name: coding_files coding_files_pkey; Type: CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.coding_files
    ADD CONSTRAINT coding_files_pkey PRIMARY KEY (id);


--
-- Name: coding_workspace_files coding_workspace_files_pkey; Type: CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.coding_workspace_files
    ADD CONSTRAINT coding_workspace_files_pkey PRIMARY KEY (id);


--
-- Name: coding_workspaces coding_workspaces_pkey; Type: CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.coding_workspaces
    ADD CONSTRAINT coding_workspaces_pkey PRIMARY KEY (id);


--
-- Name: coding_workspaces coding_workspaces_public_id_key; Type: CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.coding_workspaces
    ADD CONSTRAINT coding_workspaces_public_id_key UNIQUE (public_id);


--
-- Name: question_options question_options_pkey; Type: CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.question_options
    ADD CONSTRAINT question_options_pkey PRIMARY KEY (id);


--
-- Name: question_submissions question_submissions_pkey; Type: CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.question_submissions
    ADD CONSTRAINT question_submissions_pkey PRIMARY KEY (id);


--
-- Name: questions questions_pkey; Type: CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.questions
    ADD CONSTRAINT questions_pkey PRIMARY KEY (id);


--
-- Name: coding_files uq_coding_files_path; Type: CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.coding_files
    ADD CONSTRAINT uq_coding_files_path UNIQUE NULLS NOT DISTINCT (challenge_id, language, file_path);


--
-- Name: coding_workspaces uq_coding_workspace_user_challenge; Type: CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.coding_workspaces
    ADD CONSTRAINT uq_coding_workspace_user_challenge UNIQUE (challenge_id, user_id);


--
-- Name: coding_workspace_files uq_workspace_file_path; Type: CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.coding_workspace_files
    ADD CONSTRAINT uq_workspace_file_path UNIQUE (workspace_id, file_path);


--
-- Name: cart_items cart_items_pkey; Type: CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.cart_items
    ADD CONSTRAINT cart_items_pkey PRIMARY KEY (user_id, course_id);


--
-- Name: entitlement entitlement_pkey; Type: CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.entitlement
    ADD CONSTRAINT entitlement_pkey PRIMARY KEY (id);


--
-- Name: entitlement entitlement_public_id_key; Type: CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.entitlement
    ADD CONSTRAINT entitlement_public_id_key UNIQUE (public_id);


--
-- Name: offer offer_pkey; Type: CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.offer
    ADD CONSTRAINT offer_pkey PRIMARY KEY (id);


--
-- Name: offer offer_public_id_key; Type: CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.offer
    ADD CONSTRAINT offer_public_id_key UNIQUE (public_id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: orders orders_public_id_key; Type: CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.orders
    ADD CONSTRAINT orders_public_id_key UNIQUE (public_id);


--
-- Name: payment_event payment_event_pkey; Type: CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.payment_event
    ADD CONSTRAINT payment_event_pkey PRIMARY KEY (id);


--
-- Name: payment payment_pkey; Type: CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.payment
    ADD CONSTRAINT payment_pkey PRIMARY KEY (id);


--
-- Name: payment payment_public_id_key; Type: CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.payment
    ADD CONSTRAINT payment_public_id_key UNIQUE (public_id);


--
-- Name: order_items uq_order_course; Type: CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.order_items
    ADD CONSTRAINT uq_order_course UNIQUE (order_id, course_id);


--
-- Name: payment_event uq_payment_event; Type: CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.payment_event
    ADD CONSTRAINT uq_payment_event UNIQUE (provider, event_id);


--
-- Name: comment comment_pkey; Type: CONSTRAINT; Schema: community; Owner: -
--

ALTER TABLE ONLY community.comment
    ADD CONSTRAINT comment_pkey PRIMARY KEY (id);


--
-- Name: comment comment_public_id_key; Type: CONSTRAINT; Schema: community; Owner: -
--

ALTER TABLE ONLY community.comment
    ADD CONSTRAINT comment_public_id_key UNIQUE (public_id);


--
-- Name: event_join event_join_pkey; Type: CONSTRAINT; Schema: community; Owner: -
--

ALTER TABLE ONLY community.event_join
    ADD CONSTRAINT event_join_pkey PRIMARY KEY (event_id, user_id);


--
-- Name: event event_pkey; Type: CONSTRAINT; Schema: community; Owner: -
--

ALTER TABLE ONLY community.event
    ADD CONSTRAINT event_pkey PRIMARY KEY (id);


--
-- Name: friend friend_pkey; Type: CONSTRAINT; Schema: community; Owner: -
--

ALTER TABLE ONLY community.friend
    ADD CONSTRAINT friend_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: community; Owner: -
--

ALTER TABLE ONLY community.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: feedback p_id; Type: CONSTRAINT; Schema: community; Owner: -
--

ALTER TABLE ONLY community.feedback
    ADD CONSTRAINT p_id PRIMARY KEY (id);


--
-- Name: voting pk_voting; Type: CONSTRAINT; Schema: community; Owner: -
--

ALTER TABLE ONLY community.voting
    ADD CONSTRAINT pk_voting PRIMARY KEY (user_id, reference_id);


--
-- Name: team_members team_members_pkey; Type: CONSTRAINT; Schema: community; Owner: -
--

ALTER TABLE ONLY community.team_members
    ADD CONSTRAINT team_members_pkey PRIMARY KEY (id);


--
-- Name: team team_pkey; Type: CONSTRAINT; Schema: community; Owner: -
--

ALTER TABLE ONLY community.team
    ADD CONSTRAINT team_pkey PRIMARY KEY (id);


--
-- Name: team_members uq_team_member; Type: CONSTRAINT; Schema: community; Owner: -
--

ALTER TABLE ONLY community.team_members
    ADD CONSTRAINT uq_team_member UNIQUE (team_id, user_id);


--
-- Name: lesson lesson_pkey; Type: CONSTRAINT; Schema: course; Owner: -
--

ALTER TABLE ONLY course.lesson
    ADD CONSTRAINT lesson_pkey PRIMARY KEY (id);


--
-- Name: module module_pkey; Type: CONSTRAINT; Schema: course; Owner: -
--

ALTER TABLE ONLY course.module
    ADD CONSTRAINT module_pkey PRIMARY KEY (id);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: auth_outbox auth_outbox_pkey; Type: CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.auth_outbox
    ADD CONSTRAINT auth_outbox_pkey PRIMARY KEY (id);


--
-- Name: email_tokens email_tokens_pkey; Type: CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.email_tokens
    ADD CONSTRAINT email_tokens_pkey PRIMARY KEY (id);


--
-- Name: email_tokens email_tokens_token_hash_key; Type: CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.email_tokens
    ADD CONSTRAINT email_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_resource_action_unique; Type: CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.permissions
    ADD CONSTRAINT permissions_resource_action_unique UNIQUE (resource, action);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_refresh_token_hash_key; Type: CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.refresh_tokens
    ADD CONSTRAINT refresh_tokens_refresh_token_hash_key UNIQUE (refresh_token_hash);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id);


--
-- Name: roles roles_code_key; Type: CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.roles
    ADD CONSTRAINT roles_code_key UNIQUE (code);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_public_id_key; Type: CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.users
    ADD CONSTRAINT users_public_id_key UNIQUE (public_id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: favorite favorite_pkey; Type: CONSTRAINT; Schema: learning; Owner: -
--

ALTER TABLE ONLY learning.favorite
    ADD CONSTRAINT favorite_pkey PRIMARY KEY (id);


--
-- Name: history history_pkey; Type: CONSTRAINT; Schema: learning; Owner: -
--

ALTER TABLE ONLY learning.history
    ADD CONSTRAINT history_pkey PRIMARY KEY (user_id, lesson_id);


--
-- Name: recovery recovery_pkey; Type: CONSTRAINT; Schema: learning; Owner: -
--

ALTER TABLE ONLY learning.recovery
    ADD CONSTRAINT recovery_pkey PRIMARY KEY (id);


--
-- Name: register register_pkey; Type: CONSTRAINT; Schema: learning; Owner: -
--

ALTER TABLE ONLY learning.register
    ADD CONSTRAINT register_pkey PRIMARY KEY (user_id, course_id);


--
-- Name: favorite unique_favorite; Type: CONSTRAINT; Schema: learning; Owner: -
--

ALTER TABLE ONLY learning.favorite
    ADD CONSTRAINT unique_favorite UNIQUE (user_id, course_id);


--
-- Name: exp_level exp_level_min_exp_key; Type: CONSTRAINT; Schema: profile; Owner: -
--

ALTER TABLE ONLY profile.exp_level
    ADD CONSTRAINT exp_level_min_exp_key UNIQUE (min_exp);


--
-- Name: exp_level exp_level_pkey; Type: CONSTRAINT; Schema: profile; Owner: -
--

ALTER TABLE ONLY profile.exp_level
    ADD CONSTRAINT exp_level_pkey PRIMARY KEY (level);


--
-- Name: exp_rule exp_rule_pkey; Type: CONSTRAINT; Schema: profile; Owner: -
--

ALTER TABLE ONLY profile.exp_rule
    ADD CONSTRAINT exp_rule_pkey PRIMARY KEY (rule_key);


--
-- Name: exp_transaction exp_transaction_pkey; Type: CONSTRAINT; Schema: profile; Owner: -
--

ALTER TABLE ONLY profile.exp_transaction
    ADD CONSTRAINT exp_transaction_pkey PRIMARY KEY (id);


--
-- Name: info info_pkey; Type: CONSTRAINT; Schema: profile; Owner: -
--

ALTER TABLE ONLY profile.info
    ADD CONSTRAINT info_pkey PRIMARY KEY (id);


--
-- Name: info info_user_id_key; Type: CONSTRAINT; Schema: profile; Owner: -
--

ALTER TABLE ONLY profile.info
    ADD CONSTRAINT info_user_id_key UNIQUE (user_id);


--
-- Name: learning_preference learning_preference_pkey; Type: CONSTRAINT; Schema: profile; Owner: -
--

ALTER TABLE ONLY profile.learning_preference
    ADD CONSTRAINT learning_preference_pkey PRIMARY KEY (user_id);


--
-- Name: notification notification_pkey; Type: CONSTRAINT; Schema: profile; Owner: -
--

ALTER TABLE ONLY profile.notification
    ADD CONSTRAINT notification_pkey PRIMARY KEY (id);


--
-- Name: onboarding onboarding_pkey; Type: CONSTRAINT; Schema: profile; Owner: -
--

ALTER TABLE ONLY profile.onboarding
    ADD CONSTRAINT onboarding_pkey PRIMARY KEY (user_id);


--
-- Name: point_transaction point_transfer_pkey; Type: CONSTRAINT; Schema: profile; Owner: -
--

ALTER TABLE ONLY profile.point_transaction
    ADD CONSTRAINT point_transfer_pkey PRIMARY KEY (id);


--
-- Name: rank_tier rank_tier_kind_min_score_key; Type: CONSTRAINT; Schema: profile; Owner: -
--

ALTER TABLE ONLY profile.rank_tier
    ADD CONSTRAINT rank_tier_kind_min_score_key UNIQUE (kind, min_score);


--
-- Name: rank_tier rank_tier_pkey; Type: CONSTRAINT; Schema: profile; Owner: -
--

ALTER TABLE ONLY profile.rank_tier
    ADD CONSTRAINT rank_tier_pkey PRIMARY KEY (kind, tier);


--
-- Name: task task_pkey; Type: CONSTRAINT; Schema: profile; Owner: -
--

ALTER TABLE ONLY profile.task
    ADD CONSTRAINT task_pkey PRIMARY KEY (id);


--
-- Name: point_transaction uq_point_transaction_source; Type: CONSTRAINT; Schema: profile; Owner: -
--

ALTER TABLE ONLY profile.point_transaction
    ADD CONSTRAINT uq_point_transaction_source UNIQUE (user_id, source_type, source_id, action);


--
-- Name: user_industry user_industry_pkey; Type: CONSTRAINT; Schema: profile; Owner: -
--

ALTER TABLE ONLY profile.user_industry
    ADD CONSTRAINT user_industry_pkey PRIMARY KEY (user_id, industry_id);


--
-- Name: user_learning_goal user_learning_goal_pkey; Type: CONSTRAINT; Schema: profile; Owner: -
--

ALTER TABLE ONLY profile.user_learning_goal
    ADD CONSTRAINT user_learning_goal_pkey PRIMARY KEY (user_id, learning_goal_id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: node_course node_course_pkey; Type: CONSTRAINT; Schema: roadmap; Owner: -
--

ALTER TABLE ONLY roadmap.node_course
    ADD CONSTRAINT node_course_pkey PRIMARY KEY (node_id, course_id);


--
-- Name: roadmap_users pk_roadmap_users; Type: CONSTRAINT; Schema: roadmap; Owner: -
--

ALTER TABLE ONLY roadmap.roadmap_users
    ADD CONSTRAINT pk_roadmap_users PRIMARY KEY (user_id, roadmap_id);


--
-- Name: nodes roadmap_nodes_pkey; Type: CONSTRAINT; Schema: roadmap; Owner: -
--

ALTER TABLE ONLY roadmap.nodes
    ADD CONSTRAINT roadmap_nodes_pkey PRIMARY KEY (id);


--
-- Name: user_progress roadmap_user_progress_pkey; Type: CONSTRAINT; Schema: roadmap; Owner: -
--

ALTER TABLE ONLY roadmap.user_progress
    ADD CONSTRAINT roadmap_user_progress_pkey PRIMARY KEY (id);


--
-- Name: roadmaps roadmaps_pkey; Type: CONSTRAINT; Schema: roadmap; Owner: -
--

ALTER TABLE ONLY roadmap.roadmaps
    ADD CONSTRAINT roadmaps_pkey PRIMARY KEY (id);


--
-- Name: roadmaps roadmaps_public_id_key; Type: CONSTRAINT; Schema: roadmap; Owner: -
--

ALTER TABLE ONLY roadmap.roadmaps
    ADD CONSTRAINT roadmaps_public_id_key UNIQUE (public_id);


--
-- Name: user_progress uq_user_node; Type: CONSTRAINT; Schema: roadmap; Owner: -
--

ALTER TABLE ONLY roadmap.user_progress
    ADD CONSTRAINT uq_user_node UNIQUE (user_id, node_id);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: assets assets_public_id_key; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.assets
    ADD CONSTRAINT assets_public_id_key UNIQUE (public_id);


--
-- Name: course_title; Type: INDEX; Schema: catalog; Owner: -
--

CREATE INDEX course_title ON catalog.course USING btree (title);


--
-- Name: idx_career_role_skill_skill; Type: INDEX; Schema: catalog; Owner: -
--

CREATE INDEX idx_career_role_skill_skill ON catalog.career_role_skill USING btree (skill_id);


--
-- Name: idx_course_career_role_role; Type: INDEX; Schema: catalog; Owner: -
--

CREATE INDEX idx_course_career_role_role ON catalog.course_career_role USING btree (career_role_id);


--
-- Name: idx_course_category; Type: INDEX; Schema: catalog; Owner: -
--

CREATE INDEX idx_course_category ON catalog.course USING btree (category_id);


--
-- Name: idx_course_industry_industry; Type: INDEX; Schema: catalog; Owner: -
--

CREATE INDEX idx_course_industry_industry ON catalog.course_industry USING btree (industry_id);


--
-- Name: idx_course_language; Type: INDEX; Schema: catalog; Owner: -
--

CREATE INDEX idx_course_language ON catalog.course USING btree (language_id);


--
-- Name: idx_course_learning_goal_goal; Type: INDEX; Schema: catalog; Owner: -
--

CREATE INDEX idx_course_learning_goal_goal ON catalog.course_learning_goal USING btree (learning_goal_id);


--
-- Name: idx_course_listing; Type: INDEX; Schema: catalog; Owner: -
--

CREATE INDEX idx_course_listing ON catalog.course USING btree (id DESC) WHERE ((is_hidden = false) AND (is_deleted = false));


--
-- Name: idx_course_prerequisite_prereq; Type: INDEX; Schema: catalog; Owner: -
--

CREATE INDEX idx_course_prerequisite_prereq ON catalog.course_prerequisite USING btree (prerequisite_course_id);


--
-- Name: idx_course_published; Type: INDEX; Schema: catalog; Owner: -
--

CREATE INDEX idx_course_published ON catalog.course USING btree (id) WHERE (((publish_status)::text = 'published'::text) AND (is_deleted = false));


--
-- Name: idx_course_skill_skill; Type: INDEX; Schema: catalog; Owner: -
--

CREATE INDEX idx_course_skill_skill ON catalog.course_skill USING btree (skill_id);


--
-- Name: idx_challenge_course_module; Type: INDEX; Schema: challenge; Owner: -
--

CREATE INDEX idx_challenge_course_module ON challenge.challenges USING btree (course_id, module_id);


--
-- Name: idx_challenge_lesson; Type: INDEX; Schema: challenge; Owner: -
--

CREATE INDEX idx_challenge_lesson ON challenge.challenges USING btree (lesson_id);


--
-- Name: idx_challenge_public_id; Type: INDEX; Schema: challenge; Owner: -
--

CREATE UNIQUE INDEX idx_challenge_public_id ON challenge.challenges USING btree (public_id);


--
-- Name: idx_code_runs_challenge_created; Type: INDEX; Schema: challenge; Owner: -
--

CREATE INDEX idx_code_runs_challenge_created ON challenge.code_runs USING btree (challenge_id, queued_at DESC);


--
-- Name: idx_code_runs_status; Type: INDEX; Schema: challenge; Owner: -
--

CREATE INDEX idx_code_runs_status ON challenge.code_runs USING btree (status) WHERE ((status)::text = ANY (ARRAY[('queued'::character varying)::text, ('running'::character varying)::text]));


--
-- Name: idx_code_runs_submission; Type: INDEX; Schema: challenge; Owner: -
--

CREATE INDEX idx_code_runs_submission ON challenge.code_runs USING btree (submission_id);


--
-- Name: idx_code_runs_user_created; Type: INDEX; Schema: challenge; Owner: -
--

CREATE INDEX idx_code_runs_user_created ON challenge.code_runs USING btree (user_id, queued_at DESC);


--
-- Name: idx_code_submissions_challenge; Type: INDEX; Schema: challenge; Owner: -
--

CREATE INDEX idx_code_submissions_challenge ON challenge.code_submissions USING btree (challenge_id);


--
-- Name: idx_code_submissions_user_challenge; Type: INDEX; Schema: challenge; Owner: -
--

CREATE INDEX idx_code_submissions_user_challenge ON challenge.code_submissions USING btree (user_id, challenge_id, submitted_at DESC);


--
-- Name: idx_coding_files_challenge; Type: INDEX; Schema: challenge; Owner: -
--

CREATE INDEX idx_coding_files_challenge ON challenge.coding_files USING btree (challenge_id);


--
-- Name: idx_coding_workspaces_user; Type: INDEX; Schema: challenge; Owner: -
--

CREATE INDEX idx_coding_workspaces_user ON challenge.coding_workspaces USING btree (user_id);


--
-- Name: idx_question_options_question; Type: INDEX; Schema: challenge; Owner: -
--

CREATE INDEX idx_question_options_question ON challenge.question_options USING btree (question_id);


--
-- Name: idx_question_submissions_user; Type: INDEX; Schema: challenge; Owner: -
--

CREATE INDEX idx_question_submissions_user ON challenge.question_submissions USING btree (user_id, question_id);


--
-- Name: idx_questions_challenge; Type: INDEX; Schema: challenge; Owner: -
--

CREATE INDEX idx_questions_challenge ON challenge.questions USING btree (challenge_id, order_index);


--
-- Name: idx_run_test_results_run; Type: INDEX; Schema: challenge; Owner: -
--

CREATE INDEX idx_run_test_results_run ON challenge.code_run_test_results USING btree (run_id);


--
-- Name: idx_run_test_results_test_case; Type: INDEX; Schema: challenge; Owner: -
--

CREATE INDEX idx_run_test_results_test_case ON challenge.code_run_test_results USING btree (test_case_id);


--
-- Name: idx_test_cases_challenge; Type: INDEX; Schema: challenge; Owner: -
--

CREATE INDEX idx_test_cases_challenge ON challenge.challenge_test_cases USING btree (challenge_id, sort_order);


--
-- Name: idx_workspace_files_workspace; Type: INDEX; Schema: challenge; Owner: -
--

CREATE INDEX idx_workspace_files_workspace ON challenge.coding_workspace_files USING btree (workspace_id);


--
-- Name: idx_entitlement_course; Type: INDEX; Schema: commerce; Owner: -
--

CREATE INDEX idx_entitlement_course ON commerce.entitlement USING btree (course_id);


--
-- Name: idx_order_items_course; Type: INDEX; Schema: commerce; Owner: -
--

CREATE INDEX idx_order_items_course ON commerce.order_items USING btree (course_id);


--
-- Name: idx_orders_pending; Type: INDEX; Schema: commerce; Owner: -
--

CREATE INDEX idx_orders_pending ON commerce.orders USING btree (user_id, expires_at) WHERE (status = 'pending'::public.order_status);


--
-- Name: idx_orders_user; Type: INDEX; Schema: commerce; Owner: -
--

CREATE INDEX idx_orders_user ON commerce.orders USING btree (user_id, created_at DESC);


--
-- Name: idx_payment_event_payment; Type: INDEX; Schema: commerce; Owner: -
--

CREATE INDEX idx_payment_event_payment ON commerce.payment_event USING btree (payment_id);


--
-- Name: idx_payment_order; Type: INDEX; Schema: commerce; Owner: -
--

CREATE INDEX idx_payment_order ON commerce.payment USING btree (order_id);


--
-- Name: uq_entitlement_active; Type: INDEX; Schema: commerce; Owner: -
--

CREATE UNIQUE INDEX uq_entitlement_active ON commerce.entitlement USING btree (user_id, course_id) WHERE ((status)::text = 'active'::text);


--
-- Name: uq_entitlement_order; Type: INDEX; Schema: commerce; Owner: -
--

CREATE UNIQUE INDEX uq_entitlement_order ON commerce.entitlement USING btree (order_id) WHERE (order_id IS NOT NULL);


--
-- Name: uq_offer_active; Type: INDEX; Schema: commerce; Owner: -
--

CREATE UNIQUE INDEX uq_offer_active ON commerce.offer USING btree (course_id, price_type) WHERE is_active;


--
-- Name: uq_orders_user_idempotency; Type: INDEX; Schema: commerce; Owner: -
--

CREATE UNIQUE INDEX uq_orders_user_idempotency ON commerce.orders USING btree (user_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: uq_payment_provider_ref; Type: INDEX; Schema: commerce; Owner: -
--

CREATE UNIQUE INDEX uq_payment_provider_ref ON commerce.payment USING btree (provider, provider_ref) WHERE (provider_ref IS NOT NULL);


--
-- Name: idx_comment_course_created; Type: INDEX; Schema: community; Owner: -
--

CREATE INDEX idx_comment_course_created ON community.comment USING btree (reference_id, created_at DESC) WHERE (is_deleted = false);


--
-- Name: idx_event_join_user; Type: INDEX; Schema: community; Owner: -
--

CREATE INDEX idx_event_join_user ON community.event_join USING btree (user_id);


--
-- Name: idx_friend_receiver; Type: INDEX; Schema: community; Owner: -
--

CREATE INDEX idx_friend_receiver ON community.friend USING btree (receiver_id);


--
-- Name: idx_messages_conversation; Type: INDEX; Schema: community; Owner: -
--

CREATE INDEX idx_messages_conversation ON community.messages USING btree (LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id), created_at DESC);


--
-- Name: idx_team_host; Type: INDEX; Schema: community; Owner: -
--

CREATE INDEX idx_team_host ON community.team USING btree (host_id);


--
-- Name: idx_team_members_user; Type: INDEX; Schema: community; Owner: -
--

CREATE INDEX idx_team_members_user ON community.team_members USING btree (user_id, status);


--
-- Name: idx_voting_comment; Type: INDEX; Schema: community; Owner: -
--

CREATE INDEX idx_voting_comment ON community.voting USING btree (reference_id);


--
-- Name: uq_friend_pair; Type: INDEX; Schema: community; Owner: -
--

CREATE UNIQUE INDEX uq_friend_pair ON community.friend USING btree (LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id));


--
-- Name: idx_lesson_module; Type: INDEX; Schema: course; Owner: -
--

CREATE INDEX idx_lesson_module ON course.lesson USING btree (module_id, order_index);


--
-- Name: idx_module_course; Type: INDEX; Schema: course; Owner: -
--

CREATE INDEX idx_module_course ON course.module USING btree (course_id, order_index);


--
-- Name: account_provider_pkey; Type: INDEX; Schema: identity; Owner: -
--

CREATE UNIQUE INDEX account_provider_pkey ON identity.accounts USING btree (provider_account_id, provider);


--
-- Name: email_tokens_live_uq; Type: INDEX; Schema: identity; Owner: -
--

CREATE UNIQUE INDEX email_tokens_live_uq ON identity.email_tokens USING btree (user_id, purpose) WHERE (consumed_at IS NULL);


--
-- Name: idx_accounts_user; Type: INDEX; Schema: identity; Owner: -
--

CREATE INDEX idx_accounts_user ON identity.accounts USING btree (user_id);


--
-- Name: idx_audit_log_actor; Type: INDEX; Schema: identity; Owner: -
--

CREATE INDEX idx_audit_log_actor ON identity.audit_log USING btree (actor_id, created_at DESC);


--
-- Name: idx_audit_log_target; Type: INDEX; Schema: identity; Owner: -
--

CREATE INDEX idx_audit_log_target ON identity.audit_log USING btree (target_type, target_id, created_at DESC);


--
-- Name: idx_auth_outbox_pending; Type: INDEX; Schema: identity; Owner: -
--

CREATE INDEX idx_auth_outbox_pending ON identity.auth_outbox USING btree (available_at, id) WHERE (processed_at IS NULL);


--
-- Name: idx_refresh_tokens_recovery_expires; Type: INDEX; Schema: identity; Owner: -
--

CREATE INDEX idx_refresh_tokens_recovery_expires ON identity.refresh_tokens USING btree (recovery_expires_at) WHERE (recovery_expires_at IS NOT NULL);


--
-- Name: idx_refresh_tokens_session; Type: INDEX; Schema: identity; Owner: -
--

CREATE INDEX idx_refresh_tokens_session ON identity.refresh_tokens USING btree (session_id);


--
-- Name: idx_role_permissions_permission; Type: INDEX; Schema: identity; Owner: -
--

CREATE INDEX idx_role_permissions_permission ON identity.role_permissions USING btree (permission_id);


--
-- Name: idx_sessions_active; Type: INDEX; Schema: identity; Owner: -
--

CREATE INDEX idx_sessions_active ON identity.sessions USING btree (user_id) WHERE (revoked_at IS NULL);


--
-- Name: idx_sessions_expires_at; Type: INDEX; Schema: identity; Owner: -
--

CREATE INDEX idx_sessions_expires_at ON identity.sessions USING btree (expires_at);


--
-- Name: idx_sessions_idle_expires_at; Type: INDEX; Schema: identity; Owner: -
--

CREATE INDEX idx_sessions_idle_expires_at ON identity.sessions USING btree (idle_expires_at);


--
-- Name: idx_sessions_user_id; Type: INDEX; Schema: identity; Owner: -
--

CREATE INDEX idx_sessions_user_id ON identity.sessions USING btree (user_id);


--
-- Name: idx_user_roles_role; Type: INDEX; Schema: identity; Owner: -
--

CREATE INDEX idx_user_roles_role ON identity.user_roles USING btree (role_id);


--
-- Name: uq_refresh_tokens_one_current_per_session; Type: INDEX; Schema: identity; Owner: -
--

CREATE UNIQUE INDEX uq_refresh_tokens_one_current_per_session ON identity.refresh_tokens USING btree (session_id) WHERE ((consumed_at IS NULL) AND (revoked_at IS NULL));


--
-- Name: users_email_lower_uq; Type: INDEX; Schema: identity; Owner: -
--

CREATE UNIQUE INDEX users_email_lower_uq ON identity.users USING btree (lower((email)::text));


--
-- Name: idx_favorite_course; Type: INDEX; Schema: learning; Owner: -
--

CREATE INDEX idx_favorite_course ON learning.favorite USING btree (course_id);


--
-- Name: idx_history_lesson; Type: INDEX; Schema: learning; Owner: -
--

CREATE INDEX idx_history_lesson ON learning.history USING btree (lesson_id);


--
-- Name: idx_history_user_course; Type: INDEX; Schema: learning; Owner: -
--

CREATE INDEX idx_history_user_course ON learning.history USING btree (user_id, course_id);


--
-- Name: idx_register_course; Type: INDEX; Schema: learning; Owner: -
--

CREATE INDEX idx_register_course ON learning.register USING btree (course_id);


--
-- Name: idx_exp_transaction_challenge; Type: INDEX; Schema: profile; Owner: -
--

CREATE INDEX idx_exp_transaction_challenge ON profile.exp_transaction USING btree (source_id, user_id) WHERE ((source_type)::text = 'challenge'::text);


--
-- Name: idx_exp_transaction_user_created; Type: INDEX; Schema: profile; Owner: -
--

CREATE INDEX idx_exp_transaction_user_created ON profile.exp_transaction USING btree (user_id, created_at DESC, id DESC);


--
-- Name: idx_info_avatar_asset; Type: INDEX; Schema: profile; Owner: -
--

CREATE INDEX idx_info_avatar_asset ON profile.info USING btree (avatar_asset_id) WHERE (avatar_asset_id IS NOT NULL);


--
-- Name: idx_notification_user; Type: INDEX; Schema: profile; Owner: -
--

CREATE INDEX idx_notification_user ON profile.notification USING btree (user_id, created_at DESC) WHERE (is_deleted = false);


--
-- Name: idx_point_transaction_earned; Type: INDEX; Schema: profile; Owner: -
--

CREATE INDEX idx_point_transaction_earned ON profile.point_transaction USING btree (user_id, created_at) WHERE (((action)::text = 'credit'::text) AND ((entry_type)::text = 'earned'::text));


--
-- Name: idx_point_transaction_user_created; Type: INDEX; Schema: profile; Owner: -
--

CREATE INDEX idx_point_transaction_user_created ON profile.point_transaction USING btree (user_id, created_at DESC);


--
-- Name: idx_task_user; Type: INDEX; Schema: profile; Owner: -
--

CREATE INDEX idx_task_user ON profile.task USING btree (user_id, status);


--
-- Name: idx_user_industry_industry; Type: INDEX; Schema: profile; Owner: -
--

CREATE INDEX idx_user_industry_industry ON profile.user_industry USING btree (industry_id);


--
-- Name: idx_user_learning_goal_goal; Type: INDEX; Schema: profile; Owner: -
--

CREATE INDEX idx_user_learning_goal_goal ON profile.user_learning_goal USING btree (learning_goal_id);


--
-- Name: uq_exp_transaction_idempotency; Type: INDEX; Schema: profile; Owner: -
--

CREATE UNIQUE INDEX uq_exp_transaction_idempotency ON profile.exp_transaction USING btree (user_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: uq_exp_transaction_source; Type: INDEX; Schema: profile; Owner: -
--

CREATE UNIQUE INDEX uq_exp_transaction_source ON profile.exp_transaction USING btree (user_id, source_type, source_id) WHERE (source_id IS NOT NULL);


--
-- Name: uq_point_transaction_idempotency; Type: INDEX; Schema: profile; Owner: -
--

CREATE UNIQUE INDEX uq_point_transaction_idempotency ON profile.point_transaction USING btree (user_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: idx_node_course_course; Type: INDEX; Schema: roadmap; Owner: -
--

CREATE INDEX idx_node_course_course ON roadmap.node_course USING btree (course_id);


--
-- Name: idx_roadmap_nodes_roadmap_id; Type: INDEX; Schema: roadmap; Owner: -
--

CREATE INDEX idx_roadmap_nodes_roadmap_id ON roadmap.nodes USING btree (roadmap_id);


--
-- Name: idx_roadmap_progress_node; Type: INDEX; Schema: roadmap; Owner: -
--

CREATE INDEX idx_roadmap_progress_node ON roadmap.user_progress USING btree (node_id);


--
-- Name: idx_roadmap_progress_roadmap; Type: INDEX; Schema: roadmap; Owner: -
--

CREATE INDEX idx_roadmap_progress_roadmap ON roadmap.user_progress USING btree (roadmap_id);


--
-- Name: idx_roadmap_users_roadmap; Type: INDEX; Schema: roadmap; Owner: -
--

CREATE INDEX idx_roadmap_users_roadmap ON roadmap.roadmap_users USING btree (roadmap_id);


--
-- Name: idx_assets_owner_purpose; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_assets_owner_purpose ON storage.assets USING btree (owner_id, purpose) WHERE ((owner_id IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: uq_assets_provider_object_key; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX uq_assets_provider_object_key ON storage.assets USING btree (provider, object_key) WHERE (object_key IS NOT NULL);


--
-- Name: course trg_course_publish_sync; Type: TRIGGER; Schema: catalog; Owner: -
--

CREATE TRIGGER trg_course_publish_sync BEFORE INSERT OR UPDATE ON catalog.course FOR EACH ROW EXECUTE FUNCTION catalog.course_publish_sync();


--
-- Name: module trigger_lesson_course; Type: TRIGGER; Schema: course; Owner: -
--

CREATE TRIGGER trigger_lesson_course AFTER INSERT OR DELETE OR UPDATE ON course.module FOR EACH ROW EXECUTE FUNCTION public.lesson_course_change();


--
-- Name: lesson trigger_lesson_module; Type: TRIGGER; Schema: course; Owner: -
--

CREATE TRIGGER trigger_lesson_module AFTER INSERT OR DELETE OR UPDATE ON course.lesson FOR EACH ROW EXECUTE FUNCTION public.lesson_module_change();


--
-- Name: audit_log trg_audit_log_append_only; Type: TRIGGER; Schema: identity; Owner: -
--

CREATE TRIGGER trg_audit_log_append_only BEFORE DELETE OR UPDATE ON identity.audit_log FOR EACH ROW EXECUTE FUNCTION identity.audit_log_append_only();


--
-- Name: refresh_tokens trg_refresh_tokens_sync_columns; Type: TRIGGER; Schema: identity; Owner: -
--

CREATE TRIGGER trg_refresh_tokens_sync_columns BEFORE INSERT OR UPDATE ON identity.refresh_tokens FOR EACH ROW EXECUTE FUNCTION identity.refresh_tokens_sync_columns();


--
-- Name: sessions trg_sessions_sync_columns; Type: TRIGGER; Schema: identity; Owner: -
--

CREATE TRIGGER trg_sessions_sync_columns BEFORE INSERT OR UPDATE ON identity.sessions FOR EACH ROW EXECUTE FUNCTION identity.sessions_sync_columns();


--
-- Name: users trg_users_onboarding; Type: TRIGGER; Schema: identity; Owner: -
--

CREATE TRIGGER trg_users_onboarding AFTER INSERT ON identity.users FOR EACH ROW EXECUTE FUNCTION profile.create_onboarding_row();


--
-- Name: point_transaction trg_point_transaction_append_only; Type: TRIGGER; Schema: profile; Owner: -
--

CREATE TRIGGER trg_point_transaction_append_only BEFORE DELETE OR UPDATE ON profile.point_transaction FOR EACH ROW EXECUTE FUNCTION profile.point_transaction_append_only();


--
-- Name: point_transaction trg_point_transaction_defaults; Type: TRIGGER; Schema: profile; Owner: -
--

CREATE TRIGGER trg_point_transaction_defaults BEFORE INSERT ON profile.point_transaction FOR EACH ROW EXECUTE FUNCTION profile.point_transaction_defaults();


--
-- Name: career_role_skill career_role_skill_career_role_id_fkey; Type: FK CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.career_role_skill
    ADD CONSTRAINT career_role_skill_career_role_id_fkey FOREIGN KEY (career_role_id) REFERENCES catalog.career_role(id) ON DELETE CASCADE;


--
-- Name: career_role_skill career_role_skill_skill_id_fkey; Type: FK CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.career_role_skill
    ADD CONSTRAINT career_role_skill_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES catalog.skill(id) ON DELETE CASCADE;


--
-- Name: course_career_role course_career_role_career_role_id_fkey; Type: FK CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.course_career_role
    ADD CONSTRAINT course_career_role_career_role_id_fkey FOREIGN KEY (career_role_id) REFERENCES catalog.career_role(id) ON DELETE CASCADE;


--
-- Name: course_career_role course_career_role_course_id_fkey; Type: FK CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.course_career_role
    ADD CONSTRAINT course_career_role_course_id_fkey FOREIGN KEY (course_id) REFERENCES catalog.course(id) ON DELETE CASCADE;


--
-- Name: course_industry course_industry_course_id_fkey; Type: FK CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.course_industry
    ADD CONSTRAINT course_industry_course_id_fkey FOREIGN KEY (course_id) REFERENCES catalog.course(id) ON DELETE CASCADE;


--
-- Name: course_industry course_industry_industry_id_fkey; Type: FK CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.course_industry
    ADD CONSTRAINT course_industry_industry_id_fkey FOREIGN KEY (industry_id) REFERENCES catalog.industry(id) ON DELETE CASCADE;


--
-- Name: course_learning_goal course_learning_goal_course_id_fkey; Type: FK CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.course_learning_goal
    ADD CONSTRAINT course_learning_goal_course_id_fkey FOREIGN KEY (course_id) REFERENCES catalog.course(id) ON DELETE CASCADE;


--
-- Name: course_learning_goal course_learning_goal_learning_goal_id_fkey; Type: FK CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.course_learning_goal
    ADD CONSTRAINT course_learning_goal_learning_goal_id_fkey FOREIGN KEY (learning_goal_id) REFERENCES catalog.learning_goal(id) ON DELETE CASCADE;


--
-- Name: course_prerequisite course_prerequisite_course_id_fkey; Type: FK CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.course_prerequisite
    ADD CONSTRAINT course_prerequisite_course_id_fkey FOREIGN KEY (course_id) REFERENCES catalog.course(id) ON DELETE CASCADE;


--
-- Name: course_prerequisite course_prerequisite_prerequisite_course_id_fkey; Type: FK CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.course_prerequisite
    ADD CONSTRAINT course_prerequisite_prerequisite_course_id_fkey FOREIGN KEY (prerequisite_course_id) REFERENCES catalog.course(id) ON DELETE CASCADE;


--
-- Name: course_skill course_skill_course_id_fkey; Type: FK CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.course_skill
    ADD CONSTRAINT course_skill_course_id_fkey FOREIGN KEY (course_id) REFERENCES catalog.course(id) ON DELETE CASCADE;


--
-- Name: course_skill course_skill_skill_id_fkey; Type: FK CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.course_skill
    ADD CONSTRAINT course_skill_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES catalog.skill(id) ON DELETE CASCADE;


--
-- Name: course fk_course_category; Type: FK CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.course
    ADD CONSTRAINT fk_course_category FOREIGN KEY (category_id) REFERENCES catalog.category(id);


--
-- Name: course fk_course_language; Type: FK CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.course
    ADD CONSTRAINT fk_course_language FOREIGN KEY (language_id) REFERENCES catalog.language(id);


--
-- Name: challenges fk_challenge_course_id; Type: FK CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.challenges
    ADD CONSTRAINT fk_challenge_course_id FOREIGN KEY (course_id) REFERENCES catalog.course(id) ON DELETE CASCADE;


--
-- Name: challenges fk_challenge_lesson; Type: FK CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.challenges
    ADD CONSTRAINT fk_challenge_lesson FOREIGN KEY (lesson_id) REFERENCES course.lesson(id) ON DELETE CASCADE;


--
-- Name: challenges fk_challenge_module_id; Type: FK CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.challenges
    ADD CONSTRAINT fk_challenge_module_id FOREIGN KEY (module_id) REFERENCES course.module(id) ON DELETE CASCADE;


--
-- Name: code_run_results fk_code_run_results_run; Type: FK CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.code_run_results
    ADD CONSTRAINT fk_code_run_results_run FOREIGN KEY (run_id) REFERENCES challenge.code_runs(id) ON DELETE CASCADE;


--
-- Name: code_runs fk_code_runs_challenge; Type: FK CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.code_runs
    ADD CONSTRAINT fk_code_runs_challenge FOREIGN KEY (challenge_id) REFERENCES challenge.challenges(id) ON DELETE CASCADE;


--
-- Name: code_runs fk_code_runs_submission; Type: FK CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.code_runs
    ADD CONSTRAINT fk_code_runs_submission FOREIGN KEY (submission_id) REFERENCES challenge.code_submissions(id) ON DELETE SET NULL;


--
-- Name: code_runs fk_code_runs_user; Type: FK CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.code_runs
    ADD CONSTRAINT fk_code_runs_user FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;


--
-- Name: code_submissions fk_code_submissions_challenge; Type: FK CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.code_submissions
    ADD CONSTRAINT fk_code_submissions_challenge FOREIGN KEY (challenge_id) REFERENCES challenge.challenges(id) ON DELETE CASCADE;


--
-- Name: code_submissions fk_code_submissions_user; Type: FK CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.code_submissions
    ADD CONSTRAINT fk_code_submissions_user FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;


--
-- Name: coding_configs fk_coding_configs_challenge; Type: FK CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.coding_configs
    ADD CONSTRAINT fk_coding_configs_challenge FOREIGN KEY (challenge_id) REFERENCES challenge.challenges(id) ON DELETE CASCADE;


--
-- Name: coding_files fk_coding_files_asset; Type: FK CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.coding_files
    ADD CONSTRAINT fk_coding_files_asset FOREIGN KEY (asset_id) REFERENCES storage.assets(id) ON DELETE SET NULL;


--
-- Name: coding_files fk_coding_files_challenge; Type: FK CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.coding_files
    ADD CONSTRAINT fk_coding_files_challenge FOREIGN KEY (challenge_id) REFERENCES challenge.challenges(id) ON DELETE CASCADE;


--
-- Name: coding_workspaces fk_coding_workspaces_challenge; Type: FK CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.coding_workspaces
    ADD CONSTRAINT fk_coding_workspaces_challenge FOREIGN KEY (challenge_id) REFERENCES challenge.challenges(id) ON DELETE CASCADE;


--
-- Name: coding_workspaces fk_coding_workspaces_user; Type: FK CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.coding_workspaces
    ADD CONSTRAINT fk_coding_workspaces_user FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;


--
-- Name: question_options fk_options_question; Type: FK CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.question_options
    ADD CONSTRAINT fk_options_question FOREIGN KEY (question_id) REFERENCES challenge.questions(id) ON DELETE CASCADE;


--
-- Name: question_submissions fk_qsub_option; Type: FK CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.question_submissions
    ADD CONSTRAINT fk_qsub_option FOREIGN KEY (question_option_id) REFERENCES challenge.question_options(id) ON DELETE CASCADE;


--
-- Name: question_submissions fk_qsub_question; Type: FK CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.question_submissions
    ADD CONSTRAINT fk_qsub_question FOREIGN KEY (question_id) REFERENCES challenge.questions(id) ON DELETE CASCADE;


--
-- Name: question_submissions fk_qsub_user; Type: FK CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.question_submissions
    ADD CONSTRAINT fk_qsub_user FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;


--
-- Name: questions fk_questions_challenge; Type: FK CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.questions
    ADD CONSTRAINT fk_questions_challenge FOREIGN KEY (challenge_id) REFERENCES challenge.challenges(id) ON DELETE CASCADE;


--
-- Name: code_run_test_results fk_run_test_results_run; Type: FK CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.code_run_test_results
    ADD CONSTRAINT fk_run_test_results_run FOREIGN KEY (run_id) REFERENCES challenge.code_runs(id) ON DELETE CASCADE;


--
-- Name: code_run_test_results fk_run_test_results_test_case; Type: FK CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.code_run_test_results
    ADD CONSTRAINT fk_run_test_results_test_case FOREIGN KEY (test_case_id) REFERENCES challenge.challenge_test_cases(id) ON DELETE SET NULL;


--
-- Name: challenge_test_cases fk_test_cases_challenge; Type: FK CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.challenge_test_cases
    ADD CONSTRAINT fk_test_cases_challenge FOREIGN KEY (challenge_id) REFERENCES challenge.challenges(id) ON DELETE CASCADE;


--
-- Name: coding_workspace_files fk_workspace_files_asset; Type: FK CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.coding_workspace_files
    ADD CONSTRAINT fk_workspace_files_asset FOREIGN KEY (asset_id) REFERENCES storage.assets(id) ON DELETE SET NULL;


--
-- Name: coding_workspace_files fk_workspace_files_workspace; Type: FK CONSTRAINT; Schema: challenge; Owner: -
--

ALTER TABLE ONLY challenge.coding_workspace_files
    ADD CONSTRAINT fk_workspace_files_workspace FOREIGN KEY (workspace_id) REFERENCES challenge.coding_workspaces(id) ON DELETE CASCADE;


--
-- Name: cart_items cart_items_course_id_fkey; Type: FK CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.cart_items
    ADD CONSTRAINT cart_items_course_id_fkey FOREIGN KEY (course_id) REFERENCES catalog.course(id) ON DELETE CASCADE;


--
-- Name: cart_items cart_items_user_id_fkey; Type: FK CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.cart_items
    ADD CONSTRAINT cart_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;


--
-- Name: entitlement entitlement_course_id_fkey; Type: FK CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.entitlement
    ADD CONSTRAINT entitlement_course_id_fkey FOREIGN KEY (course_id) REFERENCES catalog.course(id) ON DELETE CASCADE;


--
-- Name: entitlement entitlement_granted_by_fkey; Type: FK CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.entitlement
    ADD CONSTRAINT entitlement_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES identity.users(id) ON DELETE SET NULL;


--
-- Name: entitlement entitlement_order_id_fkey; Type: FK CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.entitlement
    ADD CONSTRAINT entitlement_order_id_fkey FOREIGN KEY (order_id) REFERENCES commerce.orders(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: entitlement entitlement_user_id_fkey; Type: FK CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.entitlement
    ADD CONSTRAINT entitlement_user_id_fkey FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;


--
-- Name: offer offer_course_id_fkey; Type: FK CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.offer
    ADD CONSTRAINT offer_course_id_fkey FOREIGN KEY (course_id) REFERENCES catalog.course(id) ON DELETE CASCADE;


--
-- Name: offer offer_created_by_fkey; Type: FK CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.offer
    ADD CONSTRAINT offer_created_by_fkey FOREIGN KEY (created_by) REFERENCES identity.users(id) ON DELETE SET NULL;


--
-- Name: order_items order_items_course_id_fkey; Type: FK CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.order_items
    ADD CONSTRAINT order_items_course_id_fkey FOREIGN KEY (course_id) REFERENCES catalog.course(id) ON DELETE RESTRICT;


--
-- Name: order_items order_items_offer_id_fkey; Type: FK CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.order_items
    ADD CONSTRAINT order_items_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES commerce.offer(id) ON DELETE RESTRICT;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES commerce.orders(id) ON DELETE CASCADE;


--
-- Name: orders orders_user_id_fkey; Type: FK CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.orders
    ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE RESTRICT;


--
-- Name: payment_event payment_event_payment_id_fkey; Type: FK CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.payment_event
    ADD CONSTRAINT payment_event_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES commerce.payment(id) ON DELETE SET NULL;


--
-- Name: payment payment_order_id_fkey; Type: FK CONSTRAINT; Schema: commerce; Owner: -
--

ALTER TABLE ONLY commerce.payment
    ADD CONSTRAINT payment_order_id_fkey FOREIGN KEY (order_id) REFERENCES commerce.orders(id) ON DELETE RESTRICT;


--
-- Name: comment fk_comment_course; Type: FK CONSTRAINT; Schema: community; Owner: -
--

ALTER TABLE ONLY community.comment
    ADD CONSTRAINT fk_comment_course FOREIGN KEY (reference_id) REFERENCES catalog.course(id) ON DELETE CASCADE;


--
-- Name: comment fk_comment_user; Type: FK CONSTRAINT; Schema: community; Owner: -
--

ALTER TABLE ONLY community.comment
    ADD CONSTRAINT fk_comment_user FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;


--
-- Name: event fk_event_creator; Type: FK CONSTRAINT; Schema: community; Owner: -
--

ALTER TABLE ONLY community.event
    ADD CONSTRAINT fk_event_creator FOREIGN KEY (created_by) REFERENCES identity.users(id) ON DELETE CASCADE;


--
-- Name: event_join fk_event_join_event; Type: FK CONSTRAINT; Schema: community; Owner: -
--

ALTER TABLE ONLY community.event_join
    ADD CONSTRAINT fk_event_join_event FOREIGN KEY (event_id) REFERENCES community.event(id) ON DELETE CASCADE;


--
-- Name: event_join fk_event_join_user; Type: FK CONSTRAINT; Schema: community; Owner: -
--

ALTER TABLE ONLY community.event_join
    ADD CONSTRAINT fk_event_join_user FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;


--
-- Name: feedback fk_feedback_user; Type: FK CONSTRAINT; Schema: community; Owner: -
--

ALTER TABLE ONLY community.feedback
    ADD CONSTRAINT fk_feedback_user FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE SET NULL;


--
-- Name: friend fk_friend_receiver; Type: FK CONSTRAINT; Schema: community; Owner: -
--

ALTER TABLE ONLY community.friend
    ADD CONSTRAINT fk_friend_receiver FOREIGN KEY (receiver_id) REFERENCES identity.users(id) ON DELETE CASCADE;


--
-- Name: friend fk_friend_sender; Type: FK CONSTRAINT; Schema: community; Owner: -
--

ALTER TABLE ONLY community.friend
    ADD CONSTRAINT fk_friend_sender FOREIGN KEY (sender_id) REFERENCES identity.users(id) ON DELETE CASCADE;


--
-- Name: messages fk_messages_receiver; Type: FK CONSTRAINT; Schema: community; Owner: -
--

ALTER TABLE ONLY community.messages
    ADD CONSTRAINT fk_messages_receiver FOREIGN KEY (receiver_id) REFERENCES identity.users(id) ON DELETE CASCADE;


--
-- Name: messages fk_messages_sender; Type: FK CONSTRAINT; Schema: community; Owner: -
--

ALTER TABLE ONLY community.messages
    ADD CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES identity.users(id) ON DELETE CASCADE;


--
-- Name: team fk_team_host; Type: FK CONSTRAINT; Schema: community; Owner: -
--

ALTER TABLE ONLY community.team
    ADD CONSTRAINT fk_team_host FOREIGN KEY (host_id) REFERENCES identity.users(id) ON DELETE CASCADE;


--
-- Name: voting fk_voting_comment; Type: FK CONSTRAINT; Schema: community; Owner: -
--

ALTER TABLE ONLY community.voting
    ADD CONSTRAINT fk_voting_comment FOREIGN KEY (reference_id) REFERENCES community.comment(id) ON DELETE CASCADE;


--
-- Name: voting fk_voting_user; Type: FK CONSTRAINT; Schema: community; Owner: -
--

ALTER TABLE ONLY community.voting
    ADD CONSTRAINT fk_voting_user FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;


--
-- Name: team_members team_members_team_id_fkey; Type: FK CONSTRAINT; Schema: community; Owner: -
--

ALTER TABLE ONLY community.team_members
    ADD CONSTRAINT team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES community.team(id) ON DELETE CASCADE;


--
-- Name: team_members team_members_user_id_fkey; Type: FK CONSTRAINT; Schema: community; Owner: -
--

ALTER TABLE ONLY community.team_members
    ADD CONSTRAINT team_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;


--
-- Name: lesson fk_lesson_module; Type: FK CONSTRAINT; Schema: course; Owner: -
--

ALTER TABLE ONLY course.lesson
    ADD CONSTRAINT fk_lesson_module FOREIGN KEY (module_id) REFERENCES course.module(id) ON DELETE CASCADE;


--
-- Name: module fk_module_course; Type: FK CONSTRAINT; Schema: course; Owner: -
--

ALTER TABLE ONLY course.module
    ADD CONSTRAINT fk_module_course FOREIGN KEY (course_id) REFERENCES catalog.course(id) ON DELETE CASCADE;


--
-- Name: audit_log audit_log_actor_id_fkey; Type: FK CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.audit_log
    ADD CONSTRAINT audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES identity.users(id) ON DELETE SET NULL;


--
-- Name: email_tokens email_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.email_tokens
    ADD CONSTRAINT email_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;


--
-- Name: accounts fk_accounts_user; Type: FK CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.accounts
    ADD CONSTRAINT fk_accounts_user FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens fk_refresh_tokens_replaced_by; Type: FK CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.refresh_tokens
    ADD CONSTRAINT fk_refresh_tokens_replaced_by FOREIGN KEY (replaced_by_id) REFERENCES identity.refresh_tokens(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;


--
-- Name: refresh_tokens fk_refresh_tokens_session; Type: FK CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.refresh_tokens
    ADD CONSTRAINT fk_refresh_tokens_session FOREIGN KEY (session_id) REFERENCES identity.sessions(id) ON DELETE CASCADE;


--
-- Name: role_permissions fk_role_permissions_permission; Type: FK CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.role_permissions
    ADD CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES identity.permissions(id) ON DELETE CASCADE;


--
-- Name: role_permissions fk_role_permissions_role; Type: FK CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.role_permissions
    ADD CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES identity.roles(id) ON DELETE CASCADE;


--
-- Name: sessions fk_sessions_user; Type: FK CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.sessions
    ADD CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;


--
-- Name: user_roles fk_user_roles_role; Type: FK CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.user_roles
    ADD CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES identity.roles(id) ON DELETE CASCADE;


--
-- Name: user_roles fk_user_roles_user; Type: FK CONSTRAINT; Schema: identity; Owner: -
--

ALTER TABLE ONLY identity.user_roles
    ADD CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;


--
-- Name: recovery fk_course_id; Type: FK CONSTRAINT; Schema: learning; Owner: -
--

ALTER TABLE ONLY learning.recovery
    ADD CONSTRAINT fk_course_id FOREIGN KEY (course_id, user_id) REFERENCES learning.register(course_id, user_id);


--
-- Name: favorite fk_favorite_course; Type: FK CONSTRAINT; Schema: learning; Owner: -
--

ALTER TABLE ONLY learning.favorite
    ADD CONSTRAINT fk_favorite_course FOREIGN KEY (course_id) REFERENCES catalog.course(id) ON DELETE CASCADE;


--
-- Name: favorite fk_favorite_user; Type: FK CONSTRAINT; Schema: learning; Owner: -
--

ALTER TABLE ONLY learning.favorite
    ADD CONSTRAINT fk_favorite_user FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;


--
-- Name: history fk_history_lesson; Type: FK CONSTRAINT; Schema: learning; Owner: -
--

ALTER TABLE ONLY learning.history
    ADD CONSTRAINT fk_history_lesson FOREIGN KEY (lesson_id) REFERENCES course.lesson(id) ON DELETE CASCADE;


--
-- Name: history fk_history_module; Type: FK CONSTRAINT; Schema: learning; Owner: -
--

ALTER TABLE ONLY learning.history
    ADD CONSTRAINT fk_history_module FOREIGN KEY (module_id) REFERENCES course.module(id) ON DELETE CASCADE;


--
-- Name: history fk_history_register; Type: FK CONSTRAINT; Schema: learning; Owner: -
--

ALTER TABLE ONLY learning.history
    ADD CONSTRAINT fk_history_register FOREIGN KEY (user_id, course_id) REFERENCES learning.register(user_id, course_id) ON DELETE CASCADE;


--
-- Name: recovery fk_lesson_id; Type: FK CONSTRAINT; Schema: learning; Owner: -
--

ALTER TABLE ONLY learning.recovery
    ADD CONSTRAINT fk_lesson_id FOREIGN KEY (lesson_id) REFERENCES course.lesson(id);


--
-- Name: recovery fk_module_id; Type: FK CONSTRAINT; Schema: learning; Owner: -
--

ALTER TABLE ONLY learning.recovery
    ADD CONSTRAINT fk_module_id FOREIGN KEY (module_id) REFERENCES course.module(id);


--
-- Name: register fk_register_course; Type: FK CONSTRAINT; Schema: learning; Owner: -
--

ALTER TABLE ONLY learning.register
    ADD CONSTRAINT fk_register_course FOREIGN KEY (course_id) REFERENCES catalog.course(id) ON DELETE CASCADE;


--
-- Name: register fk_register_user; Type: FK CONSTRAINT; Schema: learning; Owner: -
--

ALTER TABLE ONLY learning.register
    ADD CONSTRAINT fk_register_user FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;


--
-- Name: exp_transaction exp_transaction_actor_id_fkey; Type: FK CONSTRAINT; Schema: profile; Owner: -
--

ALTER TABLE ONLY profile.exp_transaction
    ADD CONSTRAINT exp_transaction_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES identity.users(id);


--
-- Name: exp_transaction exp_transaction_user_id_fkey; Type: FK CONSTRAINT; Schema: profile; Owner: -
--

ALTER TABLE ONLY profile.exp_transaction
    ADD CONSTRAINT exp_transaction_user_id_fkey FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;


--
-- Name: info fk_info_avatar_asset; Type: FK CONSTRAINT; Schema: profile; Owner: -
--

ALTER TABLE ONLY profile.info
    ADD CONSTRAINT fk_info_avatar_asset FOREIGN KEY (avatar_asset_id) REFERENCES storage.assets(id) ON DELETE SET NULL;


--
-- Name: info fk_info_user; Type: FK CONSTRAINT; Schema: profile; Owner: -
--

ALTER TABLE ONLY profile.info
    ADD CONSTRAINT fk_info_user FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;


--
-- Name: notification fk_notification_user; Type: FK CONSTRAINT; Schema: profile; Owner: -
--

ALTER TABLE ONLY profile.notification
    ADD CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;


--
-- Name: point_transaction fk_point_transaction_user; Type: FK CONSTRAINT; Schema: profile; Owner: -
--

ALTER TABLE ONLY profile.point_transaction
    ADD CONSTRAINT fk_point_transaction_user FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;


--
-- Name: task fk_task_user; Type: FK CONSTRAINT; Schema: profile; Owner: -
--

ALTER TABLE ONLY profile.task
    ADD CONSTRAINT fk_task_user FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;


--
-- Name: learning_preference learning_preference_career_role_id_fkey; Type: FK CONSTRAINT; Schema: profile; Owner: -
--

ALTER TABLE ONLY profile.learning_preference
    ADD CONSTRAINT learning_preference_career_role_id_fkey FOREIGN KEY (career_role_id) REFERENCES catalog.career_role(id) ON DELETE SET NULL;


--
-- Name: learning_preference learning_preference_preferred_language_id_fkey; Type: FK CONSTRAINT; Schema: profile; Owner: -
--

ALTER TABLE ONLY profile.learning_preference
    ADD CONSTRAINT learning_preference_preferred_language_id_fkey FOREIGN KEY (preferred_language_id) REFERENCES catalog.language(id) ON DELETE SET NULL;


--
-- Name: learning_preference learning_preference_user_id_fkey; Type: FK CONSTRAINT; Schema: profile; Owner: -
--

ALTER TABLE ONLY profile.learning_preference
    ADD CONSTRAINT learning_preference_user_id_fkey FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;


--
-- Name: onboarding onboarding_user_id_fkey; Type: FK CONSTRAINT; Schema: profile; Owner: -
--

ALTER TABLE ONLY profile.onboarding
    ADD CONSTRAINT onboarding_user_id_fkey FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;


--
-- Name: point_transaction point_transaction_actor_id_fkey; Type: FK CONSTRAINT; Schema: profile; Owner: -
--

ALTER TABLE ONLY profile.point_transaction
    ADD CONSTRAINT point_transaction_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES identity.users(id) ON DELETE SET NULL;


--
-- Name: point_transaction point_transaction_order_id_fkey; Type: FK CONSTRAINT; Schema: profile; Owner: -
--

ALTER TABLE ONLY profile.point_transaction
    ADD CONSTRAINT point_transaction_order_id_fkey FOREIGN KEY (order_id) REFERENCES commerce.orders(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: user_industry user_industry_industry_id_fkey; Type: FK CONSTRAINT; Schema: profile; Owner: -
--

ALTER TABLE ONLY profile.user_industry
    ADD CONSTRAINT user_industry_industry_id_fkey FOREIGN KEY (industry_id) REFERENCES catalog.industry(id) ON DELETE CASCADE;


--
-- Name: user_industry user_industry_user_id_fkey; Type: FK CONSTRAINT; Schema: profile; Owner: -
--

ALTER TABLE ONLY profile.user_industry
    ADD CONSTRAINT user_industry_user_id_fkey FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;


--
-- Name: user_learning_goal user_learning_goal_learning_goal_id_fkey; Type: FK CONSTRAINT; Schema: profile; Owner: -
--

ALTER TABLE ONLY profile.user_learning_goal
    ADD CONSTRAINT user_learning_goal_learning_goal_id_fkey FOREIGN KEY (learning_goal_id) REFERENCES catalog.learning_goal(id) ON DELETE CASCADE;


--
-- Name: user_learning_goal user_learning_goal_user_id_fkey; Type: FK CONSTRAINT; Schema: profile; Owner: -
--

ALTER TABLE ONLY profile.user_learning_goal
    ADD CONSTRAINT user_learning_goal_user_id_fkey FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;


--
-- Name: roadmap_users fk_current_node_id; Type: FK CONSTRAINT; Schema: roadmap; Owner: -
--

ALTER TABLE ONLY roadmap.roadmap_users
    ADD CONSTRAINT fk_current_node_id FOREIGN KEY (current_node_id) REFERENCES roadmap.nodes(id);


--
-- Name: user_progress fk_node_id; Type: FK CONSTRAINT; Schema: roadmap; Owner: -
--

ALTER TABLE ONLY roadmap.user_progress
    ADD CONSTRAINT fk_node_id FOREIGN KEY (node_id) REFERENCES roadmap.nodes(id);


--
-- Name: nodes fk_nodes_roadmap; Type: FK CONSTRAINT; Schema: roadmap; Owner: -
--

ALTER TABLE ONLY roadmap.nodes
    ADD CONSTRAINT fk_nodes_roadmap FOREIGN KEY (roadmap_id) REFERENCES roadmap.roadmaps(id) ON DELETE CASCADE;


--
-- Name: roadmap_users fk_roadmap_id; Type: FK CONSTRAINT; Schema: roadmap; Owner: -
--

ALTER TABLE ONLY roadmap.roadmap_users
    ADD CONSTRAINT fk_roadmap_id FOREIGN KEY (roadmap_id) REFERENCES roadmap.roadmaps(id);


--
-- Name: user_progress fk_roadmap_id; Type: FK CONSTRAINT; Schema: roadmap; Owner: -
--

ALTER TABLE ONLY roadmap.user_progress
    ADD CONSTRAINT fk_roadmap_id FOREIGN KEY (roadmap_id) REFERENCES roadmap.roadmaps(id);


--
-- Name: roadmap_users fk_user_id; Type: FK CONSTRAINT; Schema: roadmap; Owner: -
--

ALTER TABLE ONLY roadmap.roadmap_users
    ADD CONSTRAINT fk_user_id FOREIGN KEY (user_id) REFERENCES identity.users(id);


--
-- Name: user_progress fk_user_id; Type: FK CONSTRAINT; Schema: roadmap; Owner: -
--

ALTER TABLE ONLY roadmap.user_progress
    ADD CONSTRAINT fk_user_id FOREIGN KEY (user_id) REFERENCES identity.users(id);


--
-- Name: node_course node_course_course_id_fkey; Type: FK CONSTRAINT; Schema: roadmap; Owner: -
--

ALTER TABLE ONLY roadmap.node_course
    ADD CONSTRAINT node_course_course_id_fkey FOREIGN KEY (course_id) REFERENCES catalog.course(id) ON DELETE CASCADE;


--
-- Name: node_course node_course_node_id_fkey; Type: FK CONSTRAINT; Schema: roadmap; Owner: -
--

ALTER TABLE ONLY roadmap.node_course
    ADD CONSTRAINT node_course_node_id_fkey FOREIGN KEY (node_id) REFERENCES roadmap.nodes(id) ON DELETE CASCADE;


--
-- Name: roadmaps roadmaps_career_role_id_fkey; Type: FK CONSTRAINT; Schema: roadmap; Owner: -
--

ALTER TABLE ONLY roadmap.roadmaps
    ADD CONSTRAINT roadmaps_career_role_id_fkey FOREIGN KEY (career_role_id) REFERENCES catalog.career_role(id) ON DELETE SET NULL;


--
-- Name: assets fk_assets_owner; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.assets
    ADD CONSTRAINT fk_assets_owner FOREIGN KEY (owner_id) REFERENCES identity.users(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict 18jVXSQ0kKqkNu48GgN1d07PS3v2fGUUdbdZnicOSlM5es30RFyZkYzEMJFWpgU


-- Reference data

--
-- PostgreSQL database dump
--

\restrict 6TIHPUneSohwd9gjbHdeqrIvVJzrNJMnyoQqOIiFUUGvFkczQCwOUPr1rt0BY17

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: career_role; Type: TABLE DATA; Schema: catalog; Owner: -
--

INSERT INTO catalog.career_role OVERRIDING SYSTEM VALUE VALUES
	(1, 'frontend_developer', 'Frontend Developer', 'Builds user interfaces for the web', 10, true, '2026-10-17 23:39:11.481914+07', NULL),
	(2, 'backend_developer', 'Backend Developer', 'Builds APIs, services and data access', 20, true, '2026-10-17 23:39:11.481914+07', NULL),
	(3, 'fullstack_developer', 'Fullstack Developer', 'Works across frontend and backend', 30, true, '2026-10-17 23:39:11.481914+07', NULL),
	(4, 'mobile_developer', 'Mobile Developer', 'Builds iOS / Android / cross-platform apps', 40, true, '2026-10-17 23:39:11.481914+07', NULL),
	(5, 'devops_engineer', 'DevOps Engineer', 'Builds, deploys and operates systems', 50, true, '2026-10-17 23:39:11.481914+07', NULL),
	(6, 'data_engineer', 'Data Engineer', 'Builds data pipelines and storage', 60, true, '2026-10-17 23:39:11.481914+07', NULL),
	(7, 'data_analyst', 'Data Analyst', 'Turns data into decisions', 70, true, '2026-10-17 23:39:11.481914+07', NULL),
	(8, 'ml_engineer', 'Machine Learning Engineer', 'Trains and ships ML models', 80, true, '2026-10-17 23:39:11.481914+07', NULL),
	(9, 'qa_engineer', 'QA / Test Engineer', 'Tests and automates quality checks', 90, true, '2026-10-17 23:39:11.481914+07', NULL),
	(10, 'student', 'Student / Career Starter', 'Learning to program, no fixed role yet', 100, true, '2026-10-17 23:39:11.481914+07', NULL);


--
-- Data for Name: skill; Type: TABLE DATA; Schema: catalog; Owner: -
--

INSERT INTO catalog.skill OVERRIDING SYSTEM VALUE VALUES
	(1, 'javascript', 'JavaScript', true, '2026-10-17 23:39:11.481914+07', NULL),
	(2, 'typescript', 'TypeScript', true, '2026-10-17 23:39:11.481914+07', NULL),
	(3, 'python', 'Python', true, '2026-10-17 23:39:11.481914+07', NULL),
	(4, 'html_css', 'HTML & CSS', true, '2026-10-17 23:39:11.481914+07', NULL),
	(5, 'react', 'React', true, '2026-10-17 23:39:11.481914+07', NULL),
	(6, 'nodejs', 'Node.js', true, '2026-10-17 23:39:11.481914+07', NULL),
	(7, 'async_programming', 'Asynchronous programming', true, '2026-10-17 23:39:11.481914+07', NULL),
	(8, 'concurrency', 'Concurrency & consistency', true, '2026-10-17 23:39:11.481914+07', NULL),
	(9, 'performance', 'Performance optimisation', true, '2026-10-17 23:39:11.481914+07', NULL),
	(10, 'api_design', 'API design', true, '2026-10-17 23:39:11.481914+07', NULL),
	(11, 'testing', 'Testing', true, '2026-10-17 23:39:11.481914+07', NULL),
	(12, 'sql', 'SQL & databases', true, '2026-10-17 23:39:11.481914+07', NULL),
	(13, 'data_structures', 'Data structures & algorithms', true, '2026-10-17 23:39:11.481914+07', NULL),
	(14, 'system_design', 'System design', true, '2026-10-17 23:39:11.481914+07', NULL),
	(15, 'docker', 'Docker & containers', true, '2026-10-17 23:39:11.481914+07', NULL),
	(16, 'data_analysis', 'Data analysis', true, '2026-10-17 23:39:11.481914+07', NULL),
	(17, 'machine_learning', 'Machine learning', true, '2026-10-17 23:39:11.481914+07', NULL);


--
-- Data for Name: career_role_skill; Type: TABLE DATA; Schema: catalog; Owner: -
--

INSERT INTO catalog.career_role_skill VALUES
	(10, 1, 3),
	(9, 1, 3),
	(4, 1, 3),
	(3, 1, 5),
	(2, 1, 3),
	(1, 1, 5),
	(4, 2, 3),
	(3, 2, 4),
	(2, 2, 3),
	(1, 2, 4),
	(10, 3, 3),
	(9, 3, 3),
	(8, 3, 5),
	(7, 3, 4),
	(6, 3, 5),
	(5, 3, 3),
	(2, 3, 3),
	(10, 4, 2),
	(3, 4, 3),
	(1, 4, 5),
	(4, 5, 3),
	(3, 5, 4),
	(1, 5, 4),
	(3, 6, 4),
	(2, 6, 4),
	(4, 7, 3),
	(3, 7, 4),
	(2, 7, 4),
	(1, 7, 3),
	(6, 8, 3),
	(5, 8, 2),
	(3, 8, 2),
	(2, 8, 4),
	(6, 9, 3),
	(5, 9, 3),
	(4, 9, 3),
	(2, 9, 3),
	(1, 9, 2),
	(9, 10, 2),
	(3, 10, 3),
	(2, 10, 5),
	(9, 11, 5),
	(2, 11, 2),
	(1, 11, 2),
	(10, 12, 2),
	(7, 12, 5),
	(6, 12, 5),
	(3, 12, 3),
	(2, 12, 5),
	(10, 13, 4),
	(8, 13, 2),
	(6, 14, 3),
	(5, 14, 3),
	(2, 14, 3),
	(5, 15, 5),
	(8, 16, 3),
	(7, 16, 5),
	(8, 17, 5);


--
-- Data for Name: category; Type: TABLE DATA; Schema: catalog; Owner: -
--

INSERT INTO catalog.category VALUES
	(1, 'Web Development', '2026-05-15 06:08:03.863634', NULL),
	(2, 'Frontend Development', '2026-05-15 06:08:03.863634', NULL),
	(3, 'Backend Development', '2026-05-15 06:08:03.863634', NULL),
	(4, 'Fullstack Development', '2026-05-15 06:08:03.863634', NULL),
	(5, 'Mobile Development', '2026-05-15 06:08:03.863634', NULL),
	(6, 'Game Development', '2026-05-15 06:08:03.863634', NULL),
	(7, 'Desktop Application Development', '2026-05-15 06:08:03.863634', NULL),
	(8, 'Software Engineering', '2026-05-15 06:08:03.863634', NULL),
	(9, 'DevOps', '2026-05-15 06:08:03.863634', NULL),
	(10, 'Cloud Computing', '2026-05-15 06:08:03.863634', NULL),
	(11, 'Cyber Security', '2026-05-15 06:08:03.863634', NULL),
	(12, 'Ethical Hacking', '2026-05-15 06:08:03.863634', NULL),
	(13, 'Networking', '2026-05-15 06:08:03.863634', NULL),
	(14, 'Database', '2026-05-15 06:08:03.863634', NULL),
	(15, 'Data Structures & Algorithms', '2026-05-15 06:08:03.863634', NULL),
	(16, 'Competitive Programming', '2026-05-15 06:08:03.863634', NULL),
	(17, 'Artificial Intelligence', '2026-05-15 06:08:03.863634', NULL),
	(18, 'Machine Learning', '2026-05-15 06:08:03.863634', NULL),
	(19, 'Deep Learning', '2026-05-15 06:08:03.863634', NULL),
	(20, 'Data Science', '2026-05-15 06:08:03.863634', NULL),
	(21, 'Big Data', '2026-05-15 06:08:03.863634', NULL),
	(22, 'Computer Vision', '2026-05-15 06:08:03.863634', NULL),
	(23, 'Natural Language Processing', '2026-05-15 06:08:03.863634', NULL),
	(24, 'Blockchain', '2026-05-15 06:08:03.863634', NULL),
	(25, 'Web3 Development', '2026-05-15 06:08:03.863634', NULL),
	(26, 'Embedded Systems', '2026-05-15 06:08:03.863634', NULL),
	(27, 'IoT Development', '2026-05-15 06:08:03.863634', NULL),
	(28, 'Operating Systems', '2026-05-15 06:08:03.863634', NULL),
	(29, 'System Design', '2026-05-15 06:08:03.863634', NULL),
	(30, 'Microservices', '2026-05-15 06:08:03.863634', NULL),
	(31, 'API Development', '2026-05-15 06:08:03.863634', NULL),
	(32, 'GraphQL', '2026-05-15 06:08:03.863634', NULL),
	(33, 'Testing & QA', '2026-05-15 06:08:03.863634', NULL),
	(34, 'Automation Testing', '2026-05-15 06:08:03.863634', NULL),
	(35, 'UI/UX Design', '2026-05-15 06:08:03.863634', NULL),
	(36, 'Product Design', '2026-05-15 06:08:03.863634', NULL),
	(37, 'Computer Graphics', '2026-05-15 06:08:03.863634', NULL),
	(38, 'AR/VR Development', '2026-05-15 06:08:03.863634', NULL),
	(39, 'Programming Fundamentals', '2026-05-15 06:08:03.863634', NULL),
	(40, 'Object-Oriented Programming', '2026-05-15 06:08:03.863634', NULL),
	(41, 'Functional Programming', '2026-05-15 06:08:03.863634', NULL),
	(42, 'Version Control', '2026-05-15 06:08:03.863634', NULL),
	(43, 'Git & GitHub', '2026-05-15 06:08:03.863634', NULL),
	(44, 'Linux', '2026-05-15 06:08:03.863634', NULL),
	(45, 'Shell Scripting', '2026-05-15 06:08:03.863634', NULL),
	(46, 'Docker', '2026-05-15 06:08:03.863634', NULL),
	(47, 'Kubernetes', '2026-05-15 06:08:03.863634', NULL),
	(48, 'CI/CD', '2026-05-15 06:08:03.863634', NULL),
	(49, 'Firebase', '2026-05-15 06:08:03.863634', NULL),
	(50, 'Supabase', '2026-05-15 06:08:03.863634', NULL),
	(51, 'PostgreSQL', '2026-05-15 06:08:03.863634', NULL),
	(52, 'MongoDB', '2026-05-15 06:08:03.863634', NULL),
	(53, 'Redis', '2026-05-15 06:08:03.863634', NULL),
	(54, 'Next.js', '2026-05-15 06:08:03.863634', NULL),
	(55, 'React', '2026-05-15 06:08:03.863634', NULL),
	(56, 'Vue.js', '2026-05-15 06:08:03.863634', NULL),
	(57, 'Angular', '2026-05-15 06:08:03.863634', NULL),
	(58, 'Node.js', '2026-05-15 06:08:03.863634', NULL),
	(59, 'Express.js', '2026-05-15 06:08:03.863634', NULL),
	(60, 'NestJS', '2026-05-15 06:08:03.863634', NULL),
	(61, 'PHP Development', '2026-05-15 06:08:03.863634', NULL),
	(62, 'Laravel', '2026-05-15 06:08:03.863634', NULL),
	(63, 'Python Development', '2026-05-15 06:08:03.863634', NULL),
	(64, 'Django', '2026-05-15 06:08:03.863634', NULL),
	(65, 'Flask', '2026-05-15 06:08:03.863634', NULL),
	(66, 'Java Development', '2026-05-15 06:08:03.863634', NULL),
	(67, 'Spring Boot', '2026-05-15 06:08:03.863634', NULL),
	(68, 'C# Development', '2026-05-15 06:08:03.863634', NULL),
	(69, '.NET Development', '2026-05-15 06:08:03.863634', NULL),
	(70, 'Go Development', '2026-05-15 06:08:03.863634', NULL),
	(71, 'Rust Development', '2026-05-15 06:08:03.863634', NULL),
	(72, 'Swift Development', '2026-05-15 06:08:03.863634', NULL),
	(73, 'Android Development', '2026-05-15 06:08:03.863634', NULL),
	(74, 'iOS Development', '2026-05-15 06:08:03.863634', NULL),
	(75, 'Flutter Development', '2026-05-15 06:08:03.863634', NULL),
	(76, 'React Native', '2026-05-15 06:08:03.863634', NULL),
	(77, 'AI Engineering', '2026-05-15 06:08:03.863634', NULL),
	(78, 'Prompt Engineering', '2026-05-15 06:08:03.863634', NULL),
	(79, 'LLM Engineering', '2026-05-15 06:08:03.863634', NULL),
	(80, 'MLOps', '2026-05-15 06:08:03.863634', NULL),
	(81, 'Research & Algorithms', '2026-05-15 06:08:03.863634', NULL),
	(82, 'Software Architecture', '2026-05-15 06:08:03.863634', NULL),
	(83, 'Design Patterns', '2026-05-15 06:08:03.863634', NULL),
	(84, 'Clean Code', '2026-05-15 06:08:03.863634', NULL),
	(85, 'Performance Optimization', '2026-05-15 06:08:03.863634', NULL),
	(86, 'Realtime Systems', '2026-05-15 06:08:03.863634', NULL),
	(87, 'Streaming Systems', '2026-05-15 06:08:03.863634', NULL),
	(88, 'Distributed Systems', '2026-05-15 06:08:03.863634', NULL),
	(89, 'Web Performance', '2026-05-15 06:08:03.863634', NULL),
	(90, 'SEO', '2026-05-15 06:08:03.863634', NULL),
	(91, 'Freelancing', '2026-05-15 06:08:03.863634', NULL),
	(92, 'Tech Interview Preparation', '2026-05-15 06:08:03.863634', NULL),
	(93, 'Career Development', '2026-05-15 06:08:03.863634', NULL),
	(94, 'Coding Challenges', '2026-05-15 06:08:03.863634', NULL),
	(95, 'Project-Based Learning', '2026-05-15 06:08:03.863634', NULL),
	(96, 'Roadmap Learning', '2026-05-15 06:08:03.863634', NULL);


--
-- Data for Name: industry; Type: TABLE DATA; Schema: catalog; Owner: -
--

INSERT INTO catalog.industry OVERRIDING SYSTEM VALUE VALUES
	(1, 'software_product', 'Software products / SaaS', NULL, 10, true, '2026-10-17 23:39:11.481914+07', NULL),
	(2, 'outsourcing', 'IT services / Outsourcing', NULL, 20, true, '2026-10-17 23:39:11.481914+07', NULL),
	(3, 'fintech', 'Finance / Banking / Fintech', NULL, 30, true, '2026-10-17 23:39:11.481914+07', NULL),
	(4, 'ecommerce', 'E-commerce / Retail', NULL, 40, true, '2026-10-17 23:39:11.481914+07', NULL),
	(5, 'education', 'Education / EdTech', NULL, 50, true, '2026-10-17 23:39:11.481914+07', NULL),
	(6, 'healthcare', 'Healthcare', NULL, 60, true, '2026-10-17 23:39:11.481914+07', NULL),
	(7, 'gaming', 'Gaming / Entertainment', NULL, 70, true, '2026-10-17 23:39:11.481914+07', NULL),
	(8, 'media', 'Media / Marketing', NULL, 80, true, '2026-10-17 23:39:11.481914+07', NULL),
	(9, 'telecom', 'Telecommunications', NULL, 90, true, '2026-10-17 23:39:11.481914+07', NULL),
	(10, 'logistics', 'Logistics / Transportation', NULL, 100, true, '2026-10-17 23:39:11.481914+07', NULL),
	(11, 'manufacturing', 'Manufacturing / IoT', NULL, 110, true, '2026-10-17 23:39:11.481914+07', NULL),
	(12, 'public_sector', 'Government / Public sector', NULL, 120, true, '2026-10-17 23:39:11.481914+07', NULL);


--
-- Data for Name: language; Type: TABLE DATA; Schema: catalog; Owner: -
--

INSERT INTO catalog.language VALUES
	('JavaScript', '#F7DF1E', '/icons/javascript/javascript-original.svg', '2026-05-15 05:50:28.891075', NULL, 1),
	('TypeScript', '#3178C6', '/icons/typescript/typescript-original.svg', '2026-05-15 05:50:28.891075', NULL, 2),
	('Python', '#3776AB', '/icons/python/python-original.svg', '2026-05-15 05:50:28.891075', NULL, 3),
	('Java', '#ED8B00', '/icons/java/java-original.svg', '2026-05-15 05:50:28.891075', NULL, 4),
	('C', '#A8B9CC', '/icons/c/c-original.svg', '2026-05-15 05:50:28.891075', NULL, 5),
	('C++', '#00599C', '/icons/cplusplus/cplusplus-original.svg', '2026-05-15 05:50:28.891075', NULL, 6),
	('C#', '#68217A', '/icons/csharp/csharp-original.svg', '2026-05-15 05:50:28.891075', NULL, 7),
	('PHP', '#777BB4', '/icons/php/php-original.svg', '2026-05-15 05:50:28.891075', NULL, 8),
	('Go', '#00ADD8', '/icons/go/go-original.svg', '2026-05-15 05:50:28.891075', NULL, 9),
	('Rust', '#000000', '/icons/rust/rust-original.svg', '2026-05-15 05:50:28.891075', NULL, 10),
	('Ruby', '#CC342D', '/icons/ruby/ruby-original.svg', '2026-05-15 05:50:28.891075', NULL, 11),
	('Swift', '#FA7343', '/icons/swift/swift-original.svg', '2026-05-15 05:50:28.891075', NULL, 12),
	('Kotlin', '#7F52FF', '/icons/kotlin/kotlin-original.svg', '2026-05-15 05:50:28.891075', NULL, 13),
	('Dart', '#0175C2', '/icons/dart/dart-original.svg', '2026-05-15 05:50:28.891075', NULL, 14),
	('Scala', '#DC322F', '/icons/scala/scala-original.svg', '2026-05-15 05:50:28.891075', NULL, 15),
	('Perl', '#39457E', '/icons/perl/perl-original.svg', '2026-05-15 05:50:28.891075', NULL, 16),
	('R', '#276DC3', '/icons/r/r-original.svg', '2026-05-15 05:50:28.891075', NULL, 17),
	('Lua', '#2C2D72', '/icons/lua/lua-original.svg', '2026-05-15 05:50:28.891075', NULL, 18),
	('Haskell', '#5D4F85', '/icons/haskell/haskell-original.svg', '2026-05-15 05:50:28.891075', NULL, 19),
	('Elixir', '#4B275F', '/icons/elixir/elixir-original.svg', '2026-05-15 05:50:28.891075', NULL, 20),
	('Erlang', '#A90533', '/icons/erlang/erlang-original.svg', '2026-05-15 05:50:28.891075', NULL, 21),
	('Clojure', '#5881D8', '/icons/clojure/clojure-original.svg', '2026-05-15 05:50:28.891075', NULL, 22),
	('F#', '#378BBA', '/icons/fsharp/fsharp-original.svg', '2026-05-15 05:50:28.891075', NULL, 23),
	('OCaml', '#EC6813', '/icons/ocaml/ocaml-original.svg', '2026-05-15 05:50:28.891075', NULL, 24),
	('Objective-C', '#438EFF', '/icons/objectivec/objectivec-original.svg', '2026-05-15 05:50:28.891075', NULL, 25),
	('Shell', '#89E051', '/icons/bash/bash-original.svg', '2026-05-15 05:50:28.891075', NULL, 26),
	('PowerShell', '#5391FE', '/icons/powershell/powershell-original.svg', '2026-05-15 05:50:28.891075', NULL, 27),
	('SQL', '#336791', '/icons/postgresql/postgresql-original.svg', '2026-05-15 05:50:28.891075', NULL, 28),
	('HTML5', '#E34F26', '/icons/html5/html5-original.svg', '2026-05-15 05:50:28.891075', NULL, 29),
	('CSS3', '#1572B6', '/icons/css3/css3-original.svg', '2026-05-15 05:50:28.891075', NULL, 30),
	('Sass', '#CC6699', '/icons/sass/sass-original.svg', '2026-05-15 05:50:28.891075', NULL, 31),
	('Less', '#1D365D', '/icons/less/less-plain-wordmark.svg', '2026-05-15 05:50:28.891075', NULL, 32),
	('GraphQL', '#E10098', '/icons/graphql/graphql-plain.svg', '2026-05-15 05:50:28.891075', NULL, 33),
	('Markdown', '#000000', '/icons/markdown/markdown-original.svg', '2026-05-15 05:50:28.891075', NULL, 34),
	('XML', '#FF6600', '/icons/xml/xml-original.svg', '2026-05-15 05:50:28.891075', NULL, 35),
	('YAML', '#CB171E', '/icons/yaml/yaml-original.svg', '2026-05-15 05:50:28.891075', NULL, 36),
	('JSON', '#000000', '/icons/json/json-original.svg', '2026-05-15 05:50:28.891075', NULL, 37),
	('Assembly', '#6E4C13', '/icons/assembly/assembly-original.svg', '2026-05-15 05:50:28.891075', NULL, 38),
	('Visual Basic', '#512BD4', '/icons/visualbasic/visualbasic-original.svg', '2026-05-15 05:50:28.891075', NULL, 39),
	('MATLAB', '#E16737', '/icons/matlab/matlab-original.svg', '2026-05-15 05:50:28.891075', NULL, 40),
	('Fortran', '#734F96', '/icons/fortran/fortran-original.svg', '2026-05-15 05:50:28.891075', NULL, 41),
	('COBOL', '#005CA5', '/icons/cobol/cobol-original.svg', '2026-05-15 05:50:28.891075', NULL, 42),
	('Groovy', '#4298B8', '/icons/groovy/groovy-original.svg', '2026-05-15 05:50:28.891075', NULL, 43),
	('Julia', '#9558B2', '/icons/julia/julia-original.svg', '2026-05-15 05:50:28.891075', NULL, 44),
	('Nim', '#FFE953', '/icons/nim/nim-original.svg', '2026-05-15 05:50:28.891075', NULL, 45),
	('Crystal', '#000000', '/icons/crystal/crystal-original.svg', '2026-05-15 05:50:28.891075', NULL, 46),
	('Solidity', '#363636', '/icons/solidity/solidity-original.svg', '2026-05-15 05:50:28.891075', NULL, 47),
	('V', '#5D87BF', '/icons/v/v-original.svg', '2026-05-15 05:50:28.891075', NULL, 48),
	('Zig', '#F7A41D', '/icons/zig/zig-original.svg', '2026-05-15 05:50:28.891075', NULL, 49),
	('Elm', '#1293D8', '/icons/elm/elm-original.svg', '2026-05-15 05:50:28.891075', NULL, 50),
	('ReasonML', '#DD4B39', '/icons/reasonml/reasonml-original.svg', '2026-05-15 05:50:28.891075', NULL, 51),
	('CoffeeScript', '#2F2625', '/icons/coffeescript/coffeescript-original.svg', '2026-05-15 05:50:28.891075', NULL, 52),
	('Prolog', '#74283C', '/icons/prolog/prolog-original.svg', '2026-05-15 05:50:28.891075', NULL, 53),
	('Ada', '#02F88C', '/icons/ada/ada-original.svg', '2026-05-15 05:50:28.891075', NULL, 54),
	('Pascal', '#E3F171', '/icons/pascal/pascal-original.svg', '2026-05-15 05:50:28.891075', NULL, 55),
	('Scheme', '#1E4AEC', '/icons/scheme/scheme-original.svg', '2026-05-15 05:50:28.891075', NULL, 56),
	('Lisp', '#3FB68B', '/icons/lisp/lisp-original.svg', '2026-05-15 05:50:28.891075', NULL, 57),
	('Common Lisp', '#563D7C', '/icons/commonlisp/commonlisp-original.svg', '2026-05-15 05:50:28.891075', NULL, 58),
	('Racket', '#9F1D20', '/icons/racket/racket-original.svg', '2026-05-15 05:50:28.891075', NULL, 59),
	('Tcl', '#FF6600', '/icons/tcl/tcl-original.svg', '2026-05-15 05:50:28.891075', NULL, 60),
	('Awk', '#4D4D4D', '/icons/awk/awk-original.svg', '2026-05-15 05:50:28.891075', NULL, 61),
	('Sed', '#999999', '/icons/sed/sed-original.svg', '2026-05-15 05:50:28.891075', NULL, 62),
	('Smalltalk', '#596706', '/icons/smalltalk/smalltalk-original.svg', '2026-05-15 05:50:28.891075', NULL, 63),
	('LabVIEW', '#FFDB00', '/icons/labview/labview-original.svg', '2026-05-15 05:50:28.891075', NULL, 64),
	('Verilog', '#B2B7F8', '/icons/verilog/verilog-original.svg', '2026-05-15 05:50:28.891075', NULL, 65),
	('VHDL', '#543978', '/icons/vhdl/vhdl-original.svg', '2026-05-15 05:50:28.891075', NULL, 66);


--
-- Data for Name: learning_goal; Type: TABLE DATA; Schema: catalog; Owner: -
--

INSERT INTO catalog.learning_goal OVERRIDING SYSTEM VALUE VALUES
	(1, 'first_job', 'Get my first developer job', NULL, 10, true, '2026-10-17 23:39:11.481914+07', NULL),
	(2, 'change_career', 'Switch careers into tech', NULL, 20, true, '2026-10-17 23:39:11.481914+07', NULL),
	(3, 'grow_in_role', 'Level up in my current role', NULL, 30, true, '2026-10-17 23:39:11.481914+07', NULL),
	(4, 'interview_prep', 'Prepare for technical interviews', NULL, 40, true, '2026-10-17 23:39:11.481914+07', NULL),
	(5, 'build_projects', 'Build real projects', NULL, 50, true, '2026-10-17 23:39:11.481914+07', NULL),
	(6, 'fundamentals', 'Strengthen programming fundamentals', NULL, 60, true, '2026-10-17 23:39:11.481914+07', NULL),
	(7, 'performance', 'Write faster, more reliable systems', NULL, 70, true, '2026-10-17 23:39:11.481914+07', NULL);


--
-- Data for Name: permissions; Type: TABLE DATA; Schema: identity; Owner: -
--

INSERT INTO identity.permissions VALUES
	(1, 'index', 'read', 'Read index page', '2026-07-07 03:03:07.026967', NULL),
	(2, 'home', 'list', 'List home content', '2026-07-07 03:03:07.026967', NULL),
	(3, 'home', 'read', 'Read home page', '2026-07-07 03:03:07.026967', NULL),
	(4, 'course', 'list', 'List courses', '2026-07-07 03:03:07.026967', NULL),
	(5, 'course', 'read', 'Read course details', '2026-07-07 03:03:07.026967', NULL),
	(6, 'course', 'create', 'Create a new course', '2026-07-07 03:03:07.026967', NULL),
	(7, 'course', 'update', 'Update own course', '2026-07-07 03:03:07.026967', NULL),
	(8, 'course', 'delete', 'Delete a course', '2026-07-07 03:03:07.026967', NULL),
	(9, 'course', 'comment', 'Comment on a course', '2026-07-07 03:03:07.026967', NULL),
	(10, 'blog', 'list', 'List blog posts', '2026-07-07 03:03:07.026967', NULL),
	(11, 'blog', 'read', 'Read blog post', '2026-07-07 03:03:07.026967', NULL),
	(12, 'blog', 'create', 'Create a blog post', '2026-07-07 03:03:07.026967', NULL),
	(13, 'blog', 'update', 'Update own blog post', '2026-07-07 03:03:07.026967', NULL),
	(14, 'blog', 'delete', 'Delete a blog post', '2026-07-07 03:03:07.026967', NULL),
	(15, 'roadmap', 'list', 'List roadmaps', '2026-07-07 03:03:07.026967', NULL),
	(16, 'roadmap', 'read', 'Read roadmap details', '2026-07-07 03:03:07.026967', NULL),
	(17, 'roadmap', 'create', 'Create a new roadmap', '2026-07-07 03:03:07.026967', NULL),
	(18, 'roadmap', 'update', 'Update a roadmap', '2026-07-07 03:03:07.026967', NULL),
	(19, 'roadmap', 'delete', 'Delete a roadmap', '2026-07-07 03:03:07.026967', NULL),
	(22, 'settings', 'list', 'List settings options', '2026-07-07 03:03:07.026967', NULL),
	(23, 'settings', 'read', 'Read user settings', '2026-07-07 03:03:07.026967', NULL),
	(24, 'settings', 'update', 'Update user settings', '2026-07-07 03:03:07.026967', NULL),
	(20, 'learning', 'list', 'List learning course', '2026-07-07 03:03:07.026967', NULL),
	(21, 'learning', 'read', 'Read learning content', '2026-07-07 03:03:07.026967', NULL),
	(25, 'course', 'learn', 'Learn course', '2026-08-15 05:00:37.675675', NULL),
	(26, 'course', 'publish', 'Publish / unpublish / archive courses', '2026-10-17 23:39:26.267168', NULL),
	(27, 'course', 'price', 'Create and deactivate course offers', '2026-10-17 23:39:26.267168', NULL),
	(28, 'points', 'adjust', 'Adjust a user''s point balance', '2026-10-17 23:39:26.267168', NULL),
	(29, 'order', 'list', 'List every order', '2026-10-17 23:39:26.267168', NULL),
	(30, 'order', 'refund', 'Refund points orders', '2026-10-17 23:39:26.267168', NULL),
	(31, 'entitlement', 'grant', 'Grant or revoke course access', '2026-10-17 23:39:26.267168', NULL),
	(32, 'admin', 'read', 'Open the admin area', '2026-10-17 23:39:26.267168', NULL);


--
-- Data for Name: roles; Type: TABLE DATA; Schema: identity; Owner: -
--

INSERT INTO identity.roles VALUES
	(4, 'admin', 'Admin', NULL, '2026-07-07 03:03:03.4937', NULL),
	(1, 'user', 'User', NULL, '2026-07-07 03:03:03.4937', NULL),
	(2, 'student', 'Student', NULL, '2026-07-07 03:03:03.4937', NULL),
	(3, 'instructor', 'Instructor', NULL, '2026-07-07 03:03:03.4937', NULL),
	(5, 'course_manager', 'Course manager', 'Manages course metadata, publishing and prices', '2026-10-17 23:39:26.267168', NULL);


--
-- Data for Name: role_permissions; Type: TABLE DATA; Schema: identity; Owner: -
--

INSERT INTO identity.role_permissions VALUES
	(1, 1, '2026-07-07 03:05:23.989425'),
	(1, 2, '2026-07-07 03:05:23.989425'),
	(1, 4, '2026-07-07 03:05:23.989425'),
	(1, 5, '2026-07-07 03:05:23.989425'),
	(1, 6, '2026-07-07 03:05:23.989425'),
	(1, 7, '2026-07-07 03:05:23.989425'),
	(1, 9, '2026-07-07 03:05:23.989425'),
	(1, 10, '2026-07-07 03:05:23.989425'),
	(1, 11, '2026-07-07 03:05:23.989425'),
	(1, 12, '2026-07-07 03:05:23.989425'),
	(1, 13, '2026-07-07 03:05:23.989425'),
	(1, 15, '2026-07-07 03:05:23.989425'),
	(1, 16, '2026-07-07 03:05:23.989425'),
	(1, 20, '2026-07-07 03:05:23.989425'),
	(1, 21, '2026-07-07 03:05:23.989425'),
	(1, 22, '2026-07-07 03:05:23.989425'),
	(1, 23, '2026-07-07 03:05:23.989425'),
	(1, 24, '2026-07-07 03:05:23.989425'),
	(1, 25, '2026-08-15 05:00:58.661277'),
	(5, 1, '2026-10-17 23:39:26.267168'),
	(5, 2, '2026-10-17 23:39:26.267168'),
	(5, 3, '2026-10-17 23:39:26.267168'),
	(5, 4, '2026-10-17 23:39:26.267168'),
	(5, 5, '2026-10-17 23:39:26.267168'),
	(4, 6, '2026-10-17 23:39:26.267168'),
	(5, 6, '2026-10-17 23:39:26.267168'),
	(4, 7, '2026-10-17 23:39:26.267168'),
	(5, 7, '2026-10-17 23:39:26.267168'),
	(4, 8, '2026-10-17 23:39:26.267168'),
	(5, 9, '2026-10-17 23:39:26.267168'),
	(5, 15, '2026-10-17 23:39:26.267168'),
	(5, 16, '2026-10-17 23:39:26.267168'),
	(5, 22, '2026-10-17 23:39:26.267168'),
	(5, 23, '2026-10-17 23:39:26.267168'),
	(5, 24, '2026-10-17 23:39:26.267168'),
	(5, 20, '2026-10-17 23:39:26.267168'),
	(5, 21, '2026-10-17 23:39:26.267168'),
	(5, 25, '2026-10-17 23:39:26.267168'),
	(4, 26, '2026-10-17 23:39:26.267168'),
	(5, 26, '2026-10-17 23:39:26.267168'),
	(4, 27, '2026-10-17 23:39:26.267168'),
	(5, 27, '2026-10-17 23:39:26.267168'),
	(4, 28, '2026-10-17 23:39:26.267168'),
	(4, 29, '2026-10-17 23:39:26.267168'),
	(4, 30, '2026-10-17 23:39:26.267168'),
	(4, 31, '2026-10-17 23:39:26.267168'),
	(4, 32, '2026-10-17 23:39:26.267168'),
	(5, 32, '2026-10-17 23:39:26.267168');


--
-- Data for Name: exp_level; Type: TABLE DATA; Schema: profile; Owner: -
--

INSERT INTO profile.exp_level VALUES
	(1, 'Newbie', 0, true),
	(2, 'Beginner', 100, true),
	(3, 'Beginner+', 250, true),
	(4, 'Learner', 450, true),
	(5, 'Learner+', 700, true),
	(6, 'Apprentice', 1000, true),
	(7, 'Apprentice+', 1400, true),
	(8, 'Developer', 1900, true),
	(9, 'Developer+', 2500, true),
	(10, 'Skilled Developer', 3200, true),
	(11, 'Skilled Developer+', 4000, true),
	(12, 'Specialist', 4900, true),
	(13, 'Specialist+', 5900, true),
	(14, 'Advanced Developer', 7000, true),
	(15, 'Advanced Developer+', 8300, true),
	(16, 'Expert', 9800, true),
	(17, 'Expert+', 11500, true),
	(18, 'Master', 13500, true),
	(19, 'Master+', 16000, true),
	(20, 'Grandmaster', 19000, true);


--
-- Data for Name: exp_rule; Type: TABLE DATA; Schema: profile; Owner: -
--

INSERT INTO profile.exp_rule VALUES
	('lesson', 10, true, '2026-10-18 23:57:45.617706+07'),
	('quiz.easy', 5, true, '2026-10-18 23:57:45.617706+07'),
	('quiz.medium', 8, true, '2026-10-18 23:57:45.617706+07'),
	('quiz.hard', 12, true, '2026-10-18 23:57:45.617706+07'),
	('coding.mini_coding.easy', 10, true, '2026-10-18 23:57:45.617706+07'),
	('coding.mini_coding.medium', 20, true, '2026-10-18 23:57:45.617706+07'),
	('coding.mini_coding.hard', 35, true, '2026-10-18 23:57:45.617706+07'),
	('coding.fix_bug.easy', 8, true, '2026-10-18 23:57:45.617706+07'),
	('coding.fix_bug.medium', 15, true, '2026-10-18 23:57:45.617706+07'),
	('coding.fix_bug.hard', 25, true, '2026-10-18 23:57:45.617706+07'),
	('course.beginner', 50, true, '2026-10-18 23:57:45.617706+07'),
	('course.intermediate', 100, true, '2026-10-18 23:57:45.617706+07'),
	('course.advanced', 150, true, '2026-10-18 23:57:45.617706+07'),
	('course.expert', 200, true, '2026-10-18 23:57:45.617706+07'),
	('course.master', 200, true, '2026-10-18 23:57:45.617706+07'),
	('lesson.video', 10, false, '2026-10-18 23:57:45.617706+07'),
	('project.mini', 50, false, '2026-10-18 23:57:45.617706+07'),
	('project.capstone', 100, false, '2026-10-18 23:57:45.617706+07');


--
-- Data for Name: rank_tier; Type: TABLE DATA; Schema: profile; Owner: -
--

INSERT INTO profile.rank_tier VALUES
	('overall', 1, 'Rookie', 0),
	('overall', 2, 'Learner', 500),
	('overall', 3, 'Practitioner', 1500),
	('overall', 4, 'Elite', 4000),
	('overall', 5, 'Master', 9000),
	('overall', 6, 'Legend', 18000),
	('exp', 1, 'Starter', 0),
	('exp', 2, 'Foundation', 450),
	('exp', 3, 'Developer', 1900),
	('exp', 4, 'Specialist', 4900),
	('exp', 5, 'Expert', 9800),
	('exp', 6, 'Master', 13500),
	('points', 1, 'Bronze', 0),
	('points', 2, 'Silver', 300),
	('points', 3, 'Gold', 1000),
	('points', 4, 'Platinum', 3000),
	('points', 5, 'Diamond', 7500),
	('points', 6, 'Legend', 15000);


--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.schema_migrations VALUES
	('20261015_001', 'schema_reorganization', '903f40e4fff2b2e7663682d2fe9bdea3670097e9c56f42bdb74ac1f826ddb3c2', '2026-10-17 11:46:40.277268+07', 'baseline:CuongCoder'),
	('20261015_002', 'fix_lesson_lock_errcode', '90eb7a68e36e3beb01526a429401edf26593568921bf0ddcf774670efceb9a8a', '2026-10-17 11:46:40.279264+07', 'baseline:CuongCoder'),
	('20261016_001', 'auth_session_hardening', 'cd9a5102f540bb6a1b8c34c0371e9d002c2cd78ab46b01afc6d26c4cecc8b8d2', '2026-10-17 11:46:40.280638+07', 'baseline:CuongCoder'),
	('20261017_001', 'storage_assets_media', '3b7cd1f4a00dfe382e6c2e1f63e7b482b7b8dc298d86aac6449778f4ac6477cd', '2026-10-17 11:46:40.281475+07', 'CuongCoder'),
	('20261017_002', 'sync_auth_with_provider', 'ed40d825ff7b6a206b4306571ed9425c4c8488c784c7675627a0863fc5c44af9', '2026-10-17 11:46:40.365352+07', 'CuongCoder'),
	('20261017_003', 'course_metadata_onboarding', 'db64c628c1b0d7bdece414855f1040b31e5ee8f70dd13727f39d2803d79a5977', '2026-10-17 23:39:11.481914+07', 'CuongCoder'),
	('20261017_004', 'commerce_points_entitlements', '77aab3782d9c0459107e48e98009ee8a759527fdb3ab212169a5ce866ad6c4d6', '2026-10-17 23:39:26.267168+07', 'CuongCoder'),
	('20261017_005', 'course_access_enforcement', '4c31f934ec694ff1e2ed56f56e4b3fc0f4b210875c1cde9853809027f46ea22a', '2026-10-17 23:39:26.664893+07', 'CuongCoder'),
	('20261018_001', 'experience_levels', 'f9441827aab7b45c44673d1a4628aa356b5b941be88e40a8157e0987625ce052', '2026-10-18 23:57:45.617706+07', 'CuongCoder'),
	('20261018_003', '20261018_003_drop_profile_star.sql', '4a25e3e6feaf93553e6493814b73400a704f7fd8528e4fd1b7fb89fc082b275a', '2026-10-18 23:57:45.935303+07', 'CuongCoder'),
	('20261018_002', 'progress_challenge_exp', '4d2f908406ce57a33341ebfbcd1119ab46a961040c9f4d935d7f2e0869ef7963', '2026-10-19 00:14:31.269458+07', 'CuongCoder'),
	('20261019_001', 'profile_privacy_ranking', '1b7e5d81b76336d109fa2ea3e374dee5c3c981aa1948d2acf50880986bfbc911', '2026-10-19 20:54:54.310784+07', 'CuongCoder'),
	('20261023_001', 'oauth_account_linking', '0b54386bb3cf1bd3c31023f238a47f579289611313387526bd6a57caa6dedc92', '2026-10-23 10:25:39.142665+07', 'CuongCoder'),
	('20261023_002', 'email_verification', '9a796f2ac25d93abd7ea195f84596ceef2853d70e5e0a8a9fa070df4db955633', '2026-10-23 15:31:10.457905+07', 'CuongCoder');


--
-- Name: career_role_id_seq; Type: SEQUENCE SET; Schema: catalog; Owner: -
--

SELECT pg_catalog.setval('catalog.career_role_id_seq', 10, true);


--
-- Name: category_id_seq; Type: SEQUENCE SET; Schema: catalog; Owner: -
--

SELECT pg_catalog.setval('catalog.category_id_seq', 96, true);


--
-- Name: industry_id_seq; Type: SEQUENCE SET; Schema: catalog; Owner: -
--

SELECT pg_catalog.setval('catalog.industry_id_seq', 12, true);


--
-- Name: language_id_seq; Type: SEQUENCE SET; Schema: catalog; Owner: -
--

SELECT pg_catalog.setval('catalog.language_id_seq', 66, true);


--
-- Name: learning_goal_id_seq; Type: SEQUENCE SET; Schema: catalog; Owner: -
--

SELECT pg_catalog.setval('catalog.learning_goal_id_seq', 7, true);


--
-- Name: skill_id_seq; Type: SEQUENCE SET; Schema: catalog; Owner: -
--

SELECT pg_catalog.setval('catalog.skill_id_seq', 17, true);


--
-- Name: permissions_id_seq; Type: SEQUENCE SET; Schema: identity; Owner: -
--

SELECT pg_catalog.setval('identity.permissions_id_seq', 32, true);


--
-- Name: roles_id_seq; Type: SEQUENCE SET; Schema: identity; Owner: -
--

SELECT pg_catalog.setval('identity.roles_id_seq', 5, true);


--
-- PostgreSQL database dump complete
--

\unrestrict 6TIHPUneSohwd9gjbHdeqrIvVJzrNJMnyoQqOIiFUUGvFkczQCwOUPr1rt0BY17

