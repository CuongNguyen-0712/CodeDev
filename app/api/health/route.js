import { NextResponse } from "next/server";

import { redis } from "@/lib/cache";
import { sql } from "@/lib/db";
import { checkStorage, storageInfo } from "@/lib/s3";
import { appEnv } from "@/lib/appEnv.mjs";
import { inngestEnabled } from "@/lib/inngest";
import { codeRunDb } from "@/db/codeRun.db";
import { deadLetterDb } from "@/db/deadLetter.db";

export const dynamic = "force-dynamic";

/**
 * Liveness / readiness probe for Docker and uptime checks.
 * 200 when PostgreSQL answers (Redis outages only degrade: the app falls back to memory;
 * storage outages only degrade: coding challenges fail, the rest of the site works).
 */
export async function GET() {
    const startedAt = Date.now();

    const [database, cache, storage, jobs] = await Promise.all([
        sql("SELECT 1 AS ok")
            .then(() => ({ status: "healthy" }))
            .catch((error) => {
                console.error("[health] database check failed:", error?.message);
                return { status: "down" };
            }),
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

    return NextResponse.json(
        {
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
        },
        { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } }
    );
}
