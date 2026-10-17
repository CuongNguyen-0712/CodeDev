import { sql } from "@/lib/db";

// Read-only queries over challenge.code_submissions for the learner's submission history.
// Writes stay in challenge.db.js (createPendingCodingSubmission / finalizeCodingSubmission).
export const codeSubmissionDb = {
    // Every submission of one user for one challenge, newest first, numbered in submit order.
    listCodingSubmissions: async ({ userDbId, challengeId, limit = 50 }) => {
        const query = `
            SELECT
                s.public_id AS id,
                s.status,
                s.score,
                s.language,
                s.submitted_at,
                ROW_NUMBER() OVER (ORDER BY s.submitted_at ASC, s.id ASC)::int AS attempt,
                (s.source_snapshot->>'tests_passed')::int AS tests_passed,
                (s.source_snapshot->>'tests_total')::int AS tests_total,
                (s.source_snapshot->>'execution_time_ms')::int AS execution_time_ms,
                s.source_snapshot->>'error_message' AS error_message
            FROM challenge.code_submissions s
            WHERE s.user_id = $1 AND s.challenge_id = $2::bigint
            ORDER BY s.submitted_at DESC, s.id DESC
            LIMIT $3;
        `;

        return await sql(query, [userDbId, challengeId, limit]);
    },

    // Where the source snapshot of one of the user's own submissions is stored.
    getCodingSubmissionSource: async ({ userDbId, challengeId, submissionPublicId }) => {
        const query = `
            SELECT
                s.public_id AS id,
                s.language,
                s.source_snapshot->>'s3_key' AS s3_key,
                s.source_snapshot->>'s3_bucket' AS s3_bucket
            FROM challenge.code_submissions s
            WHERE s.public_id = $1 AND s.user_id = $2 AND s.challenge_id = $3::bigint
            LIMIT 1;
        `;

        return await sql(query, [submissionPublicId, userDbId, challengeId]);
    },
};
