-- =============================================================================
-- 20261017_003_course_metadata_onboarding.sql
--
-- Shared metadata for personalised onboarding and the course catalog
-- (design: docs/premium-onboarding-design.md):
--   * taxonomy tables (career roles, industries, learning goals, skills) kept in the database so
--     the frontend never hardcodes them; `is_active` hides an entry without deleting history;
--   * course metadata: skills, target roles, industries, goals, prerequisites, an explicit
--     publish status, a course type and an access model (free / premium);
--   * roadmaps (learning paths) can target a career role;
--   * per-user onboarding state (explicit status + resume step) and learning preferences.
--
-- Expand-only: catalog.course.is_hidden stays and is kept in sync with publish_status by a
-- trigger, so code that still filters on is_hidden keeps working during a rolling deploy.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------- taxonomy
CREATE TABLE IF NOT EXISTS catalog.career_role (
    id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code        varchar(50)  NOT NULL UNIQUE,
    name        varchar(100) NOT NULL,
    description text,
    sort_order  integer      NOT NULL DEFAULT 0,
    is_active   boolean      NOT NULL DEFAULT true,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz,
    CONSTRAINT chk_career_role_code CHECK (code ~ '^[a-z0-9_]+$')
);
COMMENT ON TABLE catalog.career_role IS 'Career roles a learner picks during onboarding (not RBAC roles: see identity.roles)';

CREATE TABLE IF NOT EXISTS catalog.industry (
    id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code        varchar(50)  NOT NULL UNIQUE,
    name        varchar(100) NOT NULL,
    description text,
    sort_order  integer      NOT NULL DEFAULT 0,
    is_active   boolean      NOT NULL DEFAULT true,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz,
    CONSTRAINT chk_industry_code CHECK (code ~ '^[a-z0-9_]+$')
);

CREATE TABLE IF NOT EXISTS catalog.learning_goal (
    id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code        varchar(50)  NOT NULL UNIQUE,
    name        varchar(100) NOT NULL,
    description text,
    sort_order  integer      NOT NULL DEFAULT 0,
    is_active   boolean      NOT NULL DEFAULT true,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz,
    CONSTRAINT chk_learning_goal_code CHECK (code ~ '^[a-z0-9_]+$')
);

CREATE TABLE IF NOT EXISTS catalog.skill (
    id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code        varchar(50)  NOT NULL UNIQUE,
    name        varchar(100) NOT NULL,
    is_active   boolean      NOT NULL DEFAULT true,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz,
    CONSTRAINT chk_skill_code CHECK (code ~ '^[a-z0-9_]+$')
);

-- Skills a career role needs; weight 1 (useful) .. 5 (core).
CREATE TABLE IF NOT EXISTS catalog.career_role_skill (
    career_role_id integer  NOT NULL REFERENCES catalog.career_role(id) ON DELETE CASCADE,
    skill_id       integer  NOT NULL REFERENCES catalog.skill(id) ON DELETE CASCADE,
    weight         smallint NOT NULL DEFAULT 1,
    PRIMARY KEY (career_role_id, skill_id),
    CONSTRAINT chk_career_role_skill_weight CHECK (weight BETWEEN 1 AND 5)
);
CREATE INDEX IF NOT EXISTS idx_career_role_skill_skill ON catalog.career_role_skill (skill_id);

-- ---------------------------------------------------------------- course metadata
CREATE TABLE IF NOT EXISTS catalog.course_skill (
    course_id bigint   NOT NULL REFERENCES catalog.course(id) ON DELETE CASCADE,
    skill_id  integer  NOT NULL REFERENCES catalog.skill(id) ON DELETE CASCADE,
    weight    smallint NOT NULL DEFAULT 1,
    PRIMARY KEY (course_id, skill_id),
    CONSTRAINT chk_course_skill_weight CHECK (weight BETWEEN 1 AND 5)
);
CREATE INDEX IF NOT EXISTS idx_course_skill_skill ON catalog.course_skill (skill_id);

