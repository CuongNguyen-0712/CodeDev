-- =============================================================================
-- 20261019_001_profile_privacy_ranking.sql
--
-- Public profiles and ranking (docs/ui-ux/PROFILE_AND_LEADERBOARD_PLAN.md, docs/ranking-plan.md):
--   * profile.info privacy switches: show_profile (public profile page), show_learning (course
--     titles and languages on it), show_on_leaderboard.
--   * profile.rank_tier: tier thresholds per board. 'exp' reuses the level groups
--     (levels 1-3, 4-7, 8-11, 12-15, 16-17, 18-20 start at these EXP totals).
--   * public.ranking_scores(_since): per-user EXP, points earned, challenge accuracy and the
--     overall score, read from the EXP / points ledgers (NULL = all time, else since that time).
--     Nothing is cached on profile.info, so post_points / award_exp stay unchanged.
-- Expand-only: no column or table is dropped.
-- =============================================================================

BEGIN;

ALTER TABLE profile.info
    ADD COLUMN show_profile boolean NOT NULL DEFAULT true,
    ADD COLUMN show_learning boolean NOT NULL DEFAULT false,
    ADD COLUMN show_on_leaderboard boolean NOT NULL DEFAULT true;

CREATE TABLE profile.rank_tier (
    kind      varchar(10) NOT NULL CHECK (kind IN ('overall', 'exp', 'points')),
    tier      int NOT NULL CHECK (tier >= 1),
    title     varchar(40) NOT NULL,
    min_score bigint NOT NULL CHECK (min_score >= 0),
    PRIMARY KEY (kind, tier),
    UNIQUE (kind, min_score)
);

INSERT INTO profile.rank_tier (kind, tier, title, min_score) VALUES
    ('overall', 1, 'Rookie', 0),
    ('overall', 2, 'Learner', 500),
    ('overall', 3, 'Practitioner', 1500),
    ('overall', 4, 'Elite', 4000),
    ('overall', 5, 'Master', 9000),
    ('overall', 6, 'Legend', 18000),
    ('exp', 1, 'Starter', 0),
    ('exp', 2, 'Foundation', 450),
    ('exp', 3, 'Developer', 1900),
    ('exp', 4, 'Specialist', 4900),
    ('exp', 5, 'Expert', 9800),
    ('exp', 6, 'Master', 13500),
    ('points', 1, 'Bronze', 0),
    ('points', 2, 'Silver', 300),
    ('points', 3, 'Gold', 1000),
    ('points', 4, 'Platinum', 3000),
    ('points', 5, 'Diamond', 7500),
    ('points', 6, 'Legend', 15000);

-- Points ranking counts only credits of earned points (not refunds or admin adjustments).
CREATE INDEX idx_point_transaction_earned ON profile.point_transaction (user_id, created_at)
    WHERE action = 'credit' AND entry_type = 'earned';
CREATE INDEX idx_exp_transaction_challenge ON profile.exp_transaction (source_id, user_id)
    WHERE source_type = 'challenge';

-- overall = round((exp + 0.5 * points_earned) * accuracy), accuracy = 0.9 + 0.2 * first-try rate
-- once 10 challenges are passed (1.0 before). A pass is "first try" when the award came on the
-- first quiz attempt / first code submission. last_at (latest ledger entry) breaks ties: whoever
-- reached the score first ranks higher.
-- shortcut: computed from the ledgers on every call; cache columns + indexes when the user count
-- makes the leaderboard query slow (ranking-plan §5, §9).
CREATE OR REPLACE FUNCTION public.ranking_scores(_since timestamptz DEFAULT NULL)
RETURNS TABLE(user_id bigint, exp bigint, points_earned bigint, challenges_passed int,
              challenges_first_try int, overall bigint, last_at timestamptz)
LANGUAGE sql STABLE
AS $function$
    WITH e AS (
        SELECT t.user_id, GREATEST(SUM(t.amount), 0)::bigint AS exp, MAX(t.created_at) AS last_at
        FROM profile.exp_transaction t
        WHERE _since IS NULL OR t.created_at >= _since
        GROUP BY t.user_id
    ),
    p AS (
        SELECT t.user_id, SUM(t.amount)::bigint AS points, MAX(t.created_at) AS last_at
        FROM profile.point_transaction t
        WHERE t.action = 'credit' AND t.entry_type = 'earned'
          AND (_since IS NULL OR t.created_at >= _since)
        GROUP BY t.user_id
    ),
    passes AS (
        SELECT t.user_id,
               CASE WHEN ch.type = 'quiz' THEN (
                   SELECT COUNT(DISTINCT qs.created_at)
                   FROM challenge.question_submissions qs
                   JOIN challenge.questions q ON q.id = qs.question_id
                   WHERE qs.user_id = t.user_id AND q.challenge_id = ch.id
                     AND qs.created_at <= t.created_at::timestamp
               ) ELSE (
                   SELECT COUNT(*)
                   FROM challenge.code_submissions s
                   WHERE s.user_id = t.user_id AND s.challenge_id = ch.id
                     AND s.submitted_at <= t.created_at::timestamp
               ) END AS attempts
        FROM profile.exp_transaction t
        JOIN challenge.challenges ch ON ch.id = t.source_id
        WHERE t.source_type = 'challenge' AND t.amount > 0
          AND (_since IS NULL OR t.created_at >= _since)
    ),
    c AS (
        SELECT passes.user_id,
               COUNT(*)::int AS passed,
               COUNT(*) FILTER (WHERE attempts <= 1)::int AS first_try
        FROM passes
        GROUP BY passes.user_id
    )
    SELECT ids.user_id,
           COALESCE(e.exp, 0),
           COALESCE(p.points, 0),
           COALESCE(c.passed, 0),
           COALESCE(c.first_try, 0),
           ROUND(
               (COALESCE(e.exp, 0) + 0.5 * COALESCE(p.points, 0))
               * CASE WHEN COALESCE(c.passed, 0) >= 10
                      THEN 0.9 + 0.2 * c.first_try::numeric / c.passed
                      ELSE 1 END
           )::bigint,
           GREATEST(e.last_at, p.last_at)
    FROM (SELECT e.user_id FROM e UNION SELECT p.user_id FROM p) ids
    LEFT JOIN e ON e.user_id = ids.user_id
    LEFT JOIN p ON p.user_id = ids.user_id
    LEFT JOIN c ON c.user_id = ids.user_id;
$function$;

COMMIT;
