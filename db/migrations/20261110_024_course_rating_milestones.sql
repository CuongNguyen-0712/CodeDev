-- =============================================================================
-- 20261110_024_course_rating_milestones.sql
--
-- Course ratings at progress milestones (docs/superpowers/specs/2026-11-10-course-rating-section-design.md):
--   community.course_rating  one row per learner, course and milestone (20, 50, 100 percent of the
--                            visible lessons completed), so a learner rates up to three times
--   catalog.course           rating_avg / rating_count / rating / reviews now count each learner
--                            once, with their latest visible milestone rating
-- Existing ratings move to the learner's milestone by progress today, or 20 below it (rule 14).
-- =============================================================================

BEGIN;

ALTER TABLE community.course_rating
    ADD COLUMN milestone smallint NOT NULL DEFAULT 20 CHECK (milestone IN (20, 50, 100));

UPDATE community.course_rating r SET milestone = CASE
    WHEN p.total > 0 AND p.done >= p.total THEN 100
    WHEN p.total > 0 AND p.done * 100 >= p.total * 50 THEN 50
    ELSE 20 END
FROM (SELECT r2.user_id, r2.course_id,
             COUNT(l.id) AS total,
             COUNT(h.lesson_id) FILTER (WHERE h.status = 'completed') AS done
      FROM community.course_rating r2
      JOIN course.module m ON m.course_id = r2.course_id AND m.is_deleted = false AND m.is_hidden = false
      JOIN course.lesson l ON l.module_id = m.id AND l.is_deleted = false AND l.is_hidden = false
      LEFT JOIN learning.history h ON h.lesson_id = l.id AND h.user_id = r2.user_id AND h.course_id = r2.course_id
      GROUP BY r2.user_id, r2.course_id) p
WHERE p.user_id = r.user_id AND p.course_id = r.course_id;

ALTER TABLE community.course_rating ALTER COLUMN milestone DROP DEFAULT;
ALTER TABLE community.course_rating DROP CONSTRAINT course_rating_pkey;
ALTER TABLE community.course_rating ADD PRIMARY KEY (user_id, course_id, milestone);

-- The "latest milestone per learner" read of the trigger and the rating state.
CREATE INDEX IF NOT EXISTS idx_course_rating_latest
    ON community.course_rating (course_id, user_id, milestone DESC) WHERE NOT is_hidden;

-- Same loop as before; each learner now counts once, with their highest visible milestone.
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
              FROM (SELECT DISTINCT ON (user_id) stars
                    FROM community.course_rating
                    WHERE course_id = v_course AND NOT is_hidden
                    ORDER BY user_id, milestone DESC) latest) s
        WHERE c.id = v_course;
    END LOOP;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_course_rating_refresh ON community.course_rating;
CREATE TRIGGER trg_course_rating_refresh
    AFTER INSERT OR DELETE OR UPDATE OF stars, is_hidden, course_id, milestone ON community.course_rating
    FOR EACH ROW EXECUTE FUNCTION community.course_rating_refresh();

-- The backfill changed milestone before the trigger listened to it: recount every rated course once.
UPDATE catalog.course c
SET rating_avg = s.avg,
    rating_count = s.n,
    rating = CASE WHEN s.n >= 3 THEN s.avg END,
    reviews = s.n
FROM (SELECT course_id, ROUND(AVG(stars), 2) AS avg, COUNT(*)::int AS n
      FROM (SELECT DISTINCT ON (course_id, user_id) course_id, stars
            FROM community.course_rating
            WHERE NOT is_hidden
            ORDER BY course_id, user_id, milestone DESC) latest
      GROUP BY course_id) s
WHERE c.id = s.course_id;

COMMIT;
