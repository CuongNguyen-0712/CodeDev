-- =============================================================================
-- course-metadata.sql
--
-- Recommendation / filter metadata for the two existing (real) courses. No course is created.
-- Idempotent: every statement replaces the course's sets, so it can be re-applied.
-- Proposed values: CONFIRM WITH THE CONTENT OWNER before applying to production
-- (see docs/premium-onboarding-design.md, "Quyết định cần xác nhận").
-- Both courses stay FREE (JavaScript runs in the browser sandbox).
-- =============================================================================

BEGIN;

CREATE TEMP TABLE seed_course_meta (course_public_id varchar, kind varchar, code varchar, weight smallint) ON COMMIT DROP;

INSERT INTO seed_course_meta VALUES
    -- JavaScript: Asynchronous Architecture & Production Patterns
    ('javascript-async-architecture_2026100901', 'skill', 'javascript', 4),
    ('javascript-async-architecture_2026100901', 'skill', 'async_programming', 5),
    ('javascript-async-architecture_2026100901', 'skill', 'concurrency', 2),
    ('javascript-async-architecture_2026100901', 'skill', 'performance', 2),
    ('javascript-async-architecture_2026100901', 'skill', 'testing', 2),
    ('javascript-async-architecture_2026100901', 'role', 'frontend_developer', NULL),
    ('javascript-async-architecture_2026100901', 'role', 'backend_developer', NULL),
    ('javascript-async-architecture_2026100901', 'role', 'fullstack_developer', NULL),
    ('javascript-async-architecture_2026100901', 'goal', 'grow_in_role', NULL),
    ('javascript-async-architecture_2026100901', 'goal', 'interview_prep', NULL),
    ('javascript-async-architecture_2026100901', 'goal', 'fundamentals', NULL),
    -- Node.js High Performance: Concurrency & Consistency
    ('nodejs-high-performance', 'skill', 'nodejs', 5),
    ('nodejs-high-performance', 'skill', 'concurrency', 5),
    ('nodejs-high-performance', 'skill', 'performance', 4),
    ('nodejs-high-performance', 'skill', 'api_design', 3),
    ('nodejs-high-performance', 'skill', 'javascript', 3),
    ('nodejs-high-performance', 'skill', 'system_design', 2),
    ('nodejs-high-performance', 'role', 'backend_developer', NULL),
    ('nodejs-high-performance', 'role', 'fullstack_developer', NULL),
    ('nodejs-high-performance', 'goal', 'grow_in_role', NULL),
    ('nodejs-high-performance', 'goal', 'performance', NULL),
    ('nodejs-high-performance', 'goal', 'build_projects', NULL);

DELETE FROM catalog.course_skill WHERE course_id IN (SELECT c.id FROM catalog.course c JOIN seed_course_meta s ON s.course_public_id = c.public_id);
DELETE FROM catalog.course_career_role WHERE course_id IN (SELECT c.id FROM catalog.course c JOIN seed_course_meta s ON s.course_public_id = c.public_id);
DELETE FROM catalog.course_learning_goal WHERE course_id IN (SELECT c.id FROM catalog.course c JOIN seed_course_meta s ON s.course_public_id = c.public_id);

INSERT INTO catalog.course_skill (course_id, skill_id, weight)
SELECT c.id, k.id, s.weight
FROM seed_course_meta s JOIN catalog.course c ON c.public_id = s.course_public_id JOIN catalog.skill k ON k.code = s.code
WHERE s.kind = 'skill';

INSERT INTO catalog.course_career_role (course_id, career_role_id)
SELECT c.id, r.id
FROM seed_course_meta s JOIN catalog.course c ON c.public_id = s.course_public_id JOIN catalog.career_role r ON r.code = s.code
WHERE s.kind = 'role';

INSERT INTO catalog.course_learning_goal (course_id, learning_goal_id)
SELECT c.id, g.id
FROM seed_course_meta s JOIN catalog.course c ON c.public_id = s.course_public_id JOIN catalog.learning_goal g ON g.code = s.code
WHERE s.kind = 'goal';

-- Node.js High Performance builds on the async architecture course (async/await, promises).
DELETE FROM catalog.course_prerequisite
WHERE course_id = (SELECT id FROM catalog.course WHERE public_id = 'nodejs-high-performance');
INSERT INTO catalog.course_prerequisite (course_id, prerequisite_course_id)
SELECT n.id, a.id
FROM catalog.course n, catalog.course a
WHERE n.public_id = 'nodejs-high-performance' AND a.public_id = 'javascript-async-architecture_2026100901';

COMMIT;
