import { sql } from "@/lib/db";
import { ApiError } from "@/lib/error/apiError";

const ROW = `cr.id, cr.public_id, cr.user_id, cr.challenge_id, cr.run_type, cr.language, cr.source_snapshot, cr.status,
             cr.sandbox, cr.result, cr.error, cr.queued_at, cr.started_at, cr.finished_at, cr.deadline_at, cr.published_at,
             u.public_id AS user_public_id`;

// A queued run is over at its deadline. A running one gets one more full job (lib/challenges/limits.js
// MAX_JOB_MS = 120s, + 30s), so a job that started just before the deadline can still finish.
const RUNNING_GRACE_SEC = 150;
const EXPIRED = `((status = 'queued' AND deadline_at <= now())
                OR (status = 'running' AND deadline_at <= now() - make_interval(secs => ${RUNNING_GRACE_SEC})))`;
const STILL_VALID = `((status = 'queued' AND deadline_at > now())
                OR (status = 'running' AND deadline_at > now() - make_interval(secs => ${RUNNING_GRACE_SEC})))`;
const EXPIRE_SET = `
    status = CASE WHEN status = 'running' THEN 'timeout' ELSE 'cancelled' END,
    error = CASE WHEN status = 'running'
        THEN 'Grading took too long and was stopped. Try again; no attempt was used.'
        ELSE 'Grading did not start in time. Try again; no attempt was used.' END,
    finished_at = now()`;

/**
 * challenge.code_runs as the queue of code executions (migration 20261030_001): one row per Run
 * or Submit, `queued` -> `running` -> `completed` | `failed` | `timeout` | `cancelled`. Every
 * transition is conditional on the current status, so a retried step changes nothing twice.
 */
