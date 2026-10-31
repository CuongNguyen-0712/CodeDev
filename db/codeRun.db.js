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

    /**
     * What the browser poll needs, without source_snapshot (up to 384 KB). `expired`: still
     * queued/running past its deadline, so the caller only issues the UPDATE when it does something.
     */
    getStatus: async ({ publicId }) => {
        const res = await sql(
            `SELECT cr.public_id, cr.run_type, cr.status, cr.result, cr.error, u.public_id AS user_public_id,
                    ${EXPIRED.replaceAll("status", "cr.status").replaceAll("deadline_at", "cr.deadline_at")} AS expired
             FROM challenge.code_runs cr JOIN identity.users u ON u.id = cr.user_id WHERE cr.public_id = $1;`,
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
        // look full or the runner look stuck for everyone. Two scans, one per partial index
        // (an OR across them read the whole table).
        const res = await sql(
            `WITH active AS (
                 SELECT COUNT(*) FILTER (WHERE ${STILL_VALID})::int AS active,
                        MIN(queued_at) FILTER (WHERE status = 'queued' AND deadline_at > now()) AS oldest_queued_at
                 FROM challenge.code_runs
                 WHERE status IN ('queued', 'running')
             ), done AS (
                 SELECT MAX(finished_at) AS last_done_at,
                        AVG(EXTRACT(EPOCH FROM finished_at - started_at)) FILTER (WHERE started_at IS NOT NULL) AS avg_job_sec
                 FROM challenge.code_runs
                 WHERE status = 'completed' AND finished_at > now() - interval '10 minutes'
             )
             SELECT active.active,
                    COALESCE(EXTRACT(EPOCH FROM now() - active.oldest_queued_at), 0)::int AS oldest_wait_sec,
                    COALESCE(EXTRACT(EPOCH FROM now() - done.last_done_at), 1e9)::bigint AS since_last_done_sec,
                    done.avg_job_sec::float AS avg_job_sec
             FROM active, done;`
        );
        return res.rows[0];
    },

    /**
     * Retention, one batch: manual runs (sample tests) are deleted after `manualDays`; submit runs
     * keep their row (the submission links to it) but drop the code and graded output after
     * `submitDays` (the code is kept with the submission on S3). Returns rows changed.
     */
    purgeOld: async ({ manualDays = 14, submitDays = 30, limit = 1000 } = {}) => {
        const manual = await sql(
            `DELETE FROM challenge.code_runs
             WHERE id IN (
                 SELECT id FROM challenge.code_runs
                 WHERE finished_at < now() - make_interval(days => $1) AND run_type = 'manual'
                 LIMIT $2
             );`,
            [manualDays, limit]
        );
        // shortcut: only runs that finished within the last 90 days are checked, so scrubbed rows
        // are not rescanned forever; a retention job down for 60+ days leaves older ones as they are.
        const submit = await sql(
            `UPDATE challenge.code_runs SET source_snapshot = source_snapshot - 'code', result = NULL
             WHERE id IN (
                 SELECT id FROM challenge.code_runs
                 WHERE finished_at < now() - make_interval(days => $1)
                   AND finished_at > now() - interval '90 days'
                   AND run_type = 'submit'
                   AND (source_snapshot ? 'code' OR result IS NOT NULL)
                 LIMIT $2
             );`,
            [submitDays, limit]
        );
        return manual.rowCount + submit.rowCount;
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
