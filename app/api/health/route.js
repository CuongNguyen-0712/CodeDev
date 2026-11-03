import { NextResponse } from "next/server";

import { hasBearerSecret } from "@/lib/requestGuard";
import { checkDatabase, healthReport } from "@/services/health.service";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Liveness / readiness probe for Docker and uptime checks.
 * 200 when PostgreSQL answers (Redis outages only degrade: the app falls back to memory;
 * storage outages only degrade: coding challenges fail, the rest of the site works).
 *   ?probe=live      200 while the function runs, no query: frequent uptime checks must not wake
 *                    a sleeping Neon compute (docs/admin-panel-plan.md 6.3);
 *   (anyone)         `{ status }` from one cheap query;
 *   Bearer HEALTH_TOKEN (or the cron secret): the full report (cache, storage, queue, dead letters).
 */
export async function GET(req) {
    if (new URL(req.url).searchParams.get("probe") === "live") {
        return NextResponse.json({ status: "ok" }, { headers: NO_STORE });
    }

    if (!hasBearerSecret(req, [process.env.HEALTH_TOKEN, process.env.CRON_SECRET, process.env.AUTH_CRON_SECRET])) {
        const database = await checkDatabase();
        const up = database.status === "healthy";
        return NextResponse.json({ status: up ? "ok" : "down" }, { status: up ? 200 : 503, headers: NO_STORE });
    }

    const report = await healthReport();
    return NextResponse.json(report, { status: report.status === "down" ? 503 : 200, headers: NO_STORE });
}
