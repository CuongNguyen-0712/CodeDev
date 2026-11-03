import { adminDashboardDb } from "@/db/adminDashboard.db";
import { redis } from "@/lib/cache";
import { cacheKeys, TTL } from "@/lib/cacheKeys";
import { appEnv } from "@/lib/appEnv.mjs";
import { healthReport } from "@/services/health.service";

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
        if (fresh) await redis.del(cacheKeys.adminDashboard()).catch(() => {});
        const [figures, health] = await Promise.all([
            redis.remember(cacheKeys.adminDashboard(), TTL.ADMIN_DASHBOARD, async () => {
                const [counts, series, audit] = await Promise.all([
                    adminDashboardDb.figures(),
                    adminDashboardDb.submissionsByDay(),
                    adminDashboardDb.recentAudit(),
                ]);
                return { counts, series, audit, measuredAt: new Date().toISOString() };
            }),
            healthReport(),
        ]);
        return { ...figures, audit: canReadAudit ? figures.audit : [], health, deployment: deployment() };
    },
};
