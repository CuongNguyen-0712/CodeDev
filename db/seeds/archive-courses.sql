-- Seed: archive the outline-only, language-only courses (docs/course-catalog-plan.md, update 2026-11-04).
-- Hand-written. Idempotent. The course seeds write publish_status only when they insert a row, so this
-- file moves the rows that already exist. catalog.course_publish_sync() hides archived courses, and
-- has_course_access() refuses them. No lesson was written for these courses: no learner data is lost.
-- Apply after the course seeds and before db/seeds/roadmaps.sql.

BEGIN;

UPDATE catalog.course
SET publish_status = 'archived', updated_at = now()
WHERE public_id IN (
    'c-systems-programming', 'cpp-high-performance', 'cpp23-modern', 'csharp-async-services', 'go-concurrency',
    'java21-virtual-threads', 'kotlin-coroutines-flows', 'php-modern-apis', 'python-ml-from-scratch',
    'python-ml-evaluation', 'rust-practical', 'rust-systems-concurrency', 'sql-window-analytics', 'typescript-type-level'
)
  AND publish_status <> 'archived';

-- Kept courses no longer point at an archived course as their prerequisite.
DELETE FROM catalog.course_prerequisite p
USING catalog.course pre
WHERE pre.id = p.prerequisite_course_id
  AND pre.publish_status = 'archived';

COMMIT;
