-- =============================================================================
-- 20261024_004_course_level_override.sql
--
-- Per-course override of the recommended User Level range (docs/master-plan-v1.3-adaptation.md P4).
-- NULL keeps the range of the course level (lib/levels.js RECOMMENDED_LEVELS); either bound can be
-- set alone. Suggestion only: access is still decided by entitlements and prerequisites.
-- =============================================================================

BEGIN;

ALTER TABLE catalog.course
  ADD COLUMN IF NOT EXISTS recommended_min_level smallint
    CONSTRAINT course_recommended_min_level_check CHECK (recommended_min_level BETWEEN 1 AND 20),
  ADD COLUMN IF NOT EXISTS recommended_max_level smallint
    CONSTRAINT course_recommended_max_level_check CHECK (recommended_max_level BETWEEN 1 AND 20);

ALTER TABLE catalog.course
  ADD CONSTRAINT course_recommended_level_range CHECK (recommended_max_level >= recommended_min_level);

COMMIT;
