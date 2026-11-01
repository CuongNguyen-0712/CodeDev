-- =============================================================================
-- 20261101_006_learner_role_permissions.sql
--
-- The default role `user` (public.default_role_id(), given to every new account) held
-- course.create / course.update and blog.create / blog.update. PATCH /api/admin/courses/:id only
-- asked for course.update, so any signed-in learner could edit course metadata through the API
-- (docs/admin-panel-plan.md, finding A1). No learner feature uses these permissions: they belong
-- to admin and course_manager, which keep them.
-- =============================================================================

BEGIN;

DELETE FROM identity.role_permissions rp
USING identity.roles r, identity.permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.code IN ('user', 'student', 'instructor')
  AND p.resource IN ('course', 'blog')
  AND p.action IN ('create', 'update', 'delete');

COMMIT;
