import { adminDashboardDb } from "@/db/adminDashboard.db";
import { redis } from "@/lib/cache";
import { cacheKeys, TTL } from "@/lib/cacheKeys";
import { appEnv } from "@/lib/appEnv.mjs";
import { healthReport } from "@/services/health.service";

export const ACTIVITY_DAYS = [14, 30, 90];

/** What is deployed (Vercel system environment variables; absent locally and in Docker). */
function deployment(env = process.env) {
    const sha = env.VERCEL_GIT_COMMIT_SHA || null;
    return {
        environment: appEnv(env),
        sha,
        shortSha: sha ? sha.slice(0, 7) : null,
        message: env.VERCEL_GIT_COMMIT_MESSAGE ? env.VERCEL_GIT_COMMIT_MESSAGE.split("\n")[0].slice(0, 160) : null,
        branch: env.VERCEL_GIT_COMMIT_REF || null,
        url: env.VERCEL_URL ? `https://${env.VERCEL_URL}` : null,
    };
}

/**
 * Admin Overview (docs/admin-panel-plan.md 01). The figures are cached 60 s in Redis; health is
 * measured on each load (it is what the screen is opened for when something is wrong).
 */
export const adminDashboardService = {
    /**
     * canReadAudit: the recent audit rows only for audit.read (the figures are shared by every admin).
     * fresh: the Refresh button recounts instead of serving the cached figures; measuredAt says how old they are.
     */
    overview: async ({ canReadAudit = false, fresh = false } = {}) => {
        if (fresh) await redis.del(cacheKeys.adminDashboard(), ...ACTIVITY_DAYS.map((days) => cacheKeys.adminActivity(days))).catch(() => {});
        const [figures, health] = await Promise.all([
            redis.remember(cacheKeys.adminDashboard(), TTL.ADMIN_DASHBOARD, async () => {
                const [counts, topCourses, audit] = await Promise.all([
                    adminDashboardDb.figures(),
                    adminDashboardDb.topCourses(),
                    adminDashboardDb.recentAudit(),
                ]);
                return { counts, topCourses, audit, measuredAt: new Date().toISOString() };
            }),
            healthReport(),
        ]);
        return { ...figures, audit: canReadAudit ? figures.audit : [], health, deployment: deployment() };
    },

    /**
     * Activity per UTC day for the Overview chart: `days` (14, 30 or 90) days and the same number before
     * them, split into { current, previous } of equal length. Cached like the figures.
     */
    activity: async ({ days = 14 } = {}) => {
        const window = ACTIVITY_DAYS.includes(days) ? days : ACTIVITY_DAYS[0];
        const rows = await redis.remember(cacheKeys.adminActivity(window), TTL.ADMIN_DASHBOARD, () => adminDashboardDb.activityByDay(window));
        return { days: window, previous: rows.slice(0, rows.length - window), current: rows.slice(-window) };
    },
};
