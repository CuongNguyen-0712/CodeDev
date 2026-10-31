-- =============================================================================
-- 20261101_001_perf_indexes.sql
--
-- docs/performance-plan.md, Phase 1: indexes for queries that scanned whole tables.
--   1. challenge.code_runs: recent completed runs (admission load) and the queued order
--      (position, sweeper); idx_code_runs_status duplicated idx_code_runs_active_deadline.
--   2. identity: refresh token chain (self-FK replaced_by_id, ON DELETE SET NULL) and expiry,
--      processed outbox rows (cleanup).
--   3. FK columns without an index: the user purge and the identity.users cascade scanned
--      the ledgers, comments, friends, events and quiz answers once per deleted row.
--   4. Per-user entitlement list (every status; the only user index was partial on 'active').
--   5. Period leaderboards filter the EXP ledger on created_at alone.
--   6. learning_progress_content / learning_lesson rewrote learning.register / history.last_seen on
--      every page view: now at most once a minute per row (status changes still apply at once).
--
-- Plain CREATE INDEX: the runner wraps each migration in a transaction, so CONCURRENTLY is not
-- available; these tables are small enough today for the short write lock.
-- =============================================================================

BEGIN;

-- 1. code runs
CREATE INDEX IF NOT EXISTS idx_code_runs_done_recent
  ON challenge.code_runs (finished_at DESC) WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS idx_code_runs_queued
  ON challenge.code_runs (queued_at) WHERE status = 'queued';

DROP INDEX IF EXISTS challenge.idx_code_runs_status;

-- 2. auth
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_replaced_by
  ON identity.refresh_tokens (replaced_by_id) WHERE replaced_by_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires
  ON identity.refresh_tokens (expires_at);

CREATE INDEX IF NOT EXISTS idx_auth_outbox_processed
  ON identity.auth_outbox (processed_at) WHERE processed_at IS NOT NULL;

-- 3. foreign keys used by the purge / cascade
CREATE INDEX IF NOT EXISTS idx_exp_transaction_actor
  ON profile.exp_transaction (actor_id) WHERE actor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_point_transaction_actor
  ON profile.point_transaction (actor_id) WHERE actor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comment_user ON community.comment (user_id);
CREATE INDEX IF NOT EXISTS idx_friend_sender ON community.friend (sender_id);
CREATE INDEX IF NOT EXISTS idx_event_created_by ON community.event (created_by);

CREATE INDEX IF NOT EXISTS idx_question_submissions_question
  ON challenge.question_submissions (question_id, user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_question_submissions_option
  ON challenge.question_submissions (question_option_id) WHERE question_option_id IS NOT NULL;

-- 4. entitlements per user
CREATE INDEX IF NOT EXISTS idx_entitlement_user_granted
  ON commerce.entitlement (user_id, granted_at DESC);

-- 5. period leaderboards
CREATE INDEX IF NOT EXISTS idx_exp_transaction_created
  ON profile.exp_transaction (created_at) INCLUDE (user_id, amount);

-- 6. throttled last_seen writes
CREATE OR REPLACE FUNCTION public.learning_progress_content(p_user_public_id character varying, p_course_public_id character varying)
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

    -- Throttled: a page view only rewrites the row when the status changes or a minute passed.
    UPDATE learning.register
    SET status = CASE WHEN status = 'enrolled' THEN 'in_progress' ELSE status END,
        last_seen = now()
    WHERE user_id = v_user_id AND course_id = v_course_id AND is_deleted = false
      AND (status = 'enrolled' OR last_seen IS NULL OR last_seen < now() - interval '1 minute');

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
                                    -- Static hints: how many exist, and the text of the levels this learner opened.
                                    'hints_total', (SELECT COUNT(*) FROM challenge.challenge_hints hn WHERE hn.challenge_id = ch.id),
                                    'hints', COALESCE((
                                        SELECT jsonb_agg(jsonb_build_object('level', hn.level, 'body', hn.body) ORDER BY hn.level)
                                        FROM challenge.challenge_hints hn
                                        JOIN challenge.hint_views hv
                                          ON hv.challenge_id = hn.challenge_id AND hv.level = hn.level AND hv.user_id = v_user_id
                                        WHERE hn.challenge_id = ch.id
                                    ), '[]'::jsonb),
                                    -- quiz_display_count set: a per-learner subset in a per-learner order,
                                    -- the same md5 ranking as lib/challenges/questionBank.js (grading).
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
                                            ORDER BY q.rank
                                        )
                                        FROM (
                                            SELECT q0.*,
                                                   ROW_NUMBER() OVER (ORDER BY
                                                       CASE WHEN ch.quiz_display_count IS NOT NULL
                                                            THEN md5(v_user_id::text || ':' || q0.id::text) COLLATE "C" END,
                                                       q0.order_index NULLS LAST, q0.id) AS rank
                                            FROM challenge.questions q0
                                            WHERE q0.challenge_id = ch.id
                                        ) q
                                        WHERE ch.quiz_display_count IS NULL OR q.rank <= ch.quiz_display_count
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
        'completion', public.course_completion_status(v_user_id, v_course_id),
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

COMMENT ON FUNCTION public.learning_progress_content(p_user_public_id character varying, p_course_public_id character varying) IS 'Body of learning_progress without the access check; call learning_progress instead';;

CREATE OR REPLACE FUNCTION public.learning_lesson(p_user_id character varying, p_lesson_id bigint)
 RETURNS TABLE(lesson_id bigint, module_id bigint, type character varying, source text, status character varying)
 LANGUAGE plpgsql
AS $function$
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
  WHERE h2.user_id = v_user_id AND h2.lesson_id = p_lesson_id
    AND (h2.last_seen IS NULL OR h2.last_seen < now() - interval '1 minute');

  RETURN QUERY
  SELECT l.id, l.module_id, l.content_type, l.content_source, h.status::varchar
  FROM course.lesson l
  JOIN learning.history h ON l.id = h.lesson_id
  WHERE h.user_id = v_user_id AND h.lesson_id = p_lesson_id;
END;
$function$;

COMMIT;