export const codeRunDb = {
    /** A new queued run. A user with a run still queued or running gets 429 (uq_code_runs_user_active). */
    create: async ({ publicId, userDbId, challengeId, runType, language, code, sandbox, deadlineSec }) => {
        try {
            const res = await sql(
                `INSERT INTO challenge.code_runs (public_id, user_id, challenge_id, run_type, language, source_snapshot, status, sandbox, deadline_at)
                 VALUES ($1, $2, $3::bigint, $4, $5, $6::jsonb, 'queued', $7, now() + make_interval(secs => $8))
                 RETURNING public_id, queued_at, deadline_at;`,
                [publicId, userDbId, challengeId, runType, language, JSON.stringify({ code }), sandbox, deadlineSec]
            );
            return res.rows[0];
        } catch (error) {
            if (error?.code === "23505") {
                throw new ApiError("Your previous run is still being graded. Wait for it to finish, then try again.", 429, { retryAfter: 5 });
            }
            throw error;
        }
    },

    get: async ({ publicId }) => {
        const res = await sql(
            `SELECT ${ROW} FROM challenge.code_runs cr JOIN identity.users u ON u.id = cr.user_id WHERE cr.public_id = $1;`,
            [publicId]
        );
        return res.rows[0] || null;
    },

    /** The submission a submit run created (its public id is derived from the run's). */
    submission: async ({ publicId }) => {
        const res = await sql(
            `SELECT public_id, status, score, submitted_at FROM challenge.code_submissions WHERE public_id = $1;`,
            [publicId]
        );
        return res.rows[0] || null;
    },

    markPublished: async ({ publicId }) => {
        await sql(`UPDATE challenge.code_runs SET published_at = now() WHERE public_id = $1;`, [publicId]);
    },

    /** queued -> running (a retry finds it running already). null: finished, cancelled or expired. */
    start: async ({ publicId }) => {
        const res = await sql(
            `UPDATE challenge.code_runs cr
             SET status = 'running', started_at = COALESCE(cr.started_at, now())
             FROM identity.users u
             WHERE cr.public_id = $1 AND u.id = cr.user_id
               AND ${STILL_VALID.replaceAll("status", "cr.status").replaceAll("deadline_at", "cr.deadline_at")}
             RETURNING ${ROW};`,
            [publicId]
        );
        return res.rows[0] || null;
    },

    /** Ends this run if it is past its deadline (queued: cancelled, running: timeout). */
    expire: async ({ publicId }) => {
        const res = await sql(`UPDATE challenge.code_runs SET ${EXPIRE_SET} WHERE public_id = $1 AND ${EXPIRED};`, [publicId]);
        return res.rowCount > 0;
    },

    /** Ends the user's own expired runs, so the one-active-run index never blocks them on a dead run. */
    expireForUser: async ({ userDbId }) => {
        await sql(`UPDATE challenge.code_runs SET ${EXPIRE_SET} WHERE user_id = $1 AND ${EXPIRED};`, [userDbId]);
    },

    /** Sweeper: ends every expired run. Returns how many. */
    expireAll: async ({ limit = 500 } = {}) => {
        const res = await sql(
            `UPDATE challenge.code_runs SET ${EXPIRE_SET}
             WHERE id IN (SELECT id FROM challenge.code_runs WHERE ${EXPIRED} ORDER BY deadline_at LIMIT $1);`,
            [limit]
        );
        return res.rowCount;
    },

    /** Stores the graded outcome while the run is still running (the finalize step reads it). */
    saveResult: async ({ publicId, result }) => {
        await sql(
            `UPDATE challenge.code_runs SET result = $2::jsonb WHERE public_id = $1 AND status = 'running';`,
            [publicId, JSON.stringify(result)]
        );
    },

    /** Adds keys to the stored result, whatever the status (the submission outcome lands after it completes). */
    mergeResult: async ({ publicId, patch }) => {
        await sql(
            `UPDATE challenge.code_runs SET result = COALESCE(result, '{}'::jsonb) || $2::jsonb WHERE public_id = $1;`,
            [publicId, JSON.stringify(patch)]
        );
    },

    /** Ends a run that is still active. Returns false when it had already ended. */
    finish: async ({ publicId, status, result = null, error = null, sourceSnapshot = null }) => {
        const res = await sql(
            `UPDATE challenge.code_runs
             SET status = $2,
                 result = COALESCE($3::jsonb, result),
                 error = left($4, 1000),
                 source_snapshot = COALESCE($5::jsonb, source_snapshot),
                 finished_at = now()
             WHERE public_id = $1 AND status IN ('queued', 'running');`,
            [publicId, status, result == null ? null : JSON.stringify(result), error, sourceSnapshot == null ? null : JSON.stringify(sourceSnapshot)]
        );
        return res.rowCount > 0;
    },

    /** Runs ahead of this one in the queue (0 = next), for the "queued (position N)" label. */
    position: async ({ publicId }) => {
        const res = await sql(
            `SELECT COUNT(*)::int AS ahead FROM challenge.code_runs
             WHERE status = 'queued' AND queued_at < (SELECT queued_at FROM challenge.code_runs WHERE public_id = $1);`,
            [publicId]
        );
        return res.rows[0]?.ahead ?? 0;
    },

    /**
     * Admission figures: how many runs wait or run, how long the oldest has waited and when a run
     * last finished. A long wait with nothing finishing means the runner is stuck.
     */
    load: async () => {
        // Only runs still within their deadline count: an expired one must not make the queue
        // look full or the runner look stuck for everyone.
        const res = await sql(
            `SELECT
                 COUNT(*) FILTER (WHERE ${STILL_VALID})::int AS active,
                 COALESCE(EXTRACT(EPOCH FROM now() - MIN(queued_at) FILTER (WHERE status = 'queued' AND deadline_at > now())), 0)::int AS oldest_wait_sec,
                 COALESCE(EXTRACT(EPOCH FROM now() - MAX(finished_at) FILTER (WHERE status = 'completed')), 1e9)::bigint AS since_last_done_sec,
                 AVG(EXTRACT(EPOCH FROM finished_at - started_at)) FILTER (WHERE status = 'completed' AND started_at IS NOT NULL)::float AS avg_job_sec
             FROM challenge.code_runs
             WHERE status IN ('queued', 'running') OR finished_at > now() - interval '10 minutes';`
        );
        return res.rows[0];
    },

    /** Queued runs whose Inngest event never went out (or went out minutes ago without a start). */
    listUnpublished: async ({ limit = 100 } = {}) => {
        const res = await sql(
            `SELECT cr.public_id, cr.challenge_id, cr.run_type, cr.sandbox, u.public_id AS user_public_id
             FROM challenge.code_runs cr JOIN identity.users u ON u.id = cr.user_id
             WHERE cr.status = 'queued' AND cr.deadline_at > now()
               AND cr.queued_at < now() - interval '30 seconds'
               AND (cr.published_at IS NULL OR cr.published_at < now() - interval '5 minutes')
             ORDER BY cr.queued_at LIMIT $1;`,
            [limit]
        );
        return res.rows;
    },
};
