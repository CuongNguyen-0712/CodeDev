-- =============================================================================
-- 20261103_001_hidden_lessons.sql
--
-- Hiding a module or lesson in the admin (course.module.is_hidden / course.lesson.is_hidden) did
-- nothing for learners: no learner query read the flag. From here on a hidden lesson, or any
-- lesson of a hidden module, is out of the course for learners:
--
--   * not listed: learning_progress_content (the course player) skips it;
--   * not reachable: assert_lesson_access raises CD404 "This lesson is not available" (after the
--     usual CD403 access check), so learning_lesson and submit_lesson refuse it;
--   * not in progress: submit_lesson skips it when unlocking the next lesson and counts only
--     visible lessons, both for completion and for learning.register.progress;
--     course_completion_status ignores its challenges;
--   * not counted: course.module.lessons, catalog.course.modules and catalog.course.lessons now
--     count visible items only (the two counter triggers), recounted once below.
--
-- Unlocking stays sequential over the visible lessons. unlock_first_open_lesson keeps the first
-- visible lesson that is not completed unlocked, so a learner whose current lesson was hidden
-- moves on to the next visible one, and a lesson shown again before the learner's position opens
-- for them (it must be completed for the course to count as done again; a course already marked
-- completed stays completed). learning.history rows of hidden lessons are kept untouched, so
-- showing a lesson again restores the learner's status on it.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Keep the first visible, not yet completed lesson of a course unlocked.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unlock_first_open_lesson(_user_id bigint, _course_id bigint)
 RETURNS void
 LANGUAGE sql
AS $function$
    UPDATE learning.history h
    SET status = 'in_progress', updated_at = now(), last_seen = now()
    WHERE h.user_id = _user_id
      AND h.course_id = _course_id
      AND h.status = 'enrolled'
      AND h.lesson_id = (
          SELECT l.id
          FROM course.module m
          JOIN course.lesson l ON l.module_id = m.id
          JOIN learning.history h2 ON h2.lesson_id = l.id AND h2.user_id = _user_id AND h2.course_id = _course_id
          WHERE m.course_id = _course_id
            AND NOT m.is_deleted AND NOT m.is_hidden
            AND NOT l.is_deleted AND NOT l.is_hidden
            AND h2.status <> 'completed'
          ORDER BY m.order_index, l.order_index
          LIMIT 1
      );
$function$;

COMMENT ON FUNCTION public.unlock_first_open_lesson(bigint, bigint) IS 'Unlocks the first visible lesson the learner has not completed (after a lesson was hidden or shown again)';

-- ---------------------------------------------------------------------------
-- Access: hidden / deleted lessons are not available (CD404) to learners who have access.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_lesson_access(_user_id bigint, _lesson_id bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_course_id bigint;
    v_unavailable boolean;
BEGIN
    SELECT m.course_id, (l.is_deleted OR l.is_hidden OR m.is_deleted OR m.is_hidden)
    INTO v_course_id, v_unavailable
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

    IF v_unavailable THEN
        RAISE EXCEPTION USING ERRCODE = 'CD404', MESSAGE = 'This lesson is not available';
    END IF;

    RETURN v_course_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Lesson page: a learner whose earlier visible lessons are done is never stuck on a lock.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.learning_lesson(p_user_id character varying, p_lesson_id bigint)
 RETURNS TABLE(lesson_id bigint, module_id bigint, type character varying, source text, status character varying)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_user_id bigint;
  v_course_id bigint;
BEGIN
  SELECT id INTO v_user_id FROM identity.users WHERE public_id = p_user_id;

  v_course_id := public.assert_lesson_access(v_user_id, p_lesson_id);
  PERFORM public.unlock_first_open_lesson(v_user_id, v_course_id);

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

-- ---------------------------------------------------------------------------
-- Course player: visible modules and lessons only.
-- ---------------------------------------------------------------------------
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

    -- First visit opens the first visible lesson; later a hidden / shown lesson never leaves a lock.
    PERFORM public.unlock_first_open_lesson(v_user_id, v_course_id);

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
                                    -- Points of the questions this learner gets (same md5 subset as grading). The
                                    -- questions themselves load with the quiz state (GET /api/challenges/:id/quiz).
                                    'quiz_points', CASE WHEN ch.type = 'quiz' THEN COALESCE((
                                        SELECT SUM(COALESCE(q.points, 0))
                                        FROM (
                                            SELECT q0.points,
                                                   ROW_NUMBER() OVER (ORDER BY
                                                       CASE WHEN ch.quiz_display_count IS NOT NULL
                                                            THEN md5(v_user_id::text || ':' || q0.id::text) COLLATE "C" END,
                                                       q0.order_index NULLS LAST, q0.id) AS rank
                                            FROM challenge.questions q0
                                            WHERE q0.challenge_id = ch.id
                                        ) q
                                        WHERE ch.quiz_display_count IS NULL OR q.rank <= ch.quiz_display_count
                                    ), 0) END,
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
                WHERE l.module_id = m.id AND l.is_deleted = false AND l.is_hidden = false
            ), '[]'::jsonb) AS lessons
        FROM course.module m
        WHERE m.course_id = v_course_id AND m.is_deleted = false AND m.is_hidden = false
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

