-- =============================================================================
-- 20261015_001_schema_reorganization.sql
--
-- Splits the database into domain schemas, adds missing keys / indexes, fixes
-- broken defaults and trigger functions, and creates the DBML tables that did
-- not exist yet. Table data is moved in place (ALTER TABLE ... SET SCHEMA), so
-- rows, sequences, indexes and constraints are preserved.
--
--   identity   users, accounts, sessions, refresh_tokens, roles, permissions,
--              user_roles, role_permissions                    (was: private)
--   profile    info, point_transaction, notification, task    (was: private)
--   catalog    course, category, language                     (was: public)
--   course     module, lesson                                 (content only)
--   learning   register, history, favorite, recovery, user_progress (view)
--   challenge  challenges, quiz + coding tables               (unchanged)
--   roadmap    roadmaps (was: public), nodes, node_course, roadmap_users,
--              user_progress
--   community  comment, voting, event, event_join, feedback, team,
--              team_members (new), friend, messages
--   commerce   cart_items, orders, order_items                (new)
--   storage    assets
--   public     shared enum types + API functions only
--
-- Deploy together with the application code that uses the new names.
-- Runs in a single transaction: any failure rolls everything back.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Schemas
-- -----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS profile;
CREATE SCHEMA IF NOT EXISTS catalog;
CREATE SCHEMA IF NOT EXISTS course;
CREATE SCHEMA IF NOT EXISTS learning;
CREATE SCHEMA IF NOT EXISTS challenge;
CREATE SCHEMA IF NOT EXISTS roadmap;
CREATE SCHEMA IF NOT EXISTS community;
CREATE SCHEMA IF NOT EXISTS commerce;
CREATE SCHEMA IF NOT EXISTS storage;

COMMENT ON SCHEMA identity  IS 'Authentication & authorization: users, accounts, sessions, RBAC';
COMMENT ON SCHEMA profile   IS 'Per-user data: profile info, points ledger, notifications, tasks';
COMMENT ON SCHEMA catalog   IS 'Course catalog: courses, categories, languages';
COMMENT ON SCHEMA course    IS 'Course content structure: modules, lessons';
COMMENT ON SCHEMA learning  IS 'Learner state: enrollments, lesson progress, favorites, recovery';
COMMENT ON SCHEMA challenge IS 'Lesson challenges: quizzes and coding exercises';
COMMENT ON SCHEMA roadmap   IS 'Learning roadmaps and per-user roadmap progress';
COMMENT ON SCHEMA community IS 'Comments, votes, events, feedback, teams, friendships, messages';
COMMENT ON SCHEMA commerce  IS 'Cart and orders';
COMMENT ON SCHEMA storage   IS 'Stored file metadata (S3 / Cloudinary assets)';

-- Objects that depend on moved tables; recreated below.
DROP VIEW IF EXISTS public.user_progress;
DROP FUNCTION IF EXISTS public.course_voting_change();  -- referenced a non-existent course.comment table, no trigger used it

-- -----------------------------------------------------------------------------
-- 1. Move tables into their domain schema
-- -----------------------------------------------------------------------------
ALTER TABLE private.users            SET SCHEMA identity;
ALTER TABLE private.accounts         SET SCHEMA identity;
ALTER TABLE private.sessions         SET SCHEMA identity;
ALTER TABLE private.refresh_tokens   SET SCHEMA identity;
ALTER TABLE private.roles            SET SCHEMA identity;
ALTER TABLE private.permissions      SET SCHEMA identity;
ALTER TABLE private.user_roles       SET SCHEMA identity;
ALTER TABLE private.role_permissions SET SCHEMA identity;

ALTER TABLE private.info              SET SCHEMA profile;
ALTER TABLE private.point_transaction SET SCHEMA profile;
ALTER TABLE private.notification      SET SCHEMA profile;
ALTER TABLE private.task              SET SCHEMA profile;

ALTER TABLE public.course   SET SCHEMA catalog;
ALTER TABLE public.category SET SCHEMA catalog;
ALTER TABLE public.language SET SCHEMA catalog;

