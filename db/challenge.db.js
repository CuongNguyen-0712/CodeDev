import { sql, dbPool } from "@/lib/db";
import { ApiError } from "@/lib/error/apiError";

async function withTransaction(callback) {
    const client = await dbPool.connect();

    try {
        await client.query("BEGIN");
        const result = await callback(client);

        try {
            await client.query("COMMIT");
        } catch (error) {
            // The commit may or may not have been applied (e.g. connection lost before the ack).
            error.commitUncertain = true;
            throw error;
        }

        return result;
    } catch (error) {
        await client.query("ROLLBACK").catch(() => { });
        throw error;
    } finally {
        client.release();
    }
}

// Credits a passed challenge once per (user, challenge): points through public.post_points and EXP
// through public.award_challenge_exp (rule from the challenge type/difficulty, times expMultiplier).
// Both writers lock the profile row and are idempotent per source; points first, then EXP.
// Hint level 3 (a worked example) opened before this first pass halves the EXP ("assisted");
// points are not affected.
async function awardChallengeRewards(client, { userDbId, challengeId, amount, expMultiplier = 1 }) {
    let awardedPoints = 0;
    if (amount > 0) {
        const { rows } = await client.query(
            `SELECT created FROM public.post_points($1::bigint, 'credit', 'earned', $3::bigint, 'challenge', $2::bigint)`,
            [userDbId, challengeId, amount]
        );
        if (rows[0]?.created) awardedPoints = amount;
    }

    const { rows: expRows } = await client.query(
        `SELECT e.awarded, e.exp_after, e.previous_level, e.new_level
         FROM (
             SELECT EXISTS (
                 SELECT 1 FROM challenge.hint_views hv
                 WHERE hv.user_id = $1::bigint AND hv.challenge_id = $2::bigint AND hv.level = 3
             ) AS assisted
         ) a
         CROSS JOIN LATERAL public.award_challenge_exp(
             $1::bigint, $2::bigint,
             $3::numeric * CASE WHEN a.assisted THEN 0.5 ELSE 1 END,
             CASE WHEN a.assisted THEN '{"assisted": true}'::jsonb END
         ) e`,
        [userDbId, challengeId, expMultiplier]
    );
    const exp = expRows[0] || {};

    // A pass may complete an achievement (profile.achievement); its EXP joins this reward.
    const { rows: earned } = await client.query(
        `SELECT code, title, awarded, exp_after, new_level FROM public.award_achievements($1::bigint)`,
        [userDbId]
    );
    const last = earned[earned.length - 1];

    return {
        awardedPoints,
        awardedExp: (Number(exp.awarded) || 0) + earned.reduce((sum, a) => sum + (Number(a.awarded) || 0), 0),
        exp: Number(last?.exp_after ?? exp.exp_after) || 0,
        level: Number(last?.new_level ?? exp.new_level) || 1,
        previousLevel: Number(exp.previous_level) || 1,
        achievements: earned.map((a) => ({ code: a.code, title: a.title, exp: Number(a.awarded) || 0 })),
    };
}

const NO_REWARD = { awardedPoints: 0, awardedExp: 0 };

