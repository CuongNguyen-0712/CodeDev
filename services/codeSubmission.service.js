import { challengeDb } from "@/db/challenge.db";
import { codeSubmissionDb } from "@/db/codeSubmission.db";
import { s3, bucketForKey } from "@/lib/s3";
import { ApiError } from "@/lib/error/apiError";

const CODING_TYPES = new Set(["fix_bug", "mini_coding"]);
const HISTORY_LIMIT = 50;

// Same window as PENDING_SUBMISSION_TTL_SEC in challenge.service.js: a submission still
// `pending` after it was never finished, and shows as expired (the attempt stays used).
const PENDING_WINDOW_MS = 15 * 60 * 1000;

async function resolveCodingChallenge({ userId, challengeId }) {
    const id = String(challengeId ?? "");
    if (!/^\d{1,19}$/.test(id)) {
        throw new ApiError("Invalid challenge id", 400);
    }

    const response = await challengeDb.getChallengeContext({ userId, challengeId: id });
    const ctx = response?.rows?.[0];

    if (!ctx) {
        throw new ApiError("Challenge not found", 404);
    }

    if (!ctx.has_access) {
        throw new ApiError("You do not have access to this course", 403, { code: "COURSE_ACCESS_REQUIRED" });
    }

    if (!CODING_TYPES.has(ctx.type)) {
        throw new ApiError("This challenge is not a coding challenge", 400);
    }

    return ctx;
}

function historyItem(row) {
    const submittedAt = row.submitted_at ? new Date(row.submitted_at) : null;
    const expired = row.status === "pending" && submittedAt && Date.now() - submittedAt.getTime() > PENDING_WINDOW_MS;

    return {
        id: row.id,
        attempt: Number(row.attempt) || null,
        status: expired ? "expired" : row.status,
        score: row.score === null || row.score === undefined ? null : Number(row.score),
        language: row.language,
        submittedAt: submittedAt ? submittedAt.toISOString() : null,
        testsPassed: row.tests_passed ?? null,
        testsTotal: row.tests_total ?? null,
        executionTimeMs: row.execution_time_ms ?? null,
        errorMessage: row.error_message || null,
    };
}

export const codeSubmissionService = {
    /** The learner's own submissions for a coding challenge, newest first. */
    getHistory: async ({ userId, challengeId }) => {
        const ctx = await resolveCodingChallenge({ userId, challengeId });
        const response = await codeSubmissionDb.listCodingSubmissions({
            userDbId: ctx.user_db_id,
            challengeId: ctx.id,
            limit: HISTORY_LIMIT,
        });

        return {
            challengeId: ctx.id,
            points: Number(ctx.points) || 0,
            submissions: (response?.rows || []).map(historyItem),
        };
    },

    /** Source code of one of the learner's own submissions (read from its S3 snapshot). */
    getSubmissionCode: async ({ userId, challengeId, submissionId }) => {
        if (!/^sub_[a-z0-9]{26}$/.test(String(submissionId || ""))) {
            throw new ApiError("Invalid submission id", 400);
        }

        const ctx = await resolveCodingChallenge({ userId, challengeId });
        const response = await codeSubmissionDb.getCodingSubmissionSource({
            userDbId: ctx.user_db_id,
            challengeId: ctx.id,
            submissionPublicId: submissionId,
        });
        const row = response?.rows?.[0];

        if (!row) {
            throw new ApiError("Submission not found", 404);
        }

        if (!row.s3_key) {
            throw new ApiError("The code of this submission is not available", 404);
        }

        const code = await s3.getText(row.s3_key, { bucket: row.s3_bucket || bucketForKey(row.s3_key) });

        return { id: row.id, language: row.language, code };
    },
};
