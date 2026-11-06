import { sql } from "@/lib/db";
import { LOW_RATING } from "@/lib/ratingRules";

// Staff: anyone holding a role of instructor rank (30) or above; left out of the learner figures.
const NOT_STAFF = (userColumn) => `NOT EXISTS (SELECT 1 FROM identity.user_roles sr JOIN identity.roles r ON r.id = sr.role_id
                                   WHERE sr.user_id = ${userColumn} AND r.rank >= 30)`;

/**
 * Admin Overview figures (docs/admin-panel-plan.md 01): one round trip, counted in the database.
 * "Today" and the daily series use the UTC day (sessions run in UTC, lib/db.js).
 */
export const adminDashboardDb = {
    figures: async () => (await sql(`
        SELECT
            (SELECT COUNT(*) FROM identity.users)::int AS users_total,
            (SELECT COUNT(*) FROM identity.users WHERE created_at > now() - interval '7 days')::int AS signups_7d,
            (SELECT COUNT(*) FROM identity.users WHERE created_at <= now() - interval '7 days' AND created_at > now() - interval '14 days')::int AS signups_prev_7d,
            (SELECT COUNT(*) FROM identity.users WHERE email_verified IS NOT TRUE AND status = 'active')::int AS unverified,
            (SELECT COUNT(DISTINCT s.user_id) FROM identity.sessions s WHERE s.last_seen_at > now() - interval '24 hours' AND ${NOT_STAFF("s.user_id")})::int AS active_24h,
            (SELECT COUNT(DISTINCT s.user_id) FROM identity.sessions s WHERE s.last_seen_at <= now() - interval '24 hours' AND s.last_seen_at > now() - interval '48 hours' AND ${NOT_STAFF("s.user_id")})::int AS active_prev_24h,
            -- Distinct active accounts, so someone holding both admin roles counts once.
            json_build_object(
                'admins', (SELECT COUNT(DISTINCT ur.user_id) FROM identity.user_roles ur JOIN identity.roles r ON r.id = ur.role_id
                           JOIN identity.users u ON u.id = ur.user_id WHERE r.code IN ('super_admin', 'admin') AND u.status = 'active'),
                'course_manager', (SELECT COUNT(DISTINCT ur.user_id) FROM identity.user_roles ur JOIN identity.roles r ON r.id = ur.role_id
                                   JOIN identity.users u ON u.id = ur.user_id WHERE r.code = 'course_manager' AND u.status = 'active')
            ) AS staff,
            -- Archiving also sets is_deleted (db/admin.db.js), so archived courses are counted apart from that filter.
            (SELECT json_object_agg(publish_status, n) FROM (
                SELECT publish_status, COUNT(*)::int AS n FROM catalog.course WHERE is_deleted IS NOT TRUE OR publish_status = 'archived' GROUP BY publish_status) x) AS courses,
            (SELECT COUNT(*) FROM catalog.course WHERE is_deleted IS NOT TRUE AND access_model = 'premium')::int AS courses_premium,
            (SELECT COUNT(*) FROM challenge.challenges WHERE is_deleted IS NOT TRUE AND is_published IS TRUE AND status = 'open')::int AS challenges_open,
            ((SELECT COUNT(*) FROM challenge.code_submissions WHERE submitted_at >= date_trunc('day', now()))
             + (SELECT COUNT(*) FROM challenge.question_submissions WHERE created_at >= date_trunc('day', now())))::int AS submissions_today,
            ((SELECT COUNT(*) FROM challenge.code_submissions WHERE submitted_at >= date_trunc('day', now()) - interval '1 day' AND submitted_at < date_trunc('day', now()))
             + (SELECT COUNT(*) FROM challenge.question_submissions WHERE created_at >= date_trunc('day', now()) - interval '1 day' AND created_at < date_trunc('day', now())))::int AS submissions_yesterday,
            (SELECT COUNT(*) FROM challenge.code_runs WHERE queued_at >= date_trunc('day', now()))::int AS runs_today,
            (SELECT COUNT(*) FROM challenge.code_runs WHERE queued_at >= date_trunc('day', now()) AND status IN ('failed', 'timeout'))::int AS runs_failed_today,
            (SELECT COUNT(*) FROM challenge.code_runs WHERE status IN ('queued', 'running') AND deadline_at < now())::int AS runs_expired,
            (SELECT COUNT(*) FROM ops.dead_letters WHERE resolved_at IS NULL)::int AS dead_letters_open,
            (SELECT COUNT(*) FROM catalog.course WHERE is_deleted IS NOT TRUE AND rating_count >= ${LOW_RATING.minRatings} AND rating_avg < ${LOW_RATING.below})::int AS courses_low_rated,
            (SELECT COUNT(*) FROM community.feedback WHERE handled_at IS NULL)::int AS feedback_open,
            (SELECT COUNT(*) FROM identity.users WHERE purge_after IS NOT NULL AND email_verified IS NOT TRUE AND status = 'active' AND purge_after <= now() + interval '1 day')::int AS purge_soon
    `)).rows[0],

    /**
     * Activity per UTC day over 2 × `days` days (the window and the one before it), today last, zero days
     * kept: submissions (code + quiz), sign-ups, practising learners (non-staff accounts with a submission
     * or code run that day) and code runs by outcome. Each table is scanned once from the window start.
     */
    activityByDay: async (days) => (await sql(`
        WITH bounds AS (SELECT date_trunc('day', now())::timestamp - ($1::int * 2 - 1) * interval '1 day' AS since),
        days AS (SELECT d::date AS day FROM bounds, generate_series(bounds.since, date_trunc('day', now())::timestamp, interval '1 day') AS d),
        subs AS (
            SELECT submitted_at::date AS day, user_id FROM challenge.code_submissions, bounds WHERE submitted_at >= bounds.since
            UNION ALL
            SELECT created_at::date, user_id FROM challenge.question_submissions, bounds WHERE created_at >= bounds.since
        ),
        runs AS (SELECT queued_at::date AS day, user_id, status FROM challenge.code_runs, bounds WHERE queued_at >= bounds.since),
        practising AS (
            SELECT day, COUNT(DISTINCT user_id)::int AS n FROM (SELECT day, user_id FROM subs UNION ALL SELECT day, user_id FROM runs) x
            WHERE ${NOT_STAFF("x.user_id")} GROUP BY day
        ),
        sub_counts AS (SELECT day, COUNT(*)::int AS n FROM subs GROUP BY day),
        signup_counts AS (SELECT u.created_at::date AS day, COUNT(*)::int AS n FROM identity.users u, bounds WHERE u.created_at >= bounds.since GROUP BY 1),
        run_counts AS (
            SELECT day,
                   COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
                   COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
                   COUNT(*) FILTER (WHERE status IN ('timeout', 'cancelled'))::int AS timeout
            FROM runs GROUP BY day
        )
        SELECT d.day::text AS day,
               COALESCE(s.n, 0) AS submissions,
               COALESCE(g.n, 0) AS signups,
               COALESCE(p.n, 0) AS learners,
               COALESCE(r.completed, 0) AS runs_completed,
               COALESCE(r.failed, 0) AS runs_failed,
               COALESCE(r.timeout, 0) AS runs_timeout
        FROM days d
        LEFT JOIN sub_counts s ON s.day = d.day
        LEFT JOIN signup_counts g ON g.day = d.day
        LEFT JOIN practising p ON p.day = d.day
        LEFT JOIN run_counts r ON r.day = d.day
        ORDER BY d.day
    `, [days])).rows,

    /**
     * The 5 courses with the most new registrations in the last 30 days, with how many of those finished;
     * `total` is every new registration in that window (all courses, counted before the LIMIT).
     */
    topCourses: async () => (await sql(`
        SELECT c.public_id AS id, c.title, COUNT(*)::int AS registrations,
               COUNT(*) FILTER (WHERE reg.status = 'completed')::int AS completed,
               (SUM(COUNT(*)) OVER ())::int AS total
        FROM learning.register reg JOIN catalog.course c ON c.id = reg.course_id
        WHERE reg.created_at > now() - interval '30 days' AND reg.is_deleted IS NOT TRUE AND c.is_deleted IS NOT TRUE
          AND ${NOT_STAFF("reg.user_id")}
        GROUP BY c.id
        ORDER BY registrations DESC, c.title
        LIMIT 5
    `)).rows,

    recentAudit: async () => (await sql(`
        SELECT a.id::text AS id, a.action, a.target_type, a.target_id, a.created_at, u.username AS actor
        FROM identity.audit_log a LEFT JOIN identity.users u ON u.id = a.actor_id
        ORDER BY a.id DESC LIMIT 5
    `)).rows,
};
