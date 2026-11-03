-- =============================================================================
-- 20261103_014_rating_moderation.sql
--
-- Admin side of course ratings (docs/admin-panel-plan.md 11.3, 12.5):
--   comment.moderate      hide / show learners' ratings (and later comments) of a course; granted to
--                         admin and course_manager, super_admin gets it from its trigger
--   metrics.ratings_daily ratings per day and course for Grafana (no user)
-- =============================================================================

BEGIN;

INSERT INTO identity.permissions (id, resource, action, description)
SELECT (SELECT COALESCE(MAX(id), 0) FROM identity.permissions) + 1, 'comment', 'moderate', 'Hide or show learners'' ratings and comments of a course'
WHERE NOT EXISTS (SELECT 1 FROM identity.permissions WHERE resource = 'comment' AND action = 'moderate');

SELECT setval(pg_get_serial_sequence('identity.permissions', 'id'), (SELECT MAX(id) FROM identity.permissions));

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM identity.roles r JOIN identity.permissions p ON p.resource = 'comment' AND p.action = 'moderate'
WHERE r.code IN ('super_admin', 'admin', 'course_manager')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE VIEW metrics.ratings_daily AS
SELECT date_trunc('day', r.updated_at)::date AS day,
       c.public_id AS course,
       COUNT(*)::int AS ratings,
       ROUND(AVG(r.stars), 2)::float AS average
FROM community.course_rating r
JOIN catalog.course c ON c.id = r.course_id
WHERE NOT r.is_hidden AND r.updated_at > now() - interval '90 days'
GROUP BY 1, 2;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'grafana_ro') THEN
        GRANT SELECT ON metrics.ratings_daily TO grafana_ro;
    END IF;
END
$$;

COMMIT;
