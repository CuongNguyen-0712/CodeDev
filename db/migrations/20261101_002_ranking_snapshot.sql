-- =============================================================================
-- 20261101_002_ranking_snapshot.sql
--
-- docs/performance-plan.md, Phase 2: leaderboards stop aggregating both ledgers per request.
--   1. ranking_scores(_since, _user_id): the optional user filter scores one learner from the
--      per-user ledger indexes (the viewer's own standing stays live).
--   2. profile.ranking_snapshot: every learner's scores for 'all' and '30d', refreshed at most
--      every few minutes by refresh_ranking_snapshot() (called by services/ranking.service.js).
--      Top lists, positions and listed tiers read it through the per-board indexes.
-- =============================================================================

BEGIN;

-- 1. optional user filter (a new parameter needs a new signature)
DROP FUNCTION IF EXISTS public.ranking_scores(timestamp with time zone);

CREATE OR REPLACE FUNCTION public.ranking_scores(_since timestamp with time zone DEFAULT NULL::timestamp with time zone, _user_id bigint DEFAULT NULL::bigint)
 RETURNS TABLE(user_id bigint, exp bigint, points_earned bigint, challenges_passed integer, challenges_first_try integer, overall bigint, last_at timestamp with time zone)
 LANGUAGE sql
 STABLE
AS $function$
    WITH e AS (
        SELECT t.user_id, GREATEST(SUM(t.amount), 0)::bigint AS exp, MAX(t.created_at) AS last_at
        FROM profile.exp_transaction t
        WHERE (_since IS NULL OR t.created_at >= _since)
          AND (_user_id IS NULL OR t.user_id = _user_id)
        GROUP BY t.user_id
    ),
    p AS (
        SELECT t.user_id, SUM(t.amount)::bigint AS points, MAX(t.created_at) AS last_at
        FROM profile.point_transaction t
        WHERE t.action = 'credit' AND t.entry_type = 'earned'
          AND (_since IS NULL OR t.created_at >= _since)
          AND (_user_id IS NULL OR t.user_id = _user_id)
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
          AND (_user_id IS NULL OR t.user_id = _user_id)
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

-- 2. snapshot (now() is taken at each refresh)
CREATE MATERIALIZED VIEW IF NOT EXISTS profile.ranking_snapshot AS
    SELECT 'all'::varchar(10) AS period, s.* FROM public.ranking_scores(NULL) s
    UNION ALL
    SELECT '30d'::varchar(10) AS period, s.* FROM public.ranking_scores(now() - interval '30 days') s;

-- Unique index: required by REFRESH ... CONCURRENTLY (readers never wait for a refresh).
CREATE UNIQUE INDEX IF NOT EXISTS uq_ranking_snapshot ON profile.ranking_snapshot (period, user_id);
CREATE INDEX IF NOT EXISTS idx_ranking_snapshot_overall ON profile.ranking_snapshot (period, overall DESC, last_at, user_id);
CREATE INDEX IF NOT EXISTS idx_ranking_snapshot_exp ON profile.ranking_snapshot (period, exp DESC, last_at, user_id);
CREATE INDEX IF NOT EXISTS idx_ranking_snapshot_points ON profile.ranking_snapshot (period, points_earned DESC, last_at, user_id);

-- One refresh at a time: a caller that finds one running skips (returns false).
CREATE OR REPLACE FUNCTION public.refresh_ranking_snapshot()
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NOT pg_try_advisory_xact_lock(hashtext('profile.ranking_snapshot')) THEN
        RETURN false;
    END IF;
    REFRESH MATERIALIZED VIEW CONCURRENTLY profile.ranking_snapshot;
    RETURN true;
END;
$function$;

COMMIT;