export const challengeDb = {
    // Challenge row + the caller's access state for the owning lesson.
    getChallengeContext: async ({ userId, challengeId }) => {
        const query = `
            SELECT
                ch.id::text AS id,
                ch.public_id,
                ch.type,
                ch.title,
                ch.status,
                COALESCE(ch.points, 0) AS points,
                ch.quiz_display_count,
                ch.lesson_id::text AS lesson_id,
                u.id::text AS user_db_id,
                h.status AS lesson_status,
                -- Entitlement (single source of truth for access) + active enrolment.
                (public.has_course_access(u.id, ch.course_id) AND EXISTS (
                    SELECT 1 FROM learning.register r
                    WHERE r.user_id = u.id AND r.course_id = ch.course_id AND r.is_deleted = false
                )) AS has_access
            FROM challenge.challenges ch
            JOIN identity.users u ON u.public_id = $1
            LEFT JOIN learning.history h
                ON h.lesson_id = ch.lesson_id
               AND h.course_id = ch.course_id
               AND h.user_id = u.id
            WHERE ch.id = $2::bigint
              AND ch.is_deleted = false
            LIMIT 1;
        `;

        return await sql(query, [userId, challengeId]);
    },

    getQuizAnswerKey: async ({ challengeId }) => {
        const query = `
            SELECT
                q.id::text AS question_id,
                COALESCE(q.points, 0) AS points,
                q.type AS question_type,
                q.explanation,
                COALESCE(json_agg(o.id::text ORDER BY o.id) FILTER (WHERE o.is_correct = true), '[]'::json) AS correct_options,
                COALESCE(json_agg(o.id::text ORDER BY o.id) FILTER (WHERE o.id IS NOT NULL), '[]'::json) AS all_options
            FROM challenge.questions q
            LEFT JOIN challenge.question_options o ON o.question_id = q.id
            WHERE q.challenge_id = $1::bigint
            GROUP BY q.id, q.points, q.type, q.explanation, q.order_index
            ORDER BY q.order_index NULLS LAST, q.id;
        `;

        return await sql(query, [challengeId]);
    },

    /**
     * Every quiz attempt of a user. One attempt = one INSERT statement, so its rows share
     * `created_at`; `attempt_no` numbers them oldest first. `wait_seconds` is the cooldown left
     * before the next attempt, computed by the database clock.
     */
    getQuizAttempts: async ({ userDbId, challengeId, cooldownSec }) => {
        const query = `
            WITH mine AS (
                SELECT qs.question_id, qs.question_option_id, qs.created_at
                FROM challenge.question_submissions qs
                JOIN challenge.questions q ON q.id = qs.question_id
                WHERE qs.user_id = $1 AND q.challenge_id = $2::bigint
            ),
            attempts AS (
                SELECT created_at, ROW_NUMBER() OVER (ORDER BY created_at)::int AS attempt_no
                FROM (SELECT DISTINCT created_at FROM mine) d
            )
            SELECT
                m.question_id::text,
                m.question_option_id::text AS option_id,
                a.attempt_no,
                m.created_at,
                GREATEST(0, CEIL(EXTRACT(EPOCH FROM (
                    (SELECT MAX(created_at) FROM mine) + make_interval(secs => $3) - LOCALTIMESTAMP
                ))))::int AS wait_seconds
            FROM mine m
            JOIN attempts a ON a.created_at = m.created_at
            ORDER BY a.attempt_no, m.question_id, m.question_option_id;
        `;

        return await sql(query, [userDbId, challengeId, cooldownSec]);
    },

    // rows: [{ questionId, optionId, isCorrect }]
    // Enforces `maxAttempts` and the cooldown between attempts per (user, quiz) under an
    // advisory lock, so parallel submits cannot slip through.
    saveQuizAttempt: async ({ userDbId, challengeId, rows, passed, points, maxAttempts, cooldownSec }) => {
        return await withTransaction(async (client) => {
            await client.query(
                `SELECT pg_advisory_xact_lock(hashtext('quiz-attempt:' || $1::text || ':' || $2::text))`,
                [userDbId, challengeId]
            );

            const attemptsRes = await client.query(
                `SELECT
                     COUNT(DISTINCT qs.created_at)::int AS attempts,
                     GREATEST(0, CEIL(EXTRACT(EPOCH FROM (MAX(qs.created_at) + make_interval(secs => $3) - LOCALTIMESTAMP))))::int AS wait_seconds
                 FROM challenge.question_submissions qs
                 JOIN challenge.questions q ON q.id = qs.question_id
                 WHERE qs.user_id = $1 AND q.challenge_id = $2::bigint;`,
                [userDbId, challengeId, cooldownSec]
            );
            const { attempts = 0, wait_seconds: waitSeconds = 0 } = attemptsRes.rows[0] || {};

            if (attempts >= maxAttempts) {
                throw new ApiError("You have used all attempts for this quiz", 409);
            }
            if (waitSeconds > 0) {
                throw new ApiError(`Please wait ${waitSeconds} more second${waitSeconds === 1 ? "" : "s"} before your next attempt`, 429, { retryAfter: waitSeconds });
            }

            await client.query(
                `INSERT INTO challenge.question_submissions (user_id, question_id, question_option_id, is_correct)
                 SELECT $1, q_id, o_id, ok
                 FROM unnest($2::bigint[], $3::bigint[], $4::boolean[]) AS t(q_id, o_id, ok);`,
                [
                    userDbId,
                    rows.map(r => r.questionId),
                    rows.map(r => r.optionId),
                    rows.map(r => r.isCorrect),
                ]
            );

            // EXP: full on the first attempt, half when passed on a later one (attempts = earlier attempts).
            return passed
                ? await awardChallengeRewards(client, { userDbId, challengeId, amount: points, expMultiplier: attempts === 0 ? 1 : 0.5 })
                : NO_REWARD;
        });
    },

    // Challenges a learner must pass before a lesson can be completed (published, open,
    // supported types), with the coding pass flag; quiz passes are graded by the service.
    getLessonChallenges: async ({ userId, lessonId }) => {
        const query = `
            SELECT
                ch.id::text AS id,
                ch.type,
                ch.title,
                ch.quiz_display_count,
                u.id::text AS user_db_id,
                CASE WHEN ch.type IN ('fix_bug', 'mini_coding') THEN EXISTS (
                    SELECT 1 FROM challenge.code_submissions s
                    WHERE s.user_id = u.id AND s.challenge_id = ch.id AND s.status = 'passed'
                ) END AS coding_passed,
                CASE WHEN ch.type IN ('fix_bug', 'mini_coding') THEN (
                    SELECT COUNT(*)::int FROM challenge.code_submissions s
                    WHERE s.user_id = u.id AND s.challenge_id = ch.id
                ) END AS coding_attempts,
                cfg.max_attempts AS coding_max_attempts
            FROM challenge.challenges ch
            JOIN identity.users u ON u.public_id = $1
            LEFT JOIN challenge.coding_configs cfg ON cfg.challenge_id = ch.id
            WHERE ch.lesson_id = $2::bigint
              AND ch.is_deleted = false
              AND ch.is_published = true
              AND ch.status = 'open'
              AND ch.type IN ('quiz', 'fix_bug', 'mini_coding')
            ORDER BY ch.id;
        `;

        return await sql(query, [userId, lessonId]);
    },

    /**
     * Opens hint `level` for a learner and returns its text. Levels open in order: level n needs
     * level n-1 opened first. Opening again is a no-op (the first opened_at is kept).
     * Returns null when the challenge has no such hint, { locked: true } when out of order.
     */
    openHint: async ({ userDbId, challengeId, level }) => {
        return await withTransaction(async (client) => {
            const { rows } = await client.query(
                `SELECT h.body,
                        ($3::smallint = 1 OR EXISTS (
                            SELECT 1 FROM challenge.hint_views hv
                            WHERE hv.user_id = $1::bigint AND hv.challenge_id = $2::bigint AND hv.level = $3::smallint - 1
                        )) AS unlocked
                 FROM challenge.challenge_hints h
                 WHERE h.challenge_id = $2::bigint AND h.level = $3::smallint`,
                [userDbId, challengeId, level]
            );
            const hint = rows[0];
            if (!hint) return null;
            if (!hint.unlocked) return { locked: true };

            await client.query(
                `INSERT INTO challenge.hint_views (user_id, challenge_id, level)
                 VALUES ($1::bigint, $2::bigint, $3::smallint)
                 ON CONFLICT DO NOTHING`,
                [userDbId, challengeId, level]
            );
            return { body: hint.body };
        });
    },

    getCodingDefinition: async ({ challengeId }) => {
        const query = `
            SELECT
                COALESCE(cfg.execution_mode, 'browser') AS execution_mode,
                COALESCE(cfg.time_limit_ms, 2000) AS time_limit_ms,
                cfg.memory_limit_mb,
                cfg.max_attempts,
                COALESCE(cfg.scoring_mode, 'all_or_nothing') AS scoring_mode,
                COALESCE((
                    SELECT json_agg(json_build_object(
                        'role', cf.file_role,
                        'language', cf.language,
                        'file_path', cf.file_path,
                        'object_key', a.object_key
                    ) ORDER BY cf.id)
                    FROM challenge.coding_files cf
                    LEFT JOIN storage.assets a ON a.id = cf.asset_id
                    WHERE cf.challenge_id = ch.id
                ), '[]'::json) AS files,
                COALESCE((
                    SELECT json_agg(json_build_object(
                        'id', tc.id::text,
                        'name', tc.name,
                        'input', tc.input_data,
                        'expected', tc.expected_output,
                        'score', tc.score,
                        'is_sample', tc.is_sample,
                        'is_hidden', tc.is_hidden
                    ) ORDER BY tc.sort_order, tc.id)
                    FROM challenge.challenge_test_cases tc
                    WHERE tc.challenge_id = ch.id
                ), '[]'::json) AS test_cases
            FROM challenge.challenges ch
            LEFT JOIN challenge.coding_configs cfg ON cfg.challenge_id = ch.id
            WHERE ch.id = $1::bigint;
        `;

        return await sql(query, [challengeId]);
    },

    // Latest server-side workspace snapshot + submission summary for a user.
    getCodingWorkspace: async ({ userDbId, challengeId }) => {
        const query = `
            SELECT
                w.public_id AS workspace_id,
                w.language,
                COALESCE(w.updated_at, w.created_at) AS updated_at,
                wf.file_path,
                wf.version,
                a.object_key,
                (
                    SELECT json_build_object(
                        'id', s.public_id,
                        'status', s.status,
                        'score', s.score,
                        'submitted_at', s.submitted_at,
                        'tests_passed', s.source_snapshot->'tests_passed',
                        'tests_total', s.source_snapshot->'tests_total'
                    )
                    FROM challenge.code_submissions s
                    WHERE s.user_id = $1 AND s.challenge_id = $2::bigint
                    ORDER BY s.submitted_at DESC
                    LIMIT 1
                ) AS last_submission,
                (
                    SELECT COUNT(*)::int
                    FROM challenge.code_submissions s
                    WHERE s.user_id = $1 AND s.challenge_id = $2::bigint
                ) AS attempts,
                EXISTS (
                    SELECT 1 FROM challenge.code_submissions s
                    WHERE s.user_id = $1 AND s.challenge_id = $2::bigint AND s.status = 'passed'
                ) AS has_passed
            FROM (SELECT 1) AS seed
            LEFT JOIN challenge.coding_workspaces w
                ON w.user_id = $1 AND w.challenge_id = $2::bigint
            LEFT JOIN LATERAL (
                SELECT * FROM challenge.coding_workspace_files f
                WHERE f.workspace_id = w.id
                ORDER BY f.created_at DESC
                LIMIT 1
            ) wf ON true
            LEFT JOIN storage.assets a ON a.id = wf.asset_id;
        `;

        return await sql(query, [userDbId, challengeId]);
    },

    /**
     * Step 1 of a submission: counts as an attempt as soon as it is written. Stores the
     * already-uploaded source snapshot and a `pending` submission, and refreshes the workspace.
     */
    createPendingCodingSubmission: async (data) => {
        const { userDbId, challengeId, language, asset, submission, workspace, maxAttempts } = data;

        return await withTransaction(async (client) => {
            // Serialise submissions per (user, challenge) so parallel requests cannot exceed the limit.
            await client.query(
                `SELECT pg_advisory_xact_lock(hashtext('coding-attempt:' || $1::text || ':' || $2::text))`,
                [userDbId, challengeId]
            );
            const attemptsRes = await client.query(
                `SELECT COUNT(*)::int AS attempts FROM challenge.code_submissions WHERE user_id = $1 AND challenge_id = $2::bigint;`,
                [userDbId, challengeId]
            );
            const attempts = attemptsRes.rows[0]?.attempts || 0;
            if (attempts >= maxAttempts) {
                throw new ApiError("You have used all attempts for this challenge", 429);
            }

            const assetRes = await client.query(
                `INSERT INTO storage.assets (public_id, provider, object_key, resource_type, mine_type, file_size, original_name)
                 VALUES ($1, 's3', $2, 'raw', $3, $4, $5)
                 RETURNING id;`,
                [asset.publicId, asset.objectKey, asset.mimeType, asset.size, asset.originalName]
            );
            const assetId = assetRes.rows[0].id;

            const submissionRes = await client.query(
                `INSERT INTO challenge.code_submissions (public_id, user_id, challenge_id, language, source_snapshot, status, score)
                 VALUES ($1, $2, $3::bigint, $4, $5::jsonb, 'pending', NULL)
                 RETURNING id, public_id, status, submitted_at;`,
                [submission.publicId, userDbId, challengeId, language, JSON.stringify({ ...submission.snapshot, asset_id: String(assetId) })]
            );

            const workspaceRes = await client.query(
                `INSERT INTO challenge.coding_workspaces (public_id, challenge_id, user_id, language, updated_at)
                 VALUES ($1, $2::bigint, $3, $4, now())
                 ON CONFLICT (challenge_id, user_id)
                 DO UPDATE SET language = EXCLUDED.language, updated_at = now()
                 RETURNING id;`,
                [workspace.publicId, challengeId, userDbId, language]
            );

            await client.query(
                `INSERT INTO challenge.coding_workspace_files (workspace_id, file_path, asset_id, version, file_size)
                 VALUES ($1, $2, $3, 1, $4)
                 ON CONFLICT (workspace_id, file_path)
                 DO UPDATE SET
                     asset_id = EXCLUDED.asset_id,
                     file_size = EXCLUDED.file_size,
                     version = challenge.coding_workspace_files.version + 1,
                     created_at = now();`,
                [workspaceRes.rows[0].id, workspace.filePath, assetId, asset.size]
            );

            return { submission: submissionRes.rows[0], attempts: attempts + 1 };
        });
    },

    /**
     * Step 2: grades a `pending` submission exactly once and credits the challenge points
     * (once per user and challenge, however many submissions pass). A queued run (`run.existing`)
     * is completed in place; otherwise a completed code_runs row is inserted.
     */
    finalizeCodingSubmission: async (data) => {
        const { userDbId, challengeId, submissionPublicId, language, status, score, snapshot, run, testResults, passed, points } = data;

        return await withTransaction(async (client) => {
            const pendingRes = await client.query(
                `SELECT id, source_snapshot
                 FROM challenge.code_submissions
                 WHERE public_id = $1 AND user_id = $2 AND challenge_id = $3::bigint AND status = 'pending'
                 FOR UPDATE;`,
                [submissionPublicId, userDbId, challengeId]
            );
            const pending = pendingRes.rows[0];
            if (!pending) {
                throw new ApiError("This submission was already graded or does not exist", 409);
            }

            const submissionRes = await client.query(
                `UPDATE challenge.code_submissions
                 SET status = $2, score = $3, source_snapshot = source_snapshot || $4::jsonb
                 WHERE id = $1
                 RETURNING id, public_id, status, score, submitted_at;`,
                [pending.id, status, score, JSON.stringify(snapshot)]
            );
            const submissionRow = submissionRes.rows[0];

            const runSnapshot = JSON.stringify({ asset_id: pending.source_snapshot?.asset_id ?? null, s3_key: pending.source_snapshot?.s3_key ?? null });
            const runRes = run.existing
                ? await client.query(
                    `UPDATE challenge.code_runs
                     SET submission_id = $2, source_snapshot = $3::jsonb, status = 'completed', finished_at = now()
                     WHERE public_id = $1 AND status IN ('queued', 'running')
                     RETURNING id;`,
                    [run.publicId, submissionRow.id, runSnapshot]
                )
                : await client.query(
                    `INSERT INTO challenge.code_runs (public_id, user_id, challenge_id, submission_id, run_type, language, source_snapshot, status, started_at, finished_at)
                     VALUES ($1, $2, $3::bigint, $4, 'submit', $5, $6::jsonb, 'completed', $7, now())
                     RETURNING id;`,
                    [run.publicId, userDbId, challengeId, submissionRow.id, language, runSnapshot, run.startedAt]
                );
            const runId = runRes.rows[0]?.id;
            if (!runId) throw new ApiError("This run was already finished", 409);

            await client.query(
                `INSERT INTO challenge.code_run_results (run_id, stdout, stderr, exit_code, execution_time_ms, passed_tests, total_tests, score)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
                [runId, run.stdout, run.stderr, passed ? 0 : 1, run.executionTimeMs, run.passedTests, run.totalTests, score]
            );

            if (testResults.length > 0) {
                await client.query(
                    `INSERT INTO challenge.code_run_test_results (run_id, test_case_id, status, execution_time_ms, score)
                     SELECT $1, tc_id, st, ms, sc
                     FROM unnest($2::bigint[], $3::varchar[], $4::int[], $5::numeric[]) AS t(tc_id, st, ms, sc);`,
                    [
                        runId,
                        testResults.map(t => t.testCaseId),
                        testResults.map(t => t.status),
                        testResults.map(t => t.timeMs),
                        testResults.map(t => t.score),
                    ]
                );
            }

            const rewards = passed
                ? await awardChallengeRewards(client, { userDbId, challengeId, amount: points })
                : NO_REWARD;

            return { submission: submissionRow, ...rewards };
        });
    },
};