CREATE TABLE IF NOT EXISTS catalog.course_career_role (
    course_id      bigint  NOT NULL REFERENCES catalog.course(id) ON DELETE CASCADE,
    career_role_id integer NOT NULL REFERENCES catalog.career_role(id) ON DELETE CASCADE,
    PRIMARY KEY (course_id, career_role_id)
);
CREATE INDEX IF NOT EXISTS idx_course_career_role_role ON catalog.course_career_role (career_role_id);

-- No row = the course is industry-agnostic.
CREATE TABLE IF NOT EXISTS catalog.course_industry (
    course_id   bigint  NOT NULL REFERENCES catalog.course(id) ON DELETE CASCADE,
    industry_id integer NOT NULL REFERENCES catalog.industry(id) ON DELETE CASCADE,
    PRIMARY KEY (course_id, industry_id)
);
CREATE INDEX IF NOT EXISTS idx_course_industry_industry ON catalog.course_industry (industry_id);

CREATE TABLE IF NOT EXISTS catalog.course_learning_goal (
    course_id        bigint  NOT NULL REFERENCES catalog.course(id) ON DELETE CASCADE,
    learning_goal_id integer NOT NULL REFERENCES catalog.learning_goal(id) ON DELETE CASCADE,
    PRIMARY KEY (course_id, learning_goal_id)
);
CREATE INDEX IF NOT EXISTS idx_course_learning_goal_goal ON catalog.course_learning_goal (learning_goal_id);

CREATE TABLE IF NOT EXISTS catalog.course_prerequisite (
    course_id              bigint NOT NULL REFERENCES catalog.course(id) ON DELETE CASCADE,
    prerequisite_course_id bigint NOT NULL REFERENCES catalog.course(id) ON DELETE CASCADE,
    PRIMARY KEY (course_id, prerequisite_course_id),
    CONSTRAINT chk_course_prerequisite_not_self CHECK (course_id <> prerequisite_course_id)
);
CREATE INDEX IF NOT EXISTS idx_course_prerequisite_prereq ON catalog.course_prerequisite (prerequisite_course_id);

ALTER TABLE catalog.course
    ADD COLUMN IF NOT EXISTS publish_status varchar(20),
    ADD COLUMN IF NOT EXISTS published_at   timestamptz,
    ADD COLUMN IF NOT EXISTS course_type    varchar(20) NOT NULL DEFAULT 'course',
    ADD COLUMN IF NOT EXISTS access_model   varchar(20) NOT NULL DEFAULT 'free';

UPDATE catalog.course
SET publish_status = CASE
        WHEN is_deleted THEN 'archived'
        WHEN is_hidden  THEN 'unpublished'
        ELSE 'published'
    END,
    published_at = CASE WHEN NOT is_deleted AND NOT is_hidden THEN COALESCE(created_at, now()) END
WHERE publish_status IS NULL;

-- Courses that had a price before offers existed are premium (none at the time of writing).
UPDATE catalog.course
SET access_model = 'premium'
WHERE access_model = 'free' AND (COALESCE(cost, 0) > 0 OR COALESCE(point_price, 0) > 0);

