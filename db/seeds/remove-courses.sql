-- Removes the courses that no longer fit the catalog (docs/course-catalog-plan.md, 2026-11-06):
-- archived pure-language outlines, courses replaced by the engine courses, language foundations and
-- generic fundamentals. Idempotent. Everything owned by a course goes with it (modules, lessons,
-- challenges, progress, favourites, comments, ratings, offers, entitlements: ON DELETE CASCADE).
-- A course that was ever ordered is NOT removed: commerce.order_items keeps the purchase
-- (ON DELETE RESTRICT), so the script stops with a foreign key error naming it.
BEGIN;

CREATE TEMP TABLE removed_course ON COMMIT DROP AS
SELECT id FROM catalog.course WHERE public_id = ANY(ARRAY[
    'c-systems-programming',
    'cpp-high-performance',
    'cpp23-modern',
    'csharp-async-services',
    'go-concurrency',
    'java21-virtual-threads',
    'kotlin-coroutines-flows',
    'php-modern-apis',
    'python-ml-evaluation',
    'python-ml-from-scratch',
    'rust-practical',
    'rust-systems-concurrency',
    'sql-window-analytics',
    'typescript-type-level',
    'devops-foundations-ci-containers',
    'postgres-performance',
    'c-foundations-memory',
    'cpp-foundations',
    'csharp-foundations',
    'go-foundations',
    'java21-foundations',
    'kotlin-foundations',
    'php-foundations',
    'rust-foundations',
    'python-foundations-automation',
    'typescript-foundations',
    'js-modern-foundations',
    'software-architecture-fundamentals',
    'web-http-fundamentals',
    'web-foundations-html-css-a11y',
    'sql-data-analysis-foundations',
    'typescript-test-design',
    'test-automation-foundations'
]::text[]);

-- learning.recovery points at modules and lessons without a cascade.
DELETE FROM learning.recovery WHERE course_id IN (SELECT id FROM removed_course);

-- Challenge files registered by the seeds (the objects themselves are removed from the bucket separately).
DELETE FROM storage.assets a
USING challenge.challenges ch
WHERE ch.course_id IN (SELECT id FROM removed_course)
  AND a.object_key LIKE 'challenges/%/' || ch.public_id || '/%';

DELETE FROM catalog.course WHERE id IN (SELECT id FROM removed_course);

COMMIT;
