import { adminDashboardDb } from "@/db/adminDashboard.db";
import { redis } from "@/lib/cache";
import { cacheKeys, TTL } from "@/lib/cacheKeys";
import { appEnv } from "@/lib/appEnv.mjs";
import { healthReport } from "@/services/health.service";
import { isTimeZone } from "@/lib/timeZone";

export const ACTIVITY_DAYS = [14, 30, 90];

/** The viewer's zone when Intl knows it, else UTC (it goes into SQL as a parameter and into cache keys). */
export const safeTimeZone = (tz) => (isTimeZone(tz) ? tz : "UTC");

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
     * tz: the viewer's time zone, where "today" starts.
     */
    overview: async ({ canReadAudit = false, fresh = false, tz = "UTC" } = {}) => {
        const zone = safeTimeZone(tz);
        if (fresh) await redis.del(cacheKeys.adminDashboard(zone), ...ACTIVITY_DAYS.map((days) => cacheKeys.adminActivity(days, zone))).catch(() => {});
        const [figures, health] = await Promise.all([
            redis.remember(cacheKeys.adminDashboard(zone), TTL.ADMIN_DASHBOARD, async () => {
                const [counts, topCourses, audit] = await Promise.all([
                    adminDashboardDb.figures(zone),
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
     * Activity per day in the viewer's zone for the Overview chart: `days` (14, 30 or 90) days and the
     * same number before them, split into { current, previous } of equal length. Cached like the figures.
     */
    activity: async ({ days = 14, tz = "UTC" } = {}) => {
        const window = ACTIVITY_DAYS.includes(days) ? days : ACTIVITY_DAYS[0];
        const zone = safeTimeZone(tz);
        const rows = await redis.remember(cacheKeys.adminActivity(window, zone), TTL.ADMIN_DASHBOARD, () => adminDashboardDb.activityByDay(window, zone));
        return { days: window, timeZone: zone, previous: rows.slice(0, rows.length - window), current: rows.slice(-window) };
    },
};