ALTER TABLE catalog.course ALTER COLUMN publish_status SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_course_publish_status') THEN
        ALTER TABLE catalog.course ADD CONSTRAINT chk_course_publish_status
            CHECK (publish_status IN ('draft', 'published', 'unpublished', 'archived'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_course_type') THEN
        ALTER TABLE catalog.course ADD CONSTRAINT chk_course_type
            CHECK (course_type IN ('course', 'project', 'workshop'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_course_access_model') THEN
        ALTER TABLE catalog.course ADD CONSTRAINT chk_course_access_model
            CHECK (access_model IN ('free', 'premium'));
    END IF;
END;
$$;

COMMENT ON COLUMN catalog.course.publish_status IS 'draft | published | unpublished | archived. Source of truth for visibility; is_hidden is derived from it';
COMMENT ON COLUMN catalog.course.access_model IS 'free: anyone may enrol (a free entitlement is granted). premium: needs an entitlement from a purchase, points or an admin grant';
COMMENT ON COLUMN catalog.course.cost IS 'Deprecated: prices live in commerce.offer';
COMMENT ON COLUMN catalog.course.point_price IS 'Deprecated: prices live in commerce.offer';

-- publish_status <-> is_hidden / is_deleted. A writer that only knows the legacy columns (content
-- seeds, the previous app version) still produces a consistent row, and vice versa.
CREATE OR REPLACE FUNCTION catalog.course_publish_sync()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.publish_status IS NULL THEN
            NEW.publish_status := CASE
                WHEN COALESCE(NEW.is_deleted, false) THEN 'archived'
                WHEN COALESCE(NEW.is_hidden, false)  THEN 'unpublished'
                ELSE 'published'
            END;
        END IF;
    ELSIF NEW.publish_status IS NOT DISTINCT FROM OLD.publish_status THEN
        IF NEW.is_deleted IS DISTINCT FROM OLD.is_deleted AND COALESCE(NEW.is_deleted, false) THEN
            NEW.publish_status := 'archived';
        ELSIF NEW.is_hidden IS DISTINCT FROM OLD.is_hidden THEN
            NEW.publish_status := CASE WHEN COALESCE(NEW.is_hidden, false) THEN 'unpublished' ELSE 'published' END;
        END IF;
    END IF;

    NEW.is_hidden := NEW.publish_status <> 'published';
    IF NEW.publish_status = 'published' AND NEW.published_at IS NULL THEN
        NEW.published_at := now();
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_course_publish_sync ON catalog.course;
CREATE TRIGGER trg_course_publish_sync
    BEFORE INSERT OR UPDATE ON catalog.course
    FOR EACH ROW EXECUTE FUNCTION catalog.course_publish_sync();

CREATE INDEX IF NOT EXISTS idx_course_published ON catalog.course (id)
    WHERE publish_status = 'published' AND is_deleted = false;

-- Learning paths (roadmaps) can target a career role.
ALTER TABLE roadmap.roadmaps
    ADD COLUMN IF NOT EXISTS career_role_id integer REFERENCES catalog.career_role(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------- onboarding
CREATE TABLE IF NOT EXISTS profile.onboarding (
    user_id      bigint      PRIMARY KEY REFERENCES identity.users(id) ON DELETE CASCADE,
    status       varchar(20) NOT NULL DEFAULT 'not_started',
    current_step varchar(20) NOT NULL DEFAULT 'role',
    started_at   timestamptz,
    completed_at timestamptz,
    skipped_at   timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_onboarding_status CHECK (status IN ('not_started', 'in_progress', 'skipped', 'completed')),
    CONSTRAINT chk_onboarding_step CHECK (current_step IN ('role', 'industry', 'level_goals', 'review', 'recommendations')),
    CONSTRAINT chk_onboarding_completed_at CHECK (status <> 'completed' OR completed_at IS NOT NULL),
    CONSTRAINT chk_onboarding_skipped_at CHECK (status <> 'skipped' OR skipped_at IS NOT NULL)
);
COMMENT ON TABLE profile.onboarding IS 'Explicit onboarding state per user; current_step is where an in-progress onboarding resumes';

CREATE TABLE IF NOT EXISTS profile.learning_preference (
    user_id               bigint      PRIMARY KEY REFERENCES identity.users(id) ON DELETE CASCADE,
    career_role_id        integer     REFERENCES catalog.career_role(id) ON DELETE SET NULL,
    experience_level      varchar(20),
    preferred_language_id integer     REFERENCES catalog.language(id) ON DELETE SET NULL,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_learning_preference_level CHECK (experience_level IS NULL OR experience_level IN ('beginner', 'junior', 'intermediate', 'advanced'))
);
COMMENT ON COLUMN profile.learning_preference.preferred_language_id IS 'Optional: programming language favoured by recommendations';

CREATE TABLE IF NOT EXISTS profile.user_industry (
    user_id     bigint      NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    industry_id integer     NOT NULL REFERENCES catalog.industry(id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, industry_id)
);
CREATE INDEX IF NOT EXISTS idx_user_industry_industry ON profile.user_industry (industry_id);

CREATE TABLE IF NOT EXISTS profile.user_learning_goal (
    user_id          bigint      NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    learning_goal_id integer     NOT NULL REFERENCES catalog.learning_goal(id) ON DELETE CASCADE,
    created_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, learning_goal_id)
);
CREATE INDEX IF NOT EXISTS idx_user_learning_goal_goal ON profile.user_learning_goal (learning_goal_id);

-- Every user has an explicit onboarding row from the moment the account exists.
CREATE OR REPLACE FUNCTION profile.create_onboarding_row()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    INSERT INTO profile.onboarding (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_users_onboarding ON identity.users;
CREATE TRIGGER trg_users_onboarding
    AFTER INSERT ON identity.users
    FOR EACH ROW EXECUTE FUNCTION profile.create_onboarding_row();

INSERT INTO profile.onboarding (user_id)
SELECT id FROM identity.users
ON CONFLICT (user_id) DO NOTHING;

-- ---------------------------------------------------------------- reference data
INSERT INTO catalog.career_role (code, name, description, sort_order) VALUES
    ('frontend_developer',  'Frontend Developer',        'Builds user interfaces for the web', 10),
    ('backend_developer',   'Backend Developer',         'Builds APIs, services and data access', 20),
    ('fullstack_developer', 'Fullstack Developer',       'Works across frontend and backend', 30),
    ('mobile_developer',    'Mobile Developer',          'Builds iOS / Android / cross-platform apps', 40),
    ('devops_engineer',     'DevOps Engineer',           'Builds, deploys and operates systems', 50),
    ('data_engineer',       'Data Engineer',             'Builds data pipelines and storage', 60),
    ('data_analyst',        'Data Analyst',              'Turns data into decisions', 70),
    ('ml_engineer',         'Machine Learning Engineer', 'Trains and ships ML models', 80),
    ('qa_engineer',         'QA / Test Engineer',        'Tests and automates quality checks', 90),
    ('student',             'Student / Career Starter',  'Learning to program, no fixed role yet', 100)
ON CONFLICT (code) DO NOTHING;

INSERT INTO catalog.industry (code, name, sort_order) VALUES
    ('software_product', 'Software products / SaaS', 10),
    ('outsourcing',      'IT services / Outsourcing', 20),
    ('fintech',          'Finance / Banking / Fintech', 30),
    ('ecommerce',        'E-commerce / Retail', 40),
    ('education',        'Education / EdTech', 50),
    ('healthcare',       'Healthcare', 60),
    ('gaming',           'Gaming / Entertainment', 70),
    ('media',            'Media / Marketing', 80),
    ('telecom',          'Telecommunications', 90),
    ('logistics',        'Logistics / Transportation', 100),
    ('manufacturing',    'Manufacturing / IoT', 110),
    ('public_sector',    'Government / Public sector', 120)
ON CONFLICT (code) DO NOTHING;

INSERT INTO catalog.learning_goal (code, name, sort_order) VALUES
    ('first_job',      'Get my first developer job', 10),
    ('change_career', 'Switch careers into tech', 20),
    ('grow_in_role',   'Level up in my current role', 30),
    ('interview_prep', 'Prepare for technical interviews', 40),
    ('build_projects', 'Build real projects', 50),
    ('fundamentals',   'Strengthen programming fundamentals', 60),
    ('performance',    'Write faster, more reliable systems', 70)
ON CONFLICT (code) DO NOTHING;

INSERT INTO catalog.skill (code, name) VALUES
    ('javascript',        'JavaScript'),
    ('typescript',        'TypeScript'),
    ('python',            'Python'),
    ('html_css',          'HTML & CSS'),
    ('react',             'React'),
    ('nodejs',            'Node.js'),
    ('async_programming', 'Asynchronous programming'),
    ('concurrency',       'Concurrency & consistency'),
    ('performance',       'Performance optimisation'),
    ('api_design',        'API design'),
    ('testing',           'Testing'),
    ('sql',               'SQL & databases'),
    ('data_structures',   'Data structures & algorithms'),
    ('system_design',     'System design'),
    ('docker',            'Docker & containers'),
    ('data_analysis',     'Data analysis'),
    ('machine_learning',  'Machine learning')
ON CONFLICT (code) DO NOTHING;

INSERT INTO catalog.career_role_skill (career_role_id, skill_id, weight)
SELECT r.id, s.id, m.weight
FROM (VALUES
    ('frontend_developer',  'javascript', 5), ('frontend_developer', 'typescript', 4), ('frontend_developer', 'html_css', 5),
    ('frontend_developer',  'react', 4), ('frontend_developer', 'async_programming', 3), ('frontend_developer', 'testing', 2),
    ('frontend_developer',  'performance', 2),
    ('backend_developer',   'nodejs', 4), ('backend_developer', 'javascript', 3), ('backend_developer', 'typescript', 3),
    ('backend_developer',   'python', 3), ('backend_developer', 'async_programming', 4), ('backend_developer', 'concurrency', 4),
    ('backend_developer',   'api_design', 5), ('backend_developer', 'sql', 5), ('backend_developer', 'performance', 3),
    ('backend_developer',   'system_design', 3), ('backend_developer', 'testing', 2),
    ('fullstack_developer', 'javascript', 5), ('fullstack_developer', 'typescript', 4), ('fullstack_developer', 'react', 4),
    ('fullstack_developer', 'nodejs', 4), ('fullstack_developer', 'async_programming', 4), ('fullstack_developer', 'api_design', 3),
    ('fullstack_developer', 'sql', 3), ('fullstack_developer', 'html_css', 3), ('fullstack_developer', 'concurrency', 2),
    ('mobile_developer',    'javascript', 3), ('mobile_developer', 'typescript', 3), ('mobile_developer', 'react', 3),
    ('mobile_developer',    'async_programming', 3), ('mobile_developer', 'performance', 3),
    ('devops_engineer',     'docker', 5), ('devops_engineer', 'system_design', 3), ('devops_engineer', 'python', 3),
    ('devops_engineer',     'performance', 3), ('devops_engineer', 'concurrency', 2),
    ('data_engineer',       'python', 5), ('data_engineer', 'sql', 5), ('data_engineer', 'concurrency', 3),
    ('data_engineer',       'performance', 3), ('data_engineer', 'system_design', 3),
    ('data_analyst',        'python', 4), ('data_analyst', 'sql', 5), ('data_analyst', 'data_analysis', 5),
    ('ml_engineer',         'python', 5), ('ml_engineer', 'machine_learning', 5), ('ml_engineer', 'data_analysis', 3),
    ('ml_engineer',         'data_structures', 2),
    ('qa_engineer',         'testing', 5), ('qa_engineer', 'javascript', 3), ('qa_engineer', 'python', 3),
    ('qa_engineer',         'api_design', 2),
    ('student',             'javascript', 3), ('student', 'python', 3), ('student', 'data_structures', 4),
    ('student',             'html_css', 2), ('student', 'sql', 2)
) AS m(role_code, skill_code, weight)
JOIN catalog.career_role r ON r.code = m.role_code
JOIN catalog.skill s ON s.code = m.skill_code
ON CONFLICT (career_role_id, skill_id) DO NOTHING;

COMMIT;
