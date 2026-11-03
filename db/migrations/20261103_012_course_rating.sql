-- =============================================================================
-- 20261103_012_course_rating.sql
--
-- Course ratings from learners (docs/admin-panel-plan.md 12):
--   community.course_rating  one rating (1-5 stars) per learner and course, editable; is_hidden is
--                            set by a moderator (spam) and keeps the row out of the average
--   catalog.course           rating_avg / rating_count, kept by a trigger so listings and the
--                            "rating >= x" filter read one column
-- The hand-entered catalog.course.rating and community.comment.rating (always 1) are not carried
-- over; they are dropped by a later migration once the code reads rating_avg (P9.5).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS community.course_rating (
    user_id bigint NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    course_id bigint NOT NULL REFERENCES catalog.course(id) ON DELETE CASCADE,
    stars smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
    is_hidden boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_course_rating_course ON community.course_rating (course_id) WHERE NOT is_hidden;

ALTER TABLE catalog.course
    ADD COLUMN IF NOT EXISTS rating_avg numeric(3,2),
    ADD COLUMN IF NOT EXISTS rating_count integer NOT NULL DEFAULT 0;

-- Recomputes the course's average from its visible ratings (a few rows per course: a full recount
-- never drifts, unlike incremental sums).
CREATE OR REPLACE FUNCTION community.course_rating_refresh() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        UPDATE catalog.course c
        SET rating_avg = s.avg, rating_count = s.n
        FROM (SELECT ROUND(AVG(stars), 2) AS avg, COUNT(*)::int AS n
              FROM community.course_rating WHERE course_id = OLD.course_id AND NOT is_hidden) s
        WHERE c.id = OLD.course_id;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') AND (TG_OP = 'INSERT' OR NEW.course_id IS DISTINCT FROM OLD.course_id) THEN
        UPDATE catalog.course c
        SET rating_avg = s.avg, rating_count = s.n
        FROM (SELECT ROUND(AVG(stars), 2) AS avg, COUNT(*)::int AS n
              FROM community.course_rating WHERE course_id = NEW.course_id AND NOT is_hidden) s
        WHERE c.id = NEW.course_id;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_course_rating_refresh ON community.course_rating;
CREATE TRIGGER trg_course_rating_refresh
    AFTER INSERT OR UPDATE OF stars, is_hidden, course_id OR DELETE ON community.course_rating
    FOR EACH ROW EXECUTE FUNCTION community.course_rating_refresh();

COMMIT;