ALTER TABLE course.register SET SCHEMA learning;
ALTER TABLE course.history  SET SCHEMA learning;
ALTER TABLE course.favorite SET SCHEMA learning;
ALTER TABLE course.recovery SET SCHEMA learning;

ALTER TABLE public.roadmaps SET SCHEMA roadmap;

ALTER TABLE public.comment    SET SCHEMA community;
ALTER TABLE private.voting    SET SCHEMA community;
ALTER TABLE public.event      SET SCHEMA community;
ALTER TABLE event."join"      SET SCHEMA community;
ALTER TABLE community."join"  RENAME TO event_join;
ALTER TABLE public.feedback   SET SCHEMA community;
ALTER TABLE public.team       SET SCHEMA community;
ALTER TABLE private.friend    SET SCHEMA community;
ALTER TABLE storage.messages  SET SCHEMA community;

DROP SCHEMA private;  -- RESTRICT: fails if anything was left behind
DROP SCHEMA event;

-- -----------------------------------------------------------------------------
-- 2. Column naming fixes (create_at / update_at typos)
-- -----------------------------------------------------------------------------
ALTER TABLE learning.history   RENAME COLUMN create_at TO created_at;
ALTER TABLE learning.history   RENAME COLUMN update_at TO updated_at;
ALTER TABLE profile.info       RENAME COLUMN create_at TO created_at;
ALTER TABLE profile.info       RENAME COLUMN update_at TO updated_at;
ALTER TABLE community.feedback RENAME COLUMN create_at TO created_at;

-- -----------------------------------------------------------------------------
-- 3. Missing id defaults (inserts that omit id were failing)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['learning.favorite', 'community.comment'] LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_attribute
            WHERE attrelid = t::regclass AND attname = 'id' AND (attidentity <> '' OR atthasdef)
        ) THEN
            EXECUTE format('ALTER TABLE %s ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY', t);
        END IF;
    END LOOP;
