-- =============================================================================
-- 20261103_013_course_rating_display.sql
--
-- catalog.course.rating and reviews are what every listing already reads (course list and its
-- "rating >= x" filter, course details, onboarding, roadmap, learning.user_progress,
-- learning_progress_content, recommendations). They now come from learners
-- (docs/admin-panel-plan.md 12) instead of being typed in:
--   rating   numeric(3,2): the average of the visible ratings, only from 3 ratings on (NULL below,
--            shown as "No ratings yet"; services/courseRating.service.js MIN_RATINGS matches)
--   reviews  the number of visible ratings
-- The hand-entered values are dropped. rating_avg / rating_count (migration 012) keep the raw
-- figures for the admin.
-- =============================================================================

BEGIN;

-- The only view on these columns; recreated unchanged below.
DROP VIEW IF EXISTS learning.user_progress;

ALTER TABLE catalog.course ALTER COLUMN rating TYPE numeric(3,2) USING NULL;

UPDATE catalog.course
SET rating = CASE WHEN rating_count >= 3 THEN rating_avg END,
    reviews = rating_count;

CREATE OR REPLACE FUNCTION community.course_rating_refresh() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_course bigint;
BEGIN
    FOREACH v_course IN ARRAY (
        CASE
            WHEN TG_OP = 'INSERT' THEN ARRAY[NEW.course_id]
            WHEN TG_OP = 'DELETE' THEN ARRAY[OLD.course_id]
            WHEN NEW.course_id IS DISTINCT FROM OLD.course_id THEN ARRAY[OLD.course_id, NEW.course_id]
            ELSE ARRAY[NEW.course_id]
        END
    ) LOOP
        UPDATE catalog.course c
        SET rating_avg = s.avg,
            rating_count = s.n,
            rating = CASE WHEN s.n >= 3 THEN s.avg END,
            reviews = s.n
        FROM (SELECT ROUND(AVG(stars), 2) AS avg, COUNT(*)::int AS n
              FROM community.course_rating WHERE course_id = v_course AND NOT is_hidden) s
        WHERE c.id = v_course;
    END LOOP;
    RETURN NULL;
END;
$$;

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
   FROM learning.register r
     JOIN identity.users u ON u.id = r.user_id
     JOIN catalog.course c ON c.id = r.course_id
     JOIN catalog.language l ON l.id = c.language_id
     JOIN catalog.category cat ON cat.id = c.category_id
     LEFT JOIN learning.favorite f ON f.course_id = c.id AND f.user_id = r.user_id;

COMMIT;
