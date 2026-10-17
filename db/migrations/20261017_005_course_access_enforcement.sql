-- =============================================================================
-- 20261017_005_course_access_enforcement.sql
--
-- Course access is decided by commerce.entitlement (public.has_course_access) inside the
-- database functions the app calls, so no API can skip the check:
--   * register_course: a published free course grants a 'free' entitlement on enrolment;
--     a premium course needs an entitlement (purchase / points / admin grant) first;
--     an unpublished course can only be re-entered by people who already own it.
--   * learning_lesson / submit_lesson / learning_progress: entitlement + active enrolment
--     (withdrawn learners no longer read lessons, a gap of the previous version).
--   * submit_lesson writes points through public.post_points (ledger + cache in one place).
-- learning_progress keeps its body: the previous function is renamed to
-- learning_progress_content and wrapped by the access check.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.register_course(_user_id character varying, _course_id character varying)
 RETURNS TABLE(courseid character varying)
 LANGUAGE plpgsql
AS $function$
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
$function$;

-- Entitlement + active enrolment for the course of a lesson; raises CD403 otherwise.
CREATE OR REPLACE FUNCTION public.assert_lesson_access(_user_id bigint, _lesson_id bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE
AS $function$
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
$function$;

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

    -- Lesson reward, once per lesson (post_points is idempotent per source).
    PERFORM public.post_points(v_user_id, 'credit', 'earned', 10, 'lesson', _lesson_id);

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
            PERFORM public.post_points(v_user_id, 'credit', 'earned', v_reward, 'course', v_course_id);
        END IF;
    END IF;

    RETURN QUERY
    SELECT next_lesson_id AS "nextLessonId", completed_lessons AS "completedLessons";
END;
$function$;

ALTER FUNCTION public.learning_progress(character varying, character varying) RENAME TO learning_progress_content;
COMMENT ON FUNCTION public.learning_progress_content(character varying, character varying)
    IS 'Body of learning_progress without the access check; call learning_progress instead';

CREATE OR REPLACE FUNCTION public.learning_progress(p_user_public_id character varying, p_course_public_id character varying)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
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
$function$;

COMMIT;
