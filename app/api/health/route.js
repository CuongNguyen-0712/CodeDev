import { NextResponse } from "next/server";

import { redis } from "@/lib/cache";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Liveness / readiness probe for Docker and uptime checks.
 * 200 when PostgreSQL answers (Redis outages only degrade: the app falls back to memory).
 */
export async function GET() {
    const startedAt = Date.now();

    const [database, cache] = await Promise.all([
        sql("SELECT 1 AS ok")
            .then(() => ({ status: "healthy" }))
            .catch((error) => {
                console.error("[health] database check failed:", error?.message);
                return { status: "down" };
            }),
        redis.ping().then((alive) => ({ ...redis.health(), reachable: alive })),
    ]);

    const healthy = database.status === "healthy";

    return NextResponse.json(
        {
            status: healthy ? (cache.reachable ? "ok" : "degraded") : "down",
            database,
            cache: {
                backend: cache.backend,
                status: cache.status,
                reachable: cache.reachable,
                degradedSince: cache.degradedSince,
            },
            tookMs: Date.now() - startedAt,
        },
        { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } }
    );
}
