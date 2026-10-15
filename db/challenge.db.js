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

// Credits challenge points once per (user, challenge). The advisory lock
// serialises concurrent submissions so the NOT EXISTS check cannot race.
async function awardChallengePoints(client, { userDbId, challengeId, amount }) {
    if (!amount || amount <= 0) return 0;

    await client.query(
        `SELECT pg_advisory_xact_lock(hashtext('challenge-award:' || $1::text || ':' || $2::text))`,
        [userDbId, challengeId]
    );

    const inserted = await client.query(
        `INSERT INTO profile.point_transaction (user_id, action, amount, source_type, source_id)
         SELECT $1, 'credit', $3, 'challenge', $2
         WHERE NOT EXISTS (
             SELECT 1 FROM profile.point_transaction
             WHERE user_id = $1 AND source_type = 'challenge' AND source_id = $2
         )
         RETURNING amount;`,
        [userDbId, challengeId, amount]
    );

    if (inserted.rowCount === 0) return 0;

    await client.query(
        `UPDATE profile.info SET points = COALESCE(points, 0) + $2 WHERE user_id = $1;`,
        [userDbId, amount]
    );

    return amount;
}

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
                ch.lesson_id::text AS lesson_id,
                u.id::text AS user_db_id,
                h.status AS lesson_status
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

    // rows: [{ questionId, optionId, isCorrect }]
    saveQuizAttempt: async ({ userDbId, challengeId, rows, passed, points }) => {
        return await withTransaction(async (client) => {
            if (rows.length > 0) {
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
            }

            const awardedPoints = passed
                ? await awardChallengePoints(client, { userDbId, challengeId, amount: points })
                : 0;

            return { awardedPoints };
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

    countCodingAttempts: async ({ userDbId, challengeId }) => {
        return await sql(
            `SELECT COUNT(*)::int AS attempts FROM challenge.code_submissions WHERE user_id = $1 AND challenge_id = $2::bigint;`,
            [userDbId, challengeId]
        );
    },

    // Persists an already-uploaded source snapshot (asset) and its grading in one transaction.
    createCodingSubmission: async (data) => {
        const {
            userDbId,
            challengeId,
            language,
            asset,
            submission,
            run,
            testResults,
            workspace,
            passed,
            points,
            maxAttempts,
        } = data;

        return await withTransaction(async (client) => {
            if (maxAttempts) {
                // Serialise submissions per (user, challenge) so parallel requests cannot exceed the limit.
                await client.query(
                    `SELECT pg_advisory_xact_lock(hashtext('coding-attempt:' || $1::text || ':' || $2::text))`,
                    [userDbId, challengeId]
                );
                const attemptsRes = await client.query(
                    `SELECT COUNT(*)::int AS attempts FROM challenge.code_submissions WHERE user_id = $1 AND challenge_id = $2::bigint;`,
                    [userDbId, challengeId]
                );
                if ((attemptsRes.rows[0]?.attempts || 0) >= maxAttempts) {
                    throw new ApiError("You have used all attempts for this challenge", 429);
                }
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
                 VALUES ($1, $2, $3::bigint, $4, $5::jsonb, $6, $7)
                 RETURNING id, public_id, status, score, submitted_at;`,
                [submission.publicId, userDbId, challengeId, language, JSON.stringify(submission.snapshot), submission.status, submission.score]
            );
            const submissionRow = submissionRes.rows[0];

            const runRes = await client.query(
                `INSERT INTO challenge.code_runs (public_id, user_id, challenge_id, submission_id, run_type, language, source_snapshot, status, started_at, finished_at)
                 VALUES ($1, $2, $3::bigint, $4, 'submit', $5, $6::jsonb, 'completed', $7, now())
                 RETURNING id;`,
                [run.publicId, userDbId, challengeId, submissionRow.id, language, JSON.stringify({ asset_id: String(assetId), s3_key: asset.objectKey }), run.startedAt]
            );
            const runId = runRes.rows[0].id;

            await client.query(
                `INSERT INTO challenge.code_run_results (run_id, stdout, stderr, exit_code, execution_time_ms, passed_tests, total_tests, score)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
                [runId, run.stdout, run.stderr, passed ? 0 : 1, run.executionTimeMs, run.passedTests, run.totalTests, submission.score]
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

            const workspaceRes = await client.query(
                `INSERT INTO challenge.coding_workspaces (public_id, challenge_id, user_id, language, updated_at)
                 VALUES ($1, $2::bigint, $3, $4, now())
                 ON CONFLICT (challenge_id, user_id)
                 DO UPDATE SET language = EXCLUDED.language, updated_at = now()
                 RETURNING id, public_id;`,
                [workspace.publicId, challengeId, userDbId, language]
            );
            const workspaceRow = workspaceRes.rows[0];

            await client.query(
                `INSERT INTO challenge.coding_workspace_files (workspace_id, file_path, asset_id, version, file_size)
                 VALUES ($1, $2, $3, 1, $4)
                 ON CONFLICT (workspace_id, file_path)
                 DO UPDATE SET
                     asset_id = EXCLUDED.asset_id,
                     file_size = EXCLUDED.file_size,
                     version = challenge.coding_workspace_files.version + 1,
                     created_at = now();`,
                [workspaceRow.id, workspace.filePath, assetId, asset.size]
            );

            const awardedPoints = passed
                ? await awardChallengePoints(client, { userDbId, challengeId, amount: points })
                : 0;

            return {
                submission: submissionRow,
                workspaceId: workspaceRow.public_id,
                awardedPoints,
            };
        });
    },
};
