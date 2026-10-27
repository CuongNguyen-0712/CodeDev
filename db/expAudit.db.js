import { sql } from "@/lib/db";

/**
 * Read-only queries of the daily EXP audit (docs/master-plan-v1.3-adaptation.md P8,
 * services/expAudit.service.js). Nothing here writes; findings are only reported.
 */
export const expAuditDb = {
    /**
     * Profiles whose cached EXP (profile.info.exp) differs from the ledger total, or whose cached
     * level differs from the level of that ledger total. Ledger rows already hold the clamped
     * amount (public.post_exp), so their sum is the expected EXP; GREATEST(0, ...) is a guard.
     */
    listDrift: async ({ limit }) => {
        return sql(
            `WITH ledger AS (
                SELECT user_id, GREATEST(0, SUM(amount))::bigint AS ledger_exp
                FROM profile.exp_transaction GROUP BY user_id
            ),
            drift AS (
                SELECT i.user_id, i.exp AS cached_exp, i.exp_level AS cached_level,
                       COALESCE(l.ledger_exp, 0) AS ledger_exp,
                       public.level_for_exp(COALESCE(l.ledger_exp, 0)) AS ledger_level
                FROM profile.info i
                LEFT JOIN ledger l ON l.user_id = i.user_id
            )
            SELECT u.public_id AS user_id, u.username, d.cached_exp, d.ledger_exp, d.cached_level, d.ledger_level,
                   COUNT(*) OVER ()::int AS total
            FROM drift d
            JOIN identity.users u ON u.id = d.user_id
            WHERE d.cached_exp IS DISTINCT FROM d.ledger_exp OR d.cached_level IS DISTINCT FROM d.ledger_level
            ORDER BY abs(COALESCE(d.cached_exp, 0) - d.ledger_exp) DESC, u.public_id
            LIMIT $1`,
            [limit]
        );
    },

    /**
     * EXP earned in the last 24 hours per user, against the p99 of EXP earned per user per UTC day
     * over the previous `baselineDays` days. Admin adjustments are not earnings and are left out.
     */
    listDailyOutliers: async ({ baselineDays, limit }) => {
        return sql(
            `WITH baseline AS (
                SELECT percentile_cont(0.99) WITHIN GROUP (ORDER BY day_exp) AS p99, COUNT(*)::int AS samples
                FROM (
                    SELECT user_id, date_trunc('day', created_at AT TIME ZONE 'UTC') AS day, SUM(amount) AS day_exp
                    FROM profile.exp_transaction
                    WHERE source_type <> 'adjustment' AND amount > 0
                      AND created_at >= now() - make_interval(days => $1) AND created_at < now() - interval '24 hours'
                    GROUP BY 1, 2
                ) d
            ),
            recent AS (
                SELECT user_id, SUM(amount)::bigint AS gained, COUNT(*)::int AS transactions
                FROM profile.exp_transaction
                WHERE source_type <> 'adjustment' AND amount > 0 AND created_at >= now() - interval '24 hours'
                GROUP BY user_id
            )
            SELECT b.p99::float AS p99, b.samples,
                   COALESCE(json_agg(json_build_object(
                       'userId', u.public_id, 'username', u.username, 'gained', r.gained, 'transactions', r.transactions
                   ) ORDER BY r.gained DESC) FILTER (WHERE u.id IS NOT NULL), '[]') AS users
            FROM baseline b
            LEFT JOIN LATERAL (
                SELECT * FROM recent WHERE b.p99 IS NOT NULL AND recent.gained > b.p99 ORDER BY gained DESC LIMIT $2
            ) r ON true
            LEFT JOIN identity.users u ON u.id = r.user_id
            GROUP BY b.p99, b.samples`,
            [baselineDays, limit]
        );
    },

    /**
     * Passing code submitted by at least `minUsers` different accounts for the same challenge, with
     * at least one of those passes in the last 24 hours. Grouped by the normalized code hash when
     * the snapshot has one (`code_norm_sha256`, newer submissions), else the exact `code_sha256`.
     */
    listSharedSolutions: async ({ minUsers, limit }) => {
        return sql(
            `WITH passes AS (
                SELECT s.challenge_id, s.user_id, s.submitted_at,
                       COALESCE(s.source_snapshot->>'code_norm_sha256', s.source_snapshot->>'code_sha256') AS code_hash
                FROM challenge.code_submissions s
                WHERE s.status = 'passed'
                  AND s.challenge_id IN (
                      SELECT challenge_id FROM challenge.code_submissions
                      WHERE status = 'passed' AND submitted_at >= LOCALTIMESTAMP - interval '24 hours'
                  )
            )
            SELECT ch.public_id AS challenge_id, ch.title AS challenge_title, c.public_id AS course_id,
                   left(p.code_hash, 12) AS code_hash,
                   COUNT(DISTINCT p.user_id)::int AS accounts,
                   array_agg(DISTINCT u.username ORDER BY u.username) AS usernames,
                   MAX(p.submitted_at) AS last_submitted_at
            FROM passes p
            JOIN challenge.challenges ch ON ch.id = p.challenge_id
            JOIN catalog.course c ON c.id = ch.course_id
            JOIN identity.users u ON u.id = p.user_id
            WHERE p.code_hash IS NOT NULL
            GROUP BY ch.public_id, ch.title, c.public_id, p.code_hash
            HAVING COUNT(DISTINCT p.user_id) >= $1 AND MAX(p.submitted_at) >= LOCALTIMESTAMP - interval '24 hours'
            ORDER BY COUNT(DISTINCT p.user_id) DESC, MAX(p.submitted_at) DESC
            LIMIT $2`,
            [minUsers, limit]
        );
    },
};