END $$;
SELECT setval(pg_get_serial_sequence('learning.favorite', 'id'), COALESCE((SELECT max(id) FROM learning.favorite), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('community.comment', 'id'), COALESCE((SELECT max(id) FROM community.comment), 0) + 1, false);

-- register.deleted_at defaulted to now() on every new enrollment.
ALTER TABLE learning.register ALTER COLUMN deleted_at DROP DEFAULT;
UPDATE learning.register SET deleted_at = NULL WHERE is_deleted = false AND deleted_at IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 4. Type fixes: user references stored as public_id strings -> bigint FKs
-- -----------------------------------------------------------------------------
-- community.team.host_id (varchar public_id) -> bigint users.id
ALTER TABLE community.team ADD COLUMN host_user_id bigint;
UPDATE community.team t SET host_user_id = u.id FROM identity.users u WHERE u.public_id = t.host_id;
DELETE FROM community.team WHERE host_user_id IS NULL;
ALTER TABLE community.team DROP COLUMN host_id;
ALTER TABLE community.team RENAME COLUMN host_user_id TO host_id;
ALTER TABLE community.team ALTER COLUMN host_id SET NOT NULL;

-- community.feedback.sender (public_id or 'anonymous') -> nullable user_id
ALTER TABLE community.feedback ADD COLUMN user_id bigint;
UPDATE community.feedback f SET user_id = u.id FROM identity.users u WHERE u.public_id = f.sender;
ALTER TABLE community.feedback DROP COLUMN sender;

-- community.event_join (varchar ids) -> bigint user / uuid event
ALTER TABLE community.event_join DROP CONSTRAINT join_pkey;
ALTER TABLE community.event_join ADD COLUMN user_ref bigint, ADD COLUMN event_ref uuid;
UPDATE community.event_join j SET user_ref = u.id FROM identity.users u WHERE u.public_id = j.user_id;
UPDATE community.event_join SET event_ref = event_id::uuid
 WHERE event_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
DELETE FROM community.event_join WHERE user_ref IS NULL OR event_ref IS NULL;
ALTER TABLE community.event_join DROP COLUMN user_id, DROP COLUMN event_id;
ALTER TABLE community.event_join RENAME COLUMN user_ref TO user_id;
ALTER TABLE community.event_join RENAME COLUMN event_ref TO event_id;
ALTER TABLE community.event_join ALTER COLUMN user_id SET NOT NULL, ALTER COLUMN event_id SET NOT NULL;
ALTER TABLE community.event_join ADD CONSTRAINT event_join_pkey PRIMARY KEY (event_id, user_id);

-- community.event.created_by (varchar) -> bigint users.id
ALTER TABLE community.event ADD COLUMN created_by_user bigint;
UPDATE community.event e SET created_by_user = u.id FROM identity.users u WHERE u.public_id = e.created_by;
DELETE FROM community.event WHERE created_by_user IS NULL;
ALTER TABLE community.event DROP COLUMN created_by;
ALTER TABLE community.event RENAME COLUMN created_by_user TO created_by;
ALTER TABLE community.event ALTER COLUMN created_by SET NOT NULL;

-- community.messages (varchar sender/receiver) -> bigint users.id
ALTER TABLE community.messages ADD COLUMN sender_ref bigint, ADD COLUMN receiver_ref bigint;
UPDATE community.messages m SET sender_ref = u.id FROM identity.users u WHERE u.public_id = m.sender_id;
UPDATE community.messages m SET receiver_ref = u.id FROM identity.users u WHERE u.public_id = m.receiver_id;
DELETE FROM community.messages WHERE sender_ref IS NULL OR receiver_ref IS NULL;
ALTER TABLE community.messages DROP COLUMN sender_id, DROP COLUMN receiver_id;
ALTER TABLE community.messages RENAME COLUMN sender_ref TO sender_id;
ALTER TABLE community.messages RENAME COLUMN receiver_ref TO receiver_id;
ALTER TABLE community.messages ALTER COLUMN sender_id SET NOT NULL, ALTER COLUMN receiver_id SET NOT NULL;
ALTER TABLE community.messages ADD COLUMN read_at timestamp;

-- challenge.challenges.question_id duplicated questions.challenge_id
ALTER TABLE challenge.challenges DROP COLUMN question_id;

-- -----------------------------------------------------------------------------
-- 5. Keys, constraints and indexes
-- -----------------------------------------------------------------------------
-- identity
ALTER TABLE identity.users ADD CONSTRAINT users_username_key UNIQUE (username);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON identity.accounts (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_session ON identity.refresh_tokens (session_id);
DROP INDEX IF EXISTS identity.idx_user_roles_user;              -- covered by PK (user_id, role_id)
DROP INDEX IF EXISTS identity.idx_role_permissions_role;        -- covered by PK (role_id, permission_id)
ALTER TABLE identity.accounts DROP CONSTRAINT fk_user_id;
ALTER TABLE identity.accounts ADD CONSTRAINT fk_accounts_user FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;
ALTER TABLE identity.sessions DROP CONSTRAINT sessions_user_id_fkey;
ALTER TABLE identity.sessions ADD CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;
ALTER TABLE identity.refresh_tokens DROP CONSTRAINT fk_session_id;
ALTER TABLE identity.refresh_tokens ADD CONSTRAINT fk_refresh_tokens_session FOREIGN KEY (session_id) REFERENCES identity.sessions(id) ON DELETE CASCADE;

-- profile
ALTER TABLE profile.info ADD CONSTRAINT info_user_id_key UNIQUE (user_id);
ALTER TABLE profile.info DROP CONSTRAINT fk_user_id;
ALTER TABLE profile.info ADD CONSTRAINT fk_info_user FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;
ALTER TABLE profile.info ADD CONSTRAINT chk_info_counters CHECK (rank >= 0 AND star >= 0 AND points >= 0);
ALTER TABLE profile.point_transaction ADD CONSTRAINT uq_point_transaction_source UNIQUE (user_id, source_type, source_id, action);
ALTER TABLE profile.point_transaction DROP CONSTRAINT fk_user_id;
ALTER TABLE profile.point_transaction ADD CONSTRAINT fk_point_transaction_user FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;
ALTER TABLE profile.notification ADD CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_notification_user ON profile.notification (user_id, created_at DESC) WHERE is_deleted = false;
ALTER TABLE profile.task DROP CONSTRAINT fk_user_id;
ALTER TABLE profile.task ADD CONSTRAINT fk_task_user FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_task_user ON profile.task (user_id, status);

-- catalog
ALTER TABLE catalog.course ADD CONSTRAINT course_public_id_key UNIQUE (public_id);
ALTER TABLE catalog.course ADD CONSTRAINT fk_course_category FOREIGN KEY (category_id) REFERENCES catalog.category(id);
ALTER TABLE catalog.course ADD CONSTRAINT fk_course_language FOREIGN KEY (language_id) REFERENCES catalog.language(id);
ALTER TABLE catalog.course ADD CONSTRAINT chk_course_counters
    CHECK (modules >= 0 AND lessons >= 0 AND students >= 0 AND duration >= 0 AND COALESCE(cost, 0) >= 0);
CREATE INDEX IF NOT EXISTS idx_course_category ON catalog.course (category_id);
CREATE INDEX IF NOT EXISTS idx_course_language ON catalog.course (language_id);
CREATE INDEX IF NOT EXISTS idx_course_listing ON catalog.course (id DESC) WHERE is_hidden = false AND is_deleted = false;

-- course content
ALTER TABLE course.module DROP CONSTRAINT fk_course_id;
ALTER TABLE course.module ADD CONSTRAINT fk_module_course FOREIGN KEY (course_id) REFERENCES catalog.course(id) ON DELETE CASCADE;
ALTER TABLE course.lesson DROP CONSTRAINT fk_module_id;
ALTER TABLE course.lesson ADD CONSTRAINT fk_lesson_module FOREIGN KEY (module_id) REFERENCES course.module(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_module_course ON course.module (course_id, order_index);
CREATE INDEX IF NOT EXISTS idx_lesson_module ON course.lesson (module_id, order_index);

-- learning
ALTER TABLE learning.register ADD CONSTRAINT chk_register_progress CHECK (progress >= 0);
CREATE INDEX IF NOT EXISTS idx_register_course ON learning.register (course_id);
ALTER TABLE learning.register DROP CONSTRAINT fk_user_id;
ALTER TABLE learning.register ADD CONSTRAINT fk_register_user FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;
ALTER TABLE learning.register DROP CONSTRAINT fk_course_id;
ALTER TABLE learning.register ADD CONSTRAINT fk_register_course FOREIGN KEY (course_id) REFERENCES catalog.course(id) ON DELETE CASCADE;
ALTER TABLE learning.history ADD CONSTRAINT fk_history_register FOREIGN KEY (user_id, course_id) REFERENCES learning.register(user_id, course_id) ON DELETE CASCADE;
ALTER TABLE learning.history ADD CONSTRAINT fk_history_lesson FOREIGN KEY (lesson_id) REFERENCES course.lesson(id) ON DELETE CASCADE;
ALTER TABLE learning.history ADD CONSTRAINT fk_history_module FOREIGN KEY (module_id) REFERENCES course.module(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_history_user_course ON learning.history (user_id, course_id);
CREATE INDEX IF NOT EXISTS idx_history_lesson ON learning.history (lesson_id);
DROP INDEX IF EXISTS learning.user_id_pkey;    -- covered by unique_favorite (user_id, course_id)
ALTER INDEX IF EXISTS learning.course_id_pkey RENAME TO idx_favorite_course;
ALTER TABLE learning.favorite DROP CONSTRAINT fk_user_id;
ALTER TABLE learning.favorite ADD CONSTRAINT fk_favorite_user FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;
ALTER TABLE learning.favorite DROP CONSTRAINT fk_course_id;
ALTER TABLE learning.favorite ADD CONSTRAINT fk_favorite_course FOREIGN KEY (course_id) REFERENCES catalog.course(id) ON DELETE CASCADE;

-- challenge
ALTER TABLE challenge.challenges DROP CONSTRAINT fk_challenge_lesson_id;  -- was SET NULL on a NOT NULL column
ALTER TABLE challenge.challenges ADD CONSTRAINT fk_challenge_lesson FOREIGN KEY (lesson_id) REFERENCES course.lesson(id) ON DELETE CASCADE;
ALTER TABLE challenge.questions DROP CONSTRAINT fk_challenge_id;
ALTER TABLE challenge.questions ADD CONSTRAINT fk_questions_challenge FOREIGN KEY (challenge_id) REFERENCES challenge.challenges(id) ON DELETE CASCADE;
ALTER TABLE challenge.question_options DROP CONSTRAINT fk_question_id;
ALTER TABLE challenge.question_options ADD CONSTRAINT fk_options_question FOREIGN KEY (question_id) REFERENCES challenge.questions(id) ON DELETE CASCADE;
ALTER TABLE challenge.question_submissions DROP CONSTRAINT fk_question_id;
ALTER TABLE challenge.question_submissions ADD CONSTRAINT fk_qsub_question FOREIGN KEY (question_id) REFERENCES challenge.questions(id) ON DELETE CASCADE;
ALTER TABLE challenge.question_submissions DROP CONSTRAINT fk_question_option_id;
ALTER TABLE challenge.question_submissions ADD CONSTRAINT fk_qsub_option FOREIGN KEY (question_option_id) REFERENCES challenge.question_options(id) ON DELETE CASCADE;
ALTER TABLE challenge.question_submissions DROP CONSTRAINT fk_user_id;
ALTER TABLE challenge.question_submissions ADD CONSTRAINT fk_qsub_user FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;
ALTER TABLE challenge.code_submissions ADD CONSTRAINT fk_code_submissions_user FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;
ALTER TABLE challenge.code_runs ADD CONSTRAINT fk_code_runs_user FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;
ALTER TABLE challenge.coding_workspaces ADD CONSTRAINT fk_coding_workspaces_user FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_questions_challenge ON challenge.questions (challenge_id, order_index);
CREATE INDEX IF NOT EXISTS idx_question_options_question ON challenge.question_options (question_id);
CREATE INDEX IF NOT EXISTS idx_question_submissions_user ON challenge.question_submissions (user_id, question_id);
CREATE INDEX IF NOT EXISTS idx_code_submissions_challenge ON challenge.code_submissions (challenge_id);

-- roadmap
ALTER TABLE roadmap.roadmaps ADD CONSTRAINT roadmaps_public_id_key UNIQUE (public_id);
ALTER TABLE roadmap.nodes ADD CONSTRAINT fk_nodes_roadmap FOREIGN KEY (roadmap_id) REFERENCES roadmap.roadmaps(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_node_course_course ON roadmap.node_course (course_id);
DROP INDEX IF EXISTS roadmap.idx_roadmap_users_user;          -- covered by PK (user_id, roadmap_id)
DROP INDEX IF EXISTS roadmap.idx_roadmap_progress_user;       -- covered by uq_user_node (user_id, node_id)
DROP INDEX IF EXISTS roadmap.idx_roadmap_progress_completed;  -- boolean, never selective

-- community
ALTER TABLE community.comment ADD CONSTRAINT comment_public_id_key UNIQUE (public_id);
ALTER TABLE community.comment ADD CONSTRAINT chk_comment_rating CHECK (rating BETWEEN 1 AND 5);
ALTER TABLE community.comment DROP CONSTRAINT fk_course_id;
ALTER TABLE community.comment ADD CONSTRAINT fk_comment_course FOREIGN KEY (reference_id) REFERENCES catalog.course(id) ON DELETE CASCADE;
ALTER TABLE community.comment DROP CONSTRAINT fk_user_id;
ALTER TABLE community.comment ADD CONSTRAINT fk_comment_user FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_comment_course_created ON community.comment (reference_id, created_at DESC) WHERE is_deleted = false;
ALTER TABLE community.voting DROP CONSTRAINT fk_course_comment;
ALTER TABLE community.voting ADD CONSTRAINT fk_voting_comment FOREIGN KEY (reference_id) REFERENCES community.comment(id) ON DELETE CASCADE;
ALTER TABLE community.voting DROP CONSTRAINT fk_user_id;
ALTER TABLE community.voting ADD CONSTRAINT fk_voting_user FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_voting_comment ON community.voting (reference_id);
ALTER TABLE community.event ADD CONSTRAINT fk_event_creator FOREIGN KEY (created_by) REFERENCES identity.users(id) ON DELETE CASCADE;
ALTER TABLE community.event_join ADD CONSTRAINT fk_event_join_event FOREIGN KEY (event_id) REFERENCES community.event(id) ON DELETE CASCADE;
ALTER TABLE community.event_join ADD CONSTRAINT fk_event_join_user FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_event_join_user ON community.event_join (user_id);
ALTER TABLE community.feedback ADD CONSTRAINT fk_feedback_user FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE SET NULL;
ALTER TABLE community.team ADD CONSTRAINT fk_team_host FOREIGN KEY (host_id) REFERENCES identity.users(id) ON DELETE CASCADE;
ALTER TABLE community.team ADD CONSTRAINT chk_team_size CHECK (size BETWEEN 2 AND 5);
CREATE INDEX IF NOT EXISTS idx_team_host ON community.team (host_id);
ALTER TABLE community.friend DROP CONSTRAINT fk_sender_id;
ALTER TABLE community.friend ADD CONSTRAINT fk_friend_sender FOREIGN KEY (sender_id) REFERENCES identity.users(id) ON DELETE CASCADE;
ALTER TABLE community.friend DROP CONSTRAINT fk_receiver_id;
ALTER TABLE community.friend ADD CONSTRAINT fk_friend_receiver FOREIGN KEY (receiver_id) REFERENCES identity.users(id) ON DELETE CASCADE;
ALTER TABLE community.friend ADD CONSTRAINT chk_friend_not_self CHECK (sender_id <> receiver_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_friend_pair ON community.friend (LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id));
CREATE INDEX IF NOT EXISTS idx_friend_receiver ON community.friend (receiver_id);
ALTER TABLE community.messages ADD CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES identity.users(id) ON DELETE CASCADE;
ALTER TABLE community.messages ADD CONSTRAINT fk_messages_receiver FOREIGN KEY (receiver_id) REFERENCES identity.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON community.messages (LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id), created_at DESC);

-- -----------------------------------------------------------------------------
-- 6. New tables from the DBML design
-- -----------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE public.join_team_status AS ENUM ('pending', 'approved', 'rejected', 'left', 'kicked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.order_status AS ENUM ('pending', 'completed', 'cancelled', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.payment_method AS ENUM ('banking', 'master_card');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS community.team_members (
    id          bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    team_id     varchar(50) NOT NULL REFERENCES community.team(id) ON DELETE CASCADE,
    user_id     bigint NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    status      public.join_team_status NOT NULL DEFAULT 'pending',
    created_at  timestamp NOT NULL DEFAULT now(),
    updated_at  timestamp,
    CONSTRAINT uq_team_member UNIQUE (team_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON community.team_members (user_id, status);

-- Every existing team host is an approved member of their own team.
INSERT INTO community.team_members (team_id, user_id, status)
SELECT id, host_id, 'approved' FROM community.team
ON CONFLICT (team_id, user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS commerce.cart_items (
    user_id     bigint NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    course_id   bigint NOT NULL REFERENCES catalog.course(id) ON DELETE CASCADE,
    created_at  timestamp NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, course_id)
);

CREATE TABLE IF NOT EXISTS commerce.orders (
    id              bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    public_id       varchar(50) NOT NULL UNIQUE,
    user_id         bigint NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
    status          public.order_status NOT NULL DEFAULT 'pending',
    payment_method  public.payment_method NOT NULL DEFAULT 'banking',
    total           numeric(12, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
    created_at      timestamp NOT NULL DEFAULT now(),
    updated_at      timestamp
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON commerce.orders (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS commerce.order_items (
    id          bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    order_id    bigint NOT NULL REFERENCES commerce.orders(id) ON DELETE CASCADE,
    course_id   bigint NOT NULL REFERENCES catalog.course(id) ON DELETE RESTRICT,
    price       numeric(12, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    created_at  timestamp NOT NULL DEFAULT now(),
    CONSTRAINT uq_order_course UNIQUE (order_id, course_id)
);
CREATE INDEX IF NOT EXISTS idx_order_items_course ON commerce.order_items (course_id);

-- -----------------------------------------------------------------------------
-- 7. Views
-- -----------------------------------------------------------------------------
CREATE VIEW learning.user_progress AS
SELECT
    c.public_id AS id,
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
FROM learning.register r
JOIN identity.users u ON u.id = r.user_id
JOIN catalog.course c ON c.id = r.course_id
JOIN catalog.language l ON l.id = c.language_id
JOIN catalog.category cat ON cat.id = c.category_id
LEFT JOIN learning.favorite f ON f.course_id = c.id AND f.user_id = r.user_id;

-- -----------------------------------------------------------------------------
-- 8. Functions (bodies reference tables by schema, so they are rewritten)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.default_role_id()
 RETURNS bigint
 LANGUAGE sql STABLE
AS $function$
    SELECT COALESCE((SELECT id FROM identity.roles WHERE code = 'user'), 1);
$function$;

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

CREATE OR REPLACE FUNCTION public.create_session(_session_id bigint, _token_id bigint, _user_id character varying, _refresh_token_hash character varying, _expires_at timestamp with time zone, _user_agent character varying)
 RETURNS TABLE("sessionId" bigint, "tokenId" bigint)
 LANGUAGE plpgsql
AS $function$
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
$function$;

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
    LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.sign_up(_id bigint, _public_id character varying, _username character varying, _email character varying, _surname character varying, _name character varying, _password text)
 RETURNS TABLE(public_id character varying, username character varying, email character varying)
 LANGUAGE plpgsql
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.register_course(_user_id character varying, _course_id character varying)
 RETURNS TABLE(courseid character varying)
 LANGUAGE plpgsql
AS $function$
DECLARE
  p_user_id bigint;
  p_course_id bigint;
BEGIN
    SELECT id INTO p_user_id FROM identity.users WHERE public_id = _user_id;
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'User not found';
    END IF;

    SELECT id INTO p_course_id
    FROM catalog.course
    WHERE public_id = _course_id AND is_deleted = false AND is_hidden = false;
    IF p_course_id IS NULL THEN
        RAISE EXCEPTION 'Course not found';
    END IF;

    IF EXISTS (SELECT 1 FROM learning.register WHERE user_id = p_user_id AND course_id = p_course_id) THEN
        UPDATE learning.register
        SET is_deleted = false, deleted_at = NULL
        WHERE user_id = p_user_id AND course_id = p_course_id;
    ELSE
        INSERT INTO learning.register (user_id, course_id)
        VALUES (p_user_id, p_course_id);

        UPDATE catalog.course
        SET students = students + 1
        WHERE id = p_course_id;

        INSERT INTO learning.history (user_id, course_id, module_id, lesson_id)
        SELECT p_user_id, p_course_id, m.id, l.id
        FROM course.lesson l
        JOIN course.module m ON m.id = l.module_id
        WHERE m.course_id = p_course_id
          AND l.is_deleted = false
          AND m.is_deleted = false
        ON CONFLICT DO NOTHING;
    END IF;

    RETURN QUERY SELECT _course_id AS courseId;
END;
$function$;

CREATE OR REPLACE FUNCTION public.learning_lesson(p_user_id character varying, p_lesson_id bigint)
 RETURNS TABLE(lesson_id bigint, module_id bigint, type character varying, source text, status character varying)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_user_id bigint;
BEGIN
  SELECT id INTO v_user_id FROM identity.users WHERE public_id = p_user_id;

  IF EXISTS (
    SELECT 1 FROM learning.history h
    WHERE h.user_id = v_user_id AND h.lesson_id = p_lesson_id AND h.status = 'enrolled'
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'Please complete the previous lesson', ERRCODE = 'P1';
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
$function$;

CREATE OR REPLACE FUNCTION public.submit_lesson(_user_id character varying, _course_id character varying, _lesson_id bigint)
 RETURNS TABLE("nextLessonId" bigint, "completedLessons" integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_user_id bigint;
    v_course_id bigint;
    v_reward bigint;
    v_status status_progress_enum;
    total_lessons int;
    completed_lessons int;
    next_lesson_id bigint;
BEGIN
    SELECT u.id INTO v_user_id FROM identity.users u WHERE u.public_id = _user_id;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Missing user id';
    END IF;

    SELECT c.id, COALESCE(c.reward, 0) INTO v_course_id, v_reward
    FROM catalog.course c
    WHERE c.public_id = _course_id;
    IF v_course_id IS NULL THEN
        RAISE EXCEPTION 'Missing course id';
    END IF;

    SELECT h.status INTO v_status
    FROM learning.history h
    WHERE h.user_id = v_user_id AND h.course_id = v_course_id AND h.lesson_id = _lesson_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Lesson % does not belong to course %', _lesson_id, _course_id;
    END IF;

    -- Locked lessons cannot be completed (prevents skipping ahead / farming points).
    IF v_status = 'enrolled' THEN
        RAISE EXCEPTION USING MESSAGE = 'Please complete the previous lesson', ERRCODE = 'P1';
    END IF;

    UPDATE learning.history
    SET status = 'completed', updated_at = now()
    WHERE user_id = v_user_id AND course_id = v_course_id AND lesson_id = _lesson_id;

    -- Lesson reward, once per lesson (unique constraint keeps it idempotent).
    WITH ins AS (
        INSERT INTO profile.point_transaction (user_id, action, amount, source_type, source_id)
        VALUES (v_user_id, 'credit', 10, 'lesson', _lesson_id)
        ON CONFLICT (user_id, source_type, source_id, action) DO NOTHING
        RETURNING amount
    )
    UPDATE profile.info
    SET points = COALESCE(points, 0) + (SELECT amount FROM ins)
    WHERE user_id = v_user_id AND EXISTS (SELECT 1 FROM ins);

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

        IF v_reward > 0 THEN
            WITH ins AS (
                INSERT INTO profile.point_transaction (user_id, action, amount, source_type, source_id)
                VALUES (v_user_id, 'credit', v_reward, 'course', v_course_id)
                ON CONFLICT (user_id, source_type, source_id, action) DO NOTHING
                RETURNING amount
            )
            UPDATE profile.info
            SET points = COALESCE(points, 0) + (SELECT amount FROM ins)
            WHERE user_id = v_user_id AND EXISTS (SELECT 1 FROM ins);
        END IF;
    END IF;

    RETURN QUERY
    SELECT next_lesson_id AS "nextLessonId", completed_lessons AS "completedLessons";
END;
$function$;

-- Learner view of a course. Grading data (correct options, test cases) is NOT
-- included: quizzes are graded server-side and coding tests are served by the app.
CREATE OR REPLACE FUNCTION public.learning_progress(p_user_public_id character varying, p_course_public_id character varying)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.voting_comment(_user_id character varying, _comment_id uuid, new_vote voting_enum)
 RETURNS TABLE(upvotes bigint, downvotes bigint, vote voting_enum)
 LANGUAGE plpgsql
AS $function$
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
$function$;

-- Counter triggers. Fixes: DELETE branches used NEW (always NULL), soft-delete of a
-- module updated a non-existent column, and restores were never counted back.
CREATE OR REPLACE FUNCTION public.lesson_module_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.lesson_course_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$;

-- -----------------------------------------------------------------------------
-- 9. Resync denormalised counters (they had drifted)
-- -----------------------------------------------------------------------------
ALTER TABLE course.module DISABLE TRIGGER trigger_lesson_course;

UPDATE course.module m
SET lessons = sub.cnt
FROM (
    SELECT m2.id, COUNT(l.id) FILTER (WHERE l.is_deleted = false) AS cnt
    FROM course.module m2
    LEFT JOIN course.lesson l ON l.module_id = m2.id
    GROUP BY m2.id
) sub
WHERE sub.id = m.id AND m.lessons <> sub.cnt;

ALTER TABLE course.module ENABLE TRIGGER trigger_lesson_course;

UPDATE catalog.course c
SET modules = sub.modules, lessons = sub.lessons
FROM (
    SELECT c2.id,
           COUNT(m.id) FILTER (WHERE m.is_deleted = false) AS modules,
           COALESCE(SUM(m.lessons) FILTER (WHERE m.is_deleted = false), 0) AS lessons
    FROM catalog.course c2
    LEFT JOIN course.module m ON m.course_id = c2.id
    GROUP BY c2.id
) sub
WHERE sub.id = c.id AND (c.modules <> sub.modules OR c.lessons <> sub.lessons);

COMMIT;
