import { sql } from "@/lib/db";

/** Admin Overview figures (docs/admin-panel-plan.md 01): one round trip, counted in the database. */
export const adminDashboardDb = {
    figures: async () => (await sql(`
        SELECT
            (SELECT COUNT(*) FROM identity.users)::int AS users_total,
            (SELECT COUNT(*) FROM identity.users WHERE created_at > now() - interval '7 days')::int AS signups_7d,
            (SELECT COUNT(*) FROM identity.users WHERE created_at <= now() - interval '7 days' AND created_at > now() - interval '14 days')::int AS signups_prev_7d,
            (SELECT COUNT(*) FROM identity.users WHERE email_verified IS NOT TRUE AND status = 'active')::int AS unverified,
            (SELECT COUNT(DISTINCT user_id) FROM identity.sessions WHERE last_seen_at > now() - interval '24 hours')::int AS active_24h,
            (SELECT COUNT(DISTINCT user_id) FROM identity.sessions WHERE last_seen_at <= now() - interval '24 hours' AND last_seen_at > now() - interval '48 hours')::int AS active_prev_24h,
            (SELECT json_object_agg(code, n) FROM (
                SELECT r.code, COUNT(ur.user_id)::int AS n FROM identity.roles r
                LEFT JOIN identity.user_roles ur ON ur.role_id = r.id
                WHERE r.code IN ('super_admin', 'admin', 'course_manager', 'instructor') GROUP BY r.code) x) AS staff,
            (SELECT json_object_agg(publish_status, n) FROM (
                SELECT publish_status, COUNT(*)::int AS n FROM catalog.course WHERE is_deleted IS NOT TRUE GROUP BY publish_status) x) AS courses,
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
            (SELECT COUNT(*) FROM identity.users WHERE purge_after IS NOT NULL AND email_verified IS NOT TRUE AND status = 'active' AND purge_after <= now() + interval '1 day')::int AS purge_soon,
            (SELECT COUNT(*) FROM learning.register WHERE created_at > now() - interval '7 days')::int AS enrollments_7d,
            (SELECT COUNT(*) FROM commerce.orders WHERE created_at > now() - interval '7 days')::int AS orders_7d
    `)).rows[0],

    /** Submissions (code + quiz) per day for the last 14 days, today included, zero days kept. */
    submissionsByDay: async () => (await sql(`
        SELECT d::date::text AS day,
               ((SELECT COUNT(*) FROM challenge.code_submissions WHERE submitted_at >= d AND submitted_at < d + interval '1 day')
                + (SELECT COUNT(*) FROM challenge.question_submissions WHERE created_at >= d AND created_at < d + interval '1 day'))::int AS count
        FROM generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') AS d
        ORDER BY d
    `)).rows,

    recentAudit: async () => (await sql(`
        SELECT a.id::text AS id, a.action, a.target_type, a.target_id, a.created_at, u.username AS actor
        FROM identity.audit_log a LEFT JOIN identity.users u ON u.id = a.actor_id
        ORDER BY a.id DESC LIMIT 5
    `)).rows,
};
