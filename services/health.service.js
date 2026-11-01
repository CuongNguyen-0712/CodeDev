import { redis } from "@/lib/cache";
import { sql } from "@/lib/db";
import { checkStorage, storageInfo } from "@/lib/s3";
import { appEnv } from "@/lib/appEnv.mjs";
import { inngestEnabled } from "@/lib/inngest";
import { codeRunDb } from "@/db/codeRun.db";
import { deadLetterDb } from "@/db/deadLetter.db";

/**
 * Health checks shared by GET /api/health and the admin Overview / System screens.
 * PostgreSQL down = down; Redis, storage or background jobs failing = degraded.
 */
export const checkDatabase = () => sql("SELECT 1 AS ok")
    .then(() => ({ status: "healthy" }))
    .catch((error) => {
        console.error("[health] database check failed:", error?.message);
        return { status: "down" };
    });

export async function healthReport() {
    const startedAt = Date.now();
    const [database, cache, storage, jobs] = await Promise.all([
        checkDatabase(),
        redis.ping().then((alive) => ({ ...redis.health(), reachable: alive })),
        checkStorage()
            .then(() => ({ status: "healthy" }))
            .catch((error) => {
                console.error("[health] storage check failed:", error?.name, error?.message);
                return { status: "down" };
            }),
        // Background work (docs/queue-execution-plan.md): dead letters of the last hour degrade.
        Promise.all([deadLetterDb.countOpen({ hours: 1 }), codeRunDb.load()])
            .then(([deadLetters, runs]) => ({
                status: deadLetters > 0 ? "degraded" : "healthy",
                inngest: inngestEnabled(),
                deadLettersLastHour: deadLetters,
                codeRunsActive: runs.active,
                oldestQueuedSec: runs.oldest_wait_sec,
            }))
            .catch((error) => {
                console.error("[health] jobs check failed:", error?.message);
                return { status: "unknown" };
            }),
    ]);

    const healthy = database.status === "healthy";
    return {
        status: healthy ? (cache.reachable && storage.status === "healthy" && jobs.status === "healthy" ? "ok" : "degraded") : "down",
        environment: appEnv(),
        database,
        storage: { provider: storageInfo().provider, status: storage.status },
        cache: {
            backend: cache.backend,
            status: cache.status,
            reachable: cache.reachable,
            degradedSince: cache.degradedSince,
        },
        jobs,
        tookMs: Date.now() - startedAt,
    };
}
