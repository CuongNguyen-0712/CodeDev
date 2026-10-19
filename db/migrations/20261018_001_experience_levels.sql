-- =============================================================================
-- 20261018_001_experience_levels.sql
--
-- Experience (EXP) and User Level, separate from points (docs/experience-leveling-design.md,
-- docs/learning-rewards-redesign-plan.md):
--   * profile.exp_transaction: append-only EXP ledger, one award per (user, source);
--     profile.info.exp / exp_level cache it (view profile.exp_drift checks the cache).
--   * profile.exp_rule: EXP per activity; profile.exp_level: the 20 level thresholds.
--   * public.post_exp is the only writer (same pattern as public.post_points);
--     public.award_exp / award_challenge_exp resolve the amount from exp_rule.
--   * submit_lesson awards lesson EXP and the course completion bonus as EXP. Completing a course
--     no longer credits points: points come only from lessons and passed challenges.
--     It now also returns what was awarded.
--   * Backfill: EXP for lessons, challenges and courses completed before this migration.
-- Expand-only: no column or table is dropped.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------- configuration
CREATE TABLE profile.exp_rule (
    rule_key   varchar(60) PRIMARY KEY,
    amount     int NOT NULL CHECK (amount > 0),
    is_active  boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO profile.exp_rule (rule_key, amount, is_active) VALUES
    ('lesson', 10, true),
    ('quiz.easy', 5, true),
    ('quiz.medium', 8, true),
    ('quiz.hard', 12, true),
    ('coding.mini_coding.easy', 10, true),
    ('coding.mini_coding.medium', 20, true),
    ('coding.mini_coding.hard', 35, true),
    ('coding.fix_bug.easy', 8, true),
    ('coding.fix_bug.medium', 15, true),
    ('coding.fix_bug.hard', 25, true),
    ('course.beginner', 50, true),
    ('course.intermediate', 100, true),
    ('course.advanced', 150, true),
    ('course.expert', 200, true),
    ('course.master', 200, true),
    ('lesson.video', 10, false),
    ('project.mini', 50, false),
    ('project.capstone', 100, false);

CREATE TABLE profile.exp_level (
    level     int PRIMARY KEY CHECK (level >= 1),
    title     varchar(60) NOT NULL,
    min_exp   bigint NOT NULL UNIQUE CHECK (min_exp >= 0),
    is_active boolean NOT NULL DEFAULT true
);

INSERT INTO profile.exp_level (level, title, min_exp) VALUES
    (1, 'Newbie', 0),
    (2, 'Beginner', 100),
    (3, 'Beginner+', 250),
    (4, 'Learner', 450),
    (5, 'Learner+', 700),
    (6, 'Apprentice', 1000),
    (7, 'Apprentice+', 1400),
    (8, 'Developer', 1900),
    (9, 'Developer+', 2500),
    (10, 'Skilled Developer', 3200),
    (11, 'Skilled Developer+', 4000),
    (12, 'Specialist', 4900),
    (13, 'Specialist+', 5900),
    (14, 'Advanced Developer', 7000),
    (15, 'Advanced Developer+', 8300),
    (16, 'Expert', 9800),
    (17, 'Expert+', 11500),
    (18, 'Master', 13500),
    (19, 'Master+', 16000),
    (20, 'Grandmaster', 19000);

-- ---------------------------------------------------------------------------- ledger + cache
ALTER TABLE profile.info
    ADD COLUMN exp bigint NOT NULL DEFAULT 0,
    ADD COLUMN exp_level int NOT NULL DEFAULT 1,
    ADD CONSTRAINT chk_info_exp CHECK (exp >= 0 AND exp_level >= 1);

CREATE TABLE profile.exp_transaction (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         bigint NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    amount          int NOT NULL CHECK (amount <> 0),
    source_type     varchar(20) NOT NULL CHECK (source_type IN ('lesson', 'challenge', 'course', 'adjustment')),
    source_id       bigint,
    rule_key        varchar(60),
    exp_after       bigint NOT NULL CHECK (exp_after >= 0),
    idempotency_key varchar(120),
    actor_id        bigint REFERENCES identity.users(id),
    reason          text,
    metadata        jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_exp_transaction_adjustment CHECK (
        source_type <> 'adjustment' OR (reason IS NOT NULL AND length(btrim(reason)) > 0)
    ),
    CONSTRAINT chk_exp_transaction_source CHECK (source_type = 'adjustment' OR source_id IS NOT NULL)
);

CREATE UNIQUE INDEX uq_exp_transaction_source ON profile.exp_transaction (user_id, source_type, source_id)
    WHERE source_id IS NOT NULL;
CREATE UNIQUE INDEX uq_exp_transaction_idempotency ON profile.exp_transaction (user_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_exp_transaction_user_created ON profile.exp_transaction (user_id, created_at DESC, id DESC);

CREATE OR REPLACE VIEW profile.exp_drift AS
SELECT i.user_id, i.exp AS cached_exp, COALESCE(l.ledger_exp, 0) AS ledger_exp
FROM profile.info i
LEFT JOIN (SELECT user_id, SUM(amount) AS ledger_exp FROM profile.exp_transaction GROUP BY user_id) l
    ON l.user_id = i.user_id
WHERE i.exp <> COALESCE(l.ledger_exp, 0);

-- ---------------------------------------------------------------------------- functions
CREATE OR REPLACE FUNCTION public.level_for_exp(_exp bigint)
RETURNS int
LANGUAGE sql STABLE
AS $function$
    SELECT COALESCE(MAX(level), 1) FROM profile.exp_level WHERE is_active AND min_exp <= GREATEST(_exp, 0);
$function$;

-- The only writer of EXP: locks the profile row, appends one ledger entry, updates the cache.
-- Replays (same source, or same idempotency key) return the existing entry with created = false.
-- A negative amount (adjustment) never takes the total below 0; the ledger records what was removed.
CREATE OR REPLACE FUNCTION public.post_exp(
    _user_id bigint,
    _amount int,
    _source_type varchar,
    _source_id bigint,
    _rule_key varchar DEFAULT NULL,
    _idempotency_key varchar DEFAULT NULL,
    _actor_id bigint DEFAULT NULL,
    _reason text DEFAULT NULL,
    _metadata jsonb DEFAULT NULL
)
RETURNS TABLE(created boolean, awarded int, exp_after bigint, previous_level int, new_level int)
LANGUAGE plpgsql
AS $function$
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
$function$;

-- Awards the EXP of an active rule (amount * multiplier, rounded up). An unknown or inactive rule awards nothing.
CREATE OR REPLACE FUNCTION public.award_exp(
    _user_id bigint,
    _rule_key varchar,
    _source_type varchar,
    _source_id bigint,
    _multiplier numeric DEFAULT 1,
    _metadata jsonb DEFAULT NULL
)
RETURNS TABLE(created boolean, awarded int, exp_after bigint, previous_level int, new_level int)
LANGUAGE plpgsql
AS $function$
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
$function$;

-- Rule of a challenge: quiz.<difficulty> or coding.<type>.<difficulty>.
CREATE OR REPLACE FUNCTION public.award_challenge_exp(
    _user_id bigint,
    _challenge_id bigint,
    _multiplier numeric DEFAULT 1,
    _metadata jsonb DEFAULT NULL
)
RETURNS TABLE(created boolean, awarded int, exp_after bigint, previous_level int, new_level int)
LANGUAGE plpgsql
AS $function$
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
$function$;

-- ---------------------------------------------------------------------------- submit_lesson
-- The return type changes (award columns), so the function is recreated.
DROP FUNCTION public.submit_lesson(character varying, character varying, bigint);

CREATE FUNCTION public.submit_lesson(_user_id character varying, _course_id character varying, _lesson_id bigint)
 RETURNS TABLE(
    "nextLessonId" bigint,
    "completedLessons" integer,
    "awardedPoints" integer,
    "awardedExp" integer,
    "exp" bigint,
    "level" integer,
    "previousLevel" integer,
    "courseCompleted" boolean
 )
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
$function$;

-- ---------------------------------------------------------------------------- backfill
-- EXP for activity completed before this migration, at today's rule values (a quiz counts as passed
-- on the first attempt: older attempts cannot be ordered reliably). Idempotent per source.
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT h.user_id, h.lesson_id
        FROM learning.history h
        JOIN profile.info i ON i.user_id = h.user_id
        WHERE h.status = 'completed' AND h.lesson_id IS NOT NULL
        ORDER BY h.updated_at NULLS FIRST
    LOOP
        PERFORM public.award_exp(r.user_id, 'lesson', 'lesson', r.lesson_id, 1, '{"backfill": true}'::jsonb);
    END LOOP;

    -- A challenge was passed when its points were credited (quiz and coding) or a submission passed.
    FOR r IN
        SELECT DISTINCT x.user_id, x.challenge_id
        FROM (
            SELECT pt.user_id, pt.source_id AS challenge_id
            FROM profile.point_transaction pt
            WHERE pt.source_type = 'challenge' AND pt.action = 'credit'
            UNION
            SELECT s.user_id, s.challenge_id
            FROM challenge.code_submissions s
            WHERE s.status = 'passed'
        ) x
        JOIN challenge.challenges ch ON ch.id = x.challenge_id
        JOIN profile.info i ON i.user_id = x.user_id
    LOOP
        PERFORM public.award_challenge_exp(r.user_id, r.challenge_id, 1, '{"backfill": true}'::jsonb);
    END LOOP;

    FOR r IN
        SELECT rg.user_id, rg.course_id, c.level::text AS course_level
        FROM learning.register rg
        JOIN catalog.course c ON c.id = rg.course_id
        JOIN profile.info i ON i.user_id = rg.user_id
        WHERE rg.status = 'completed' AND c.level IS NOT NULL
    LOOP
        PERFORM public.award_exp(r.user_id, 'course.' || r.course_level, 'course', r.course_id, 1, '{"backfill": true}'::jsonb);
    END LOOP;
END $$;

COMMIT;