-- ---------------------------------------------------------------------------
-- Completion rules: challenges of hidden lessons / modules do not count.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.course_completion_status(_user_id bigint, _course_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
    -- NULL when the course has no completion_rules (completing every lesson is enough).
    WITH c AS (
        SELECT co.completion_rules AS r,
               CASE co.level::text WHEN 'beginner' THEN 60 WHEN 'intermediate' THEN 70 WHEN 'advanced' THEN 75 ELSE 80 END AS default_pct,
               CASE WHEN co.level::text IN ('advanced', 'expert', 'master') THEN 1 ELSE 0 END AS default_hard
        FROM catalog.course co
        WHERE co.id = _course_id AND co.completion_rules IS NOT NULL
    ),
    ch AS (
        SELECT ch.type, ch.difficulty,
               -- A passed quiz is not stored as such (attempts are re-graded in the app); its
               -- EXP transaction is written exactly once, on the first pass.
               CASE WHEN ch.type = 'quiz' THEN EXISTS (
                        SELECT 1 FROM profile.exp_transaction t
                        WHERE t.user_id = _user_id AND t.source_type = 'challenge' AND t.source_id = ch.id)
                    ELSE EXISTS (
                        SELECT 1 FROM challenge.code_submissions s
                        WHERE s.user_id = _user_id AND s.challenge_id = ch.id AND s.status = 'passed')
               END AS passed
        FROM challenge.challenges ch
        JOIN course.lesson l ON l.id = ch.lesson_id AND l.is_deleted = false AND l.is_hidden = false
        JOIN course.module m ON m.id = l.module_id AND m.is_deleted = false AND m.is_hidden = false
        WHERE ch.course_id = _course_id AND ch.is_deleted = false AND ch.is_published = true
          AND ch.status = 'open' AND ch.type IN ('quiz', 'fix_bug', 'mini_coding')
    ),
    n AS (
        SELECT COUNT(*) FILTER (WHERE type = 'quiz') AS quiz_total,
               COUNT(*) FILTER (WHERE type = 'quiz' AND passed) AS quiz_passed,
               COUNT(*) FILTER (WHERE type <> 'quiz') AS coding_total,
               COUNT(*) FILTER (WHERE type <> 'quiz' AND passed) AS coding_passed,
               COUNT(*) FILTER (WHERE type <> 'quiz' AND difficulty = 'hard') AS hard_total,
               COUNT(*) FILTER (WHERE type <> 'quiz' AND difficulty = 'hard' AND passed) AS hard_passed
        FROM ch
    ),
    v AS (
        SELECT n.*,
               COALESCE((c.r->>'minQuizPercent')::int, c.default_pct) AS quiz_pct,
               COALESCE((c.r->>'minCodingPercent')::int, c.default_pct) AS coding_pct,
               -- Never more hard challenges than the course has.
               LEAST(COALESCE((c.r->>'minHardPassed')::int, c.default_hard), n.hard_total) AS hard_required
        FROM c CROSS JOIN n
    )
    SELECT jsonb_build_object(
        'quiz', jsonb_build_object('passed', quiz_passed, 'total', quiz_total, 'minPercent', quiz_pct),
        'coding', jsonb_build_object('passed', coding_passed, 'total', coding_total, 'minPercent', coding_pct),
        'hard', jsonb_build_object('passed', hard_passed, 'required', hard_required),
        'met', quiz_passed * 100 >= quiz_pct * quiz_total
           AND coding_passed * 100 >= coding_pct * coding_total
           AND hard_passed >= hard_required
    )
    FROM v;
$function$;

-- ---------------------------------------------------------------------------
-- Completing a lesson: next lesson, totals and progress over visible lessons only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_lesson(_user_id character varying, _course_id character varying, _lesson_id bigint)
 RETURNS TABLE("nextLessonId" bigint, "completedLessons" integer, "awardedPoints" integer, "awardedExp" integer, exp bigint, level integer, "previousLevel" integer, "courseCompleted" boolean)
 LANGUAGE plpgsql
AS $function$
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
    v_completion jsonb;
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

    -- Unlock the next visible lesson in course order.
    SELECT l2.id INTO next_lesson_id
    FROM course.lesson cur_l
    JOIN course.module cur_m ON cur_m.id = cur_l.module_id
    JOIN course.module m2 ON m2.course_id = cur_m.course_id AND m2.is_deleted = false AND m2.is_hidden = false
    JOIN course.lesson l2 ON l2.module_id = m2.id AND l2.is_deleted = false AND l2.is_hidden = false
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

    SELECT COUNT(*), COUNT(*) FILTER (WHERE h.status = 'completed')
    INTO total_lessons, completed_lessons
    FROM course.lesson l
    JOIN course.module m ON m.id = l.module_id
    LEFT JOIN learning.history h ON h.lesson_id = l.id AND h.user_id = v_user_id AND h.course_id = v_course_id
    WHERE m.course_id = v_course_id
      AND l.is_deleted = false AND l.is_hidden = false
      AND m.is_deleted = false AND m.is_hidden = false;

    UPDATE learning.register
    SET progress = completed_lessons
    WHERE user_id = v_user_id AND course_id = v_course_id;

    -- Every lesson done. A course with completion_rules also needs its quiz / coding pass rates
    -- (course_completion_status); until then it stays in_progress and gets no bonus.
    IF completed_lessons >= total_lessons THEN
        v_completion := public.course_completion_status(v_user_id, v_course_id);
    END IF;

    IF completed_lessons >= total_lessons AND (v_completion IS NULL OR (v_completion->>'met')::boolean) THEN
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
$function$;

-- ---------------------------------------------------------------------------
-- Counters: course.module.lessons, catalog.course.modules / lessons count visible items only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lesson_module_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    old_live boolean := CASE WHEN TG_OP = 'INSERT' THEN false ELSE NOT OLD.is_deleted AND NOT OLD.is_hidden END;
    new_live boolean := CASE WHEN TG_OP = 'DELETE' THEN false ELSE NOT NEW.is_deleted AND NOT NEW.is_hidden END;
BEGIN
    IF old_live AND new_live AND OLD.module_id = NEW.module_id THEN
        RETURN NULL;
    END IF;
    IF old_live THEN
        UPDATE course.module SET lessons = GREATEST(lessons - 1, 0) WHERE id = OLD.module_id;
    END IF;
    IF new_live THEN
        UPDATE course.module SET lessons = lessons + 1 WHERE id = NEW.module_id;
    END IF;

    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.lesson_course_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    old_live boolean := CASE WHEN TG_OP = 'INSERT' THEN false ELSE NOT OLD.is_deleted AND NOT OLD.is_hidden END;
    new_live boolean := CASE WHEN TG_OP = 'DELETE' THEN false ELSE NOT NEW.is_deleted AND NOT NEW.is_hidden END;
BEGIN
    IF old_live AND new_live AND OLD.course_id = NEW.course_id THEN
        IF NEW.lessons <> OLD.lessons THEN
            UPDATE catalog.course
            SET lessons = GREATEST(lessons + (NEW.lessons - OLD.lessons), 0)
            WHERE id = NEW.course_id;
        END IF;
        RETURN NULL;
    END IF;
    IF old_live THEN
        UPDATE catalog.course
        SET modules = GREATEST(modules - 1, 0), lessons = GREATEST(lessons - OLD.lessons, 0)
        WHERE id = OLD.course_id;
    END IF;
    IF new_live THEN
        UPDATE catalog.course
        SET modules = modules + 1, lessons = lessons + NEW.lessons
        WHERE id = NEW.course_id;
    END IF;

    RETURN NULL;
END;
$function$;

-- One recount with the new rule (modules first: the course recount reads module.lessons).
UPDATE course.module m
SET lessons = v.n
FROM (
    SELECT m2.id, COUNT(l.id) FILTER (WHERE NOT l.is_deleted AND NOT l.is_hidden)::int AS n
    FROM course.module m2
    LEFT JOIN course.lesson l ON l.module_id = m2.id
    GROUP BY m2.id
) v
WHERE v.id = m.id AND m.lessons IS DISTINCT FROM v.n;

UPDATE catalog.course c
SET modules = v.modules, lessons = v.lessons
FROM (
    SELECT c2.id,
           COUNT(m.id) FILTER (WHERE NOT m.is_deleted AND NOT m.is_hidden)::int AS modules,
           COALESCE(SUM(m.lessons) FILTER (WHERE NOT m.is_deleted AND NOT m.is_hidden), 0)::int AS lessons
    FROM catalog.course c2
    LEFT JOIN course.module m ON m.course_id = c2.id
    GROUP BY c2.id
) v
WHERE v.id = c.id AND (c.modules IS DISTINCT FROM v.modules OR c.lessons IS DISTINCT FROM v.lessons);

COMMIT;
