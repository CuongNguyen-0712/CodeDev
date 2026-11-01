import { sql } from "@/lib/db";

/** Admin view of challenge.code_runs (docs/admin-panel-plan.md 04). Reads only; cancelling goes through codeRunDb.finish. */

const TAB_FILTERS = {
    active: "cr.status IN ('queued', 'running')",
    failed: "cr.status = 'failed'",
    timeout: "cr.status IN ('timeout', 'cancelled')",
    all: "TRUE",
};

export const RUN_TABS = Object.keys(TAB_FILTERS);

export const adminRunDb = {
    list: async ({ tab = "active", language = null, runType = null, userId = null, cursor = null, limit = 50 }) => {
        const params = [];
        const where = [TAB_FILTERS[tab] || TAB_FILTERS.all];
        if (language) { params.push(language); where.push(`cr.language = $${params.length}`); }
        if (runType) { params.push(runType); where.push(`cr.run_type = $${params.length}`); }
        if (userId) { params.push(userId); where.push(`u.public_id = $${params.length}`); }
        // Default window: one week, so "All" stays an index range scan.
        if (tab !== "active") where.push(`cr.queued_at > now() - interval '7 days'`);
        if (cursor) {
            params.push(cursor.at, cursor.id);
            where.push(`(cr.queued_at, cr.id) < ($${params.length - 1}::timestamptz, $${params.length}::bigint)`);
        }
        params.push(limit);

        return sql(
            `SELECT cr.public_id AS id, cr.status, cr.run_type, cr.language, cr.sandbox, cr.queued_at, cr.started_at, cr.finished_at,
                    cr.deadline_at, cr.error,
                    EXTRACT(EPOCH FROM COALESCE(cr.started_at, cr.finished_at, now()) - cr.queued_at)::int AS waited_sec,
                    CASE WHEN cr.started_at IS NOT NULL THEN EXTRACT(EPOCH FROM COALESCE(cr.finished_at, now()) - cr.started_at)::int END AS ran_sec,
                    (SELECT COUNT(*) FROM jsonb_array_elements(COALESCE(cr.result->'graded', '[]')) t WHERE t->>'status' = 'passed')::int AS tests_passed,
                    jsonb_array_length(COALESCE(cr.result->'graded', '[]'))::int AS tests_total,
                    u.public_id AS user_id, u.username, ch.title AS challenge_title,
                    cr.queued_at::text AS cursor_at, cr.id::text AS cursor_id
             FROM challenge.code_runs cr
             JOIN identity.users u ON u.id = cr.user_id
             JOIN challenge.challenges ch ON ch.id = cr.challenge_id
             WHERE ${where.join(" AND ")}
             ORDER BY cr.queued_at DESC, cr.id DESC
             LIMIT $${params.length}`,
            params
        );
    },

    tabCounts: async () => (await sql(
        `SELECT COUNT(*) FILTER (WHERE status IN ('queued', 'running'))::int AS active,
                COUNT(*) FILTER (WHERE status = 'failed' AND queued_at > now() - interval '7 days')::int AS failed,
                COUNT(*) FILTER (WHERE status IN ('timeout', 'cancelled') AND queued_at > now() - interval '7 days')::int AS timeout,
                COUNT(*) FILTER (WHERE queued_at > now() - interval '7 days')::int AS "all"
         FROM challenge.code_runs
         WHERE status IN ('queued', 'running') OR queued_at > now() - interval '7 days'`
    )).rows[0],

    /** The queue per sandbox: waiting, running, the oldest wait and the average run of the last 10 minutes. */
    queue: async () => (await sql(
        `SELECT COALESCE(sandbox, 'default') AS sandbox,
                COUNT(*) FILTER (WHERE status = 'queued' AND deadline_at > now())::int AS queued,
                COUNT(*) FILTER (WHERE status = 'running')::int AS running,
                COALESCE(EXTRACT(EPOCH FROM now() - MIN(queued_at) FILTER (WHERE status = 'queued' AND deadline_at > now())), 0)::int AS oldest_wait_sec,
                AVG(EXTRACT(EPOCH FROM finished_at - started_at)) FILTER (WHERE status = 'completed' AND finished_at > now() - interval '10 minutes')::float AS avg_run_sec,
                COUNT(*) FILTER (WHERE status IN ('queued', 'running') AND deadline_at < now())::int AS expired
         FROM challenge.code_runs
         WHERE status IN ('queued', 'running') OR finished_at > now() - interval '10 minutes'
         GROUP BY COALESCE(sandbox, 'default')
         ORDER BY 1`
    )).rows,

    detail: async ({ runId }) => (await sql(
        `SELECT cr.public_id AS id, cr.status, cr.run_type, cr.language, cr.sandbox, cr.queued_at, cr.started_at, cr.finished_at,
                cr.deadline_at, cr.published_at, cr.error, cr.result, cr.stdin,
                cr.source_snapshot IS NOT NULL AND cr.source_snapshot ? 'code' AS has_source,
                u.public_id AS user_id, u.username, ch.public_id AS challenge_id, ch.title AS challenge_title,
                c.public_id AS course_id, c.title AS course_title
         FROM challenge.code_runs cr
         JOIN identity.users u ON u.id = cr.user_id
         JOIN challenge.challenges ch ON ch.id = cr.challenge_id
         LEFT JOIN catalog.course c ON c.id = ch.course_id
         WHERE cr.public_id = $1`,
        [runId]
    )).rows[0] || null,

    source: async ({ runId }) => (await sql(
        `SELECT cr.source_snapshot->>'code' AS code FROM challenge.code_runs cr WHERE cr.public_id = $1`,
        [runId]
    )).rows[0]?.code ?? null,
};
